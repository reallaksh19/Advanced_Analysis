#!/usr/bin/env node
import assert from 'node:assert/strict';
import { semanticHash } from '../src/core/shared-piping-model/canonical-json.js';
import {
  RIGID_ELEMENT_REQUEST_SCHEMA,
  RigidElementError,
  compileCaesarRigidElementAuthority,
  computeRigidElementRequestSemanticHash,
  requireRigidElementAuthority,
  rigidElementGravityLocalVector,
  sealRigidElementRequest,
} from '../src/core/linear-fea-rigid-element/index.js';

const REL_TOL = 1e-12;

function close(actual, expected, message, tolerance = REL_TOL) {
  const scale = Math.max(1, Math.abs(expected));
  assert.ok(Math.abs(actual - expected) <= tolerance * scale,
    `${message}: ${actual} != ${expected}`);
}

function sourceEvidence(label) {
  return {
    sourceId: `HEXAGON-${label}`,
    sourceRevision: 'VERSION-14',
    sourceSemanticHash: semanticHash({ label, version: 14 }),
  };
}

function request(overrides = {}) {
  const draft = {
    schema: RIGID_ELEMENT_REQUEST_SCHEMA,
    rigidElementId: 'RIGID-ELEMENT-01',
    length: 1.2,
    insideDiameter: 0.2,
    enteredOutsideDiameter: 0.2191,
    pipeWallThickness: 0.00955,
    enteredRigidWeight: 1800,
    fluidDensity: 850,
    insulationThickness: 0.05,
    insulationDensity: 120,
    refractoryWeight: 0,
    claddingWeight: 0,
    gravityAcceleration: 9.80665,
    installationTemperature: 20,
    operatingTemperature: 220,
    material: {
      elasticModulus: 200e9,
      shearModulus: 77e9,
      thermalExpansionCoefficient: 12e-6,
    },
    sourceEvidence: sourceEvidence('RIGID-RULES'),
    semanticHash: '',
    ...overrides,
  };
  draft.semanticHash = computeRigidElementRequestSemanticHash(draft);
  return draft;
}

console.log('\n--- LFEA B-3.22 CAESAR rigid-element authority ---');

const acceptedRequest = sealRigidElementRequest({ ...request(), semanticHash: '' });
const authority = compileCaesarRigidElementAuthority(acceptedRequest);
assert.equal(Object.isFrozen(authority), true);
assert.equal(authority.stiffnessSection.wallThickness, 0.0955);
assert.equal(authority.stiffnessSection.insideDiameter, 0.2);
assert.equal(authority.stiffnessSection.outsideDiameter, 0.391);
assert.equal(authority.gravity.includePipeWallMetalWeight, false);
assert.equal(authority.gravity.fluidDiameterBasis, 'ORIGINAL_INSIDE_DIAMETER');
assert.equal(authority.gravity.insulationDiameterBasis, 'ENTERED_OUTSIDE_DIAMETER');
assert.equal(authority.structuralParticipation.recoverForcesAndMoments, true);
assert.equal(authority.structuralParticipation.calculatePipingCodeStress, false);
assert.equal(authority.stiffnessSection.localStiffness.length, 144);
close(authority.thermal.axialStrain, 12e-6 * 200, 'thermal strain');
close(authority.thermal.freeExpansion, 12e-6 * 200 * 1.2, 'free thermal expansion');

const fluidArea = Math.PI * 0.2 ** 2 / 4;
const expectedFluid = 850 * fluidArea * 1.2 * 9.80665;
const insulatedOd = 0.2191 + 2 * 0.05;
const insulationArea = Math.PI * (insulatedOd ** 2 - 0.2191 ** 2) / 4;
const expectedInsulation = 1.75 * 120 * insulationArea * 1.2 * 9.80665;
close(authority.gravity.fluidWeight, expectedFluid, 'fluid weight');
close(authority.gravity.insulationWeight, expectedInsulation, 'insulation weight');
close(authority.gravity.totalWeight, 1800 + expectedFluid + expectedInsulation, 'total weight');

const gravityVector = rigidElementGravityLocalVector(authority, [0, -1, 0]);
close(gravityVector[1] + gravityVector[7], -authority.gravity.totalWeight, 'gravity resultant');
const firstMomentAboutI = gravityVector[5] + gravityVector[11] + 1.2 * gravityVector[7];
close(firstMomentAboutI, -authority.gravity.totalWeight * 0.6, 'gravity first moment');

const zero = compileCaesarRigidElementAuthority(sealRigidElementRequest({
  ...request({
    rigidElementId: 'RIGID-ELEMENT-ZERO',
    enteredRigidWeight: 0,
    refractoryWeight: 40,
    claddingWeight: 25,
  }),
  semanticHash: '',
}));
assert.equal(zero.gravity.totalWeight, 0);
assert.equal(zero.gravity.fluidWeight, 0);
assert.equal(zero.gravity.insulationWeight, 0);
assert.equal(zero.gravity.refractoryWeight, 0);
assert.equal(zero.gravity.claddingWeight, 0);
assert.deepEqual(rigidElementGravityLocalVector(zero, [0, -1, 0]), new Array(12).fill(0));

const repeat = compileCaesarRigidElementAuthority(acceptedRequest);
assert.deepEqual(repeat, authority);
assert.deepEqual(requireRigidElementAuthority(authority), authority);

assert.throws(
  () => compileCaesarRigidElementAuthority({ ...acceptedRequest, length: 2 }),
  (error) => error instanceof RigidElementError && error.code === 'RIGID_ELEMENT_HASH_MISMATCH',
);
assert.throws(
  () => sealRigidElementRequest({ ...request({ enteredOutsideDiameter: 0.19 }), semanticHash: '' }),
  (error) => error instanceof RigidElementError && error.code === 'RIGID_ELEMENT_DIAMETER_INVALID',
);

console.log(JSON.stringify({
  check: 'lfea-b3.22-rigid-element-authority',
  status: 'PASS',
  authorityHash: authority.semanticHash,
  totalWeight: authority.gravity.totalWeight,
  freeExpansion: authority.thermal.freeExpansion,
}, null, 2));
console.log('LFEA B-3.22 CAESAR rigid-element authority PASS');
