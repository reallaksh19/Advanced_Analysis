import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { finalizeCanonicalTopology } from '../src/workspace/topology-edit/topology-edit-canonical-state.js';
import { TopologyEditCertifiedSession } from '../src/workspace/topology-edit/topology-edit-certified-session.js';
import {
  TOPOLOGY_EDIT_COMMAND_ACTIONS,
  createTopologyEditCommandIntent,
  createTopologyEditSelection,
  updateTopologyEditSelection,
} from '../src/workspace/topology-edit/topology-edit-command-ui.js';

function baseTopology(overrides = {}) {
  return finalizeCanonicalTopology({
    schema: 'topology-edit-canonical-topology/v1',
    datasetId: 'DS-1',
    datasetVersion: 0,
    sourceHash: 'source:abc',
    topologyGraphHash: 'graph:abc',
    nodes: [
      { id: 'node:n1', position: { x: 0, y: 0, z: 0 }, portKeys: ['P1:port:start'] },
      { id: 'node:n2', position: { x: 100, y: 0, z: 0 }, portKeys: ['P1:port:end'] },
      { id: 'node:n3', position: { x: 200, y: 0, z: 0 }, portKeys: ['P2:port:start'] },
      { id: 'node:n4', position: { x: 300, y: 0, z: 0 }, portKeys: ['P2:port:end'] },
    ],
    edges: [
      { id: 'edge:e1', componentKey: 'P1', fromNodeId: 'node:n1', toNodeId: 'node:n2', diameterMm: 100, entityType: 'PIPE', sourcePath: '$[0]' },
      { id: 'edge:e2', componentKey: 'P2', fromNodeId: 'node:n3', toNodeId: 'node:n4', diameterMm: 80, entityType: 'PIPE', sourcePath: '$[1]' },
    ],
    junctions: [],
    supports: [],
    boundaries: [],
    rigids: [],
    ...overrides,
  });
}

function accepted(commandType, payload) {
  const base = baseTopology();
  const session = new TopologyEditCertifiedSession(base);
  const before = JSON.stringify(base);
  const transition = session.execute(commandType, payload);
  assert.equal(transition.disposition, 'ACCEPTED');
  assert.equal(JSON.stringify(base), before);
  return { base, session, transition };
}

test('production session consumes all eight native governed commands', () => {
  accepted('CREATE_NODE', {
    position: { x: 500, y: 100, z: 0 },
    creationRole: 'ROUTE_ENDPOINT',
    coordinateAuthority: 'USER_NUMERIC_ENTRY',
    sourceOperationId: 'integration:create-node',
  });
  accepted('MOVE_NODE', { nodeId: 'node:n1', position: { x: 10, y: 0, z: 0 } });
  accepted('MERGE_NODES', { sourceNodeId: 'node:n3', targetNodeId: 'node:n2' });
  accepted('BRIDGE_GAP', { fromNodeId: 'node:n2', toNodeId: 'node:n3' });
  accepted('ADD_STRAIGHT_ELEMENT', { fromNodeId: 'node:n2', toNodeId: 'node:n3' });
  accepted('SPLIT_EDGE', { edgeId: 'edge:e1', fraction: 0.5 });
  accepted('DISCONNECT_ENDPOINT', { edgeId: 'edge:e1', endpoint: 'FROM' });
  accepted('DELETE_EDGE', { edgeId: 'edge:e1' });
});

test('UI action mapping exposes fixed behavior instead of hidden defaults', () => {
  const topology = baseTopology();
  let selection = createTopologyEditSelection();
  selection = updateTopologyEditSelection(selection, 'node:n1');
  const move = createTopologyEditCommandIntent('move-positive-z', selection, topology);
  assert.deepEqual(move.payload.position, { x: 0, y: 0, z: 100 });

  selection = updateTopologyEditSelection(selection, 'node:n2', true);
  const merge = createTopologyEditCommandIntent('merge-nodes', selection, topology);
  assert.deepEqual(merge.payload, { sourceNodeId: 'node:n1', targetNodeId: 'node:n2' });
  assert.equal(TOPOLOGY_EDIT_COMMAND_ACTIONS.find((row) => row.id === 'split-edge-half').label, 'Split edge 50%');
  assert.match(TOPOLOGY_EDIT_COMMAND_ACTIONS.find((row) => row.id === 'bridge-gap').title, /diameter remains unresolved/i);
});

test('session undo and redo remain replay-derived in the production boundary', () => {
  const base = baseTopology();
  const session = new TopologyEditCertifiedSession(base);
  session.execute('MOVE_NODE', { nodeId: 'node:n1', position: { x: 10, y: 0, z: 0 } });
  session.execute('MOVE_NODE', { nodeId: 'node:n4', position: { x: 310, y: 0, z: 0 } });
  const editedHash = session.currentTopology().canonicalTopologyHash;
  session.undo();
  assert.equal(session.journal.activeCommandIds.length, 1);
  session.redo();
  assert.equal(session.currentTopology().canonicalTopologyHash, editedHash);
});

test('active production session fails closed when workspace authority changes', () => {
  const base = baseTopology();
  const session = new TopologyEditCertifiedSession(base);
  session.execute('MOVE_NODE', { nodeId: 'node:n1', position: { x: 10, y: 0, z: 0 } });
  const changed = baseTopology({ sourceHash: 'source:changed' });
  assert.equal(session.reconcileBase(changed), 'STALE');
  assert.throws(
    () => session.execute('MOVE_NODE', { nodeId: 'node:n4', position: { x: 310, y: 0, z: 0 } }),
    /Workspace source or base topology changed/,
  );
});

test('controller production path cannot bypass certified Wave 1 authority', async () => {
  const [controllerSource, coreSource] = await Promise.all([
    readFile('src/workspace/topology-edit-3d-view-controller.js', 'utf8'),
    readFile('src/workspace/topology-edit-3d-view-controller-core.js', 'utf8'),
  ]);
  const productionPath = `${controllerSource}\n${coreSource}`;
  assert.match(productionPath, /TopologyEditCertifiedSession/);
  assert.match(productionPath, /TOPOLOGY_EDIT_COMMAND_ACTIONS/);
  for (const prohibited of [
    'commitDraftToWorkspace',
    'applyCanonicalTopologyToWorkspaceEntities',
    'TopologyEditAutofixController',
    'Date.now',
    'TopologyEditCommandJournal',
  ]) {
    assert.equal(controllerSource.includes(prohibited), false, `controller must not reference ${prohibited}`);
  }
});
