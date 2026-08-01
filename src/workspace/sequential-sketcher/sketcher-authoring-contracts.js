export const SKETCHER_AUTHORING_BRIDGE_SCHEMA =
  'SequentialSketcherAuthoringBridge.v1';
export const SKETCHER_AUTHORING_PREVIEW_SCHEMA =
  'SequentialSketcherTransientPreview.v1';
export const SKETCHER_AUTHORING_RECEIPT_SCHEMA =
  'SequentialSketcherAuthoringReceipt.v1';

export const BEGIN_KEYS = Object.freeze([
  'gestureId', 'pointerId', 'sourceEntityId',
]);
export const UPDATE_KEYS = Object.freeze(['pointerId', 'offset']);
export const ACCEPT_KEYS = Object.freeze(['pointerId']);
const VECTOR_KEYS = Object.freeze(['x', 'y', 'z']);

export function createAuthoringPreview(gesture) {
  return freeze({
    schema: SKETCHER_AUTHORING_PREVIEW_SCHEMA,
    gestureId: gesture.gestureId,
    pointerId: gesture.pointerId,
    sourceEntityId: gesture.sourceEntityId,
    datasetId: gesture.datasetId,
    datasetRevision: gesture.datasetRevision,
    operation: 'STRETCH_NODE',
    offset: cloneVector(gesture.offset),
    geometry: offsetGeometry(gesture.baseGeometry, gesture.offset),
    sourceMutation: false,
  });
}

export function sourceGeometry(entity) {
  const geometry = entity?.properties?.geometry ?? {};
  const result = {
    start: optionalPoint(geometry.start, 'geometry.start'),
    end: optionalPoint(geometry.end, 'geometry.end'),
    center: optionalPoint(geometry.center, 'geometry.center'),
  };
  if (Object.values(result).every((point) => point === null)) {
    throw bridgeError('SEQUENTIAL_AUTHORING_SOURCE_GEOMETRY_REQUIRED');
  }
  return freeze(result);
}

export function datasetIdentity(dataset) {
  requireIdentity(dataset?.datasetId, 'datasetId');
  const revision = dataset.version ?? 0;
  if (!Number.isInteger(revision) || revision < 0) {
    throw bridgeError('SEQUENTIAL_AUTHORING_DATASET_REVISION_INVALID');
  }
  return { datasetId: dataset.datasetId, datasetRevision: revision };
}

export function requireReadySnapshot(snapshot) {
  if (snapshot?.status !== 'ready' || !snapshot.dataset
    || !Array.isArray(snapshot.dataset.entities)) {
    throw bridgeError('SEQUENTIAL_AUTHORING_DATASET_REQUIRED');
  }
  return snapshot;
}

export function requireBridgeDependencies(value) {
  if (typeof value.gateway?.execute !== 'function'
    || typeof value.workspaceState?.getSnapshot !== 'function'
    || (value.eventTarget !== null
      && (typeof value.eventTarget.addEventListener !== 'function'
        || typeof value.eventTarget.removeEventListener !== 'function'))
    || (value.onPreviewChange !== null && typeof value.onPreviewChange !== 'function')
    || (value.onSelectionChange !== null && typeof value.onSelectionChange !== 'function')) {
    throw bridgeError('SEQUENTIAL_AUTHORING_BRIDGE_DEPENDENCIES_INVALID');
  }
}

export function assertExactKeys(value, expected, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...expected].sort())) {
    throw bridgeError(code);
  }
}

export function requireVector(value, field) {
  assertExactKeys(value, VECTOR_KEYS, 'SEQUENTIAL_AUTHORING_VECTOR_KEYS_INVALID');
  for (const axis of VECTOR_KEYS) {
    if (!Number.isFinite(value[axis])) {
      throw bridgeError('SEQUENTIAL_AUTHORING_VECTOR_VALUE_INVALID', { field, axis });
    }
  }
  return freeze(cloneVector(value));
}

export function cloneVector(value) {
  return { x: value.x, y: value.y, z: value.z };
}

export function zeroVector() {
  return freeze({ x: 0, y: 0, z: 0 });
}

export function requirePointerId(value) {
  if (!Number.isInteger(value) || value < 0) {
    throw bridgeError('SEQUENTIAL_AUTHORING_POINTER_ID_INVALID');
  }
}

export function requireIdentity(value, field) {
  if (typeof value !== 'string' || !value || !/^[\x20-\x7E]+$/u.test(value)) {
    throw bridgeError('SEQUENTIAL_AUTHORING_IDENTITY_INVALID', { field });
  }
}

export function clone(value) {
  return structuredClone(value);
}

export function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freeze);
  return Object.freeze(value);
}

export function bridgeError(code, evidence = {}) {
  const error = new TypeError(code);
  error.code = code;
  error.evidence = evidence;
  return error;
}

function optionalPoint(value, field) {
  if (value === null || value === undefined) return null;
  return requireVector(value, field);
}

function offsetGeometry(geometry, offset) {
  return freeze(Object.fromEntries(Object.entries(geometry).map(([key, point]) => [
    key,
    point ? {
      x: point.x + offset.x,
      y: point.y + offset.y,
      z: point.z + offset.z,
    } : null,
  ])));
}
