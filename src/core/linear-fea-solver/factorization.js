import { partitionSparseSystem } from '../lafea-linear-solve/bc-elimination.js';
import { estimateConditionNumber } from '../lafea-linear-solve/condition-estimate.js';
import { applyDiagonalScalingToMatrix as applySparseDiagonalScalingToMatrix } from '../lafea-linear-solve/diagonal-scaling.js';
import { sparseCholeskyFactorize, sparseCholeskySolve } from '../lafea-linear-solve/sparse-cholesky.js';
import { sparseLdltFactorize, sparseLdltSolve } from '../lafea-linear-solve/sparse-ldlt.js';
import {
  DENSE_DIRECT_BACKEND_ID,
  DIAGONAL_ENERGY_SCALING_ID,
  SPARSE_DIRECT_BACKEND_ID,
  fail,
} from './solver-contract.js';
import { choleskyDecompose, ldltDecompose, subMatrix } from './linear-algebra.js';
import {
  applyDiagonalScalingToMatrix as applyDenseDiagonalScalingToMatrix,
  computeDiagonalEnergyScaling,
} from './scaling.js';
import { connectedComponents, detectFloatingComponents } from './mechanism-diagnostics.js';

/**
 * Section 8 "Factorization": use the backend declared by the sealed solver
 * profile. Both backends attempt Cholesky first and fall back to LDLT only to
 * classify a non-SPD system; neither backend silently regularizes or switches
 * to the other backend.
 *
 * This is the one place stiffness is factorized. It is deliberately free of
 * load-case data so a factorization remains reusable for every load case that
 * shares the stiffness state, constrained partition and declared backend.
 *
 * @param {object} args
 * @param {object} args.model Sealed `fea-linear-model/v1` (for mechanism diagnostics only).
 * @param {Readonly<object>} args.dofMap Section 8 DOF map.
 * @param {Readonly<object>} args.assembly Result of `assembleGlobalSystem`.
 * @param {object} args.policies Resolved solver policies (see `resolveSolverPolicies`).
 * @param {string} args.backend Declared solver backend from the sealed profile; sparse when omitted by a direct caller.
 * @returns {Readonly<object>} Factorization evidence plus backend-specific factors needed to solve.
 */
export function factorizeFreePartition({ model, dofMap, assembly, policies, backend = SPARSE_DIRECT_BACKEND_ID }) {
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
  if (backend === SPARSE_DIRECT_BACKEND_ID) {
    return factorizeSparseFreePartition({ model, dofMap, assembly, policies, m });
  }
  if (backend === DENSE_DIRECT_BACKEND_ID) {
    return factorizeDenseFreePartition({ model, dofMap, assembly, policies, m });
  }
  fail(`Solver backend ${backend} is not supported by factorizeFreePartition.`, 'SOLVER_BACKEND_UNSUPPORTED');
}

function factorizeDenseFreePartition({ model, dofMap, assembly, policies, m }) {
  const Kff = subMatrix(assembly.K, assembly.n, assembly.freeIndices);
  const scaling = computeDiagonalEnergyScaling(Kff, m);
  const scaled = applyDenseDiagonalScalingToMatrix(Kff, m, scaling.factors);

  const cholesky = choleskyDecompose(scaled, m);
  if (cholesky.success) {
    const pivots = Array.from({ length: m }, (_, index) => cholesky.L[index * m + index] ** 2);
    const pivotStatistics = summarizePivots(pivots);
    return {
      backend: DENSE_DIRECT_BACKEND_ID,
      kind: 'CHOLESKY',
      m,
      L: cholesky.L,
      D: null,
      sparseFactor: null,
      scaling,
      pivotStatistics,
      conditionEstimate: conditionEstimateFrom(pivots),
      conditionEstimateMethod: 'PIVOT_MAGNITUDE_RATIO_V1',
      conditionEstimateEvidence: {
        minAbsPivot: pivotStatistics.minAbsPivot,
        maxAbsPivot: pivotStatistics.maxAbsPivot,
      },
    };
  }

  const ldlt = ldltDecompose(scaled, m, policies.nearZeroPivotTolerance.value);
  if (ldlt.firstBadPivotIndex !== null) {
    failNearZeroPivot(model, dofMap, assembly, ldlt.firstBadPivotIndex);
  }
  if (ldlt.negativePivotCount > 0) {
    failIndefiniteSystem(model, dofMap, assembly, ldlt.D, null);
  }
  const pivotStatistics = summarizePivots(ldlt.D);
  return {
    backend: DENSE_DIRECT_BACKEND_ID,
    kind: 'LDLT',
    m,
    L: ldlt.L,
    D: ldlt.D,
    sparseFactor: null,
    scaling,
    pivotStatistics,
    conditionEstimate: conditionEstimateFrom(ldlt.D),
    conditionEstimateMethod: 'PIVOT_MAGNITUDE_RATIO_V1',
    conditionEstimateEvidence: {
      minAbsPivot: pivotStatistics.minAbsPivot,
      maxAbsPivot: pivotStatistics.maxAbsPivot,
    },
  };
}

function factorizeSparseFreePartition({ model, dofMap, assembly, policies, m }) {
  const matrix = assembly.sparseK === undefined
    ? sparseMatrixFromTriplets(assembly.n, assembly.triplets)
    : assembly.sparseK;
  const prescribed = new Map(assembly.constrained.map((entry) => [entry.globalIndex, 0]));
  const partitioned = partitionSparseSystem(matrix, new Array(assembly.n).fill(0), prescribed);
  assertSameFreePartition(assembly.freeIndices, partitioned.freeIndices);

  const scaling = computeSparseDiagonalEnergyScaling(partitioned.freeMatrix);
  const scaled = applySparseDiagonalScalingToMatrix(partitioned.freeMatrix, scaling.factors);

  try {
    const factor = sparseCholeskyFactorize(scaled, policies.nearZeroPivotTolerance.value);
    const pivotStatistics = summarizePivots(factor.pivots);
    const conditionEstimateEvidence = estimateConditionNumber(
      scaled,
      (rhs) => sparseCholeskySolve(factor, rhs),
    );
    return {
      backend: SPARSE_DIRECT_BACKEND_ID,
      kind: 'CHOLESKY',
      m,
      L: null,
      D: null,
      sparseFactor: factor,
      sparseFreeMatrix: partitioned.freeMatrix,
      scaling,
      pivotStatistics,
      conditionEstimate: conditionEstimateEvidence.conditionEstimate,
      conditionEstimateMethod: 'POWER_INVERSE_POWER_ITERATION_V1',
      conditionEstimateEvidence,
    };
  } catch (error) {
    if (error?.code !== 'NON_POSITIVE_PIVOT') {
      fail(
        `Sparse Cholesky factorization failed with ${error?.code ?? error?.name ?? 'UNKNOWN_ERROR'}: ${error?.message ?? String(error)}`,
        'SOLVER_SPARSE_FACTORIZATION_FAILED',
      );
    }
  }

  let factor;
  try {
    factor = sparseLdltFactorize(scaled, policies.nearZeroPivotTolerance.value);
  } catch (error) {
    if (error?.code === 'NO_STABLE_DIAGONAL_PIVOT') {
      const step = Number.isInteger(error.evidence?.step) ? error.evidence.step : 0;
      const freeIndex = error.evidence?.permutation?.[step] ?? step;
      failNearZeroPivot(model, dofMap, assembly, freeIndex);
    }
    fail(
      `Sparse LDLT factorization failed with ${error?.code ?? error?.name ?? 'UNKNOWN_ERROR'}: ${error?.message ?? String(error)}`,
      'SOLVER_SPARSE_FACTORIZATION_FAILED',
    );
  }

  const pivotStatistics = summarizePivots(factor.D);
  if (pivotStatistics.negativePivotCount > 0) {
    failIndefiniteSystem(model, dofMap, assembly, factor.D, factor.permutation);
  }
  const conditionEstimateEvidence = estimateConditionNumber(
    scaled,
    (rhs) => sparseLdltSolve(factor, rhs),
  );
  return {
    backend: SPARSE_DIRECT_BACKEND_ID,
    kind: 'LDLT',
    m,
    L: null,
    D: null,
    sparseFactor: factor,
    sparseFreeMatrix: partitioned.freeMatrix,
    scaling,
    pivotStatistics,
    conditionEstimate: conditionEstimateEvidence.conditionEstimate,
    conditionEstimateMethod: 'POWER_INVERSE_POWER_ITERATION_V1',
    conditionEstimateEvidence,
  };
}

function sparseMatrixFromTriplets(size, triplets) {
  const rows = Array.from({ length: size }, () => new Map());
  for (const triplet of triplets) {
    if (triplet.row < triplet.col || triplet.value === 0) continue;
    rows[triplet.row].set(triplet.col, triplet.value);
  }
  return Object.freeze({
    size,
    rows: Object.freeze(rows.map((row) => Object.freeze(new Map(
      [...row].sort((left, right) => left[0] - right[0]),
    )))),
  });
}

function computeSparseDiagonalEnergyScaling(matrix) {
  const factors = new Array(matrix.size).fill(1);
  for (let index = 0; index < matrix.size; index += 1) {
    const retainedDiagonal = matrix.rows[index].get(index);
    const diagonal = retainedDiagonal === undefined ? 0 : retainedDiagonal;
    factors[index] = diagonal > 0 ? 1 / Math.sqrt(diagonal) : 1;
  }
  return { scalingId: DIAGONAL_ENERGY_SCALING_ID, factors };
}

function assertSameFreePartition(expected, actual) {
  if (expected.length !== actual.length || expected.some((value, index) => value !== actual[index])) {
    fail(
      'Sparse boundary-condition elimination produced a free-DOF partition different from the canonical solver partition.',
      'SOLVER_SPARSE_PARTITION_MISMATCH',
    );
  }
}

function failNearZeroPivot(model, dofMap, assembly, freeIndex) {
  const globalIndex = assembly.freeIndices[freeIndex];
  const entry = dofMap.entries[globalIndex];
  const component = connectedComponents(model).find((candidate) => candidate.nodeIds.includes(entry.nodeId));
  fail(
    `Free DOF ${entry.nodeId}:${entry.dof} produced a near-zero or negative pivot during LDLT factorization (connected component ${component?.componentId ?? entry.nodeId}); the system is a mechanism or is rank-deficient there.`,
    'SOLVER_NEAR_ZERO_PIVOT',
  );
}

function failIndefiniteSystem(model, dofMap, assembly, pivots, permutation) {
  const firstNegative = pivots.findIndex((value) => value < 0);
  const freeIndex = firstNegative >= 0 ? (permutation?.[firstNegative] ?? firstNegative) : 0;
  const globalIndex = assembly.freeIndices[freeIndex];
  const entry = dofMap.entries[globalIndex];
  const negativePivotCount = pivots.filter((value) => value < 0).length;
  const component = connectedComponents(model).find((candidate) => candidate.nodeIds.includes(entry.nodeId));
  fail(
    `LDLT factorization produced ${negativePivotCount} negative pivot(s); the first is associated with free DOF ${entry.nodeId}:${entry.dof} (connected component ${component?.componentId ?? entry.nodeId}), so the free-free system is indefinite rather than positive-definite.`,
    'SOLVER_SYSTEM_INDEFINITE',
  );
}

function summarizePivots(pivots) {
  const magnitudes = pivots.map((value) => Math.abs(value));
  return {
    minAbsPivot: Math.min(...magnitudes),
    maxAbsPivot: Math.max(...magnitudes),
    negativePivotCount: pivots.filter((value) => value < 0).length,
  };
}

function conditionEstimateFrom(pivots) {
  const magnitudes = pivots.map((value) => Math.abs(value)).filter((value) => value > 0);
  if (magnitudes.length === 0) return Infinity;
  return Math.max(...magnitudes) / Math.min(...magnitudes);
}
