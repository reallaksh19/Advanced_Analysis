import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeWorkspaceDataset } from '../src/workspace/dataset-adapter.js';
import {
  buildViewportRenderModel,
  VIEWPORT_RENDER_MODEL_SCHEMA,
} from '../src/workspace/viewport-render-model.js';
import { buildResolvedEngineeringGeometry } from '../src/workspace/resolved-engineering-geometry.js';
import { buildSupportSiteModel } from '../src/workspace/support-sites/support-site-model.js';
import { projectDataStore } from '../src/workspace/project-data/project-data-store.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceBytes = await readFile(path.join(root, 'benchmarks/Sjson.json'));
const rawPackage = JSON.parse(sourceBytes.toString('utf8'));
const projectData = JSON.parse(await readFile(path.join(root, 'project-data/1885s-project-data-profile.json'), 'utf8'));
assert.equal(projectDataStore.getOrigin().source, 'project-data/1885s-project-data-profile.json');
assert.equal(projectDataStore.validate('webgl', null).valid, true);
assert.equal(projectDataStore.validate('webgl', { dataset: projectData.sourcesAndUnits.datasetSource.value.sha256 }).valid, true, 'WebGL validation must not depend on unrelated masters.');
for (const key of ['supportMarkerSize', 'pickingRadius', 'cameraFitMargin', 'clickTimingMs', 'doubleClickTimingMs', 'clickTravelTolerancePx', 'zoomRate', 'navigationSensitivity', 'perspectiveFovDeg', 'meshRadialSegments', 'cameraNearMm', 'cameraFarMm']) {
  assert.equal(projectDataStore.getProfile().webglNavigation[key].value, projectData.webglNavigation[key].value, `Bundled Project Data mismatch for ${key}.`);
}
const dataset = normalizeWorkspaceDataset(rawPackage, 'benchmarks/Sjson.json', { sourceBytes, sourceSha256: createHash('sha256').update(sourceBytes).digest('hex') });
const supportSites = buildSupportSiteModel(dataset, projectData);
const resolved = buildResolvedEngineeringGeometry(dataset, projectData, supportSites);
const model = buildViewportRenderModel(resolved);
assert.equal(model.schema, VIEWPORT_RENDER_MODEL_SCHEMA);
assert.equal(dataset.summary.nodeCount, 279);
assert.equal(supportSites.summary.sourceSupportRecordCount, 139);
assert.equal(supportSites.summary.supportAssemblyCount, 38);
assert.equal(supportSites.summary.physicalLocationCount, 37);
assert.equal(model.summary.renderableCount, 150);
assert.equal(model.summary.segmentCount, 116);
assert.equal(model.summary.pointCount, 37);
assert.equal(model.summary.skippedCount, 27);
const items = [
  ...model.physicalPrimitives,
  ...model.supportOverlayPrimitives,
  ...model.diagnosticPrimitives,
];
assert.equal(model.supportOverlayPrimitives.length, 37);
assert.equal(model.diagnosticPrimitives.length, 0);
assert.equal(items.some((item) => item.objectId === '=1006649732/51250'), true);
assert.ok(model.bounds.radius > 0);
assert.ok(Object.isFrozen(model));
assert.ok(Object.isFrozen(items[0]));

const modules = [
  'src/workspace/geometry-evidence.js',
  'src/workspace/viewport-render-model.js',
  'src/workspace/viewport-renderer.js',
  'src/workspace/canvas2d-viewport-backend.js',
  'src/workspace/three-viewport-backend.js',
  'src/workspace/three-viewport-camera.js',
  'src/workspace/three-viewport-scene.js',
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
  'src/workspace/three-viewport-camera.js',
  'src/workspace/three-viewport-scene.js',
].map((file) => readFile(path.join(root, file), 'utf8')));
const rendererSource = rendererSources.join('\n');
assert.ok(!rendererSource.includes('inputxml-managed-stage'), 'Renderer parses a raw package schema.');
assert.ok(!rendererSource.includes('rvm-selected-geometry-workspace-package'), 'Renderer parses a raw package schema.');
assert.ok(rendererSources[0].includes('Canvas2DViewportBackend'));
assert.ok(rendererSources[0].includes('ThreeViewportBackend'));
assert.ok(rendererSource.includes('assertViewportRenderModel'));
assert.ok(rendererSources[2].includes('OrbitControls'));
assert.ok(rendererSources[2].includes('forceContextLoss'));
assert.ok(rendererSources[2].includes('cancelAnimationFrame'));
assert.ok(rendererSources[2].includes('ResizeObserver'));

console.log('Phase 3 viewport render-model and backend contracts passed.');
