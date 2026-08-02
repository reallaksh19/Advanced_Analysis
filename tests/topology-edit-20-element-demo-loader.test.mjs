import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { buildPipingPortTopologyGraph } from '../src/core/piping-topology/index.js';
import {
  buildRestraintCapabilityModel,
  buildSupportAttachmentModel,
} from '../src/core/support-restraints/index.js';
import { normalizeWorkspaceDataset } from '../src/workspace/dataset-adapter.js';
import { EVENT_TOPICS } from '../src/workspace/event-topics.js';
import {
  TOPOLOGY_EDIT_DEMO_FIXTURE_PATH,
  loadTopologyEditDemo,
} from '../src/workspace/tree-panel-events.js';
import {
  buildCanonicalTopologyFromWorkspaceDataset,
} from '../src/workspace/topology-edit/topology-edit-source-adapter.js';
import { finalizeCanonicalTopology } from '../src/workspace/topology-edit/topology-edit-canonical-state.js';

const FIXTURE_URL = new URL(
  '../public/fixtures/topology-edit-20-element-demo.staged.json',
  import.meta.url,
);

async function fixtureBytes() {
  return new Uint8Array(await readFile(FIXTURE_URL));
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function objectById(staged, id) {
  const value = staged.objects.find((row) => row.id === id);
  assert.ok(value, `Missing fixture object ${id}.`);
  return value;
}

function pointDistance(left, right) {
  return Math.hypot(
    left[0] - right[0],
    left[1] - right[1],
    left[2] - right[2],
  );
}

test('20-element staged JSON builds editable topology and five resolved supports', async () => {
  const bytes = await fixtureBytes();
  const staged = JSON.parse(new TextDecoder().decode(bytes));
  assert.equal(staged.schema, 'inputxml-managed-stage/v1');
  assert.equal(staged.objects.length, 20);
  assert.equal(new Set(staged.objects.map((row) => row.id)).size, 20);

  const supportTypes = new Set(['REST', 'GUIDE', 'LINE_STOP', 'ANCHOR', 'SPRING']);
  assert.equal(staged.objects.filter((row) => supportTypes.has(row.type)).length, 5);
  assert.equal(staged.objects.filter((row) => !supportTypes.has(row.type)).length, 15);
  for (const type of ['PIPE', 'ELBO', 'REDUCER', 'TEE', 'VALVE', 'FLANGE', 'OLET']) {
    assert.ok(staged.objects.some((row) => row.type === type), `Missing ${type} fixture coverage.`);
  }

  const dataset = normalizeWorkspaceDataset(staged, 'topology-edit-demo', {
    sourceBytes: bytes,
    sourceSha256: sha256(bytes),
  });
  assert.deepEqual(
    {
      nodeCount: dataset.summary.nodeCount,
      pipes: dataset.summary.pipes,
      supports: dataset.summary.supports,
    },
    { nodeCount: 20, pipes: 15, supports: 5 },
  );

  const graph = buildPipingPortTopologyGraph(dataset.sharedModel);
  assert.equal(graph.components.length, 15);
  assert.equal(graph.ports.length, 31);

  const attachments = buildSupportAttachmentModel(dataset.sharedModel, graph);
  assert.equal(attachments.summary.supportCount, 5);
  assert.equal(attachments.summary.attachedCount, 5);
  assert.equal(attachments.summary.unattachedCount, 0);

  const restraints = buildRestraintCapabilityModel(attachments);
  assert.deepEqual(
    new Set(restraints.restraints.map((row) => row.supportType)),
    supportTypes,
  );

  const canonical = finalizeCanonicalTopology(
    buildCanonicalTopologyFromWorkspaceDataset(dataset, graph, attachments, restraints),
  );
  assert.equal(canonical.edges.length, 14);
  assert.equal(canonical.junctions.length, 1);
  assert.equal(canonical.supports.length, 5);
  assert.equal(canonical.supports.every((row) => row.resolved), true);
});

test('fixture retains the three intentional 3D Edit diagnostic zones', async () => {
  const staged = JSON.parse(new TextDecoder().decode(await fixtureBytes()));
  const pipe1 = objectById(staged, 'P-001');
  const elbow1 = objectById(staged, 'E-001');
  const pipe3 = objectById(staged, 'P-003');
  const reducer = objectById(staged, 'R-001');
  const pipe6 = objectById(staged, 'P-006');
  const flange = objectById(staged, 'F-001');

  assert.equal(pointDistance(pipe1.nativeParams.endPoint, elbow1.nativeParams.startPoint), 10);
  assert.equal(pointDistance(pipe3.nativeParams.endPoint, reducer.nativeParams.startPoint), 250);
  const overlap = Math.min(pipe6.nativeParams.endPoint[0], flange.nativeParams.endPoint[0])
    - Math.max(pipe6.nativeParams.startPoint[0], flange.nativeParams.startPoint[0]);
  assert.equal(overlap, 150);
  assert.equal(flange.attributes.TOPOLOGY_TRIM_ENDPOINT, 'FROM');
  assert.equal(flange.attributes.TOPOLOGY_TRIM_FRACTION, 0.5);
});

test('3D Demo loader publishes the normal source-hashed dataset load request', async () => {
  const bytes = await fixtureBytes();
  const published = [];
  let cleared = false;
  const panel = {
    demoButton: { disabled: false },
    statusElement: { textContent: '' },
    clearError() { cleared = true; },
    eventBus: { publish(topic, payload) { published.push({ topic, payload }); } },
  };

  await loadTopologyEditDemo(panel, {
    fixtureUrl: 'https://example.test/fixtures/topology-edit-demo.json',
    fetchFn: async () => new Response(bytes, { status: 200 }),
  });

  assert.equal(cleared, true);
  assert.equal(panel.demoButton.disabled, false);
  assert.match(panel.statusElement.textContent, /20-element 3D Edit demo/u);
  assert.equal(published.length, 1);
  assert.equal(published[0].topic, EVENT_TOPICS.DATASET_LOAD_REQUESTED);
  assert.equal(published[0].payload.rawPackage.objects.length, 20);
  assert.equal(published[0].payload.sourceName, 'topology-edit-20-element-demo.staged.json');
  assert.equal(published[0].payload.sourceSha256, sha256(bytes));
  assert.deepEqual(published[0].payload.sourceBytes, bytes);
});

test('demo control remains an accessible icon and has no direct workspace mutation path', async () => {
  const source = await readFile(
    new URL('../src/workspace/tree-panel-events.js', import.meta.url),
    'utf8',
  );
  assert.equal(TOPOLOGY_EDIT_DEMO_FIXTURE_PATH, 'fixtures/topology-edit-20-element-demo.staged.json');
  assert.match(source, /data-action="load-topology-edit-demo"/u);
  assert.match(source, /aria-label', 'Load 20-element 3D Edit demo'/u);
  assert.match(source, /<svg viewBox=/u);
  assert.match(source, /EVENT_TOPICS\.DATASET_LOAD_REQUESTED/u);
  assert.doesNotMatch(source, /WorkspaceState\.loadDataset/u);
});
