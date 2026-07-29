import { SharedAnalysisContractError } from '../shared-analysis-contract/errors.js';
import { deepFreeze } from '../shared-piping-model/immutable.js';
import { semanticHash } from '../shared-piping-model/canonical-json.js';

export const LINEAR_FEA_MATERIAL_TABLE_SCHEMA = 'fea-linear-material-table/v1';
export const LINEAR_FEA_MATERIAL_RESOLUTION_PROFILE_SCHEMA =
  'fea-linear-material-resolution-profile/v1';
export const LINEAR_FEA_MATERIAL_RESOLUTION_SCHEMA = 'fea-linear-material-resolution/v1';

export const LINEAR_MATERIAL_PROFILE_ID = 'LINEAR-MATERIAL-INTERPOLATION-R1';
export const LINEAR_MATERIAL_INTERPOLATION_RULE = 'LINEAR_BRACKET_INTERPOLATION_V1';
export const LINEAR_MATERIAL_EXACT_MATCH_RULE = 'IEEE754_EXACT_TEMPERATURE_MATCH_V1';
export const LINEAR_MATERIAL_EXTRAPOLATION_RULE = 'EXTRAPOLATION_PROHIBITED_V1';

export const MATERIAL_PROPERTY_KEYS = Object.freeze([
  'elasticModulus',
  'shearModulus',
  'poissonRatio',
  'massDensity',
  'thermalExpansionCoefficient',
]);

export const MATERIAL_TABLE_KEYS = Object.freeze([
  'schema', 'materialId', 'sourceEvidence', 'points', 'semanticHash',
]);
export const MATERIAL_SOURCE_EVIDENCE_KEYS = Object.freeze([
  'sourceId', 'sourceRevision', 'sourceSemanticHash',
]);
export const MATERIAL_POINT_KEYS = Object.freeze([
  'absoluteTemperature', ...MATERIAL_PROPERTY_KEYS,
]);
export const MATERIAL_PROFILE_KEYS = Object.freeze([
  'schema', 'profileId', 'interpolationRule', 'exactMatchRule',
  'extrapolationRule', 'semanticHash',
]);
export const MATERIAL_REQUEST_KEYS = Object.freeze([
  'materialStateId', 'materialId', 'evaluationTemperature',
]);
export const MATERIAL_RESOLUTION_KEYS = Object.freeze([
  'method', 'lowerTemperature', 'upperTemperature', 'interpolationFactor',
]);
export const MATERIAL_RESULT_KEYS = Object.freeze([
  'schema', 'profileId', 'profileSemanticHash', 'tableSemanticHash',
  'request', 'resolution', 'materialState', 'diagnostics',
  'semanticHash', 'evidenceHash',
]);

const PROFILE_MEANING = Object.freeze({
  schema: LINEAR_FEA_MATERIAL_RESOLUTION_PROFILE_SCHEMA,
  profileId: LINEAR_MATERIAL_PROFILE_ID,
  interpolationRule: LINEAR_MATERIAL_INTERPOLATION_RULE,
  exactMatchRule: LINEAR_MATERIAL_EXACT_MATCH_RULE,
  extrapolationRule: LINEAR_MATERIAL_EXTRAPOLATION_RULE,
});

export const LINEAR_FEA_MATERIAL_RESOLUTION_PROFILE = deepFreeze({
  ...PROFILE_MEANING,
  semanticHash: semanticHash(PROFILE_MEANING),
});

export class LinearFeaMaterialError extends SharedAnalysisContractError {
  constructor(message, code) {
    super(message, code);
    this.name = 'LinearFeaMaterialError';
  }
}
