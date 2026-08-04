import { canonicalLafeaSha256 } from './lafea-canonical-sha256.js';

export const LAFEA_BUCKET_01_OSCILLATORY_BOUND_INPUT_SCHEMA =
  'lafea-bucket-01-oscillatory-bound-eligibility-input/v1';
export const LAFEA_BUCKET_01_OSCILLATORY_BOUND_EVIDENCE_SCHEMA =
  'lafea-bucket-01-oscillatory-bound-eligibility-evidence/v1';
export const LAFEA_BUCKET_01_OSCILLATORY_BOUND_REVISION =
  'B01-OSCILLATORY-BOUND-ELIGIBILITY.1';
export const LAFEA_BUCKET_01_OSCILLATORY_BOUND_METHOD =
  'CONSERVATIVE_OSCILLATORY_TAIL_BOUND_NOT_GCI';

const INPUT_KEYS = Object.freeze([
  'schema',
  'locationId',
  'values',
  'topologySignatures',
]);
const MINIMUM_OBSERVATION_COUNT = 4;
const GOVERNED_RHO_MAX = 0.8;
const SAFETY_FACTOR = 1.25;
const NORMALIZATION_FLOOR = 1e-12;

export function evaluateLafeaBucket01OscillatoryBoundEligibility(input) {
  exactKeys(input, INPUT_KEYS, 'oscillatory bound input');
  if (input.schema !== LAFEA_BUCKET_01_OSCILLATORY_BOUND_INPUT_SCHEMA) {
    throw boundError('LAFEA_B01_OSCILLATORY_BOUND_INPUT_SCHEMA_INVALID');
  }
  const locationId = requiredText(input.locationId, 'locationId');
  if (!Array.isArray(input.values) || !Array.isArray(input.topologySignatures)
    || input.values.length !== input.topologySignatures.length) {
    throw boundError('LAFEA_B01_OSCILLATORY_BOUND_OBSERVATION_SHAPE_INVALID');
  }
  const values = input.values.map((value) => finite(value, 'value'));
  const topologySignatures = input.topologySignatures.map((value) =>
    sha256(value, 'topologySignature'));
  const observationCount = values.length;
  const differences = values.slice(1).map((value, index) =>
    value - values[index]);
  const differenceMagnitudes = differences.map(Math.abs);
  const topologyCompatible = new Set(topologySignatures).size === 1;
  const hasMinimumObservations = observationCount >= MINIMUM_OBSERVATION_COUNT;
  const nonzeroDifferences = differences.every((difference) => difference !== 0);
  const alternatingSigns = hasMinimumObservations && nonzeroDifferences
    && differences.slice(1).every((difference, index) =>
      Math.sign(difference) === -Math.sign(differences[index]));
  const strictlyContracting = hasMinimumObservations
    && differenceMagnitudes.slice(1).every((magnitude, index) =>
      magnitude < differenceMagnitudes[index]);
  const contractionRatios = differenceMagnitudes.slice(1).map(
    (magnitude, index) => magnitude / differenceMagnitudes[index],
  );
  const maximumObservedContractionRatio = contractionRatios.length > 0
    ? Math.max(...contractionRatios)
    : null;
  const governedContractionSatisfied = maximumObservedContractionRatio !== null
    && maximumObservedContractionRatio <= GOVERNED_RHO_MAX;

  let disposition;
  const reasons = [];
  if (!hasMinimumObservations) {
    disposition = 'ADDITIONAL_LEVEL_REQUIRED';
    reasons.push('MINIMUM_FOUR_OBSERVATIONS_REQUIRED');
  } else if (!topologyCompatible) {
    disposition = 'TOPOLOGY_INCOMPATIBLE_BOUND_FORBIDDEN';
    reasons.push('TOPOLOGY_SIGNATURE_CHANGED');
  } else if (!nonzeroDifferences || !alternatingSigns) {
    disposition = 'NOT_A_GOVERNED_OSCILLATORY_SEQUENCE';
    reasons.push('SUCCESSIVE_DIFFERENCES_DO_NOT_STRICTLY_ALTERNATE');
  } else if (!strictlyContracting || !governedContractionSatisfied) {
    disposition = 'OSCILLATION_NOT_CONTRACTING';
    reasons.push('SUCCESSIVE_DIFFERENCE_MAGNITUDES_NOT_GOVERNED_CONTRACTING');
  } else {
    disposition = 'ELIGIBLE_FOR_INDEPENDENT_BOUND_REVIEW';
  }

  const lastDifferenceMagnitude = differenceMagnitudes.at(-1) ?? null;
  const normalization = values.length > 0
    ? Math.max(
      NORMALIZATION_FLOOR,
      Math.abs(values.at(-1)),
      Math.abs(values.at(-2) ?? values.at(-1)),
    )
    : NORMALIZATION_FLOOR;
  const conservativeAbsoluteTailBound =
    disposition === 'ELIGIBLE_FOR_INDEPENDENT_BOUND_REVIEW'
      ? SAFETY_FACTOR * lastDifferenceMagnitude / (1 - GOVERNED_RHO_MAX)
      : null;
  const conservativeRelativeTailBound = conservativeAbsoluteTailBound === null
    ? null : conservativeAbsoluteTailBound / normalization;

  const base = {
    schema: LAFEA_BUCKET_01_OSCILLATORY_BOUND_EVIDENCE_SCHEMA,
    producerRevision: LAFEA_BUCKET_01_OSCILLATORY_BOUND_REVISION,
    methodClassification: LAFEA_BUCKET_01_OSCILLATORY_BOUND_METHOD,
    locationId,
    observationCount,
    values,
    topologySignatures,
    topologyCompatible,
    differences,
    differenceMagnitudes,
    contractionRatios,
    maximumObservedContractionRatio,
    governedRhoMax: GOVERNED_RHO_MAX,
    safetyFactor: SAFETY_FACTOR,
    conservativeAbsoluteTailBound,
    conservativeRelativeTailBound,
    disposition,
    reasons,
    authority: {
      diagnosticEligibilityOnly: true,
      independentEngineeringAuthorityRequired: true,
      gciClaimed: false,
      observedOrderClaimed: false,
      stressAcceptanceAuthority: false,
      productionMeshAuthority: false,
      qualificationAuthority: false,
      bucketQualified: false,
    },
  };
  return deepFreeze({ ...base, semanticHash: canonicalLafeaSha256(base) });
}

export function validateLafeaBucket01OscillatoryBoundEligibilityEvidence(value) {
  try {
    if (!value
      || value.schema !== LAFEA_BUCKET_01_OSCILLATORY_BOUND_EVIDENCE_SCHEMA
      || value.producerRevision !== LAFEA_BUCKET_01_OSCILLATORY_BOUND_REVISION
      || value.methodClassification !== LAFEA_BUCKET_01_OSCILLATORY_BOUND_METHOD
      || value.authority?.gciClaimed !== false
      || value.authority?.observedOrderClaimed !== false
      || value.authority?.stressAcceptanceAuthority !== false
      || value.authority?.qualificationAuthority !== false
      || value.authority?.bucketQualified !== false) {
      throw boundError('LAFEA_B01_OSCILLATORY_BOUND_EVIDENCE_INVALID');
    }
    const basis = { ...value };
    delete basis.semanticHash;
    if (canonicalLafeaSha256(basis) !== value.semanticHash) {
      throw boundError('LAFEA_B01_OSCILLATORY_BOUND_HASH_TAMPERED');
    }
    if (!isDeepFrozen(value)) {
      throw boundError('LAFEA_B01_OSCILLATORY_BOUND_NOT_FROZEN');
    }
    return deepFreeze({ ok: true, errors: [] });
  } catch (error) {
    return deepFreeze({
      ok: false,
      errors: [error?.code ?? 'LAFEA_B01_OSCILLATORY_BOUND_INVALID'],
    });
  }
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
    || JSON.stringify(Object.keys(value).sort())
      !== JSON.stringify([...expected].sort())) {
    throw boundError('LAFEA_B01_OSCILLATORY_BOUND_EXACT_KEYS_INVALID', label);
  }
}

function finite(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw boundError('LAFEA_B01_OSCILLATORY_BOUND_FINITE_REQUIRED', label);
  }
  return value;
}

function requiredText(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw boundError('LAFEA_B01_OSCILLATORY_BOUND_TEXT_REQUIRED', label);
  }
  return value;
}

function sha256(value, label) {
  if (typeof value !== 'string' || !/^sha256:[0-9a-f]{64}$/u.test(value)) {
    throw boundError('LAFEA_B01_OSCILLATORY_BOUND_HASH_INVALID', label);
  }
  return value;
}

function boundError(code, message = code) {
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
