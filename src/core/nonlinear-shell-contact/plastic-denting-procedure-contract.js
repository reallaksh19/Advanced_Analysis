import { assertArray, assertEnum, assertExactKeys, assertFiniteNumber, assertPlainData, assertString, clonePlain, deepFreeze, sealWithHash, verifySealedHash } from './contracts.js';

export const PLASTIC_DENTING_PROCEDURE_SCHEMA = 'nonlinear-shell-contact-plastic-denting-procedure/v1';
export const REQUIRED_PLASTIC_DENTING_METRICS = Object.freeze([
  'LOADED_DENT_DEPTH', 'PRESSURE_MAINTAINED_RESIDUAL_DENT', 'DEPRESSURIZED_RESIDUAL_DENT',
  'INDENTER_FORCE_PATH', 'LOCAL_DIAMETER_REDUCTION', 'SECOND_HARMONIC_OVALIZATION',
  'DENT_LENGTH_HALF_DEPTH', 'DENT_WIDTH_HALF_DEPTH', 'ROOT_OUTER_SURFACE_STRAIN',
  'ROOT_INNER_SURFACE_STRAIN', 'FLANK_OUTER_SURFACE_STRAIN', 'FLANK_INNER_SURFACE_STRAIN',
  'MAX_EQUIVALENT_PLASTIC_STRAIN', 'PLASTIC_ZONE_EXTENT', 'PLASTIC_DISSIPATION',
  'GLOBAL_EQUILIBRIUM', 'ENERGY_BALANCE',
]);
export const REQUIRED_PLASTIC_DENTING_BENCHMARKS = Object.freeze([
  'ELASTIC_REGRESSION_BELOW_YIELD', 'FIRST_YIELD_ONSET', 'MONOTONIC_PLASTIC_INDENTATION',
  'UNLOADING_PRESSURE_MAINTAINED_RESIDUAL', 'DEPRESSURIZED_RESIDUAL_DENT',
  'PLASTIC_ZONE_EXTENT', 'PRESSURE_SENSITIVITY', 'MESH_INCREMENT_MATERIAL_SENSITIVITY',
  'EXPERIMENTAL_FORCE_DENT_VALIDATION', 'EXPERIMENTAL_RESIDUAL_DENT_VALIDATION',
]);
export const REQUIRED_PLASTIC_LOAD_SEQUENCE = Object.freeze([
  'PRESSURE_PRELOAD', 'PRESSURE_HOLD', 'CONTACT_ESTABLISHMENT', 'INDENTATION',
  'MAXIMUM_INDENTATION_HOLD', 'INDENTER_UNLOAD', 'PRESSURE_MAINTAINED_RESIDUAL',
  'DEPRESSURIZATION',
]);

export function createPlasticDentingProcedureContract(input = {}) {
  const payload = {
    schema: PLASTIC_DENTING_PROCEDURE_SCHEMA,
    analysisClass: 'PLASTIC_LOCAL_PIPE_DENTING',
    geometryAuthority: 'THREE_DIMENSIONAL_LOCALIZED_SHELL',
    kinematics: 'FINITE_ROTATION_SMALL_STRAIN',
    loadControl: 'DISPLACEMENT_CONTROLLED_QUASI_STATIC',
    loadSequence: [...REQUIRED_PLASTIC_LOAD_SEQUENCE],
    baselineSurface: 'PRESSURE_ONLY_EQUILIBRIUM_SURFACE',
    constitutiveDependency: 'QUALIFIED_NC04_J2_MATERIAL_RECEIPT',
    elasticProcedureDependency: 'QUALIFIED_NC03_ELASTIC_DENTING_RECEIPT',
    contactProcedureDependency: 'QUALIFIED_NC02_CONTACT_RECEIPT',
    qualificationCellPolicy: 'NO_EXTRAPOLATION_OUTSIDE_REGISTERED_DIMENSIONLESS_CELLS',
    maximumStrainAuthority: 'NOT_ABOVE_MATERIAL_RECEIPT_LIMIT',
    plasticZoneThresholdPolicy: 'REGISTERED_CASE_THRESHOLD_WITH_EVIDENCE',
    meshRefinementRatios: [1, 0.5, 0.25],
    incrementRefinementRatios: [1, 0.5, 0.25],
    materialSensitivityScales: [0.9, 1, 1.1],
    elasticRegressionResidualLimitRatio: 0.01,
    globalEquilibriumResidualLimit: 0.01,
    energyImbalanceLimit: 0.03,
    meshSensitivityLimit: 0.03,
    incrementSensitivityLimit: 0.03,
    materialSensitivityLimit: 0.03,
    minimumPlasticDissipation: 0,
    requiredMetrics: [...REQUIRED_PLASTIC_DENTING_METRICS],
    requiredBenchmarks: [...REQUIRED_PLASTIC_DENTING_BENCHMARKS],
    collapseAuthority: false,
    failurePressureAuthority: false,
    damageAuthorized: false,
    fractureAuthorized: false,
    fatigueAuthorized: false,
    codeAssessmentAuthorized: false,
    productionExecutionAuthorized: false,
    ...clonePlain(input),
  };
  validatePlasticDentingProcedureContract(payload);
  return sealWithHash(payload, 'plasticDentingProcedureHash');
}

export function validatePlasticDentingProcedureContract(value) {
  assertPlainData(value, '$plasticDentingProcedure');
  assertExactKeys(value, [
    'schema', 'analysisClass', 'geometryAuthority', 'kinematics', 'loadControl',
    'loadSequence', 'baselineSurface', 'constitutiveDependency',
    'elasticProcedureDependency', 'contactProcedureDependency', 'qualificationCellPolicy',
    'maximumStrainAuthority', 'plasticZoneThresholdPolicy', 'meshRefinementRatios',
    'incrementRefinementRatios', 'materialSensitivityScales',
    'elasticRegressionResidualLimitRatio', 'globalEquilibriumResidualLimit',
    'energyImbalanceLimit', 'meshSensitivityLimit', 'incrementSensitivityLimit',
    'materialSensitivityLimit', 'minimumPlasticDissipation', 'requiredMetrics',
    'requiredBenchmarks', 'collapseAuthority', 'failurePressureAuthority',
    'damageAuthorized', 'fractureAuthorized', 'fatigueAuthorized',
    'codeAssessmentAuthorized', 'productionExecutionAuthorized',
  ], '$plasticDentingProcedure', ['plasticDentingProcedureHash']);
  assertEnum(value.schema,[PLASTIC_DENTING_PROCEDURE_SCHEMA],'$plasticDentingProcedure.schema');
  assertEnum(value.analysisClass,['PLASTIC_LOCAL_PIPE_DENTING'],'$plasticDentingProcedure.analysisClass');
  assertEnum(value.geometryAuthority,['THREE_DIMENSIONAL_LOCALIZED_SHELL'],'$plasticDentingProcedure.geometryAuthority');
  assertEnum(value.kinematics,['FINITE_ROTATION_SMALL_STRAIN'],'$plasticDentingProcedure.kinematics');
  assertEnum(value.loadControl,['DISPLACEMENT_CONTROLLED_QUASI_STATIC'],'$plasticDentingProcedure.loadControl');
  validateExactOrderedSet(value.loadSequence,REQUIRED_PLASTIC_LOAD_SEQUENCE,'$plasticDentingProcedure.loadSequence');
  assertEnum(value.baselineSurface,['PRESSURE_ONLY_EQUILIBRIUM_SURFACE'],'$plasticDentingProcedure.baselineSurface');
  assertEnum(value.constitutiveDependency,['QUALIFIED_NC04_J2_MATERIAL_RECEIPT'],'$plasticDentingProcedure.constitutiveDependency');
  assertEnum(value.elasticProcedureDependency,['QUALIFIED_NC03_ELASTIC_DENTING_RECEIPT'],'$plasticDentingProcedure.elasticProcedureDependency');
  assertEnum(value.contactProcedureDependency,['QUALIFIED_NC02_CONTACT_RECEIPT'],'$plasticDentingProcedure.contactProcedureDependency');
  assertEnum(value.qualificationCellPolicy,['NO_EXTRAPOLATION_OUTSIDE_REGISTERED_DIMENSIONLESS_CELLS'],'$plasticDentingProcedure.qualificationCellPolicy');
  assertEnum(value.maximumStrainAuthority,['NOT_ABOVE_MATERIAL_RECEIPT_LIMIT'],'$plasticDentingProcedure.maximumStrainAuthority');
  assertEnum(value.plasticZoneThresholdPolicy,['REGISTERED_CASE_THRESHOLD_WITH_EVIDENCE'],'$plasticDentingProcedure.plasticZoneThresholdPolicy');
  validateStrictlyDecreasingPositive(value.meshRefinementRatios,'$plasticDentingProcedure.meshRefinementRatios');
  validateStrictlyDecreasingPositive(value.incrementRefinementRatios,'$plasticDentingProcedure.incrementRefinementRatios');
  validateSensitivityScales(value.materialSensitivityScales,'$plasticDentingProcedure.materialSensitivityScales');
  for (const [field,upper] of [['elasticRegressionResidualLimitRatio',0.05],['globalEquilibriumResidualLimit',0.05],['energyImbalanceLimit',0.05],['meshSensitivityLimit',0.05],['incrementSensitivityLimit',0.05],['materialSensitivityLimit',0.05]]) assertFiniteNumber(value[field],`$plasticDentingProcedure.${field}`,(n)=>n>0&&n<=upper,'bounded positive ratio');
  assertFiniteNumber(value.minimumPlasticDissipation,'$plasticDentingProcedure.minimumPlasticDissipation',(n)=>n===0,'zero lower bound');
  validateRequiredSet(value.requiredMetrics,REQUIRED_PLASTIC_DENTING_METRICS,'$plasticDentingProcedure.requiredMetrics');
  validateRequiredSet(value.requiredBenchmarks,REQUIRED_PLASTIC_DENTING_BENCHMARKS,'$plasticDentingProcedure.requiredBenchmarks');
  for (const field of ['collapseAuthority','failurePressureAuthority','damageAuthorized','fractureAuthorized','fatigueAuthorized','codeAssessmentAuthorized','productionExecutionAuthorized']) if (value[field]!==false) throw new TypeError(`${field} is outside NC-05 authority.`);
  if (value.plasticDentingProcedureHash) verifySealedHash(value,'plasticDentingProcedureHash','$plasticDentingProcedure');
  return true;
}
function validateExactOrderedSet(value,required,path){assertArray(value,path,{min:required.length});if(value.length!==required.length||value.some((entry,index)=>entry!==required[index]))throw new TypeError(`${path} must preserve the canonical ordered sequence.`);}
function validateRequiredSet(value,required,path){assertArray(value,path,{min:required.length});value.forEach((entry,index)=>assertString(entry,`${path}[${index}]`));if(new Set(value).size!==value.length)throw new TypeError(`${path} must be unique.`);for(const id of required)if(!value.includes(id))throw new TypeError(`${path} is missing ${id}.`);}
function validateStrictlyDecreasingPositive(value,path){assertArray(value,path,{min:3});value.forEach((entry,index)=>assertFiniteNumber(entry,`${path}[${index}]`,(n)=>n>0,'positive'));for(let i=1;i<value.length;i+=1)if(!(value[i]<value[i-1]))throw new TypeError(`${path} must be strictly decreasing.`);}
function validateSensitivityScales(value,path){assertArray(value,path,{min:3});value.forEach((entry,index)=>assertFiniteNumber(entry,`${path}[${index}]`,(n)=>n>0,'positive'));if(!value.includes(1)||new Set(value).size!==value.length||!value.some((n)=>n<1)||!value.some((n)=>n>1))throw new TypeError(`${path} must include unique lower, nominal, and upper scales.`);}
export const DEFAULT_PLASTIC_DENTING_PROCEDURE=deepFreeze(createPlasticDentingProcedureContract());
