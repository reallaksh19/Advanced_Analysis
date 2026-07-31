#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { semanticHash } from '../src/core/shared-piping-model/canonical-json.js';
import {
  COMPARISON_RULE_ID,
  EVIDENCE_ARTIFACT_REFERENCE_SCHEMA,
  EXTERNAL_QUALIFICATION_PACKAGE_REQUEST_SCHEMA,
  PERFORMANCE_EVIDENCE_SCHEMA,
  QUALIFICATION_PROFILE_SCHEMA,
  QUALIFICATION_REQUEST_SCHEMA,
  RELEASE_REVIEW_DECISION,
  RELEASE_REVIEW_DISPOSITION_SCHEMA,
  ROLLBACK_EVIDENCE_SCHEMA,
  compileLinearPipingExternalQualificationPackage,
  compileLinearPipingQualificationComparison,
  sealPerformanceEvidence,
  sealQualificationProfile,
  sealReleaseReviewDisposition,
  sealRollbackEvidence,
} from '../src/core/linear-piping-project-qualification/index.js';
import { compileLinearPipingPresentation } from '../src/core/linear-piping-presentation/index.js';
import { buildQualifiedPresentationFixture } from './linear-piping-presentation-fixtures.mjs';
import {
  canonicalJsonArtifactHash,
  validateExternalReleaseEvidence,
} from './lfea-piping-external-release-evidence-check.mjs';

const EXACT_HEAD = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const ROLLBACK_TARGET = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const ARTIFACT_BINDINGS = Object.freeze([
  ['realModelReconciliation', 'realModelReconciliation', 'real-model-reconciliation.json'],
  ['commercialCorroboration', 'commercialCorroboration', 'commercial-corroboration.json'],
  ['performanceEvidence', 'performanceEvidence', 'performance-evidence.json'],
  ['rollbackEvidence', 'rollbackEvidence', 'rollback-evidence.json'],
  ['signedDisposition', 'reviewDisposition', 'signed-disposition.json'],
]);

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

function ledger() {
  return JSON.parse(fs.readFileSync('release-evidence/lfea-piping-release-evidence.json', 'utf8'));
}

function declared(value, source = 'PROJECT-QUALIFICATION-PROCEDURE') {
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
  relativeScaleFloor: declared(1e-12),
  semanticHash: '',
});

function authority(commercial) {
  return {
    authorityKind: commercial
      ? 'COMMERCIAL_PIPE_STRESS_PROGRAM'
      : 'INDEPENDENT_ENGINEERING_REVIEW',
    organization: commercial
      ? 'COMMERCIAL-ANALYSIS-PROVIDER'
      : 'INDEPENDENT-ENGINEERING-REVIEW-ORG',
    productOrMethod: commercial
      ? 'PIPE-STRESS-SUITE'
      : 'HAND-CALCULATION-RECONCILIATION',
    version: commercial ? '14.2' : '2026.1',
    documentId: commercial
      ? 'COMMERCIAL-CORROBORATION-REPORT'
      : 'PROJECT-RECONCILIATION-REPORT',
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
    relativeTolerance: declared(1e-12),
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

function comparison(commercial) {
  return compileLinearPipingQualificationComparison({
    schema: QUALIFICATION_REQUEST_SCHEMA,
    qualificationId: commercial
      ? 'G9-COMMERCIAL-CORROBORATION'
      : 'G8-REAL-MODEL-RECONCILIATION',
    qualificationKind: commercial
      ? 'COMMERCIAL_CORROBORATION'
      : 'REAL_MODEL_RECONCILIATION',
    applicationResult: fixture.applicationResult,
    presentation,
    authority: authority(commercial),
    observations: observations(),
    profile,
  });
}

function performanceEvidence() {
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

function rollbackEvidence() {
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
  });
}

function reviewDisposition() {
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
  });
}

function buildPackage(contentHashOverride = null) {
  const records = {
    realModelReconciliation: comparison(false),
    commercialCorroboration: comparison(true),
    performanceEvidence: performanceEvidence(),
    rollbackEvidence: rollbackEvidence(),
    reviewDisposition: reviewDisposition(),
  };
  const artifactReferences = {};
  for (const [referenceKey, recordKey, fileName] of ARTIFACT_BINDINGS) {
    const record = records[recordKey];
    artifactReferences[referenceKey] = {
      schema: EVIDENCE_ARTIFACT_REFERENCE_SCHEMA,
      path: `evidence/${fileName}`,
      mediaType: 'application/json',
      contentHash: contentHashOverride?.referenceKey === referenceKey
        ? contentHashOverride.value
        : canonicalJsonArtifactHash(record),
      recordSemanticHash: record.semanticHash,
      recordEvidenceHash: record.evidenceHash,
    };
  }
  const packageValue = compileLinearPipingExternalQualificationPackage({
    schema: EXTERNAL_QUALIFICATION_PACKAGE_REQUEST_SCHEMA,
    packageId: 'EXTERNAL-QUALIFICATION-PACKAGE-001',
    exactHead: EXACT_HEAD,
    applicationResult: fixture.applicationResult,
    presentation,
    ...records,
    artifactReferences,
  });
  return { packageValue, records };
}

function writeCandidate(root, options = {}) {
  fs.mkdirSync(path.join(root, 'evidence'), { recursive: true });
  const built = buildPackage(options.contentHashOverride ?? null);
  const packagePath = 'evidence/external-qualification-package.json';
  fs.writeFileSync(
    path.join(root, packagePath),
    `${JSON.stringify(built.packageValue, null, 2)}\n`,
  );
  for (const [referenceKey, recordKey, fileName] of ARTIFACT_BINDINGS) {
    const record = options.recordOverride?.referenceKey === referenceKey
      ? options.recordOverride.value
      : built.records[recordKey];
    fs.writeFileSync(
      path.join(root, 'evidence', fileName),
      `${JSON.stringify(record, null, 2)}\n`,
    );
  }
  const value = ledger();
  value.exactHead = EXACT_HEAD;
  value.artifacts.externalQualificationPackage = packagePath;
  for (const [referenceKey, , fileName] of ARTIFACT_BINDINGS) {
    value.artifacts[referenceKey] = `evidence/${fileName}`;
  }
  value.gates.G8_REAL_MODEL_RECONCILIATION = 'VERIFIED';
  value.gates.G9_COMMERCIAL_CORROBORATION = 'VERIFIED';
  value.gates.G10_RELEASE_ROLLBACK = 'VERIFIED';
  return { ledger: value, packageValue: built.packageValue };
}

console.log('\n--- [SIMULATED][INELIGIBLE_FOR_PROJECT_EVIDENCE] Phase 6C release intake ---');

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lfea-phase6c-'));
try {
  test('P6C-INTAKE-01', 'Policy mode remains unresolved when no package is supplied', () => {
    const result = validateExternalReleaseEvidence({
      root: process.cwd(),
      ledger: ledger(),
      releaseMode: false,
    });
    assert.equal(result.status, 'UNRESOLVED_GATE');
    assert.equal(result.releaseEligible, false);
    assert.equal(result.packagePath, null);
  });

  test('P6C-INTAKE-02', 'Release mode fails closed without a package artifact', () => {
    expectCode(
      () => validateExternalReleaseEvidence({
        root: process.cwd(),
        ledger: ledger(),
        releaseMode: true,
      }),
      'LFEA_EXTERNAL_PACKAGE_ARTIFACT_MISSING',
    );
  });

  test('P6C-INTAKE-03', 'A complete persisted package is accepted in policy mode', () => {
    const candidate = writeCandidate(tempRoot);
    const result = validateExternalReleaseEvidence({
      root: tempRoot,
      ledger: candidate.ledger,
      releaseMode: false,
    });
    assert.equal(result.status, 'ELIGIBLE_FOR_RELEASE_REVIEW');
    assert.equal(result.releaseEligible, false);
    assert.equal(result.artifactCount, 5);
    assert.equal(result.packageSemanticHash, candidate.packageValue.semanticHash);
  });

  test('P6C-INTAKE-04', 'A complete external evidence set passes release intake', () => {
    const candidate = writeCandidate(tempRoot);
    const result = validateExternalReleaseEvidence({
      root: tempRoot,
      ledger: candidate.ledger,
      releaseMode: true,
    });
    assert.equal(result.releaseEligible, true);
    assert.equal(result.artifactPaths.length, 5);
  });

  test('P6C-INTAKE-05', 'Manifest path traversal is rejected before file access', () => {
    const changed = ledger();
    changed.artifacts.externalQualificationPackage = '../evidence/package.json';
    changed.exactHead = EXACT_HEAD;
    expectCode(
      () => validateExternalReleaseEvidence({
        root: process.cwd(),
        ledger: changed,
        releaseMode: false,
      }),
      'LFEA_EXTERNAL_ARTIFACT_PATH_INVALID',
    );
  });

  test('P6C-INTAKE-06', 'Scripts, tests, fixtures and mocks are ineligible roots', () => {
    for (const relativePath of [
      'scripts/package.json',
      'tests/package.json',
      'fixtures/package.json',
      'mocks/package.json',
    ]) {
      const changed = ledger();
      changed.artifacts.externalQualificationPackage = relativePath;
      changed.exactHead = EXACT_HEAD;
      expectCode(
        () => validateExternalReleaseEvidence({
          root: process.cwd(),
          ledger: changed,
          releaseMode: false,
        }),
        'LFEA_EXTERNAL_ARTIFACT_PATH_INELIGIBLE',
      );
    }
  });

  test('P6C-INTAKE-07', 'Package and release-manifest heads cannot diverge', () => {
    const candidate = writeCandidate(tempRoot);
    candidate.ledger.exactHead = 'cccccccccccccccccccccccccccccccccccccccc';
    expectCode(
      () => validateExternalReleaseEvidence({
        root: tempRoot,
        ledger: candidate.ledger,
        releaseMode: false,
      }),
      'LFEA_EXTERNAL_PACKAGE_HEAD_MISMATCH',
    );
  });

  test('P6C-INTAKE-08', 'Manifest and package artifact paths cannot diverge', () => {
    const candidate = writeCandidate(tempRoot);
    candidate.ledger.artifacts.performanceEvidence = 'evidence/other-performance.json';
    expectCode(
      () => validateExternalReleaseEvidence({
        root: tempRoot,
        ledger: candidate.ledger,
        releaseMode: false,
      }),
      'LFEA_EXTERNAL_ARTIFACT_PATH_MISMATCH',
    );
  });

  test('P6C-INTAKE-09', 'Persisted record tampering is rejected', () => {
    const base = buildPackage();
    const tampered = clone(base.records.performanceEvidence);
    tampered.reviewedAtUtc = '2026-07-31T11:51:00Z';
    const candidate = writeCandidate(tempRoot, {
      recordOverride: { referenceKey: 'performanceEvidence', value: tampered },
    });
    expectCode(
      () => validateExternalReleaseEvidence({
        root: tempRoot,
        ledger: candidate.ledger,
        releaseMode: false,
      }),
      'LFEA_EXTERNAL_ARTIFACT_RECORD_MISMATCH',
    );
  });

  test('P6C-INTAKE-10', 'A stale canonical content hash is rejected', () => {
    const candidate = writeCandidate(tempRoot, {
      contentHashOverride: {
        referenceKey: 'performanceEvidence',
        value: 'fnv1a64:0000000000000000',
      },
    });
    expectCode(
      () => validateExternalReleaseEvidence({
        root: tempRoot,
        ledger: candidate.ledger,
        releaseMode: false,
      }),
      'LFEA_EXTERNAL_ARTIFACT_CONTENT_HASH_MISMATCH',
    );
  });

  test('P6C-INTAKE-11', 'Release mode requires G8, G9 and G10 verification', () => {
    const candidate = writeCandidate(tempRoot);
    candidate.ledger.gates.G9_COMMERCIAL_CORROBORATION = 'UNRESOLVED_GATE';
    expectCode(
      () => validateExternalReleaseEvidence({
        root: tempRoot,
        ledger: candidate.ledger,
        releaseMode: true,
      }),
      'LFEA_EXTERNAL_RELEASE_GATE_NOT_VERIFIED',
    );
  });

  test('P6C-INTAKE-12', 'Canonical artifact hash is independent of object key order', () => {
    const left = { schema: 'record/v1', value: 42, nested: { a: 1, b: 2 } };
    const right = { nested: { b: 2, a: 1 }, value: 42, schema: 'record/v1' };
    assert.equal(canonicalJsonArtifactHash(left), canonicalJsonArtifactHash(right));
    assert.match(canonicalJsonArtifactHash(left), /^fnv1a64:[0-9a-f]{16}$/u);
  });

  test('P6C-INTAKE-13', 'Release manifest reserves the external package slot', () => {
    const value = ledger();
    assert.equal(Object.hasOwn(value.artifacts, 'externalQualificationPackage'), true);
    assert.equal(value.artifacts.externalQualificationPackage, null);
    assert.equal(value.gates.G8_REAL_MODEL_RECONCILIATION, 'UNRESOLVED_GATE');
    assert.equal(value.gates.G9_COMMERCIAL_CORROBORATION, 'UNRESOLVED_GATE');
    assert.equal(value.gates.G10_RELEASE_ROLLBACK, 'UNRESOLVED_GATE');
  });
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

console.log('[SIMULATED][INELIGIBLE_FOR_PROJECT_EVIDENCE] Phase 6C checks PASS');
