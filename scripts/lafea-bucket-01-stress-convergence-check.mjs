#!/usr/bin/env node
import assert from 'node:assert/strict';
import { canonicalLafeaSha256 } from '../src/workspace/lafea-canonical-sha256.js';
import {
  LAFEA_BUCKET_01_FIXED_PROBE_INPUT_SCHEMA,
  recoverLafeaBucket01FixedProbe,
} from '../src/workspace/lafea-bucket-01-fixed-probe.js';
import {
  LAFEA_BUCKET_01_STRESS_CONVERGENCE_INPUT_SCHEMA,
  evaluateLafeaBucket01StressConvergence,
  validateLafeaBucket01StressConvergenceEvidence,
} from '../src/workspace/lafea-bucket-01-stress-convergence.js';

const nodes = [
  ['N1', 0, 0], ['N2', 1, 0], ['N3', 0, 1],
  ['N4', 0.5, 0], ['N5', 0.5, 0.5], ['N6', 0, 0.5],
].map(([nodeId, x, y]) => ({ nodeId, x, y, z: 0 }));
const element = {
  elementId: 'E1', elementType: 'T6',
  nodeIds: ['N1', 'N2', 'N3', 'N4', 'N5', 'N6'],
};
const mesh = {
  schema: 'lafea-analysis-mesh/v1', meshIdentity: 'STRESS_CONVERGENCE_TEST',
  nodes, elements: [element],
};
const exactHeadSha = 'a'.repeat(40);
const values = [10.16, 10.04, 10.01];
const probes = values.map((value, index) => {
  const gaussPointResults = [
    ['GP1', 1 / 6, 1 / 6],
    ['GP2', 2 / 3, 1 / 6],
    ['GP3', 1 / 6, 2 / 3],
  ].map(([pointId, xi, eta]) => ({
    pointId, xi, eta, weight: 1 / 6, jacobianDeterminant: 1,
    stress: { sigmaX: value, sigmaY: 0, sigmaZ: 0, tauXY: 0 },
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
  return recoverLafeaBucket01FixedProbe({
    schema: LAFEA_BUCKET_01_FIXED_PROBE_INPUT_SCHEMA,
    exactHeadSha,
    meshHash: `sha256:${String(index + 1).repeat(64)}`,
    recoveryHash: `sha256:${String(index + 4).repeat(64)}`,
    mesh,
    result,
    probe: {
      probeId: 'P1', loadCaseId: 'LC1', x: 0.2, y: 0.3,
      component: 'SIGMA_X', units: 'MPa',
      locationDefinitionHash: `sha256:${'d'.repeat(64)}`,
    },
  });
});
const input = {
  schema: LAFEA_BUCKET_01_STRESS_CONVERGENCE_INPUT_SCHEMA,
  exactHeadSha,
  probeEvidences: probes,
  meshSizes: [0.4, 0.2, 0.1],
  gciTolerance: 0.005,
  minimumObservedOrder: 1.5,
  asymptoticRatioBounds: { minimum: 0.85, maximum: 1.15 },
};
const evidence = evaluateLafeaBucket01StressConvergence(input);
assert.equal(evidence.status, 'PASS');
assert.equal(evidence.convergence.classification, 'MONOTONIC');
assert.equal(evidence.authority.fixedPhysicalLocation, true);
assert.equal(evidence.authority.movingMaximumUsed, false);
assert.equal(
  validateLafeaBucket01StressConvergenceEvidence(evidence, probes).ok,
  true,
);

const drifted = [...probes];
const driftedBase = { ...drifted[2] };
const driftedProbe = {
  ...driftedBase.probe,
  locationDefinitionHash: `sha256:${'e'.repeat(64)}`,
};
const driftedEvidenceBase = { ...driftedBase, probe: driftedProbe };
delete driftedEvidenceBase.semanticHash;
drifted[2] = Object.freeze({
  ...driftedEvidenceBase,
  semanticHash: canonicalLafeaSha256(driftedEvidenceBase),
});
let driftBlocked = false;
try {
  evaluateLafeaBucket01StressConvergence({ ...input, probeEvidences: drifted });
} catch (error) {
  driftBlocked = error.code === 'LAFEA_B01_STRESS_PROBE_IDENTITY_DRIFT';
}
assert.equal(driftBlocked, true);

console.log('Bucket-01 fixed-probe stress convergence checks passed.');
