import { sparseCholeskySolve } from '../lafea-linear-solve/sparse-cholesky.js';
import { sparseLdltSolve } from '../lafea-linear-solve/sparse-ldlt.js';
import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { deepFreeze } from '../shared-piping-model/immutable.js';
import { DOF_ORDER } from '../linear-fea-contract/conventions.js';
import { requireMechanicalModelCompilation } from '../linear-fea-model-compiler/index.js';
import { requirePhysicalLoadCase } from '../linear-fea-load-case/index.js';
import { buildDofMap, dofIndexOf } from './dof-map.js';
import { assembleGlobalSystem } from './assembly.js';
import { factorizeFreePartition } from './factorization.js';
import { createFactorizationCache, getOrFactorize } from './reuse-cache.js';
import { solveCholesky, solveLdlt, subRectangular } from './linear-algebra.js';
import { applyDiagonalScalingToVector } from './scaling.js';
import {
  conditioningReport,
  energyBalanceCheck,
  forceEquilibriumCheck,
  momentEquilibriumCheck,
  residualCheck,
  worstStatus,
} from './qualification.js';
import {
  EXECUTION_RECORD_KEYS,
  EXECUTION_SCHEMA,
  EXECUTION_STATUSES,
  SOLVER_PROFILE_ID,
  SPARSE_DIRECT_BACKEND_ID,
  SUPPORTED_BACKENDS,
  compareAscii,
  fail,
  requireArray,
  requireExactKeys,
  requireFinite,
  requireHash,
  requireIdentity,
  requireMember,
  requireSolverProfile,
  resolveSolverPolicies,
} from './solver-contract.js';

const CODE = 'SOLVER_EXECUTION_INVALID';

function requireLoadCaseMatchesModel(loadCase, compilation) {
  const reference = loadCase.modelReference;
  if (reference.modelIdentity !== compilation.model.modelIdentity
    || reference.modelRevision !== compilation.model.modelRevision
    || reference.mechanicalModelSemanticHash !== compilation.mechanicalModelSemanticHash
    || reference.stiffnessStateHash !== compilation.stiffnessStateHash) {
    fail(
      'loadCase.modelReference does not match the bound mechanical model compilation; a solved state is one factorizable stiffness state plus one physical right-hand side bound to that same state (section 7.2).',
      'SOLVER_LOAD_CASE_MODEL_MISMATCH',
    );
  }
}

function combineBasisComponents(basis, components) {
  if (basis.kind === 'GLOBAL') return components;
  const { e1, e2, e3 } = basis;
  const [a, b, c] = components;
  return [
    e1.x * a + e2.x * b + e3.x * c,
    e1.y * a + e2.y * b + e3.y * c,
    e1.z * a + e2.z * b + e3.z * c,
  ];
}

/** Scatter every NODAL_FORCE_MOMENT primitive into the global applied-load vector. */
function addNodalForcePrimitives(Ffull, dofMap, loadCase) {
  const diagnostics = [];
  for (const primitive of loadCase.primitives) {
    if (primitive.kind !== 'NODAL_FORCE_MOMENT') continue;
    const [fx, fy, fz] = combineBasisComponents(primitive.basis, [primitive.force.fx, primitive.force.fy, primitive.force.fz]);
    const [mx, my, mz] = combineBasisComponents(primitive.basis, [primitive.moment.mx, primitive.moment.my, primitive.moment.mz]);
    const values = [fx, fy, fz, mx, my, mz];
    DOF_ORDER.forEach((dof, index) => {
      Ffull[dofIndexOf(dofMap, primitive.nodeId, dof)] += values[index];
    });
    diagnostics.push({ primitiveId: primitive.primitiveId, nodeId: primitive.nodeId });
  }
  return diagnostics;
}

/** Section 6 "Nozzle movement": resolve one displacement value per PRESCRIBED_SLOT constraint for this case. */
function resolvePrescribedValues(constrained, loadCase) {
  const bySlot = new Map(
    loadCase.primitives
      .filter((primitive) => primitive.kind === 'PRESCRIBED_MOVEMENT')
      .map((primitive) => [primitive.prescribedSlotId, primitive.value]),
  );
  const diagnostics = [];
  const values = new Map();
  for (const entry of constrained) {
    if (entry.behavior !== 'PRESCRIBED_SLOT') {
      values.set(entry.globalIndex, 0);
      continue;
    }
    if (bySlot.has(entry.constraintId)) {
      values.set(entry.globalIndex, bySlot.get(entry.constraintId));
    } else {
      values.set(entry.globalIndex, 0);
      diagnostics.push({ constraintId: entry.constraintId, nodeId: entry.nodeId, dof: entry.dof });
    }
  }
  return { values, diagnostics };
}

function solveScaledSystem(factorization, rhs) {
  const scaledRhs = applyDiagonalScalingToVector(rhs, factorization.scaling.factors);
  let scaledSolution;
  if (factorization.backend === SPARSE_DIRECT_BACKEND_ID) {
    scaledSolution = factorization.kind === 'CHOLESKY'
      ? sparseCholeskySolve(factorization.sparseFactor, scaledRhs)
      : sparseLdltSolve(factorization.sparseFactor, scaledRhs);
  } else {
    scaledSolution = factorization.kind === 'CHOLESKY'
      ? solveCholesky(factorization.L, factorization.m, scaledRhs)
      : solveLdlt(factorization.L, factorization.D, factorization.m, scaledRhs);
  }
  return applyDiagonalScalingToVector(scaledSolution, factorization.scaling.factors);
}

function canonicalEntries(vector, dofMap, nodeIds) {
  const entries = [];
  for (const nodeId of nodeIds) {
    for (const dof of DOF_ORDER) {
      entries.push({ nodeId, dof, value: vector[dofIndexOf(dofMap, nodeId, dof)] });
    }
  }
  return entries;
}

/**
 * LFEA-B3.3 exit boundary: assemble one bound mechanical model and one
 * physical load case into a solved, qualified `fea-linear-execution/v1`
 * record (sections 8, 8.1, 9 displacement/reaction).
 *
 * Factorization reuse (section 7.2) is keyed by `stiffnessStateHash` and an
 * independently-computed constrained-partition hash; backend variants are
 * segregated inside that key. Passing the same `cache` across two calls whose
 * model, partition and declared backend are unchanged reuses the same
 * factorization object, while a changed stiffness state, partition or backend
 * always misses the corresponding cache variant.
 *
 * @param {object} args
 * @param {Readonly<object>} args.compilation Sealed `fea-linear-mechanical-model-compilation/v1`.
 * @param {Array<object>} args.elementContributions Normalized contributions, one per model element.
 * @param {Readonly<object>} args.loadCase Sealed `fea-linear-physical-load-case/v1`, bound to the same model.
 * @param {Readonly<object>} args.solverProfile Sealed `fea-linear-solver-profile/v1`.
 * @param {Map<string,object>} [args.cache] Factorization cache; a fresh one-shot cache is created if omitted.
 * @returns {Readonly<object>} `fea-linear-execution/v1` plus a non-hashed `factorizationHandle` for reuse proofs.
 */
export function compileSolverExecution({ compilation, elementContributions, loadCase, solverProfile, cache }) {
  const acceptedCompilation = requireMechanicalModelCompilation(compilation);
  const acceptedLoadCase = requirePhysicalLoadCase(loadCase);
  const acceptedProfile = requireSolverProfile(solverProfile);
  const policies = resolveSolverPolicies(acceptedProfile);
  requireLoadCaseMatchesModel(acceptedLoadCase, acceptedCompilation);

  const model = acceptedCompilation.model;
  const dofMap = buildDofMap(model);
  const assembly = assembleGlobalSystem({ model, dofMap, elementContributions });

  const Ffull = [...assembly.elementLoad];
  const nodalDiagnostics = addNodalForcePrimitives(Ffull, dofMap, acceptedLoadCase);
  const { values: prescribedValues, diagnostics: prescribedDiagnostics } = resolvePrescribedValues(
    assembly.constrained,
    acceptedLoadCase,
  );

  const Ufull = new Array(dofMap.dofCount).fill(0);
  for (const entry of assembly.constrained) Ufull[entry.globalIndex] = prescribedValues.get(entry.globalIndex);

  const constrainedIndices = assembly.constrained.map((entry) => entry.globalIndex);
  const Kfc = subRectangular(assembly.K, assembly.n, assembly.freeIndices, constrainedIndices);
  const Uc = constrainedIndices.map((index) => Ufull[index]);
  const Ffree = assembly.freeIndices.map((index, row) => {
    let coupling = 0;
    for (let column = 0; column < constrainedIndices.length; column += 1) coupling += Kfc[row * constrainedIndices.length + column] * Uc[column];
    return Ffull[index] - coupling;
  });

  const activeCache = cache ?? createFactorizationCache();
  const partitionKey = `${acceptedCompilation.stiffnessStateHash}:${assembly.partitionHash}`;
  const { factorization, reused } = getOrFactorize(
    activeCache,
    partitionKey,
    acceptedProfile.backend,
    () => factorizeFreePartition({
      model,
      dofMap,
      assembly,
      policies,
      backend: acceptedProfile.backend,
    }),
  );

  const Uf = solveScaledSystem(factorization, Ffree);
  assembly.freeIndices.forEach((index, row) => { Ufull[index] = Uf[row]; });

  const residual = residualCheck({ Kff: subRectangular(assembly.K, assembly.n, assembly.freeIndices, assembly.freeIndices), m: assembly.freeIndices.length, Uf, Ffree, policies });
  const forceEquilibrium = forceEquilibriumCheck({ model, dofMap, K: assembly.K, n: assembly.n, Ufull, Ffull, policies });
  const momentEquilibrium = momentEquilibriumCheck({ model, dofMap, K: assembly.K, n: assembly.n, Ufull, Ffull, policies });
  const energyBalance = energyBalanceCheck({ K: assembly.K, n: assembly.n, Ufull, Ffull, policies });
  const conditioning = conditioningReport(factorization.conditionEstimate, policies);

  const overall = worstStatus([residual, forceEquilibrium, momentEquilibrium, energyBalance, conditioning]);
  const status = overall === 'PASS' ? 'QUALIFIED' : overall === 'WARN' ? 'CONDITIONAL' : 'BLOCKED';

  const fullResidualVector = assembly.freeIndices.length === Ufull.length
    ? []
    : (() => {
      const KU = new Array(dofMap.dofCount).fill(0);
      for (let row = 0; row < dofMap.dofCount; row += 1) {
        let sum = 0;
        for (let column = 0; column < dofMap.dofCount; column += 1) sum += assembly.K[row * dofMap.dofCount + column] * Ufull[column];
        KU[row] = sum;
      }
      return KU.map((value, index) => value - Ffull[index]);
    })();

  const reactionEntries = assembly.constrained
    .map((entry) => ({ nodeId: entry.nodeId, dof: entry.dof, value: fullResidualVector[entry.globalIndex] }))
    .sort((left, right) => compareAscii(`${left.nodeId}:${left.dof}`, `${right.nodeId}:${right.dof}`));
  const displacementEntries = canonicalEntries(Ufull, dofMap, dofMap.nodeOrder);

  const scaleFactorEntries = assembly.freeIndices
    .map((globalIndex, row) => ({ nodeId: dofMap.entries[globalIndex].nodeId, dof: dofMap.entries[globalIndex].dof, factor: factorization.scaling.factors[row] }))
    .sort((left, right) => compareAscii(`${left.nodeId}:${left.dof}`, `${right.nodeId}:${right.dof}`));

  const draft = {
    schema: EXECUTION_SCHEMA,
    profileId: SOLVER_PROFILE_ID,
    solverProfileSemanticHash: acceptedProfile.semanticHash,
    modelIdentity: model.modelIdentity,
    modelRevision: model.modelRevision,
    mechanicalModelSemanticHash: acceptedCompilation.mechanicalModelSemanticHash,
    stiffnessStateHash: acceptedCompilation.stiffnessStateHash,
    physicalLoadCaseHash: acceptedLoadCase.physicalLoadCaseHash,
    dofMap,
    assembly: {
      tripletCount: assembly.tripletCount,
      lowerTriangleNonzeroCount: assembly.lowerTriangleNonzeroCount,
      elementCount: assembly.elementCount,
      springCount: assembly.springCount,
      constrainedDofCount: assembly.constrained.length,
      freeDofCount: assembly.freeIndices.length,
      symmetryResidual: assembly.symmetryResidual,
      partitionHash: assembly.partitionHash,
    },
    factorization: {
      backend: factorization.backend,
      scaling: factorization.scaling.scalingId,
      cacheKey: partitionKey,
      reused,
      kind: factorization.kind,
      pivotStatistics: factorization.pivotStatistics,
      conditionEstimate: factorization.conditionEstimate,
      conditionEstimateMethod: factorization.conditionEstimateMethod,
      conditionEstimateEvidence: factorization.conditionEstimateEvidence,
      scaleFactors: scaleFactorEntries,
    },
    displacement: displacementEntries,
    reactions: reactionEntries,
    diagnostics: { residual, forceEquilibrium, momentEquilibrium, energyBalance, conditioning },
    status,
    executionHash: '',
    semanticHash: '',
    evidenceHash: '',
  };
  draft.semanticHash = computeExecutionSemanticHash(draft);
  draft.executionHash = draft.semanticHash;
  draft.evidenceHash = computeExecutionEvidenceHash(draft);
  const sealed = requireSolverExecution(draft);
  return deepFreeze({
    ...sealed,
    factorizationHandle: factorization,
    prescribedValueDiagnostics: prescribedDiagnostics,
    nodalForceDiagnostics: nodalDiagnostics,
  });
}

export function executionSemanticProjection(record) {
  const projection = {};
  for (const key of EXECUTION_RECORD_KEYS) {
    if (key === 'semanticHash' || key === 'evidenceHash' || key === 'executionHash') continue;
    if (key === 'factorization') {
      const { reused: runtimeReuseEvidence, ...engineeringFactorization } = record.factorization;
      void runtimeReuseEvidence;
      projection.factorization = engineeringFactorization;
      continue;
    }
    projection[key] = record[key];
  }
  return projection;
}

export function computeExecutionSemanticHash(record) {
  return semanticHash(executionSemanticProjection(record));
}

export function computeExecutionEvidenceHash(record) {
  return semanticHash({
    semanticHash: record.semanticHash,
    diagnostics: record.diagnostics,
    status: record.status,
    factorizationReused: record.factorization.reused,
  });
}

function requireVector6(entry, field) {
  requireExactKeys(entry, ['nodeId', 'dof', 'value'], field, CODE);
  requireIdentity(entry.nodeId, `${field}.nodeId`, CODE);
  requireMember(entry.dof, DOF_ORDER, `${field}.dof`, CODE);
  requireFinite(entry.value, `${field}.value`, CODE);
}

export function requireSolverExecution(record) {
  requireExactKeys(record, EXECUTION_RECORD_KEYS, 'execution', CODE);
  if (record.schema !== EXECUTION_SCHEMA) fail(`execution.schema must be ${EXECUTION_SCHEMA}.`, CODE);
  if (record.profileId !== SOLVER_PROFILE_ID) fail(`execution.profileId must be ${SOLVER_PROFILE_ID}.`, CODE);
  for (const field of [
    'solverProfileSemanticHash', 'mechanicalModelSemanticHash', 'stiffnessStateHash',
    'physicalLoadCaseHash', 'executionHash', 'semanticHash', 'evidenceHash',
  ]) {
    requireHash(record[field], `execution.${field}`, CODE);
  }
  requireIdentity(record.modelIdentity, 'execution.modelIdentity', CODE);
  requireArray(record.displacement, 'execution.displacement', CODE);
  record.displacement.forEach((entry, index) => requireVector6(entry, `execution.displacement[${index}]`));
  requireArray(record.reactions, 'execution.reactions', CODE);
  record.reactions.forEach((entry, index) => requireVector6(entry, `execution.reactions[${index}]`));
  requireMember(record.status, EXECUTION_STATUSES, 'execution.status', CODE);
  requireMember(record.factorization.backend, SUPPORTED_BACKENDS, 'execution.factorization.backend', CODE);
  if (record.executionHash !== record.semanticHash) fail('execution.executionHash must equal execution.semanticHash.', CODE);
  if (record.semanticHash !== computeExecutionSemanticHash(record)) fail('execution.semanticHash is stale.', 'SOLVER_HASH_MISMATCH');
  if (record.evidenceHash !== computeExecutionEvidenceHash(record)) fail('execution.evidenceHash is stale.', 'SOLVER_HASH_MISMATCH');
  return deepFreeze({ ...record });
}
