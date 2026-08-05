export const EMPIRICAL_PIPING_METHOD_ID = 'EMPIRICAL_BEAM_CONTACT_V1';

export const EMPIRICAL_PIPING_SCHEMAS = Object.freeze({
  request: 'empirical-piping-request/v1',
  sectionStates: 'empirical-piping-section-states/v1',
  planarResult: 'empirical-piping-planar-result/v1',
  memberActions: 'empirical-member-action-recovery/v1',
  sustainedStress: 'empirical-b31-sustained-stress/v1',
  contactHistory: 'empirical-contact-history/v1',
});

export const AUTHORITY_CLASSES = Object.freeze([
  'DIRECT_MECHANICS',
  'CODE_FORMULA',
  'DERIVED_RELATION',
  'ADOPTED_EMPIRICAL',
  'NUMERICAL_ALGORITHM',
  'BENCHMARK_REFERENCE',
  'ACCEPTANCE_RULE',
]);

export const EMPIRICAL_FORMULA_IDS = Object.freeze({
  sectionArea: 'EMP-SEC-001',
  sectionSecondMoment: 'EMP-SEC-002',
  sectionPolarMoment: 'EMP-SEC-003',
  sectionModulus: 'EMP-SEC-004',
  pipeMass: 'EMP-WGT-001',
  lineLoad: 'EMP-WGT-002',
  axialCoefficient: 'EMP-BM-001',
  bending12: 'EMP-BM-002',
  bending6: 'EMP-BM-003',
  bending4: 'EMP-BM-004',
  bending2: 'EMP-BM-005',
  uniformLoadShear: 'EMP-LOD-001',
  uniformLoadMoment: 'EMP-LOD-002',
  thermalStrain: 'EMP-THM-001',
  freeThermalExpansion: 'EMP-THM-002',
  segmentedElbow: 'EMP-BND-010',
  contactComplementarity: 'EMP-CNT-001',
  memberActionRecovery: 'EMP-ACT-001',
  internalMoment: 'EMP-ACT-002',
  tangentProjection: 'EMP-ACT-003',
  pressureForce: 'EMP-STR-001',
  sustainedAxialStress: 'EMP-STR-002',
  sustainedBendingStress: 'EMP-STR-003',
  sustainedTorsionStress: 'EMP-STR-004',
  sustainedLongitudinalStress: 'EMP-STR-005',
  forceClosure: 'EMP-EQ-001',
  momentClosure: 'EMP-EQ-002',
  bendConvergence: 'EMP-CONV-001',
});

export const PLANAR_DOF_ORDER = Object.freeze(['UX', 'UY', 'RZ']);

export function requireFiniteNumber(value, fieldName) {
  if (!Number.isFinite(value)) {
    throw new TypeError(`${fieldName} must be a finite number.`);
  }
  return value;
}

export function requirePositiveNumber(value, fieldName) {
  requireFiniteNumber(value, fieldName);
  if (!(value > 0)) {
    throw new RangeError(`${fieldName} must be greater than zero.`);
  }
  return value;
}

export function requireNonNegativeNumber(value, fieldName) {
  requireFiniteNumber(value, fieldName);
  if (value < 0) {
    throw new RangeError(`${fieldName} must be zero or greater.`);
  }
  return value;
}

export function requireNonEmptyString(value, fieldName) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${fieldName} must be a non-empty string.`);
  }
  return value;
}

export function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}
