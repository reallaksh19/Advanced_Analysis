import assert from 'node:assert/strict';
import test from 'node:test';

import { finalizeCanonicalTopology } from '../src/workspace/topology-edit/topology-edit-canonical-state.js';
import { TopologyEditCertifiedSession } from '../src/workspace/topology-edit/topology-edit-certified-session.js';
import {
  prepareTopologyEditOperationCandidate,
} from '../src/workspace/topology-edit/professional/topology-edit-operation-candidate.js';
import {
  planExtendEdge,
} from '../src/workspace/topology-edit/professional/topology-edit-route-operations.js';
import {
  executeTopologyEditValidationWorkerRequest,
} from '../src/workspace/topology-edit/professional/topology-edit-validation-worker-contract.js';
import {
  TopologyEditValidationWorkerClient,
} from '../src/workspace/topology-edit/professional/topology-edit-validation-worker-client.js';

function baseTopology() {
  return finalizeCanonicalTopology({
    schema: 'topology-edit-canonical-topology/v1',
    datasetId: 'DS-WORKER',
    datasetVersion: 0,
    sourceHash: 'source:worker',
    topologyGraphHash: 'graph:worker',
    nodes: [
      { id: 'node:a', position: { x: 0, y: 0, z: 0 }, portKeys: [] },
      { id: 'node:b', position: { x: 100, y: 0, z: 0 }, portKeys: [] },
    ],
    edges: [{
      id: 'edge:e1',
      componentKey: 'P-1',
      fromNodeId: 'node:a',
      toNodeId: 'node:b',
      diameterMm: 100,
      entityType: 'PIPE',
    }],
    junctions: [], supports: [], boundaries: [], rigids: [], bends: [],
  });
}

function validationInput(distanceMm = 10) {
  const session = new TopologyEditCertifiedSession(baseTopology());
  const operationPlan = planExtendEdge({
    topology: session.currentTopology(),
    edgeId: 'edge:e1',
    endpoint: 'TO',
    distanceMm,
  });
  const candidate = prepareTopologyEditOperationCandidate({
    session,
    operationPlan,
  });
  return {
    operationPlan,
    canonicalTopology: candidate.canonicalTopology,
    previousDiagnostics: [],
    checkerOptions: {},
    performancePolicy: {
      fastPathBudgetMs: 16,
      warningBudgetMs: 100,
      hysteresisMs: 4,
    },
    blockingSeverities: ['HIGH'],
  };
}

class ExecutingWorker {
  static instances = [];

  constructor() {
    this.listeners = { message: new Set(), error: new Set() };
    this.terminated = false;
    ExecutingWorker.instances.push(this);
  }

  addEventListener(type, listener) { this.listeners[type].add(listener); }
  removeEventListener(type, listener) { this.listeners[type].delete(listener); }
  terminate() { this.terminated = true; }

  postMessage(payload) {
    const response = executeTopologyEditValidationWorkerRequest({
      request: payload.request,
      operationPlan: payload.operationPlan,
      canonicalTopology: payload.canonicalTopology,
      previousDiagnostics: payload.previousDiagnostics,
      checker: () => [],
      now: clock([0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 6]),
    });
    queueMicrotask(() => {
      for (const listener of this.listeners.message) {
        listener({
          data: {
            type: 'VALIDATED',
            requestId: response.requestId,
            response,
          },
        });
      }
    });
  }
}

class SilentWorker extends ExecutingWorker {
  postMessage() {}
}

class BrokenPostWorker extends ExecutingWorker {
  postMessage() { throw new Error('structured clone failed'); }
}

class BrokenConstructorWorker {
  constructor() { throw new Error('worker unavailable'); }
}

test('worker client accepts exact response authority and terminates the worker', async () => {
  ExecutingWorker.instances.length = 0;
  const client = new TopologyEditValidationWorkerClient({
    WorkerCtor: ExecutingWorker,
    workerUrl: new URL('file:///professional-worker.js'),
  });
  const input = validationInput();
  const result = await client.validate(input);

  assert.equal(result.disposition.status, 'ACCEPTED');
  assert.equal(
    result.receipt.validatedTopologyHash,
    input.canonicalTopology.canonicalTopologyHash,
  );
  assert.equal(ExecutingWorker.instances[0].terminated, true);
  assert.equal(client.snapshot().activeRequest, null);
  client.destroy();
});

test('cancellation terminates active computation and rejects with AbortError', async () => {
  SilentWorker.instances.length = 0;
  const client = new TopologyEditValidationWorkerClient({
    WorkerCtor: SilentWorker,
    workerUrl: new URL('file:///professional-worker.js'),
  });
  const pending = client.validate(validationInput());
  const requestId = client.snapshot().activeRequest.requestId;

  assert.equal(client.cancel(requestId), true);
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(SilentWorker.instances.at(-1).terminated, true);
  assert.ok(client.snapshot().cancelledRequestIds.includes(requestId));
});

test('a newer request supersedes and terminates the prior worker', async () => {
  SilentWorker.instances.length = 0;
  const client = new TopologyEditValidationWorkerClient({
    WorkerCtor: SilentWorker,
    workerUrl: new URL('file:///professional-worker.js'),
  });
  const first = client.validate(validationInput(10));
  const firstId = client.snapshot().activeRequest.requestId;
  const second = client.validate(validationInput(20));

  await assert.rejects(first, { name: 'AbortError' });
  assert.equal(SilentWorker.instances[0].terminated, true);
  assert.ok(client.snapshot().supersededRequestIds.includes(firstId));
  client.cancel();
  await assert.rejects(second, { name: 'AbortError' });
});

test('constructor failure leaves worker state unchanged and inactive', () => {
  const client = new TopologyEditValidationWorkerClient({
    WorkerCtor: BrokenConstructorWorker,
    workerUrl: new URL('file:///professional-worker.js'),
  });
  assert.throws(
    () => client.validate(validationInput()),
    /worker startup failed: worker unavailable/i,
  );
  assert.equal(client.snapshot().activeRequest, null);
  assert.equal(client.active, null);
});

test('postMessage failure terminates the worker and clears the active request', async () => {
  BrokenPostWorker.instances.length = 0;
  const client = new TopologyEditValidationWorkerClient({
    WorkerCtor: BrokenPostWorker,
    workerUrl: new URL('file:///professional-worker.js'),
  });
  await assert.rejects(
    client.validate(validationInput()),
    /worker startup failed: structured clone failed/i,
  );
  assert.equal(BrokenPostWorker.instances.at(-1).terminated, true);
  assert.equal(client.snapshot().activeRequest, null);
  assert.equal(client.active, null);
});

function clock(values) {
  let index = 0;
  return () => values[index++];
}
