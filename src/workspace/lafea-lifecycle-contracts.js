import { requireLafeaStageRegistryEntry } from './lafea-stage-registry.js';

export const LAFEA_LIFECYCLE_SCHEMA = 'lafea-analysis-lifecycle/v1';
export const LAFEA_ARTIFACT_RECORD_SCHEMA = 'lafea-artifact-record/v1';
export const LAFEA_LIFECYCLE_EVENT_SCHEMA = 'lafea-lifecycle-event/v1';
export const LAFEA_ARTIFACT_REGISTRATION_SCHEMA = 'lafea-artifact-registration/v1';

export const LAFEA_ARTIFACT_KINDS = Object.freeze([
  'CANONICAL_MODEL',
  'ANALYSIS_GEOMETRY',
  'ANALYSIS_MESH',
  'EXECUTION',
  'RECOVERY',
  'CONVERGENCE',
  'CODE_ASSESSMENT',
  'REPORT_EVIDENCE',
]);

export const LAFEA_ARTIFACT_STATUSES = Object.freeze([
  'ABSENT',
  'CURRENT',
  'STALE',
  'REVALIDATION_REQUIRED',
  'BLOCKED',
]);

export const LAFEA_QUALIFICATION_STATES = Object.freeze([
  'NOT_EVALUATED',
  'PASS',
  'FAIL',
  'BLOCK',
]);

export const LAFEA_LIFECYCLE_CHANGE_CLASSES = Object.freeze([
  'MATERIAL_PROPERTY',
  'GEOMETRY',
  'LOAD_OR_BC',
  'MODEL_METADATA',
  'ANALYSIS_MESH_PROFILE',
  'RECOVERY_PROFILE',
  'CODE_PROFILE',
  'DISPLAY_MESH_DENSITY',
  'CONTOUR_PALETTE',
  'REPORT_RENDER_PROFILE',
]);

export const DISPLAY_CHANGE_CLASSES = Object.freeze(new Set([
  'DISPLAY_MESH_DENSITY',
  'CONTOUR_PALETTE',
  'REPORT_RENDER_PROFILE',
]));
export const SOURCE_CHANGE_CLASSES = Object.freeze(new Set([
  'MATERIAL_PROPERTY',
  'GEOMETRY',
  'LOAD_OR_BC',
  'MODEL_METADATA',
]));

export const LIFECYCLE_DEFINITIONS = deepFreeze({
  CANONICAL_MODEL: definition(
    ['sourceHash'],
    [],
    [],
    [
      'ANALYSIS_GEOMETRY', 'ANALYSIS_MESH', 'EXECUTION', 'RECOVERY',
      'CONVERGENCE', 'CODE_ASSESSMENT', 'REPORT_EVIDENCE',
    ],
  ),
  ANALYSIS_GEOMETRY: definition(
    ['sourceHash', 'canonicalModelHash'],
    [],
    [['CANONICAL_MODEL', 'PASS']],
    [
      'ANALYSIS_MESH', 'EXECUTION', 'RECOVERY', 'CONVERGENCE',
      'CODE_ASSESSMENT', 'REPORT_EVIDENCE',
    ],
  ),
  ANALYSIS_MESH: definition(
    ['analysisGeometryHash', 'meshProfileHash'],
    ['meshProfileHash'],
    [['ANALYSIS_GEOMETRY', 'PASS']],
    [
      'EXECUTION', 'RECOVERY', 'CONVERGENCE', 'CODE_ASSESSMENT',
      'REPORT_EVIDENCE',
    ],
  ),
  EXECUTION: definition(
    [
      'canonicalModelHash', 'meshHash', 'physicalLoadCaseHash',
      'solverProfileHash',
    ],
    ['physicalLoadCaseHash', 'solverProfileHash'],
    [['CANONICAL_MODEL', 'PASS'], ['ANALYSIS_MESH', 'PASS']],
    ['RECOVERY', 'CONVERGENCE', 'CODE_ASSESSMENT', 'REPORT_EVIDENCE'],
  ),
  RECOVERY: definition(
    ['executionHash', 'meshHash', 'recoveryProfileHash'],
    ['recoveryProfileHash'],
    [['EXECUTION', 'PASS'], ['ANALYSIS_MESH', 'PASS']],
    ['CONVERGENCE', 'CODE_ASSESSMENT', 'REPORT_EVIDENCE'],
  ),
  CONVERGENCE: definition(
    ['recoveryHash', 'recoverySetHash', 'convergenceProfileHash'],
    ['recoverySetHash', 'convergenceProfileHash'],
    [['RECOVERY', 'PASS']],
    ['CODE_ASSESSMENT', 'REPORT_EVIDENCE'],
  ),
  CODE_ASSESSMENT: definition(
    [
      'sourceHash', 'canonicalModelHash', 'meshHash', 'executionHash',
      'recoveryHash', 'convergenceHash', 'codeProfileHash',
      'allowableSourceHash', 'classificationProfileHash',
    ],
    ['codeProfileHash', 'allowableSourceHash', 'classificationProfileHash'],
    [['RECOVERY', 'PASS'], ['CONVERGENCE', 'PASS']],
    ['REPORT_EVIDENCE'],
  ),
  REPORT_EVIDENCE: definition(
    [
      'sourceHash', 'canonicalModelHash', 'meshHash', 'executionHash',
      'recoveryHash', 'convergenceHash', 'codeAssessmentHash',
      'reportProfileHash',
    ],
    ['reportProfileHash'],
    [],
    [],
  ),
});

export const LIFECYCLE_KEYS = Object.freeze([
  'schema', 'stageId', 'source', 'artifacts', 'display', 'lastEvent',
  'lastRegistration', 'diagnostics',
]);
export const SOURCE_KEYS = Object.freeze(['status', 'sourceHash']);
export const DISPLAY_KEYS = Object.freeze([
  'displayMeshDensityHash', 'contourPaletteHash', 'reportRenderProfileHash',
]);
export const EVENT_KEYS = Object.freeze([
  'schema', 'eventId', 'stageId', 'changeClass', 'previousSourceHash',
  'currentSourceHash', 'profileHash', 'originRef',
]);
export const RECORD_KEYS = Object.freeze([
  'schema', 'stageId', 'kind', 'status', 'artifactHash', 'parentHashes',
  'qualification', 'producerRef', 'diagnostics',
]);
export const REGISTRATION_KEYS = Object.freeze([
  'schema', 'registrationId', 'stageId', 'kind', 'artifactHash',
  'status', 'producerRef',
]);
export const DIAGNOSTIC_KEYS = Object.freeze([
  'severity', 'code', 'path', 'message',
]);

export function requireDefinition(kind) {
  if (!LAFEA_ARTIFACT_KINDS.includes(kind)) {
    throw new TypeError(`Unsupported LAFEA artifact kind: ${kind}.`);
  }
  return LIFECYCLE_DEFINITIONS[kind];
}

export function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object.`);
  }
  const actual = Object.keys(value).sort();
  const required = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(required)) {
    throw new TypeError(`${label} exact-key contract mismatch.`);
  }
}

export function requireHash(value, label) {
  requireText(value, label);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:+/-]*$/u.test(value)) {
    throw new TypeError(`${label} is not a valid opaque hash reference.`);
  }
}

export function requireNullableHash(value, label) {
  if (value !== null) requireHash(value, label);
}

export function requireText(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new TypeError(`${label} is required.`);
  }
}

export function requireStage(stageId) {
  return requireLafeaStageRegistryEntry(stageId);
}

export function lifecycleError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

export function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

function definition(parentKeys, opaqueParentKeys, prerequisites, descendants) {
  return { parentKeys, opaqueParentKeys, prerequisites, descendants };
}
