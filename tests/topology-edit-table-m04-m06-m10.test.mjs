import test from 'node:test';
import assert from 'node:assert/strict';
import { semanticHash } from '../src/core/shared-piping-model/index.js';
import { finalizeCanonicalTopology } from '../src/workspace/topology-edit/topology-edit-canonical-state.js';
import { checkCanonicalTopology } from '../src/workspace/topology-edit/topology-edit-checker.js';
import { TopologyEditCertifiedSession } from '../src/workspace/topology-edit/topology-edit-certified-session.js';
import {
  runTopologyEditIncrementalValidation,
} from '../src/workspace/topology-edit/professional/topology-edit-incremental-validation.js';
import { buildTopologyEditTableProjection } from '../src/workspace/topology-edit/table/topology-edit-table-projection.js';
import { createTopologyEditTableIntent } from '../src/workspace/topology-edit/table/topology-edit-table-intent.js';
import { createTopologyEditTableBatch } from '../src/workspace/topology-edit/table/topology-edit-table-batch.js';
import { planTopologyEditTableBatch } from '../src/workspace/topology-edit/table/topology-edit-table-batch-planner.js';
import {
  applyTopologyEditTableTransaction,
  prepareTopologyEditTablePreview,
  redoTopologyEditTableTransaction,
  undoTopologyEditTableTransaction,
  validateTopologyEditTablePreview,
} from '../src/workspace/topology-edit/table/topology-edit-table-transaction.js';

const BALL = Object.freeze({
  catalogueHash: 'sha256:valves-v2', sourceHash: 'sha256:valves-source-v2',
  recordId: 'BALL-DN80-C150', recordHash: 'sha256:ball-80-150',
  componentType: 'VALVE', nominalSizeMm: 80, outsideDiameterMm: 88.9,
  pipingClass: 'PCL-80', pressureClass: '150', materialSpecification: 'A216-WCB',
  componentMassKg: 24, endConnectionFrom: 'FLANGED', endConnectionTo: 'FLANGED',
  valveType: 'BALL', valveFaceToFaceMm: 300,
  sourceReference: { documentId: 'VALVES', revision: 'R2', path: '/BALL/80/150' },
});

function topologyFixture() {
  return finalizeCanonicalTopology({
    schema: 'topology-edit-canonical-topology/v1',
    datasetId: 'dataset-q3', datasetVersion: 42, sourceHash: 'sha256:q3-source',
    topologyGraphHash: 'sha256:q3-graph',
    nodes: [
      node('node:run-a', -1000, 0, ['tee:1:port:run-a']),
      node('node:run-b', 1000, 0, ['tee:1:port:run-b']),
      node('node:branch', 0, 500, ['tee:1:port:branch']),
      node('node:p1', 0, 800), node('node:p2', 2200, 800),
      node('node:p3', 2400, 800), node('node:p4', 3400, 800),
    ],
    edges: [reducer(), pipe('edge:m04', 'node:p1', 'node:p2'), gateValve(),
      pipe('edge:tail', 'node:p3', 'node:p4')],
    junctions: [{ id: 'junction:m10', componentKey: 'tee:1', entityType: 'TEE',
      nodeIds: ['node:run-a', 'node:run-b', 'node:branch'] }],
    supports: [], boundaries: [], rigids: [],
  });
}
function topologyGraph() {
  return {
    semanticHash: 'sha256:q3-graph',
    ports: [
      port('tee:1:port:run-a', 'node:run-a', 'run-a'),
      port('tee:1:port:run-b', 'node:run-b', 'run-b'),
      port('tee:1:port:branch', 'node:branch', 'branch'),
    ],
  };
}
function port(portKey, nodeId, role) {
  return { portKey, componentKey: 'tee:1', sourceEndpointIdentity: nodeId, role };
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
    catalogueBinding: { catalogueHash: 'sha256:valves-v1', sourceHash: 'sha256:valves-source-v1',
      recordId: 'GATE-DN80-C150', recordHash: 'sha256:gate-80-150',
      sourceReference: { documentId: 'VALVES', revision: 'R1', path: '/GATE/80/150' } },
  };
}
function reducer() {
  return {
    id: 'edge:reducer', componentKey: 'reducer:1', fromNodeId: 'node:branch', toNodeId: 'node:p1',
    entityType: 'REDUCER', diameterMm: 100, secondaryNominalSizeMm: 80,
    outsideDiameterMm: 114.3, diameterAuthority: 'OUTSIDE_DIAMETER',
    catalogueBinding: { catalogueHash: 'sha256:reducers-v1', sourceHash: 'sha256:reducers-source-v1',
      recordId: 'RED-100-80', recordHash: 'sha256:red-100-80',
      sourceReference: { documentId: 'REDUCERS', revision: 'R1', path: '/100/80' } },
  };
}
function projection(topology) {
  return buildTopologyEditTableProjection({ canonicalTopology: topology, topologyGraph: topologyGraph() });
}
function stageIntents(session, topology) {
  const table = projection(topology);
  return { table, intents: [
    createTopologyEditTableIntent({ projection: table, sessionSnapshot: session.snapshot(),
      canonicalId: 'edge:m04', intentKind: 'PIPE_LENGTH', requestedValue: { lengthMm: 3000 },
      geometryPolicy: { anchor: 'FROM', propagation: 'DOWNSTREAM' } }),
    createTopologyEditTableIntent({ projection: table, sessionSnapshot: session.snapshot(),
      canonicalId: 'edge:m06', intentKind: 'VALVE_REPLACEMENT',
      requestedValue: { catalogueBinding: BALL, direction: 'FROM_TO' },
      geometryPolicy: { anchor: 'FROM', propagation: 'DOWNSTREAM' } }),
    createTopologyEditTableIntent({ projection: table, sessionSnapshot: session.snapshot(),
      canonicalId: 'junction:m10', intentKind: 'TEE_REDUCER_RELATION', requestedValue: {
        branchNodeId: 'node:branch', branchPortKey: 'tee:1:port:branch',
        runNodeIds: ['node:run-a', 'node:run-b'], reducerCanonicalId: 'edge:reducer',
        runNominalSizeMm: 150, teeBranchNominalSizeMm: 100, downstreamNominalSizeMm: 80,
        relationPolicy: 'EXPLICIT_REDUCER',
      } }),
  ] };
}
function edgeLength(topology, id) {
  const edge = topology.edges.find((row) => row.id === id);
  const from = topology.nodes.find((row) => row.id === edge.fromNodeId).position;
  const to = topology.nodes.find((row) => row.id === edge.toNodeId).position;
  return Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
}
function validationReceipt(baseTopology, preview, batchPlan) {
  let tick = 0;
  return runTopologyEditIncrementalValidation({
    canonicalTopology: preview.candidate.canonicalTopology,
    operationPlan: batchPlan.operationPlan,
    previousDiagnostics: checkCanonicalTopology(baseTopology),
    now: () => ++tick,
    performancePolicy: { fastPathBudgetMs: 100, warningBudgetMs: 200, hysteresisMs: 10 },
  });
}

test('M04 + M06 + M10 compile into one atomic final-state Table transaction', async () => {
  const topology = topologyFixture();
  const session = new TopologyEditCertifiedSession(topology);
  const { table, intents } = stageIntents(session, topology);
  const batch = createTopologyEditTableBatch({ intents });
  const batchPlan = planTopologyEditTableBatch({ batch, projection: table, canonicalTopology: topology });

  assert.equal(batchPlan.operationPlan.operationType, 'COMPOSITE_ENGINEERING_EDIT');
  assert.deepEqual(batchPlan.operationPlan.commandIntents.map((row) => row.commandType), [
    'REPLACE_INLINE_COMPONENT', 'UPDATE_JUNCTION_BRANCH_RELATION',
    'MOVE_NODE', 'MOVE_NODE', 'MOVE_NODE',
  ]);
  const moves = Object.fromEntries(batchPlan.operationPlan.commandIntents
    .filter((row) => row.commandType === 'MOVE_NODE')
    .map((row) => [row.payload.nodeId, row.payload.position.x]));
  assert.deepEqual(moves, { 'node:p2': 3000, 'node:p3': 3300, 'node:p4': 4300 });

  const prior = session.snapshot();
  const preview = await prepareTopologyEditTablePreview({ session, batchPlan });
  assert.equal(session.snapshot().journalHash, prior.journalHash);
  assert.equal(session.snapshot().activeCanonicalTopologyHash, prior.activeCanonicalTopologyHash);
  assert.equal(edgeLength(preview.candidate.canonicalTopology, 'edge:m04'), 3000);
  assert.equal(edgeLength(preview.candidate.canonicalTopology, 'edge:m06'), 300);
  assert.equal(edgeLength(preview.candidate.canonicalTopology, 'edge:tail'), 1000);
  assert.equal(preview.candidate.canonicalTopology.edges.find((row) => row.id === 'edge:m06').valveType, 'BALL');
  assert.equal(preview.candidate.canonicalTopology.junctions.find((row) => row.id === 'junction:m10')
    .branchRelation.reducerRecordHash, 'sha256:red-100-80');

  const tableValidation = validateTopologyEditTablePreview({
    preview, workerReceipt: validationReceipt(topology, preview, batchPlan),
  });
  assert.equal(tableValidation.status, 'READY_TO_APPLY');
  assert.equal(tableValidation.blockingDiagnosticHash, semanticHash([]));

  const transaction = await applyTopologyEditTableTransaction({
    session, batchPlan, preview, tableValidation,
  });
  assert.equal(transaction.commandCount, 5);
  assert.equal(edgeLength(session.currentTopology(), 'edge:m04'), 3000);
  assert.equal(session.currentTopology().edges.find((row) => row.id === 'edge:m06').valveType, 'BALL');
  undoTopologyEditTableTransaction(session, transaction);
  assert.equal(session.snapshot().activeCanonicalTopologyHash, prior.activeCanonicalTopologyHash);
  redoTopologyEditTableTransaction(session, transaction);
  assert.equal(session.snapshot().activeCanonicalTopologyHash, transaction.resultingCanonicalHash);
});
