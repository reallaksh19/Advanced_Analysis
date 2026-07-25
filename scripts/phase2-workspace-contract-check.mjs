import assert from 'node:assert/strict';
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

const realPackage = {
  schema: 'rvm-selected-geometry-workspace-package/v1',
  packageHash: 'REAL-DATASET-001',
  source: { sourceFileName: 'real-workspace.json' },
  geometry: {
    objects: [
      {
        id: 'PIPE-REAL-1',
        name: 'Real Pipe',
        type: 'PIPE',
        sourcePath: '/AREA-A/LINE-100/PIPE-REAL-1',
        sourceAttributes: { MATERIAL: 'A106-B', LINE_NO: 'LINE-100' },
      },
    ],
    supports: [
      {
        id: 'SUP-REAL-1',
        name: 'Real Guide',
        type: 'GUIDE',
        sourcePath: '/AREA-A/LINE-100/SUP-REAL-1',
        sourceAttributes: { GAP_MM: 5 },
      },
    ],
    branches: [],
  },
};

const dataset = normalizeWorkspaceDataset(realPackage, 'real-workspace.json');
assert.equal(dataset.datasetId, 'REAL-DATASET-001');
assert.equal(dataset.summary.nodeCount, 2);
assert.equal(dataset.summary.pipes, 1);
assert.equal(dataset.summary.supports, 1);
assert.equal(dataset.hierarchy[0].label, 'AREA-A');
assert.equal(dataset.entities[1].selectionType, 'support');
assert.equal(dataset.entities[0].properties.sourceAttributes.MATERIAL, 'A106-B');
assert.ok(Object.isFrozen(dataset));

const state = new WorkspaceStateStore();
const readySnapshot = state.loadDataset(dataset);
assert.equal(readySnapshot.status, 'ready');
assert.equal(state.getEntity('PIPE-REAL-1').name, 'Real Pipe');
assert.equal(state.selectEntity('SUP-REAL-1').entityId, 'SUP-REAL-1');
assert.equal(state.getSnapshot().selectedEntityId, 'SUP-REAL-1');
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
assert.equal(state.getEntity('PIPE-REAL-1'), null);

console.log('Phase 2 workspace contract check passed.');
