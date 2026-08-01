/**
 * Revision-bound sequential SVG authoring bridge.
 *
 * The bridge owns transient gesture state only. Source mutations remain
 * controller/gateway-owned and occur through one accepted command.
 */
import {
  ACCEPT_KEYS,
  BEGIN_KEYS,
  SKETCHER_AUTHORING_BRIDGE_SCHEMA,
  SKETCHER_AUTHORING_RECEIPT_SCHEMA,
  UPDATE_KEYS,
  assertExactKeys,
  bridgeError,
  clone,
  cloneVector,
  createAuthoringPreview,
  datasetIdentity,
  freeze,
  requireBridgeDependencies,
  requireIdentity,
  requirePointerId,
  requireReadySnapshot,
  requireVector,
  sourceGeometry,
  zeroVector,
} from './sketcher-authoring-contracts.js';

export {
  SKETCHER_AUTHORING_BRIDGE_SCHEMA,
  SKETCHER_AUTHORING_PREVIEW_SCHEMA,
  SKETCHER_AUTHORING_RECEIPT_SCHEMA,
} from './sketcher-authoring-contracts.js';

export function createSketcherAuthoringBridge(options = {}) {
  const {
    gateway,
    workspaceState,
    eventTarget = null,
    onPreviewChange = null,
    onSelectionChange = null,
  } = options;
  requireBridgeDependencies({
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
    preview = createAuthoringPreview(active);
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
    preview = createAuthoringPreview(gesture);
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

  function requireLive() {
    if (destroyed) throw bridgeError('SEQUENTIAL_AUTHORING_BRIDGE_DESTROYED');
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
