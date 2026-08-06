export {
  LINEAR_PIPING_ANALYSIS_REQUEST_SCHEMA,
  LINEAR_PIPING_ANALYSIS_RESULT_SCHEMA,
  NOT_EVALUATED,
  PARENT_KEYS,
  REQUEST_KEYS,
  RESULT_KEYS,
  LinearPipingAnalysisConsumerError,
  computeResultChainEvidenceHash,
  computeResultChainSemanticHash,
  deriveLinearPipingParentSet,
  requireCurrentLinearPipingAnalysisResult,
  resultChainSemanticProjection,
  validateLinearPipingAnalysisRequest,
  validateLinearPipingAnalysisResult,
} from './contracts.js';

export { runLinearPipingAnalysis } from './consumer.js';

export {
  GRAVITY_MASS_SOURCE_NOT_IMPLEMENTED_CODE,
  GRAVITY_PIPE_WALL_EXPANSION_ID,
  expandPipeWallGravitySourceAuthorities,
} from './gravity-expansion.js';

export {
  THERMAL_TEMPERATURE_COLLISION_CODE,
  THERMAL_TEMPERATURE_MISSING_CODE,
  augmentPipingComponentTemperatureAuthorities,
} from './thermal-expansion-augmentation.js';

export {
  LINEAR_PIPING_SOURCE_ANALYSIS_REQUEST_SCHEMA,
  SOURCE_ANALYSIS_REQUEST_KEYS,
  SOURCE_AUTHORITY_KEYS,
  SOURCE_LOAD_CASE_INPUT_KEYS,
  compileLinearPipingSourceAnalysisContext,
  deriveLinearPipingSourceAuthoritySet,
  runLinearPipingAnalysisFromSourceAuthorities,
  validateLinearPipingSourceAnalysisRequest,
} from './source-orchestration.js';

export {
  LINEAR_PIPING_SOURCE_ANALYSIS_CONTEXT_SCHEMA,
  SOURCE_ANALYSIS_CONTEXT_KEYS,
  computeSourceAnalysisContextEvidenceHash,
  computeSourceAnalysisContextSemanticHash,
  requireLinearPipingSourceAnalysisContext,
  sealLinearPipingSourceAnalysisContext,
} from './source-analysis-context.js';

export {
  INPUTXML_ANALYSIS_REQUEST_KEYS,
  INPUTXML_ANALYSIS_RESULT_KEYS,
  INPUTXML_CONDITIONING_KEYS,
  INPUTXML_INGESTION_EVIDENCE_KEYS,
  INPUTXML_INGESTION_KEYS,
  INPUTXML_INGESTION_V2_KEYS,
  INPUTXML_SOURCE_KEYS,
  LINEAR_PIPING_INPUTXML_ANALYSIS_REQUEST_SCHEMA,
  LINEAR_PIPING_INPUTXML_ANALYSIS_REQUEST_V2_SCHEMA,
  LINEAR_PIPING_INPUTXML_ANALYSIS_RESULT_SCHEMA,
  LINEAR_PIPING_INPUTXML_SOURCE_SCHEMA,
  computeInputXmlAnalysisResultEvidenceHash,
  computeInputXmlAnalysisResultSemanticHash,
  computeInputXmlContentHash,
  computeInputXmlSourceSemanticHash,
  requireLinearPipingInputXmlAnalysisResult,
  requireLinearPipingInputXmlSource,
  sealLinearPipingInputXmlSource,
} from './inputxml-source-contract.js';

export {
  INPUTXML_LENGTH_UNIT_REGISTRY_ID,
  INPUTXML_UNIT_PROFILE_KEYS,
  INPUTXML_UNIT_RESULT_KEYS,
  LINEAR_PIPING_INPUTXML_UNIT_PROFILE_SCHEMA,
  LINEAR_PIPING_INPUTXML_UNIT_RESULT_SCHEMA,
  computeInputXmlUnitProfileSemanticHash,
  computeInputXmlUnitResultEvidenceHash,
  computeInputXmlUnitResultSemanticHash,
  inputXmlGeometryProjection,
  inputXmlLengthUnitDefinition,
  inputXmlUnitEvidenceProjection,
  requireLinearPipingInputXmlUnitProfile,
  requireLinearPipingInputXmlUnitResult,
  sealLinearPipingInputXmlUnitProfile,
} from './inputxml-unit-contract.js';

export { normalizeLinearPipingInputXmlGeometry } from './inputxml-unit-normalization.js';

export {
  INPUTXML_ANALYSIS_CONTEXT_KEYS,
  LINEAR_PIPING_INPUTXML_ANALYSIS_CONTEXT_SCHEMA,
  computeInputXmlAnalysisContextEvidenceHash,
  computeInputXmlAnalysisContextSemanticHash,
  requireLinearPipingInputXmlAnalysisContext,
  sealLinearPipingInputXmlAnalysisContext,
} from './inputxml-analysis-context.js';

// Raw InputXML parsing and sealed context compilation remain public for
// governed diagnostics/workbench custody. Legacy public solve exports remain
// absent; authorized execution is exposed only through the governed solve path.
export {
  compileLinearPipingInputXmlAnalysisContext,
  parseInputXmlModelHealthSource,
  validateLinearPipingInputXmlAnalysisRequest,
} from './inputxml-source-binding.js';

export {
  diagnoseInputXmlLinearModelHealth,
  diagnoseInputXmlModelHealthProximity,
  diagnoseInputXmlModelHealthTopology,
  prepareInputXmlLinearSolve,
} from './inputxml-model-health.js';

export {
  INPUTXML_LINEAR_MODEL_HEALTH_SCHEMA,
  requireInputXmlLinearModelHealth,
  sealInputXmlLinearModelHealth,
} from './inputxml-linear-model-health-contract.js';

export {
  DISCLOSED_GENERIC_ANALYZER_APPROXIMATION_PROFILE,
  INPUTXML_CAPABILITY_EFFECT_DISPOSITIONS,
  INPUTXML_FEATURE_DISPOSITIONS,
  INPUTXML_MODEL_HEALTH_CAPABILITIES,
  INPUTXML_MODEL_HEALTH_CAPABILITY_DEPENDENCIES,
  STRICT_INPUTXML_LINEAR_STATIC_PROFILE,
} from './inputxml-model-health-profile.js';

export {
  INPUTXML_LINEAR_SOLVE_PREPARATION_SCHEMA,
  requireInputXmlLinearSolvePreparation,
  sealInputXmlLinearSolvePreparation,
} from './inputxml-linear-solve-preparation-contract.js';

export {
  INPUTXML_GRAVITY_ACCELERATION,
  INPUTXML_INSTALLATION_TEMPERATURE,
  INPUTXML_LINEAR_SOLVE_PREPARATION_PROFILE_SCHEMA,
  InputXmlLinearSolvePreparationError,
  requireLinearPipingInputXmlSolvePreparationProfile,
} from './inputxml-linear-preparation-profile.js';

export {
  INPUTXML_THERMAL_EXPANSION_AUTHORITY_SCHEMA,
  resolveInputXmlThermalExpansionAuthority,
} from './inputxml-thermal-authority.js';

export { compileInputXmlLinearStructure } from './inputxml-linear-structural-preparation.js';
export {
  INPUTXML_LINEAR_STRUCTURAL_PREPARATION_SCHEMA,
  requireInputXmlLinearStructuralPreparation,
  sealInputXmlLinearStructuralPreparation,
} from './inputxml-linear-structural-preparation-contract.js';
export {
  INPUTXML_LINEAR_IDENTITY_CONDITIONING_PROFILE,
  INPUTXML_LINEAR_STRUCTURAL_PROFILE_SCHEMA,
  InputXmlLinearStructuralPreparationError,
  requireInputXmlLinearStructuralProfile,
} from './inputxml-linear-structural-profile.js';

export { compileInputXmlLinearPhysicalCases } from './inputxml-linear-physical-cases.js';
export {
  INPUTXML_LINEAR_PHYSICAL_CASE_PREPARATION_SCHEMA,
  requireInputXmlLinearPhysicalCasePreparation,
  sealInputXmlLinearPhysicalCasePreparation,
} from './inputxml-linear-physical-cases-contract.js';
export {
  INPUTXML_DEFAULT_GRAVITY_DIRECTION,
  INPUTXML_LINEAR_PHYSICAL_CASE_PROFILE_SCHEMA,
  inputXmlLinearPhysicalLoadCaseProfile,
  resolveInputXmlGravityDirection,
} from './inputxml-linear-physical-profile.js';

export { preflightInputXmlLinearSolve } from './inputxml-linear-stiffness-preflight.js';
export {
  INPUTXML_LINEAR_STIFFNESS_PREFLIGHT_SCHEMA,
  INPUTXML_LINEAR_STIFFNESS_PREFLIGHT_STATUSES,
  requireInputXmlLinearStiffnessPreflight,
  sealInputXmlLinearStiffnessPreflight,
  stiffnessAssessmentProjection,
} from './inputxml-linear-stiffness-preflight-contract.js';
export {
  INPUTXML_STIFFNESS_PREFLIGHT_PROFILE_ID,
  inputXmlStiffnessFrameElementProfile,
  inputXmlStiffnessSolverProfile,
} from './inputxml-linear-stiffness-profile.js';

export * from './inputxml-linear-prefea.js';
