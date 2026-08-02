import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { buildPipingPortTopologyGraph } from '../src/core/piping-topology/index.js';
import { buildRestraintCapabilityModel, buildSupportAttachmentModel } from '../src/core/support-restraints/index.js';
import { normalizeWorkspaceDataset } from '../src/workspace/dataset-adapter.js';
import { buildCanonicalTopologyFromWorkspaceDataset } from '../src/workspace/topology-edit/topology-edit-source-adapter.js';
import { finalizeCanonicalTopology } from '../src/workspace/topology-edit/topology-edit-canonical-state.js';
import { TopologyEditCertifiedSession } from '../src/workspace/topology-edit/topology-edit-certified-session.js';
import { checkCanonicalTopology } from '../src/workspace/topology-edit/topology-edit-checker.js';
import {
  TOPOLOGY_EDIT_COMMAND_ACTIONS,
  TOPOLOGY_EDIT_EXACT_GAP_MM,
  canRunTopologyEditAction,
  createTopologyEditCommandIntent,
  topologyEditExactGapContext,
} from '../src/workspace/topology-edit/topology-edit-command-ui.js';

const FIXTURE_URL = new URL(
  '../public/fixtures/topology-edit-20-element-demo.staged.json',
  import.meta.url,
);

async function demoCanonicalTopology() {
  const bytes = new Uint8Array(await readFile(FIXTURE_URL));
  const staged = JSON.parse(new TextDecoder().decode(bytes));
  const sourceSha256 = createHash('sha256').update(bytes).digest('hex');
  const dataset = normalizeWorkspaceDataset(staged, 'topology-edit-demo', {
    sourceBytes: bytes,
    sourceSha256,
  });
  const graph = buildPipingPortTopologyGraph(dataset.sharedModel);
  const attachments = buildSupportAttachmentModel(dataset.sharedModel, graph);
  const restraints = buildRestraintCapabilityModel(attachments);
  return finalizeCanonicalTopology(buildCanonicalTopologyFromWorkspaceDataset(
    dataset, graph, attachments, restraints,
  ));
}

function openEndpointForComponent(topology, componentKey) {
  const degree = new Map(topology.nodes.map((node) => [node.id, 0]));
  for (const edge of topology.edges) {
    degree.set(edge.fromNodeId, (degree.get(edge.fromNodeId) ?? 0) + 1);
    degree.set(edge.toNodeId, (degree.get(edge.toNodeId) ?? 0) + 1);
  }
  const edge = topology.edges.find((row) => row.componentKey === componentKey);
  assert.ok(edge, `Missing canonical edge for ${componentKey}.`);
  const candidates = [edge.fromNodeId, edge.toNodeId].filter((id) => degree.get(id) === 1);
  assert.equal(candidates.length, 1, `${componentKey} must expose one graph-open endpoint.`);
  return candidates[0];
}

function nodeDistance(topology, leftId, rightId) {
  const nodes = new Map(topology.nodes.map((node) => [node.id, node.position]));
  const left = nodes.get(leftId); const right = nodes.get(rightId);
  return Math.hypot(left.x - right.x, left.y - right.y, left.z - right.z);
}

function gapTopology(gapMm = 10) {
  return finalizeCanonicalTopology({
    schema: 'topology-edit-canonical-topology/v1',
    datasetId: 'EXACT-GAP-DEMO',
    datasetVersion: 0,
    sourceHash: 'source:exact-gap-demo',
    topologyGraphHash: 'graph:exact-gap-demo',
    nodes: [
      { id: 'node:left-tail', position: { x: -100, y: 0, z: 0 }, portKeys: [] },
      { id: 'node:anchor', position: { x: 0, y: 0, z: 0 }, portKeys: [] },
      { id: 'node:moving', position: { x: gapMm, y: 0, z: 0 }, portKeys: [] },
      { id: 'node:right-tail', position: { x: 110, y: 0, z: 0 }, portKeys: [] },
    ],
    edges: [
      { id: 'edge:left', componentKey: 'P-001', fromNodeId: 'node:left-tail',
        toNodeId: 'node:anchor', entityType: 'PIPE', sourcePath: '/demo/P-001' },
      { id: 'edge:right', componentKey: 'E-001', fromNodeId: 'node:moving',
        toNodeId: 'node:right-tail', entityType: 'PIPE', sourcePath: '/demo/E-001' },
    ],
    junctions: [], supports: [], boundaries: [], rigids: [],
  });
}

const selection = Object.freeze({
  nodeIds: Object.freeze(['node:anchor', 'node:moving']),
  edgeId: null,
});

function gapIssue(topology) {
  return checkCanonicalTopology(topology).find((issue) => issue.kind === 'SNAP_GAP');
}

function runExactGapCase(actionId, expectedGapMm) {
  const session = new TopologyEditCertifiedSession(gapTopology());
  const context = topologyEditExactGapContext(selection, session.currentTopology());
  assert.equal(context.currentGapMm, 10);
  assert.equal(canRunTopologyEditAction(actionId, selection, session.currentTopology()), true);

  const intent = createTopologyEditCommandIntent(actionId, selection, session.currentTopology());
  assert.equal(intent.commandType, 'MOVE_NODE');
  assert.equal(intent.payload.nodeId, 'node:moving');
  assert.deepEqual(intent.payload.position, { x: expectedGapMm, y: 0, z: 0 });
  assert.equal(session.execute(intent.commandType, intent.payload).disposition, 'ACCEPTED');

  const moved = session.currentTopology();
  const issue = gapIssue(moved);
  assert.equal(issue.distanceMm, expectedGapMm);
  assert.equal(issue.suggestedAutofix, 'MERGE_NODES');

  const [suggestion] = session.autofixSuggestions([issue]);
  assert.equal(suggestion.commandType, 'MERGE_NODES');
  const beforePreview = session.snapshot();
  const preview = session.previewAutofix(suggestion);
  assert.equal(preview.disposition, 'ACCEPTED');
  assert.equal(preview.candidateDraftHash, preview.ghost.candidateDraftHash);
  assert.equal(session.snapshot().sessionHash, beforePreview.sessionHash,
    'preview/cancel path must not mutate the journal');

  assert.equal(session.acceptAutofix(preview).disposition, 'ACCEPTED');
  assert.equal(gapIssue(session.currentTopology()), undefined);
  const mergedHash = session.currentTopology().canonicalTopologyHash;

  session.undo();
  assert.equal(gapIssue(session.currentTopology()).distanceMm, expectedGapMm);
  session.undo();
  assert.equal(gapIssue(session.currentTopology()).distanceMm, 10);
  session.redo();
  assert.equal(gapIssue(session.currentTopology()).distanceMm, expectedGapMm);
  session.redo();
  assert.equal(session.currentTopology().canonicalTopologyHash, mergedHash);
  assert.equal(gapIssue(session.currentTopology()), undefined);

  return preview.candidateDraftHash;
}

test('3 mm and 20 mm controls are additive MOVE_NODE modes with explicit labels', () => {
  assert.deepEqual(TOPOLOGY_EDIT_EXACT_GAP_MM, {
    'set-gap-3': 3,
    'set-gap-20': 20,
  });
  const labels = new Map(TOPOLOGY_EDIT_COMMAND_ACTIONS.map((row) => [row.id, row.label]));
  assert.equal(labels.get('set-gap-3'), 'Set gap 3 mm');
  assert.equal(labels.get('set-gap-20'), 'Set gap 20 mm');
  assert.equal(canRunTopologyEditAction('set-gap-3', selection), true,
    'the production toolbar enables after two-node selection before guarded intent creation');
});

test('exact-gap controls require graph-open endpoints in different components', () => {
  const base = gapTopology();
  assert.equal(topologyEditExactGapContext(selection, base)?.movingNodeId, 'node:moving');
  assert.equal(canRunTopologyEditAction('set-gap-3', selection, base), true);

  const sameComponent = finalizeCanonicalTopology({
    ...JSON.parse(JSON.stringify(base)),
    edges: [...base.edges, {
      id: 'edge:connected', componentKey: null, fromNodeId: 'node:anchor',
      toNodeId: 'node:moving', entityType: 'PIPE', sourcePath: null,
    }],
  });
  assert.equal(canRunTopologyEditAction('set-gap-3', selection, sameComponent), false);
  assert.throws(() => createTopologyEditCommandIntent('set-gap-20', selection, sameComponent),
    /required exact selection and topology context/);
});

test('3 mm and 20 mm deliberate gaps are detected and repaired by certified preview', () => {
  const threeMillimetreCandidate = runExactGapCase('set-gap-3', 3);
  const twentyMillimetreCandidate = runExactGapCase('set-gap-20', 20);
  assert.notEqual(threeMillimetreCandidate, twentyMillimetreCandidate);
});

test('250 mm fixture-class gap remains outside snap autofix and available for manual bridge', () => {
  const topology = gapTopology(250);
  assert.equal(gapIssue(topology), undefined);
  assert.deepEqual(
    checkCanonicalTopology(topology).filter((issue) => issue.kind === 'SNAP_GAP'),
    [],
  );
  assert.deepEqual(new TopologyEditCertifiedSession(topology).autofixSuggestions(
    checkCanonicalTopology(topology),
  ), []);
  assert.equal(canRunTopologyEditAction('bridge-gap', selection, topology), true);
  const bridge = createTopologyEditCommandIntent('bridge-gap', selection, topology);
  assert.equal(bridge.commandType, 'BRIDGE_GAP');
});

test('real 20-object staged JSON supports both exact-gap validator exercises', async () => {
  const canonical = await demoCanonicalTopology();
  const anchorNodeId = openEndpointForComponent(canonical, 'P-001');
  const movingNodeId = openEndpointForComponent(canonical, 'E-001');
  const realSelection = Object.freeze({
    nodeIds: Object.freeze([anchorNodeId, movingNodeId]),
    edgeId: null,
  });
  assert.equal(nodeDistance(canonical, anchorNodeId, movingNodeId), 10);
  const initialSnap = checkCanonicalTopology(canonical).find((issue) => (
    issue.kind === 'SNAP_GAP' && issue.nodeIds.includes(anchorNodeId)
      && issue.nodeIds.includes(movingNodeId)
  ));
  assert.equal(initialSnap.distanceMm, 10);

  const candidateHashes = [];
  for (const [actionId, requestedGapMm] of [['set-gap-3', 3], ['set-gap-20', 20]]) {
    const session = new TopologyEditCertifiedSession(canonical);
    const intent = createTopologyEditCommandIntent(
      actionId, realSelection, session.currentTopology(),
    );
    assert.equal(session.execute(intent.commandType, intent.payload).disposition, 'ACCEPTED');
    const movedIssue = checkCanonicalTopology(session.currentTopology()).find((issue) => (
      issue.kind === 'SNAP_GAP' && issue.nodeIds.includes(anchorNodeId)
        && issue.nodeIds.includes(movingNodeId)
    ));
    assert.equal(movedIssue.distanceMm, requestedGapMm);
    const [suggestion] = session.autofixSuggestions([movedIssue]);
    const preview = session.previewAutofix(suggestion);
    assert.equal(preview.disposition, 'ACCEPTED');
    assert.equal(session.acceptAutofix(preview).disposition, 'ACCEPTED');
    assert.equal(checkCanonicalTopology(session.currentTopology()).some((issue) => (
      issue.kind === 'SNAP_GAP' && issue.id === movedIssue.id
    )), false);
    candidateHashes.push(preview.candidateDraftHash);
  }
  assert.notEqual(candidateHashes[0], candidateHashes[1]);

  const bridgeFrom = openEndpointForComponent(canonical, 'P-003');
  const bridgeTo = openEndpointForComponent(canonical, 'R-001');
  assert.equal(nodeDistance(canonical, bridgeFrom, bridgeTo), 250);
  const bridgeSelection = { nodeIds: [bridgeFrom, bridgeTo], edgeId: null };
  assert.equal(createTopologyEditCommandIntent(
    'bridge-gap', bridgeSelection, canonical,
  ).commandType, 'BRIDGE_GAP');
});
