#!/usr/bin/env node

import assert from 'node:assert/strict';
import { sourceFixture as foundationSource } from './lafea.1-fixtures.mjs';
import { rawRequestFixture as screeningSource } from './lafea.2-fixtures.mjs';
import {
  LOAD_FOUNDATION_BENCHMARK_IDS,
  LOAD_FOUNDATION_METHODS,
  compileLafeaLoadFoundation,
  createLafeaLoadFoundationHandoff,
} from '../src/core/local-load-foundation/index.js';
import {
  SCREENING_PRODUCT_BENCHMARK_IDS,
  calculateLocalAttachmentScreening,
  createLocalAttachmentScreeningAssessment,
  createLocalAttachmentScreeningHandoff,
  createLocalAttachmentScreeningRequest,
} from '../src/core/local-attachment-screening/index.js';
import {
  createLafeaAnalyticalProductBatch,
  registerLafeaAnalyticalProductBatch,
} from '../src/workspace/lafea-analytical-product-producers.js';
import { requireLafeaStageComposition } from '../src/workspace/lafea-stage-composition-root.js';
import { createLafeaWorkbenchStore } from '../src/workspace/lafea-lifecycle-workbench-store.js';

const SHA = `sha256:${'1'.repeat(64)}`;
const RESULTANT = Object.freeze({
  force: [120, -80, 60],
  moment: [700, -500, 900],
  sourceReference: 'A1-DECLARED-RESULTANT',
});

const STATIONS = Object.freeze({
  POINT: [station('P1', [0, 0, 0], 1)],
  LINE: [station('L1', [-2, 0, 0], 2), station('L2', [2, 0, 0], 2)],
  RECTANGULAR_PATCH: [
    station('R1', [-2, -1, 0], 2), station('R2', [2, -1, 0], 2),
    station('R3', [2, 1, 0], 2), station('R4', [-2, 1, 0], 2),
  ],
  CIRCULAR_PATCH: [
    station('C1', [2, 0, 0], 1), station('C2', [0, 2, 0], 1),
    station('C3', [-2, 0, 0], 1), station('C4', [0, -2, 0], 1),
  ],
  WELD_LINE: [station('W1', [-3, 0, 0], 3), station('W2', [3, 0, 0], 3)],
  RIGID_SPIDER: [
    station('S1', [1, 0, 0], 1), station('S2', [0, 1, 0], 1),
    station('S3', [0, 0, 1], 1), station('S4', [-1, -1, -1], 1),
  ],
});

const foundationResults = new Map();
for (const method of LOAD_FOUNDATION_METHODS) {
  const result = compileLafeaLoadFoundation(foundationInput(method, STATIONS[method]));
  foundationResults.set(method, result);
  assert.equal(result.qualification.state, 'ACCEPTED', `${method} must close.`);
  assert.equal(result.forceMomentClosure.accepted, true);
  assertVector(result.forceMomentClosure.reconstructedForce, RESULTANT.force, 1e-9);
  assertVector(result.forceMomentClosure.reconstructedMoment, RESULTANT.moment, 1e-8);
  assert.equal(result.limitations.includes('NO_LOCAL_ATTACHMENT_STRESS'), true);
  assert.equal(result.limitations.includes('NO_CODE_COMPLIANCE'), true);
}

const rigid = foundationResults.get('RIGID_SPIDER');
assert.equal(rigid.stationLoads.every((row) => row.moment.every((value) => value === 0)), true);
assert.equal(rigid.stationLoads.every((row) =>
  row.distributionRule === 'MINIMUM_NORM_FORCE_ONLY_RIGID_SPIDER_V1'), true);

assert.throws(() => compileLafeaLoadFoundation(foundationInput('RIGID_SPIDER', [
  station('D1', [0, 0, 0], 1),
  station('D2', [1, 0, 0], 1),
  station('D3', [2, 0, 0], 1),
])), (error) => error?.code === 'LOAD_FOUNDATION_RIGID_SPIDER_RANK_DEFICIENT');

const foundationHandoff = createLafeaLoadFoundationHandoff({
  foundationResult: foundationResults.get('RECTANGULAR_PATCH'),
  handoffIdentity: 'A1-HO-RECT-TO-CONTINUUM',
  targetStageId: 'LAFEA.3',
  targetSourceHash: SHA,
});
assert.deepEqual(foundationHandoff.resultant.force, RESULTANT.force);
assert.deepEqual(foundationHandoff.resultant.moment, RESULTANT.moment);
assert.equal('stress' in foundationHandoff, false);
assert.equal(foundationHandoff.prohibitedInferences.includes('NO_FE_STRESS_TRANSFER'), true);

const screeningRequest = createLocalAttachmentScreeningRequest(screeningSource());
const screeningResult = calculateLocalAttachmentScreening(screeningRequest);
assert.equal(screeningResult.qualification.state, 'ACCEPTED');
const applicability = screeningResult.pointStressStates.map((point) => ({
  screeningCaseId: point.screeningCaseId,
  evaluationLocationId: point.evaluationLocationId,
  locationClass: 'FAR_FIELD',
  transverseShearState: 'NOT_PRESENT',
  evidenceReferences: [`APP#${point.screeningCaseId}/${point.evaluationLocationId}`],
}));
const governingQuantity = screeningResult.envelopes[0].quantity;
const passAssessment = createLocalAttachmentScreeningAssessment({
  screeningResult,
  assessmentIdentity: 'A2-PASS',
  assessmentProfileId: 'A2-PRODUCT-PROFILE-1',
  governingQuantity,
  applicabilityRecords: applicability,
});
assert.equal(passAssessment.state, 'PASS');
assert.equal(passAssessment.decisions.every((row) => row.state === 'PASS'), true);

const escalationRecords = structuredClone(applicability);
escalationRecords[0].locationClass = 'ATTACHMENT';
const escalation = createLocalAttachmentScreeningAssessment({
  screeningResult,
  assessmentIdentity: 'A2-ESCALATE',
  assessmentProfileId: 'A2-PRODUCT-PROFILE-1',
  governingQuantity,
  applicabilityRecords: escalationRecords,
});
assert.equal(escalation.state, 'ESCALATE');
assert.equal(escalation.decisions.some((row) =>
  row.rationaleCodes.includes('LOCATION_ATTACHMENT')), true);

const shearRecords = structuredClone(applicability);
shearRecords[0].transverseShearState = 'UNSUPPORTED';
assert.equal(createLocalAttachmentScreeningAssessment({
  screeningResult,
  assessmentIdentity: 'A2-SHEAR',
  assessmentProfileId: 'A2-PRODUCT-PROFILE-1',
  governingQuantity,
  applicabilityRecords: shearRecords,
}).state, 'ESCALATE');

assert.equal(createLocalAttachmentScreeningAssessment({
  screeningResult,
  assessmentIdentity: 'A2-BLOCKED',
  assessmentProfileId: 'A2-PRODUCT-PROFILE-1',
  governingQuantity,
  applicabilityRecords: applicability.slice(1),
}).state, 'BLOCKED');

const screeningHandoff = createLocalAttachmentScreeningHandoff({
  assessment: escalation,
  screeningResult,
  handoffIdentity: 'A2-HO-TO-SHELL',
  targetStageId: 'LAFEA.4',
  targetSourceHash: SHA,
});
assert.equal(screeningHandoff.governingCase,
  escalation.governingEnvelope.screeningCaseId);
assert.equal(screeningHandoff.governingLocation,
  escalation.governingEnvelope.evaluationLocationId);
assert.equal('stress' in screeningHandoff, false);
assert.equal(screeningHandoff.prohibitedInferences
  .includes('NO_NOMINAL_STRESS_TRANSFER_AS_FE_STRESS'), true);

for (const stageId of ['LAFEA.1', 'LAFEA.2']) {
  const composition = requireLafeaStageComposition(stageId);
  assert.equal(composition.productSupported, true);
  assert.equal(typeof composition.createProductEvidence, 'function');
  assert.equal(composition.releaseStateBinding, 'RELEASE_NOT_QUALIFIED');
}
for (const stageId of ['LAFEA.3', 'LAFEA.4', 'LAFEA.5', 'LAFEA.6']) {
  const composition = requireLafeaStageComposition(stageId);
  assert.equal(composition.productSupported, false);
  assert.equal(composition.createProductEvidence, null);
}

const foundationStore = createLafeaWorkbenchStore({
  initialStage: 'LAFEA.1', initialDocument: foundationSource(),
});
foundationStore.run();
let foundationStage = foundationStore.getState().stages['LAFEA.1'];
const foundationBatch = createLafeaAnalyticalProductBatch({
  stageId: 'LAFEA.1',
  lifecycle: foundationStage.lifecycle,
  execution: foundationStage.execution,
  productInput: {
    foundation: productFoundationInput('RECTANGULAR_PATCH', STATIONS.RECTANGULAR_PATCH),
    handoffs: [{
      handoffIdentity: 'A1-LIFECYCLE-HO', targetStageId: 'LAFEA.5',
      targetSourceHash: SHA,
    }],
  },
});
assert.equal(foundationBatch.record.kind, 'FOUNDATION_DISTRIBUTION');
assert.equal(foundationBatch.record.qualification, 'PASS');
const foundationLifecycle = registerLafeaAnalyticalProductBatch(
  foundationStage.lifecycle, foundationBatch,
);
assert.equal(foundationLifecycle.artifacts.FOUNDATION_DISTRIBUTION.status, 'CURRENT');
assert.equal(foundationBatch.releaseQualified, false);
foundationStore.destroy();

const screeningStore = createLafeaWorkbenchStore({
  initialStage: 'LAFEA.2', initialDocument: screeningSource(),
});
screeningStore.run();
const screeningStage = screeningStore.getState().stages['LAFEA.2'];
assert.equal(screeningStage.lifecycle.artifacts.SCREENING_ASSESSMENT.status, 'ABSENT');
const screeningBatch = createLafeaAnalyticalProductBatch({
  stageId: 'LAFEA.2',
  lifecycle: screeningStage.lifecycle,
  execution: screeningStage.execution,
  productInput: {
    assessmentIdentity: 'A2-LIFECYCLE-ASSESSMENT',
    assessmentProfileId: 'A2-PRODUCT-PROFILE-1',
    governingQuantity,
    applicabilityRecords: applicability,
    handoffs: [],
  },
});
assert.equal(screeningBatch.record.kind, 'SCREENING_ASSESSMENT');
assert.equal(screeningBatch.record.qualification, 'PASS');
const screeningLifecycle = registerLafeaAnalyticalProductBatch(
  screeningStage.lifecycle, screeningBatch,
);
assert.equal(screeningLifecycle.artifacts.SCREENING_ASSESSMENT.status, 'CURRENT');
assert.equal(screeningBatch.releaseQualified, false);
screeningStore.destroy();

assert.deepEqual(LOAD_FOUNDATION_BENCHMARK_IDS, [
  'A1-FP-POINT', 'A1-FP-LINE', 'A1-FP-RECT', 'A1-FP-CIRC',
  'A1-FP-WELD', 'A1-FP-RSP', 'A1-FP-RANK', 'A1-HO-ANCESTRY',
]);
assert.deepEqual(SCREENING_PRODUCT_BENCHMARK_IDS, [
  'A2-ESC-01', 'A2-ESC-02', 'A2-ESC-03',
  'A2-ESC-04', 'A2-HO-01', 'A2-HO-02',
]);

console.log(JSON.stringify({
  check: 'lafea-nb1-analytical-product-verticals',
  status: 'PASS',
  foundationMethods: LOAD_FOUNDATION_METHODS,
  foundationBenchmarks: LOAD_FOUNDATION_BENCHMARK_IDS,
  screeningBenchmarks: SCREENING_PRODUCT_BENCHMARK_IDS,
  productStates: ['PASS', 'ESCALATE', 'BLOCKED'],
  resultantsClose: true,
  rigidSpiderForceOnly: true,
  downstreamHandoffsRetainResultants: true,
  nominalStressTransferredAsFeStress: false,
  codeAuthorityPromoted: false,
  releaseQualified: false,
  lafea6Enabled: false,
}));

function foundationInput(method, stations) {
  return {
    ...productFoundationInput(method, stations),
    sourceAncestry: {
      stageId: 'LAFEA.1', sourceHash: SHA, canonicalModelHash: SHA,
      executionHash: SHA, resultEvidenceHash: SHA,
    },
  };
}

function productFoundationInput(method, stations) {
  return {
    schema: 'lafea-load-foundation/v2',
    foundationIdentity: `A1-${method}`,
    foundationVersion: '1',
    referencePoint: [0, 0, 0],
    declaredResultant: structuredClone(RESULTANT),
    footprint: {
      method,
      stations: structuredClone(stations),
      sourceReference: `FOOTPRINT#${method}`,
    },
    qualificationProfile: {
      identity: 'A1-PRODUCT-PROFILE-1',
      forceTolerance: { absolute: 1e-8, relative: 1e-12 },
      momentTolerance: { absolute: 1e-7, relative: 1e-12 },
      rankTolerance: 1e-12,
    },
    limitations: [],
  };
}

function station(stationId, position, measure) {
  return {
    stationId, position, measure,
    sourceReference: `STATION#${stationId}`,
  };
}

function assertVector(actual, expected, tolerance) {
  actual.forEach((value, index) =>
    assert.ok(Math.abs(value - expected[index]) <= tolerance,
      `${value} must match ${expected[index]}.`));
}
