import test from 'node:test';
import assert from 'node:assert/strict';
import { finalizeCanonicalTopology } from '../src/workspace/topology-edit/topology-edit-canonical-state.js';
import { checkCanonicalTopology } from '../src/workspace/topology-edit/topology-edit-checker.js';
import { TopologyEditCertifiedSession } from '../src/workspace/topology-edit/topology-edit-certified-session.js';
import {
  activateTopologyEditAuthoringTool,
  createTopologyEditAuthoringSession,
  setTopologyEditAuthoringTarget,
  updateTopologyEditAuthoringProperties,
} from '../src/workspace/topology-edit/authoring/topology-edit-authoring-session.js';
import {
  createTopologyEditAuthoringOperationPlan,
  deriveTopologyEditAuthoringTarget,
  topologyEditAuthoringDefaultProperties,
} from '../src/workspace/topology-edit/authoring/topology-edit-authoring-operation-planner.js';
import {
  createTopologyEditAuthoringValidationReceipt,
  executeTopologyEditAuthoringTransaction,
  prepareTopologyEditAuthoringCandidate,
  redoTopologyEditAuthoringTransaction,
  undoTopologyEditAuthoringTransaction,
} from '../src/workspace/topology-edit/authoring/topology-edit-authoring-composite-operation.js';
import { runTopologyEditIncrementalValidation } from '../src/workspace/topology-edit/professional/topology-edit-incremental-validation.js';

function baseTopology() {
  return finalizeCanonicalTopology({
    schema: 'topology-edit-canonical-topology/v1',
    datasetId: 'authoring-composite', datasetVersion: 1,
    sourceHash: 'source:authoring-composite', topologyGraphHash: 'graph:authoring-composite',
    nodes: [
      { id: 'node:start', position: { x: 0, y: 0, z: 0 }, portKeys: [] },
      { id: 'node:end', position: { x: 1000, y: 0, z: 0 }, portKeys: [] },
    ],
    edges: [{
      id: 'edge:host', componentKey: 'P-1',
      fromNodeId: 'node:start', toNodeId: 'node:end',
      diameterMm: 100, entityType: 'PIPE', sourcePath: '$[0]',
    }],
    junctions: [], supports: [], boundaries: [], rigids: [], bends: [],
  });
}

function routePlan(topology) {
  let authoring = createTopologyEditAuthoringSession();
  authoring = activateTopologyEditAuthoringTool(authoring, 'ROUTE_ELBOW');
  authoring = setTopologyEditAuthoringTarget(authoring, deriveTopologyEditAuthoringTarget({
    topology, tool: 'ROUTE_ELBOW', nodeId: 'node:end',
  }));
  authoring = updateTopologyEditAuthoringProperties(authoring, topologyEditAuthoringDefaultProperties({
    topology, authoringSession: authoring,
  }), 'DERIVED');
  authoring = updateTopologyEditAuthoringProperties(authoring, {
    offsetX: 500, offsetY: 600, offsetZ: 0,
    nominalSizeMm: 100, angleDeg: 90, radiusType: 'LR', radiusMm: 150,
    pipingClass: 'DEMO-150', componentMassKg: 12,
  });
  return createTopologyEditAuthoringOperationPlan({ topology, authoringSession: authoring });
}

function createdId(topology, commandId, prefix) {
  const rows = [...topology.nodes, ...topology.edges, ...(topology.bends ?? [])]
    .filter((row) => row.createdByCommandId === commandId && row.id.startsWith(prefix));
  assert.equal(rows.length, 1);
  return rows[0].id;
}

test('ordinary sequential certification rejects the temporary right-angle before bend completion', () => {
  const session = new TopologyEditCertifiedSession(baseTopology());
  const corner = session.execute('CREATE_NODE', {
    position: { x: 1500, y: 0, z: 0 }, creationRole: 'TEST_CORNER',
    coordinateAuthority: 'TEST', sourceOperationId: 'test-route',
  });
  assert.equal(corner.disposition, 'ACCEPTED');
  const cornerId = createdId(session.currentTopology(), corner.certification.commandId, 'node:');
  const end = session.execute('CREATE_NODE', {
    position: { x: 1500, y: 600, z: 0 }, creationRole: 'TEST_END',
    coordinateAuthority: 'TEST', sourceOperationId: 'test-route',
  });
  assert.equal(end.disposition, 'ACCEPTED');
  const endId = createdId(session.currentTopology(), end.certification.commandId, 'node:');
  assert.equal(session.execute('ADD_STRAIGHT_ELEMENT', {
    fromNodeId: 'node:end', toNodeId: cornerId, diameterMm: 100, entityType: 'PIPE',
  }).disposition, 'ACCEPTED');
  const rejected = session.execute('ADD_STRAIGHT_ELEMENT', {
    fromNodeId: cornerId, toNodeId: endId, diameterMm: 100, entityType: 'PIPE',
  });
  assert.equal(rejected.disposition, 'REJECTED');
  assert.match(
    rejected.certification.receipt.reasons.map((row) => row.message).join(' '),
    /RIGHT_ANGLE_WITHOUT_BEND|checker-policy/i,
  );
});

test('final-state composite certification accepts, validates, applies, undoes, redoes and reloads route + elbow atomically', async () => {
  const base = baseTopology();
  const session = new TopologyEditCertifiedSession(base);
  const plan = routePlan(base);
  const candidate = await prepareTopologyEditAuthoringCandidate({
    session, operationPlan: plan,
  });
  assert.equal(candidate.certificationMode, 'FINAL_STATE');
  assert.equal(candidate.commandCount, 5);
  assert.equal(candidate.canonicalTopology.nodes.length, base.nodes.length + 2);
  assert.equal(candidate.canonicalTopology.edges.length, base.edges.length + 2);
  assert.equal(candidate.canonicalTopology.bends.length, 1);
  assert.equal(checkCanonicalTopology(candidate.canonicalTopology)
    .some((row) => row.kind === 'RIGHT_ANGLE_WITHOUT_BEND'), false);
  assert.equal(session.journal.activeCommandIds.length, 0, 'candidate preparation must not mutate the real session');

  let tick = 0;
  const workerReceipt = runTopologyEditIncrementalValidation({
    canonicalTopology: candidate.canonicalTopology,
    operationPlan: plan,
    previousDiagnostics: checkCanonicalTopology(base),
    checker: checkCanonicalTopology,
    checkerOptions: {},
    performancePolicy: { fastPathBudgetMs: 16, warningBudgetMs: 100, hysteresisMs: 4 },
    now: () => tick++,
  });
  const validation = createTopologyEditAuthoringValidationReceipt({
    candidate, workerReceipt,
  });
  assert.equal(validation.status, 'READY_TO_APPLY');
  assert.equal(validation.blockingIssueCount, 0);

  const receipt = await executeTopologyEditAuthoringTransaction({
    session, operationPlan: plan, candidate, validationReceipt: validation,
  });
  assert.equal(receipt.commandCount, 5);
  assert.equal(session.journal.activeCommandIds.length, 5);
  assert.equal(session.currentTopology().canonicalTopologyHash, candidate.resultingCanonicalHash);

  undoTopologyEditAuthoringTransaction(session, receipt);
  assert.equal(session.currentTopology().canonicalTopologyHash, base.canonicalTopologyHash);
  assert.equal(session.journal.activeCommandIds.length, 0);
  redoTopologyEditAuthoringTransaction(session, receipt);
  assert.equal(session.currentTopology().canonicalTopologyHash, candidate.resultingCanonicalHash);

  const serialized = session.serializeJournal();
  const restored = new TopologyEditCertifiedSession(base);
  restored.reloadJournal(serialized);
  assert.equal(restored.currentTopology().canonicalTopologyHash, candidate.resultingCanonicalHash);
  assert.deepEqual(restored.journal.activeCommandIds, receipt.commandIds);
});
