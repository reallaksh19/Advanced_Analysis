import test from 'node:test';
import assert from 'node:assert/strict';
import {
  finalizeCanonicalTopology,
} from '../src/workspace/topology-edit/topology-edit-canonical-state.js';
import {
  TopologyEditCertifiedSession,
} from '../src/workspace/topology-edit/topology-edit-certified-session.js';

function baseTopology() {
  return finalizeCanonicalTopology({
    schema: 'topology-edit-canonical-topology/v1',
    datasetId: 'AUTHORING-FOUNDATION',
    datasetVersion: 1,
    sourceHash: 'source:authoring-foundation',
    topologyGraphHash: 'graph:authoring-foundation',
    nodes: [
      { id: 'node:start', position: { x: 0, y: 0, z: 0 }, portKeys: [] },
      { id: 'node:end', position: { x: 1000, y: 0, z: 0 }, portKeys: [] },
    ],
    edges: [
      {
        id: 'edge:host',
        componentKey: 'PIPE-1',
        fromNodeId: 'node:start',
        toNodeId: 'node:end',
        diameterMm: 100,
        outsideDiameterMm: 114.3,
        entityType: 'PIPE',
        sourcePath: '$.pipe',
      },
    ],
    junctions: [],
    supports: [],
    boundaries: [],
    rigids: [],
    bends: [],
  });
}

test('CREATE_NODE is certified, deterministic, replayable, and journal-owned', () => {
  const session = new TopologyEditCertifiedSession(baseTopology());
  const baselineHash = session.currentTopology().canonicalTopologyHash;
  const transition = session.execute('CREATE_NODE', {
    position: { x: 5000, y: 2500, z: 750 },
    creationRole: 'route endpoint',
    coordinateAuthority: 'USER_NUMERIC_ENTRY',
    sourceOperationId: 'authoring:route-001',
  });

  assert.equal(transition.disposition, 'ACCEPTED');
  assert.equal(session.journal.activeCommandIds.length, 1);
  assert.notEqual(session.currentTopology().canonicalTopologyHash, baselineHash);

  const created = session.currentTopology().nodes.filter((node) => (
    node.topologyOperation === 'CREATE_NODE'
  ));
  assert.equal(created.length, 1);
  assert.match(created[0].id, /^node:/u);
  assert.deepEqual(created[0].position, { x: 5000, y: 2500, z: 750 });
  assert.equal(created[0].creationRole, 'ROUTE_ENDPOINT');
  assert.equal(created[0].coordinateAuthority, 'USER_NUMERIC_ENTRY');
  assert.equal(created[0].sourceOperationId, 'authoring:route-001');
  assert.deepEqual(created[0].portKeys, []);

  const acceptedHash = session.currentTopology().canonicalTopologyHash;
  session.undo();
  assert.equal(session.currentTopology().canonicalTopologyHash, baselineHash);
  session.redo();
  assert.equal(session.currentTopology().canonicalTopologyHash, acceptedHash);

  const restored = new TopologyEditCertifiedSession(baseTopology());
  restored.reloadJournal(session.serializeJournal());
  assert.equal(restored.currentTopology().canonicalTopologyHash, acceptedHash);
  assert.deepEqual(restored.currentTopology(), session.currentTopology());
});

test('CREATE_NODE rejects incomplete engineering provenance', () => {
  const session = new TopologyEditCertifiedSession(baseTopology());
  assert.throws(() => session.execute('CREATE_NODE', {
    position: { x: 1, y: 2, z: 3 },
    creationRole: 'route endpoint',
    coordinateAuthority: '',
    sourceOperationId: 'authoring:bad',
  }), /coordinateAuthority is required/u);
});
