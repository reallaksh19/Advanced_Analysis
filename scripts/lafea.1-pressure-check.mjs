import assert from 'node:assert/strict';
import {
  QUALIFICATION_STATES, calculateLocalAttachmentFoundation,
} from '../src/core/local-stress/index.js';
import { canonicalFixture } from './lafea.1-fixtures.mjs';
const closed = calculateLocalAttachmentFoundation(canonicalFixture()).pressureStressResults[0];
near(closed.coefficientA, 48.505050505050505);
near(closed.coefficientB, 12_126_262.626262626);
near(closed.requestedPoints[0].radialStress, -2);
near(closed.requestedPoints[1].radialStress, 0);
near(closed.requestedPoints[0].hoopStress, 99.01010101010101);
near(closed.axialPressureStress, closed.coefficientA);
assert.equal(closed.boundaryEvidence.accepted, true);
assert.equal(closed.pressureWallBasis, 'ASSESSMENT_PIPE_THICKNESS_ONLY');
assert.equal(closed.assessmentPipeThickness, 10);
const openResult = calculateLocalAttachmentFoundation(requestFor('P-OPEN', true));
const open = openResult.pressureStressResults[0];
assert.equal(open.axialPressureStress, 0);
assert.ok(openResult.formulaTrace.includes('OPEN_END_AXIAL_PRESSURE_STRESS_ZERO_V1'));
assert.equal(openResult.formulaTrace.includes('LAME_CLOSED_END_AXIAL_STRESS_V1'), false);
const explicit = pressureResult('P-EXPLICIT');
assert.equal(explicit.axialPressureStress, null);
assert.equal(explicit.explicitAxialResultant, 12345);
const unsupported = calculateLocalAttachmentFoundation(requestFor('P-UNSPECIFIED', true));
assert.equal(unsupported.qualification.state, QUALIFICATION_STATES.UNSUPPORTED_REQUEST);
const external = calculateLocalAttachmentFoundation(canonicalFixture((source) => {
  source.pressureDefinitions.find((row) => row.identity === 'P-CLOSED').externalPressure.value = 1;
})).pressureStressResults[0];
assert.ok(external.limitations.includes('NO_EXTERNAL_PRESSURE_STABILITY_ASSESSMENT'));
const equal = calculateLocalAttachmentFoundation(canonicalFixture((source) => {
  source.pressureDefinitions.find((row) => row.identity === 'P-CLOSED').externalPressure.value = 2;
})).pressureStressResults[0];
near(equal.requestedPoints[0].radialStress, -2);
near(equal.requestedPoints[0].hoopStress, -2);
console.log('LAFEA.1 pressure checks passed.');
function pressureResult(identity) { return calculateLocalAttachmentFoundation(requestFor(identity, true)).pressureStressResults[0]; }
function requestFor(identity, axial) {
  return canonicalFixture((source) => {
    source.resultRequests.pressure[0].pressureDefinitionIdentity = identity;
    source.resultRequests.pressure[0].includeAxialPressureStress = axial;
  });
}
function near(actual, expected) { const scale = Math.max(1, Math.abs(actual), Math.abs(expected)); assert.ok(Math.abs(actual - expected) <= 1e-10 * scale, `${actual} != ${expected}`); }
