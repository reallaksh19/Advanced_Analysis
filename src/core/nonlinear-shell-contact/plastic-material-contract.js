import { assertArray, assertEnum, assertExactKeys, assertFiniteNumber, assertPlainData, assertString, clonePlain, deepFreeze, sealWithHash, verifySealedHash } from './contracts.js';

export const PLASTIC_MATERIAL_CONTRACT_SCHEMA = 'nonlinear-shell-contact-plastic-material/v1';
export const REQUIRED_PLASTIC_MATERIAL_EVIDENCE = Object.freeze([
  'ELASTIC_CONSTANTS', 'LONGITUDINAL_MONOTONIC_COUPONS', 'CIRCUMFERENTIAL_MONOTONIC_COUPONS',
  'ENGINEERING_TO_TRUE_CONVERSION_PRENECKING', 'POSTNECKING_TRACEABILITY',
  'UNIAXIAL_RETURN_MAPPING', 'MULTIAXIAL_YIELD_SURFACE', 'CONSISTENT_TANGENT',
  'PLASTIC_DISSIPATION',
]);
export const REQUIRED_PLASTIC_MATERIAL_METRICS = Object.freeze([
  'YOUNGS_MODULUS', 'POISSON_RATIO', 'INITIAL_YIELD_STRESS',
  'TRUE_STRESS_EQUIVALENT_PLASTIC_STRAIN_CURVE', 'MAX_QUALIFIED_EQUIVALENT_PLASTIC_STRAIN',
  'REPLICATE_SCATTER', 'ORIENTATION_DIFFERENCE',
]);

export function createPlasticMaterialContract(input = {}) {
  const payload = {
    schema: PLASTIC_MATERIAL_CONTRACT_SCHEMA,
    constitutiveModel: 'J2_RATE_INDEPENDENT_SMALL_STRAIN_PLASTICITY',
    stressMeasure: 'TRUE_CAUCHY_STRESS',
    strainMeasure: 'LOGARITHMIC_EQUIVALENT_PLASTIC_STRAIN',
    yieldFunction: 'VON_MISES',
    flowRule: 'ASSOCIATIVE',
    hardeningModel: 'ISOTROPIC_TABULATED_FIRST_LOT',
    returnMapping: 'ELASTIC_PREDICTOR_RADIAL_RETURN',
    consistentAlgorithmicTangentRequired: true,
    minimumReplicatesPerOrientation: 3,
    requiredOrientations: ['LONGITUDINAL', 'CIRCUMFERENTIAL'],
    maximumQualifiedPlasticStrainPolicy: 'LIMITED_TO_TESTED_AND_VALIDATED_RANGE',
    postNeckingAuthority: 'REQUIRES_AREA_MEASUREMENT_OR_INVERSE_CALIBRATION',
    scatterPolicy: 'CHARACTERIZE_AND_BOUND',
    yieldSurfaceResidualLimit: 0.01,
    returnMappingResidualLimit: 1e-6,
    consistentTangentRelativeErrorLimit: 0.02,
    minimumPlasticDissipation: 0,
    kinematicHardeningAuthorized: false,
    combinedHardeningAuthorized: false,
    cyclicEvidenceRequiredForKinematic: true,
    temperatureDependenceAuthorized: false,
    rateDependenceAuthorized: false,
    anisotropyAuthorized: false,
    damageAuthorized: false,
    fractureAuthorized: false,
    requiredMetrics: [...REQUIRED_PLASTIC_MATERIAL_METRICS],
    requiredEvidence: [...REQUIRED_PLASTIC_MATERIAL_EVIDENCE],
    ...clonePlain(input),
  };
  validatePlasticMaterialContract(payload);
  return sealWithHash(payload, 'plasticMaterialContractHash');
}

export function validatePlasticMaterialContract(value) {
  assertPlainData(value, '$plasticMaterial');
  assertExactKeys(value, [
    'schema', 'constitutiveModel', 'stressMeasure', 'strainMeasure', 'yieldFunction',
    'flowRule', 'hardeningModel', 'returnMapping', 'consistentAlgorithmicTangentRequired',
    'minimumReplicatesPerOrientation', 'requiredOrientations',
    'maximumQualifiedPlasticStrainPolicy', 'postNeckingAuthority', 'scatterPolicy',
    'yieldSurfaceResidualLimit', 'returnMappingResidualLimit',
    'consistentTangentRelativeErrorLimit', 'minimumPlasticDissipation',
    'kinematicHardeningAuthorized', 'combinedHardeningAuthorized',
    'cyclicEvidenceRequiredForKinematic', 'temperatureDependenceAuthorized',
    'rateDependenceAuthorized', 'anisotropyAuthorized', 'damageAuthorized',
    'fractureAuthorized', 'requiredMetrics', 'requiredEvidence',
  ], '$plasticMaterial', ['plasticMaterialContractHash']);
  assertEnum(value.schema, [PLASTIC_MATERIAL_CONTRACT_SCHEMA], '$plasticMaterial.schema');
  assertEnum(value.constitutiveModel, ['J2_RATE_INDEPENDENT_SMALL_STRAIN_PLASTICITY'], '$plasticMaterial.constitutiveModel');
  assertEnum(value.stressMeasure, ['TRUE_CAUCHY_STRESS'], '$plasticMaterial.stressMeasure');
  assertEnum(value.strainMeasure, ['LOGARITHMIC_EQUIVALENT_PLASTIC_STRAIN'], '$plasticMaterial.strainMeasure');
  assertEnum(value.yieldFunction, ['VON_MISES'], '$plasticMaterial.yieldFunction');
  assertEnum(value.flowRule, ['ASSOCIATIVE'], '$plasticMaterial.flowRule');
  assertEnum(value.hardeningModel, ['ISOTROPIC_TABULATED_FIRST_LOT'], '$plasticMaterial.hardeningModel');
  assertEnum(value.returnMapping, ['ELASTIC_PREDICTOR_RADIAL_RETURN'], '$plasticMaterial.returnMapping');
  if (value.consistentAlgorithmicTangentRequired !== true) throw new TypeError('A consistent algorithmic tangent is mandatory.');
  assertFiniteNumber(value.minimumReplicatesPerOrientation, '$plasticMaterial.minimumReplicatesPerOrientation', (n)=>Number.isInteger(n)&&n>=3, 'integer at least three');
  validateExactSet(value.requiredOrientations, ['LONGITUDINAL','CIRCUMFERENTIAL'], '$plasticMaterial.requiredOrientations');
  assertEnum(value.maximumQualifiedPlasticStrainPolicy, ['LIMITED_TO_TESTED_AND_VALIDATED_RANGE'], '$plasticMaterial.maximumQualifiedPlasticStrainPolicy');
  assertEnum(value.postNeckingAuthority, ['REQUIRES_AREA_MEASUREMENT_OR_INVERSE_CALIBRATION'], '$plasticMaterial.postNeckingAuthority');
  assertEnum(value.scatterPolicy, ['CHARACTERIZE_AND_BOUND'], '$plasticMaterial.scatterPolicy');
  assertFiniteNumber(value.yieldSurfaceResidualLimit, '$plasticMaterial.yieldSurfaceResidualLimit', (n)=>n>0&&n<=0.05, 'bounded positive ratio');
  assertFiniteNumber(value.returnMappingResidualLimit, '$plasticMaterial.returnMappingResidualLimit', (n)=>n>0&&n<=1e-3, 'bounded positive residual');
  assertFiniteNumber(value.consistentTangentRelativeErrorLimit, '$plasticMaterial.consistentTangentRelativeErrorLimit', (n)=>n>0&&n<=0.05, 'bounded positive ratio');
  assertFiniteNumber(value.minimumPlasticDissipation, '$plasticMaterial.minimumPlasticDissipation', (n)=>n===0, 'zero lower bound');
  for (const field of ['kinematicHardeningAuthorized','combinedHardeningAuthorized','temperatureDependenceAuthorized','rateDependenceAuthorized','anisotropyAuthorized','damageAuthorized','fractureAuthorized']) if (value[field] !== false) throw new TypeError(`${field} is outside NC-04 authority.`);
  if (value.cyclicEvidenceRequiredForKinematic !== true) throw new TypeError('Cyclic evidence must remain mandatory for future kinematic authority.');
  validateRequiredSet(value.requiredMetrics, REQUIRED_PLASTIC_MATERIAL_METRICS, '$plasticMaterial.requiredMetrics');
  validateRequiredSet(value.requiredEvidence, REQUIRED_PLASTIC_MATERIAL_EVIDENCE, '$plasticMaterial.requiredEvidence');
  if (value.plasticMaterialContractHash) verifySealedHash(value, 'plasticMaterialContractHash', '$plasticMaterial');
  return true;
}
function validateExactSet(value, required, path) { assertArray(value,path,{min:required.length}); if (value.length!==required.length||new Set(value).size!==value.length||required.some((entry)=>!value.includes(entry))) throw new TypeError(`${path} must contain the exact required set.`); }
function validateRequiredSet(value, required, path) { assertArray(value,path,{min:required.length}); value.forEach((entry,index)=>assertString(entry,`${path}[${index}]`)); if (new Set(value).size!==value.length) throw new TypeError(`${path} must be unique.`); for (const id of required) if (!value.includes(id)) throw new TypeError(`${path} is missing ${id}.`); }
export const DEFAULT_PLASTIC_MATERIAL_CONTRACT = deepFreeze(createPlasticMaterialContract());
