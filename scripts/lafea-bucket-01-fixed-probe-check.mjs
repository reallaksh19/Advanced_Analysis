#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  LAFEA_BUCKET_01_FIXED_PROBE_INPUT_SCHEMA,
  recoverLafeaBucket01FixedProbe,
  validateLafeaBucket01FixedProbeEvidence,
} from '../src/workspace/lafea-bucket-01-fixed-probe.js';

const nodes = [
  ['N1', 0, 0], ['N2', 1, 0], ['N3', 0, 1],
  ['N4', 0.5, 0], ['N5', 0.5, 0.5], ['N6', 0, 0.5],
].map(([nodeId, x, y]) => ({ nodeId, x, y, z: 0 }));
const element = {
  elementId: 'E1', elementType: 'T6',
  nodeIds: ['N1', 'N2', 'N3', 'N4', 'N5', 'N6'],
};
const mesh = {
  schema: 'lafea-analysis-mesh/v1', meshIdentity: 'PROBE_TEST',
  nodes, elements: [element],
};
const gaussPointResults = [
  ['GP1', 1 / 6, 1 / 6],
  ['GP2', 2 / 3, 1 / 6],
  ['GP3', 1 / 6, 2 / 3],
].map(([pointId, xi, eta]) => ({
  pointId, xi, eta, weight: 1 / 6, jacobianDeterminant: 1,
  stress: {
    sigmaX: 100 + 10 * xi + 20 * eta,
    sigmaY: 50 - 5 * xi + 4 * eta,
    sigmaZ: 0,
    tauXY: 3 + 2 * xi - eta,
  },
}));
const result = {
  schema: 'local-continuum-result/v1',
  qualification: { state: 'ACCEPTED' },
  meshEvidence: { elementEvidence: [element] },
  loadCaseResults: [{
    loadCaseId: 'LC1',
    elementResults: [{
      elementId: 'E1', elementType: 'T6',
      recoveryLayer: 'INTEGRATION_POINT', gaussPointResults,
    }],
  }],
};
const input = {
  schema: LAFEA_BUCKET_01_FIXED_PROBE_INPUT_SCHEMA,
  exactHeadSha: 'a'.repeat(40),
  meshHash: `sha256:${'b'.repeat(64)}`,
  recoveryHash: `sha256:${'c'.repeat(64)}`,
  mesh,
  result,
  probe: {
    probeId: 'P1', loadCaseId: 'LC1', x: 0.2, y: 0.3,
    component: 'SIGMA_X', units: 'MPa',
    locationDefinitionHash: `sha256:${'d'.repeat(64)}`,
  },
};
const evidence = recoverLafeaBucket01FixedProbe(input);
assert.equal(evidence.status, 'PASS');
assert.equal(evidence.elementId, 'E1');
assert.ok(Math.abs(evidence.naturalCoordinates.xi - 0.2) <= 1e-12);
assert.ok(Math.abs(evidence.naturalCoordinates.eta - 0.3) <= 1e-12);
assert.ok(Math.abs(evidence.authoritativeValue - 108) <= 1e-12);
assert.equal(evidence.crossElementAveragingUsed, false);
assert.equal(evidence.nodalProjectionUsed, false);
assert.equal(
  validateLafeaBucket01FixedProbeEvidence(evidence, mesh, result).ok,
  true,
);

const invariantEvidence = recoverLafeaBucket01FixedProbe({
  ...input,
  probe: { ...input.probe, component: 'VON_MISES' },
});
const sigmaX = 108; const sigmaY = 50.2; const tauXY = 3.1;
const expected = Math.sqrt(
  sigmaX ** 2 - sigmaX * sigmaY + sigmaY ** 2 + 3 * tauXY ** 2,
);
assert.ok(Math.abs(invariantEvidence.authoritativeValue - expected) <= 1e-12);

let outsideMeshBlocked = false;
try {
  recoverLafeaBucket01FixedProbe({
    ...input,
    probe: { ...input.probe, x: 2, y: 2 },
  });
} catch (error) {
  outsideMeshBlocked = error.code === 'LAFEA_B01_PROBE_OUTSIDE_MESH';
}
assert.equal(outsideMeshBlocked, true);

const altered = structuredClone(evidence);
altered.authoritativeValue = 0;
assert.equal(
  validateLafeaBucket01FixedProbeEvidence(altered, mesh, result).ok,
  false,
);

console.log('Bucket-01 fixed physical probe recovery checks passed.');
