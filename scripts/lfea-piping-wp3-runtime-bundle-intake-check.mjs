#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { semanticHash } from '../src/core/shared-piping-model/canonical-json.js';
import {
  PHASE6I_FROZEN_CANDIDATE,
  PHASE6I_IMMUTABLE_REF,
  compilePhase6iExternalEvidenceHandoffAcceptance,
  sealPhase6iExternalEvidenceHandoff,
} from '../src/core/linear-piping-project-qualification/index.js';
import {
  parseWp3RuntimeBundleIntakeInvocation,
  validateWp3RuntimeReleaseBundle,
} from './lfea-piping-wp3-runtime-bundle-intake.mjs';

console.log('[SIMULATED][INELIGIBLE_FOR_PROJECT_EVIDENCE][NO_ENGINEERING_COMMAND_EXECUTION]');

const MANIFEST_PATH = 'release-evidence.json';
const SUMMARY_PATH = 'bundle/assembly-summary.json';
const INTERNAL_PATH = 'internal/exact-head-manifest.json';
const PACKAGE_PATH = 'external/external-qualification-package.json';
const BOUND_PATH = 'external/project-authority-bound-package.json';
const AUTHORITY_PATH = 'external/project-authority-index.json';
const HANDOFF_PATH = 'external/source-handoff.json';
const REQUEST_PATH = 'external/source-materialization-request.json';
const ACCEPTANCE_PATH = 'external/source-handoff-acceptance.json';
const SOURCE_RUN_ID = '30750000001';
const SOURCE_ARTIFACT_NAME = 'lfea-piping-wp3-source-617f7c2';

const parsed = parseWp3RuntimeBundleIntakeInvocation([
  '--evidence-root=/tmp/bundle',
  `--manifest=${MANIFEST_PATH}`,
  `--summary=${SUMMARY_PATH}`,
  '--output=/tmp/intake.json',
  `--expected-head=${PHASE6I_FROZEN_CANDIDATE}`,
]);
assert.equal(parsed.summaryPath, SUMMARY_PATH);
assert.throws(
  () => parseWp3RuntimeBundleIntakeInvocation(['--output=/tmp/out.json']),
  hasCode('LFEA_WP3_RUNTIME_INTAKE_OPTIONS_MISSING'),
);

await test('WP3-P6E-01', 'Complete WP3 runtime bundle enters release validation', () => {
  const fixture = buildFixture('success');
  try {
    const output = path.join(fixture.root, 'intake.json');
    const result = validate(fixture, output);
    assert.equal(result.status, 'ELIGIBLE_FOR_RUNTIME_RELEASE_VALIDATION');
    assert.equal(result.exactHead, PHASE6I_FROZEN_CANDIDATE);
    assert.equal(result.sourceRunId, SOURCE_RUN_ID);
    assert.equal(result.sourceArtifactName, SOURCE_ARTIFACT_NAME);
    assert.equal(result.releaseQualified, false);
    assert.deepEqual(readJson(output), result);
  } finally {
    cleanup(fixture);
  }
});

await test('WP3-P6E-02', 'Downloaded request tampering fails closed', () => {
  const fixture = buildFixture('request-tamper');
  try {
    fixture.request.packageId = 'CHANGED-PACKAGE';
    writeJson(path.join(fixture.bundleRoot, REQUEST_PATH), fixture.request);
    expectCode(
      () => validate(fixture, path.join(fixture.root, 'intake.json')),
      'LFEA_WP3_RUNTIME_INTAKE_REQUEST_MISMATCH',
    );
  } finally {
    cleanup(fixture);
  }
});

await test('WP3-P6E-03', 'Downloaded handoff tampering fails closed', () => {
  const fixture = buildFixture('handoff-tamper');
  try {
    const changed = structuredClone(fixture.handoff);
    changed.sourceRunId = '30750000002';
    writeJson(path.join(fixture.bundleRoot, HANDOFF_PATH), changed);
    expectCode(
      () => validate(fixture, path.join(fixture.root, 'intake.json')),
      'LFEA_WP3_HANDOFF_HASH_MISMATCH',
    );
  } finally {
    cleanup(fixture);
  }
});

await test('WP3-P6E-04', 'Persisted WP2 authority tampering fails closed', () => {
  const fixture = buildFixture('authority-tamper');
  try {
    fixture.authority.evidenceHash = 'fnv1a64:ffffffffffffffff';
    writeJson(path.join(fixture.bundleRoot, AUTHORITY_PATH), fixture.authority);
    expectCode(
      () => validate(fixture, path.join(fixture.root, 'intake.json')),
      'LFEA_WP3_RUNTIME_INTAKE_AUTHORITY_MISMATCH',
    );
  } finally {
    cleanup(fixture);
  }
});

await test('WP3-P6E-05', 'Internal manifest identity tampering fails closed', () => {
  const fixture = buildFixture('internal-tamper');
  try {
    fixture.internalManifest.evidenceHash = 'fnv1a64:ffffffffffffffff';
    writeJson(path.join(fixture.bundleRoot, INTERNAL_PATH), fixture.internalManifest);
    expectCode(
      () => validate(fixture, path.join(fixture.root, 'intake.json')),
      'LFEA_WP3_RUNTIME_INTAKE_INTERNAL_MANIFEST_MISMATCH',
    );
  } finally {
    cleanup(fixture);
  }
});

await test('WP3-P6E-06', 'Assembly-summary identity tampering fails closed', () => {
  const fixture = buildFixture('summary-tamper');
  try {
    fixture.summary.sourceRequestContentHash = 'fnv1a64:ffffffffffffffff';
    writeJson(path.join(fixture.bundleRoot, SUMMARY_PATH), fixture.summary);
    expectCode(
      () => validate(fixture, path.join(fixture.root, 'intake.json')),
      'LFEA_WP3_RUNTIME_INTAKE_REQUEST_MISMATCH',
    );
  } finally {
    cleanup(fixture);
  }
});

await test('WP3-P6E-07', 'Release-manifest candidate mismatch fails closed', () => {
  const fixture = buildFixture('manifest-head');
  try {
    fixture.manifest.exactHead = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    writeJson(path.join(fixture.bundleRoot, MANIFEST_PATH), fixture.manifest);
    expectCode(
      () => validate(fixture, path.join(fixture.root, 'intake.json')),
      'LFEA_WP3_RUNTIME_INTAKE_RELEASE_MANIFEST_INVALID',
    );
  } finally {
    cleanup(fixture);
  }
});

await test('WP3-P6E-08', 'Existing intake output is never overwritten', () => {
  const fixture = buildFixture('existing-output');
  try {
    const output = path.join(fixture.root, 'intake.json');
    fs.writeFileSync(output, 'existing\n');
    expectCode(
      () => validate(fixture, output),
      'LFEA_WP3_RUNTIME_INTAKE_OUTPUT_EXISTS',
    );
    assert.equal(fs.readFileSync(output, 'utf8'), 'existing\n');
  } finally {
    cleanup(fixture);
  }
});

console.log(JSON.stringify({
  schema: 'lfea-piping-wp3-runtime-bundle-intake-check-result/v1',
  status: 'PASS',
  executedEngineeringCommands: false,
  projectEvidenceEligible: false,
  releaseQualified: false,
}));

function buildFixture(label) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `lfea-wp3-p6e-${label}-`));
  const repositoryRoot = path.join(root, 'repository');
  const bundleRoot = path.join(root, 'bundle-root');
  fs.mkdirSync(repositoryRoot, { recursive: true });
  fs.mkdirSync(bundleRoot, { recursive: true });

  const authority = {
    candidate: {
      sha: PHASE6I_FROZEN_CANDIDATE,
      ref: PHASE6I_IMMUTABLE_REF,
    },
    semanticHash: 'fnv1a64:1111111111111111',
    evidenceHash: 'fnv1a64:2222222222222222',
  };
  const request = {
    schema: 'lfea-piping-external-materialization-request/v2',
    packageId: 'PROJECT-QUALIFICATION-PACKAGE-001',
    exactHead: PHASE6I_FROZEN_CANDIDATE,
    projectAuthorityIndex: 'records/project-authority-index.json',
    records: {
      applicationResult: 'records/application-result.json',
      presentation: 'records/presentation.json',
      realModelReconciliation: 'records/real-model-reconciliation.json',
      commercialCorroboration: 'records/commercial-corroboration.json',
      performanceEvidence: 'records/performance-evidence.json',
      rollbackEvidence: 'records/rollback-evidence.json',
      reviewDisposition: 'records/signed-disposition.json',
    },
  };
  const handoff = sealPhase6iExternalEvidenceHandoff({
    schema: 'lfea-piping-phase6i-external-evidence-handoff/v1',
    candidateSha: PHASE6I_FROZEN_CANDIDATE,
    candidateRef: PHASE6I_IMMUTABLE_REF,
    wp2Status: 'WP2_COMPLETE',
    wp3Status: 'WP3_COMPLETE',
    g8G9Independence: 'CONFIRMED',
    sourceRunId: SOURCE_RUN_ID,
    sourceArtifactName: SOURCE_ARTIFACT_NAME,
    requestPath: 'request/external-materialization-request.json',
    recordCount: 7,
    unresolvedAuthorities: [],
    projectAuthorityIndexSemanticHash: authority.semanticHash,
    projectAuthorityIndexEvidenceHash: authority.evidenceHash,
    requestContentHash: semanticHash(request),
    releaseQualified: false,
    semanticHash: '',
    evidenceHash: '',
  });
  const acceptance = compilePhase6iExternalEvidenceHandoffAcceptance({
    handoff,
    sourceHandoffPath: HANDOFF_PATH,
    sourceRequestPath: REQUEST_PATH,
    projectAuthorityIndexPath: AUTHORITY_PATH,
  });
  const externalPackage = {
    packageId: request.packageId,
    exactHead: PHASE6I_FROZEN_CANDIDATE,
    projectAuthorityIndex: authority,
    semanticHash: 'fnv1a64:3333333333333333',
    evidenceHash: 'fnv1a64:4444444444444444',
  };
  const boundPackage = {
    packageId: request.packageId,
    exactHead: PHASE6I_FROZEN_CANDIDATE,
    externalPackage,
    projectAuthorityIndexArtifact: {
      path: AUTHORITY_PATH,
      contentHash: semanticHash(authority),
      recordSemanticHash: authority.semanticHash,
      recordEvidenceHash: authority.evidenceHash,
    },
    semanticHash: 'fnv1a64:5555555555555555',
    evidenceHash: 'fnv1a64:6666666666666666',
  };
  const internalManifest = {
    schema: 'lfea-piping-exact-head-manifest/v1',
    exactHead: PHASE6I_FROZEN_CANDIDATE,
    semanticHash: 'fnv1a64:7777777777777777',
    evidenceHash: 'fnv1a64:8888888888888888',
  };
  const manifest = {
    schema: 'lfea-piping-release-evidence/v1',
    programDisposition: 'QUALIFIED',
    exactHead: PHASE6I_FROZEN_CANDIDATE,
    artifacts: { externalQualificationPackage: PACKAGE_PATH },
  };
  const summary = {
    schema: 'lfea-piping-wp3-runtime-bundle-assembly/v1',
    status: 'ELIGIBLE_FOR_RELEASE_CERTIFICATION',
    exactHead: PHASE6I_FROZEN_CANDIDATE,
    manifestPath: MANIFEST_PATH,
    internalManifestPath: INTERNAL_PATH,
    externalPackagePath: PACKAGE_PATH,
    projectAuthorityIndexPath: AUTHORITY_PATH,
    projectAuthorityBoundPackagePath: BOUND_PATH,
    sourceHandoffPath: HANDOFF_PATH,
    sourceMaterializationRequestPath: REQUEST_PATH,
    sourceHandoffAcceptancePath: ACCEPTANCE_PATH,
    sourceRunId: SOURCE_RUN_ID,
    sourceArtifactName: SOURCE_ARTIFACT_NAME,
    copiedFileCount: 17,
    verifiedGateCount: 11,
    internalManifestSemanticHash: internalManifest.semanticHash,
    internalManifestEvidenceHash: internalManifest.evidenceHash,
    externalPackageSemanticHash: externalPackage.semanticHash,
    externalPackageEvidenceHash: externalPackage.evidenceHash,
    projectAuthorityIndexSemanticHash: authority.semanticHash,
    projectAuthorityIndexEvidenceHash: authority.evidenceHash,
    projectAuthorityBoundPackageSemanticHash: boundPackage.semanticHash,
    projectAuthorityBoundPackageEvidenceHash: boundPackage.evidenceHash,
    sourceRequestContentHash: semanticHash(request),
    sourceHandoffContentHash: semanticHash(handoff),
    sourceHandoffSemanticHash: handoff.semanticHash,
    sourceHandoffEvidenceHash: handoff.evidenceHash,
    sourceHandoffAcceptanceContentHash: semanticHash(acceptance),
    sourceHandoffAcceptanceSemanticHash: acceptance.semanticHash,
    sourceHandoffAcceptanceEvidenceHash: acceptance.evidenceHash,
  };

  writeJson(path.join(bundleRoot, MANIFEST_PATH), manifest);
  writeJson(path.join(bundleRoot, SUMMARY_PATH), summary);
  writeJson(path.join(bundleRoot, INTERNAL_PATH), internalManifest);
  writeJson(path.join(bundleRoot, PACKAGE_PATH), externalPackage);
  writeJson(path.join(bundleRoot, BOUND_PATH), boundPackage);
  writeJson(path.join(bundleRoot, AUTHORITY_PATH), authority);
  writeJson(path.join(bundleRoot, HANDOFF_PATH), handoff);
  writeJson(path.join(bundleRoot, REQUEST_PATH), request);
  writeJson(path.join(bundleRoot, ACCEPTANCE_PATH), acceptance);
  return {
    root,
    repositoryRoot,
    bundleRoot,
    authority,
    request,
    handoff,
    acceptance,
    externalPackage,
    boundPackage,
    internalManifest,
    manifest,
    summary,
  };
}

function validate(fixture, outputPath) {
  return validateWp3RuntimeReleaseBundle({
    repositoryRoot: fixture.repositoryRoot,
    evidenceRoot: fixture.bundleRoot,
    manifestPath: MANIFEST_PATH,
    summaryPath: SUMMARY_PATH,
    outputPath,
    expectedHead: PHASE6I_FROZEN_CANDIDATE,
    externalPackageValidator: (record) => record,
    boundPackageValidator: (record) => record,
  });
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function cleanup(fixture) {
  fs.rmSync(fixture.root, { recursive: true, force: true });
}

function hasCode(code) {
  return (error) => error?.code === code;
}

function expectCode(body, code) {
  assert.throws(body, hasCode(code));
}

async function test(id, name, body) {
  await body();
  console.log(`${id} PASS ${name}`);
}
