import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { buildPipingPortTopologyGraph } from '../src/core/piping-topology/index.js';
import {
  buildRestraintCapabilityModel,
  buildSupportAttachmentModel,
} from '../src/core/support-restraints/index.js';
import { normalizeWorkspaceDataset } from '../src/workspace/dataset-adapter.js';
import {
  buildCanonicalTopologyFromWorkspaceDataset,
} from '../src/workspace/topology-edit/topology-edit-source-adapter.js';
import {
  finalizeCanonicalTopology,
} from '../src/workspace/topology-edit/topology-edit-canonical-state.js';
import {
  TopologyEditCertifiedSession,
} from '../src/workspace/topology-edit/topology-edit-certified-session.js';
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

function syntheticGapTopology(gapMm = 10) {
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

const syntheticSelection = Object.freeze({
  nodeIds: Object.freeze(['node:anchor', 'node:moving']),
  edgeId: null,
});

function snapIssue(topology, nodeIds = null) {
  return checkCanonicalTopology(topology).find((issue) => (
    issue.kind === 'SNAP_GAP'
      && (!nodeIds || nodeIds.every((nodeId) => issue.nodeIds.includes(nodeId)))
  ));
}

function runSyntheticCase(actionId, expectedGapMm) {
  const session = new TopologyEditCertifiedSession(syntheticGapTopology());
  assert.equal(
    topologyEditExactGapContext(syntheticSelection, session.currentTopology()).currentGapMm,
    10,
  );
  const intent = createTopologyEditCommandIntent(
    actionId, syntheticSelection, session.currentTopology(),
  );
  assert.deepEqual(intent, {
    commandType: 'MOVE_NODE',
    payload: { nodeId: 'node:moving', position: { x: expectedGapMm, y: 0, z: 0 } },
  });
  assert.equal(session.execute(intent.commandType, intent.payload).disposition, 'ACCEPTED');

  const issue = snapIssue(session.currentTopology());
  assert.equal(issue.distanceMm, expectedGapMm);
  assert.equal(issue.suggestedAutofix, 'MERGE_NODES');
  const [suggestion] = session.autofixSuggestions([issue]);
  const beforePreview = session.snapshot().sessionHash;
  const preview = session.previewAutofix(suggestion);
  assert.equal(preview.disposition, 'ACCEPTED');
  assert.equal(preview.candidateDraftHash, preview.ghost.candidateDraftHash);
  assert.equal(session.snapshot().sessionHash, beforePreview);

  assert.equal(session.acceptAutofix(preview).disposition, 'ACCEPTED');
  assert.equal(snapIssue(session.currentTopology()), undefined);
  const mergedHash = session.currentTopology().canonicalTopologyHash;
  session.undo();
  assert.equal(snapIssue(session.currentTopology()).distanceMm, expectedGapMm);
  session.undo();
  assert.equal(snapIssue(session.currentTopology()).distanceMm, 10);
  session.redo();
  assert.equal(snapIssue(session.currentTopology()).distanceMm, expectedGapMm);
  session.redo();
  assert.equal(session.currentTopology().canonicalTopologyHash, mergedHash);
  return preview.candidateDraftHash;
}

async function loadDemoCanonical() {
  const sourceBytes = new Uint8Array(await readFile(FIXTURE_URL));
  const raw = JSON.parse(new TextDecoder().decode(sourceBytes));
  const dataset = normalizeWorkspaceDataset(raw, 'topology-edit-demo', {
    sourceBytes,
    sourceSha256: createHash('sha256').update(sourceBytes).digest('hex'),
  });
  const graph = buildPipingPortTopologyGraph(dataset.sharedModel);
  const attachments = buildSupportAttachmentModel(dataset.sharedModel, graph);
  const restraints = buildRestraintCapabilityModel(attachments);
  return finalizeCanonicalTopology(buildCanonicalTopologyFromWorkspaceDataset(
    dataset, graph, attachments, restraints,
  ));
}

function componentEndpoint(topology, componentKey, endpoint) {
  const edge = topology.edges.find((row) => row.componentKey === componentKey);
  assert.ok(edge, `Missing canonical edge for ${componentKey}.`);
  const nodeId = endpoint === 'FROM' ? edge.fromNodeId : edge.toNodeId;
  const degree = topology.edges.filter((row) => (
    row.fromNodeId === nodeId || row.toNodeId === nodeId
  )).length;
  assert.equal(degree, 1, `${componentKey} ${endpoint} must be graph-open.`);
  return nodeId;
}

function distanceBetween(topology, leftId, rightId) {
  const points = new Map(topology.nodes.map((node) => [node.id, node.position]));
  const left = points.get(leftId); const right = points.get(rightId);
  return Math.hypot(left.x - right.x, left.y - right.y, left.z - right.z);
}

test('exact-gap controls retain MOVE_NODE authority and explicit labels', () => {
  assert.deepEqual(TOPOLOGY_EDIT_EXACT_GAP_MM, { 'set-gap-3': 3, 'set-gap-20': 20 });
  const labels = new Map(TOPOLOGY_EDIT_COMMAND_ACTIONS.map((row) => [row.id, row.label]));
  assert.equal(labels.get('set-gap-3'), 'Set gap 3 mm');
  assert.equal(labels.get('set-gap-20'), 'Set gap 20 mm');
  assert.equal(canRunTopologyEditAction('set-gap-3', syntheticSelection), true);
});

test('exact-gap controls reject connected or non-open node pairs', () => {
  const base = syntheticGapTopology();
  const connected = finalizeCanonicalTopology({
    ...JSON.parse(JSON.stringify(base)),
    edges: [...base.edges, {
      id: 'edge:connected', componentKey: null,
      fromNodeId: 'node:anchor', toNodeId: 'node:moving',
      entityType: 'PIPE', sourcePath: null,
    }],
  });
  assert.equal(canRunTopologyEditAction('set-gap-3', syntheticSelection, connected), false);
  assert.throws(() => createTopologyEditCommandIntent(
    'set-gap-20', syntheticSelection, connected,
  ), /required exact selection and topology context/);
});

test('3 mm and 20 mm gaps detect and repair through certified preview', () => {
  const three = runSyntheticCase('set-gap-3', 3);
  const twenty = runSyntheticCase('set-gap-20', 20);
  assert.notEqual(three, twenty);
});

test('250 mm remains outside snap autofix and uses manual bridge', () => {
  const topology = syntheticGapTopology(250);
  assert.equal(snapIssue(topology), undefined);
  assert.deepEqual(
    new TopologyEditCertifiedSession(topology).autofixSuggestions(
      checkCanonicalTopology(topology),
    ),
    [],
  );
  assert.equal(
    createTopologyEditCommandIntent('bridge-gap', syntheticSelection, topology).commandType,
    'BRIDGE_GAP',
  );
});

test('real 20-object fixture qualifies 3 mm, 20 mm, and 250 mm paths', async () => {
  const canonical = await loadDemoCanonical();
  const anchorNodeId = componentEndpoint(canonical, 'P-001', 'TO');
  const movingNodeId = componentEndpoint(canonical, 'E-001', 'FROM');
  const selection = Object.freeze({
    nodeIds: Object.freeze([anchorNodeId, movingNodeId]), edgeId: null,
  });
  assert.equal(distanceBetween(canonical, anchorNodeId, movingNodeId), 10);
  assert.equal(snapIssue(canonical, [anchorNodeId, movingNodeId]).distanceMm, 10);

  const candidateHashes = [];
  for (const [actionId, requestedGapMm] of [['set-gap-3', 3], ['set-gap-20', 20]]) {
    const session = new TopologyEditCertifiedSession(canonical);
    const intent = createTopologyEditCommandIntent(actionId, selection, session.currentTopology());
    assert.equal(session.execute(intent.commandType, intent.payload).disposition, 'ACCEPTED');
    const issue = snapIssue(session.currentTopology(), [anchorNodeId, movingNodeId]);
    assert.equal(issue.distanceMm, requestedGapMm);
    const preview = session.previewAutofix(session.autofixSuggestions([issue])[0]);
    assert.equal(preview.disposition, 'ACCEPTED');
    assert.equal(session.acceptAutofix(preview).disposition, 'ACCEPTED');
    assert.equal(snapIssue(session.currentTopology(), [anchorNodeId, movingNodeId]), undefined);
    candidateHashes.push(preview.candidateDraftHash);
  }
  assert.notEqual(candidateHashes[0], candidateHashes[1]);

  const bridgeSelection = {
    nodeIds: [
      componentEndpoint(canonical, 'P-003', 'TO'),
      componentEndpoint(canonical, 'R-001', 'FROM'),
    ],
    edgeId: null,
  };
  assert.equal(distanceBetween(canonical, ...bridgeSelection.nodeIds), 250);
  assert.equal(
    createTopologyEditCommandIntent('bridge-gap', bridgeSelection, canonical).commandType,
    'BRIDGE_GAP',
  );
});
