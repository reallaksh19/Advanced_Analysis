import { DOF_ORDER } from './conventions.js';

export const LINEAR_FEA_MODEL_SCHEMA = 'fea-linear-model/v1';
export const LINEAR_FEA_VALIDATION_PROFILE_ID = 'LINEAR-MODEL-VALIDATION-R1';
export const LINEAR_FEA_FORMULATION_REGISTRY_VERSION = 'PIPE-LINEAR-R1';
export const LINEAR_FEA_VALIDATION_PROFILE = Object.freeze({
  profileId: LINEAR_FEA_VALIDATION_PROFILE_ID,
  zeroLengthTolerance: 1e-10,
  unitVectorTolerance: 1e-12,
  orthogonalityTolerance: 1e-12,
  handednessTolerance: 1e-12,
});

export const SUPPORTED_FORMULATIONS = Object.freeze({
  'PIPE-LINEAR-R1': Object.freeze(['PIPE_FRAME3D_LINEAR_V1']),
});

/**
 * Analysis-only kinematic state. This removes a DOF from the solved partition
 * without creating a physical support reaction. The solver accepts it only
 * when the inactive DOF is exactly uncoupled from every retained DOF and
 * carries no applied load.
 */
export const INACTIVE_ANALYSIS_DOF_BEHAVIOR = 'INACTIVE_ANALYSIS_DOF';

export const SUPPORTED_CONSTRAINT_BEHAVIORS = Object.freeze([
  'FIXED',
  INACTIVE_ANALYSIS_DOF_BEHAVIOR,
  'LINEAR_SPRING',
  'PRESCRIBED_SLOT',
]);

export const PROHIBITED_NONLINEAR_BEHAVIORS = Object.freeze([
  'GAP',
  'FRICTION',
  'ONE_WAY',
  'LIFT_OFF',
  'CONTACT',
  'NONLINEAR_SPRING',
  'UNKNOWN',
]);

export const CONSTRAINT_BASES = Object.freeze(['GLOBAL']);
export const CONSTRAINT_DOFS = DOF_ORDER;
export const TRANSLATIONAL_DOFS = Object.freeze(DOF_ORDER.slice(0, 3));
export const ROTATIONAL_DOFS = Object.freeze(DOF_ORDER.slice(3));

export const MODEL_TOP_LEVEL_KEYS = Object.freeze([
  'schema',
  'modelIdentity',
  'modelRevision',
  'units',
  'conventions',
  'ancestry',
  'formulationRegistryVersion',
  'validationProfile',
  'nodes',
  'materialStates',
  'sectionStates',
  'elements',
  'constraints',
  'limitations',
  'diagnostics',
  'stiffnessStateHash',
  'semanticHash',
  'evidenceHash',
]);

export const RECORD_KEYS = Object.freeze({
  ancestry: Object.freeze([
    'sourceSemanticHash',
    'conditionedGeometrySemanticHash',
    'compilerProfileSemanticHash',
  ]),
  validationProfile: Object.freeze([
    'profileId',
    'zeroLengthTolerance',
    'unitVectorTolerance',
    'orthogonalityTolerance',
    'handednessTolerance',
    'semanticHash',
  ]),
  node: Object.freeze(['nodeId', 'position', 'sourceAncestry']),
  position: Object.freeze(['x', 'y', 'z']),
  nodeAncestry: Object.freeze([
    'conditionedNodeId',
    'sourceNodeIds',
    'sourceComponentIds',
    'creationBasis',
  ]),
  materialState: Object.freeze([
    'materialStateId',
    'materialId',
    'elasticModulus',
    'shearModulus',
    'poissonRatio',
    'massDensity',
    'thermalExpansionCoefficient',
    'evaluationTemperature',
    'sourceEvidence',
  ]),
  sectionState: Object.freeze([
    'sectionStateId',
    'area',
    'secondMomentY',
    'secondMomentZ',
    'polarMoment',
    'sourceEvidence',
  ]),
  element: Object.freeze([
    'elementId',
    'formulationId',
    'nodeI',
    'nodeJ',
    'materialStateId',
    'sectionStateId',
    'localAxes',
    'sourceAncestry',
  ]),
  localAxes: Object.freeze(['x', 'y', 'z', 'policyId', 'evidenceIdentity']),
  elementAncestry: Object.freeze(['conditionedSegmentId', 'sourceComponentId']),
  constraint: Object.freeze(['constraintId', 'nodeId', 'dof', 'behavior', 'basis', 'stiffness']),
  limitation: Object.freeze(['code', 'severity', 'scope', 'stiffnessRelevant', 'details']),
  diagnostic: Object.freeze([
    'severity',
    'code',
    'entityType',
    'entityId',
    'message',
    'evidence',
    'qualificationEvidenceIds',
  ]),
  diagnosticEvidence: Object.freeze([
    'evidenceId',
    'sourceId',
    'sourceRevision',
    'sourceSemanticHash',
  ]),
});
