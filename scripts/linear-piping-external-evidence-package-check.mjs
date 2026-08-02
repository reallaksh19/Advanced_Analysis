#!/usr/bin/env node

import assert from 'node:assert/strict';
import { semanticHash } from '../src/core/shared-piping-model/canonical-json.js';
import {
  COMPARISON_RULE_ID,
  EVIDENCE_ARTIFACT_REFERENCE_SCHEMA,
  EXTERNAL_QUALIFICATION_PACKAGE_REQUEST_SCHEMA,
  PERFORMANCE_EVIDENCE_SCHEMA,
  PHASE6I_FROZEN_CANDIDATE,
  PHASE6I_IMMUTABLE_REF,
  PROJECT_AUTHORITY_GROUP_IDS,
  QUALIFICATION_PROFILE_SCHEMA,
  QUALIFICATION_REQUEST_SCHEMA,
  RELEASE_REVIEW_DECISION,
  RELEASE_REVIEW_DISPOSITION_SCHEMA,
  ROLLBACK_EVIDENCE_SCHEMA,
  buildProjectAuthorityIndex,
  compileLinearPipingExternalQualificationPackage,
  compileLinearPipingQualificationComparison,
  requireLinearPipingExternalQualificationPackage,
  sealPerformanceEvidence,
  sealQualificationProfile,
  sealReleaseReviewDisposition,
  sealRollbackEvidence,
} from '../src/core/linear-piping-project-qualification/index.js';
import { compileLinearPipingPresentation } from '../src/core/linear-piping-presentation/index.js';
import { buildQualifiedPresentationFixture } from './linear-piping-presentation-fixtures.mjs';

const EXACT_HEAD = PHASE6I_FROZEN_CANDIDATE;
const ROLLBACK_TARGET = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

function test(id, name, body) {
  body();
  console.log(`${id} PASS ${name}`);
}

function expectCode(body, code) {
  assert.throws(body, (error) => {
    assert.equal(error?.code, code, `expected ${code}, received ${error?.code}`);
    return true;
  });
}

function clone(value) {
  return structuredClone(value);
}

function declared(value, source) {
  return { value, source };
}

const fixture = buildQualifiedPresentationFixture();
const presentation = compileLinearPipingPresentation(fixture);
const interfaceRow = presentation.interfaceRows[0];
const nozzleRow = presentation.nozzleRows[0];
const codeRow = presentation.codeRows[0];
const profile = sealQualificationProfile({
  schema: QUALIFICATION_PROFILE_SCHEMA,
  profileId: 'EXTERNAL-EVIDENCE-COMPARISON-R1',
  comparisonRuleId: COMPARISON_RULE_ID,
  relativeScaleFloor: declared(1e-12, 'PROJECT-QUALIFICATION-PROCEDURE'),
  semanticHash: '',
});

function authority(kind) {
  const commercial = kind === 'COMMERCIAL_PIPE_STRESS_PROGRAM';
  return {
    authorityKind: kind,
    organization: commercial
      ? 'COMMERCIAL-ANALYSIS-PROVIDER'
      : 'INDEPENDENT-ENGINEERING-REVIEW-ORG',
    productOrMethod: commercial ? 'PIPE-STRESS-SUITE' : 'HAND-CALCULATION-RECONCILIATION',
    version: commercial ? '14.2' : '2026.1',
    documentId: commercial ? 'COMMERCIAL-CORROBORATION-REPORT' : 'PROJECT-RECONCILIATION-REPORT',
    revision: '01',
    runId: commercial ? 'COMMERCIAL-RUN-4421' : 'INDEPENDENT-REVIEW-RUN-118',
    sourceSemanticHash: commercial
      ? 'fnv1a64:3434343434343434'
      : 'fnv1a64:2323232323232323',
    reviewer: commercial ? 'COMMERCIAL-REVIEWER' : 'INDEPENDENT-REVIEWER',
    reviewedAtUtc: '2026-07-31T10:50:00Z',
  };
}

function observation(comparisonId, selector, value, unit) {
  return {
    comparisonId,
    selector,
    referenceValue: { value, unit },
    absoluteTolerance: {
      value: unit === 'Pa' ? 1e-6 : 1e-12,
      unit,
      source: 'PROJECT-QUALIFICATION-PROCEDURE',
    },
    relativeTolerance: { value: 1e-12, source: 'PROJECT-QUALIFICATION-PROCEDURE' },
  };
}

function observations() {
  return [
    observation(
      'CMP-INTERFACE-FORCE-X',
      {
        kind: 'INTERFACE_FORCE_LOCAL',
        interfaceId: interfaceRow.interfaceId,
        loadCaseId: interfaceRow.loadCaseId,
        component: 'X',
      },
      interfaceRow.forceLocal.x,
      interfaceRow.units.force,
    ),
    observation(
      'CMP-INTERFACE-MOMENT-X',
      {
        kind: 'INTERFACE_MOMENT_REFERENCE_LOCAL',
        interfaceId: interfaceRow.interfaceId,
        loadCaseId: interfaceRow.loadCaseId,
        component: 'X',
      },
      interfaceRow.momentAtReferenceLocal.x,
      interfaceRow.units.moment,
    ),
    observation(
      'CMP-NOZZLE-UTILIZATION',
      {
        kind: 'NOZZLE_UTILIZATION',
        interfaceId: nozzleRow.interfaceId,
        loadCaseId: nozzleRow.loadCaseId,
      },
      nozzleRow.utilization,
      '1',
    ),
    observation(
      'CMP-B31-STRESS',
      { kind: 'B31_CALCULATED_STRESS', checkId: codeRow.checkId },
      codeRow.calculatedStress,
      'Pa',
    ),
    observation(
      'CMP-B31-UTILIZATION',
      { kind: 'B31_UTILIZATION', checkId: codeRow.checkId },
      codeRow.utilization,
      '1',
    ),
  ];
}

function comparison(kind, overrides = {}) {
  const commercial = kind === 'COMMERCIAL_CORROBORATION';
  return compileLinearPipingQualificationComparison({
    schema: QUALIFICATION_REQUEST_SCHEMA,
    qualificationId: commercial ? 'G9-COMMERCIAL-CORROBORATION' : 'G8-REAL-MODEL-RECONCILIATION',
    qualificationKind: kind,
    applicationResult: fixture.applicationResult,
    presentation,
    authority: authority(
      commercial ? 'COMMERCIAL_PIPE_STRESS_PROGRAM' : 'INDEPENDENT_ENGINEERING_REVIEW',
    ),
    observations: observations(),
    profile,
    ...overrides,
  });
}

function performance(overrides = {}) {
  return sealPerformanceEvidence({
    schema: PERFORMANCE_EVIDENCE_SCHEMA,
    evidenceId: 'PERFORMANCE-EVIDENCE-RUN-001',
    exactHead: EXACT_HEAD,
    runtimeIdentity: {
      runtimeName: 'NODE-JS',
      runtimeVersion: '22.18.0',
      operatingSystem: 'LINUX-X64',
      architecture: 'X64',
      dependencyLockHash: 'fnv1a64:4545454545454545',
    },
    modelEnvelope: {
      nodeCount: 1200,
      elementCount: 1180,
      loadCaseCount: 8,
      interfaceCount: 32,
      codeCheckCount: 64,
    },
    stageTimings: [
      { stage: 'COMPILE', durationMs: 120 },
      { stage: 'SOLVE', durationMs: 340 },
      { stage: 'RECOVERY', durationMs: 180 },
      { stage: 'PRESENTATION', durationMs: 60 },
      { stage: 'EXPORT', durationMs: 45 },
    ],
    memoryEvidence: {
      peakResidentBytes: 268435456,
      measurementMethod: 'PROCESS-RESIDENT-SET-SAMPLING',
      sourceSemanticHash: 'fnv1a64:5656565656565656',
    },
    deterministicReplay: {
      runCount: 2,
      resultSemanticHashes: [
        fixture.applicationResult.semanticHash,
        fixture.applicationResult.semanticHash,
      ],
      exportByteHashes: [
        'fnv1a64:6767676767676767',
        'fnv1a64:6767676767676767',
      ],
      status: 'PASS',
    },
    failureBehavior: { cancellationStatus: 'PASS', invalidInputStatus: 'PASS' },
    declaredEnvelope: {
      maxNodes: 5000,
      maxElements: 5000,
      maxLoadCases: 20,
      maxStageDurationMs: 5000,
      maxPeakResidentBytes: 1073741824,
      source: 'PRODUCTION-ENVELOPE-PROCEDURE',
    },
    exceededLimits: [],
    sourceEvidence: {
      documentId: 'PERFORMANCE-QUALIFICATION-REPORT',
      revision: '01',
      sourceSemanticHash: 'fnv1a64:7878787878787878',
    },
    reviewer: 'PERFORMANCE-REVIEWER',
    reviewedAtUtc: '2026-07-31T10:51:00Z',
    semanticHash: '',
    evidenceHash: '',
    ...overrides,
  });
}

function command(commandId, commandText, logHash) {
  return {
    commandId,
    commandText,
    commandHash: semanticHash({ commandText }),
    logHash,
  };
}

function rollback(overrides = {}) {
  return sealRollbackEvidence({
    schema: ROLLBACK_EVIDENCE_SCHEMA,
    evidenceId: 'ROLLBACK-EVIDENCE-RUN-001',
    qualifiedHead: EXACT_HEAD,
    rollbackTarget: ROLLBACK_TARGET,
    releaseCommand: command(
      'RELEASE-COMMAND',
      `git checkout ${EXACT_HEAD}`,
      'fnv1a64:8989898989898989',
    ),
    rollbackCommand: command(
      'ROLLBACK-COMMAND',
      `git checkout ${ROLLBACK_TARGET}`,
      'fnv1a64:9090909090909090',
    ),
    migrationImpact: {
      classification: 'NONE',
      details: 'No database or file migration is required for this release boundary.',
    },
    restoredApplicationPath: true,
    preservedProjectData: true,
    postRollbackChecks: [
      {
        checkId: 'WORKSPACE-SMOKE-CHECK',
        status: 'PASS',
        evidenceHash: 'fnv1a64:a1a1a1a1a1a1a1a1',
      },
      {
        checkId: 'PROJECT-DATA-PRESERVATION',
        status: 'PASS',
        evidenceHash: 'fnv1a64:b2b2b2b2b2b2b2b2',
      },
    ],
    sourceEvidence: {
      documentId: 'ROLLBACK-REHEARSAL-REPORT',
      revision: '01',
      sourceSemanticHash: 'fnv1a64:c3c3c3c3c3c3c3c3',
    },
    reviewer: 'ROLLBACK-REVIEWER',
    completedAtUtc: '2026-07-31T10:52:00Z',
    semanticHash: '',
    evidenceHash: '',
    ...overrides,
  });
}

function disposition(overrides = {}) {
  return sealReleaseReviewDisposition({
    schema: RELEASE_REVIEW_DISPOSITION_SCHEMA,
    dispositionId: 'RELEASE-REVIEW-DISPOSITION-001',
    program: 'PRIORITY_2_LINEAR_PIPING_FEA_APPLICATION_CHAIN',
    exactHead: EXACT_HEAD,
    decision: RELEASE_REVIEW_DECISION,
    organization: 'ENGINEERING-ASSURANCE-ORGANIZATION',
    reviewer: 'PROGRAM-AUTHORITY-REVIEWER',
    role: 'RELEASE-REVIEW-AUTHORITY',
    signedAtUtc: '2026-07-31T10:53:00Z',
    signatureReference: 'SIGNATURE-REGISTER-ENTRY-001',
    sourceSemanticHash: 'fnv1a64:d4d4d4d4d4d4d4d4',
    semanticHash: '',
    evidenceHash: '',
    ...overrides,
  });
}

function projectAuthority(approved = true) {
  return buildProjectAuthorityIndex({
    repository: 'reallaksh19/Advanced_Analysis',
    candidate: {
      sha: PHASE6I_FROZEN_CANDIDATE,
      ref: PHASE6I_IMMUTABLE_REF,
    },
    indexId: 'WP2-PROJECT-AUTHORITY-INDEX',
    revision: 'REV-1',
    preparedAtUtc: '2026-07-31T10:49:00Z',
    preparedBy: {
      name: 'RESPONSIBLE-ENGINEER',
      role: 'PIPING-STRESS-ENGINEER',
      organization: 'PROJECT-ENGINEERING',
    },
    authorityGroups: PROJECT_AUTHORITY_GROUP_IDS.map((groupId, index) => ({
      groupId,
      applicability: 'APPLICABLE',
      resolution: 'RESOLVED',
      scopeDescription: `Controlled authority for ${groupId}.`,
      source: {
        sourceType: groupId === 'REPRESENTATIVE_REAL_PROJECT_MODEL'
          ? 'CONTROLLED_MODEL'
          : 'PROJECT_DOCUMENT',
        documentId: `WP2-SOURCE-${String(index + 1).padStart(2, '0')}`,
        title: `Controlled source for ${groupId}`,
        revision: 'REV-1',
        owner: 'PROJECT-ENGINEERING',
        retainedReference: `records/wp2/source-${String(index + 1).padStart(2, '0')}.json`,
        sourceHash: `fnv1a64:${(index + 1).toString(16).padStart(16, '0')}`,
      },
      approvalStatus: approved ? 'APPROVED' : 'NOT_APPROVED',
    })),
    engineeringApproval: approved
      ? {
        status: 'APPROVED',
        approverName: 'RESPONSIBLE-PIPING-AUTHORITY',
        approverRole: 'LEAD-PIPING-STRESS-ENGINEER',
        organization: 'PROJECT-ENGINEERING',
        approvedAtUtc: '2026-07-31T10:49:30Z',
        evidenceReference: 'records/wp2/engineering-approval.json',
        evidenceHash: 'fnv1a64:aaaaaaaaaaaaaaaa',
      }
      : {
        status: 'NOT_APPROVED',
        approverName: null,
        approverRole: null,
        organization: null,
        approvedAtUtc: null,
        evidenceReference: null,
        evidenceHash: null,
      },
  });
}

function artifact(path, record, contentHash) {
  return {
    schema: EVIDENCE_ARTIFACT_REFERENCE_SCHEMA,
    path,
    mediaType: 'application/json',
    contentHash,
    recordSemanticHash: record.semanticHash,
    recordEvidenceHash: record.evidenceHash,
  };
}

function packageRequest(overrides = {}) {
  const projectAuthorityIndex = projectAuthority();
  const realModelReconciliation = comparison('REAL_MODEL_RECONCILIATION');
  const commercialCorroboration = comparison('COMMERCIAL_CORROBORATION');
  const performanceEvidence = performance();
  const rollbackEvidence = rollback();
  const reviewDisposition = disposition();
  return {
    schema: EXTERNAL_QUALIFICATION_PACKAGE_REQUEST_SCHEMA,
    packageId: 'EXTERNAL-QUALIFICATION-PACKAGE-001',
    exactHead: EXACT_HEAD,
    applicationResult: fixture.applicationResult,
    presentation,
    projectAuthorityIndex,
    realModelReconciliation,
    commercialCorroboration,
    performanceEvidence,
    rollbackEvidence,
    reviewDisposition,
    artifactReferences: {
      realModelReconciliation: artifact(
        'evidence/real-model-reconciliation.json',
        realModelReconciliation,
        'fnv1a64:e5e5e5e5e5e5e5e5',
      ),
      commercialCorroboration: artifact(
        'evidence/commercial-corroboration.json',
        commercialCorroboration,
        'fnv1a64:f6f6f6f6f6f6f6f6',
      ),
      performanceEvidence: artifact(
        'evidence/performance-evidence.json',
        performanceEvidence,
        'fnv1a64:1717171717171717',
      ),
      rollbackEvidence: artifact(
        'evidence/rollback-evidence.json',
        rollbackEvidence,
        'fnv1a64:2828282828282828',
      ),
      signedDisposition: artifact(
        'evidence/signed-disposition.json',
        reviewDisposition,
        'fnv1a64:3939393939393939',
      ),
    },
    ...overrides,
  };
}

console.log('\n--- [SIMULATED][INELIGIBLE_FOR_PROJECT_EVIDENCE] Phase 6B external package ---');
const packageValue = compileLinearPipingExternalQualificationPackage(packageRequest());

test('P6B-EXT-01', 'Complete external records compile only to release-review eligibility', () => {
  assert.equal(packageValue.schema, 'linear-piping-external-qualification-package/v2');
  assert.equal(packageValue.status, 'ELIGIBLE_FOR_RELEASE_REVIEW');
  assert.equal(packageValue.projectAuthorityIndex.wp2Status, 'WP2_COMPLETE');
  assert.equal(packageValue.exactHead, PHASE6I_FROZEN_CANDIDATE);
  assert.deepEqual(packageValue.requiredSelectorKinds, [
    'B31_CALCULATED_STRESS',
    'B31_UTILIZATION',
    'INTERFACE_FORCE_LOCAL',
    'INTERFACE_MOMENT_REFERENCE_LOCAL',
    'NOZZLE_UTILIZATION',
  ]);
  assert.equal(
    requireLinearPipingExternalQualificationPackage(packageValue).semanticHash,
    packageValue.semanticHash,
  );
});

test('P6B-EXT-02', 'Incomplete comparison coverage is rejected', () => {
  const request = packageRequest();
  request.realModelReconciliation = comparison('REAL_MODEL_RECONCILIATION', {
    observations: observations().filter((row) => row.selector.kind !== 'INTERFACE_MOMENT_REFERENCE_LOCAL'),
  });
  request.artifactReferences.realModelReconciliation = artifact(
    'evidence/real-model-reconciliation.json',
    request.realModelReconciliation,
    'fnv1a64:e5e5e5e5e5e5e5e5',
  );
  expectCode(
    () => compileLinearPipingExternalQualificationPackage(request),
    'PIPING_EXTERNAL_PACKAGE_COVERAGE_INVALID',
  );
});

test('P6B-EXT-03', 'Ineligible authority labels are rejected', () => {
  const request = packageRequest();
  request.realModelReconciliation = comparison('REAL_MODEL_RECONCILIATION', {
    authority: {
      ...authority('INDEPENDENT_ENGINEERING_REVIEW'),
      organization: 'SIMULATED-REVIEW-ORG',
    },
  });
  expectCode(
    () => compileLinearPipingExternalQualificationPackage(request),
    'PIPING_EXTERNAL_EVIDENCE_INELIGIBLE',
  );
});

test('P6B-EXT-04', 'G8 and G9 authorities must remain independent', () => {
  const request = packageRequest();
  const shared = authority('INDEPENDENT_ENGINEERING_REVIEW');
  request.commercialCorroboration = comparison('COMMERCIAL_CORROBORATION', {
    authority: {
      ...authority('COMMERCIAL_PIPE_STRESS_PROGRAM'),
      runId: shared.runId,
      sourceSemanticHash: shared.sourceSemanticHash,
    },
  });
  request.artifactReferences.commercialCorroboration = artifact(
    'evidence/commercial-corroboration.json',
    request.commercialCorroboration,
    'fnv1a64:f6f6f6f6f6f6f6f6',
  );
  expectCode(
    () => compileLinearPipingExternalQualificationPackage(request),
    'PIPING_EXTERNAL_PACKAGE_AUTHORITY_NOT_INDEPENDENT',
  );
});

test('P6B-EXT-05', 'Exceeded production envelope is rejected', () => {
  const request = packageRequest();
  request.performanceEvidence = performance({ exceededLimits: ['MAX-NODES'] });
  request.artifactReferences.performanceEvidence = artifact(
    'evidence/performance-evidence.json',
    request.performanceEvidence,
    'fnv1a64:1717171717171717',
  );
  expectCode(
    () => compileLinearPipingExternalQualificationPackage(request),
    'PIPING_EXTERNAL_PACKAGE_PERFORMANCE_INVALID',
  );
});

test('P6B-EXT-06', 'Rollback must restore the application path and project data', () => {
  const request = packageRequest();
  request.rollbackEvidence = rollback({ restoredApplicationPath: false });
  request.artifactReferences.rollbackEvidence = artifact(
    'evidence/rollback-evidence.json',
    request.rollbackEvidence,
    'fnv1a64:2828282828282828',
  );
  expectCode(
    () => compileLinearPipingExternalQualificationPackage(request),
    'PIPING_EXTERNAL_PACKAGE_ROLLBACK_INVALID',
  );
});

test('P6B-EXT-07', 'Artifact references must bind the retained record hashes', () => {
  const request = packageRequest();
  request.artifactReferences.performanceEvidence.recordEvidenceHash =
    'fnv1a64:0000000000000000';
  expectCode(
    () => compileLinearPipingExternalQualificationPackage(request),
    'PIPING_EVIDENCE_ARTIFACT_REFERENCE_MISMATCH',
  );
});

test('P6B-EXT-08', 'Tampered package evidence is rejected independently', () => {
  const tampered = clone(packageValue);
  tampered.evidenceHash = 'fnv1a64:0000000000000000';
  expectCode(
    () => requireLinearPipingExternalQualificationPackage(tampered),
    'PIPING_EXTERNAL_PACKAGE_HASH_MISMATCH',
  );
});

test('P6B-EXT-09', 'Unapproved WP-2 authority blocks external package compilation', () => {
  const request = packageRequest({ projectAuthorityIndex: projectAuthority(false) });
  expectCode(
    () => compileLinearPipingExternalQualificationPackage(request),
    'LFEA_WP2_INDEX_NOT_APPROVED',
  );
});

test('P6B-EXT-10', 'WP-2 authority identity is bound into package hashes', () => {
  const tampered = clone(packageValue);
  tampered.projectAuthorityIndex.evidenceHash = 'fnv1a64:0000000000000000';
  expectCode(
    () => requireLinearPipingExternalQualificationPackage(tampered),
    'LFEA_WP2_INDEX_CANONICAL_MISMATCH',
  );
});

test('P6B-EXT-11', 'WP-2 candidate and package exact head cannot diverge', () => {
  const request = packageRequest({
    exactHead: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  });
  expectCode(
    () => compileLinearPipingExternalQualificationPackage(request),
    'PIPING_EXTERNAL_PACKAGE_PROJECT_AUTHORITY_HEAD_MISMATCH',
  );
});

console.log('[SIMULATED][INELIGIBLE_FOR_PROJECT_EVIDENCE] Phase 6B checks PASS');
