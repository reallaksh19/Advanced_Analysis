import {
  assertExactKeys,
  contractError,
  deepFreeze,
  requireAsciiIdentity,
} from './lafea-canvas/contracts.js';

export const DIAGNOSTIC_KEYS = Object.freeze([
  'severity',
  'code',
  'path',
  'entityId',
  'message',
]);
export const RENDER_REQUEST_KEYS = Object.freeze([
  'schema',
  'scene',
  'viewport',
  'mode',
  'displayedPrimitiveCount',
  'policy',
  'renderPacket',
  'selection',
]);
export const SELECTION_KEYS = Object.freeze([
  'sceneRevision',
  'sourceEntityId',
  'meshEntityId',
  'entityRole',
]);

export function currentLifecycleSourceHash(lifecycle, binding, diagnostics) {
  if (!lifecycle) {
    diagnostics.push(diagnostic(
      'INFO',
      'LAFEA_SCENE_SOURCE_HASH_UNAVAILABLE',
      'lifecycle',
      null,
      'No opaque lifecycle source hash is registered; source geometry remains display-only.',
    ));
    return null;
  }
  if (binding?.status !== 'CURRENT') {
    diagnostics.push(diagnostic(
      'WARNING',
      'LAFEA_SCENE_SOURCE_BINDING_NOT_CURRENT',
      'lifecycleBinding.status',
      null,
      `Lifecycle binding is ${binding?.status ?? 'MISSING'}; no source hash is promoted into the scene.`,
    ));
    return null;
  }
  const sourceHash = lifecycle?.source?.sourceHash;
  requireNullableHash(sourceHash, 'lifecycle.source.sourceHash');
  if (sourceHash === null) {
    throw contractError('LAFEA_CURRENT_LIFECYCLE_SOURCE_HASH_REQUIRED');
  }
  return sourceHash;
}

export function validateSourceSelection(value, scene) {
  assertExactKeys(value, SELECTION_KEYS, 'LAFEA_SELECTION_KEYS_INVALID');
  if (value.sceneRevision !== scene.sceneRevision) {
    throw contractError('LAFEA_SELECTION_SCENE_REVISION_MISMATCH');
  }
  if (value.meshEntityId !== null) {
    throw contractError('LAFEA_SOURCE_SELECTION_MESH_ID_FORBIDDEN');
  }
  if (value.sourceEntityId === null) {
    if (value.entityRole !== null) {
      throw contractError('LAFEA_EMPTY_SELECTION_ROLE_INVALID');
    }
    return deepFreeze(structuredClone(value));
  }
  requireAsciiIdentity(value.sourceEntityId, 'selection.sourceEntityId');
  if (value.entityRole !== 'SOURCE') {
    throw contractError('LAFEA_SOURCE_SELECTION_ROLE_INVALID');
  }
  if (!scene.sourcePrimitives.some(
    (row) => row.sourceEntityId === value.sourceEntityId,
  )) {
    throw contractError('LAFEA_SOURCE_SELECTION_ENTITY_NOT_IN_SCENE');
  }
  return deepFreeze(structuredClone(value));
}

export function emptySelection(sceneRevision) {
  return {
    sceneRevision,
    sourceEntityId: null,
    meshEntityId: null,
    entityRole: null,
  };
}

export function diagnostic(severity, code, path, entityId, message) {
  return deepFreeze({ severity, code, path, entityId, message });
}

export function validateDiagnostic(value) {
  assertExactKeys(value, DIAGNOSTIC_KEYS, 'LAFEA_SCENE_DIAGNOSTIC_KEYS_INVALID');
  if (!['INFO', 'WARNING', 'ERROR'].includes(value.severity)) {
    throw contractError('LAFEA_SCENE_DIAGNOSTIC_SEVERITY_INVALID');
  }
  requireAsciiIdentity(value.code, 'diagnostic.code');
  requireAsciiIdentity(value.path, 'diagnostic.path');
  if (value.entityId !== null) requireAsciiIdentity(value.entityId, 'diagnostic.entityId');
  if (typeof value.message !== 'string' || !value.message) {
    throw contractError('LAFEA_SCENE_DIAGNOSTIC_MESSAGE_REQUIRED');
  }
}

export function requireRevision(value) {
  if (!Number.isInteger(value) || value < 0) {
    throw contractError('LAFEA_SCENE_REVISION_INVALID', { value });
  }
}

export function requireNullableHash(value, field) {
  if (value !== null && (typeof value !== 'string' || !value.trim())) {
    throw contractError('LAFEA_OPAQUE_HASH_REQUIRED', { field, value });
  }
}

export function requireUnique(values, code) {
  if (new Set(values).size !== values.length) throw contractError(code);
}

export function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
