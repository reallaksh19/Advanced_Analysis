import {
  assertArray,
  assertEnum,
  assertExactKeys,
  assertFiniteNumber,
  assertPlainData,
  assertString,
  clonePlain,
  deepFreeze,
  sealWithHash,
  verifySealedHash,
} from './contracts.js';

export const CONTACT_PROCEDURE_SCHEMA = 'nonlinear-shell-contact-contact-procedure/v1';
export const REQUIRED_CONTACT_METRICS = Object.freeze([
  'INTEGRATED_NORMAL_RESULTANT',
  'CONTACT_AREA',
  'CONTACT_CENTROID',
  'CONTACT_WIDTH',
  'PRESSURE_PERCENTILES',
  'PENETRATION_DISTRIBUTION',
  'CONTACT_WORK',
  'GLOBAL_EQUILIBRIUM',
]);
export const REQUIRED_CONTACT_BENCHMARKS = Object.freeze([
  'OPEN_CONTACT_ZERO_TRACTION',
  'FLAT_PUNCH_RESULTANT',
  'RIGID_SPHERE_CONTACT',
  'RIGID_CYLINDER_CONTACT',
  'RIGID_SADDLE_CONTACT',
  'MASTER_SLAVE_REVERSAL',
  'PENALTY_SENSITIVITY',
  'INCREMENT_SENSITIVITY',
]);

export function createContactProcedureContract(input = {}) {
  const payload = {
    schema: CONTACT_PROCEDURE_SCHEMA,
    formulation: 'FRICTIONLESS_SURFACE_TO_SURFACE_PENALTY',
    kinematics: 'FINITE_SLIDING',
    normalConvention: {
      masterNormalPointsIntoAdmissibleSlaveRegion: true,
      positiveGapMeaning: 'OPEN',
      negativeGapMeaning: 'PENETRATION',
      positivePressureMeaning: 'COMPRESSION',
    },
    physicalContactSurface: 'SHELL_SIDE_PLUS_OFFSET_PLUS_HALF_THICKNESS',
    penaltyBasis: 'ALPHA_TIMES_EFFECTIVE_MODULUS_OVER_EFFECTIVE_LENGTH',
    penaltyScale: 1,
    penaltySensitivityScales: [0.5, 1, 2],
    incrementSensitivityScales: [1, 0.5, 0.25],
    penetrationLimitRatio: 0.01,
    contactWorkImbalanceLimit: 0.02,
    globalEquilibriumResidualLimit: 0.01,
    masterSlaveReversalRequired: true,
    selfContactAuthorized: false,
    frictionAuthorized: false,
    grossSlidingAuthorized: false,
    requiredMetrics: [...REQUIRED_CONTACT_METRICS],
    requiredBenchmarks: [...REQUIRED_CONTACT_BENCHMARKS],
    rawMaximumPressureAuthority: 'DIAGNOSTIC_ONLY',
    ...clonePlain(input),
  };
  validateContactProcedureContract(payload);
  return sealWithHash(payload, 'contactProcedureHash');
}

export function validateContactProcedureContract(value) {
  assertPlainData(value, '$contactProcedure');
  assertExactKeys(value, [
    'schema', 'formulation', 'kinematics', 'normalConvention', 'physicalContactSurface',
    'penaltyBasis', 'penaltyScale', 'penaltySensitivityScales', 'incrementSensitivityScales',
    'penetrationLimitRatio', 'contactWorkImbalanceLimit', 'globalEquilibriumResidualLimit',
    'masterSlaveReversalRequired', 'selfContactAuthorized', 'frictionAuthorized',
    'grossSlidingAuthorized', 'requiredMetrics', 'requiredBenchmarks',
    'rawMaximumPressureAuthority',
  ], '$contactProcedure', ['contactProcedureHash']);
  assertEnum(value.schema, [CONTACT_PROCEDURE_SCHEMA], '$contactProcedure.schema');
  assertEnum(value.formulation, ['FRICTIONLESS_SURFACE_TO_SURFACE_PENALTY'], '$contactProcedure.formulation');
  assertEnum(value.kinematics, ['FINITE_SLIDING'], '$contactProcedure.kinematics');
  assertExactKeys(value.normalConvention, [
    'masterNormalPointsIntoAdmissibleSlaveRegion', 'positiveGapMeaning',
    'negativeGapMeaning', 'positivePressureMeaning',
  ], '$contactProcedure.normalConvention');
  if (value.normalConvention.masterNormalPointsIntoAdmissibleSlaveRegion !== true) throw new TypeError('Master normal convention is mandatory.');
  assertEnum(value.normalConvention.positiveGapMeaning, ['OPEN'], '$contactProcedure.normalConvention.positiveGapMeaning');
  assertEnum(value.normalConvention.negativeGapMeaning, ['PENETRATION'], '$contactProcedure.normalConvention.negativeGapMeaning');
  assertEnum(value.normalConvention.positivePressureMeaning, ['COMPRESSION'], '$contactProcedure.normalConvention.positivePressureMeaning');
  assertEnum(value.physicalContactSurface, ['SHELL_SIDE_PLUS_OFFSET_PLUS_HALF_THICKNESS'], '$contactProcedure.physicalContactSurface');
  assertEnum(value.penaltyBasis, ['ALPHA_TIMES_EFFECTIVE_MODULUS_OVER_EFFECTIVE_LENGTH'], '$contactProcedure.penaltyBasis');
  assertFiniteNumber(value.penaltyScale, '$contactProcedure.penaltyScale', (n) => n >= 0.1 && n <= 100, 'bounded positive');
  validateScaleArray(value.penaltySensitivityScales, '$contactProcedure.penaltySensitivityScales');
  validateScaleArray(value.incrementSensitivityScales, '$contactProcedure.incrementSensitivityScales');
  for (const [field, upper] of [['penetrationLimitRatio', 0.05], ['contactWorkImbalanceLimit', 0.05], ['globalEquilibriumResidualLimit', 0.05]]) {
    assertFiniteNumber(value[field], `$contactProcedure.${field}`, (n) => n > 0 && n <= upper, 'bounded ratio');
  }
  if (value.masterSlaveReversalRequired !== true) throw new TypeError('Master/slave reversal sensitivity is mandatory.');
  for (const field of ['selfContactAuthorized', 'frictionAuthorized', 'grossSlidingAuthorized']) {
    if (value[field] !== false) throw new TypeError(`${field} is outside the first contact lot.`);
  }
  validateRequiredSet(value.requiredMetrics, REQUIRED_CONTACT_METRICS, '$contactProcedure.requiredMetrics');
  validateRequiredSet(value.requiredBenchmarks, REQUIRED_CONTACT_BENCHMARKS, '$contactProcedure.requiredBenchmarks');
  assertEnum(value.rawMaximumPressureAuthority, ['DIAGNOSTIC_ONLY'], '$contactProcedure.rawMaximumPressureAuthority');
  if (value.contactProcedureHash) verifySealedHash(value, 'contactProcedureHash', '$contactProcedure');
  return true;
}

function validateScaleArray(value, path) {
  assertArray(value, path, { min: 3 });
  value.forEach((entry, index) => assertFiniteNumber(entry, `${path}[${index}]`, (n) => n > 0, 'positive'));
  if (!value.includes(1)) throw new TypeError(`${path} must include the nominal scale 1.`);
  if (new Set(value).size !== value.length) throw new TypeError(`${path} must be unique.`);
}

function validateRequiredSet(value, required, path) {
  assertArray(value, path, { min: required.length });
  value.forEach((entry, index) => assertString(entry, `${path}[${index}]`));
  if (new Set(value).size !== value.length) throw new TypeError(`${path} must be unique.`);
  for (const id of required) if (!value.includes(id)) throw new TypeError(`${path} is missing ${id}.`);
}

export const DEFAULT_CONTACT_PROCEDURE = deepFreeze(createContactProcedureContract());
