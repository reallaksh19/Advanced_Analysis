import { DENSE_DIRECT_BACKEND_ID, fail } from './solver-contract.js';
import { subMatrix } from './linear-algebra.js';
import { choleskyDecompose, ldltDecompose } from './linear-algebra.js';
import { applyDiagonalScalingToMatrix, computeDiagonalEnergyScaling } from './scaling.js';
import { connectedComponents, detectFloatingComponents } from './mechanism-diagnostics.js';

/**
 * Section 8 "Factorization": attempt sparse[-scale] Cholesky for a qualified
 * positive-definite system; degrade to LDLT with pivot diagnostics for a
 * mechanism or an indefinite state. Section 8 "Failure": mechanism, rank
 * deficiency, near-zero pivot and conflicting constraints reported by
 * node/DOF and connected component.
 *
 * This is the one place stiffness is factorized. It is deliberately free of
 * any load-case data — factorization reuse (section 7.2) depends on that:
 * the same factorization object is valid for every load case that shares the
 * `stiffnessStateHash` and constrained partition this factorization was built
 * from, and this function never reads a load case to decide anything.
 *
 * @param {object} args
 * @param {object} args.model Sealed `fea-linear-model/v1` (for mechanism diagnostics only).
 * @param {Readonly<object>} args.dofMap Section 8 DOF map.
 * @param {Readonly<object>} args.assembly Result of `assembleGlobalSystem`.
 * @param {object} args.policies Resolved solver policies (see `resolveSolverPolicies`).
 * @returns {Readonly<object>} Factorization evidence plus `L`/`D` needed to solve.
 */
export function factorizeFreePartition({ model, dofMap, assembly, policies }) {
  const floating = detectFloatingComponents(model);
  if (floating.length > 0) {
    fail(
      `Connected component ${floating[0].componentId} (nodes ${floating[0].nodeIds.join(', ')}) carries no restraint of any kind and is an unconditional rigid-body mechanism.`,
      'SOLVER_MECHANISM_FLOATING_COMPONENT',
    );
  }

  const m = assembly.freeIndices.length;
  if (m === 0) {
    fail('The free partition is empty; every DOF is constrained and there is nothing to factorize.', 'SOLVER_FREE_PARTITION_EMPTY');
  }
  const Kff = subMatrix(assembly.K, assembly.n, assembly.freeIndices);
  const scaling = computeDiagonalEnergyScaling(Kff, m);
  const scaled = applyDiagonalScalingToMatrix(Kff, m, scaling.factors);

  const cholesky = choleskyDecompose(scaled, m);
  if (cholesky.success) {
    const pivots = Array.from({ length: m }, (_, index) => cholesky.L[index * m + index] ** 2);
    return {
      backend: DENSE_DIRECT_BACKEND_ID,
      kind: 'CHOLESKY',
      m,
      L: cholesky.L,
      D: null,
      scaling,
      conditionEstimate: conditionEstimateFrom(pivots),
    };
  }

  const ldlt = ldltDecompose(scaled, m, policies.nearZeroPivotTolerance.value);
  if (ldlt.firstBadPivotIndex !== null) {
    const globalIndex = assembly.freeIndices[ldlt.firstBadPivotIndex];
    const entry = dofMap.entries[globalIndex];
    const component = connectedComponents(model).find((candidate) => candidate.nodeIds.includes(entry.nodeId));
    fail(
      `Free DOF ${entry.nodeId}:${entry.dof} produced a near-zero or negative pivot during LDLT factorization (connected component ${component?.componentId ?? entry.nodeId}); the system is a mechanism or is rank-deficient there.`,
      'SOLVER_NEAR_ZERO_PIVOT',
    );
  }
  if (ldlt.negativePivotCount > 0) {
    fail(
      `LDLT factorization produced ${ldlt.negativePivotCount} negative pivot(s); the free-free system is indefinite rather than positive-definite.`,
      'SOLVER_SYSTEM_INDEFINITE',
    );
  }
  return {
    backend: DENSE_DIRECT_BACKEND_ID,
    kind: 'LDLT',
    m,
    L: ldlt.L,
    D: ldlt.D,
    scaling,
    conditionEstimate: conditionEstimateFrom(ldlt.D),
  };
}

function conditionEstimateFrom(pivots) {
  const magnitudes = pivots.map((value) => Math.abs(value)).filter((value) => value > 0);
  if (magnitudes.length === 0) return Infinity;
  return Math.max(...magnitudes) / Math.min(...magnitudes);
}
