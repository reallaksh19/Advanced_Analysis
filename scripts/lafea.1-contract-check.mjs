import assert from 'node:assert/strict';
import {
  MODEL_SCHEMA, QUALIFICATION_STATES, RESULT_SCHEMA,
  calculateLocalAttachmentFoundation, reconstructResultHashes,
} from '../src/core/local-stress/index.js';
import { canonicalFixture } from './lafea.1-fixtures.mjs';

const model = canonicalFixture();
assert.equal(model.schema, MODEL_SCHEMA);
assert.equal(model.semanticHash, model.sourceAncestry.canonicalModelSemanticHash);
assert.ok(Object.isFrozen(model));
assert.ok(Object.isFrozen(model.sourceEvidence));

const result = calculateLocalAttachmentFoundation(model);
assert.equal(result.schema, RESULT_SCHEMA);
assert.equal(result.qualification.state, QUALIFICATION_STATES.ACCEPTED);
assert.deepEqual(result.semanticHashes, reconstructResultHashes(result));
assert.ok(Object.isFrozen(result));
assert.doesNotThrow(() => JSON.parse(JSON.stringify(result)));
assert.equal(hasNegativeZero(result), false);

const forged = JSON.parse(JSON.stringify(model));
forged.semanticHash = 'fnv1a64:0000000000000000';
const rejected = calculateLocalAttachmentFoundation(forged);
assert.equal(rejected.qualification.state, QUALIFICATION_STATES.REJECTED_MODEL);
assert.equal('transformedLoadCases' in rejected, false);
assert.equal('pressureStressResults' in rejected, false);
assert.equal(rejected.formulaTrace.length, 0);

const unsupportedModel = canonicalFixture((source) => source.resultRequests.requestedAnalyses.push('LOCAL_ATTACHMENT_STRESS'));
const unsupported = calculateLocalAttachmentFoundation(unsupportedModel);
assert.equal(unsupported.qualification.state, QUALIFICATION_STATES.UNSUPPORTED_REQUEST);
assert.equal('transformedLoadCases' in unsupported, false);

const converted = canonicalFixture((source) => {
  source.units = { length: 'm', force: 'kN', moment: 'N·m', pressure: 'MPa', stress: 'MPa' };
  source.pipeGeometry.outsideDiameter.value = 1;
  for (const key of ['nominalPipeThickness', 'assessmentPipeThickness']) source.thicknessBasis[key].value = 0.01;
  source.thicknessBasis.corrosionAllowance.value = 0;
  source.thicknessBasis.wearPadThickness.value = 0.02;
  source.thicknessBasis.cradleThickness.value = 0.03;
  source.thicknessBasis.effectiveAnalyticalThickness.value = 0.05;
  source.loadReferencePoints.find((row) => row.identity === 'SOURCE').point.value = [0, 0, 1];
  source.loadCases[0].force.value = [1, 0, 0];
  source.resultRequests.pressure[0].requestedRadii[0].value = 0.49;
  source.resultRequests.pressure[0].requestedRadii[1].value = 0.5;
});
assert.equal(converted.pipeGeometry.outsideDiameter.value, 1000);
assert.equal(converted.loadCases[0].force.value[0], 1000);
assert.equal(converted.thicknessBasis.assessmentPipeThickness.value, 10);

assert.throws(() => canonicalFixture((source) => {
  source.pipeGeometry.outsideDiameter.sourceRef = 'OTHER@1#geometry.outsideDiameter';
}), /must begin with/);
assert.throws(() => canonicalFixture((source) => {
  source.pipeGeometry.outsideDiameter.sourceRef = 'SOURCE-PIPE-MODEL@7#';
}), /non-empty source path/);
assert.throws(() => canonicalFixture((source) => {
  source.thicknessBasis.assessmentPipeThickness.value = 9;
}), /conflicts/);
assert.throws(() => canonicalFixture((source) => {
  source.pipeGeometry.outsideDiameter.value = null;
}), /finite number/);

assert.throws(() => canonicalFixture((source) => {
  source.contact = { enabled: true };
}), /unsupported field/);
assert.throws(() => canonicalFixture((source) => {
  source.pipeGeometry.localStressMethod = 'HIDDEN';
}), /unsupported field/);
assert.throws(() => canonicalFixture((source) => {
  source.loadCases[0].force.contactForce = 10;
}), /unsupported field/);
assert.throws(() => canonicalFixture((source) => {
  source.resultRequests.requestedAnalyses.push(source.resultRequests.requestedAnalyses[0]);
}), /Duplicate identity/);
assert.throws(() => canonicalFixture((source) => {
  source.resultRequests.transformedLoadCaseIdentities.push('LC-1');
}), /Duplicate identity/);
assert.throws(() => canonicalFixture((source) => {
  source.qualificationProfile.frameMinimumSine = 1.01;
}), /not greater than one/);
assert.throws(() => canonicalFixture((source) => {
  source.qualificationProfile.handednessMinimumAlignment = 2;
}), /not greater than one/);

console.log('LAFEA.1 contract checks passed.');

function hasNegativeZero(value) {
  if (typeof value === 'number') return Object.is(value, -0);
  if (Array.isArray(value)) return value.some(hasNegativeZero);
  if (value && typeof value === 'object') return Object.values(value).some(hasNegativeZero);
  return false;
}
