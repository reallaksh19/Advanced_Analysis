import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertTopologyEditIncrementalValidationReceipt,
  runTopologyEditIncrementalValidation,
} from '../src/workspace/topology-edit/professional/topology-edit-incremental-validation.js';
import {
  planShortenEdge,
} from '../src/workspace/topology-edit/professional/topology-edit-route-operations.js';
import {
  topologyEditDiagnosticsHash,
} from '../src/workspace/topology-edit/professional/topology-edit-validation-diagnostics.js';

function topology(hash) {
  return {
    schema: 'topology-edit-canonical-topology/v1',
    canonicalTopologyHash: hash,
    sourceHash: 'sha256:baseline-source',
    nodes: [
      { id: 'node:a', position: { x: 0, y: 0, z: 0 }, portKeys: [] },
      { id: 'node:b', position: { x: 1000, y: 0, z: 0 }, portKeys: [] },
    ],
    edges: [{
      id: 'edge:host',
      componentKey: 'P-HOST',
      fromNodeId: 'node:a',
      toNodeId: 'node:b',
      diameterMm: 100,
      entityType: 'PIPE',
    }],
    junctions: [],
    supports: [],
    boundaries: [],
    rigids: [],
    bends: [],
    crosswalk: {
      nodeIdToPortKeys: {},
      edgeIdToComponentKey: { 'edge:host': 'P-HOST' },
      junctionIdToComponentKey: {},
      supportIdToEntityId: {},
    },
  };
}

function clock() {
  const values = [0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 6];
  let index = 0;
  return () => values[index++];
}

test('incremental receipt retains content-addressed pre-operation diagnostics', () => {
  const base = topology('sha256:baseline-before');
  const plan = planShortenEdge({
    topology: base,
    edgeId: 'edge:host',
    endpoint: 'TO',
    distanceMm: 100,
  });
  const post = structuredClone(base);
  post.nodes[1].position.x = 900;
  post.canonicalTopologyHash = 'sha256:baseline-after';
  const inherited = [{
    id: 'issue:UNRESOLVED_RESTRAINT_DIRECTION:support:legacy',
    kind: 'UNRESOLVED_RESTRAINT_DIRECTION',
    severity: 'HIGH',
    edgeId: 'edge:host',
    supportId: 'support:legacy',
    message: 'Support direction is unresolved.',
    details: { restraintType: 'GUIDE', axis: null },
    durationMs: 2,
  }];
  const receipt = runTopologyEditIncrementalValidation({
    canonicalTopology: post,
    operationPlan: plan,
    previousDiagnostics: inherited,
    checker: () => [{ ...inherited[0], durationMs: 200 }],
    performancePolicy: {
      fastPathBudgetMs: 16,
      warningBudgetMs: 100,
      hysteresisMs: 4,
    },
    now: clock(),
  });

  assert.equal(receipt.baseline.issueCount, 1);
  assert.equal(receipt.baseline.issueHash, topologyEditDiagnosticsHash(inherited));
  assert.equal(receipt.baselineDiagnostics.length, 1);
  assert.equal('durationMs' in receipt.baselineDiagnostics[0], false);
  assert.deepEqual(assertTopologyEditIncrementalValidationReceipt(receipt), receipt);

  assert.throws(() => assertTopologyEditIncrementalValidationReceipt({
    ...receipt,
    baselineDiagnostics: [{
      ...receipt.baselineDiagnostics[0],
      severity: 'MEDIUM',
    }],
  }), /baseline diagnostics differ/i);
  assert.throws(() => assertTopologyEditIncrementalValidationReceipt({
    ...receipt,
    baseline: {
      ...receipt.baseline,
      issueCount: 2,
    },
  }), /validation hash does not match/i);
});
