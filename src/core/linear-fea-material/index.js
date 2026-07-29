export {
  LINEAR_FEA_MATERIAL_RESOLUTION_PROFILE,
  LINEAR_FEA_MATERIAL_RESOLUTION_PROFILE_SCHEMA,
  LINEAR_FEA_MATERIAL_RESOLUTION_SCHEMA,
  LINEAR_FEA_MATERIAL_TABLE_SCHEMA,
  LINEAR_MATERIAL_EXACT_MATCH_RULE,
  LINEAR_MATERIAL_EXTRAPOLATION_RULE,
  LINEAR_MATERIAL_INTERPOLATION_RULE,
  LINEAR_MATERIAL_PROFILE_ID,
  MATERIAL_PROPERTY_KEYS,
  LinearFeaMaterialError,
} from './material-contract.js';

export {
  canonicalizeMaterialDiagnostics,
  canonicalizeMaterialPoints,
  canonicalizeMaterialSourceEvidence,
  canonicalizeMaterialTable,
  compareMaterialText,
} from './material-canonicalization.js';

export {
  requireMaterialResolutionProfile,
  requireMaterialResolutionResult,
  resolveLinearFeaMaterialState,
  sealMaterialResolutionProfile,
} from './material-resolution.js';

export {
  canonicalMaterialSourceEvidence,
  canonicalMaterialTablePoints,
  computeMaterialProfileSemanticHash,
  computeMaterialResolutionEvidenceHash,
  computeMaterialResolutionSemanticHash,
  computeMaterialTableSemanticHash,
  materialProfileSemanticProjection,
  materialResolutionEvidenceProjection,
  materialResolutionSemanticProjection,
  materialTableSemanticProjection,
  requireMaterialResolutionRequest,
  requireMaterialTable,
  requireResolvedMaterialState,
  sealMaterialTable,
} from './material-validation.js';
