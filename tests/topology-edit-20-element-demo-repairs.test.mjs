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
import { buildAutofixPolicy } from '../src/workspace/topology-edit-3d-view-controller-core.js';
import {
  buildCanonicalTopologyFromWorkspaceDataset,
} from '../src/workspace/topology-edit/topology-edit-source-adapter.js';
import {
  finalizeCanonicalTopology,
} from '../src/workspace/topology-edit/topology-edit-canonical-state.js';
import { TopologyEditCertifiedSession } from '../src/workspace/topology-edit/topology-edit-certified-session.js';
import { checkCanonicalTopology } from '../src/workspace/topology-edit/topology-edit-checker.js';
import {
  createTopologyEditCommandIntent,
} from '../src/workspace/topology-edit/topology-edit-command-ui.js';

const FIXTURE_URL = new URL(
  '../public/fixtures/topology-edit-20-element-demo.staged.json',
  import.meta.url,
);

async function fixtureContext() {
  const bytes = new Uint8Array(await readFile(FIXTURE_URL));
  const staged = JSON.parse(new TextDecoder().decode(bytes));
  const dataset = normalizeWorkspaceDataset(staged, 'topology-edit-demo', {
    sourceBytes: bytes,
    sourceSha256: createHash('sha256').update(bytes).digest('hex'),
  });
  const graph = buildPipingPortTopologyGraph(dataset.sharedModel);
  const attachments = buildSupportAttachmentModel(dataset.sharedModel, graph);
  const restraints = buildRestraintCapabilityModel(attachments);
  const canonical = finalizeCanonicalTopology(
    buildCanonicalTopologyFromWorkspaceDataset(
      dataset,
      graph,
      attachments,
      restraints,
    ),
  );
  return { dataset, canonical };
}

function edge(topology, componentKey) {
  const match = topology.edges.find((row) => row.componentKey === componentKey);
  assert.ok(match, `Missing canonical edge ${componentKey}.`);
  return match;
}

function node(topology, nodeId) {
  const match = topology.nodes.find((row) => row.id === nodeId);
  assert.ok(match, `Missing canonical node ${nodeId}.`);
  return match;
}

function distance(topology, leftId, rightId) {
  const left = node(topology, leftId).position;
  const right = node(topology, rightId).position;
  return Math.hypot(left.x - right.x, left.y - right.y, left.z - right.z);
}

test('250 mm fixture gap remains manual and replays one exact BRIDGE_GAP edge', async () => {
  const { canonical } = await fixtureContext();
  const from = edge(canonical, 'P-003').toNodeId;
  const to = edge(canonical, 'R-001').fromNodeId;
  assert.equal(distance(canonical, from, to), 250);
  assert.equal(checkCanonicalTopology(canonical).some((issue) => (
    issue.kind === 'SNAP_GAP'
      && issue.nodeIds.includes(from)
      && issue.nodeIds.includes(to)
  )), false);

  const session = new TopologyEditCertifiedSession(canonical);
  const intent = createTopologyEditCommandIntent(
    'bridge-gap',
    { nodeIds: [from, to], edgeId: null },
    session.currentTopology(),
  );
  assert.equal(intent.commandType, 'BRIDGE_GAP');
  const transition = session.execute(intent.commandType, intent.payload);
  assert.equal(transition.disposition, 'ACCEPTED');

  const added = session.currentTopology().edges.filter((row) => row.createdByCommandId);
  assert.equal(added.length, 1);
  assert.equal(added[0].fromNodeId, from);
  assert.equal(added[0].toNodeId, to);
  assert.equal(added[0].componentKey, null);
  assert.equal(added[0].diameterMm, null);
  assert.equal(distance(session.currentTopology(), from, to), 250);
  const acceptedHash = session.currentTopology().canonicalTopologyHash;

  session.undo();
  assert.equal(session.currentTopology().canonicalTopologyHash, canonical.canonicalTopologyHash);
  assert.equal(session.currentTopology().edges.some((row) => row.createdByCommandId), false);
  session.redo();
  assert.equal(session.currentTopology().canonicalTopologyHash, acceptedHash);
  assert.deepEqual(
    session.currentTopology().edges.filter((row) => row.createdByCommandId),
    added,
  );
});

test('150 mm fixture overlap produces an exact source-backed TRIM_EDGE preview', async () => {
  const { dataset, canonical } = await fixtureContext();
  const issues = checkCanonicalTopology(canonical);
  const overlap = issues.find((issue) => (
    issue.kind === 'OVERLAPPING_ELEMENTS'
      && issue.edgeIds.includes('edge:P-006')
      && issue.edgeIds.includes('edge:F-001')
      && issue.distanceMm === 150
  ));
  assert.ok(overlap, 'Expected the source-backed 150 mm overlap finding.');

  const session = new TopologyEditCertifiedSession(canonical);
  const policy = buildAutofixPolicy(dataset, canonical, issues);
  const suggestion = session.autofixSuggestions([overlap], policy)[0];
  assert.equal(suggestion.commandType, 'TRIM_EDGE');
  assert.deepEqual(suggestion.payload, {
    edgeId: 'edge:F-001',
    endpoint: 'FROM',
    position: { x: 7510, y: 0, z: 1750 },
  });
  assert.equal(JSON.stringify(suggestion).includes('fraction'), false);

  const before = session.snapshot();
  const preview = session.previewAutofix(suggestion);
  assert.equal(preview.disposition, 'ACCEPTED');
  assert.equal(preview.candidateDraftHash, preview.ghost.candidateDraftHash);
  assert.equal(session.snapshot().sessionHash, before.sessionHash);

  const transition = session.acceptAutofix(preview);
  assert.equal(transition.disposition, 'ACCEPTED');
  const trimmed = session.currentTopology();
  const flange = edge(trimmed, 'F-001');
  assert.deepEqual(node(trimmed, flange.fromNodeId).position, {
    x: 7510,
    y: 0,
    z: 1750,
  });
  assert.equal(checkCanonicalTopology(trimmed).some((issue) => issue.id === overlap.id), false);
  const acceptedHash = trimmed.canonicalTopologyHash;

  session.undo();
  assert.equal(session.currentTopology().canonicalTopologyHash, canonical.canonicalTopologyHash);
  assert.equal(checkCanonicalTopology(session.currentTopology()).some(
    (issue) => issue.id === overlap.id,
  ), true);
  session.redo();
  assert.equal(session.currentTopology().canonicalTopologyHash, acceptedHash);
  assert.equal(checkCanonicalTopology(session.currentTopology()).some(
    (issue) => issue.id === overlap.id,
  ), false);
});
