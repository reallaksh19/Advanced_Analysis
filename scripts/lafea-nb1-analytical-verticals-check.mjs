#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  FINITE_FOOTPRINT_REQUEST_SCHEMA,
  FINITE_FOOTPRINT_TYPES,
  calculateLocalAttachmentFoundation,
  compileFiniteFootprintDistribution,
  createCanonicalLocalAttachmentFoundationModel,
  validateFiniteFootprintDistribution,
} from '../src/core/local-stress/index.js';
import { createFiniteFootprintHandoff } from '../src/core/local-stress/finite-footprint-handoff.js';
import {
  SCREENING_APPLICABILITY_KINDS,
  SCREENING_PRODUCT_REQUEST_SCHEMA,
  calculateLocalAttachmentScreening,
  createLocalAttachmentScreeningHandoff,
  createLocalAttachmentScreeningRequest,
  evaluateLocalAttachmentScreeningProduct,
  validateLocalAttachmentScreeningProduct,
} from '../src/core/local-attachment-screening/index.js';
import { validateLafeaAnalyticalHandoff } from '../src/core/lafea-analytical-handoff.js';
import { requireLafeaStageComposition } from '../src/workspace/lafea-stage-composition-root.js';
import { sourceFixture } from './lafea.1-fixtures.mjs';
import { rawRequestFixture } from './lafea.2-fixtures.mjs';
import { triangleSource as continuumSource } from './lafea.3-fixtures.mjs';
import { triangleSource as shellSource } from './lafea.4-fixtures.mjs';
import { workflowSource } from './lafea.5-fixtures.mjs';

const foundationResult = calculateLocalAttachmentFoundation(
  createCanonicalLocalAttachmentFoundationModel(sourceFixture()),
);
assert.equal(foundationResult.qualification.state, 'ACCEPTED');

const footprintResults = new Map();
for (const type of FINITE_FOOTPRINT_TYPES) {
  const result = compileFiniteFootprintDistribution(footprintRequest(type));
  validateFiniteFootprintDistribution(result);
  independentlyCheckEquilibrium(result);
  assert.equal(result.footprint.type, type);
  assert.equal(result.qualification.state, 'ACCEPTED');
  assert.equal(result.limitations.includes('NO_LOCAL_ATTACHMENT_STRESS'), true);
  footprintResults.set(type, result);
}

const reorderedLine = footprintRequest('LINE');
reorderedLine.footprint.stations.reverse();
assert.equal(
  compileFiniteFootprintDistribution(reorderedLine).semanticHash,
  footprintResults.get('LINE').semanticHash,
);
assert.throws(
  () => compileFiniteFootprintDistribution(footprintRequest(
    'RECTANGULAR_PATCH',
    ['A', 'B', 'C', 'D'].map((stationId, index) => station(
      stationId,
      [index * 10, 0, 0],
    )),
  )),
  (error) => error.code === 'FOOTPRINT_GEOMETRY_RANK_DEFICIENT',
);
const incompletePressure = footprintRequest('POINT');
delete incompletePressure.pressureThrusts[0].area;
assert.throws(
  () => compileFiniteFootprintDistribution(incompletePressure),
  (error) => error.code === 'EXACT_KEYS_REQUIRED',
);

const targets = Object.freeze([
  { targetStageId: 'LAFEA.3', targetSource: continuumSource(), targetLoadCaseId: 'L1' },
  { targetStageId: 'LAFEA.4', targetSource: shellSource(), targetLoadCaseId: 'LC' },
  { targetStageId: 'LAFEA.5', targetSource: workflowSource(), targetLoadCaseId: 'WF-COMB' },
]);
const foundationHandoffs = targets.map((target) => createFiniteFootprintHandoff({
  handoffIdentity: `A1-HO-${target.targetStageId}`,
  handoffVersion: '1',
  footprintResult: footprintResults.get('RECTANGULAR_PATCH'),
  targetStageId: target.targetStageId,
  targetSource: target.targetSource,
  targetLoadBindings: [binding('LC-1', target.targetLoadCaseId, 'A1-HO')],
  sourceReference: 'A1-HANDOFF-SOURCE',
  limitations: [],
}));
assertHandoffs(foundationHandoffs, 'LAFEA.1', 'GLOBAL');

const screeningResult = calculateLocalAttachmentScreening(
  createLocalAttachmentScreeningRequest(rawRequestFixture()),
);
assert.equal(screeningResult.qualification.state, 'ACCEPTED');
const passEvidence = applicabilityEvidence(screeningResult);
const passProduct = evaluateLocalAttachmentScreeningProduct(
  productRequest(passEvidence),
);
assert.equal(passProduct.overallState, 'PASS');
assert.equal(passProduct.assessments.every((row) => row.state === 'PASS'), true);

const escalationEvidence = structuredClone(passEvidence);
const governingEvidence = escalationEvidence.find((row) => (
  row.screeningCaseId === 'CASE-A' && row.evaluationLocationId === 'L0'
));
const attachmentCheck = governingEvidence.checks.find(
  (row) => row.kind === 'ATTACHMENT_EDGE',
);
attachmentCheck.status = 'FAIL';
attachmentCheck.rationale = 'The location intersects the declared attachment edge.';
const escalationProduct = evaluateLocalAttachmentScreeningProduct(
  productRequest(escalationEvidence),
);
assert.equal(escalationProduct.overallState, 'ESCALATE');

const missingProduct = evaluateLocalAttachmentScreeningProduct(
  productRequest(passEvidence.slice(1)),
);
assert.equal(missingProduct.overallState, 'BLOCKED');
assert.equal(missingProduct.assessments.some((row) => (
  row.reasons.includes('MISSING_APPLICABILITY_EVIDENCE')
)), true);

const shearEvidence = structuredClone(passEvidence);
shearEvidence[0].checks.find((row) => row.kind === 'TRANSVERSE_SHEAR').status = 'FAIL';
assert.equal(
  evaluateLocalAttachmentScreeningProduct(productRequest(shearEvidence)).overallState,
  'ESCALATE',
);

const screeningHandoffs = targets.map((target) => (
  createLocalAttachmentScreeningHandoff({
    handoffIdentity: `A2-HO-${target.targetStageId}`,
    handoffVersion: '1',
    screeningResult,
    productResult: escalationProduct,
    screeningCaseId: 'CASE-A',
    evaluationLocationId: 'L0',
    targetStageId: target.targetStageId,
    targetSource: target.targetSource,
    targetLoadBindings: [binding('CASE-A', target.targetLoadCaseId, 'A2-HO')],
    sourceReference: 'A2-HANDOFF-SOURCE',
    limitations: [],
  })
));
assertHandoffs(screeningHandoffs, 'LAFEA.2', 'PIPE_LOCAL');
for (const handoff of screeningHandoffs) {
  assert.equal(Object.keys(handoff.governingRecord).some(
    (key) => /stress|utilization|allowable|code/iu.test(key),
  ), false);
}

const tamperedProduct = structuredClone(escalationProduct);
tamperedProduct.overallState = 'PASS';
assert.throws(
  () => validateLocalAttachmentScreeningProduct(tamperedProduct),
  (error) => error.code === 'SCREENING_PRODUCT_HASH_MISMATCH',
);
const blockedTarget = targets[0];
assert.throws(() => createLocalAttachmentScreeningHandoff({
  handoffIdentity: 'BLOCKED-HO',
  handoffVersion: '1',
  screeningResult,
  productResult: missingProduct,
  screeningCaseId: 'CASE-A',
  evaluationLocationId: 'L0',
  targetStageId: blockedTarget.targetStageId,
  targetSource: blockedTarget.targetSource,
  targetLoadBindings: [binding('CASE-A', blockedTarget.targetLoadCaseId, 'BLOCKED')],
  sourceReference: 'BLOCKED',
  limitations: [],
}), (error) => error.code === 'SCREENING_HANDOFF_ESCALATION_REQUIRED');

assertComposition('LAFEA.1', footprintRequest('POINT'));
assertComposition('LAFEA.2', productRequest(passEvidence));
for (const stageId of ['LAFEA.3', 'LAFEA.4', 'LAFEA.5', 'LAFEA.6']) {
  const composition = requireLafeaStageComposition(stageId);
  assert.equal(composition.productAssessmentSupported, false);
  assert.equal(composition.handoffSupported, false);
  assert.equal(composition.evaluateProductAssessment, null);
  assert.equal(composition.createHandoff, null);
}

console.log(JSON.stringify({
  check: 'lafea-nb1-foundation-screening-verticals',
  status: 'PASS',
  a1FootprintBenchmarks: [
    'A1-FP-POINT', 'A1-FP-LINE', 'A1-FP-RECT', 'A1-FP-CIRC',
    'A1-FP-WELD', 'A1-FP-RSP', 'A1-FP-RANK',
  ],
  a1HandoffTargets: foundationHandoffs.map((row) => row.targetStageId),
  a2ProductBenchmarks: [
    'A2-ESC-01', 'A2-ESC-02', 'A2-ESC-03', 'A2-ESC-04',
  ],
  a2HandoffTargets: screeningHandoffs.map((row) => row.targetStageId),
  footprintTypes: FINITE_FOOTPRINT_TYPES,
  exactForceMomentClosure: true,
  pressureThrustRequiresExplicitAreaAndNormal: true,
  missingApplicabilityBlocked: true,
  nominalStressTransferredToFeOrCode: false,
  targetSourcesValidated: true,
  targetEnginesExecutedByHandoff: false,
  codeAuthorityPromoted: false,
  releaseQualified: false,
  lafea6Enabled: false,
}));

function footprintRequest(type, stations = stationsFor(type)) {
  return {
    schema: FINITE_FOOTPRINT_REQUEST_SCHEMA,
    requestIdentity: `FP-${type}`,
    requestVersion: '1',
    foundationResult,
    loadCaseIdentity: 'LC-1',
    referencePoint: [0, 0, 0],
    footprint: {
      footprintIdentity: `FOOTPRINT-${type}`,
      type,
      stations,
      sourceReference: `FOOTPRINT#${type}`,
    },
    pressureThrusts: [{
      thrustId: 'PT-1',
      pressure: 2,
      area: 100,
      normal: [0, 0, 1],
      applicationPoint: [10, 20, 0],
      sourceReference: 'PRESSURE#PT-1',
    }],
    qualificationProfile: {
      identity: 'A1-FP-BENCHMARK-V1',
      forceTolerance: { absolute: 1e-8, relative: 1e-12 },
      momentTolerance: { absolute: 1e-5, relative: 1e-12 },
    },
    limitations: [],
  };
}

function stationsFor(type) {
  if (type === 'POINT') return [station('P0', [0, 0, 0])];
  if (type === 'LINE') return [station('L0', [-100, 0, 0]), station('L1', [100, 0, 0])];
  if (type === 'WELD_LINE') return [
    station('W0', [-100, 0, 0], 50),
    station('W1', [0, 0, 0], 100),
    station('W2', [100, 0, 0], 50),
  ];
  if (type === 'RECTANGULAR_PATCH' || type === 'RIGID_SPIDER') return [
    station('R0', [-100, -50, 0]), station('R1', [100, -50, 0]),
    station('R2', [100, 50, 0]), station('R3', [-100, 50, 0]),
  ];
  return Array.from({ length: 8 }, (_, index) => {
    const angle = 2 * Math.PI * index / 8;
    return station(`C${index}`, [100 * Math.cos(angle), 100 * Math.sin(angle), 0]);
  });
}

function station(stationId, position, weight = 1) {
  return { stationId, position, weight, sourceReference: `STATION#${stationId}` };
}

function independentlyCheckEquilibrium(result) {
  const reconstructed = result.stationResultants.reduce((sum, row) => {
    const r = row.position.map((value, index) => value - result.referencePoint[index]);
    const rCrossF = [
      r[1] * row.force[2] - r[2] * row.force[1],
      r[2] * row.force[0] - r[0] * row.force[2],
      r[0] * row.force[1] - r[1] * row.force[0],
    ];
    return {
      force: sum.force.map((value, index) => value + row.force[index]),
      moment: sum.moment.map((value, index) => (
        value + rCrossF[index] + row.moment[index]
      )),
    };
  }, { force: [0, 0, 0], moment: [0, 0, 0] });
  assertVectorClose(
    reconstructed.force,
    result.appliedResultant.force,
    result.equilibrium.tolerances.force,
  );
  assertVectorClose(
    reconstructed.moment,
    result.appliedResultant.moment,
    result.equilibrium.tolerances.moment,
  );
}

function assertVectorClose(actual, expected, tolerance) {
  actual.forEach((value, index) => {
    assert.ok(Math.abs(value - expected[index]) <= tolerance);
  });
}

function applicabilityEvidence(result) {
  return result.pointStressStates.map((point) => ({
    screeningCaseId: point.screeningCaseId,
    evaluationLocationId: point.evaluationLocationId,
    checks: SCREENING_APPLICABILITY_KINDS.map((kind) => ({
      checkId: `${point.screeningCaseId}-${point.evaluationLocationId}-${kind}`,
      kind,
      status: 'PASS',
      rationale: `${kind} is explicitly clear for nominal far-field screening.`,
      sourceReference: `APP#${point.screeningCaseId}/${point.evaluationLocationId}/${kind}`,
    })),
  }));
}

function productRequest(applicabilityEvidenceValue) {
  return {
    schema: SCREENING_PRODUCT_REQUEST_SCHEMA,
    assessmentIdentity: 'A2-PRODUCT-1',
    assessmentVersion: '1',
    screeningResult,
    applicabilityEvidence: applicabilityEvidenceValue,
    limitations: [],
  };
}

function binding(sourceLoadIdentity, targetLoadCaseId, sourceReference) {
  return { sourceLoadIdentity, targetLoadCaseId, sourceReference };
}

function assertHandoffs(handoffs, sourceStageId, coordinateSystem) {
  for (const handoff of handoffs) {
    validateLafeaAnalyticalHandoff(handoff);
    assert.equal(handoff.sourceStageId, sourceStageId);
    assert.equal(handoff.resultant.coordinateSystem, coordinateSystem);
    assert.equal(handoff.qualification.targetSourceValidated, true);
    assert.equal(handoff.qualification.targetEngineExecuted, false);
    assert.equal(handoff.qualification.releaseQualified, false);
  }
}

function assertComposition(stageId, request) {
  const composition = requireLafeaStageComposition(stageId);
  assert.equal(composition.productAssessmentSupported, true);
  assert.equal(composition.handoffSupported, true);
  assert.equal(typeof composition.evaluateProductAssessment, 'function');
  assert.equal(typeof composition.createHandoff, 'function');
  assert.equal(composition.evaluateProductAssessment(request).qualification.state, 'ACCEPTED');
}
