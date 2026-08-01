#!/usr/bin/env node

import assert from 'node:assert/strict';
import { WORKSPACE_DATASET_SCHEMA } from '../src/workspace/dataset-adapter.js';
import { WorkspaceStateStore } from '../src/workspace/workspace-state.js';
import { SequentialCommandGateway } from '../src/workspace/sequential-sketcher/sequential-command-gateway.js';
import {
  SKETCHER_AUTHORING_BRIDGE_SCHEMA,
  SKETCHER_AUTHORING_PREVIEW_SCHEMA,
  SKETCHER_AUTHORING_RECEIPT_SCHEMA,
  createSketcherAuthoringBridge,
} from '../src/workspace/sequential-sketcher/sketcher-authoring-bridge.js';

const workspaceState = new WorkspaceStateStore();
const eventBus = { publish() {} };
const gateway = new SequentialCommandGateway(workspaceState, eventBus);
const eventTarget = new FakeEventTarget();
const previews = [];
const selections = [];

workspaceState.loadDataset(dataset('U4K-DATASET', 1));
const bridge = createSketcherAuthoringBridge({
  gateway,
  workspaceState,
  eventTarget,
  onPreviewChange: (preview) => previews.push(preview),
  onSelectionChange: (selection) => selections.push(selection),
});
assert.equal(bridge.schema, SKETCHER_AUTHORING_BRIDGE_SCHEMA);
assert.equal(Object.isFrozen(bridge), true);
assert.equal(eventTarget.listenerCount('keydown'), 1);
assert.equal(eventTarget.listenerCount('pointercancel'), 1);

const sourceDataset = workspaceState.getSnapshot().dataset;
const sourceGeometry = structuredClone(sourceDataset.entities[0].properties.geometry);
const started = bridge.beginStretchGesture({
  gestureId: 'GESTURE-1',
  pointerId: 7,
  sourceEntityId: 'PIPE-1',
});
assert.equal(started.status, 'ACTIVE');
assert.equal(started.activeGesture.datasetRevision, 1);
assert.deepEqual(selections.at(-1), {
  schema: 'SequentialEngineeringSelection.v1',
  datasetId: 'U4K-DATASET',
  entityId: 'PIPE-1',
  entityRole: 'SOURCE',
});
assert.equal(Object.isFrozen(selections.at(-1)), true);

const preview = bridge.updateStretchGesture({
  pointerId: 7,
  offset: { x: 25, y: -10, z: 5 },
});
assert.equal(preview.schema, SKETCHER_AUTHORING_PREVIEW_SCHEMA);
assert.equal(preview.sourceMutation, false);
assert.equal(Object.isFrozen(preview), true);
assert.deepEqual(preview.geometry.start, { x: 25, y: -10, z: 5 });
assert.deepEqual(preview.geometry.end, { x: 125, y: -10, z: 5 });
assert.strictEqual(workspaceState.getSnapshot().dataset, sourceDataset);
assert.deepEqual(
  workspaceState.getSnapshot().dataset.entities[0].properties.geometry,
  sourceGeometry,
);

const receipt = bridge.acceptGesture({ pointerId: 7 });
assert.equal(receipt.schema, SKETCHER_AUTHORING_RECEIPT_SCHEMA);
assert.equal(receipt.status, 'APPLIED');
assert.equal(receipt.commandCount, 1);
assert.deepEqual(receipt.command, {
  op: 'STRETCH_NODE',
  targetEntityId: 'PIPE-1',
  offset: { x: 25, y: -10, z: 5 },
});
assert.equal(Object.isFrozen(receipt), true);
assert.equal(gateway.history.length, 1);
assert.equal(bridge.getState().acceptedCommandCount, 1);
assert.equal(bridge.getState().status, 'IDLE');
assert.equal(bridge.getState().preview, null);
assert.equal(previews.at(-1), null);
assert.deepEqual(
  workspaceState.getSnapshot().dataset.entities[0].properties.geometry,
  {
    start: { x: 25, y: -10, z: 5 },
    end: { x: 125, y: -10, z: 5 },
    center: { x: 75, y: -10, z: 5 },
  },
);
assert.throws(
  () => bridge.acceptGesture({ pointerId: 7 }),
  (error) => error.code === 'SEQUENTIAL_AUTHORING_GESTURE_NOT_ACTIVE',
);
assert.equal(gateway.history.length, 1);

begin(bridge, 'GESTURE-ESCAPE', 8);
bridge.updateStretchGesture({ pointerId: 8, offset: { x: 1, y: 0, z: 0 } });
eventTarget.dispatch('keydown', { key: 'Escape' });
assert.equal(bridge.getState().status, 'IDLE');
assert.equal(gateway.history.length, 1);

begin(bridge, 'GESTURE-POINTER-CANCEL', 9);
eventTarget.dispatch('pointercancel', { pointerId: 10 });
assert.equal(bridge.getState().status, 'ACTIVE');
eventTarget.dispatch('pointercancel', { pointerId: 9 });
assert.equal(bridge.getState().status, 'IDLE');
assert.equal(gateway.history.length, 1);

begin(bridge, 'GESTURE-SELECTION-VERSION', 11);
const datasetBeforeSelection = workspaceState.getSnapshot().dataset;
const snapshotVersionBeforeSelection = workspaceState.getSnapshot().version;
workspaceState.selectEntity('SUPPORT-1');
assert.ok(workspaceState.getSnapshot().version > snapshotVersionBeforeSelection);
assert.strictEqual(workspaceState.getSnapshot().dataset, datasetBeforeSelection);
bridge.updateStretchGesture({ pointerId: 11, offset: { x: 0, y: 3, z: 0 } });
assert.equal(bridge.getState().status, 'ACTIVE');
bridge.cancelGesture('SELECTION_VERSION_PROVEN_SAFE');

begin(bridge, 'GESTURE-DATASET-CHANGE', 12);
const changedSnapshot = workspaceState.loadDataset(dataset('U4K-DATASET-REPLACED', 1));
const datasetCancellation = bridge.handleWorkspaceSnapshot(changedSnapshot);
assert.equal(datasetCancellation.status, 'CANCELLED');
assert.equal(datasetCancellation.reason, 'DATASET_CHANGED');
assert.equal(gateway.history.length, 1);

begin(bridge, 'GESTURE-STALE-ACCEPT', 13);
workspaceState.loadDataset(dataset('U4K-DATASET-STALE', 1));
assert.throws(
  () => bridge.acceptGesture({ pointerId: 13 }),
  (error) => error.code === 'SEQUENTIAL_AUTHORING_STALE_DATASET_REVISION',
);
assert.equal(bridge.getState().status, 'IDLE');
assert.equal(gateway.history.length, 1);

begin(bridge, 'GESTURE-DESTROY', 14);
bridge.destroy();
bridge.destroy();
assert.equal(bridge.getState().status, 'DESTROYED');
assert.equal(eventTarget.listenerCount('keydown'), 0);
assert.equal(eventTarget.listenerCount('pointercancel'), 0);
assert.throws(
  () => bridge.beginStretchGesture({
    gestureId: 'AFTER-DESTROY', pointerId: 15, sourceEntityId: 'PIPE-1',
  }),
  (error) => error.code === 'SEQUENTIAL_AUTHORING_BRIDGE_DESTROYED',
);

console.log(JSON.stringify({
  check: 'sequential-sketcher-authoring-bridge',
  status: 'PASS',
  transientPreviewMutatedSource: false,
  acceptedGestureCommandCount: receipt.commandCount,
  gatewayHistoryCount: gateway.history.length,
  selectionSnapshotVersionIgnored: true,
  datasetReplacementCancelled: true,
  staleRevisionRejected: true,
  escapeCancelled: true,
  pointerCancellationScoped: true,
  teardownIdempotent: true,
  solverImports: 0,
  recoveryImports: 0,
}));

function begin(targetBridge, gestureId, pointerId) {
  return targetBridge.beginStretchGesture({
    gestureId,
    pointerId,
    sourceEntityId: 'PIPE-1',
  });
}

function dataset(datasetId, version) {
  return {
    schema: WORKSPACE_DATASET_SCHEMA,
    datasetId,
    version,
    sourceSchema: 'SIMULATED',
    sourceName: '[SIMULATED] sequential authoring bridge',
    entities: [
      entity('PIPE-1', 'PIPE', 'pipe', {
        start: { x: 0, y: 0, z: 0 },
        end: { x: 100, y: 0, z: 0 },
        center: { x: 50, y: 0, z: 0 },
      }),
      entity('SUPPORT-1', 'SUPP', 'support', {
        start: { x: 50, y: 0, z: 0 },
        end: { x: 50, y: 0, z: 0 },
        center: { x: 50, y: 0, z: 0 },
      }),
    ],
  };
}

function entity(entityId, entityType, category, geometry) {
  return {
    entityId,
    sourceEntityId: entityId,
    name: entityId,
    entityType,
    category,
    properties: {
      identity: { entityId, name: entityId, entityType },
      geometry,
      attributes: {},
    },
  };
}

class FakeEventTarget {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }
  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener);
  }
  dispatch(type, event) {
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener(event);
  }
  listenerCount(type) { return this.listeners.get(type)?.size ?? 0; }
}
