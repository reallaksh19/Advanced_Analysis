import { canonicalLafeaSha256 } from './lafea-canonical-sha256.js';

export const LAFEA_BUCKET_01_CONVERGENCE_INPUT_SCHEMA =
  'lafea-bucket-01-convergence-input/v1';
export const LAFEA_BUCKET_01_CONVERGENCE_EVIDENCE_SCHEMA =
  'lafea-bucket-01-convergence-evidence/v1';
export const LAFEA_BUCKET_01_CONVERGENCE_REVISION = 'B01-CONV.2';

const INPUT_KEYS = Object.freeze([
  'schema',
  'quantityId',
  'samplingAuthority',
  'locationId',
  'locationDefinitionHash',
  'units',
  'meshSizes',
  'observations',
  'gciTolerance',
  'minimumObservedOrder',
  'asymptoticRatioBounds',
]);
const ASYMPTOTIC_KEYS = Object.freeze(['minimum', 'maximum']);
const SAMPLING_AUTHORITIES = Object.freeze(new Set([
  'FIXED_PHYSICAL_PROBE',
  'FIXED_STRESS_PATH',
  'FIXED_GLOBAL_RESPONSE',
  'FIXED_SECTION_RESULTANT',
]));
const SAFETY_FACTOR = 1.25;
const REFINEMENT_RATIO_RELATIVE_TOLERANCE = 1e-10;
const RELATIVE_ZERO_THRESHOLD = 1e-12;

export function evaluateLafeaBucket01Convergence(inputValue) {
  exactKeys(inputValue, INPUT_KEYS, 'Bucket-01 convergence input');
  if (inputValue.schema !== LAFEA_BUCKET_01_CONVERGENCE_INPUT_SCHEMA) {
    throw convergenceError('LAFEA_B01_CONVERGENCE_INPUT_SCHEMA_INVALID');
  }
  exactKeys(
    inputValue.asymptoticRatioBounds,
    ASYMPTOTIC_KEYS,
    'asymptotic ratio bounds',
  );

  const quantityId = text(inputValue.quantityId, 'quantityId');
  const samplingAuthority = text(
    inputValue.samplingAuthority,
    'samplingAuthority',
  );
  if (!SAMPLING_AUTHORITIES.has(samplingAuthority)) {
    throw convergenceError('LAFEA_B01_SAMPLING_AUTHORITY_INVALID');
  }
  const locationId = text(inputValue.locationId, 'locationId');
  const locationDefinitionHash = sha256(
    inputValue.locationDefinitionHash,
    'locationDefinitionHash',
  );
  const units = text(inputValue.units, 'units');
  const meshSizes = positiveTriple(inputValue.meshSizes, 'meshSizes');
  const observations = finiteTriple(inputValue.observations, 'observations');
  const gciTolerance = positive(inputValue.gciTolerance, 'gciTolerance');
  const minimumObservedOrder = inputValue.minimumObservedOrder === null
    ? null
    : nonNegative(inputValue.minimumObservedOrder, 'minimumObservedOrder');
  const asymptoticRatioBounds = deepFreeze({
    minimum: positive(
      inputValue.asymptoticRatioBounds.minimum,
      'asymptoticRatioBounds.minimum',
    ),
    maximum: positive(
      inputValue.asymptoticRatioBounds.maximum,
      'asymptoticRatioBounds.maximum',
    ),
  });
  if (!(asymptoticRatioBounds.maximum >= asymptoticRatioBounds.minimum)) {
    throw convergenceError('LAFEA_B01_ASYMPTOTIC_BOUNDS_INVALID');
  }

  const [hCoarse, hMedium, hFine] = meshSizes;
  if (!(hCoarse > hMedium && hMedium > hFine)) {
    throw convergenceError('LAFEA_B01_MESH_SIZES_NOT_STRICTLY_REFINED');
  }
  const coarseRatio = hCoarse / hMedium;
  const fineRatio = hMedium / hFine;
  const ratioMismatch = Math.abs(coarseRatio - fineRatio)
    / Math.max(coarseRatio, fineRatio);
  if (ratioMismatch > REFINEMENT_RATIO_RELATIVE_TOLERANCE) {
    throw convergenceError('LAFEA_B01_REFINEMENT_RATIO_NOT_CONSTANT');
  }
  const refinementRatio = (coarseRatio + fineRatio) / 2;
  if (!(refinementRatio > 1)) {
    throw convergenceError('LAFEA_B01_REFINEMENT_RATIO_INVALID');
  }

  const [coarse, medium, fine] = observations;
  const coarseDifference = coarse - medium;
  const fineDifference = medium - fine;
  const reasons = [];
  let classification = 'UNRESOLVED';
  let observedOrder = null;
  let richardsonExtrapolation = null;
  let fineGridGci = null;
  let coarseGridGci = null;
  let asymptoticRatio = null;
  let asymptoticRangeAccepted = false;

  if (coarseDifference === 0 && fineDifference === 0) {
    classification = 'MESH_INSENSITIVE_OR_EXACT';
    reasons.push('ZERO_SUCCESSIVE_DIFFERENCES_REQUIRE_INDEPENDENT_ORACLE');
  } else if (coarseDifference === 0 || fineDifference === 0) {
    classification = 'NON_MONOTONIC';
    reasons.push('ONE_SUCCESSIVE_DIFFERENCE_IS_ZERO');
  } else if (coarseDifference * fineDifference < 0) {
    classification = 'OSCILLATORY';
    reasons.push('OSCILLATORY_CONVERGENCE_REQUIRES_ADDITIONAL_LEVEL_OR_BOUND');
  } else {
    classification = 'MONOTONIC';
    observedOrder = Math.log(
      Math.abs(coarseDifference / fineDifference),
    ) / Math.log(refinementRatio);
    if (!Number.isFinite(observedOrder) || !(observedOrder > 0)) {
      reasons.push('OBSERVED_ORDER_NOT_POSITIVE');
    } else {
      const orderDenominator = refinementRatio ** observedOrder - 1;
      if (!Number.isFinite(orderDenominator) || !(orderDenominator > 0)) {
        reasons.push('RICHARDSON_DENOMINATOR_INVALID');
      } else {
        richardsonExtrapolation = fine
          + (fine - medium) / orderDenominator;
        const observationScale = Math.max(...observations.map(Math.abs));
        if (!(observationScale > 0)
          || Math.abs(fine) <= RELATIVE_ZERO_THRESHOLD * observationScale) {
          reasons.push('FINE_OBSERVATION_NEAR_ZERO_FOR_RELATIVE_GCI');
        } else if (Math.abs(medium)
          <= RELATIVE_ZERO_THRESHOLD * observationScale) {
          reasons.push('MEDIUM_OBSERVATION_NEAR_ZERO_FOR_RELATIVE_GCI');
        } else {
          fineGridGci = SAFETY_FACTOR
            * Math.abs((fine - medium) / fine)
            / orderDenominator;
          coarseGridGci = SAFETY_FACTOR
            * Math.abs((medium - coarse) / medium)
            / orderDenominator;
          asymptoticRatio = coarseGridGci
            / (refinementRatio ** observedOrder * fineGridGci);
          asymptoticRangeAccepted = Number.isFinite(asymptoticRatio)
            && asymptoticRatio >= asymptoticRatioBounds.minimum
            && asymptoticRatio <= asymptoticRatioBounds.maximum;
          if (!asymptoticRangeAccepted) {
            reasons.push('ASYMPTOTIC_RANGE_NOT_DEMONSTRATED');
          }
          if (!(fineGridGci <= gciTolerance)) {
            reasons.push('FINE_GRID_GCI_EXCEEDS_TOLERANCE');
          }
        }
        if (minimumObservedOrder !== null
          && observedOrder < minimumObservedOrder) {
          reasons.push('OBSERVED_ORDER_BELOW_FROZEN_MINIMUM');
        }
      }
    }
  }

  const status = reasons.length === 0 ? 'PASS' : 'BLOCKED';
  const base = {
    schema: LAFEA_BUCKET_01_CONVERGENCE_EVIDENCE_SCHEMA,
    producerRevision: LAFEA_BUCKET_01_CONVERGENCE_REVISION,
    quantityId,
    samplingAuthority,
    locationId,
    locationDefinitionHash,
    units,
    meshSizes,
    observations,
    gciTolerance,
    minimumObservedOrder,
    asymptoticRatioBounds,
    safetyFactor: SAFETY_FACTOR,
    refinementRatio,
    ratioMismatch,
    successiveDifferences: [coarseDifference, fineDifference],
    classification,
    observedOrder,
    richardsonExtrapolation,
    fineGridGci,
    coarseGridGci,
    asymptoticRatio,
    asymptoticRangeAccepted,
    status,
    reasons,
  };
  return deepFreeze({
    ...base,
    semanticHash: canonicalLafeaSha256(base),
  });
}

export function validateLafeaBucket01ConvergenceEvidence(value) {
  try {
    if (!value
      || value.schema !== LAFEA_BUCKET_01_CONVERGENCE_EVIDENCE_SCHEMA
      || value.producerRevision !== LAFEA_BUCKET_01_CONVERGENCE_REVISION) {
      throw convergenceError('LAFEA_B01_CONVERGENCE_EVIDENCE_CONTRACT_INVALID');
    }
    const rebuilt = evaluateLafeaBucket01Convergence({
      schema: LAFEA_BUCKET_01_CONVERGENCE_INPUT_SCHEMA,
      quantityId: value.quantityId,
      samplingAuthority: value.samplingAuthority,
      locationId: value.locationId,
      locationDefinitionHash: value.locationDefinitionHash,
      units: value.units,
      meshSizes: value.meshSizes,
      observations: value.observations,
      gciTolerance: value.gciTolerance,
      minimumObservedOrder: value.minimumObservedOrder,
      asymptoticRatioBounds: value.asymptoticRatioBounds,
    });
    if (JSON.stringify(rebuilt) !== JSON.stringify(value)) {
      throw convergenceError('LAFEA_B01_CONVERGENCE_EVIDENCE_REBUILD_MISMATCH');
    }
    if (!isDeepFrozen(value)) {
      throw convergenceError('LAFEA_B01_CONVERGENCE_EVIDENCE_NOT_FROZEN');
    }
    return deepFreeze({ ok: true, errors: [] });
  } catch (error) {
    return deepFreeze({
      ok: false,
      errors: [error?.code ?? 'LAFEA_B01_CONVERGENCE_EVIDENCE_INVALID'],
    });
  }
}

function positiveTriple(value, label) {
  if (!Array.isArray(value) || value.length !== 3
    || value.some((row) => typeof row !== 'number'
      || !Number.isFinite(row) || row <= 0)) {
    throw convergenceError('LAFEA_B01_POSITIVE_TRIPLE_REQUIRED', `${label} invalid.`);
  }
  return deepFreeze(value.map(normalizeZero));
}

function finiteTriple(value, label) {
  if (!Array.isArray(value) || value.length !== 3
    || value.some((row) => typeof row !== 'number' || !Number.isFinite(row))) {
    throw convergenceError('LAFEA_B01_FINITE_TRIPLE_REQUIRED', `${label} invalid.`);
  }
  return deepFreeze(value.map(normalizeZero));
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) {
    throw convergenceError('LAFEA_B01_RECORD_INVALID', `${label} invalid.`);
  }
  const actual = Object.keys(value).sort();
  const required = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(required)) {
    throw convergenceError('LAFEA_B01_EXACT_KEYS_INVALID', `${label} keys differ.`);
  }
}

function text(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw convergenceError('LAFEA_B01_TEXT_REQUIRED', `${label} required.`);
  }
  return value;
}

function sha256(value, label) {
  if (typeof value !== 'string' || !/^sha256:[0-9a-f]{64}$/u.test(value)) {
    throw convergenceError('LAFEA_B01_SHA256_REQUIRED', `${label} invalid.`);
  }
  return value;
}

function positive(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw convergenceError('LAFEA_B01_POSITIVE_REQUIRED', `${label} invalid.`);
  }
  return normalizeZero(value);
}

function nonNegative(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw convergenceError('LAFEA_B01_NONNEGATIVE_REQUIRED', `${label} invalid.`);
  }
  return normalizeZero(value);
}

function normalizeZero(value) {
  return Object.is(value, -0) ? 0 : value;
}

function convergenceError(code, message = code) {
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
