import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertEngineeringEnrichmentNumericalImpact,
  assertEnrichmentShadowCalculationRequest,
  buildEnrichmentNumericalImpactReport,
  buildEnrichmentShadowCalculationRequest,
  executeEnrichmentShadowCalculation,
} from '../src/workspace/engineering-enrichment/index.js';
import {
  buildBaselineReference,
  buildDescriptor,
  buildPipeline,
  engineOutput,
} from './engineering-enrichment-test-fixture.mjs';

test('descriptor identity is deterministic across registry order', () => {
  const first = buildDescriptor();
  const second = buildDescriptor({
    loadCaseIds: ['EMPTY', 'OPE'],
    metricIds: ['totalMassKg', 'supportReactionN'],
  });
  assert.equal(first.descriptorHash, second.descriptorHash);
  assert.deepEqual(first, second);
});

test('baseline request applies no candidate values', () => {
  const { baselineRequest } = buildPipeline();
  assert.equal(baselineRequest.variant, 'BASELINE');
  assert.equal(baselineRequest.appliedCandidateProjectionHash, null);
  assert.deepEqual(baselineRequest.candidateValueRows, []);
  assert.equal(baselineRequest.productionRouting, false);
  assert.equal(baselineRequest.calculationAuthority, false);
  assert.equal(
    assertEnrichmentShadowCalculationRequest(baselineRequest),
    baselineRequest,
  );
});

test('candidate request carries the exact sidecar values only', () => {
  const { candidateRequest, candidateProjection } = buildPipeline();
  assert.equal(candidateRequest.variant, 'CANDIDATE');
  assert.equal(
    candidateRequest.appliedCandidateProjectionHash,
    candidateProjection.projectionHash,
  );
  assert.equal(candidateRequest.candidateValueRows.length, 1);
  assert.equal(candidateRequest.candidateValueRows[0].targetId, 'entity:1');
  assert.equal(candidateRequest.candidateValueRows[0].fieldId, 'componentWeightKg');
  assert.equal(candidateRequest.candidateValueRows[0].value, 12);
  assert.equal(candidateRequest.candidateValueRows[0].unit, 'kg');
});

test('injected execution cannot create production authority', () => {
  const setup = buildPipeline();
  let observed;
  const result = executeEnrichmentShadowCalculation({
    descriptor: setup.descriptor,
    request: setup.candidateRequest,
    runEngine: (request) => {
      observed = request;
      assert.ok(Object.isFrozen(request));
      return engineOutput(12);
    },
  });
  assert.equal(observed, setup.candidateRequest);
  assert.equal(result.productionRouting, false);
  assert.equal(result.calculationAuthority, false);
  assert.equal(result.complete, true);
});

test('Step 3 records deterministic raw deltas without thresholds', () => {
  const setup = buildPipeline();
  const report = setup.numericalImpact;
  assert.equal(report.status, 'RECORDED_SHADOW_RAW_DELTAS');
  assert.equal(report.summary.metricCount, 2);
  assert.equal(report.summary.changedMetricCount, 2);
  assert.equal(report.thresholdEvaluation.status, 'NOT_AUTHORIZED');
  assert.equal(report.baselineSelectionAuthorized, false);
  assert.equal(report.sealEligible, false);
  assert.equal(report.calculationEligible, false);
  assert.equal(report.resultAcceptanceEligible, false);
  assert.equal(
    report.deltas.find((row) => row.metricId === 'totalMassKg').delta,
    12,
  );
  assert.equal(assertEngineeringEnrichmentNumericalImpact(report), report);
});

test('incomplete results block the impact report', () => {
  const setup = buildPipeline({ candidateComplete: false });
  const report = setup.numericalImpact;
  assert.equal(report.status, 'BLOCKED');
  assert.ok(report.blockers.some(
    (row) => row.code === 'CANDIDATE_RESULT_INCOMPLETE',
  ));
});

test('metric-set differences block rather than compare partial evidence', () => {
  const setup = buildPipeline({
    candidateOutput: {
      metrics: [{
        metricId: 'totalMassKg',
        scopeId: 'route:1',
        loadCaseId: 'EMPTY',
        value: 112,
        unit: 'kg',
      }],
      diagnostics: [],
      complete: true,
    },
  });
  assert.equal(setup.numericalImpact.status, 'BLOCKED');
  assert.ok(setup.numericalImpact.blockers.some(
    (row) => row.code === 'METRIC_SET_MISMATCH',
  ));
});

test('different baseline references cannot be combined', () => {
  const setup = buildPipeline();
  const otherReference = buildBaselineReference({ basisId: 'other' });
  const otherRequest = buildEnrichmentShadowCalculationRequest({
    descriptor: setup.descriptor,
    variant: 'CANDIDATE',
    candidateProjection: setup.candidateProjection,
    structuralImpact: setup.structuralImpact,
    baselineReference: otherReference,
  });
  const otherResult = executeEnrichmentShadowCalculation({
    descriptor: setup.descriptor,
    request: otherRequest,
    runEngine: () => engineOutput(12),
  });
  assert.throws(() => buildEnrichmentNumericalImpactReport({
    candidateProjection: setup.candidateProjection,
    structuralImpact: setup.structuralImpact,
    baselineResult: setup.baselineResult,
    candidateResult: otherResult,
  }), /baselineReferenceHash/u);
});

test('non-finite engine metrics fail closed', () => {
  const setup = buildPipeline();
  assert.throws(() => executeEnrichmentShadowCalculation({
    descriptor: setup.descriptor,
    request: setup.candidateRequest,
    runEngine: () => ({
      metrics: [{
        metricId: 'totalMassKg',
        scopeId: 'route:1',
        loadCaseId: 'EMPTY',
        value: Number.NaN,
        unit: 'kg',
      }],
      diagnostics: [],
      complete: true,
    }),
  }), /must be finite/u);
});
