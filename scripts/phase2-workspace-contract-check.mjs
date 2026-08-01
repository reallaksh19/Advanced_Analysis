import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeWorkspaceDataset } from '../src/workspace/dataset-adapter.js';
import { flattenProperties, MAX_PROPERTY_ROWS } from '../src/workspace/property-flattener.js';
import { WorkspaceStateStore } from '../src/workspace/workspace-state.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workspaceModules = [
  'src/workspace/bootstrap.js',
  'src/workspace/dataset-adapter.js',
  'src/workspace/dataset-controller.js',
  'src/workspace/dataset-hierarchy.js',
  'src/workspace/dataset-types.js',
  'src/workspace/dataset-utils.js',
  'src/workspace/event-bus.js',
  'src/workspace/event-topics.js',
  'src/workspace/properties-panel.js',
  'src/workspace/property-flattener.js',
  'src/workspace/tree-panel.js',
  'src/workspace/viewport-panel.js',
  'src/workspace/workspace-layout.js',
  'src/workspace/workspace-state.js',
];

for (const relativePath of workspaceModules) {
  const source = await readFile(path.join(root, relativePath), 'utf8');
  const lineCount = source.split(/\r?\n/).length;
  assert.ok(lineCount <= 300, `${relativePath} exceeds 300 lines (${lineCount}).`);
  assert.doesNotMatch(source, /from\s+['"]zustand['"]/, `${relativePath} imports Zustand.`);
}

for (const relativePath of [
  'src/workspace/tree-panel.js',
  'src/workspace/properties-panel.js',
  'src/workspace/viewport-panel.js',
]) {
  const source = await readFile(path.join(root, relativePath), 'utf8');
  assert.doesNotMatch(source, /document\.(querySelector|getElementById)/, `${relativePath} crosses panel scope.`);
}

const sourceBytes = await readFile(path.join(root, 'benchmarks/Sjson.json'));
const sourceSha256 = createHash('sha256').update(sourceBytes).digest('hex');
const realPackage = JSON.parse(sourceBytes.toString('utf8'));
const dataset = normalizeWorkspaceDataset(realPackage, 'benchmarks/Sjson.json', { sourceBytes, sourceSha256 });
const target = dataset.entities.find((entity) => entity.properties?.attributes?.NAME === '/88-UZV-11951');
const selectedSupport = dataset.entities.find((entity) => entity.category === 'support');
assert.equal(dataset.summary.nodeCount, 279);
assert.equal(dataset.summary.supports, 139);
assert.equal(dataset.sourceSha256, sourceSha256);
assert.equal(target.lineKey, 'S8811951');
assert.equal(target.pipingClass, '91261M7');
assert.equal(target.nominalDiameterMm, 150);
assert.equal(selectedSupport.selectionType, 'support');
assert.ok(Object.isFrozen(dataset));

const state = new WorkspaceStateStore();
const readySnapshot = state.loadDataset(dataset);
assert.equal(readySnapshot.status, 'ready');
assert.equal(state.getEntity(target.entityId).properties.attributes.NAME, '/88-UZV-11951');
assert.equal(state.selectEntity(selectedSupport.entityId).entityId, selectedSupport.entityId);
assert.equal(state.getSnapshot().selectedEntityId, selectedSupport.entityId);
assert.equal(state.selectEntity('MISSING'), null);

const beforeInvalidImport = state.getSnapshot();
assert.throws(
  () => normalizeWorkspaceDataset({ schema: 'unsupported/v1' }, 'bad.json'),
  /Unsupported workspace package schema/,
);
assert.equal(state.getSnapshot(), beforeInvalidImport, 'Invalid adaptation changed the previous valid state.');

const manyProperties = Object.fromEntries(
  Array.from({ length: MAX_PROPERTY_ROWS + 50 }, (_, index) => [`field${index}`, index]),
);
assert.equal(flattenProperties(manyProperties).length, MAX_PROPERTY_ROWS);

const cleared = state.clearDataset();
assert.equal(cleared.status, 'empty');
assert.equal(state.getEntity(target.entityId), null);

console.log('Phase 2 workspace contract check passed.');
