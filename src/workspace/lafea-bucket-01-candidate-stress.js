import { canonicalLafeaSha256 } from './lafea-canonical-sha256.js';
import {
  LAFEA_BUCKET_01_UNEQUAL_H_CONVERGENCE_INPUT_SCHEMA,
  evaluateLafeaBucket01UnequalHConvergence,
} from './lafea-bucket-01-unequal-h-convergence.js';

export const LAFEA_BUCKET_01_CANDIDATE_STRESS_INPUT_SCHEMA =
  'lafea-bucket-01-candidate-stress-input/v1';
export const LAFEA_BUCKET_01_CANDIDATE_STRESS_EVIDENCE_SCHEMA =
  'lafea-bucket-01-candidate-stress-evidence/v1';
export const LAFEA_BUCKET_01_CANDIDATE_STRESS_REVISION =
  'B01-CANDIDATE-STRESS.1';
export const LAFEA_BUCKET_01_CANDIDATE_LOCAL_H_DEFINITION =
  'SQRT_DELTA_R_TIMES_RADIUS_TIMES_DELTA_THETA_RADIANS';

const INPUT_KEYS = Object.freeze([
  'schema', 'exactHeadSha', 'designHash', 'probeSpecHash',
  'localCharacteristicHDefinition', 'locations', 'tolerances',
]);
const LOCATION_KEYS = Object.freeze([
  'locationId', 'locationDefinitionHash', 'component', 'units', 'zone',
  'radius', 'angleDegrees', 'hValues', 'observations',
  'topologySignatures', 'probeEvidenceHashes',
]);
const TOLERANCE_KEYS = Object.freeze([
  'highGradientGciMax', 'nonSingularGciMax', 'minimumObservedOrder',
  'asymptoticRatioBounds',
]);
const ASYMPTOTIC_KEYS = Object.freeze(['minimum', 'maximum']);
const ZONES = Object.freeze(new Set(['HIGH_GRADIENT', 'NON_SINGULAR']));
const EXPECTED_LOCATION_COUNT = 7;

export function evaluateLafeaBucket01CandidateStress(inputValue) {
  exactKeys(inputValue, INPUT_KEYS, 'candidate stress input');
  if (inputValue.schema !== LAFEA_BUCKET_01_CANDIDATE_STRESS_INPUT_SCHEMA) {
    throw stressError('LAFEA_B01_CANDIDATE_STRESS_INPUT_SCHEMA_INVALID');
  }
  const exactHeadSha = gitSha(inputValue.exactHeadSha);
  const designHash = sha256(inputValue.designHash, 'designHash');
  const probeSpecHash = sha256(inputValue.probeSpecHash, 'probeSpecHash');
  if (inputValue.localCharacteristicHDefinition
    !== LAFEA_BUCKET_01_CANDIDATE_LOCAL_H_DEFINITION) {
    throw stressError('LAFEA_B01_CANDIDATE_STRESS_H_DEFINITION_INVALID');
  }
  const tolerances = normalizeTolerances(inputValue.tolerances);
  if (!Array.isArray(inputValue.locations)
    || inputValue.locations.length !== EXPECTED_LOCATION_COUNT) {
    throw stressError('LAFEA_B01_CANDIDATE_STRESS_LOCATION_COUNT_INVALID');
  }
  const identifiers = new Set();
  const locationEvidence = inputValue.locations.map((locationValue) => {
    exactKeys(locationValue, LOCATION_KEYS, 'candidate stress location');
    const locationId = text(locationValue.locationId, 'locationId');
    if (identifiers.has(locationId)) {
      throw stressError('LAFEA_B01_CANDIDATE_STRESS_LOCATION_DUPLICATE');
    }
    identifiers.add(locationId);
    const zone = text(locationValue.zone, 'zone');
    if (!ZONES.has(zone)) {
      throw stressError('LAFEA_B01_CANDIDATE_STRESS_ZONE_INVALID');
    }
    const hValues = positiveQuadruple(locationValue.hValues, 'hValues');
    if (!hValues.every((value, index) =>
      index === 0 || hValues[index - 1] > value)) {
      throw stressError('LAFEA_B01_CANDIDATE_STRESS_H_NOT_REFINED');
    }
    const observations = finiteQuadruple(
      locationValue.observations,
      'observations',
    );
    const topologySignatures = hashQuadruple(
      locationValue.topologySignatures,
      'topologySignatures',
    );
    const probeEvidenceHashes = hashQuadruple(
      locationValue.probeEvidenceHashes,
      'probeEvidenceHashes',
    );
    const tolerance = zone === 'HIGH_GRADIENT'
      ? tolerances.highGradientGciMax
      : tolerances.nonSingularGciMax;
    const convergence = evaluateLafeaBucket01UnequalHConvergence({
      schema: LAFEA_BUCKET_01_UNEQUAL_H_CONVERGENCE_INPUT_SCHEMA,
      quantityId: text(locationValue.component, 'component'),
      samplingAuthority: locationId.includes(':')
        ? 'FIXED_STRESS_PATH' : 'FIXED_PHYSICAL_PROBE',
      locationId,
      locationDefinitionHash: sha256(
        locationValue.locationDefinitionHash,
        'locationDefinitionHash',
      ),
      units: text(locationValue.units, 'units'),
      hValues,
      observations,
      topologySignatures,
      gciTolerance: tolerance,
      minimumObservedOrder: tolerances.minimumObservedOrder,
      asymptoticRatioBounds: tolerances.asymptoticRatioBounds,
    });
    const status = convergence.status;
    return deepFreeze({
      locationId,
      locationDefinitionHash: locationValue.locationDefinitionHash,
      component: locationValue.component,
      units: locationValue.units,
      zone,
      radius: positive(locationValue.radius, 'radius'),
      angleDegrees: finite(locationValue.angleDegrees, 'angleDegrees'),
      localCharacteristicHDefinition:
        LAFEA_BUCKET_01_CANDIDATE_LOCAL_H_DEFINITION,
      hValues,
      observations,
      topologySignatures,
      probeEvidenceHashes,
      gciTolerance: tolerance,
      convergence,
      status,
      reasons: convergence.reasons,
    });
  });
  const blockingLocationIds = locationEvidence
    .filter((row) => row.status !== 'PASS')
    .map((row) => row.locationId);
  const status = blockingLocationIds.length === 0 ? 'PASS' : 'BLOCKED';
  const base = {
    schema: LAFEA_BUCKET_01_CANDIDATE_STRESS_EVIDENCE_SCHEMA,
    producerRevision: LAFEA_BUCKET_01_CANDIDATE_STRESS_REVISION,
    exactHeadSha,
    designHash,
    probeSpecHash,
    localCharacteristicHDefinition:
      LAFEA_BUCKET_01_CANDIDATE_LOCAL_H_DEFINITION,
    tolerances,
    locationEvidence,
    blockingLocationIds,
    status,
    reasons: blockingLocationIds.map(
      (locationId) => `LOCATION_BLOCKED:${locationId}`,
    ),
    authority: {
      candidateOnly: true,
      fixedPhysicalCoordinates: true,
      directT6PointRecoveryRequired: true,
      actualLocalCharacteristicHUsed: true,
      equalRefinementRatioAssumed: false,
      topologyCompatibilityRequired: true,
      movingMaximumUsed: false,
      nodalProjectionUsed: false,
      crossElementAveragingUsed: false,
      integrationPointExtrapolationUsed: false,
      independentCheckerExecution: false,
      productionSwitchAuthorized: false,
      productionMeshAuthority: false,
      stressAcceptanceAuthority: false,
      qualificationAuthority: false,
      bucketQualified: false,
    },
  };
  return deepFreeze({ ...base, semanticHash: canonicalLafeaSha256(base) });
}

export function validateLafeaBucket01CandidateStressEvidence(value) {
  try {
    if (!value
      || value.schema !== LAFEA_BUCKET_01_CANDIDATE_STRESS_EVIDENCE_SCHEMA
      || value.producerRevision !== LAFEA_BUCKET_01_CANDIDATE_STRESS_REVISION) {
      throw stressError('LAFEA_B01_CANDIDATE_STRESS_EVIDENCE_INVALID');
    }
    const rebuilt = evaluateLafeaBucket01CandidateStress({
      schema: LAFEA_BUCKET_01_CANDIDATE_STRESS_INPUT_SCHEMA,
      exactHeadSha: value.exactHeadSha,
      designHash: value.designHash,
      probeSpecHash: value.probeSpecHash,
      localCharacteristicHDefinition:
        value.localCharacteristicHDefinition,
      locations: value.locationEvidence.map((row) => ({
        locationId: row.locationId,
        locationDefinitionHash: row.locationDefinitionHash,
        component: row.component,
        units: row.units,
        zone: row.zone,
        radius: row.radius,
        angleDegrees: row.angleDegrees,
        hValues: row.hValues,
        observations: row.observations,
        topologySignatures: row.topologySignatures,
        probeEvidenceHashes: row.probeEvidenceHashes,
      })),
      tolerances: value.tolerances,
    });
    if (JSON.stringify(rebuilt) !== JSON.stringify(value)) {
      throw stressError('LAFEA_B01_CANDIDATE_STRESS_REBUILD_MISMATCH');
    }
    if (!isDeepFrozen(value)) {
      throw stressError('LAFEA_B01_CANDIDATE_STRESS_NOT_FROZEN');
    }
    return deepFreeze({ ok: true, errors: [] });
  } catch (error) {
    return deepFreeze({
      ok: false,
      errors: [error?.code ?? 'LAFEA_B01_CANDIDATE_STRESS_INVALID'],
    });
  }
}

function normalizeTolerances(value) {
  exactKeys(value, TOLERANCE_KEYS, 'tolerances');
  exactKeys(
    value.asymptoticRatioBounds,
    ASYMPTOTIC_KEYS,
    'asymptoticRatioBounds',
  );
  const minimum = positive(
    value.asymptoticRatioBounds.minimum,
    'asymptoticRatioBounds.minimum',
  );
  const maximum = positive(
    value.asymptoticRatioBounds.maximum,
    'asymptoticRatioBounds.maximum',
  );
  if (maximum < minimum) {
    throw stressError('LAFEA_B01_CANDIDATE_STRESS_ASYMPTOTIC_BOUNDS_INVALID');
  }
  return deepFreeze({
    highGradientGciMax: positive(
      value.highGradientGciMax,
      'highGradientGciMax',
    ),
    nonSingularGciMax: positive(
      value.nonSingularGciMax,
      'nonSingularGciMax',
    ),
    minimumObservedOrder: value.minimumObservedOrder === null
      ? null
      : nonNegative(value.minimumObservedOrder, 'minimumObservedOrder'),
    asymptoticRatioBounds: deepFreeze({ minimum, maximum }),
  });
}

function positiveQuadruple(value, label) {
  if (!Array.isArray(value) || value.length !== 4
    || value.some((row) => typeof row !== 'number'
      || !Number.isFinite(row) || !(row > 0))) {
    throw stressError('LAFEA_B01_CANDIDATE_STRESS_POSITIVE_QUADRUPLE_REQUIRED', label);
  }
  return deepFreeze(value.map(normalizeZero));
}
function finiteQuadruple(value, label) {
  if (!Array.isArray(value) || value.length !== 4
    || value.some((row) => typeof row !== 'number' || !Number.isFinite(row))) {
    throw stressError('LAFEA_B01_CANDIDATE_STRESS_FINITE_QUADRUPLE_REQUIRED', label);
  }
  return deepFreeze(value.map(normalizeZero));
}
function hashQuadruple(value, label) {
  if (!Array.isArray(value) || value.length !== 4) {
    throw stressError('LAFEA_B01_CANDIDATE_STRESS_HASH_QUADRUPLE_REQUIRED', label);
  }
  return deepFreeze(value.map((row, index) => sha256(row, `${label}[${index}]`)));
}
function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
    || JSON.stringify(Object.keys(value).sort())
      !== JSON.stringify([...expected].sort())) {
    throw stressError('LAFEA_B01_CANDIDATE_STRESS_EXACT_KEYS_INVALID', label);
  }
}
function gitSha(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{40}$/u.test(value)) {
    throw stressError('LAFEA_B01_CANDIDATE_STRESS_HEAD_INVALID');
  }
  return value;
}
function sha256(value, label) {
  if (typeof value !== 'string' || !/^sha256:[0-9a-f]{64}$/u.test(value)) {
    throw stressError('LAFEA_B01_CANDIDATE_STRESS_HASH_INVALID', label);
  }
  return value;
}
function text(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw stressError('LAFEA_B01_CANDIDATE_STRESS_TEXT_REQUIRED', label);
  }
  return value;
}
function finite(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw stressError('LAFEA_B01_CANDIDATE_STRESS_FINITE_REQUIRED', label);
  }
  return normalizeZero(value);
}
function positive(value, label) {
  const result = finite(value, label);
  if (!(result > 0)) {
    throw stressError('LAFEA_B01_CANDIDATE_STRESS_POSITIVE_REQUIRED', label);
  }
  return result;
}
function nonNegative(value, label) {
  const result = finite(value, label);
  if (result < 0) {
    throw stressError('LAFEA_B01_CANDIDATE_STRESS_NONNEGATIVE_REQUIRED', label);
  }
  return result;
}
function normalizeZero(value) {
  return Object.is(value, -0) ? 0 : value;
}
function stressError(code, message = code) {
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
