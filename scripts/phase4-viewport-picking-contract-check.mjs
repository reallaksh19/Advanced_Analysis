import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatasetController } from '../src/workspace/dataset-controller.js';
import { EventBus } from '../src/workspace/event-bus.js';
import { EVENT_TOPICS } from '../src/workspace/event-topics.js';
import { buildCanvasProjection, pickViewportItem } from '../src/workspace/viewport-hit-test.js';
import { buildResolvedEngineeringGeometry } from '../src/workspace/resolved-engineering-geometry.js';
import { buildSupportSiteModel } from '../src/workspace/support-sites/support-site-model.js';
import { buildViewportRenderModel } from '../src/workspace/viewport-render-model.js';
import { WorkspaceStateStore } from '../src/workspace/workspace-state.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workspaceDir = path.join(root, 'src/workspace');
const workspaceModules = [
  'src/workspace/tree-panel.js', 'src/workspace/tree-panel-events.js',
  'src/workspace/properties-panel.js', 'src/workspace/properties-view.js',
  'src/workspace/viewport-panel.js', 'src/workspace/viewport-renderer.js',
  'src/workspace/three-viewport-backend.js', 'src/workspace/three-viewport-scene.js',
  'src/workspace/workspace-layout.js', 'src/workspace/workspace-shell-controller.js',
  'src/workspace/dataset-controller.js', 'src/workspace/engineering-model-controller.js',
];

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

const sourceBytes = await readFile(path.join(root, 'benchmarks/Sjson.json'));
const packageJson = JSON.parse(sourceBytes.toString('utf8'));
const projectData = JSON.parse(await readFile(path.join(root, 'project-data/1885s-project-data-profile.json'), 'utf8'));

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
  sourceName: 'benchmarks/Sjson.json',
  sourceBytes,
  sourceSha256: createHash('sha256').update(sourceBytes).digest('hex'),
});
const dataset = state.getSnapshot().dataset;
const selectedEntity = dataset.entities.find((entity) => entity.properties?.attributes?.NAME === '/88-UZV-11951');
const notificationOnlyEntity = dataset.entities.find((entity) => entity.category === 'support');
EventBus.publish(EVENT_TOPICS.VIEWPORT_SELECTION_REQUESTED, {
  entityId: selectedEntity.entityId,
  source: 'viewport',
});

assert.equal(state.getSnapshot().selectedEntityId, selectedEntity.entityId);
assert.equal(selectedNotification.entityId, selectedEntity.entityId);
assert.equal(selectedNotification.source, 'viewport');

EventBus.publish(EVENT_TOPICS.VIEWPORT_ENTITY_SELECTED, {
  entityId: notificationOnlyEntity.entityId,
  type: 'support',
  properties: {},
});
assert.equal(
  state.getSnapshot().selectedEntityId,
  selectedEntity.entityId,
  'Selected notification mutated WorkspaceState without a selection request.',
);

const supportSites = buildSupportSiteModel(dataset, projectData);
const resolved = buildResolvedEngineeringGeometry(dataset, projectData, supportSites);
const model = buildViewportRenderModel(resolved);
const width = 500;
const height = 360;
const projection = buildCanvasProjection(model, width, height);
const renderItems = [
  ...model.physicalPrimitives,
  ...model.supportOverlayPrimitives,
  ...model.diagnosticPrimitives,
];
const segment = renderItems.filter((item) => item.start && item.end).find((item) => {
  const start = projection(item.start); const end = projection(item.end);
  return pickViewportItem(model, width, height, { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 }) === item.objectId;
});
assert.ok(segment, 'The supplied 1885S model must expose at least one deterministically pickable source segment.');
const skippedEntityId = model.skippedEntityIds[0];
assert.ok(skippedEntityId, 'The supplied source must retain its explicitly skipped topology records.');
assert.equal(renderItems.some((item) => item.objectId === skippedEntityId), false, 'Skipped source topology must not render a fabricated point.');
assert.equal(pickViewportItem(model, width, height, { x: width - 2, y: 2 }), '');

const sourceChecks = new Map([
  ['src/workspace/tree-panel-events.js', ['VIEWPORT_SELECTION_REQUESTED', "source: 'tree'"]],
  ['src/workspace/viewport-panel.js', ['VIEWPORT_SELECTION_REQUESTED', "source: 'viewport'"]],
  ['src/workspace/canvas2d-viewport-backend.js', ['pickViewportItem', "removeEventListener('pointerup'"]],
  ['src/workspace/three-viewport-backend.js', ['new THREE.Raycaster()', 'intersectObjects']],
  ['src/workspace/three-interaction-arbiter.js', ["removeEventListener('pointerup'"]],
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
