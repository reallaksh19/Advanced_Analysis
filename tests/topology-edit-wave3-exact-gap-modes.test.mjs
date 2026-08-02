import test from 'node:test';
import assert from 'node:assert/strict';
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
