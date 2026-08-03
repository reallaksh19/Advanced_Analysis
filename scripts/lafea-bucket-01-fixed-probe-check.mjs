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
const strain = { epsilonX: 100, epsilonY: 50, gammaXY: 3 };
const nodalDisplacements = nodes.map((node) => ({
  nodeId: node.nodeId,
  ux: strain.epsilonX * node.x + 0.5 * strain.gammaXY * node.y,
  uy: strain.epsilonY * node.y + 0.5 * strain.gammaXY * node.x,
}));
const retainedElement = {
  ...element,
  dMatrix: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
};
const result = {
  schema: 'local-continuum-result/v1',
  qualification: { state: 'ACCEPTED' },
  meshEvidence: {
    formulation: 'PLANE_STRESS',
    elementEvidence: [retainedElement],
  },
  loadCaseResults: [{ loadCaseId: 'LC1', nodalDisplacements }],
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
assert.equal(
  evidence.recoveryAuthority,
  'ELEMENT_LOCAL_DIRECT_DISPLACEMENT_GRADIENT',
);
assert.equal(evidence.retainedIntegrationPointExtrapolationUsed, false);
assert.ok(Math.abs(evidence.naturalCoordinates.xi - 0.2) <= 1e-12);
assert.ok(Math.abs(evidence.naturalCoordinates.eta - 0.3) <= 1e-12);
assert.ok(Math.abs(evidence.strain.epsilonX - 100) <= 1e-10);
assert.ok(Math.abs(evidence.strain.epsilonY - 50) <= 1e-10);
assert.ok(Math.abs(evidence.strain.gammaXY - 3) <= 1e-10);
assert.ok(Math.abs(evidence.authoritativeValue - 100) <= 1e-10);
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
const expected = Math.sqrt(
  100 ** 2 - 100 * 50 + 50 ** 2 + 3 * 3 ** 2,
);
assert.ok(Math.abs(invariantEvidence.authoritativeValue - expected) <= 1e-10);

assert.throws(
  () => recoverLafeaBucket01FixedProbe({
    ...input,
    probe: { ...input.probe, x: 2, y: 2 },
  }),
  (error) => error?.code === 'LAFEA_B01_PROBE_OUTSIDE_MESH',
);

const altered = structuredClone(evidence);
altered.authoritativeValue = 0;
assert.equal(
  validateLafeaBucket01FixedProbeEvidence(altered, mesh, result).ok,
  false,
);

console.log('Bucket-01 direct T6 fixed physical probe recovery checks passed.');
