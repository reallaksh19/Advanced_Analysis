import { canonicalLafeaSha256 } from './lafea-canonical-sha256.js';

export const LAFEA_BUCKET_01_UNEQUAL_H_CONVERGENCE_INPUT_SCHEMA =
  'lafea-bucket-01-unequal-h-convergence-input/v1';
export const LAFEA_BUCKET_01_UNEQUAL_H_CONVERGENCE_EVIDENCE_SCHEMA =
  'lafea-bucket-01-unequal-h-convergence-evidence/v1';
export const LAFEA_BUCKET_01_UNEQUAL_H_CONVERGENCE_REVISION =
  'B01-UNEQUAL-H-CONV.1';
export const LAFEA_BUCKET_01_UNEQUAL_H_CONVERGENCE_METHOD =
  'RICHARDSON_UNEQUAL_H_FINEST_THREE_WITH_COARSE_TREND_AUDIT';

const INPUT_KEYS = Object.freeze([
  'schema', 'quantityId', 'samplingAuthority', 'locationId',
  'locationDefinitionHash', 'units', 'hValues', 'observations',
  'topologySignatures', 'gciTolerance', 'minimumObservedOrder',
  'asymptoticRatioBounds',
]);
const ASYMPTOTIC_KEYS = Object.freeze(['minimum', 'maximum']);
const SAMPLING_AUTHORITIES = Object.freeze(new Set([
  'FIXED_GLOBAL_RESPONSE',
  'FIXED_PHYSICAL_PROBE',
  'FIXED_STRESS_PATH',
]));
const SAFETY_FACTOR = 1.25;
const MINIMUM_ORDER = 1e-6;
const MAXIMUM_ORDER = 20;
const ORDER_SCAN_STEPS = 800;
const ORDER_BISECTION_STEPS = 120;
const ROOT_RELATIVE_TOLERANCE = 1e-12;
const RELATIVE_ZERO_THRESHOLD = 1e-12;

export function evaluateLafeaBucket01UnequalHConvergence(inputValue) {
  exactKeys(inputValue, INPUT_KEYS, 'unequal-h convergence input');
  if (inputValue.schema
    !== LAFEA_BUCKET_01_UNEQUAL_H_CONVERGENCE_INPUT_SCHEMA) {
    throw convergenceError('LAFEA_B01_UNEQUAL_H_INPUT_SCHEMA_INVALID');
  }
  exactKeys(
    inputValue.asymptoticRatioBounds,
    ASYMPTOTIC_KEYS,
    'asymptoticRatioBounds',
  );
  const quantityId = text(inputValue.quantityId, 'quantityId');
  const samplingAuthority = text(
    inputValue.samplingAuthority,
    'samplingAuthority',
  );
  if (!SAMPLING_AUTHORITIES.has(samplingAuthority)) {
    throw convergenceError('LAFEA_B01_UNEQUAL_H_SAMPLING_AUTHORITY_INVALID');
  }
  const locationId = text(inputValue.locationId, 'locationId');
  const locationDefinitionHash = sha256(
    inputValue.locationDefinitionHash,
    'locationDefinitionHash',
  );
  const units = text(inputValue.units, 'units');
  const hValues = positiveQuadruple(inputValue.hValues, 'hValues');
  if (!hValues.every((value, index) =>
    index === 0 || hValues[index - 1] > value)) {
    throw convergenceError('LAFEA_B01_UNEQUAL_H_NOT_STRICTLY_REFINED');
  }
  const observations = finiteQuadruple(
    inputValue.observations,
    'observations',
  );
  const topologySignatures = hashQuadruple(
    inputValue.topologySignatures,
    'topologySignatures',
  );
  const topologyCompatible = new Set(topologySignatures).size === 1;
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
  if (asymptoticRatioBounds.maximum < asymptoticRatioBounds.minimum) {
    throw convergenceError('LAFEA_B01_UNEQUAL_H_ASYMPTOTIC_BOUNDS_INVALID');
  }

  const hRatiosToPrevious = deepFreeze(hValues.map((value, index) =>
    index === 0 ? null : hValues[index - 1] / value));
  const differences = deepFreeze(observations.slice(1).map(
    (value, index) => observations[index] - value,
  ));
  const reasons = [];
  let classification = 'UNRESOLVED';
  let observedOrder = null;
  let extrapolatedValue = null;
  let errorCoefficient = null;
  let fineGridGci = null;
  let coarseTrendRatio = null;
  let coarseTrendAccepted = false;
  let fittedObservations = null;
  let fitResiduals = null;

  if (!topologyCompatible) {
    classification = 'TOPOLOGY_INCOMPATIBLE';
    reasons.push('TOPOLOGY_SIGNATURE_CHANGED');
  } else {
    const mediumDifference = differences[1];
    const fineDifference = differences[2];
    if (mediumDifference === 0 && fineDifference === 0) {
      classification = 'MESH_INSENSITIVE_OR_EXACT';
      reasons.push('ZERO_FINEST_SUCCESSIVE_DIFFERENCES_REQUIRE_INDEPENDENT_ORACLE');
    } else if (mediumDifference === 0 || fineDifference === 0) {
      classification = 'NON_MONOTONIC';
      reasons.push('ONE_FINEST_SUCCESSIVE_DIFFERENCE_IS_ZERO');
    } else if (mediumDifference * fineDifference < 0) {
      classification = 'OSCILLATORY';
      reasons.push('OSCILLATORY_CONVERGENCE_REQUIRES_ADDITIONAL_LEVEL_OR_BOUND');
    } else {
      classification = 'MONOTONIC';
      observedOrder = solveObservedOrder(
        hValues.slice(1),
        Math.abs(mediumDifference / fineDifference),
      );
      if (observedOrder === null) {
        reasons.push('OBSERVED_ORDER_NOT_IDENTIFIABLE_FOR_UNEQUAL_H');
      } else {
        const denominator = hValues[2] ** observedOrder
          - hValues[3] ** observedOrder;
        errorCoefficient = fineDifference / denominator;
        extrapolatedValue = observations[3]
          - errorCoefficient * hValues[3] ** observedOrder;
        fittedObservations = deepFreeze(hValues.map((hValue) =>
          extrapolatedValue + errorCoefficient * hValue ** observedOrder));
        fitResiduals = deepFreeze(observations.map((value, index) =>
          value - fittedObservations[index]));
        const predictedCoarseDifference = fittedObservations[0]
          - fittedObservations[1];
        if (predictedCoarseDifference === 0) {
          reasons.push('COARSE_TREND_PREDICTION_ZERO');
        } else {
          coarseTrendRatio = differences[0] / predictedCoarseDifference;
          coarseTrendAccepted = Number.isFinite(coarseTrendRatio)
            && coarseTrendRatio >= asymptoticRatioBounds.minimum
            && coarseTrendRatio <= asymptoticRatioBounds.maximum;
          if (!coarseTrendAccepted) {
            reasons.push('COARSE_LEVEL_TREND_AUDIT_FAILED');
          }
        }
        const observationScale = Math.max(...observations.map(Math.abs));
        if (!(observationScale > 0)
          || Math.abs(observations[3])
            <= RELATIVE_ZERO_THRESHOLD * observationScale) {
          reasons.push('FINE_OBSERVATION_NEAR_ZERO_FOR_RELATIVE_GCI');
        } else {
          fineGridGci = SAFETY_FACTOR
            * Math.abs((extrapolatedValue - observations[3]) / observations[3]);
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
    schema: LAFEA_BUCKET_01_UNEQUAL_H_CONVERGENCE_EVIDENCE_SCHEMA,
    producerRevision: LAFEA_BUCKET_01_UNEQUAL_H_CONVERGENCE_REVISION,
    method: LAFEA_BUCKET_01_UNEQUAL_H_CONVERGENCE_METHOD,
    quantityId,
    samplingAuthority,
    locationId,
    locationDefinitionHash,
    units,
    hValues,
    hRatiosToPrevious,
    constantRefinementRatioAssumed: false,
    observations,
    topologySignatures,
    topologyCompatible,
    differences,
    gciTolerance,
    minimumObservedOrder,
    asymptoticRatioBounds,
    safetyFactor: SAFETY_FACTOR,
    classification,
    observedOrder,
    extrapolatedValue,
    errorCoefficient,
    fittedObservations,
    fitResiduals,
    fineGridGci,
    coarseTrendRatio,
    coarseTrendAccepted,
    status,
    reasons,
    authority: {
      actualHValuesUsed: true,
      finestThreeUsedForOrderAndExtrapolation: true,
      coarsestLevelUsedForIndependentTrendAudit: true,
      topologyCompatibilityRequired: true,
      equalRatioSubstitutionUsed: false,
      gciClaimed: fineGridGci !== null,
      observedOrderClaimed: observedOrder !== null,
      stressAcceptanceAuthority: false,
      productionMeshAuthority: false,
      qualificationAuthority: false,
      bucketQualified: false,
    },
  };
  return deepFreeze({ ...base, semanticHash: canonicalLafeaSha256(base) });
}

export function validateLafeaBucket01UnequalHConvergenceEvidence(value) {
  try {
    if (!value
      || value.schema
        !== LAFEA_BUCKET_01_UNEQUAL_H_CONVERGENCE_EVIDENCE_SCHEMA
      || value.producerRevision
        !== LAFEA_BUCKET_01_UNEQUAL_H_CONVERGENCE_REVISION
      || value.method !== LAFEA_BUCKET_01_UNEQUAL_H_CONVERGENCE_METHOD) {
      throw convergenceError('LAFEA_B01_UNEQUAL_H_EVIDENCE_INVALID');
    }
    const rebuilt = evaluateLafeaBucket01UnequalHConvergence({
      schema: LAFEA_BUCKET_01_UNEQUAL_H_CONVERGENCE_INPUT_SCHEMA,
      quantityId: value.quantityId,
      samplingAuthority: value.samplingAuthority,
      locationId: value.locationId,
      locationDefinitionHash: value.locationDefinitionHash,
      units: value.units,
      hValues: value.hValues,
      observations: value.observations,
      topologySignatures: value.topologySignatures,
      gciTolerance: value.gciTolerance,
      minimumObservedOrder: value.minimumObservedOrder,
      asymptoticRatioBounds: value.asymptoticRatioBounds,
    });
    if (JSON.stringify(rebuilt) !== JSON.stringify(value)) {
      throw convergenceError('LAFEA_B01_UNEQUAL_H_REBUILD_MISMATCH');
    }
    if (!isDeepFrozen(value)) {
      throw convergenceError('LAFEA_B01_UNEQUAL_H_NOT_FROZEN');
    }
    return deepFreeze({ ok: true, errors: [] });
  } catch (error) {
    return deepFreeze({
      ok: false,
      errors: [error?.code ?? 'LAFEA_B01_UNEQUAL_H_INVALID'],
    });
  }
}

function solveObservedOrder(hValues, targetRatio) {
  const ratioAt = (order) => {
    const numerator = hValues[0] ** order - hValues[1] ** order;
    const denominator = hValues[1] ** order - hValues[2] ** order;
    return denominator === 0 ? Number.NaN : numerator / denominator;
  };
  const residualAt = (order) => ratioAt(order) - targetRatio;
  let previousOrder = MINIMUM_ORDER;
  let previousResidual = residualAt(previousOrder);
  if (!Number.isFinite(previousResidual)) return null;
  for (let index = 1; index <= ORDER_SCAN_STEPS; index += 1) {
    const order = MINIMUM_ORDER
      + (MAXIMUM_ORDER - MINIMUM_ORDER) * index / ORDER_SCAN_STEPS;
    const residual = residualAt(order);
    if (!Number.isFinite(residual)) return null;
    if (Math.abs(residual) <= ROOT_RELATIVE_TOLERANCE
      * Math.max(1, targetRatio)) return order;
    if (Math.sign(residual) !== Math.sign(previousResidual)) {
      let lower = previousOrder;
      let upper = order;
      let lowerResidual = previousResidual;
      for (let iteration = 0;
        iteration < ORDER_BISECTION_STEPS;
        iteration += 1) {
        const middle = (lower + upper) / 2;
        const middleResidual = residualAt(middle);
        if (!Number.isFinite(middleResidual)) return null;
        if (Math.abs(middleResidual) <= ROOT_RELATIVE_TOLERANCE
          * Math.max(1, targetRatio)) return middle;
        if (Math.sign(middleResidual) === Math.sign(lowerResidual)) {
          lower = middle;
          lowerResidual = middleResidual;
        } else {
          upper = middle;
        }
      }
      return (lower + upper) / 2;
    }
    previousOrder = order;
    previousResidual = residual;
  }
  return null;
}

function positiveQuadruple(value, label) {
  if (!Array.isArray(value) || value.length !== 4
    || value.some((row) => typeof row !== 'number'
      || !Number.isFinite(row) || !(row > 0))) {
    throw convergenceError('LAFEA_B01_UNEQUAL_H_POSITIVE_QUADRUPLE_REQUIRED', label);
  }
  return deepFreeze(value.map(normalizeZero));
}
function finiteQuadruple(value, label) {
  if (!Array.isArray(value) || value.length !== 4
    || value.some((row) => typeof row !== 'number' || !Number.isFinite(row))) {
    throw convergenceError('LAFEA_B01_UNEQUAL_H_FINITE_QUADRUPLE_REQUIRED', label);
  }
  return deepFreeze(value.map(normalizeZero));
}
function hashQuadruple(value, label) {
  if (!Array.isArray(value) || value.length !== 4) {
    throw convergenceError('LAFEA_B01_UNEQUAL_H_HASH_QUADRUPLE_REQUIRED', label);
  }
  return deepFreeze(value.map((row, index) => sha256(row, `${label}[${index}]`)));
}
function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
    || JSON.stringify(Object.keys(value).sort())
      !== JSON.stringify([...expected].sort())) {
    throw convergenceError('LAFEA_B01_UNEQUAL_H_EXACT_KEYS_INVALID', label);
  }
}
function text(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw convergenceError('LAFEA_B01_UNEQUAL_H_TEXT_REQUIRED', label);
  }
  return value;
}
function sha256(value, label) {
  if (typeof value !== 'string' || !/^sha256:[0-9a-f]{64}$/u.test(value)) {
    throw convergenceError('LAFEA_B01_UNEQUAL_H_HASH_INVALID', label);
  }
  return value;
}
function positive(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || !(value > 0)) {
    throw convergenceError('LAFEA_B01_UNEQUAL_H_POSITIVE_REQUIRED', label);
  }
  return normalizeZero(value);
}
function nonNegative(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw convergenceError('LAFEA_B01_UNEQUAL_H_NONNEGATIVE_REQUIRED', label);
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
