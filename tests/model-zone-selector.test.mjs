import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildModelZoneCatalog,
  createModelZoneSelection,
  filterResolvedGeometryForModelZone,
  projectDatasetForModelZone,
  reconcileModelZoneSelection,
} from '../src/workspace/model-zone-selector.js';
import { RESOLVED_ENGINEERING_GEOMETRY_SCHEMA } from '../src/workspace/resolved-engineering-geometry.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function entity(entityId, zoneId, category = 'component') {
  return {
    entityId,
    zoneId,
    category,
    name: entityId,
    entityType: category === 'pipe' ? 'PIPE' : category === 'support' ? 'ATTA' : 'VALVE',
    sourcePath: `/${zoneId || 'unassigned'}/${entityId}`,
  };
}

function dataset(datasetId = 'dataset:A') {
  const entities = [
    entity('pipe:a', 'ZONE-2', 'pipe'),
    entity('support:a', 'ZONE-2', 'support'),
    entity('valve:a', 'ZONE-10'),
    entity('pipe:b', 'ZONE-1', 'pipe'),
    entity('unassigned:a', ''),
  ];
  return {
    datasetId,
    entities,
    summary: { nodeCount: 5, sourceNodeCount: 5, sourceRootCount: 1, pipes: 2, supports: 1, components: 2 },
  };
}

test('zone catalog is source-backed, deterministic, and naturally sorted', () => {
  const catalog = buildModelZoneCatalog(dataset());
  assert.deepEqual(catalog.zones.map((zone) => zone.zoneId), ['ZONE-1', 'ZONE-2', 'ZONE-10']);
  assert.deepEqual(catalog.zones.map((zone) => zone.entityCount), [1, 2, 1]);
  assert.equal(catalog.unassignedEntityCount, 1);
  assert.equal(Object.isFrozen(catalog), true);
});

test('selection resets for a newly loaded dataset and survives same-dataset edits', () => {
  const initial = buildModelZoneCatalog(dataset('dataset:first'));
  const selected = createModelZoneSelection(initial, 'ZONE-2');
  const edited = buildModelZoneCatalog(dataset('dataset:first'));
  assert.equal(reconcileModelZoneSelection(edited, selected).zoneId, 'ZONE-2');
  const nextModel = buildModelZoneCatalog(dataset('dataset:second'));
  const reset = reconcileModelZoneSelection(nextModel, selected);
  assert.equal(reset.datasetId, 'dataset:second');
  assert.equal(reset.zoneId, '');
  assert.equal(reset.label, 'All zones');
});

test('selection falls back to All zones when an edited dataset removes its zone', () => {
  const initial = buildModelZoneCatalog(dataset());
  const selected = createModelZoneSelection(initial, 'ZONE-2');
  const changed = dataset();
  changed.entities = changed.entities.filter((row) => row.zoneId !== 'ZONE-2');
  const reconciled = reconcileModelZoneSelection(buildModelZoneCatalog(changed), selected);
  assert.equal(reconciled.zoneId, '');
});

test('dataset projection filters tree entities without mutating source authority', () => {
  const source = dataset();
  const before = JSON.stringify(source);
  assert.equal(Object.isFrozen(source.entities[0]), false);
  const selection = createModelZoneSelection(buildModelZoneCatalog(source), 'ZONE-2');
  const projection = projectDatasetForModelZone(source, selection);
  assert.deepEqual(projection.entityIds, ['pipe:a', 'support:a']);
  assert.equal(projection.summary.pipes, 1);
  assert.equal(projection.summary.supports, 1);
  assert.equal(projection.totalEntityCount, 5);
  assert.equal(JSON.stringify(source), before);
  assert.equal(Object.isFrozen(source.entities[0]), false);
  assert.equal(Object.isFrozen(projection), true);
});

test('viewport projection recomputes selected-zone bounds and summary', () => {
  const source = dataset();
  const selection = createModelZoneSelection(buildModelZoneCatalog(source), 'ZONE-2');
  const projection = projectDatasetForModelZone(source, selection);
  const resolved = {
    schema: RESOLVED_ENGINEERING_GEOMETRY_SCHEMA,
    datasetId: source.datasetId,
    coordinateTransform: null,
    webglNavigation: {},
    items: [
      resolvedItem('pipe:a', 0, 10),
      resolvedItem('support:a', 10, 20, 'SUPPORT'),
      resolvedItem('valve:a', 1000, 1010),
    ],
    skipped: [{ entityId: 'unassigned:a', componentKind: 'VALVE', resolutionStatus: 'skipped' }],
    skippedEntityIds: ['unassigned:a'],
    bounds: {},
    summary: {},
  };
  assert.equal(Object.isFrozen(resolved.items[0]), false);
  const scoped = filterResolvedGeometryForModelZone(resolved, projection);
  assert.deepEqual(scoped.items.map((item) => item.entityId), ['pipe:a', 'support:a']);
  assert.equal(scoped.summary.renderableCount, 2);
  assert.equal(scoped.summary.skippedCount, 0);
  assert.ok(scoped.bounds.max.x < 1000);
  assert.equal(Object.isFrozen(resolved.items[0]), false);
  assert.equal(Object.isFrozen(scoped), true);
});

test('production tree and viewport consume exact-dataset selection without mutation', async () => {
  const files = await Promise.all([
    'src/workspace/model-zone-selector.js',
    'src/workspace/tree-panel.js',
    'src/workspace/tree-panel-events.js',
    'src/workspace/viewport-panel.js',
  ].map((file) => readFile(path.join(ROOT, file), 'utf8')));
  const [selector, tree, events, viewport] = files;
  assert.match(tree, /new ModelZoneSelectorController/);
  assert.match(events, /MODEL_ZONE_EVENTS\.CHANGED/);
  assert.match(events, /\{ selection, dataset \}/);
  assert.match(viewport, /filterResolvedGeometryForModelZone/);
  assert.match(viewport, /projectDatasetForModelZone/);
  assert.match(viewport, /this\.datasetReference === dataset/);
  assert.match(selector, /reconcileModelZoneSelection/);
  assert.match(selector, /EVENT_TOPICS\.DATASET_LOADED/);
  assert.match(selector, /dataset: this\.dataset/);
  for (const prohibited of ['WorkspaceState.loadDataset', 'WorkspaceState.clearDataset', 'rebuildWorkspaceDataset']) {
    assert.equal(selector.includes(prohibited), false, `selector must not use ${prohibited}`);
  }
});

function resolvedItem(entityId, startX, endX, componentKind = 'PIPE') {
  return {
    entityId,
    entityType: componentKind,
    category: componentKind === 'SUPPORT' ? 'support' : 'pipe',
    componentKind,
    resolutionStatus: 'resolved',
    primitives: [{
      kind: componentKind === 'SUPPORT' ? 'SUPPORT_MARKER' : 'PIPE_TUBE',
      start: { x: startX, y: 0, z: 0 },
      end: { x: endX, y: 0, z: 0 },
      diameterMm: 10,
    }],
  };
}
