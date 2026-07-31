// scripts/lafea-webgl-renderer-check.mjs

import assert from 'node:assert/strict';
import fs from 'node:fs';
import { requireRenderPacket, sealRenderPacket, packQualifiedMeshForRendering } from '../src/workspace/lafea-canvas/render-packet-contract.js';
import { createRenderWorkerClient } from '../src/workspace/lafea-canvas/render-worker-client.js';
import { presentMeshQuality } from '../src/workspace/lafea-canvas/accessible-inspector.js';
import {
  REQUIRED_CANVAS_TESTS,
  assertRequiredTestsRegistered,
} from './lafea-required-test-registry.mjs';

const executedTests = new Set();

// LAFEA-CANVAS-T20: Render packet schema & typed array validation
const validPacket = {
  schema: 'LafeaRenderPacket.v1',
  sceneRevision: 1,
  elementType: 'T6',
  nodesPerElement: 3,
  positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
  indices: new Uint32Array([0, 1, 2]),
  elementIdIndices: new Uint32Array([1]),
  fieldValues: new Float32Array([10, 10, 10]),
  qualityFlags: new Uint8Array([0, 0, 0]),
  pickMap: { schema: 'LafeaPickMap.v1', sceneRevision: 1, entries: [] },
};

const checked = requireRenderPacket(validPacket);
assert.equal(checked.schema, 'LafeaRenderPacket.v1');
const sealed = sealRenderPacket(validPacket);
assert.ok(Object.isFrozen(sealed));
validPacket.fieldValues[0] = 99;
assert.equal(sealed.fieldValues[0], 10);
validPacket.fieldValues[0] = 10;
executedTests.add('LAFEA-CANVAS-T20');

// LAFEA-CANVAS-T21: Mesh packing for rendering
const packed = packQualifiedMeshForRendering({
  schema: 'LafeaRenderPacket.v1',
  sceneRevision: 1,
  elementType: 'T6',
  nodesPerElement: 3,
  positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
  indices: [0, 1, 2],
  elementIdIndices: [1],
  fieldValues: [10, 10, 10],
  qualityFlags: [0, 0, 0],
  pickMap: { schema: 'LafeaPickMap.v1', sceneRevision: 1, entries: [] },
});
assert.equal(packed.schema, 'LafeaRenderPacket.v1');
assert.ok(packed.positions instanceof Float32Array);
assert.ok(Object.isFrozen(packed));
assert.throws(() => packQualifiedMeshForRendering({
  ...validPacket,
  positions: [...validPacket.positions],
  indices: [...validPacket.indices],
  elementIdIndices: [...validPacket.elementIdIndices],
  fieldValues: [10, Number.NaN, 10],
  qualityFlags: [0, 0, 0],
}), (error) => error.code === 'LAFEA_RENDER_UNRECOVERED_FIELD_FLAG_REQUIRED');
executedTests.add('LAFEA-CANVAS-T21');

// LAFEA-CANVAS-T22: Worker client request creation
let postedMessage = null;
const mockWorker = {
  postMessage(msg) { postedMessage = msg; },
};

const workerClient = createRenderWorkerClient(mockWorker);
workerClient.request({
  requestId: 'REQ_1',
  sceneRevision: 1,
  sceneHash: 'H1',
  meshHash: 'M1',
  recoveryHash: 'R1',
  qualifiedMesh: {},
  qualifiedRecovery: {},
});
assert.equal(postedMessage.type, 'BUILD_RENDER_PACKET');
assert.equal(postedMessage.requestId, 'REQ_1');
assert.throws(() => workerClient.request({
  requestId: 'REQ_2',
  sceneRevision: 1,
  sceneHash: 'H2',
  meshHash: 'M2',
  recoveryHash: 'R2',
  qualifiedMesh: {},
  qualifiedRecovery: {},
}), (error) => error.code === 'LAFEA_RENDER_WORKER_REQUEST_ACTIVE');
executedTests.add('LAFEA-CANVAS-T22');

// LAFEA-CANVAS-T23: Worker client stale reply rejection
assert.throws(() => {
  workerClient.accept({
    requestId: 'REQ_1',
    sceneRevision: 2, // Mismatched revision!
    sceneHash: 'H1',
    meshHash: 'M1',
    recoveryHash: 'R1',
    renderPacket: validPacket,
  });
}, (err) => err.code === 'LAFEA_RENDER_WORKER_STALE_REPLY');
const acceptedPacket = workerClient.accept({
  requestId: 'REQ_1',
  sceneRevision: 1,
  sceneHash: 'H1',
  meshHash: 'M1',
  recoveryHash: 'R1',
  renderPacket: validPacket,
});
assert.notEqual(acceptedPacket, validPacket);
assert.equal(acceptedPacket.schema, validPacket.schema);
const failedPostClient = createRenderWorkerClient({
  postMessage() { throw new Error('POST_FAILED'); },
});
const failedPostRequest = {
  requestId: 'REQ_POST_FAILURE',
  sceneRevision: 1,
  sceneHash: 'H1',
  meshHash: 'M1',
  recoveryHash: 'R1',
  qualifiedMesh: {},
  qualifiedRecovery: {},
};
assert.throws(() => failedPostClient.request(failedPostRequest), /POST_FAILED/u);
assert.throws(() => failedPostClient.request(failedPostRequest), /POST_FAILED/u);
executedTests.add('LAFEA-CANVAS-T23');

// LAFEA-CANVAS-T24: Present mesh quality verbatim preservation
const qualityPassed = presentMeshQuality({
  elementId: 'E1',
  status: 'QUALIFIED',
  metricId: 'JACOBIAN',
  value: 0.9,
  limit: 0.6,
  units: 'RATIO',
  semanticHash: 'QH1',
});
assert.equal(qualityPassed.canSolve, true);

const qualityBlocked = presentMeshQuality({
  elementId: 'E2',
  status: 'BLOCKED',
  metricId: 'JACOBIAN',
  value: 0.2,
  limit: 0.6,
  units: 'RATIO',
  semanticHash: 'QH2',
});
assert.equal(qualityBlocked.canSolve, false);
executedTests.add('LAFEA-CANVAS-T24');

const rendererSource = fs.readFileSync(
  new URL('../src/workspace/lafea-canvas/three-mesh-renderer.js', import.meta.url),
  'utf8',
);
assert.doesNotMatch(rendererSource, /color:\s*0x3b82f6/u);
assert.match(rendererSource, /AUTODESK_SIMULATION_RAINBOW/u);
assert.match(rendererSource, /LAFEA_RENDER_FIELD_BOUNDS_REQUIRED/u);

assertRequiredTestsRegistered(
  [...executedTests],
  REQUIRED_CANVAS_TESTS.slice(19, 24),
);
console.log('LAFEA render-packet/worker contracts PASS (T20-T24 executed; renderer source guards passed)');
