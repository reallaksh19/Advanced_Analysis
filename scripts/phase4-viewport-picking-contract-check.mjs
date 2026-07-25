import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatasetController } from '../src/workspace/dataset-controller.js';
import { EventBus } from '../src/workspace/event-bus.js';
import { EVENT_TOPICS } from '../src/workspace/event-topics.js';
import { buildCanvasProjection, pickViewportItem } from '../src/workspace/viewport-hit-test.js';
import { buildViewportRenderModel } from '../src/workspace/viewport-render-model.js';
import { WorkspaceStateStore } from '../src/workspace/workspace-state.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workspaceDir = path.join(root, 'src/workspace');
const workspaceModules = (await readdir(workspaceDir))
  .filter((name) => name.endsWith('.js'))
  .map((name) => `src/workspace/${name}`);

for (const relativePath of workspaceModules) {
  const source = await readFile(path.join(root, relativePath), 'utf8');
  const lineCount = source.split(/\r?\n/).length;
  assert.ok(lineCount <= 300, `${relativePath} exceeds 300 lines (${lineCount}).`);
  assert.doesNotMatch(source, /from\s+['"](?:zustand|react)['"]/, `${relativePath} imports UI state framework code.`);
}

for (const relativePath of [
  'src/workspace/tree-panel.js',
  'src/workspace/properties-panel.js',
  'src/workspace/viewport-panel.js',
  'src/workspace/canvas2d-viewport-backend.js',
  'src/workspace/three-viewport-backend.js',
]) {
  const source = await readFile(path.join(root, relativePath), 'utf8');
  assert.doesNotMatch(source, /document\.(querySelector|getElementById)/, `${relativePath} crosses its root scope.`);
}

assert.equal(EVENT_TOPICS.VIEWPORT_SELECTION_REQUESTED, 'viewport:selectionRequested');
assert.throws(
  () => EventBus.publish(EVENT_TOPICS.VIEWPORT_SELECTION_REQUESTED, {
    entityId: 'PIPE-1',
    source: 'unknown',
  }),
  /tree.*viewport.*api/,
);

const packageJson = {
  schema: 'rvm-selected-geometry-workspace-package/v1',
  packageHash: 'PHASE4-PICKING',
  geometry: {
    objects: [
      {
        id: 'PIPE-SEGMENT',
        type: 'PIPE',
        nativeParams: {
          startPoint: { x: 0, y: 0, z: 0 },
          endPoint: { x: 100, y: 0, z: 0 },
        },
      },
      {
        id: 'PIPE-POINT',
        type: 'PIPE',
        nativeParams: { center: { x: 50, y: 40, z: 0 } },
      },
    ],
    supports: [],
    branches: [],
  },
};

const state = new WorkspaceStateStore();
const controller = new DatasetController(EventBus, state);
controller.init();
let selectedNotification = null;
const unsubscribeSelected = EventBus.subscribe(
  EVENT_TOPICS.VIEWPORT_ENTITY_SELECTED,
  (payload) => { selectedNotification = payload; },
);

EventBus.publish(EVENT_TOPICS.DATASET_LOAD_REQUESTED, {
  rawPackage: packageJson,
  sourceName: 'phase4.json',
});
EventBus.publish(EVENT_TOPICS.VIEWPORT_SELECTION_REQUESTED, {
  entityId: 'PIPE-SEGMENT',
  source: 'viewport',
});

assert.equal(state.getSnapshot().selectedEntityId, 'PIPE-SEGMENT');
assert.equal(selectedNotification.entityId, 'PIPE-SEGMENT');
assert.equal(selectedNotification.source, 'viewport');

EventBus.publish(EVENT_TOPICS.VIEWPORT_ENTITY_SELECTED, {
  entityId: 'PIPE-POINT',
  type: 'pipe',
  properties: {},
});
assert.equal(
  state.getSnapshot().selectedEntityId,
  'PIPE-SEGMENT',
  'Selected notification mutated WorkspaceState without a selection request.',
);

const model = buildViewportRenderModel(state.getSnapshot().dataset);
const width = 500;
const height = 360;
const projection = buildCanvasProjection(model, width, height);
const segment = model.items.find((item) => item.entityId === 'PIPE-SEGMENT');
const point = model.items.find((item) => item.entityId === 'PIPE-POINT');
const segmentStart = projection(segment.start);
const segmentEnd = projection(segment.end);
const segmentMidpoint = {
  x: (segmentStart.x + segmentEnd.x) / 2,
  y: (segmentStart.y + segmentEnd.y) / 2,
};
const pointScreen = projection(point.center);

assert.equal(pickViewportItem(model, width, height, segmentMidpoint), 'PIPE-SEGMENT');
assert.equal(pickViewportItem(model, width, height, pointScreen), 'PIPE-POINT');
assert.equal(pickViewportItem(model, width, height, { x: width - 2, y: 2 }), '');

const sourceChecks = new Map([
  ['src/workspace/tree-panel.js', ['VIEWPORT_SELECTION_REQUESTED', "source: 'tree'"]],
  ['src/workspace/viewport-panel.js', ['VIEWPORT_SELECTION_REQUESTED', "source: 'viewport'"]],
  ['src/workspace/canvas2d-viewport-backend.js', ['pickViewportItem', "removeEventListener('pointerup'"]],
  ['src/workspace/three-viewport-backend.js', ['new THREE.Raycaster()', 'intersectObjects', "removeEventListener('pointerup'"]],
  ['src/workspace/viewport-renderer.js', ['setSelectionRequestHandler', 'backend?.setSelectionRequestHandler(null)']],
]);
for (const [relativePath, contracts] of sourceChecks) {
  const source = await readFile(path.join(root, relativePath), 'utf8');
  contracts.forEach((contract) => assert.ok(source.includes(contract), `${relativePath} misses ${contract}.`));
}

const controllerSource = await readFile(path.join(workspaceDir, 'dataset-controller.js'), 'utf8');
assert.ok(controllerSource.includes('VIEWPORT_SELECTION_REQUESTED'));
assert.doesNotMatch(
  controllerSource,
  /VIEWPORT_ENTITY_SELECTED[\s\S]{0,120}=>\s*this\.select/,
  'DatasetController still treats selected notifications as mutation commands.',
);

unsubscribeSelected();
controller.destroy();
assert.equal(EventBus.listenerCount(EVENT_TOPICS.VIEWPORT_SELECTION_REQUESTED), 0);
assert.equal(EventBus.listenerCount(EVENT_TOPICS.VIEWPORT_ENTITY_SELECTED), 0);

console.log('Phase 4 viewport picking contract check passed.');
