import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeWorkspaceDataset } from '../src/workspace/dataset-adapter.js';
import {
  buildViewportRenderModel,
  VIEWPORT_RENDER_MODEL_SCHEMA,
} from '../src/workspace/viewport-render-model.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rawPackage = {
  schema: 'inputxml-managed-stage/v1',
  packageHash: 'phase3-fixture',
  objects: [
    {
      id: 'PIPE-A',
      type: 'PIPE',
      sourcePath: '/AREA-1/LINE-1/PIPE-A',
      nativeParams: { startPoint: [0, 0, 0], endPoint: [100, 0, 0] },
    },
    {
      id: 'SUP-A',
      type: 'SUPPORT',
      sourcePath: '/AREA-1/LINE-1/SUP-A',
      sourceAttributes: { CENTER: '50 20 10' },
    },
    {
      id: 'PIPE-DELTA',
      type: 'PIPE',
      sourcePath: '/AREA-1/LINE-2/PIPE-DELTA',
      attributes: { APOS: '100 0 0', DX: 0, DY: 80, DZ: 0 },
    },
    {
      id: 'NO-GEOMETRY',
      type: 'VALVE',
      sourcePath: '/AREA-1/LINE-2/NO-GEOMETRY',
    },
  ],
};

const dataset = normalizeWorkspaceDataset(rawPackage, 'phase3.json');
const model = buildViewportRenderModel(dataset);
assert.equal(model.schema, VIEWPORT_RENDER_MODEL_SCHEMA);
assert.equal(model.datasetId, 'phase3-fixture');
assert.equal(model.summary.renderableCount, 3);
assert.equal(model.summary.segmentCount, 2);
assert.equal(model.summary.pointCount, 1);
assert.equal(model.summary.skippedCount, 1);
assert.deepEqual(model.skippedEntityIds, ['NO-GEOMETRY']);
assert.deepEqual(model.items.find((item) => item.entityId === 'PIPE-A').end, { x: 100, y: 0, z: 0 });
assert.deepEqual(model.items.find((item) => item.entityId === 'SUP-A').center, { x: 50, y: 20, z: 10 });
assert.deepEqual(model.items.find((item) => item.entityId === 'PIPE-DELTA').end, { x: 100, y: 80, z: 0 });
assert.ok(model.bounds.radius > 0);
assert.ok(Object.isFrozen(model));
assert.ok(Object.isFrozen(model.items[0]));

const modules = [
  'src/workspace/geometry-evidence.js',
  'src/workspace/viewport-render-model.js',
  'src/workspace/viewport-renderer.js',
  'src/workspace/canvas2d-viewport-backend.js',
  'src/workspace/three-viewport-backend.js',
  'src/workspace/viewport-panel.js',
  'src/workspace/dataset-adapter.js',
];

for (const relativePath of modules) {
  const source = await readFile(path.join(root, relativePath), 'utf8');
  const lineCount = source.split(/\r?\n/).length;
  assert.ok(lineCount <= 300, `${relativePath} exceeds 300 lines (${lineCount}).`);
  assert.ok(!source.includes('document.querySelector'), `${relativePath} uses global DOM lookup.`);
  assert.ok(!/from ['"](?:zustand|react|react-dom)/.test(source), `${relativePath} imports React/Zustand.`);
}

const rendererSources = await Promise.all([
  'src/workspace/viewport-renderer.js',
  'src/workspace/canvas2d-viewport-backend.js',
  'src/workspace/three-viewport-backend.js',
].map((file) => readFile(path.join(root, file), 'utf8')));
const rendererSource = rendererSources.join('\n');
assert.ok(!rendererSource.includes('inputxml-managed-stage'), 'Renderer parses a raw package schema.');
assert.ok(!rendererSource.includes('rvm-selected-geometry-workspace-package'), 'Renderer parses a raw package schema.');
assert.ok(rendererSources[0].includes('Canvas2DViewportBackend'));
assert.ok(rendererSources[0].includes('ThreeViewportBackend'));
assert.ok(rendererSources[1].includes('assertViewportRenderModel'));
assert.ok(rendererSources[2].includes('OrbitControls'));
assert.ok(rendererSources[2].includes('forceContextLoss'));
assert.ok(rendererSources[2].includes('cancelAnimationFrame'));
assert.ok(rendererSources[2].includes('ResizeObserver'));

console.log('Phase 3 viewport render-model and backend contracts passed.');
