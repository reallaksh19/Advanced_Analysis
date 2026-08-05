import { deepFreeze, requireFiniteNumber, requireNonEmptyString } from './contracts.js';

const ACTION_FIELDS = Object.freeze([
  'axialForceN',
  'shearYN',
  'shearZN',
  'torsionNm',
  'bendingMomentYNm',
  'bendingMomentZNm',
]);

function normalizeAction(action, fieldName) {
  const result = {};
  for (const field of ACTION_FIELDS) {
    result[field] = requireFiniteNumber(action?.[field] ?? 0, `${fieldName}.${field}`);
  }
  return result;
}

function subtractAction(left, right) {
  return Object.fromEntries(ACTION_FIELDS.map(field => [field, left[field] - right[field]]));
}

export function defineEmpiricalLoadCase(input) {
  const id = requireNonEmptyString(input.id, 'loadCase.id');
  const kind = requireNonEmptyString(input.kind, 'loadCase.kind');
  if (!['WEIGHT_COLD', 'WEIGHT_HOT', 'OPERATING_HOT', 'SUSTAINED'].includes(kind)) {
    throw new TypeError(`Unsupported empirical load-case kind: ${kind}`);
  }
  return deepFreeze({
    id,
    kind,
    includeWeight: Boolean(input.includeWeight),
    includeThermalStrain: Boolean(input.includeThermalStrain),
    includeMechanicalPressureThrust: Boolean(input.includeMechanicalPressureThrust),
    pressureStressOwnership: input.pressureStressOwnership ?? 'CODE_STRESS_ONLY',
    supportStateId: requireNonEmptyString(input.supportStateId, 'loadCase.supportStateId'),
  });
}

export function decomposeColdHotActions(input) {
  const coldWeight = normalizeAction(input.coldWeightAction, 'coldWeightAction');
  const hotWeight = normalizeAction(input.hotWeightAction, 'hotWeightAction');
  const hotOperating = normalizeAction(input.hotOperatingAction, 'hotOperatingAction');
  return deepFreeze({
    coldWeight,
    hotWeight,
    hotOperating,
    weightLiftRedistribution: subtractAction(hotWeight, coldWeight),
    thermalOnHotSupportSet: subtractAction(hotOperating, hotWeight),
    operatingMinusColdSustained: subtractAction(hotOperating, coldWeight),
    warning: 'OPERATING_MINUS_COLD_SUSTAINED_IS_NOT_PURE_THERMAL_WHEN_SUPPORT_STATE_CHANGES',
  });
}
