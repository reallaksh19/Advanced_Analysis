/**
 * Revision-bound sequential SVG authoring bridge.
 *
 * The bridge owns transient gesture state only. Source mutations remain
 * controller/gateway-owned and occur through one accepted command.
 */

export const SKETCHER_AUTHORING_BRIDGE_SCHEMA =
  'SequentialSketcherAuthoringBridge.v1';
export const SKETCHER_AUTHORING_PREVIEW_SCHEMA =
  'SequentialSketcherTransientPreview.v1';
export const SKETCHER_AUTHORING_RECEIPT_SCHEMA =
  'SequentialSketcherAuthoringReceipt.v1';

const BEGIN_KEYS = Object.freeze([
  'gestureId', 'pointerId', 'sourceEntityId',
]);
const UPDATE_KEYS = Object.freeze(['pointerId', 'offset']);
const ACCEPT_KEYS = Object.freeze(['pointerId']);
const VECTOR_KEYS = Object.freeze(['x', 'y', 'z']);

export function createSketcherAuthoringBridge(options = {}) {
  const {
    gateway,
    workspaceState,
    eventTarget = null,
    onPreviewChange = null,
    onSelectionChange = null,
  } = options;
  requireDependencies({
    gateway,
    workspaceState,
    eventTarget,
    onPreviewChange,
    onSelectionChange,
  });

  let active = null;
  let preview = null;
  let selection = null;
  let acceptedCommandCount = 0;
  let destroyed = false;

  const handleKeydown = (event) => {
    if (event?.key === 'Escape') cancelGesture('ESCAPE');
  };
  const handlePointerCancel = (event) => {
    if (!active) return;
    if (event?.pointerId === undefined || event.pointerId === active.pointerId) {
      cancelGesture('POINTER_CANCEL');
    }
  };

  eventTarget?.addEventListener('keydown', handleKeydown);
  eventTarget?.addEventListener('pointercancel', handlePointerCancel);

  function beginStretchGesture(value) {
    requireLive();
    assertExactKeys(value, BEGIN_KEYS, 'SEQUENTIAL_AUTHORING_BEGIN_KEYS_INVALID');
    if (active) throw bridgeError('SEQUENTIAL_AUTHORING_GESTURE_ALREADY_ACTIVE');
    requireIdentity(value.gestureId, 'gestureId');
    requirePointerId(value.pointerId);
    requireIdentity(value.sourceEntityId, 'sourceEntityId');

    const snapshot = requireReadySnapshot(workspaceState.getSnapshot());
    const entity = snapshot.dataset.entities.find(
      (candidate) => candidate.entityId === value.sourceEntityId,
    );
    if (!entity) {
      throw bridgeError('SEQUENTIAL_AUTHORING_SOURCE_ENTITY_NOT_FOUND', {
        sourceEntityId: value.sourceEntityId,
      });
    }

    const identity = datasetIdentity(snapshot.dataset);
    active = {
      gestureId: value.gestureId,
      pointerId: value.pointerId,
      sourceEntityId: value.sourceEntityId,
      datasetRef: snapshot.dataset,
      datasetId: identity.datasetId,
      datasetRevision: identity.datasetRevision,
      baseGeometry: sourceGeometry(entity),
      offset: zeroVector(),
    };
    workspaceState.selectEntity?.(value.sourceEntityId);
    selection = freeze({
      schema: 'SequentialEngineeringSelection.v1',
      datasetId: identity.datasetId,
      entityId: value.sourceEntityId,
      entityRole: 'SOURCE',
    });
    preview = createPreview(active);
    onSelectionChange?.(selection);
    onPreviewChange?.(preview);
    return getState();
  }

  function updateStretchGesture(value) {
    requireLive();
    assertExactKeys(value, UPDATE_KEYS, 'SEQUENTIAL_AUTHORING_UPDATE_KEYS_INVALID');
    const gesture = requireActive(value.pointerId);
    requireCurrentDataset(gesture);
    gesture.offset = requireVector(value.offset, 'offset');
    preview = createPreview(gesture);
    onPreviewChange?.(preview);
    return preview;
  }

  function acceptGesture(value) {
    requireLive();
    assertExactKeys(value, ACCEPT_KEYS, 'SEQUENTIAL_AUTHORING_ACCEPT_KEYS_INVALID');
    const gesture = requireActive(value.pointerId);
    requireCurrentDataset(gesture);
    const command = freeze({
      op: 'STRETCH_NODE',
      targetEntityId: gesture.sourceEntityId,
      offset: cloneVector(gesture.offset),
    });
    const receiptBasis = {
      gestureId: gesture.gestureId,
      pointerId: gesture.pointerId,
      sourceEntityId: gesture.sourceEntityId,
      datasetId: gesture.datasetId,
      datasetRevision: gesture.datasetRevision,
      command,
    };

    clearActive();
    const gatewayResult = gateway.execute(command);
    if (gatewayResult?.status !== 'applied') {
      throw bridgeError('SEQUENTIAL_AUTHORING_COMMAND_REJECTED', {
        reason: gatewayResult?.reason ?? null,
      });
    }
    acceptedCommandCount += 1;
    return freeze({
      schema: SKETCHER_AUTHORING_RECEIPT_SCHEMA,
      status: 'APPLIED',
      ...receiptBasis,
      commandCount: 1,
      gatewayResult: clone(gatewayResult),
    });
  }

  function cancelGesture(reason = 'CANCELLED') {
    if (destroyed || !active) {
      return freeze({ status: 'NO_ACTIVE_GESTURE', reason });
    }
    requireIdentity(reason, 'reason');
    const cancelled = freeze({
      status: 'CANCELLED',
      reason,
      gestureId: active.gestureId,
      sourceEntityId: active.sourceEntityId,
      datasetId: active.datasetId,
      datasetRevision: active.datasetRevision,
    });
    clearActive();
    return cancelled;
  }

  function handleWorkspaceSnapshot(snapshot) {
    requireLive();
    if (active && (snapshot?.status !== 'ready'
      || snapshot.dataset !== active.datasetRef)) {
      return cancelGesture('DATASET_CHANGED');
    }
    return getState();
  }

  function getState() {
    return freeze({
      schema: SKETCHER_AUTHORING_BRIDGE_SCHEMA,
      status: destroyed ? 'DESTROYED' : active ? 'ACTIVE' : 'IDLE',
      acceptedCommandCount,
      selection,
      preview,
      activeGesture: active ? {
        gestureId: active.gestureId,
        pointerId: active.pointerId,
        sourceEntityId: active.sourceEntityId,
        datasetId: active.datasetId,
        datasetRevision: active.datasetRevision,
      } : null,
    });
  }

  function requireActive(pointerId) {
    requirePointerId(pointerId);
    if (!active) throw bridgeError('SEQUENTIAL_AUTHORING_GESTURE_NOT_ACTIVE');
    if (active.pointerId !== pointerId) {
      throw bridgeError('SEQUENTIAL_AUTHORING_POINTER_ID_MISMATCH');
    }
    return active;
  }

  function requireCurrentDataset(gesture) {
    const snapshot = workspaceState.getSnapshot();
    if (snapshot?.status !== 'ready' || snapshot.dataset !== gesture.datasetRef) {
      const evidence = {
        expectedDatasetId: gesture.datasetId,
        actualDatasetId: snapshot?.dataset?.datasetId ?? null,
      };
      cancelGesture('STALE_DATASET_REVISION');
      throw bridgeError('SEQUENTIAL_AUTHORING_STALE_DATASET_REVISION', evidence);
    }
  }

  function clearActive() {
    active = null;
    preview = null;
    onPreviewChange?.(null);
  }

  return Object.freeze({
    schema: SKETCHER_AUTHORING_BRIDGE_SCHEMA,
    beginStretchGesture,
    updateStretchGesture,
    acceptGesture,
    cancelGesture,
    handleWorkspaceSnapshot,
    getState,
    destroy() {
      if (destroyed) return;
      clearActive();
      eventTarget?.removeEventListener('keydown', handleKeydown);
      eventTarget?.removeEventListener('pointercancel', handlePointerCancel);
      destroyed = true;
    },
  });
}

function createPreview(gesture) {
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

function sourceGeometry(entity) {
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

function datasetIdentity(dataset) {
  requireIdentity(dataset?.datasetId, 'datasetId');
  const revision = dataset.version ?? 0;
  if (!Number.isInteger(revision) || revision < 0) {
    throw bridgeError('SEQUENTIAL_AUTHORING_DATASET_REVISION_INVALID');
  }
  return { datasetId: dataset.datasetId, datasetRevision: revision };
}

function requireReadySnapshot(snapshot) {
  if (snapshot?.status !== 'ready' || !snapshot.dataset
    || !Array.isArray(snapshot.dataset.entities)) {
    throw bridgeError('SEQUENTIAL_AUTHORING_DATASET_REQUIRED');
  }
  return snapshot;
}

function requireDependencies(value) {
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

function assertExactKeys(value, expected, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...expected].sort())) {
    throw bridgeError(code);
  }
}

function optionalPoint(value, field) {
  if (value === null || value === undefined) return null;
  return requireVector(value, field);
}

function requireVector(value, field) {
  assertExactKeys(value, VECTOR_KEYS, 'SEQUENTIAL_AUTHORING_VECTOR_KEYS_INVALID');
  for (const axis of VECTOR_KEYS) {
    if (!Number.isFinite(value[axis])) {
      throw bridgeError('SEQUENTIAL_AUTHORING_VECTOR_VALUE_INVALID', { field, axis });
    }
  }
  return freeze(cloneVector(value));
}

function cloneVector(value) {
  return { x: value.x, y: value.y, z: value.z };
}

function zeroVector() {
  return freeze({ x: 0, y: 0, z: 0 });
}

function requirePointerId(value) {
  if (!Number.isInteger(value) || value < 0) {
    throw bridgeError('SEQUENTIAL_AUTHORING_POINTER_ID_INVALID');
  }
}

function requireIdentity(value, field) {
  if (typeof value !== 'string' || !value || !/^[\x20-\x7E]+$/u.test(value)) {
    throw bridgeError('SEQUENTIAL_AUTHORING_IDENTITY_INVALID', { field });
  }
}

function clone(value) {
  return structuredClone(value);
}

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freeze);
  return Object.freeze(value);
}

function bridgeError(code, evidence = {}) {
  const error = new TypeError(code);
  error.code = code;
  error.evidence = evidence;
  return error;
}
