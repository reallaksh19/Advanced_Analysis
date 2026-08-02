import assert from 'node:assert/strict';
import test from 'node:test';

import { finalizeCanonicalTopology } from '../src/workspace/topology-edit/topology-edit-canonical-state.js';
import { TopologyEditCertifiedSession } from '../src/workspace/topology-edit/topology-edit-certified-session.js';
import {
  runTopologyEditIncrementalValidation,
} from '../src/workspace/topology-edit/professional/topology-edit-incremental-validation.js';
import {
  prepareTopologyEditOperationCandidate,
} from '../src/workspace/topology-edit/professional/topology-edit-operation-candidate.js';
import {
  createTopologyEditOperationPlan,
} from '../src/workspace/topology-edit/professional/topology-edit-operation-plan.js';
import {
  executeTopologyEditOperationTransaction,
  previewTopologyEditOperationTransaction,
  redoTopologyEditOperationTransaction,
  undoTopologyEditOperationTransaction,
} from '../src/workspace/topology-edit/professional/topology-edit-operation-transaction.js';
import {
  planMoveConnectedRun,
} from '../src/workspace/topology-edit/professional/topology-edit-route-operations.js';

function baseTopology() {
  return finalizeCanonicalTopology({
    schema: 'topology-edit-canonical-topology/v1',
    datasetId: 'DS-PROFESSIONAL-TRANSACTION',
    datasetVersion: 0,
    sourceHash: 'source:professional-transaction',
    topologyGraphHash: 'graph:professional-transaction',
    nodes: [
      { id: 'node:a', position: { x: 0, y: 0, z: 0 }, portKeys: [] },
      { id: 'node:b', position: { x: 100, y: 0, z: 0 }, portKeys: [] },
      { id: 'node:c', position: { x: 200, y: 0, z: 0 }, portKeys: [] },
      { id: 'node:d', position: { x: 300, y: 0, z: 0 }, portKeys: [] },
    ],
    edges: [
      { id: 'edge:ab', componentKey: 'P-AB', fromNodeId: 'node:a', toNodeId: 'node:b', diameterMm: 100, entityType: 'PIPE' },
      { id: 'edge:bc', componentKey: 'P-BC', fromNodeId: 'node:b', toNodeId: 'node:c', diameterMm: 100, entityType: 'PIPE' },
      { id: 'edge:cd', componentKey: 'P-CD', fromNodeId: 'node:c', toNodeId: 'node:d', diameterMm: 100, entityType: 'PIPE' },
    ],
    junctions: [], supports: [], boundaries: [], rigids: [], bends: [],
  });
}

function operationPlan(topology) {
  return planMoveConnectedRun({
    topology,
    nodeIds: ['node:b', 'node:c'],
    boundaryNodeIds: ['node:a', 'node:d'],
    deltaMm: { x: 0, y: 50, z: 0 },
  });
}

function validation(candidate, plan) {
  return runTopologyEditIncrementalValidation({
    canonicalTopology: candidate.canonicalTopology,
    operationPlan: plan,
    previousDiagnostics: [],
    checker: () => [],
    performancePolicy: {
      fastPathBudgetMs: 16,
      warningBudgetMs: 100,
      hysteresisMs: 4,
    },
    now: clock([0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 6]),
  });
}

test('candidate certification and validation do not mutate the live session', () => {
  const session = new TopologyEditCertifiedSession(baseTopology());
  const plan = operationPlan(session.currentTopology());
  const prior = session.snapshot();
  const candidate = prepareTopologyEditOperationCandidate({
    session,
    operationPlan: plan,
  });
  const receipt = validation(candidate, plan);
  const preview = previewTopologyEditOperationTransaction({
    session,
    operationPlan: plan,
    candidate,
    validationReceipt: receipt,
  });

  assert.equal(session.journal.journalHash, prior.journalHash);
  assert.equal(session.currentTopology().canonicalTopologyHash, prior.activeCanonicalTopologyHash);
  assert.equal(candidate.commandCount, 2);
  assert.equal(receipt.validatedTopologyHash, candidate.resultingCanonicalHash);
  assert.equal(preview.candidateHash, candidate.candidateHash);
  assert.equal(preview.resultingCanonicalHash, candidate.resultingCanonicalHash);
});

test('atomic apply commits the exact command group and grouped undo redo reproduce hashes', () => {
  const session = new TopologyEditCertifiedSession(baseTopology());
  const plan = operationPlan(session.currentTopology());
  const candidate = prepareTopologyEditOperationCandidate({ session, operationPlan: plan });
  const receipt = validation(candidate, plan);
  const preview = previewTopologyEditOperationTransaction({
    session, operationPlan: plan, candidate, validationReceipt: receipt,
  });
  const transaction = executeTopologyEditOperationTransaction({
    session, operationPlan: plan, candidate, validationReceipt: receipt, preview,
  });

  assert.equal(transaction.commandCount, 2);
  assert.deepEqual(session.journal.activeCommandIds.slice(-2), transaction.commandIds);
  assert.equal(session.currentTopology().canonicalTopologyHash, transaction.resultingCanonicalHash);
  assert.equal(
    session.currentTopology().nodes.find((node) => node.id === 'node:b').position.y,
    50,
  );

  undoTopologyEditOperationTransaction(session, transaction);
  assert.equal(session.currentTopology().canonicalTopologyHash, transaction.priorCanonicalHash);
  assert.equal(session.journal.redoCommandIds.length, 2);

  redoTopologyEditOperationTransaction(session, transaction);
  assert.equal(session.currentTopology().canonicalTopologyHash, transaction.resultingCanonicalHash);
  assert.deepEqual(session.journal.activeCommandIds.slice(-2), transaction.commandIds);
});

test('a rejected later command leaves the live session completely unchanged', () => {
  const session = new TopologyEditCertifiedSession(baseTopology());
  const raw = operationPlan(session.currentTopology());
  const plan = createTopologyEditOperationPlan({
    ...raw,
    commandIntents: [
      raw.commandIntents[0],
      {
        commandType: 'MOVE_NODE',
        payload: {
          nodeId: 'node:missing',
          position: { x: 200, y: 50, z: 0 },
        },
      },
    ],
  });
  const priorJournalHash = session.journal.journalHash;
  const priorCanonicalHash = session.currentTopology().canonicalTopologyHash;

  assert.throws(
    () => prepareTopologyEditOperationCandidate({ session, operationPlan: plan }),
    /rejected during candidate certification/i,
  );
  assert.equal(session.journal.journalHash, priorJournalHash);
  assert.equal(session.currentTopology().canonicalTopologyHash, priorCanonicalHash);
  assert.equal(session.journal.activeCommandIds.length, 0);
});

test('stale candidate and preview cannot commit after another accepted command', () => {
  const session = new TopologyEditCertifiedSession(baseTopology());
  const plan = operationPlan(session.currentTopology());
  const candidate = prepareTopologyEditOperationCandidate({ session, operationPlan: plan });
  const receipt = validation(candidate, plan);
  const preview = previewTopologyEditOperationTransaction({
    session, operationPlan: plan, candidate, validationReceipt: receipt,
  });

  const other = session.execute('MOVE_NODE', {
    nodeId: 'node:a',
    position: { x: -10, y: 0, z: 0 },
  });
  assert.equal(other.disposition, 'ACCEPTED');
  assert.throws(
    () => executeTopologyEditOperationTransaction({
      session, operationPlan: plan, candidate, validationReceipt: receipt, preview,
    }),
    /stale/i,
  );
  assert.equal(session.journal.activeCommandIds.length, 1);
});

function clock(values) {
  let index = 0;
  return () => values[index++];
}
