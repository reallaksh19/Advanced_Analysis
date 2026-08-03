export {
  CANONICAL_ID_ORDER_ID,
  CANONICAL_NODE_ID_GRAMMAR_ID,
  CANONICAL_ORDERING_CONVENTION_SCHEMA,
  compareCanonicalIds,
  requireCanonicalNodeId,
} from './identifiers.js';

export {
  LINEAR_FEA_UNITS,
  LINEAR_FEA_UNITS_SCHEMA,
  requireLinearFeaUnits,
} from './units.js';

export {
  DOF_ORDER,
  ELEMENT_DOF_ORDER,
  ELEMENT_END_ACTION_CONVENTION_ID,
  ELEMENT_END_ORDER,
  ELEMENT_MATRIX_STORAGE_ID,
  ELEMENT_VECTOR_LAYOUT_ID,
  ELEMENT_VECTOR_LAYOUT_SCHEMA,
  END_ACTION_CONVENTION,
  END_ACTION_CONVENTION_SCHEMA,
  LINEAR_FEA_CONVENTIONS,
  LINEAR_FEA_CONVENTIONS_SCHEMA,
  LOCAL_RESULT_ORDER,
  NUMERIC_NORMALIZATION_CONVENTION_SCHEMA,
  NUMERIC_NORMALIZATION_ID,
  PRESCRIBED_DISPLACEMENT_CONVENTION_ID,
  REACTION_CONVENTION_ID,
  THERMAL_STRAIN_CONVENTION_ID,
  TRANSFORMATION_CONVENTION_ID,
  TRANSFORMATION_CONVENTION_SCHEMA,
  VECTOR_ORIENTATION_ID,
  dofIndex,
  elementDofIndex,
  elementMatrixIndex,
  endIndex,
  globalDofIdentity,
  normalizeLinearFeaNumber,
  requireLinearFeaConventions,
} from './conventions.js';

export {
  CONSTRAINT_BASES,
  CONSTRAINT_DOFS,
  INACTIVE_ANALYSIS_DOF_BEHAVIOR,
  LINEAR_FEA_FORMULATION_REGISTRY_VERSION,
  LINEAR_FEA_MODEL_SCHEMA,
  LINEAR_FEA_VALIDATION_PROFILE,
  LINEAR_FEA_VALIDATION_PROFILE_ID,
  MODEL_TOP_LEVEL_KEYS,
  PROHIBITED_NONLINEAR_BEHAVIORS,
  RECORD_KEYS,
  ROTATIONAL_DOFS,
  SUPPORTED_CONSTRAINT_BEHAVIORS,
  SUPPORTED_FORMULATIONS,
  TRANSLATIONAL_DOFS,
} from './model-schema.js';

export {
  canonicalizeDiagnosticEvidence,
  canonicalizeDiagnostics,
  canonicalizeLinearFeaModel,
  canonicalizeSourceEvidence,
} from './model-canonicalization.js';

export {
  canonicalDiagnosticEvidence,
  DIAGNOSTIC_SEVERITIES,
  LIMITATION_SEVERITIES,
} from './model-diagnostics.js';

export {
  computeEvidenceHash,
  computeSemanticHash,
  computeStiffnessStateHash,
  computeValidationProfileSemanticHash,
  evidenceProjection,
  semanticProjection,
  stiffnessStateProjection,
} from './model-hashes.js';

export {
  sealLinearFeaModel,
  validateLinearFeaModel,
} from './model-validation.js';
