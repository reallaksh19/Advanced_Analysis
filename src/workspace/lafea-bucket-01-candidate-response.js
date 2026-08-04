import { canonicalLafeaSha256 } from './lafea-canonical-sha256.js';
import {
  LAFEA_BUCKET_01_UNEQUAL_H_CONVERGENCE_INPUT_SCHEMA,
  evaluateLafeaBucket01UnequalHConvergence,
} from './lafea-bucket-01-unequal-h-convergence.js';

export const LAFEA_BUCKET_01_CANDIDATE_RESPONSE_INPUT_SCHEMA =
  'lafea-bucket-01-candidate-response-input/v1';
export const LAFEA_BUCKET_01_CANDIDATE_RESPONSE_EVIDENCE_SCHEMA =
  'lafea-bucket-01-candidate-response-evidence/v1';
export const LAFEA_BUCKET_01_CANDIDATE_RESPONSE_REVISION =
  'B01-CANDIDATE-RESPONSE.1';
export const LAFEA_BUCKET_01_CANDIDATE_GLOBAL_H_DEFINITION =
  'SQRT_ANALYTICAL_AREA_OVER_T6_ELEMENT_COUNT';

const INPUT_KEYS = Object.freeze([
  'schema', 'exactHeadSha', 'designHash', 'specHash',
  'locationDefinitionHash', 'globalCharacteristicHDefinition',
  'expectedAppliedForce', 'expectedAppliedMomentZ', 'levels', 'tolerances',
]);
const VECTOR_KEYS = Object.freeze(['x', 'y']);
const LEVEL_KEYS = Object.freeze([
  'ordinal', 'elementCount', 'globalCharacteristicH',
  'globalTopologySignature', 'meshHash', 'recoveryHash', 'resultHash',
  'solverMethod', 'freeDofCount', 'appliedForce', 'reactionForce',
  'appliedMomentZ', 'reactionMomentZ', 'totalStrainEnergy',
  'halfExternalWork', 'energyQualificationAccepted',
]);
const TOLERANCE_KEYS = Object.freeze([
  'loadResultantRelative', 'forceEquilibriumRelative',
  'loadMomentRelative', 'momentEquilibriumRelative',
  'energyReconstructionRelative', 'strainEnergyGci',
  'minimumObservedOrder', 'asymptoticRatioBounds',
]);
const ASYMPTOTIC_KEYS = Object.freeze(['minimum', 'maximum']);
const EXPECTED_ELEMENT_COUNTS = Object.freeze([480, 1190, 4080, 14256]);
const ALLOWED_SOLVER_METHODS = Object.freeze(new Set([
  'DETERMINISTIC_CHOLESKY',
  'DETERMINISTIC_JACOBI_PCG',
]));

export function evaluateLafeaBucket01CandidateResponse(inputValue) {
  exactKeys(inputValue, INPUT_KEYS, 'candidate response input');
  if (inputValue.schema !== LAFEA_BUCKET_01_CANDIDATE_RESPONSE_INPUT_SCHEMA) {
    throw responseError('LAFEA_B01_CANDIDATE_RESPONSE_INPUT_SCHEMA_INVALID');
  }
  const exactHeadSha = gitSha(inputValue.exactHeadSha);
  const designHash = sha256(inputValue.designHash, 'designHash');
  const specHash = sha256(inputValue.specHash, 'specHash');
  const locationDefinitionHash = sha256(
    inputValue.locationDefinitionHash,
    'locationDefinitionHash',
  );
  if (inputValue.globalCharacteristicHDefinition
    !== LAFEA_BUCKET_01_CANDIDATE_GLOBAL_H_DEFINITION) {
    throw responseError('LAFEA_B01_CANDIDATE_GLOBAL_H_DEFINITION_INVALID');
  }
  const expectedAppliedForce = vector(
    inputValue.expectedAppliedForce,
    'expectedAppliedForce',
  );
  const expectedAppliedMomentZ = finite(
    inputValue.expectedAppliedMomentZ,
    'expectedAppliedMomentZ',
  );
  const tolerances = normalizeTolerances(inputValue.tolerances);
  const levels = normalizeLevels(inputValue.levels);
  const forceScale = Math.max(1, Math.hypot(
    expectedAppliedForce.x,
    expectedAppliedForce.y,
  ));
  const momentScale = Math.max(1, Math.abs(expectedAppliedMomentZ));
  const reasons = [];
  const levelEvidence = levels.map((level) => qualifyLevel(
    level,
    expectedAppliedForce,
    expectedAppliedMomentZ,
    forceScale,
    momentScale,
    tolerances,
    reasons,
  ));
  const energyConvergence = evaluateLafeaBucket01UnequalHConvergence({
    schema: LAFEA_BUCKET_01_UNEQUAL_H_CONVERGENCE_INPUT_SCHEMA,
    quantityId: 'TOTAL_STRAIN_ENERGY',
    samplingAuthority: 'FIXED_GLOBAL_RESPONSE',
    locationId: 'C2D_LUG_PINHOLE_FULL_MODEL_LC1',
    locationDefinitionHash,
    units: 'N*mm',
    hValues: levels.map((row) => row.globalCharacteristicH),
    observations: levels.map((row) => row.totalStrainEnergy),
    topologySignatures: levels.map((row) => row.globalTopologySignature),
    gciTolerance: tolerances.strainEnergyGci,
    minimumObservedOrder: tolerances.minimumObservedOrder,
    asymptoticRatioBounds: tolerances.asymptoticRatioBounds,
  });
  if (energyConvergence.status !== 'PASS') {
    reasons.push(...energyConvergence.reasons.map(
      (reason) => `STRAIN_ENERGY_${reason}`,
    ));
  }

  const reactionMoments = levels.map((row) => row.reactionMomentZ);
  const reactionMomentErrors = reactionMoments.map((value) =>
    Math.abs(value + expectedAppliedMomentZ) / momentScale);
  const momentRangeRelative = (
    Math.max(...reactionMoments) - Math.min(...reactionMoments)
  ) / momentScale;
  if (Math.max(...reactionMomentErrors)
    > tolerances.momentEquilibriumRelative) {
    reasons.push('REACTION_MOMENT_ORACLE_BOUND_EXCEEDED');
  }
  if (momentRangeRelative > 2 * tolerances.momentEquilibriumRelative) {
    reasons.push('REACTION_MOMENT_MESH_INVARIANCE_EXCEEDED');
  }
  const momentConvergence = deepFreeze({
    classification: 'ORACLE_BOUND_MESH_INVARIANT',
    expectedReactionMomentZ: -expectedAppliedMomentZ,
    observations: reactionMoments,
    relativeErrors: reactionMomentErrors,
    rangeRelative: momentRangeRelative,
    tolerance: tolerances.momentEquilibriumRelative,
    status: reactionMomentErrors.every(
      (value) => value <= tolerances.momentEquilibriumRelative,
    ) && momentRangeRelative <= 2 * tolerances.momentEquilibriumRelative
      ? 'PASS' : 'BLOCKED',
  });
  const distinctParentHashes = ['meshHash', 'recoveryHash', 'resultHash']
    .every((key) => new Set(levels.map((row) => row[key])).size === levels.length);
  if (!distinctParentHashes) reasons.push('LEVEL_PARENT_HASHES_NOT_DISTINCT');

  const status = reasons.length === 0 ? 'PASS' : 'BLOCKED';
  const base = {
    schema: LAFEA_BUCKET_01_CANDIDATE_RESPONSE_EVIDENCE_SCHEMA,
    producerRevision: LAFEA_BUCKET_01_CANDIDATE_RESPONSE_REVISION,
    exactHeadSha,
    designHash,
    specHash,
    locationDefinitionHash,
    globalCharacteristicHDefinition:
      LAFEA_BUCKET_01_CANDIDATE_GLOBAL_H_DEFINITION,
    expectedAppliedForce,
    expectedAppliedMomentZ,
    forceScale,
    momentScale,
    tolerances,
    levelEvidence,
    energyConvergence,
    momentConvergence,
    status,
    reasons: [...new Set(reasons)].sort(),
    authority: {
      candidateOnly: true,
      fixedDesignV3MeshFamily: true,
      actualGlobalCharacteristicHUsed: true,
      equalRefinementRatioAssumed: false,
      fourLevelConvergenceAudit: true,
      forceAndMomentComputedFromRetainedNodalVectors: true,
      strainEnergyFromAuthoritativeSolverResult: true,
      externalWorkReconstructedIndependently: true,
      movingMaximumUsed: false,
      nodalStressProjectionUsed: false,
      productionSwitchAuthorized: false,
      productionMeshAuthority: false,
      stressAcceptanceAuthority: false,
      qualificationAuthority: false,
      bucketQualified: false,
    },
  };
  return deepFreeze({ ...base, semanticHash: canonicalLafeaSha256(base) });
}

export function validateLafeaBucket01CandidateResponseEvidence(value) {
  try {
    if (!value
      || value.schema !== LAFEA_BUCKET_01_CANDIDATE_RESPONSE_EVIDENCE_SCHEMA
      || value.producerRevision !== LAFEA_BUCKET_01_CANDIDATE_RESPONSE_REVISION) {
      throw responseError('LAFEA_B01_CANDIDATE_RESPONSE_EVIDENCE_INVALID');
    }
    const rebuilt = evaluateLafeaBucket01CandidateResponse({
      schema: LAFEA_BUCKET_01_CANDIDATE_RESPONSE_INPUT_SCHEMA,
      exactHeadSha: value.exactHeadSha,
      designHash: value.designHash,
      specHash: value.specHash,
      locationDefinitionHash: value.locationDefinitionHash,
      globalCharacteristicHDefinition:
        value.globalCharacteristicHDefinition,
      expectedAppliedForce: value.expectedAppliedForce,
      expectedAppliedMomentZ: value.expectedAppliedMomentZ,
      levels: value.levelEvidence.map((row) => ({
        ordinal: row.ordinal,
        elementCount: row.elementCount,
        globalCharacteristicH: row.globalCharacteristicH,
        globalTopologySignature: row.globalTopologySignature,
        meshHash: row.meshHash,
        recoveryHash: row.recoveryHash,
        resultHash: row.resultHash,
        solverMethod: row.solverMethod,
        freeDofCount: row.freeDofCount,
        appliedForce: row.appliedForce,
        reactionForce: row.reactionForce,
        appliedMomentZ: row.appliedMomentZ,
        reactionMomentZ: row.reactionMomentZ,
        totalStrainEnergy: row.totalStrainEnergy,
        halfExternalWork: row.halfExternalWork,
        energyQualificationAccepted: row.energyQualificationAccepted,
      })),
      tolerances: value.tolerances,
    });
    if (JSON.stringify(rebuilt) !== JSON.stringify(value)) {
      throw responseError('LAFEA_B01_CANDIDATE_RESPONSE_REBUILD_MISMATCH');
    }
    if (!isDeepFrozen(value)) {
      throw responseError('LAFEA_B01_CANDIDATE_RESPONSE_NOT_FROZEN');
    }
    return deepFreeze({ ok: true, errors: [] });
  } catch (error) {
    return deepFreeze({
      ok: false,
      errors: [error?.code ?? 'LAFEA_B01_CANDIDATE_RESPONSE_INVALID'],
    });
  }
}

function qualifyLevel(level, expectedForce, expectedMoment, forceScale,
  momentScale, tolerances, reasons) {
  const loadError = Math.hypot(
    level.appliedForce.x - expectedForce.x,
    level.appliedForce.y - expectedForce.y,
  ) / forceScale;
  const forceResidual = Math.hypot(
    level.appliedForce.x + level.reactionForce.x,
    level.appliedForce.y + level.reactionForce.y,
  ) / forceScale;
  const loadMomentError = Math.abs(
    level.appliedMomentZ - expectedMoment,
  ) / momentScale;
  const momentResidual = Math.abs(
    level.appliedMomentZ + level.reactionMomentZ,
  ) / momentScale;
  const energyReconstructionError = Math.abs(
    level.totalStrainEnergy - level.halfExternalWork,
  ) / Math.max(1, Math.abs(level.totalStrainEnergy));
  const prefix = `LEVEL_${level.ordinal}`;
  if (level.freeDofCount < 1) {
    reasons.push(`${prefix}_FREE_DOF_SOLVER_EVIDENCE_INVALID`);
  }
  if (!level.energyQualificationAccepted || !(level.totalStrainEnergy > 0)) {
    reasons.push(`${prefix}_STRAIN_ENERGY_NOT_QUALIFIED`);
  }
  if (loadError > tolerances.loadResultantRelative) {
    reasons.push(`${prefix}_APPLIED_FORCE_ORACLE_MISMATCH`);
  }
  if (forceResidual > tolerances.forceEquilibriumRelative) {
    reasons.push(`${prefix}_FORCE_EQUILIBRIUM_FAILED`);
  }
  if (loadMomentError > tolerances.loadMomentRelative) {
    reasons.push(`${prefix}_APPLIED_MOMENT_ORACLE_MISMATCH`);
  }
  if (momentResidual > tolerances.momentEquilibriumRelative) {
    reasons.push(`${prefix}_MOMENT_EQUILIBRIUM_FAILED`);
  }
  if (energyReconstructionError > tolerances.energyReconstructionRelative) {
    reasons.push(`${prefix}_EXTERNAL_WORK_ENERGY_RECONSTRUCTION_FAILED`);
  }
  return deepFreeze({
    ...level,
    normalizedAppliedForceError: loadError,
    normalizedForceEquilibriumResidual: forceResidual,
    normalizedAppliedMomentError: loadMomentError,
    normalizedMomentEquilibriumResidual: momentResidual,
    relativeExternalWorkEnergyError: energyReconstructionError,
    status: reasons.some((reason) => reason.startsWith(`${prefix}_`))
      ? 'BLOCKED' : 'PASS',
  });
}

function normalizeLevels(value) {
  if (!Array.isArray(value) || value.length !== 4) {
    throw responseError('LAFEA_B01_CANDIDATE_RESPONSE_FOUR_LEVELS_REQUIRED');
  }
  const levels = [...value].sort((left, right) => left.ordinal - right.ordinal)
    .map((row, index) => {
      exactKeys(row, LEVEL_KEYS, `levels[${index}]`);
      const ordinal = positiveInteger(row.ordinal, 'ordinal');
      const elementCount = positiveInteger(row.elementCount, 'elementCount');
      if (ordinal !== index + 1 || elementCount !== EXPECTED_ELEMENT_COUNTS[index]) {
        throw responseError('LAFEA_B01_CANDIDATE_RESPONSE_LADDER_INVALID');
      }
      const solverMethod = text(row.solverMethod, 'solverMethod');
      if (!ALLOWED_SOLVER_METHODS.has(solverMethod)) {
        throw responseError('LAFEA_B01_CANDIDATE_RESPONSE_SOLVER_METHOD_INVALID');
      }
      return deepFreeze({
        ordinal,
        elementCount,
        globalCharacteristicH: positive(
          row.globalCharacteristicH,
          'globalCharacteristicH',
        ),
        globalTopologySignature: sha256(
          row.globalTopologySignature,
          'globalTopologySignature',
        ),
        meshHash: sha256(row.meshHash, 'meshHash'),
        recoveryHash: sha256(row.recoveryHash, 'recoveryHash'),
        resultHash: sha256(row.resultHash, 'resultHash'),
        solverMethod,
        freeDofCount: positiveInteger(row.freeDofCount, 'freeDofCount'),
        appliedForce: vector(row.appliedForce, 'appliedForce'),
        reactionForce: vector(row.reactionForce, 'reactionForce'),
        appliedMomentZ: finite(row.appliedMomentZ, 'appliedMomentZ'),
        reactionMomentZ: finite(row.reactionMomentZ, 'reactionMomentZ'),
        totalStrainEnergy: positive(row.totalStrainEnergy, 'totalStrainEnergy'),
        halfExternalWork: positive(row.halfExternalWork, 'halfExternalWork'),
        energyQualificationAccepted:
          boolean(row.energyQualificationAccepted, 'energyQualificationAccepted'),
      });
    });
  for (let index = 1; index < levels.length; index += 1) {
    if (!(levels[index - 1].globalCharacteristicH
      > levels[index].globalCharacteristicH)) {
      throw responseError('LAFEA_B01_CANDIDATE_RESPONSE_H_ORDER_INVALID');
    }
  }
  if (new Set(levels.map((row) => row.globalTopologySignature)).size !== 1) {
    throw responseError('LAFEA_B01_CANDIDATE_RESPONSE_TOPOLOGY_CHANGED');
  }
  return deepFreeze(levels);
}

function normalizeTolerances(value) {
  exactKeys(value, TOLERANCE_KEYS, 'tolerances');
  exactKeys(
    value.asymptoticRatioBounds,
    ASYMPTOTIC_KEYS,
    'asymptoticRatioBounds',
  );
  if (value.asymptoticRatioBounds.maximum
    < value.asymptoticRatioBounds.minimum) {
    throw responseError('LAFEA_B01_CANDIDATE_RESPONSE_ASYMPTOTIC_BOUNDS_INVALID');
  }
  return deepFreeze({
    loadResultantRelative: positive(
      value.loadResultantRelative,
      'loadResultantRelative',
    ),
    forceEquilibriumRelative: positive(
      value.forceEquilibriumRelative,
      'forceEquilibriumRelative',
    ),
    loadMomentRelative: positive(
      value.loadMomentRelative,
      'loadMomentRelative',
    ),
    momentEquilibriumRelative: positive(
      value.momentEquilibriumRelative,
      'momentEquilibriumRelative',
    ),
    energyReconstructionRelative: positive(
      value.energyReconstructionRelative,
      'energyReconstructionRelative',
    ),
    strainEnergyGci: positive(value.strainEnergyGci, 'strainEnergyGci'),
    minimumObservedOrder: value.minimumObservedOrder === null
      ? null
      : nonNegative(value.minimumObservedOrder, 'minimumObservedOrder'),
    asymptoticRatioBounds: deepFreeze({
      minimum: positive(
        value.asymptoticRatioBounds.minimum,
        'asymptotic minimum',
      ),
      maximum: positive(
        value.asymptoticRatioBounds.maximum,
        'asymptotic maximum',
      ),
    }),
  });
}

function vector(value, label) {
  exactKeys(value, VECTOR_KEYS, label);
  return deepFreeze({
    x: finite(value.x, `${label}.x`),
    y: finite(value.y, `${label}.y`),
  });
}
function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
    || JSON.stringify(Object.keys(value).sort())
      !== JSON.stringify([...expected].sort())) {
    throw responseError('LAFEA_B01_CANDIDATE_RESPONSE_EXACT_KEYS_INVALID', label);
  }
}
function gitSha(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{40}$/u.test(value)) {
    throw responseError('LAFEA_B01_CANDIDATE_RESPONSE_HEAD_INVALID');
  }
  return value;
}
function sha256(value, label) {
  if (typeof value !== 'string' || !/^sha256:[0-9a-f]{64}$/u.test(value)) {
    throw responseError('LAFEA_B01_CANDIDATE_RESPONSE_HASH_INVALID', label);
  }
  return value;
}
function text(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw responseError('LAFEA_B01_CANDIDATE_RESPONSE_TEXT_REQUIRED', label);
  }
  return value;
}
function finite(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw responseError('LAFEA_B01_CANDIDATE_RESPONSE_FINITE_REQUIRED', label);
  }
  return Object.is(value, -0) ? 0 : value;
}
function positive(value, label) {
  const result = finite(value, label);
  if (!(result > 0)) {
    throw responseError('LAFEA_B01_CANDIDATE_RESPONSE_POSITIVE_REQUIRED', label);
  }
  return result;
}
function nonNegative(value, label) {
  const result = finite(value, label);
  if (result < 0) {
    throw responseError('LAFEA_B01_CANDIDATE_RESPONSE_NONNEGATIVE_REQUIRED', label);
  }
  return result;
}
function positiveInteger(value, label) {
  if (!Number.isInteger(value) || value < 1) {
    throw responseError('LAFEA_B01_CANDIDATE_RESPONSE_INTEGER_REQUIRED', label);
  }
  return value;
}
function boolean(value, label) {
  if (typeof value !== 'boolean') {
    throw responseError('LAFEA_B01_CANDIDATE_RESPONSE_BOOLEAN_REQUIRED', label);
  }
  return value;
}
function responseError(code, message = code) {
  const error = new TypeError(message);
  error.code = code;
  return error;
}
function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}
function isDeepFrozen(value) {
  if (!value || typeof value !== 'object') return true;
  return Object.isFrozen(value) && Object.values(value).every(isDeepFrozen);
}
