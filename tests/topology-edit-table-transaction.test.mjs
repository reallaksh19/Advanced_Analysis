import test from 'node:test';
import assert from 'node:assert/strict';
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

function topologyFixture() {
  return finalizeCanonicalTopology({
    schema: 'topology-edit-canonical-topology/v1',
    datasetId: 'dataset-transaction', datasetVersion: 2, sourceHash: 'sha256:source-tx',
    topologyGraphHash: 'sha256:graph-tx',
    nodes: [
      node('node:n1', 0), node('node:n2', 1000), node('node:n3', 2000),
    ],
    edges: [
      pipe('edge:p1', 'node:n1', 'node:n2'),
      pipe('edge:p2', 'node:n2', 'node:n3'),
    ],
    junctions: [], supports: [], boundaries: [], rigids: [],
  });
}
function node(id, x) { return { id, position: { x, y: 0, z: 0 }, portKeys: [] }; }
function pipe(id, fromNodeId, toNodeId) {
  return {
    id, componentKey: id.replace('edge:', 'pipe:'), fromNodeId, toNodeId,
    entityType: 'PIPE', diameterMm: 100, outsideDiameterMm: 114,
    diameterAuthority: 'OUTSIDE_DIAMETER',
  };
}
function edgeLength(topology, edgeId) {
  const edge = topology.edges.find((row) => row.id === edgeId);
  const from = topology.nodes.find((row) => row.id === edge.fromNodeId).position;
  const to = topology.nodes.find((row) => row.id === edge.toNodeId).position;
  return Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
}
function planned(session, topology) {
  const projection = buildTopologyEditTableProjection({ canonicalTopology: topology });
  const intent = createTopologyEditTableIntent({
    projection,
    sessionSnapshot: session.snapshot(),
    canonicalId: 'edge:p1',
    intentKind: 'PIPE_LENGTH',
    requestedValue: { lengthMm: 1500 },
    geometryPolicy: { anchor: 'FROM', propagation: 'DOWNSTREAM' },
  });
  const batch = createTopologyEditTableBatch({ intents: [intent] });
  return planTopologyEditTableBatch({ batch, projection, canonicalTopology: topology });
}
function validationReceipt(baseTopology, preview, batchPlan) {
  let tick = 0;
  return runTopologyEditIncrementalValidation({
    canonicalTopology: preview.candidate.canonicalTopology,
    operationPlan: batchPlan.operationPlan,
    previousDiagnostics: checkCanonicalTopology(baseTopology),
    now: () => { tick += 1; return tick; },
    performancePolicy: { fastPathBudgetMs: 100, warningBudgetMs: 200, hysteresisMs: 10 },
  });
}

test('Table Preview → Validate → Apply delegates to certified transaction and undo/redo is exact', async () => {
  const topology = topologyFixture();
  const session = new TopologyEditCertifiedSession(topology);
  const batchPlan = planned(session, topology);
  const prior = session.snapshot();

  const preview = await prepareTopologyEditTablePreview({ session, batchPlan });
  assert.equal(session.currentTopology().canonicalTopologyHash, prior.activeCanonicalTopologyHash);
  assert.equal(session.journal.journalHash, prior.journalHash);
  assert.equal(edgeLength(preview.candidate.canonicalTopology, 'edge:p1'), 1500);
  assert.equal(edgeLength(preview.candidate.canonicalTopology, 'edge:p2'), 1000);

  const workerReceipt = validationReceipt(topology, preview, batchPlan);
  const tableValidation = validateTopologyEditTablePreview({ preview, workerReceipt });
  assert.equal(tableValidation.status, 'READY_TO_APPLY');
  assert.equal(tableValidation.blockingIssueCount, 0);
  assert.equal(session.currentTopology().canonicalTopologyHash, prior.activeCanonicalTopologyHash);

  const transaction = await applyTopologyEditTableTransaction({
    session, batchPlan, preview, tableValidation,
  });
  assert.equal(session.currentTopology().canonicalTopologyHash, transaction.resultingCanonicalHash);
  assert.equal(edgeLength(session.currentTopology(), 'edge:p1'), 1500);
  assert.equal(edgeLength(session.currentTopology(), 'edge:p2'), 1000);
  assert.equal(transaction.commandCount, 2);

  undoTopologyEditTableTransaction(session, transaction);
  assert.equal(session.currentTopology().canonicalTopologyHash, prior.activeCanonicalTopologyHash);
  assert.equal(session.journal.activeLedgerHash, prior.activeLedgerHash);
  assert.equal(edgeLength(session.currentTopology(), 'edge:p1'), 1000);

  redoTopologyEditTableTransaction(session, transaction);
  assert.equal(session.currentTopology().canonicalTopologyHash, transaction.resultingCanonicalHash);
  assert.equal(edgeLength(session.currentTopology(), 'edge:p1'), 1500);
});

test('Apply rejects a preview after the certified session authority changes', async () => {
  const topology = topologyFixture();
  const session = new TopologyEditCertifiedSession(topology);
  const batchPlan = planned(session, topology);
  const preview = await prepareTopologyEditTablePreview({ session, batchPlan });
  const tableValidation = validateTopologyEditTablePreview({
    preview,
    workerReceipt: validationReceipt(topology, preview, batchPlan),
  });

  const transition = session.execute('MOVE_NODE', {
    nodeId: 'node:n3', position: { x: 2100, y: 0, z: 0 },
  });
  assert.equal(transition.disposition, 'ACCEPTED');

  await assert.rejects(() => applyTopologyEditTableTransaction({
    session, batchPlan, preview, tableValidation,
  }), /candidate is stale/);
});
