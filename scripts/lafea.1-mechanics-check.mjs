import assert from 'node:assert/strict';
import {
  ACTION_SENSES, QUALIFICATION_STATES, calculateLocalAttachmentFoundation,
} from '../src/core/local-stress/index.js';
import { canonicalFixture } from './lafea.1-fixtures.mjs';
const result = calculateLocalAttachmentFoundation(canonicalFixture());
assert.equal(result.qualification.state, QUALIFICATION_STATES.ACCEPTED);
const load = result.transformedLoadCases[0];
assert.deepEqual(load.transformedForceGlobal, [1000, 0, 0]);
assert.deepEqual(load.transformedMomentGlobal, [0, 1_000_000, 0]);
assert.deepEqual(load.forceResidualGlobal, [0, 0, 0]);
assert.deepEqual(load.momentResidualGlobal, [0, 0, 0]);
assert.deepEqual(load.commonOriginMomentResidualGlobal, [0, 0, 0]);
assert.equal(result.coordinateSystemEvidence.handedness, 1);
assert.equal(result.coordinateSystemEvidence.orthogonalityResidual, 0);
const reversed = calculateLocalAttachmentFoundation(canonicalFixture((source) => {
  source.loadCases[0].actionSense = ACTION_SENSES.PIPE_ON_SUPPORT;
})).transformedLoadCases[0];
assert.deepEqual(reversed.transformedForceGlobal, [-1000, 0, 0]);
assert.deepEqual(reversed.transformedMomentGlobal, [0, -1_000_000, 0]);
const rotated = calculateLocalAttachmentFoundation(canonicalFixture((source) => {
  const q = Math.SQRT1_2;
  source.pipeCoordinateSystem.axialDirection.value = [q, q, 0];
  source.pipeCoordinateSystem.radialHint.value = [0, 0, 1];
  source.pipeCoordinateSystem.circumferentialHint.value = [-q, q, 0];
}));
assert.equal(rotated.qualification.state, QUALIFICATION_STATES.ACCEPTED);
const leftHanded = canonicalFixture((source) => {
  source.pipeCoordinateSystem.circumferentialHint.value = [0, -1, 0];
});
assert.equal(calculateLocalAttachmentFoundation(leftHanded).qualification.state, QUALIFICATION_STATES.REJECTED_MODEL);
console.log('LAFEA.1 mechanics checks passed.');
