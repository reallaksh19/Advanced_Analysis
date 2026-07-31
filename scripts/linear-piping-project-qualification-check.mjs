#!/usr/bin/env node

import assert from 'node:assert/strict';
import {
  COMPARISON_RULE_ID,
  QUALIFICATION_PROFILE_SCHEMA,
  QUALIFICATION_REQUEST_SCHEMA,
  compileLinearPipingQualificationComparison,
  requireLinearPipingQualificationComparison,
  sealQualificationProfile,
} from '../src/core/linear-piping-project-qualification/index.js';
import { compileLinearPipingPresentation } from '../src/core/linear-piping-presentation/index.js';
import {
  APPLICATION_RESULT_REQUEST_SCHEMA,
  sealLinearPipingQualifiedApplicationResult,
} from '../src/core/linear-piping-code-application/index.js';
import { buildQualifiedPresentationFixture } from './linear-piping-presentation-fixtures.mjs';

function test(id, name, body) {
  body();
  console.log(`${id} PASS ${name}`);
}

function expectCode(body, expectedCode) {
  assert.throws(body, (error) => {
    assert.equal(error?.code, expectedCode, `expected ${expectedCode}, received ${error?.code}`);
    return true;
  });
}

function clone(value) {
  return structuredClone(value);
}

function declared(value, source = 'FICTIONAL-QUALIFICATION-PROFILE') {
  return { value, source };
}

const fixture = buildQualifiedPresentationFixture();
const presentation = compileLinearPipingPresentation(fixture);
const profile = sealQualificationProfile({
  schema: QUALIFICATION_PROFILE_SCHEMA,
  profileId: 'PHASE6A-FICTIONAL-COMPARISON-R1',
  comparisonRuleId: COMPARISON_RULE_ID,
  relativeScaleFloor: declared(1e-12),
  semanticHash: '',
});

function authority(authorityKind) {
  return {
    authorityKind,
    organization: 'FICTIONAL-QUALIFICATION-LAB-NOT-PROJECT-EVIDENCE',
    productOrMethod: authorityKind === 'COMMERCIAL_PIPE_STRESS_PROGRAM'
      ? 'FICTIONAL-COMMERCIAL-PIPE-STRESS-PROGRAM'
      : 'FICTIONAL-INDEPENDENT-HAND-CHECK',
    version: '0.0-FICTIONAL',
    documentId: 'FICTIONAL-QUALIFICATION-REPORT-001',
    revision: '00',
    runId: 'FICTIONAL-RUN-001',
    sourceSemanticHash: 'fnv1a64:1212121212121212',
    reviewer: 'FICTIONAL-REVIEWER',
    reviewedAtUtc: '2026-07-31T00:00:00Z',
  };
}

function observation(comparisonId, selector, referenceValue, absoluteTolerance, relativeTolerance) {
  return {
    comparisonId,
    selector,
    referenceValue,
    absoluteTolerance,
    relativeTolerance,
  };
}

const interfaceRow = presentation.interfaceRows[0];
const nozzleRow = presentation.nozzleRows[0];
const codeRow = presentation.codeRows[0];

function realModelRequest(overrides = {}) {
  return {
    schema: QUALIFICATION_REQUEST_SCHEMA,
    qualificationId: 'PHASE6A-REAL-MODEL-FICTIONAL',
    qualificationKind: 'REAL_MODEL_RECONCILIATION',
    applicationResult: fixture.applicationResult,
    presentation,
    authority: authority('INDEPENDENT_ENGINEERING_REVIEW'),
    observations: [
      observation(
        'CMP-INTERFACE-FY',
        {
          kind: 'INTERFACE_FORCE_LOCAL',
          interfaceId: interfaceRow.interfaceId,
          loadCaseId: interfaceRow.loadCaseId,
          component: 'Y',
        },
        { value: interfaceRow.forceLocal.y + 0.1, unit: 'N' },
        { value: 1, unit: 'N', source: 'FICTIONAL-RECONCILIATION-TOLERANCE' },
        { value: 0.01, source: 'FICTIONAL-RECONCILIATION-TOLERANCE' },
      ),
      observation(
        'CMP-NOZZLE-UTIL',
        {
          kind: 'NOZZLE_UTILIZATION',
          interfaceId: nozzleRow.interfaceId,
          loadCaseId: nozzleRow.loadCaseId,
        },
        { value: nozzleRow.utilization, unit: '1' },
        { value: 1e-12, unit: '1', source: 'FICTIONAL-RECONCILIATION-TOLERANCE' },
        { value: 1e-12, source: 'FICTIONAL-RECONCILIATION-TOLERANCE' },
      ),
      observation(
        'CMP-B31-STRESS',
        { kind: 'B31_CALCULATED_STRESS', checkId: codeRow.checkId },
        { value: codeRow.calculatedStress, unit: 'Pa' },
        { value: 1e-6, unit: 'Pa', source: 'FICTIONAL-RECONCILIATION-TOLERANCE' },
        { value: 1e-12, source: 'FICTIONAL-RECONCILIATION-TOLERANCE' },
      ),
    ],
    profile,
    ...overrides,
  };
}

const realModelResult = compileLinearPipingQualificationComparison(realModelRequest());
const commercialResult = compileLinearPipingQualificationComparison({
  schema: QUALIFICATION_REQUEST_SCHEMA,
  qualificationId: 'PHASE6A-COMMERCIAL-FICTIONAL',
  qualificationKind: 'COMMERCIAL_CORROBORATION',
  applicationResult: fixture.applicationResult,
  presentation,
  authority: authority('COMMERCIAL_PIPE_STRESS_PROGRAM'),
  observations: [
    observation(
      'CMP-COMMERCIAL-B31-UTIL',
      { kind: 'B31_UTILIZATION', checkId: codeRow.checkId },
      { value: codeRow.utilization, unit: '1' },
      { value: 1e-12, unit: '1', source: 'FICTIONAL-COMMERCIAL-TOLERANCE' },
      { value: 1e-12, source: 'FICTIONAL-COMMERCIAL-TOLERANCE' },
    ),
  ],
  profile,
});

console.log('\n--- [SIMULATED] Linear piping Phase 6A qualification harness checks ---');

test('P6A-QUAL-01', 'Independent reconciliation derives application values from the current presentation', () => {
  assert.equal(realModelResult.status, 'PASS');
  assert.equal(realModelResult.qualificationKind, 'REAL_MODEL_RECONCILIATION');
  assert.equal(realModelResult.presentationSemanticHash, presentation.semanticHash);
  assert.equal(realModelResult.comparisons[0].applicationValue.sourceSemanticHash.length > 0, true);
  assert.equal(requireLinearPipingQualificationComparison(realModelResult).semanticHash, realModelResult.semanticHash);
});

test('P6A-QUAL-02', 'Commercial corroboration requires the commercial-program authority kind', () => {
  assert.equal(commercialResult.status, 'PASS');
  assert.equal(commercialResult.authority.authorityKind, 'COMMERCIAL_PIPE_STRESS_PROGRAM');
});

test('P6A-QUAL-03', 'Reference values outside both declared tolerances produce FAIL without hiding the difference', () => {
  const request = realModelRequest();
  request.observations = [observation(
    'CMP-FAIL',
    {
      kind: 'INTERFACE_FORCE_LOCAL',
      interfaceId: interfaceRow.interfaceId,
      loadCaseId: interfaceRow.loadCaseId,
      component: 'Y',
    },
    { value: interfaceRow.forceLocal.y + 1000, unit: 'N' },
    { value: 0.01, unit: 'N', source: 'FICTIONAL-FAIL-TOLERANCE' },
    { value: 1e-12, source: 'FICTIONAL-FAIL-TOLERANCE' },
  )];
  const result = compileLinearPipingQualificationComparison(request);
  assert.equal(result.status, 'FAIL');
  assert.equal(result.comparisons[0].status, 'FAIL');
  assert.ok(result.comparisons[0].absoluteDifference > 0);
});

test('P6A-QUAL-04', 'Observation schema cannot accept caller-injected application values', () => {
  const request = realModelRequest();
  request.observations[0] = {
    ...request.observations[0],
    applicationValue: { value: 0, unit: 'N' },
  };
  assert.throws(() => compileLinearPipingQualificationComparison(request));
});

test('P6A-QUAL-05', 'Reference and tolerance units must match the selected application quantity', () => {
  const request = realModelRequest();
  request.observations[0] = {
    ...request.observations[0],
    referenceValue: { value: 0, unit: 'kN' },
  };
  expectCode(() => compileLinearPipingQualificationComparison(request), 'PIPING_QUALIFICATION_UNIT_MISMATCH');
});

test('P6A-QUAL-06', 'Authority kind cannot be relabelled across reconciliation and commercial evidence', () => {
  expectCode(
    () => compileLinearPipingQualificationComparison(realModelRequest({
      authority: authority('COMMERCIAL_PIPE_STRESS_PROGRAM'),
    })),
    'PIPING_QUALIFICATION_AUTHORITY_KIND_MISMATCH',
  );
});

test('P6A-QUAL-07', 'A presentation is rejected when it is not current for the supplied application result', () => {
  const conditionalApplication = sealLinearPipingQualifiedApplicationResult({
    schema: APPLICATION_RESULT_REQUEST_SCHEMA,
    applicationId: 'PHASE6A-DIFFERENT-CURRENT-APPLICATION',
    analysisResults: fixture.analysisResults,
    interfaceSet: fixture.interfaceSet,
    interfaceRecoveries: fixture.interfaceRecoveries,
    nozzleAssessments: [],
    b31Application: fixture.b31Application,
  });
  expectCode(
    () => compileLinearPipingQualificationComparison(realModelRequest({
      applicationResult: conditionalApplication,
    })),
    'PIPING_PRESENTATION_STALE',
  );
});

test('P6A-QUAL-08', 'Observation order does not change the qualification identity', () => {
  const request = realModelRequest();
  const second = compileLinearPipingQualificationComparison({
    ...request,
    observations: [...request.observations].reverse(),
  });
  assert.equal(second.semanticHash, realModelResult.semanticHash);
  assert.equal(second.evidenceHash, realModelResult.evidenceHash);
});

test('P6A-QUAL-09', 'Tampered qualification evidence is rejected independently', () => {
  const tampered = clone(realModelResult);
  tampered.evidenceHash = 'fnv1a64:0000000000000000';
  expectCode(
    () => requireLinearPipingQualificationComparison(tampered),
    'PIPING_QUALIFICATION_HASH_MISMATCH',
  );
});

console.log('Linear piping Phase 6A qualification harness checks PASS');
