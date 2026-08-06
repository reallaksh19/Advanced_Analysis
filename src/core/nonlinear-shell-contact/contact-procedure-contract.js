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

export const CONTACT_PROCEDURE_SCHEMA = 'nonlinear-shell-contact-contact-procedure/v2';
export const REQUIRED_CONTACT_BENCHMARKS = Object.freeze([
  'NC02-CT-01_NORMAL_COMPRESSION_PATCH',
  'NC02-CT-02_OPENING_ZERO_TENSION',
  'NC02-CT-03_SLIDING_CONSTANT_NORMAL_LOAD',
  'NC02-CT-04_CURVED_RIGID_SURFACE',
  'NC02-CT-05_EDGE_TRANSITION',
  'NC02-CT-06_LARGE_RELATIVE_SLIDING',
  'NC02-CT-07_RELEASE_RECONTACT',
  'NC02-CT-08_ORIENTATION_REVERSAL',
  'NC02-CT-09_PENALTY_SENSITIVITY',
  'NC02-CT-10_MESH_REFINEMENT',
]);

export function createContactProcedureContract(input = {}) {
  const payload = {
    schema: CONTACT_PROCEDURE_SCHEMA,
    formulation: 'FRICTIONLESS_NODE_TO_SURFACE_LINEAR_PENALTY',
    kinematics: 'FINITE_SLIDING_REPAIRING',
    shellRole: 'DEFORMABLE_S8R_SLAVE',
    rigidRole: 'FIXED_C3D8_MASTER',
    physicalContactSurface: 'SHELL_SIDE_PLUS_HALF_THICKNESS',
    gapConvention: 'POSITIVE_OPEN_NEGATIVE_PENETRATION',
    pressureConvention: 'POSITIVE_COMPRESSION_ZERO_TENSION',
    penaltySlope: 1e7,
    penaltySensitivityScales: [0.5, 1, 2],
    incrementSensitivityScales: [1, 0.5, 0.25],
    meshLevelCount: 4,
    penetrationRatioLimit: 0.011,
    tangentialTractionRatioLimit: 1e-8,
    contactWorkImbalanceLimit: 1e-8,
    globalEquilibriumResidualLimit: 0.005,
    pressureLawErrorLimit: 1e-5,
    penaltyResultantSpreadLimit: 0.01,
    meshResultantSpreadLimit: 0.001,
    requiredBenchmarks: [...REQUIRED_CONTACT_BENCHMARKS],
    frictionAuthorized: false,
    selfContactAuthorized: false,
    productionExecutionAuthorized: false,
    ...clonePlain(input),
  };
  validateContactProcedureContract(payload);
  return sealWithHash(payload, 'contactProcedureHash');
}

export function validateContactProcedureContract(value) {
  assertPlainData(value, '$contactProcedure');
  assertExactKeys(value, [
    'schema','formulation','kinematics','shellRole','rigidRole','physicalContactSurface',
    'gapConvention','pressureConvention','penaltySlope','penaltySensitivityScales',
    'incrementSensitivityScales','meshLevelCount','penetrationRatioLimit',
    'tangentialTractionRatioLimit','contactWorkImbalanceLimit',
    'globalEquilibriumResidualLimit','pressureLawErrorLimit',
    'penaltyResultantSpreadLimit','meshResultantSpreadLimit','requiredBenchmarks',
    'frictionAuthorized','selfContactAuthorized','productionExecutionAuthorized',
  ], '$contactProcedure', ['contactProcedureHash']);
  assertEnum(value.schema, [CONTACT_PROCEDURE_SCHEMA], '$contactProcedure.schema');
  assertEnum(value.formulation, ['FRICTIONLESS_NODE_TO_SURFACE_LINEAR_PENALTY'], '$contactProcedure.formulation');
  assertEnum(value.kinematics, ['FINITE_SLIDING_REPAIRING'], '$contactProcedure.kinematics');
  assertEnum(value.shellRole, ['DEFORMABLE_S8R_SLAVE'], '$contactProcedure.shellRole');
  assertEnum(value.rigidRole, ['FIXED_C3D8_MASTER'], '$contactProcedure.rigidRole');
  assertEnum(value.physicalContactSurface, ['SHELL_SIDE_PLUS_HALF_THICKNESS'], '$contactProcedure.physicalContactSurface');
  assertEnum(value.gapConvention, ['POSITIVE_OPEN_NEGATIVE_PENETRATION'], '$contactProcedure.gapConvention');
  assertEnum(value.pressureConvention, ['POSITIVE_COMPRESSION_ZERO_TENSION'], '$contactProcedure.pressureConvention');
  assertFiniteNumber(value.penaltySlope, '$contactProcedure.penaltySlope', (n) => n > 0, 'positive');
  validateScales(value.penaltySensitivityScales, '$contactProcedure.penaltySensitivityScales');
  validateScales(value.incrementSensitivityScales, '$contactProcedure.incrementSensitivityScales');
  if (value.meshLevelCount !== 4) throw new TypeError('Exactly four governed mesh levels are required.');
  for (const field of ['penetrationRatioLimit','tangentialTractionRatioLimit','contactWorkImbalanceLimit','globalEquilibriumResidualLimit','pressureLawErrorLimit','penaltyResultantSpreadLimit','meshResultantSpreadLimit']) {
    assertFiniteNumber(value[field], `$contactProcedure.${field}`, (n) => n > 0 && n <= 0.05, 'bounded positive ratio');
  }
  assertArray(value.requiredBenchmarks, '$contactProcedure.requiredBenchmarks', { min: REQUIRED_CONTACT_BENCHMARKS.length });
  value.requiredBenchmarks.forEach((id, i) => assertString(id, `$contactProcedure.requiredBenchmarks[${i}]`));
  if (new Set(value.requiredBenchmarks).size !== value.requiredBenchmarks.length) throw new TypeError('Required benchmark IDs must be unique.');
  for (const id of REQUIRED_CONTACT_BENCHMARKS) if (!value.requiredBenchmarks.includes(id)) throw new TypeError(`Missing required benchmark ${id}.`);
  for (const field of ['frictionAuthorized','selfContactAuthorized','productionExecutionAuthorized']) if (value[field] !== false) throw new TypeError(`${field} is outside NC-02 authority.`);
  if (value.contactProcedureHash) verifySealedHash(value, 'contactProcedureHash', '$contactProcedure');
  return true;
}

function validateScales(value, path) {
  assertArray(value, path, { min: 3 });
  value.forEach((entry, i) => assertFiniteNumber(entry, `${path}[${i}]`, (n) => n > 0, 'positive'));
  if (!value.includes(1) || new Set(value).size !== value.length) throw new TypeError(`${path} must be unique and include 1.`);
}

export const DEFAULT_CONTACT_PROCEDURE = deepFreeze(createContactProcedureContract());
