import { assertArray, assertEnum, assertExactKeys, assertFiniteNumber, assertPlainData, assertString, clonePlain, deepFreeze, sealWithHash, verifySealedHash } from './contracts.js';

export const ELASTIC_DENTING_PROCEDURE_SCHEMA = 'nonlinear-shell-contact-elastic-denting-procedure/v1';
export const REQUIRED_ELASTIC_DENTING_METRICS = Object.freeze([
  'LOADED_DENT_DEPTH', 'PRESSURE_MAINTAINED_RECOVERED_DENT', 'DEPRESSURIZED_RECOVERED_DENT',
  'INDENTER_FORCE_PATH', 'LOCAL_DIAMETER_REDUCTION', 'SECOND_HARMONIC_OVALIZATION',
  'DENT_LENGTH_HALF_DEPTH', 'DENT_WIDTH_HALF_DEPTH', 'OUTER_SURFACE_STRAIN_SCREEN',
  'INNER_SURFACE_STRAIN_SCREEN', 'GLOBAL_EQUILIBRIUM', 'EXTERNAL_INTERNAL_CONTACT_WORK_BALANCE',
]);
export const REQUIRED_ELASTIC_DENTING_BENCHMARKS = Object.freeze([
  'PRESSURE_PRELOAD_EQUILIBRIUM', 'DISPLACEMENT_CONTROLLED_INDENTATION',
  'ELASTIC_UNLOADING_RECOVERY', 'PRESSURE_SENSITIVITY', 'BOUNDARY_EXTENT_SENSITIVITY',
  'MESH_CONVERGENCE', 'INCREMENT_CONVERGENCE', 'FORCE_DENT_PATH_REPRODUCIBILITY',
]);
export const REQUIRED_ELASTIC_LOAD_SEQUENCE = Object.freeze([
  'PRESSURE_PRELOAD', 'PRESSURE_HOLD', 'CONTACT_ESTABLISHMENT', 'INDENTATION',
  'MAXIMUM_INDENTATION_HOLD', 'INDENTER_UNLOAD', 'PRESSURE_MAINTAINED_RECOVERY',
  'OPTIONAL_DEPRESSURIZATION',
]);

export function createElasticDentingProcedureContract(input = {}) {
  const payload = {
    schema: ELASTIC_DENTING_PROCEDURE_SCHEMA,
    analysisClass: 'ELASTIC_LOCAL_PIPE_DENTING',
    geometryAuthority: 'THREE_DIMENSIONAL_LOCALIZED_SHELL',
    constitutiveAuthority: 'LINEAR_ELASTIC_ONLY',
    loadControl: 'DISPLACEMENT_CONTROLLED_QUASI_STATIC',
    loadSequence: [...REQUIRED_ELASTIC_LOAD_SEQUENCE],
    baselineSurface: 'PRESSURE_ONLY_EQUILIBRIUM_SURFACE',
    qualificationCellPolicy: 'NO_EXTRAPOLATION_OUTSIDE_REGISTERED_DIMENSIONLESS_CELLS',
    boundaryScale: 'SQRT_RADIUS_TIMES_THICKNESS',
    boundaryExtensionScales: [4, 6, 8],
    meshRefinementRatios: [1, 0.5, 0.25],
    incrementRefinementRatios: [1, 0.5, 0.25],
    elasticRecoveryResidualLimitRatio: 0.01,
    globalEquilibriumResidualLimit: 0.01,
    energyImbalanceLimit: 0.02,
    boundarySensitivityLimit: 0.02,
    meshSensitivityLimit: 0.02,
    incrementSensitivityLimit: 0.02,
    requiredMetrics: [...REQUIRED_ELASTIC_DENTING_METRICS],
    requiredBenchmarks: [...REQUIRED_ELASTIC_DENTING_BENCHMARKS],
    rawMaximumContactPressureAuthority: 'DIAGNOSTIC_ONLY',
    plasticityAuthorized: false,
    damageAuthorized: false,
    fractureAuthorized: false,
    fatigueAuthorized: false,
    codeAssessmentAuthorized: false,
    ...clonePlain(input),
  };
  validateElasticDentingProcedureContract(payload);
  return sealWithHash(payload, 'elasticDentingProcedureHash');
}

export function validateElasticDentingProcedureContract(value) {
  assertPlainData(value, '$elasticDentingProcedure');
  assertExactKeys(value, [
    'schema', 'analysisClass', 'geometryAuthority', 'constitutiveAuthority', 'loadControl',
    'loadSequence', 'baselineSurface', 'qualificationCellPolicy', 'boundaryScale',
    'boundaryExtensionScales', 'meshRefinementRatios', 'incrementRefinementRatios',
    'elasticRecoveryResidualLimitRatio', 'globalEquilibriumResidualLimit',
    'energyImbalanceLimit', 'boundarySensitivityLimit', 'meshSensitivityLimit',
    'incrementSensitivityLimit', 'requiredMetrics', 'requiredBenchmarks',
    'rawMaximumContactPressureAuthority', 'plasticityAuthorized', 'damageAuthorized',
    'fractureAuthorized', 'fatigueAuthorized', 'codeAssessmentAuthorized',
  ], '$elasticDentingProcedure', ['elasticDentingProcedureHash']);
  assertEnum(value.schema, [ELASTIC_DENTING_PROCEDURE_SCHEMA], '$elasticDentingProcedure.schema');
  assertEnum(value.analysisClass, ['ELASTIC_LOCAL_PIPE_DENTING'], '$elasticDentingProcedure.analysisClass');
  assertEnum(value.geometryAuthority, ['THREE_DIMENSIONAL_LOCALIZED_SHELL'], '$elasticDentingProcedure.geometryAuthority');
  assertEnum(value.constitutiveAuthority, ['LINEAR_ELASTIC_ONLY'], '$elasticDentingProcedure.constitutiveAuthority');
  assertEnum(value.loadControl, ['DISPLACEMENT_CONTROLLED_QUASI_STATIC'], '$elasticDentingProcedure.loadControl');
  validateExactOrderedSet(value.loadSequence, REQUIRED_ELASTIC_LOAD_SEQUENCE, '$elasticDentingProcedure.loadSequence');
  assertEnum(value.baselineSurface, ['PRESSURE_ONLY_EQUILIBRIUM_SURFACE'], '$elasticDentingProcedure.baselineSurface');
  assertEnum(value.qualificationCellPolicy, ['NO_EXTRAPOLATION_OUTSIDE_REGISTERED_DIMENSIONLESS_CELLS'], '$elasticDentingProcedure.qualificationCellPolicy');
  assertEnum(value.boundaryScale, ['SQRT_RADIUS_TIMES_THICKNESS'], '$elasticDentingProcedure.boundaryScale');
  validateStrictlyIncreasingPositive(value.boundaryExtensionScales, '$elasticDentingProcedure.boundaryExtensionScales');
  validateStrictlyDecreasingPositive(value.meshRefinementRatios, '$elasticDentingProcedure.meshRefinementRatios');
  validateStrictlyDecreasingPositive(value.incrementRefinementRatios, '$elasticDentingProcedure.incrementRefinementRatios');
  for (const [field, upper] of [
    ['elasticRecoveryResidualLimitRatio', 0.05], ['globalEquilibriumResidualLimit', 0.05],
    ['energyImbalanceLimit', 0.05], ['boundarySensitivityLimit', 0.05],
    ['meshSensitivityLimit', 0.05], ['incrementSensitivityLimit', 0.05],
  ]) assertFiniteNumber(value[field], `$elasticDentingProcedure.${field}`, (n) => n > 0 && n <= upper, 'bounded positive ratio');
  validateRequiredSet(value.requiredMetrics, REQUIRED_ELASTIC_DENTING_METRICS, '$elasticDentingProcedure.requiredMetrics');
  validateRequiredSet(value.requiredBenchmarks, REQUIRED_ELASTIC_DENTING_BENCHMARKS, '$elasticDentingProcedure.requiredBenchmarks');
  assertEnum(value.rawMaximumContactPressureAuthority, ['DIAGNOSTIC_ONLY'], '$elasticDentingProcedure.rawMaximumContactPressureAuthority');
  for (const field of ['plasticityAuthorized', 'damageAuthorized', 'fractureAuthorized', 'fatigueAuthorized', 'codeAssessmentAuthorized']) {
    if (value[field] !== false) throw new TypeError(`${field} is outside NC-03 authority.`);
  }
  if (value.elasticDentingProcedureHash) verifySealedHash(value, 'elasticDentingProcedureHash', '$elasticDentingProcedure');
  return true;
}

function validateExactOrderedSet(value, required, path) { assertArray(value, path, { min: required.length }); if (value.length !== required.length || value.some((entry, index) => entry !== required[index])) throw new TypeError(`${path} must preserve the canonical ordered sequence.`); }
function validateRequiredSet(value, required, path) { assertArray(value, path, { min: required.length }); value.forEach((entry,index)=>assertString(entry,`${path}[${index}]`)); if (new Set(value).size !== value.length) throw new TypeError(`${path} must be unique.`); for (const id of required) if (!value.includes(id)) throw new TypeError(`${path} is missing ${id}.`); }
function validateStrictlyIncreasingPositive(value, path) { assertArray(value, path, { min: 3 }); value.forEach((entry,index)=>assertFiniteNumber(entry,`${path}[${index}]`,(n)=>n>0,'positive')); for (let i=1;i<value.length;i+=1) if (!(value[i] > value[i-1])) throw new TypeError(`${path} must be strictly increasing.`); }
function validateStrictlyDecreasingPositive(value, path) { assertArray(value, path, { min: 3 }); value.forEach((entry,index)=>assertFiniteNumber(entry,`${path}[${index}]`,(n)=>n>0,'positive')); for (let i=1;i<value.length;i+=1) if (!(value[i] < value[i-1])) throw new TypeError(`${path} must be strictly decreasing.`); }
export const DEFAULT_ELASTIC_DENTING_PROCEDURE = deepFreeze(createElasticDentingProcedureContract());
