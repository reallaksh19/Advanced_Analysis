#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { semanticHash } from '../src/core/shared-piping-model/canonical-json.js';
import {
  PHASE6I_ANTI_DRIFT_IDS,
  PHASE6I_BENCHMARK_IDS,
  PHASE6I_FROZEN_CANDIDATE,
  PHASE6I_GATE_IDS,
  PHASE6I_IMMUTABLE_REF,
  PHASE6I_INDEPENDENT_CLOSURE_REVIEW_SCHEMA,
  buildPhase6iAntiDriftReviewManifest,
  buildPhase6iBenchmarkReviewManifest,
  buildPhase6iIndependentClosureReview,
} from '../src/core/linear-piping-project-qualification/index.js';
import { validateIndependentClosurePackage } from './lfea-piping-phase6i-independent-closure-validator.mjs';

console.log('[SIMULATED][INELIGIBLE_FOR_PROJECT_EVIDENCE][NO_ENGINEERING_COMMAND_EXECUTION]');

const CERTIFICATION_RUN = '30750000001';
const CERTIFICATION_ARTIFACT = `lfea-runtime-release-validation-${PHASE6I_FROZEN_CANDIDATE}`;
const REVIEW_RUN = '30750000002';
const REVIEW_ARTIFACT = `lfea-independent-closure-review-${PHASE6I_FROZEN_CANDIDATE}`;
const REVIEW_PATH = 'review/independent-closure-review.json';
const BENCHMARK_PATH = 'review/benchmark-manifest.json';
const ANTI_DRIFT_PATH = 'review/anti-drift-manifest.json';
const INTAKE_PATH = 'wp3-bundle-intake.json';
const RELEASE_PATH = 'release-validation.json';

const cases = [];
runCase('Complete independent recommendation is accepted', () => {
  const fixture = createFixture();
  const result = validateFixture(fixture);
  assert.equal(result.status, 'ELIGIBLE_FOR_GOVERNANCE_CLOSURE_RECORDING');
  assert.equal(result.candidateSha, PHASE6I_FROZEN_CANDIDATE);
  assert.equal(result.audA7Disposition, 'RECOMMEND_CLOSE');
  assert.equal(result.releaseQualified, false);
  assert.equal(fs.existsSync(fixture.outputPath), true);
});

runCase('Tampered runtime release validation fails closed', () => {
  const fixture = createFixture();
  const file = path.join(fixture.certificationRoot, RELEASE_PATH);
  const value = readJson(file);
  value.verifiedGateCount = 10;
  writeJson(file, value, false);
  assertReject(() => validateFixture(fixture),
    'LFEA_WP8_RUNTIME_CERTIFICATION_IDENTITY_MISMATCH');
});

runCase('Phase 6E run identity mismatch fails closed', () => {
  const fixture = createFixture({ phase6eRunId: '30750009999' });
  assertReject(() => validateFixture(fixture),
    'LFEA_WP8_CERTIFICATION_IDENTITY_MISMATCH');
});

runCase('Independent review cannot reuse an execution run', () => {
  const fixture = createFixture();
  assertReject(
    () => validateFixture(fixture, { reviewRunId: CERTIFICATION_RUN }),
    'LFEA_WP8_REVIEW_CUSTODY_NOT_INDEPENDENT',
  );
});

runCase('Benchmark failure is rejected', () => {
  const fixture = createFixture({ benchmarkStatus: 'FAIL' });
  assertReject(() => validateFixture(fixture), 'LFEA_WP8_BENCHMARK_STATUS_INVALID');
});

runCase('Incomplete anti-drift inventory is rejected', () => {
  const fixture = createFixture({ omitLastAntiDrift: true });
  assertReject(() => validateFixture(fixture), 'LFEA_WP8_ANTI_DRIFT_INVENTORY_INVALID');
});

runCase('Reviewer from execution organization is rejected', () => {
  const fixture = createFixture({ reviewerOrganization: 'Execution Authority' });
  assertReject(() => validateFixture(fixture), 'LFEA_WP8_REVIEWER_NOT_INDEPENDENT');
});

runCase('Signature identity mismatch is rejected', () => {
  const fixture = createFixture({ signerId: 'different-reviewer' });
  assertReject(() => validateFixture(fixture), 'LFEA_WP8_SIGNATURE_IDENTITY_INVALID');
});

runCase('Ineligible synthetic evidence reference is rejected', () => {
  const fixture = createFixture({ benchmarkReference: 'fixture://benchmark/BM-01' });
  assertReject(() => validateFixture(fixture), 'LFEA_WP8_INELIGIBLE_REFERENCE');
});

runCase('Existing acceptance output is rejected', () => {
  const fixture = createFixture();
  writeJson(fixture.outputPath, { occupied: true });
  assertReject(() => validateFixture(fixture), 'LFEA_WP8_OUTPUT_EXISTS');
});

for (const item of cases) console.log(`${item.status}: ${item.name}`);
console.log(JSON.stringify({
  schema: 'lfea-piping-phase6i-independent-closure-validator-check/v1',
  status: 'PASS',
  caseCount: cases.length,
  approvedClosureCreated: false,
  auditFindingMutated: false,
  releaseEvidenceEligible: false,
}));

function createFixture(options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lfea-wp8-check-'));
  const repositoryRoot = path.join(root, 'repository');
  const certificationRoot = path.join(root, 'certification');
  const reviewRoot = path.join(root, 'review-source');
  const outputRoot = path.join(root, 'output');
  for (const directory of [repositoryRoot, certificationRoot, reviewRoot, outputRoot]) {
    fs.mkdirSync(directory, { recursive: true });
  }
  const intake = {
    schema: 'lfea-piping-wp3-runtime-bundle-intake/v1',
    status: 'ELIGIBLE_FOR_RUNTIME_RELEASE_VALIDATION',
    exactHead: PHASE6I_FROZEN_CANDIDATE,
    manifestPath: 'release-evidence.json',
    assemblySummaryPath: 'bundle/assembly-summary.json',
    sourceHandoffPath: 'external/source-handoff.json',
    sourceMaterializationRequestPath: 'external/source-materialization-request.json',
    sourceHandoffAcceptancePath: 'external/source-handoff-acceptance.json',
    sourceRunId: '30740000001',
    sourceArtifactName: 'lfea-external-source',
    sourceRequestContentHash: 'fnv1a64:1111111111111111',
    sourceHandoffEvidenceHash: 'fnv1a64:2222222222222222',
    sourceHandoffAcceptanceEvidenceHash: 'fnv1a64:3333333333333333',
    projectAuthorityIndexEvidenceHash: 'fnv1a64:4444444444444444',
    projectAuthorityBoundPackageEvidenceHash: 'fnv1a64:5555555555555555',
    releaseQualified: false,
  };
  const releaseValidation = {
    check: 'lfea-piping-release-readiness',
    mode: 'RELEASE',
    programDisposition: 'QUALIFIED',
    exactHead: PHASE6I_FROZEN_CANDIDATE,
    verifiedGateCount: 11,
    totalGateCount: 11,
    releaseEligible: true,
    qualificationHarness: 'PERSISTED_RELEASE_EVIDENCE',
    internalManifestSemanticHash: 'fnv1a64:6666666666666666',
    externalPackageSemanticHash: 'fnv1a64:7777777777777777',
  };
  writeJson(path.join(certificationRoot, INTAKE_PATH), intake);
  writeJson(path.join(certificationRoot, RELEASE_PATH), releaseValidation);

  const benchmarkEntries = PHASE6I_BENCHMARK_IDS.map((id, index) => ({
    id,
    status: index === 0 && options.benchmarkStatus ? options.benchmarkStatus : 'PASS',
    evidenceReference: index === 0 && options.benchmarkReference
      ? options.benchmarkReference
      : `retained://benchmark/${id}`,
    applicabilityBasis: null,
    approvalReference: null,
  }));
  const antiDriftIds = options.omitLastAntiDrift
    ? PHASE6I_ANTI_DRIFT_IDS.slice(0, -1)
    : PHASE6I_ANTI_DRIFT_IDS;
  const antiDriftEntries = antiDriftIds.map((id) => ({
    id,
    status: 'PASS',
    evidenceReference: `retained://anti-drift/${id}`,
  }));
  const benchmarks = buildPhase6iBenchmarkReviewManifest({
    candidateSha: PHASE6I_FROZEN_CANDIDATE,
    immutableRef: PHASE6I_IMMUTABLE_REF,
    entries: benchmarkEntries,
    releaseQualified: false,
  });
  const antiDrift = buildPhase6iAntiDriftReviewManifest({
    candidateSha: PHASE6I_FROZEN_CANDIDATE,
    immutableRef: PHASE6I_IMMUTABLE_REF,
    entries: antiDriftEntries,
    releaseQualified: false,
  });
  writeJson(path.join(reviewRoot, BENCHMARK_PATH), benchmarks);
  writeJson(path.join(reviewRoot, ANTI_DRIFT_PATH), antiDrift);

  const gates = Object.fromEntries(PHASE6I_GATE_IDS.map((id) => [id, 'VERIFIED']));
  const review = buildPhase6iIndependentClosureReview({
    schema: PHASE6I_INDEPENDENT_CLOSURE_REVIEW_SCHEMA,
    status: 'WP8_REVIEW_COMPLETE',
    candidateSha: PHASE6I_FROZEN_CANDIDATE,
    immutableRef: PHASE6I_IMMUTABLE_REF,
    reviewer: {
      reviewerId: 'independent-reviewer-001',
      organization: options.reviewerOrganization ?? 'Independent Assurance',
      independenceStatement: 'Reviewer has no execution, approval or evidence-production role.',
    },
    executionOwnerOrganization: 'Execution Authority',
    executionChain: {
      phase6F: run('30740000002', 'lfea-phase6f-evidence', 'retained://logs/phase6f'),
      phase6H: run('30740000003', 'lfea-phase6h-evidence', 'retained://logs/phase6h'),
      phase6G: run('30740000004', 'lfea-phase6g-bundle', 'retained://logs/phase6g'),
      phase6E: run(
        options.phase6eRunId ?? CERTIFICATION_RUN,
        CERTIFICATION_ARTIFACT,
        'retained://logs/phase6e',
      ),
    },
    runtimeCertification: {
      intakePath: INTAKE_PATH,
      releaseValidationPath: RELEASE_PATH,
      intakeContentHash: semanticHash(intake),
      releaseValidationContentHash: semanticHash(releaseValidation),
    },
    benchmarkManifest: reference(BENCHMARK_PATH, benchmarks),
    antiDriftManifest: reference(ANTI_DRIFT_PATH, antiDrift),
    gates,
    limitations: 'Linear release excludes nonlinear contact mechanisms and remains candidate-bound.',
    nonlinearExclusions: ['CONTACT', 'FRICTION', 'GAP', 'LIFT_OFF'],
    rollbackStatus: 'SUCCESSFUL',
    audA7Disposition: 'RECOMMEND_CLOSE',
    signature: {
      signerId: options.signerId ?? 'independent-reviewer-001',
      signedAtUtc: '2026-08-02T15:50:00Z',
      signatureReference: 'retained://signature/wp8/001',
    },
    releaseQualified: false,
  });
  writeJson(path.join(reviewRoot, REVIEW_PATH), review);
  return {
    repositoryRoot,
    certificationRoot,
    reviewRoot,
    outputPath: path.join(outputRoot, 'wp8-acceptance.json'),
  };
}

function validateFixture(fixture, overrides = {}) {
  return validateIndependentClosurePackage({
    ...fixture,
    reviewPath: REVIEW_PATH,
    benchmarkPath: BENCHMARK_PATH,
    antiDriftPath: ANTI_DRIFT_PATH,
    expectedHead: PHASE6I_FROZEN_CANDIDATE,
    certificationRunId: CERTIFICATION_RUN,
    certificationArtifactName: CERTIFICATION_ARTIFACT,
    reviewRunId: REVIEW_RUN,
    reviewArtifactName: REVIEW_ARTIFACT,
    ...overrides,
  });
}

function run(runId, artifactName, logsReference) {
  return { runId, artifactName, logsReference };
}

function reference(filePath, record) {
  return {
    path: filePath,
    contentHash: semanticHash(record),
    semanticHash: record.semanticHash,
    evidenceHash: record.evidenceHash,
  };
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
