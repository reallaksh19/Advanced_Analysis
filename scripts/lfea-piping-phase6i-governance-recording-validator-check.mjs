#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { semanticHash } from '../src/core/shared-piping-model/canonical-json.js';
import {
  PHASE6I_FROZEN_CANDIDATE,
  PHASE6I_IMMUTABLE_REF,
  PHASE6I_INDEPENDENT_CLOSURE_ACCEPTANCE_SCHEMA,
  buildPhase6iGovernanceClosureDecision,
} from '../src/core/linear-piping-project-qualification/index.js';
import { prepareGovernanceRecordingPlan } from './lfea-piping-phase6i-governance-recording-validator.mjs';

console.log('[SIMULATED][INELIGIBLE_FOR_PROJECT_EVIDENCE][NO_GOVERNANCE_MUTATION]');

const ACCEPTANCE_RUN = '30760000001';
const ACCEPTANCE_ARTIFACT = `lfea-independent-closure-acceptance-${PHASE6I_FROZEN_CANDIDATE}`;
const DECISION_RUN = '30760000002';
const DECISION_ARTIFACT = `lfea-governance-decision-${PHASE6I_FROZEN_CANDIDATE}`;
const ACCEPTANCE_PATH = 'closure/independent-closure-acceptance.json';
const DECISION_PATH = 'governance/governance-decision.json';
const cases = [];

runCase('Valid governance decision produces a non-applying recording plan', () => {
  const fixture = createFixture();
  const result = validateFixture(fixture);
  assert.equal(result.status, 'ELIGIBLE_FOR_AUTHORIZED_GOVERNANCE_RECORDING');
  assert.equal(result.findingsLedger.phaseStatusTo, 'VERIFIED');
  assert.equal(result.findingsLedger.findingStatusTo, 'VERIFIED');
  assert.equal(result.releasePolicyTemplate.action, 'NO_CHANGE_BLOCKED_POLICY_TEMPLATE');
  assert.equal(result.repositoryMutationPerformed, false);
  assert.equal(result.issueMutationPerformed, false);
  assert.equal(result.releaseQualified, false);
});

runCase('Tampered WP8 acceptance fails closed', () => {
  const fixture = createFixture();
  const file = path.join(fixture.acceptanceRoot, ACCEPTANCE_PATH);
  const value = readJson(file);
  value.reviewerId = 'tampered-reviewer';
  writeJson(file, value, false);
  assertReject(() => validateFixture(fixture), 'LFEA_WP9_ACCEPTANCE_HASH_MISMATCH');
});

runCase('Decision bound to a different acceptance fails closed', () => {
  const fixture = createFixture({ acceptanceContentHash: 'fnv1a64:aaaaaaaaaaaaaaaa' });
  assertReject(() => validateFixture(fixture), 'LFEA_WP9_ACCEPTANCE_IDENTITY_MISMATCH');
});

runCase('Governance authority cannot be the independent reviewer', () => {
  const fixture = createFixture({ authorityId: 'independent-reviewer-001' });
  assertReject(() => validateFixture(fixture),
    'LFEA_WP9_GOVERNANCE_AUTHORITY_NOT_INDEPENDENT');
});

runCase('Governance decision run cannot equal acceptance run', () => {
  const fixture = createFixture();
  assertReject(() => validateFixture(fixture, { decisionRunId: ACCEPTANCE_RUN }),
    'LFEA_WP9_GOVERNANCE_CUSTODY_NOT_INDEPENDENT');
});

runCase('Governance decision run cannot reuse Phase 6E run', () => {
  const fixture = createFixture();
  assertReject(() => validateFixture(fixture, { decisionRunId: '30750000001' }),
    'LFEA_WP9_GOVERNANCE_CUSTODY_NOT_INDEPENDENT');
});

runCase('Pre-promoted findings ledger is rejected', () => {
  const fixture = createFixture({ phaseStatus: 'VERIFIED' });
  assertReject(() => validateFixture(fixture), 'LFEA_WP9_FINDINGS_LEDGER_STATE_INVALID');
});

runCase('Modified release policy template is rejected', () => {
  const fixture = createFixture({ releaseDisposition: 'QUALIFIED' });
  assertReject(() => validateFixture(fixture), 'LFEA_WP9_RELEASE_TEMPLATE_BASELINE_INVALID');
});

runCase('Synthetic governance authority reference is rejected', () => {
  assertReject(() => createFixture({ authorityBasisReference: 'fixture://authority' }),
    'LFEA_WP9_INELIGIBLE_REFERENCE');
});

runCase('Promoted governance decision input is rejected', () => {
  assertReject(() => createFixture({ decisionReleaseQualified: true }),
    'LFEA_WP9_DECISION_STATUS_INVALID');
});

runCase('Existing output is rejected', () => {
  const fixture = createFixture();
  writeJson(fixture.outputPath, { occupied: true });
  assertReject(() => validateFixture(fixture), 'LFEA_WP9_OUTPUT_EXISTS');
});

for (const item of cases) console.log(`${item.status}: ${item.name}`);
console.log(JSON.stringify({
  schema: 'lfea-piping-phase6i-governance-recording-validator-check/v1',
  status: 'PASS',
  caseCount: cases.length,
  auditFindingMutated: false,
  releaseTemplateMutated: false,
  issueClosed: false,
  releaseEvidenceEligible: false,
}));

function createFixture(options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lfea-wp9-check-'));
  const repositoryRoot = path.join(root, 'repository');
  const acceptanceRoot = path.join(root, 'acceptance-source');
  const decisionRoot = path.join(root, 'decision-source');
  const outputRoot = path.join(root, 'output');
  for (const directory of [repositoryRoot, acceptanceRoot, decisionRoot, outputRoot]) {
    fs.mkdirSync(directory, { recursive: true });
  }

  const acceptance = buildAcceptance();
  writeJson(path.join(acceptanceRoot, ACCEPTANCE_PATH), acceptance);
  const decision = buildPhase6iGovernanceClosureDecision({
    status: 'GOVERNANCE_DECISION_COMPLETE',
    candidateSha: PHASE6I_FROZEN_CANDIDATE,
    immutableRef: PHASE6I_IMMUTABLE_REF,
    acceptanceReference: {
      runId: ACCEPTANCE_RUN,
      artifactName: ACCEPTANCE_ARTIFACT,
      path: ACCEPTANCE_PATH,
      contentHash: options.acceptanceContentHash ?? semanticHash(acceptance),
      semanticHash: acceptance.semanticHash,
      evidenceHash: acceptance.evidenceHash,
    },
    authority: {
      authorityId: options.authorityId ?? 'governance-authority-001',
      role: 'Phase 6I Governance Authority',
      organization: 'Release Governance Board',
      authorityBasisReference: options.authorityBasisReference
        ?? 'retained://governance/authority-charter/001',
      independenceStatement:
        'Decision authority is independent of execution and independent technical review.',
    },
    decision: {
      audA7Disposition: 'APPROVE_CLOSURE',
      gatesDisposition: 'RECORD_VERIFIED',
      programDisposition: 'QUALIFIED',
    },
    recordingTarget: {
      findingsLedgerPath: 'reports/lfea-piping-phase-findings-ledger.json',
      phaseId: 'PHASE_6_PROJECT_QUALIFICATION',
      findingId: 'AUD-A7-001',
      issueNumber: 70,
      releaseTemplatePath: 'release-evidence/lfea-piping-release-evidence.json',
    },
    decisionTimestampUtc: '2026-08-02T16:20:00Z',
    signature: {
      signerId: options.authorityId ?? 'governance-authority-001',
      signedAtUtc: '2026-08-02T16:20:00Z',
      signatureReference: 'retained://governance/signature/001',
    },
    releaseQualified: options.decisionReleaseQualified ?? false,
  });
  writeJson(path.join(decisionRoot, DECISION_PATH), decision);
  writeJson(
    path.join(repositoryRoot, 'reports/lfea-piping-phase-findings-ledger.json'),
    buildFindingsLedger(options),
  );
  writeJson(
    path.join(repositoryRoot, 'release-evidence/lfea-piping-release-evidence.json'),
    buildReleaseTemplate(options),
  );
  return {
    repositoryRoot,
    acceptanceRoot,
    decisionRoot,
    outputPath: path.join(outputRoot, 'governance-recording-plan.json'),
  };
}

function buildAcceptance() {
  const base = {
    schema: PHASE6I_INDEPENDENT_CLOSURE_ACCEPTANCE_SCHEMA,
    status: 'ELIGIBLE_FOR_GOVERNANCE_CLOSURE_RECORDING',
    candidateSha: PHASE6I_FROZEN_CANDIDATE,
    immutableRef: PHASE6I_IMMUTABLE_REF,
    certificationRunId: '30750000001',
    certificationArtifactName: `lfea-runtime-release-validation-${PHASE6I_FROZEN_CANDIDATE}`,
    reviewRunId: '30750000002',
    reviewArtifactName: `lfea-independent-closure-review-${PHASE6I_FROZEN_CANDIDATE}`,
    reviewPath: 'review/independent-closure-review.json',
    reviewContentHash: 'fnv1a64:1111111111111111',
    reviewSemanticHash: 'fnv1a64:2222222222222222',
    reviewEvidenceHash: 'fnv1a64:3333333333333333',
    benchmarkManifestPath: 'review/benchmark-manifest.json',
    benchmarkManifestContentHash: 'fnv1a64:4444444444444444',
    benchmarkManifestSemanticHash: 'fnv1a64:5555555555555555',
    benchmarkManifestEvidenceHash: 'fnv1a64:6666666666666666',
    antiDriftManifestPath: 'review/anti-drift-manifest.json',
    antiDriftManifestContentHash: 'fnv1a64:7777777777777777',
    antiDriftManifestSemanticHash: 'fnv1a64:8888888888888888',
    antiDriftManifestEvidenceHash: 'fnv1a64:9999999999999999',
    runtimeIntakePath: 'wp3-bundle-intake.json',
    runtimeIntakeContentHash: 'fnv1a64:aaaaaaaaaaaaaaaa',
    releaseValidationPath: 'release-validation.json',
    releaseValidationContentHash: 'fnv1a64:bbbbbbbbbbbbbbbb',
    reviewerId: 'independent-reviewer-001',
    audA7Disposition: 'RECOMMEND_CLOSE',
    releaseQualified: false,
  };
  const semantic = semanticHash(base);
  return {
    ...base,
    semanticHash: semantic,
    evidenceHash: semanticHash({ ...base, semanticHash: semantic }),
  };
}

function buildFindingsLedger(options) {
  return {
    schema: 'lfea-piping-phase-findings-ledger/v1',
    repository: 'reallaksh19/Advanced_Analysis',
    program: 'PRIORITY_2_LINEAR_PIPING_FEA',
    sourceAuditPath: 'docs/CONSOLIDATED_LFEA_PIPING_AUDIT_2026-07-31.md',
    allowedStatuses: [
      'VERIFIED', 'PARTIALLY_VERIFIED', 'CONTRADICTED', 'UNRESOLVED_GATE',
      'NOT_IMPLEMENTED', 'NOT_APPLICABLE',
    ],
    phases: [{
      phaseId: 'PHASE_6_PROJECT_QUALIFICATION',
      title: 'External reconciliation, performance and rollback evidence eligibility',
      status: options.phaseStatus ?? 'UNRESOLVED_GATE',
      scope: ['Retain real external qualification evidence.'],
      evidencePaths: ['src/core/linear-piping-project-qualification/index.js'],
      addressedFindingIds: ['AUD-A7-001'],
      completedAtUtc: options.phaseStatus === 'VERIFIED' ? '2026-08-02T16:00:00Z' : null,
    }],
    findings: [{
      findingId: 'AUD-A7-001',
      gate: 'A7',
      severity: 'BLOCKER',
      auditStatus: 'UNRESOLVED_GATE',
      currentStatus: 'UNRESOLVED_GATE',
      ownerPhase: 'PHASE_6_PROJECT_QUALIFICATION',
      evidencePaths: ['src/core/linear-piping-project-qualification/index.js'],
      remainingCondition: 'Retain real same-head evidence and independent closure approval.',
    }],
  };
}

function buildReleaseTemplate(options) {
  return {
    schema: 'lfea-piping-release-evidence/v1',
    program: 'PRIORITY_2_LINEAR_PIPING_FEA_APPLICATION_CHAIN',
    programDisposition: options.releaseDisposition ?? 'BLOCKED',
    exactHead: null,
    gates: {
      G0_EXACT_HEAD: 'UNRESOLVED_GATE',
      G1_UPSTREAM_NUMERICAL_CHAIN: 'PARTIALLY_VERIFIED',
      G2_T0_APPLICATION_SEQUENCING: 'PARTIALLY_VERIFIED',
      G3_SOURCE_ORCHESTRATION: 'PARTIALLY_VERIFIED',
      G4_INTERFACES: 'PARTIALLY_VERIFIED',
      G5_INTERFACE_RECOVERY: 'PARTIALLY_VERIFIED',
      G6_CODE_AND_ALLOWABLES: 'PARTIALLY_VERIFIED',
      G7_PRESENTATION_EXPORT: 'PARTIALLY_VERIFIED',
      G8_REAL_MODEL_RECONCILIATION: 'UNRESOLVED_GATE',
      G9_COMMERCIAL_CORROBORATION: 'UNRESOLVED_GATE',
      G10_RELEASE_ROLLBACK: 'UNRESOLVED_GATE',
    },
    artifacts: Object.fromEntries([
      'exactHeadManifest', 'upstreamGateLog', 't0GateLog',
      'sourceOrchestrationEvidence', 'interfaceEvidence',
      'interfaceRecoveryEvidence', 'codeAndAllowableEvidence',
      'presentationExportEvidence', 'realModelReconciliation',
      'commercialCorroboration', 'performanceEvidence', 'rollbackEvidence',
      'signedDisposition', 'externalQualificationPackage',
    ].map((key) => [key, null])),
  };
}

function validateFixture(fixture, overrides = {}) {
  return prepareGovernanceRecordingPlan({
    ...fixture,
    acceptancePath: ACCEPTANCE_PATH,
    acceptanceRunId: ACCEPTANCE_RUN,
    acceptanceArtifactName: ACCEPTANCE_ARTIFACT,
    decisionPath: DECISION_PATH,
    decisionRunId: overrides.decisionRunId ?? DECISION_RUN,
    decisionArtifactName: DECISION_ARTIFACT,
    expectedHead: PHASE6I_FROZEN_CANDIDATE,
  });
}

function runCase(name, callback) {
  callback();
  cases.push({ name, status: 'PASS' });
}

function assertReject(callback, expectedCode) {
  assert.throws(callback, (error) => error?.code === expectedCode);
}

function writeJson(filePath, value, createOnly = true) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, {
    flag: createOnly ? 'wx' : 'w',
  });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}
