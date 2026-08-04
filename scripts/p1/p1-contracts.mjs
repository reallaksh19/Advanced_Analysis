import { deepFreeze } from '../../src/core/shared-piping-model/immutable.js';

export const P1_QUALIFICATION_SCHEMA = 'non-fea-p1-qualification/v1';
export const P1_PROTECTED_MANIFEST_SCHEMA = 'non-fea-p1-protected-manifest/v1';
export const P1_INVALIDATION_EVIDENCE_SCHEMA = 'non-fea-p1-invalidation-evidence/v1';
export const P1_BROWSER_EVIDENCE_SCHEMA = 'non-fea-p1-browser-evidence/v1';
export const P0_OWNER_ACCEPTANCE_SCHEMA = 'non-fea-p0-owner-acceptance/v1';

export const P1_QUALIFICATION_STATUSES = deepFreeze([
  'BLOCKED', 'NO_THRESHOLD_VIOLATION', 'QUALIFIED_FOR_FIX',
]);
export const P1_VIEWPORT_ROUTES = deepFreeze([
  'WORKSPACE_STANDARD_VIEWPORT', 'TOPOLOGY_EDIT_VIEWPORT',
]);
export const P1_ACTION_IDS = deepFreeze([
  'INITIAL_IMPORT',
  'SELECTION_ONLY',
  'ORBIT_PAN',
  'MODEL_ZONE_CHANGE',
  'CALCULATED_EVENT',
  'MASTER_DATA_CHANGED',
  'PROJECT_DATA_CHANGED',
  'CLEAR_RELOAD',
  'CONTEXT_RESTORATION',
]);
export const P1_INVOCATION_IDS = deepFreeze([
  'NORMALIZATION_REQUEST',
  'ENGINEERING_MODEL_REBUILD',
  'VIEWPORT_PIPELINE',
  'RENDER_MODEL_INSTALL_REQUEST',
  'THREE_SCENE_INSTALL',
  'RENDER_FRAME',
]);
export const P1_REQUIRED_STAGE_OBSERVABILITY_IDS = deepFreeze([
  'SUPPORT_SITE_CONSTRUCTION',
  'ROUTE_CONSTRUCTION',
  'MODEL_ZONE_PROJECTION',
  'RESOLVED_GEOMETRY_CONSTRUCTION',
  'RENDER_MODEL_CONSTRUCTION',
  'THREE_MATERIALIZATION',
  'SCENE_INSTALLATION',
  'FIT',
]);
export const P1_BROWSER_STAGE_IDS = deepFreeze([
  'FILE_SELECTION_TO_FIRST_MEANINGFUL_FRAME',
  'POST_PARSE_MAIN_THREAD_TASK',
  'SELECTION',
  'ORBIT_PAN',
]);
export const P1_REQUIRED_P0_STAGE_IDS = deepFreeze([
  'FILE_READ',
  'UTF8_DECODE',
  'JSON_PARSE',
  'NORMALIZATION',
  'WORKSPACE_SNAPSHOT',
  'SUPPORT_SITES',
  'ROUTE_PARTITION',
  'MODEL_ZONE_PROJECTION',
  'RESOLVED_GEOMETRY',
  'RENDER_MODEL',
]);

export const P1_THRESHOLDS = deepFreeze({
  normalizationP95Ms: 3000,
  fileSelectionToFirstMeaningfulFrameMs: 5000,
  postParseMainThreadTaskMaxMs: 200,
  orbitPanP95Ms: 33,
  selectionP95Ms: 100,
  canvasCount: 1,
  webglCanvasCount: 1,
  renderOwnerCount: 1,
  pageErrorCount: 0,
  protectedManifestDifferenceCount: 0,
  unresolvedDiagnosticIncrease: 0,
});
export const P1_PROTECTED_FIELDS = deepFreeze([
  'sourceSha256',
  'sourcePackageHash',
  'datasetHash',
  'hierarchyHash',
  'sharedModelHash',
  'supportSiteHash',
  'routePartitionHash',
  'modelZoneHash',
  'resolvedGeometryHash',
  'renderModelHash',
  'diagnosticManifestHash',
  'canonicalObjectManifestHash',
  'pickTargetManifestHash',
  'sceneBoundsHash',
]);

export function codeUnitCompare(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
export function requireExactKeys(value, expectedKeys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object.`);
  }
  const actual = Object.keys(value).sort(codeUnitCompare);
  const expected = [...expectedKeys].sort(codeUnitCompare);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new TypeError(`${label} keys do not match the contract.`);
  }
  return value;
}
export function requireString(value, label) {
  if (typeof value !== 'string' || !value || value.trim() !== value) {
    throw new TypeError(`${label} must be a non-empty trimmed string.`);
  }
  return value;
}
export function requireNullableString(value, label) {
  if (value === null) return value;
  return requireString(value, label);
}
export function requireSha1(value, label) {
  if (typeof value !== 'string' || !/^[0-9a-f]{40}$/u.test(value)) {
    throw new TypeError(`${label} must be a lowercase Git SHA-1.`);
  }
  return value;
}
export function requireSha256(value, label) {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/u.test(value)) {
    throw new TypeError(`${label} must be a lowercase SHA-256.`);
  }
  return value;
}
export function requireSemanticHash(value, label) {
  if (typeof value !== 'string' || !/^fnv1a64:[0-9a-f]{16}$/u.test(value)) {
    throw new TypeError(`${label} must be a canonical FNV-1a semantic hash.`);
  }
  return value;
}
export function requireFiniteNonNegative(value, label) {
  if (!Number.isFinite(value) || value < 0) {
    throw new TypeError(`${label} must be a finite non-negative number.`);
  }
  return value;
}
export function requireNullableFiniteNonNegative(value, label) {
  if (value === null) return value;
  return requireFiniteNonNegative(value, label);
}
export function requireIntegerNonNegative(value, label) {
  if (!Number.isInteger(value) || value < 0) {
    throw new TypeError(`${label} must be a non-negative integer.`);
  }
  return value;
}
export function requireTimestamp(value, label = 'timestamp') {
  requireString(value, label);
  let canonical;
  try { canonical = new Date(value).toISOString(); }
  catch { throw new TypeError(`${label} is invalid.`); }
  if (canonical !== value) throw new TypeError(`${label} must be canonical ISO-8601.`);
  return value;
}
export function percentile(values, fraction) {
  if (!Array.isArray(values) || values.length === 0) return null;
  if (!Number.isFinite(fraction) || fraction < 0 || fraction > 1) {
    throw new RangeError('Percentile fraction must be within [0, 1].');
  }
  const ordered = values.map((value, index) => {
    requireFiniteNonNegative(value, `values[${index}]`);
    return value;
  }).sort((left, right) => left - right);
  return roundMilliseconds(ordered[Math.ceil(fraction * ordered.length) - 1] ?? ordered[0]);
}
export function roundMilliseconds(value) { return Number(Number(value).toFixed(3)); }
export function p1Failure(code, message, details = null) {
  requireString(code, 'failure.code');
  requireString(message, 'failure.message');
  return deepFreeze({ code, message, details });
}
