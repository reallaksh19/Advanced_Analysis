import assert from 'node:assert/strict';
import test from 'node:test';

import { semanticHash } from '../src/core/shared-piping-model/index.js';
import {
  assertTopologyEditValidationWorkerRequest,
  assertTopologyEditValidationWorkerResponse,
  createTopologyEditValidationWorkerRequest,
  executeTopologyEditValidationWorkerRequest,
} from '../src/workspace/topology-edit/professional/topology-edit-validation-worker-contract.js';
import {
  acceptTopologyEditValidationWorkerResponse,
  assertTopologyEditValidationWorkerDisposition,
  beginTopologyEditValidationWorkerRequest,
  cancelTopologyEditValidationWorkerRequest,
  createTopologyEditValidationWorkerState,
} from '../src/workspace/topology-edit/professional/topology-edit-validation-worker-state.js';
import {
  topologyEditDiagnosticsHash,
} from '../src/workspace/topology-edit/professional/topology-edit-validation-diagnostics.js';
import {
  planShortenEdge,
} from '../src/workspace/topology-edit/professional/topology-edit-route-operations.js';

function topology(hash = 'fnv1a64:worker-base') {
  return {
    schema: 'topology-edit-canonical-topology/v1',
    canonicalTopologyHash: hash,
    nodes: [
      { id: 'node:a', position: { x: 0, y: 0, z: 0 }, portKeys: [] },
      { id: 'node:b', position: { x: 100, y: 0, z: 0 }, portKeys: [] },
    ],
    edges: [{
      id: 'edge:e1',
      componentKey: 'P-001',
      fromNodeId: 'node:a',
      toNodeId: 'node:b',
      entityType: 'PIPE',
    }],
    junctions: [], supports: [], boundaries: [], rigids: [], bends: [],
    crosswalk: {
      nodeIdToPortKeys: {},
      edgeIdToComponentKey: { 'edge:e1': 'P-001' },
      junctionIdToComponentKey: {}, supportIdToEntityId: {},
    },
  };
}

function plan(base = topology()) {
  return planShortenEdge({
    topology: base,
    edgeId: 'edge:e1',
    endpoint: 'TO',
    distanceMm: 10,
  });
}

function request(base, postHash, previousDiagnostics = []) {
  return createTopologyEditValidationWorkerRequest({
    operationPlan: plan(base),
    validatedTopologyHash: postHash,
    previousIssueHash: topologyEditDiagnosticsHash(previousDiagnostics),
    checkerOptions: { shortElementThresholdMm: 6 },
    performancePolicy: {
      fastPathBudgetMs: 60,
      warningBudgetMs: 100,
      hysteresisMs: 10,
    },
    blockingSeverities: ['CRITICAL', 'HIGH'],
  });
}

function fakeChecker() {
  return [
    {
      id: 'issue:blocking',
      kind: 'ZERO_LENGTH_EDGE',
      severity: 'HIGH',
      edgeId: 'edge:e1',
      message: 'Blocking fixture issue.',
    },
    {
      id: 'issue:warning',
      kind: 'SHORT_ELEMENT',
      severity: 'MEDIUM',
      edgeId: 'edge:e1',
      message: 'Warning fixture issue.',
    },
  ];
}

function clock() {
  const values = [0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 6];
  let index = 0;
  return () => values[index++];
}

function execute(requestValue, base = topology()) {
  const post = topology(requestValue.validatedTopologyHash);
  post.nodes[1].position.x = 90;
  return executeTopologyEditValidationWorkerRequest({
    request: requestValue,
    canonicalTopology: post,
    operationPlan: plan(base),
    previousDiagnostics: [],
    checker: fakeChecker,
    now: clock(),
  });
}

test('identical validation requests have identical deterministic IDs', () => {
  const base = topology();
  const left = request(base, 'fnv1a64:worker-post');
  const right = request(base, 'fnv1a64:worker-post');
  const changed = request(base, 'fnv1a64:worker-post-2');

  assert.deepEqual(left, right);
  assert.equal(left.requestId, right.requestId);
  assert.notEqual(left.requestId, changed.requestId);
  assert.equal(Object.isFrozen(left), true);
  assert.deepEqual(assertTopologyEditValidationWorkerRequest(left), left);
});

test('worker execution delegates to P5 and classifies blocking and warning IDs', () => {
  const base = topology();
  const requestValue = request(base, 'fnv1a64:worker-post');
  const response = execute(requestValue, base);

  assert.equal(response.requestId, requestValue.requestId);
  assert.deepEqual(response.issueIds, ['issue:blocking', 'issue:warning']);
  assert.deepEqual(response.blockingIssueIds, ['issue:blocking']);
  assert.deepEqual(response.warningIssueIds, ['issue:warning']);
  assert.equal(response.receipt.status, 'INCREMENTAL_EQUIVALENT');
  assert.equal(Object.isFrozen(response), true);
  assert.deepEqual(assertTopologyEditValidationWorkerResponse(response), response);
});

test('current response is accepted and cannot be overwritten by a superseded response', () => {
  const base = topology();
  const firstRequest = request(base, 'fnv1a64:worker-post-1');
  const secondRequest = request(base, 'fnv1a64:worker-post-2');
  const firstResponse = execute(firstRequest, base);
  const secondResponse = execute(secondRequest, base);

  let state = createTopologyEditValidationWorkerState();
  state = beginTopologyEditValidationWorkerRequest(state, firstRequest);
  state = beginTopologyEditValidationWorkerRequest(state, secondRequest);
  const stale = acceptTopologyEditValidationWorkerResponse(state, firstResponse);
  assert.equal(stale.status, 'REJECTED_SUPERSEDED');
  assert.equal(stale.state.activeRequest.requestId, secondRequest.requestId);

  const accepted = acceptTopologyEditValidationWorkerResponse(stale.state, secondResponse);
  assert.equal(accepted.status, 'ACCEPTED');
  assert.equal(accepted.state.activeRequest, null);
  assert.equal(accepted.state.acceptedResponse.requestId, secondRequest.requestId);
  assert.deepEqual(assertTopologyEditValidationWorkerDisposition(accepted), accepted);
});

test('cancelled request response is rejected without changing accepted authority', () => {
  const base = topology();
  const requestValue = request(base, 'fnv1a64:worker-cancelled');
  const response = execute(requestValue, base);
  let state = createTopologyEditValidationWorkerState();
  state = beginTopologyEditValidationWorkerRequest(state, requestValue);
  state = cancelTopologyEditValidationWorkerRequest(state, requestValue.requestId);
  const disposition = acceptTopologyEditValidationWorkerResponse(state, response);

  assert.equal(disposition.status, 'REJECTED_CANCELLED');
  assert.equal(disposition.receipt, null);
  assert.equal(disposition.state.acceptedResponse, null);
});

test('request/input drift and tampered worker envelopes fail closed', () => {
  const base = topology();
  const requestValue = request(base, 'fnv1a64:worker-post');
  assert.throws(() => executeTopologyEditValidationWorkerRequest({
    request: requestValue,
    canonicalTopology: topology('fnv1a64:different-post'),
    operationPlan: plan(base),
    previousDiagnostics: [],
    checker: fakeChecker,
    now: clock(),
  }), /validatedTopologyHash/i);
  assert.throws(() => assertTopologyEditValidationWorkerRequest({
    ...requestValue,
    requestId: 'validation-request:tampered',
  }), /requestId does not match/i);

  const response = execute(requestValue, base);
  assert.throws(() => assertTopologyEditValidationWorkerResponse({
    ...response,
    blockingIssueIds: [],
  }), /responseHash does not match/i);
});

test('state rejects a recomputed response whose basis differs from active request', () => {
  const base = topology();
  const requestValue = request(base, 'fnv1a64:worker-post');
  const response = execute(requestValue, base);
  const material = {
    ...response,
    basisHash: 'fnv1a64:wrong-basis',
  };
  delete material.responseHash;
  const mismatched = {
    ...material,
    responseHash: semanticHash(material),
  };
  const state = beginTopologyEditValidationWorkerRequest(
    createTopologyEditValidationWorkerState(),
    requestValue,
  );
  const disposition = acceptTopologyEditValidationWorkerResponse(state, mismatched);
  assert.equal(disposition.status, 'REJECTED_BASIS_HASH');
  assert.equal(disposition.state.activeRequest.requestId, requestValue.requestId);
});
