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
  assembleWp3RuntimeReleaseBundle,
  parseWp3RuntimeBundleAssemblyInvocation,
} from './lfea-piping-wp3-runtime-bundle-assembler.mjs';

console.log('[SIMULATED][INELIGIBLE_FOR_PROJECT_EVIDENCE][NO_ENGINEERING_COMMAND_EXECUTION]');

const BOUND_PATH = 'external/project-authority-bound-package.json';
const AUTHORITY_PATH = 'external/project-authority-index.json';
const HANDOFF_PATH = 'external/source-handoff.json';
const REQUEST_PATH = 'external/source-materialization-request.json';
const ACCEPTANCE_PATH = 'external/source-handoff-acceptance.json';
const SOURCE_RUN_ID = '30750000001';
const SOURCE_ARTIFACT_NAME = 'lfea-piping-wp3-source-617f7c2';

const parsed = parseWp3RuntimeBundleAssemblyInvocation([
  '--internal-root=/tmp/internal',
  '--external-root=/tmp/external',
  `--bound-package=${BOUND_PATH}`,
  `--handoff=${HANDOFF_PATH}`,
  `--source-request=${REQUEST_PATH}`,
  `--handoff-acceptance=${ACCEPTANCE_PATH}`,
  '--output=/tmp/output',
  `--exact-head=${PHASE6I_FROZEN_CANDIDATE}`,
]);
assert.equal(parsed.handoffPath, HANDOFF_PATH);
assert.equal(parsed.sourceRequestPath, REQUEST_PATH);
assert.throws(
  () => parseWp3RuntimeBundleAssemblyInvocation(['--output=/tmp/out']),
  hasCode('LFEA_WP3_RUNTIME_BUNDLE_OPTIONS_MISSING'),
);

await test('WP3-P6G-01', 'WP3 custody enters the runtime bundle', async () => {
  const fixture = buildFixture('success');
  try {
    const output = path.join(fixture.root, 'output');
    const summary = await assemble(fixture, output);
    assert.equal(summary.schema, 'lfea-piping-wp3-runtime-bundle-assembly/v1');
    assert.equal(summary.status, 'ELIGIBLE_FOR_RELEASE_CERTIFICATION');
    assert.equal(summary.sourceHandoffPath, HANDOFF_PATH);
    assert.equal(summary.sourceMaterializationRequestPath, REQUEST_PATH);
    assert.equal(summary.sourceHandoffAcceptancePath, ACCEPTANCE_PATH);
    assert.equal(summary.sourceRunId, SOURCE_RUN_ID);
    assert.equal(summary.sourceArtifactName, SOURCE_ARTIFACT_NAME);
    assert.equal(summary.copiedFileCount, 17);
    assert.deepEqual(readJson(path.join(output, HANDOFF_PATH)), fixture.handoff);
    assert.deepEqual(readJson(path.join(output, REQUEST_PATH)), fixture.request);
    assert.deepEqual(readJson(path.join(output, ACCEPTANCE_PATH)), fixture.acceptance);
    const manifest = readJson(path.join(output, 'release-evidence.json'));
    assert.deepEqual(Object.keys(manifest.artifacts), ['externalQualificationPackage']);
  } finally {
    cleanup(fixture);
  }
});

await test('WP3-P6G-02', 'Retained request tampering fails closed', async () => {
  const fixture = buildFixture('request-tamper');
  try {
    fixture.request.packageId = 'CHANGED-PACKAGE';
    writeJson(path.join(fixture.externalRoot, REQUEST_PATH), fixture.request);
    await expectCode(
      () => assemble(fixture, path.join(fixture.root, 'output')),
      'LFEA_WP3_RUNTIME_BUNDLE_REQUEST_CONTENT_MISMATCH',
    );
  } finally {
    cleanup(fixture);
  }
});

await test('WP3-P6G-03', 'Retained handoff tampering fails closed', async () => {
  const fixture = buildFixture('handoff-tamper');
  try {
    const tampered = structuredClone(fixture.handoff);
    tampered.sourceArtifactName = 'changed-source-artifact';
    writeJson(path.join(fixture.externalRoot, HANDOFF_PATH), tampered);
    await expectCode(
      () => assemble(fixture, path.join(fixture.root, 'output')),
      'LFEA_WP3_HANDOFF_HASH_MISMATCH',
    );
  } finally {
    cleanup(fixture);
  }
});

await test('WP3-P6G-04', 'WP3 and WP2 authority identities cannot diverge', async () => {
  const fixture = buildFixture('authority-mismatch');
  try {
    fixture.boundPackage.externalPackage.projectAuthorityIndex.evidenceHash =
      'fnv1a64:ffffffffffffffff';
    writeJson(path.join(fixture.externalRoot, BOUND_PATH), fixture.boundPackage);
    await expectCode(
      () => assemble(fixture, path.join(fixture.root, 'output')),
      'LFEA_WP3_RUNTIME_BUNDLE_AUTHORITY_IDENTITY_MISMATCH',
    );
  } finally {
    cleanup(fixture);
  }
});

await test('WP3-P6G-05', 'Custody path collision is rejected', async () => {
  const fixture = buildFixture('collision');
  try {
    const changed = structuredClone(fixture.acceptance);
    changed.sourceRequestPath = HANDOFF_PATH;
    writeJson(path.join(fixture.externalRoot, ACCEPTANCE_PATH), changed);
    await expectCode(
      () => assemble(fixture, path.join(fixture.root, 'output')),
      'LFEA_WP3_HANDOFF_ACCEPTANCE_PATH_DUPLICATE',
    );
  } finally {
    cleanup(fixture);
  }
});

await test('WP3-P6G-06', 'Existing output is never overwritten', async () => {
  const fixture = buildFixture('existing-output');
  try {
    const output = path.join(fixture.root, 'output');
    fs.mkdirSync(output);
    await expectCode(
      () => assemble(fixture, output),
      'LFEA_WP3_RUNTIME_BUNDLE_OUTPUT_EXISTS',
    );
  } finally {
    cleanup(fixture);
  }
});

console.log(JSON.stringify({
  schema: 'lfea-piping-wp3-runtime-bundle-assembler-check-result/v1',
  status: 'PASS',
  executedEngineeringCommands: false,
  projectEvidenceEligible: false,
  releaseQualified: false,
}));

function buildFixture(label) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `lfea-wp3-p6g-${label}-`));
  const repositoryRoot = path.join(root, 'repository');
  const internalRoot = path.join(root, 'internal');
  const externalRoot = path.join(root, 'external');
  fs.mkdirSync(repositoryRoot, { recursive: true });
  fs.mkdirSync(internalRoot, { recursive: true });
  fs.mkdirSync(externalRoot, { recursive: true });

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
  const boundPackage = {
    schema: 'linear-piping-project-authority-bound-external-package/v1',
    packageId: request.packageId,
    exactHead: PHASE6I_FROZEN_CANDIDATE,
    externalPackage: {
      projectAuthorityIndex: authority,
      artifactReferences: {
        realModelReconciliation: { path: 'external/real-model-reconciliation.json' },
        commercialCorroboration: { path: 'external/commercial-corroboration.json' },
        performanceEvidence: { path: 'external/performance-evidence.json' },
        rollbackEvidence: { path: 'external/rollback-evidence.json' },
        signedDisposition: { path: 'external/signed-disposition.json' },
      },
      semanticHash: 'fnv1a64:3333333333333333',
      evidenceHash: 'fnv1a64:4444444444444444',
    },
    projectAuthorityIndexArtifact: {
      path: AUTHORITY_PATH,
    },
    semanticHash: 'fnv1a64:5555555555555555',
    evidenceHash: 'fnv1a64:6666666666666666',
  };
  writeJson(path.join(externalRoot, BOUND_PATH), boundPackage);
  writeJson(path.join(externalRoot, AUTHORITY_PATH), authority);
  writeJson(path.join(externalRoot, HANDOFF_PATH), handoff);
  writeJson(path.join(externalRoot, REQUEST_PATH), request);
  writeJson(path.join(externalRoot, ACCEPTANCE_PATH), acceptance);
  for (const reference of Object.values(boundPackage.externalPackage.artifactReferences)) {
    writeJson(path.join(externalRoot, reference.path), { path: reference.path });
  }
  return {
    root,
    repositoryRoot,
    internalRoot,
    externalRoot,
    authority,
    request,
    handoff,
    acceptance,
    boundPackage,
  };
}

async function assemble(fixture, outputRoot) {
  return assembleWp3RuntimeReleaseBundle({
    repositoryRoot: fixture.repositoryRoot,
    internalRoot: fixture.internalRoot,
    externalRoot: fixture.externalRoot,
    boundPackagePath: BOUND_PATH,
    handoffPath: HANDOFF_PATH,
    sourceRequestPath: REQUEST_PATH,
    handoffAcceptancePath: ACCEPTANCE_PATH,
    outputRoot,
    exactHead: PHASE6I_FROZEN_CANDIDATE,
    boundPackageValidator: (record) => record,
    baseAssembler: syntheticWp2Assembler,
  });
}

async function syntheticWp2Assembler({ outputRoot, exactHead }) {
  fs.mkdirSync(path.join(outputRoot, 'bundle'), { recursive: true });
  writeJson(path.join(outputRoot, 'release-evidence.json'), {
    schema: 'lfea-piping-release-evidence/v1',
    programDisposition: 'QUALIFIED',
    exactHead,
    artifacts: { externalQualificationPackage: 'external/external-qualification-package.json' },
  });
  const summary = {
    schema: 'lfea-piping-wp2-runtime-bundle-assembly/v1',
    status: 'ELIGIBLE_FOR_RELEASE_CERTIFICATION',
    exactHead,
    manifestPath: 'release-evidence.json',
    internalManifestPath: 'internal/exact-head-manifest.json',
    externalPackagePath: 'external/external-qualification-package.json',
    projectAuthorityIndexPath: AUTHORITY_PATH,
    projectAuthorityBoundPackagePath: BOUND_PATH,
    copiedFileCount: 14,
    verifiedGateCount: 11,
    internalManifestSemanticHash: 'fnv1a64:7777777777777777',
    internalManifestEvidenceHash: 'fnv1a64:8888888888888888',
    externalPackageSemanticHash: 'fnv1a64:3333333333333333',
    externalPackageEvidenceHash: 'fnv1a64:4444444444444444',
    projectAuthorityIndexSemanticHash: 'fnv1a64:1111111111111111',
    projectAuthorityIndexEvidenceHash: 'fnv1a64:2222222222222222',
    projectAuthorityBoundPackageSemanticHash: 'fnv1a64:5555555555555555',
    projectAuthorityBoundPackageEvidenceHash: 'fnv1a64:6666666666666666',
  };
  writeJson(path.join(outputRoot, 'bundle/assembly-summary.json'), summary);
  return summary;
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

async function expectCode(body, code) {
  await assert.rejects(body, hasCode(code));
}

async function test(id, name, body) {
  await body();
  console.log(`${id} PASS ${name}`);
}
