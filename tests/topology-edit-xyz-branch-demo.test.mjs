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
  loadTopologyEditXyzBranchDemo,
  materializeTopologyEditDemoScenario,
  TOPOLOGY_EDIT_XYZ_BRANCH_SCENARIO_ID,
} from '../src/workspace/tree-panel-events.js';
import {
  buildCanonicalTopologyFromWorkspaceDataset,
} from '../src/workspace/topology-edit/topology-edit-source-adapter.js';
import {
  finalizeCanonicalTopology,
} from '../src/workspace/topology-edit/topology-edit-canonical-state.js';

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

function scenarioFrom(staged) {
  const rows = staged.demo?.embeddedScenarios?.filter(
    (row) => row.id === TOPOLOGY_EDIT_XYZ_BRANCH_SCENARIO_ID,
  ) ?? [];
  assert.equal(rows.length, 1);
  return rows[0];
}

function objectById(rows, id) {
  const row = rows.find((candidate) => candidate.id === id);
  assert.ok(row, `Missing object ${id}.`);
  return row;
}

test('embedded XYZ branch retains ten piping elements, full component coverage, and two distinct supports', async () => {
  const staged = JSON.parse(new TextDecoder().decode(await fixtureBytes()));
  const scenario = scenarioFrom(staged);
  const supportTypes = new Set(['REST', 'GUIDE', 'LINE_STOP', 'ANCHOR', 'SPRING']);
  const piping = scenario.objects.filter((row) => !supportTypes.has(row.type));
  const supports = scenario.objects.filter((row) => supportTypes.has(row.type));

  assert.equal(scenario.hostObjectId, 'P-007');
  assert.equal(scenario.rootComponentId, 'T-001');
  assert.equal(scenario.branchElementCount, 10);
  assert.equal(scenario.objectCount, 12);
  assert.equal(piping.length, 10);
  assert.equal(supports.length, 2);
  assert.deepEqual(new Set(scenario.axisCoverage), new Set(['X', 'Y', 'Z']));
  assert.deepEqual(
    new Set(scenario.componentCoverage),
    new Set(['TEE', 'PIPE', 'ELBO', 'REDUCER', 'VALVE', 'FLANGE', 'OLET']),
  );
  for (const type of ['PIPE', 'ELBO', 'REDUCER', 'VALVE', 'FLANGE', 'OLET']) {
    assert.ok(piping.some((row) => row.type === type), `Missing ${type} in XYZ branch.`);
  }

  const rest = objectById(supports, 'S-006');
  const guide = objectById(supports, 'S-007');
  assert.equal(rest.type, 'REST');
  assert.equal(rest.attributes.ATTACHED_COMPONENT_ID, 'P-009');
  assert.equal(guide.type, 'GUIDE');
  assert.equal(guide.attributes.ATTACHED_COMPONENT_ID, 'P-011');
  assert.notEqual(
    rest.attributes.ATTACHED_COMPONENT_ID,
    guide.attributes.ATTACHED_COMPONENT_ID,
  );

  const axes = new Set();
  piping.forEach((row) => {
    const start = row.nativeParams.startPoint;
    const end = row.nativeParams.endPoint;
    ['X', 'Y', 'Z'].forEach((axis, index) => {
      if (Math.abs(end[index] - start[index]) > 1e-9) axes.add(axis);
    });
  });
  assert.deepEqual(axes, new Set(['X', 'Y', 'Z']));
});

test('XYZ scenario materializes a source-hashed 32-object dataset with seven resolved supports', async () => {
  const fixture = JSON.parse(new TextDecoder().decode(await fixtureBytes()));
  const materialized = materializeTopologyEditDemoScenario(fixture);
  const sourceBytes = new TextEncoder().encode(`${JSON.stringify(materialized)}\n`);

  assert.equal(materialized.objects.length, 32);
  assert.equal(materialized.demo.objectCount, 32);
  assert.equal(materialized.demo.pipingObjectCount, 25);
  assert.equal(materialized.demo.supportObjectCount, 7);
  assert.equal(materialized.demo.activeScenario.id, TOPOLOGY_EDIT_XYZ_BRANCH_SCENARIO_ID);
  assert.equal(new Set(materialized.objects.map((row) => row.id)).size, 32);

  const dataset = normalizeWorkspaceDataset(materialized, 'topology-edit-xyz-branch-demo', {
    sourceBytes,
    sourceSha256: sha256(sourceBytes),
  });
  assert.deepEqual(
    {
      nodeCount: dataset.summary.nodeCount,
      pipes: dataset.summary.pipes,
      supports: dataset.summary.supports,
    },
    { nodeCount: 32, pipes: 25, supports: 7 },
  );

  const graph = buildPipingPortTopologyGraph(dataset.sharedModel);
  assert.equal(graph.components.length, 25);
  const attachments = buildSupportAttachmentModel(dataset.sharedModel, graph);
  assert.deepEqual(
    attachments.summary,
    { supportCount: 7, attachedCount: 7, unattachedCount: 0 },
  );
  const restraints = buildRestraintCapabilityModel(attachments);
  const canonical = finalizeCanonicalTopology(
    buildCanonicalTopologyFromWorkspaceDataset(dataset, graph, attachments, restraints),
  );
  assert.equal(canonical.supports.length, 7);
  assert.equal(canonical.supports.every((row) => row.resolved), true);
  assert.ok(canonical.junctions.length >= 2);
});

test('XYZ branch loader publishes the materialized package and matching source bytes', async () => {
  const bytes = await fixtureBytes();
  const published = [];
  let cleared = false;
  const panel = {
    xyzBranchDemoButton: { disabled: false },
    statusElement: { textContent: '' },
    clearError() { cleared = true; },
    eventBus: { publish(topic, payload) { published.push({ topic, payload }); } },
  };

  await loadTopologyEditXyzBranchDemo(panel, {
    fixtureUrl: 'https://example.test/fixtures/topology-edit-demo.json',
    fetchFn: async () => new Response(bytes, { status: 200 }),
  });

  assert.equal(cleared, true);
  assert.equal(panel.xyzBranchDemoButton.disabled, false);
  assert.match(panel.statusElement.textContent, /10-element XYZ branch demo/u);
  assert.equal(published.length, 1);
  assert.equal(published[0].topic, EVENT_TOPICS.DATASET_LOAD_REQUESTED);
  assert.equal(published[0].payload.sourceName, 'topology-edit-xyz-10-element-branch.staged.json');
  assert.equal(published[0].payload.rawPackage.objects.length, 32);
  assert.equal(
    published[0].payload.rawPackage.demo.activeScenario.id,
    TOPOLOGY_EDIT_XYZ_BRANCH_SCENARIO_ID,
  );
  assert.equal(
    published[0].payload.sourceSha256,
    sha256(published[0].payload.sourceBytes),
  );
  assert.deepEqual(
    JSON.parse(new TextDecoder().decode(published[0].payload.sourceBytes)),
    published[0].payload.rawPackage,
  );
});

test('workspace source exposes an accessible XYZ branch demo action', async () => {
  const source = await readFile(
    new URL('../src/workspace/tree-panel-events.js', import.meta.url),
    'utf8',
  );
  assert.match(source, /data-action="load-topology-edit-xyz-branch-demo"/u);
  assert.match(source, /Load 10-element XYZ branch demo/u);
  assert.match(source, /<span>XYZ Branch<\/span>/u);
  assert.match(source, /materializeTopologyEditDemoScenario/u);
});
