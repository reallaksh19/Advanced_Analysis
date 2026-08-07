import test from 'node:test';
import assert from 'node:assert/strict';
import { finalizeCanonicalTopology } from '../src/workspace/topology-edit/topology-edit-canonical-state.js';
import { TopologyEditCertifiedSession } from '../src/workspace/topology-edit/topology-edit-certified-session.js';

const BALL = Object.freeze({
  catalogueHash: 'sha256:valve-catalogue-v2',
  sourceHash: 'sha256:valve-source-v2',
  recordId: 'VALVE-BALL-DN80-C150',
  recordHash: 'sha256:ball-dn80-c150',
  componentType: 'VALVE',
  nominalSizeMm: 80,
  outsideDiameterMm: 88.9,
  pipingClass: 'PCL-80',
  pressureClass: '150',
  materialSpecification: 'A216-WCB',
  componentMassKg: 24,
  endConnectionFrom: 'FLANGED',
  endConnectionTo: 'FLANGED',
  valveType: 'BALL',
  valveFaceToFaceMm: 300,
  sourceReference: { documentId: 'VALVES', revision: 'R2', path: '/DN80/BALL/150' },
});
const REDUCER_CUSTODY = Object.freeze({
  catalogueHash: 'sha256:reducer-catalogue-v1',
  sourceHash: 'sha256:reducer-source-v1',
  recordId: 'RED-DN100-DN80',
  recordHash: 'sha256:red-100-80',
  componentType: 'REDUCER',
  fromNominalSizeMm: 100,
  toNominalSizeMm: 80,
});

function topologyFixture() {
  return finalizeCanonicalTopology({
    schema: 'topology-edit-canonical-topology/v1',
    datasetId: 'dataset-m06-m10', datasetVersion: 8, sourceHash: 'sha256:m06-m10-source',
    topologyGraphHash: 'sha256:m06-m10-graph',
    nodes: [
      node('node:run-a', -1000, 0, ['tee:1:port:run-a']),
      node('node:run-b', 1000, 0, ['tee:1:port:run-b']),
      node('node:branch', 0, 500, ['tee:1:port:branch']),
      node('node:p1', 0, 800), node('node:p2', 2200, 800),
      node('node:p3', 2400, 800), node('node:p4', 3400, 800),
    ],
    edges: [
      reducer(),
      pipe('edge:m04', 'node:p1', 'node:p2'),
      gateValve(),
      pipe('edge:tail', 'node:p3', 'node:p4'),
    ],
    junctions: [{
      id: 'junction:m10', componentKey: 'tee:1', entityType: 'TEE',
      nodeIds: ['node:run-a', 'node:run-b', 'node:branch'],
    }],
    supports: [], boundaries: [], rigids: [],
  });
}
function node(id, x, y, portKeys = []) { return { id, position: { x, y, z: 0 }, portKeys }; }
function pipe(id, fromNodeId, toNodeId) {
  return { id, componentKey: id.replace('edge:', 'pipe:'), fromNodeId, toNodeId,
    entityType: 'PIPE', diameterMm: 80, outsideDiameterMm: 88.9,
    diameterAuthority: 'OUTSIDE_DIAMETER' };
}
function gateValve() {
  return {
    id: 'edge:m06', componentKey: 'valve:m06', fromNodeId: 'node:p2', toNodeId: 'node:p3',
    entityType: 'VALVE', diameterMm: 80, outsideDiameterMm: 88.9,
    diameterAuthority: 'OUTSIDE_DIAMETER', valveType: 'GATE', componentLengthMm: 200,
    pipingClass: 'PCL-80', pressureClass: '150',
    endConnectionFrom: 'FLANGED', endConnectionTo: 'FLANGED',
    catalogueBinding: {
      catalogueHash: 'sha256:valve-catalogue-v1', sourceHash: 'sha256:valve-source-v1',
      recordId: 'VALVE-GATE-DN80-C150', recordHash: 'sha256:gate-dn80-c150',
      sourceReference: { documentId: 'VALVES', revision: 'R1', path: '/DN80/GATE/150' },
    },
  };
}
function reducer() {
  return {
    id: 'edge:reducer', componentKey: 'reducer:1', fromNodeId: 'node:branch', toNodeId: 'node:p1',
    entityType: 'REDUCER', diameterMm: 100, secondaryNominalSizeMm: 80,
    outsideDiameterMm: 114.3, diameterAuthority: 'OUTSIDE_DIAMETER',
    catalogueBinding: {
      catalogueHash: REDUCER_CUSTODY.catalogueHash, sourceHash: REDUCER_CUSTODY.sourceHash,
      recordId: REDUCER_CUSTODY.recordId, recordHash: REDUCER_CUSTODY.recordHash,
      sourceReference: { documentId: 'REDUCERS', revision: 'R1', path: '/100/80' },
    },
  };
}
function relationPayload() {
  return {
    junctionId: 'junction:m10', branchNodeId: 'node:branch',
    branchPortKey: 'tee:1:port:branch', runNodeIds: ['node:run-a', 'node:run-b'],
    reducerEdgeId: 'edge:reducer', reducerCatalogueBinding: REDUCER_CUSTODY,
    runNominalSizeMm: 150, teeBranchNominalSizeMm: 100, downstreamNominalSizeMm: 80,
    relationPolicy: 'EXPLICIT_REDUCER',
  };
}

test('REPLACE_INLINE_COMPONENT preserves valve edge identity and exact catalogue custody', () => {
  const session = new TopologyEditCertifiedSession(topologyFixture());
  const before = session.currentTopology();
  const transition = session.execute('REPLACE_INLINE_COMPONENT', {
    edgeId: 'edge:m06', direction: 'FROM_TO', catalogueBinding: BALL,
  });
  assert.equal(transition.disposition, 'ACCEPTED');
  const after = session.currentTopology();
  assert.equal(after.edges.length, before.edges.length);
  const valve = after.edges.find((row) => row.id === 'edge:m06');
  assert.equal(valve.componentKey, 'valve:m06');
  assert.equal(valve.valveType, 'BALL');
  assert.equal(valve.valveFaceToFaceMm, 300);
  assert.equal(valve.catalogueRecordHash, BALL.recordHash);
  assert.deepEqual(after.nodes, before.nodes);
});

test('replacement rejects incompatible size and leaves canonical authority unchanged', () => {
  const session = new TopologyEditCertifiedSession(topologyFixture());
  const before = session.snapshot();
  const transition = session.execute('REPLACE_INLINE_COMPONENT', {
    edgeId: 'edge:m06', direction: 'FROM_TO',
    catalogueBinding: { ...BALL, nominalSizeMm: 100, recordHash: 'sha256:wrong-size' },
  });
  assert.equal(transition.disposition, 'REJECTED');
  assert.equal(session.snapshot().activeCanonicalTopologyHash, before.activeCanonicalTopologyHash);
  assert.equal(session.snapshot().journalHash, before.journalHash);
});

test('UPDATE_JUNCTION_BRANCH_RELATION preserves tee identity and exact reducer relation', () => {
  const session = new TopologyEditCertifiedSession(topologyFixture());
  const transition = session.execute('UPDATE_JUNCTION_BRANCH_RELATION', relationPayload());
  assert.equal(transition.disposition, 'ACCEPTED');
  const junction = session.currentTopology().junctions.find((row) => row.id === 'junction:m10');
  assert.equal(junction.componentKey, 'tee:1');
  assert.equal(junction.branchNodeId, 'node:branch');
  assert.equal(junction.branchPortKey, 'tee:1:port:branch');
  assert.equal(junction.branchRelation.reducerEdgeId, 'edge:reducer');
  assert.equal(junction.branchRelation.reducerRecordHash, REDUCER_CUSTODY.recordHash);
  assert.equal(junction.branchDiameterMm, 100);
  assert.equal(junction.runDiameterMm, 150);
});

test('junction relation rejects wrong branch port, indirect reducer, or size mismatch', () => {
  for (const payload of [
    { ...relationPayload(), branchPortKey: 'tee:1:port:run-a' },
    { ...relationPayload(), reducerEdgeId: 'edge:tail' },
    { ...relationPayload(), downstreamNominalSizeMm: 65 },
  ]) {
    const session = new TopologyEditCertifiedSession(topologyFixture());
    const prior = session.snapshot();
    const transition = session.execute('UPDATE_JUNCTION_BRANCH_RELATION', payload);
    assert.equal(transition.disposition, 'REJECTED');
    assert.equal(session.snapshot().activeCanonicalTopologyHash, prior.activeCanonicalTopologyHash);
  }
});
