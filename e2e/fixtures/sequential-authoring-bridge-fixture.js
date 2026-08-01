import { WORKSPACE_DATASET_SCHEMA } from '../../src/workspace/dataset-adapter.js';
import { WorkspaceStateStore } from '../../src/workspace/workspace-state.js';
import { SequentialSketcherController } from '../../src/workspace/sequential-sketcher/sequential-sketcher-controller.js';

export const HC_SEQUENTIAL_AUTHORING_FIXTURE_SCHEMA =
  'lafea-sequential-authoring-browser-fixture/v1';

export function mountHcSequentialAuthoring(rootElement) {
  if (!rootElement) throw new TypeError('HC_UI_SEQUENTIAL_ROOT_REQUIRED');
  rootElement.classList.add('viewport-panel');
  const workspaceState = new WorkspaceStateStore();
  const eventBus = createFixtureEventBus();
  workspaceState.loadDataset(authoringDataset());
  const controller = new SequentialSketcherController(
    rootElement,
    eventBus,
    workspaceState,
  );
  controller.init();
  const snapshot = workspaceState.getSnapshot();
  const fixture = Object.freeze({
    schema: HC_SEQUENTIAL_AUTHORING_FIXTURE_SCHEMA,
    scenario: 'SEQUENTIAL_AUTHORING_GESTURE',
    controller,
    context: Object.freeze({
      datasetId: snapshot.dataset.datasetId,
      datasetRevision: snapshot.dataset.version,
      bridgeStatus: controller.authoringBridge.getState().status,
      entityId: snapshot.dataset.entities[0].entityId,
    }),
  });
  globalThis.__LAFEA_HC_BROWSER__ = fixture;
  return fixture;
}

export function executeHcSequentialAuthoringGesture(controller) {
  if (!controller?.authoringBridge || !controller?.workspaceState) {
    throw new TypeError('HC_UI_SEQUENTIAL_CONTROLLER_REQUIRED');
  }
  const beforeSnapshot = controller.workspaceState.getSnapshot();
  const beforeDataset = beforeSnapshot.dataset;
  const beforeGeometry = structuredClone(beforeDataset.entities[0].properties.geometry);

  controller.authoringBridge.beginStretchGesture({
    gestureId: 'HC-UI-07-GESTURE',
    pointerId: 17,
    sourceEntityId: 'PIPE-1',
  });
  const preview = controller.authoringBridge.updateStretchGesture({
    pointerId: 17,
    offset: { x: 20, y: 5, z: 0 },
  });
  const duringDataset = controller.workspaceState.getSnapshot().dataset;
  const sourceUnchangedDuringPreview = duringDataset === beforeDataset
    && JSON.stringify(duringDataset.entities[0].properties.geometry)
      === JSON.stringify(beforeGeometry);

  const receipt = controller.authoringBridge.acceptGesture({ pointerId: 17 });
  const afterSnapshot = controller.workspaceState.getSnapshot();
  const afterGeometry = structuredClone(
    afterSnapshot.dataset.entities[0].properties.geometry,
  );

  return Object.freeze({
    schema: 'lafea-sequential-authoring-browser-result/v1',
    beforeGeometry,
    preview: structuredClone(preview),
    previewFrozen: Object.isFrozen(preview),
    sourceUnchangedDuringPreview,
    receipt: structuredClone(receipt),
    receiptFrozen: Object.isFrozen(receipt),
    afterGeometry,
    gatewayHistoryCount: controller.gateway.history.length,
    acceptedCommandCount: controller.authoringBridge.getState().acceptedCommandCount,
    bridgeStatus: controller.authoringBridge.getState().status,
    datasetRevision: afterSnapshot.dataset.version,
  });
}

function authoringDataset() {
  return {
    schema: WORKSPACE_DATASET_SCHEMA,
    datasetId: 'HC-UI-07-DATASET',
    version: 1,
    sourceSchema: 'SIMULATED',
    sourceName: '[SIMULATED] sequential authoring gesture',
    entities: [{
      entityId: 'PIPE-1',
      sourceEntityId: 'PIPE-1',
      name: 'HC-UI-07 Pipe',
      entityType: 'PIPE',
      category: 'pipe',
      properties: {
        identity: {
          entityId: 'PIPE-1',
          name: 'HC-UI-07 Pipe',
          entityType: 'PIPE',
        },
        geometry: {
          start: { x: 0, y: 0, z: 0 },
          end: { x: 100, y: 0, z: 0 },
          center: { x: 50, y: 0, z: 0 },
        },
        sourceAttributes: {},
        attributes: { TYPE: 'PIPE' },
      },
    }],
  };
}

function createFixtureEventBus() {
  const listeners = new Map();
  return Object.freeze({
    subscribe(topic, listener) {
      const rows = listeners.get(topic) ?? new Set();
      rows.add(listener);
      listeners.set(topic, rows);
      return () => rows.delete(listener);
    },
    publish(topic, payload) {
      for (const listener of [...(listeners.get(topic) ?? [])]) listener(payload);
    },
  });
}
