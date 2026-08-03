import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { normalizeWorkspaceDataset } from '../src/workspace/dataset-adapter.js';
import { buildResolvedEngineeringGeometry } from '../src/workspace/resolved-engineering-geometry.js';
import { buildSupportSiteModel } from '../src/workspace/support-sites/support-site-model.js';
import { buildViewportRenderModel } from '../src/workspace/viewport-render-model.js';

const REAL_MANIFEST_URL = new URL(
  './fixtures/topology-edit/1885s/fixture-manifest.json',
  import.meta.url,
);
const LARGE_MANIFEST_URL = new URL(
  './fixtures/topology-edit/large-model/fixture-manifest.json',
  import.meta.url,
);
const DATASET_URL = new URL('../benchmarks/Sjson.json', import.meta.url);
const PROJECT_DATA_URL = new URL(
  '../project-data/1885s-project-data-profile.json',
  import.meta.url,
);
const REAL_PROJECT_RUNNER_URL = new URL(
  '../scripts/run-advanced-tab-benchmarks.mjs',
  import.meta.url,
);
const REAL_PROJECT_REPORT_URL = new URL(
  '../public/qualification/advanced-tab-benchmarks.md',
  import.meta.url,
);

const REAL_PROJECT_SHA256 = '88e62782772d743e9236d13775476826f9649ab06d3161de35dc500baa85a9c6';

test('M005 retains the repository-owned 4,884-node production benchmark authority', async () => {
  const runner = await readFile(REAL_PROJECT_RUNNER_URL, 'utf8');
  const report = await readFile(REAL_PROJECT_REPORT_URL, 'utf8');
  assert.match(runner, /rawNodeCount:\s*4884/u);
  assert.match(runner, /rawSupportCount:\s*1331/u);
  assert.match(runner, /normalizedPipeCount:\s*3277/u);
  assert.match(runner, /normalizedSupportCount:\s*1331/u);
  assert.match(runner, new RegExp(REAL_PROJECT_SHA256, 'u'));
  const section = report.split('### WORKSPACE / workspace-real-project-import')[1]
    ?.split('\n### ')[0] || '';
  assert.match(section, /Status:\s*PASS/u);
  assert.match(section, /Evidence basis:\s*REAL_PROJECT/u);
  assert.match(section, /"rawNodeCount":4884/u);
  assert.match(section, /"rawSupportCount":1331/u);
  assert.match(section, /"normalizedPipeCount":3277/u);
  assert.match(section, /"normalizedSupportCount":1331/u);
  assert.equal((section.match(new RegExp(REAL_PROJECT_SHA256, 'gu')) || []).length >= 3, true);
});

test('M005 certifies repository-owned 1885S data through the real production adapters', async () => {
  const manifest = JSON.parse(await readFile(REAL_MANIFEST_URL, 'utf8'));
  const datasetSource = manifest.sources.find((row) => row.sourceId === 'dataset');
  assert.equal(datasetSource.repositoryPath, 'benchmarks/Sjson.json');
  const sourceBytes = await readFile(DATASET_URL);
  const sourceSha256 = createHash('sha256').update(sourceBytes).digest('hex');
  assert.equal(sourceSha256, datasetSource.sha256);

  const rawPackage = JSON.parse(sourceBytes.toString('utf8'));
  const projectData = JSON.parse(await readFile(PROJECT_DATA_URL, 'utf8'));
  const dataset = normalizeWorkspaceDataset(rawPackage, datasetSource.repositoryPath, {
    sourceBytes,
    sourceSha256,
  });
  const supportSites = buildSupportSiteModel(dataset, projectData);
  const resolved = buildResolvedEngineeringGeometry(dataset, projectData, supportSites);
  const renderModel = buildViewportRenderModel(resolved);

  assert.equal(dataset.summary.nodeCount, manifest.expected.nodeCount);
  assert.equal(
    supportSites.summary.sourceSupportRecordCount,
    manifest.expected.sourceSupportRecordCount,
  );
  assert.equal(
    supportSites.summary.supportAssemblyCount,
    manifest.expected.supportAssemblyCount,
  );
  assert.equal(
    supportSites.summary.physicalLocationCount,
    manifest.expected.physicalLocationCount,
  );
  assert.equal(renderModel.summary.renderableCount, manifest.expected.renderableCount);
  assert.equal(renderModel.supportOverlayPrimitives.length, 37);
  assert.equal(renderModel.diagnosticPrimitives.length, 0);
  assert.ok(Object.isFrozen(dataset));
  assert.ok(Object.isFrozen(resolved));
  assert.ok(Object.isFrozen(renderModel));

  const kinds = new Map();
  for (const row of [
    ...renderModel.physicalPrimitives,
    ...renderModel.supportOverlayPrimitives,
  ]) kinds.set(row.kind, (kinds.get(row.kind) || 0) + 1);
  assert.ok([...kinds.values()].some((count) => count >= 4),
    'Real 1885S render data must contain a repeated primitive family eligible for reuse analysis.');
});

test('M005 retains the portable 25,600-component fixture as supplemental stress evidence', async () => {
  const manifest = JSON.parse(await readFile(LARGE_MANIFEST_URL, 'utf8'));
  assert.equal(manifest.schema, 'TopologyEditPortableLargeModelFixture.v1');
  assert.equal(manifest.expected.componentCount, 25_600);
  assert.equal(manifest.expected.portable, true);
  assert.equal(manifest.expected.absolutePathDependencies, 0);
  assert.equal(manifest.qualification.percentileBudgets, true);

  const browserSpec = await readFile(
    new URL('./topology-edit-wave5-browser.spec.mjs', import.meta.url),
    'utf8',
  );
  const harness = await readFile(
    new URL('./topology-edit-wave5-browser-harness.js', import.meta.url),
    'utf8',
  );
  assert.match(browserSpec, /componentCount:\s*25_600/u);
  assert.match(harness, /TopologyEditWave5BrowserEvidence\.v2/u);
  assert.match(harness, /OPTIMIZED_IDENTITY_COUNT_MISMATCH/u);
  assert.match(harness, /M005_INSTANCE_CONVERSION_MISSING/u);
  assert.match(harness, /M005_GEOMETRY_POOLING_MISSING/u);
  assert.match(harness, /optimizerProbeCount/u);
  assert.match(harness, /firstValidFrameMs > 5_000/u);
  assert.match(harness, /pick\.p95 > 100/u);
  assert.match(harness, /navigationFrame\.p95 > 33\.3/u);
});
