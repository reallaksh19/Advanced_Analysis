#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { semanticHash } from '../src/core/shared-piping-model/canonical-json.js';
import {
  EVIDENCE_ARTIFACT_REFERENCE_SCHEMA,
} from '../src/core/linear-piping-project-qualification/index.js';
import {
  PHASE6I_FROZEN_CANDIDATE,
  PHASE6I_IMMUTABLE_REF,
  PROJECT_AUTHORITY_GROUP_IDS,
  buildProjectAuthorityIndex,
} from '../src/core/linear-piping-project-qualification/project-authority-index.js';
import {
  assembleWp2RuntimeReleaseBundle,
  parseWp2RuntimeBundleAssemblyInvocation,
} from './lfea-piping-wp2-runtime-bundle-assembler.mjs';

console.log('[SIMULATED][INELIGIBLE_FOR_PROJECT_EVIDENCE][NO_ENGINEERING_COMMAND_EXECUTION]');

const BOUND_PATH = 'external/project-authority-bound-package.json';
const AUTHORITY_PATH = 'external/project-authority-index.json';

function test(id, name, body) {
  return Promise.resolve().then(body).then(() => {
    console.log(`${id} PASS ${name}`);
  });
}

function expectCode(body, code) {
  return assert.rejects(body, (error) => {
    assert.equal(error?.code, code, `expected ${code}, received ${error?.code}`);
    return true;
  });
}

const parsed = parseWp2RuntimeBundleAssemblyInvocation([
  '--internal-root=/tmp/internal',
  '--external-root=/tmp/external',
  `--bound-package=${BOUND_PATH}`,
  '--output=/tmp/output',
  `--exact-head=${PHASE6I_FROZEN_CANDIDATE}`,
]);
assert.equal(parsed.boundPackagePath, BOUND_PATH);

await test('WP2-P6G-01', 'Bound package and retained authority enter runtime bundle', async () => {
  const temp = fixture('success');
  try {
    const output = path.join(temp.root, 'output');
    const summary = await assemble(temp, output);
    assert.equal(summary.status, 'ELIGIBLE_FOR_RELEASE_CERTIFICATION');
    assert.equal(summary.projectAuthorityBoundPackagePath, BOUND_PATH);
    assert.equal(summary.projectAuthorityIndexPath, AUTHORITY_PATH);
    assert.equal(summary.copiedFileCount, 14);
    const manifest = readJson(path.join(output, 'release-evidence.json'));
    assert.deepEqual(Object.keys(manifest.artifacts), ['externalQualificationPackage']);
    assert.equal(
      manifest.artifacts.externalQualificationPackage,
      'external/external-qualification-package.json',
    );
    assert.deepEqual(
      readJson(path.join(output, AUTHORITY_PATH)),
      temp.authority,
    );
    assert.deepEqual(
      readJson(path.join(output, BOUND_PATH)),
      temp.boundPackage,
    );
  } finally {
    fs.rmSync(temp.root, { recursive: true, force: true });
  }
});

await test('WP2-P6G-02', 'Bound package head mismatch fails before assembly', async () => {
  const temp = fixture('head-mismatch');
  try {
    temp.boundPackage.exactHead = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    writeJson(path.join(temp.externalRoot, BOUND_PATH), temp.boundPackage, false);
    await expectCode(
      () => assemble(temp, path.join(temp.root, 'output')),
      'LFEA_WP2_RUNTIME_BUNDLE_INPUT_HEAD_MISMATCH',
    );
  } finally {
    fs.rmSync(temp.root, { recursive: true, force: true });
  }
});

await test('WP2-P6G-03', 'Retained authority tampering fails closed', async () => {
  const temp = fixture('authority-tamper');
  try {
    const tampered = structuredClone(temp.authority);
    tampered.evidenceHash = 'fnv1a64:0000000000000000';
    writeJson(path.join(temp.externalRoot, AUTHORITY_PATH), tampered, false);
    await expectCode(
      () => assemble(temp, path.join(temp.root, 'output')),
      'LFEA_WP2_RUNTIME_BUNDLE_AUTHORITY_ARTIFACT_MISMATCH',
    );
  } finally {
    fs.rmSync(temp.root, { recursive: true, force: true });
  }
});

await test('WP2-P6G-04', 'Bound package path collision is rejected', async () => {
  const temp = fixture('collision');
  try {
    temp.boundPackage.projectAuthorityIndexArtifact.path =
      temp.boundPackage.externalPackage.artifactReferences.realModelReconciliation.path;
    writeJson(path.join(temp.externalRoot, BOUND_PATH), temp.boundPackage, false);
    await expectCode(
      () => assemble(temp, path.join(temp.root, 'output')),
      'LFEA_WP2_RUNTIME_BUNDLE_PATH_COLLISION',
    );
  } finally {
    fs.rmSync(temp.root, { recursive: true, force: true });
  }
});

await test('WP2-P6G-05', 'Existing output is never overwritten', async () => {
  const temp = fixture('existing');
  try {
    const output = path.join(temp.root, 'output');
    fs.mkdirSync(output);
    await expectCode(
      () => assemble(temp, output),
      'LFEA_WP2_RUNTIME_BUNDLE_OUTPUT_EXISTS',
    );
  } finally {
    fs.rmSync(temp.root, { recursive: true, force: true });
  }
});

console.log(JSON.stringify({
  schema: 'lfea-piping-wp2-runtime-bundle-assembler-check-result/v1',
  status: 'PASS',
  executedEngineeringCommands: false,
  projectEvidenceEligible: false,
  releaseQualified: false,
}));

function fixture(label) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `lfea-wp2-p6g-${label}-`));
  const repositoryRoot = path.join(root, 'repository');
  const internalRoot = path.join(root, 'internal');
  const externalRoot = path.join(root, 'external-source');
  fs.mkdirSync(repositoryRoot, { recursive: true });
  fs.mkdirSync(internalRoot, { recursive: true });
  fs.mkdirSync(externalRoot, { recursive: true });
  const authority = approvedAuthority();
  const externalPackage = syntheticExternalPackage(authority);
  const boundPackage = {
    schema: 'linear-piping-project-authority-bound-external-package/v1',
    packageId: externalPackage.packageId,
    exactHead: PHASE6I_FROZEN_CANDIDATE,
    externalPackage,
    projectAuthorityIndexArtifact: artifact(AUTHORITY_PATH, authority),
    status: 'ELIGIBLE_FOR_PHASE6G_ASSEMBLY',
    semanticHash: 'fnv1a64:dddddddddddddddd',
    evidenceHash: 'fnv1a64:eeeeeeeeeeeeeeee',
  };
  writeJson(path.join(externalRoot, AUTHORITY_PATH), authority);
  for (const reference of Object.values(externalPackage.artifactReferences)) {
    writeJson(path.join(externalRoot, reference.path), {
      semanticHash: reference.recordSemanticHash,
      evidenceHash: reference.recordEvidenceHash,
      recordId: reference.path,
    });
  }
  writeJson(path.join(externalRoot, BOUND_PATH), boundPackage);
  return {
    root,
    repositoryRoot,
    internalRoot,
    externalRoot,
    authority,
    externalPackage,
    boundPackage,
  };
}

async function assemble(input, outputRoot) {
  return assembleWp2RuntimeReleaseBundle({
    repositoryRoot: input.repositoryRoot,
    internalRoot: input.internalRoot,
    externalRoot: input.externalRoot,
    boundPackagePath: BOUND_PATH,
    outputRoot,
    exactHead: PHASE6I_FROZEN_CANDIDATE,
    boundPackageValidator: identity,
    baseAssembler: syntheticBaseAssembler,
  });
}

async function syntheticBaseAssembler({
  externalRoot,
  externalPackagePath,
  outputRoot,
  exactHead,
}) {
  assert.equal(externalPackagePath, 'external/external-qualification-package.json');
  assert.equal(fs.existsSync(path.join(externalRoot, externalPackagePath)), true);
  fs.mkdirSync(path.join(outputRoot, 'bundle'), { recursive: true });
  writeJson(path.join(outputRoot, 'release-evidence.json'), {
    schema: 'lfea-piping-release-evidence/v1',
    program: 'PRIORITY_2_LINEAR_PIPING_FEA_APPLICATION_CHAIN',
    programDisposition: 'QUALIFIED',
    exactHead,
    gates: { G0_EXACT_HEAD: 'VERIFIED' },
    artifacts: { externalQualificationPackage: externalPackagePath },
  });
  const summary = {
    schema: 'lfea-piping-runtime-bundle-assembly/v1',
    status: 'ELIGIBLE_FOR_RELEASE_CERTIFICATION',
    exactHead,
    manifestPath: 'release-evidence.json',
    internalManifestPath: 'internal/exact-head-manifest.json',
    externalPackagePath,
    copiedFileCount: 12,
    verifiedGateCount: 11,
    internalManifestSemanticHash: 'fnv1a64:1111111111111111',
    internalManifestEvidenceHash: 'fnv1a64:2222222222222222',
    externalPackageSemanticHash: 'fnv1a64:3333333333333333',
    externalPackageEvidenceHash: 'fnv1a64:4444444444444444',
  };
  writeJson(path.join(outputRoot, 'bundle/assembly-summary.json'), summary);
  return summary;
}

function approvedAuthority() {
  return buildProjectAuthorityIndex({
    repository: 'reallaksh19/Advanced_Analysis',
    candidate: {
      sha: PHASE6I_FROZEN_CANDIDATE,
      ref: PHASE6I_IMMUTABLE_REF,
    },
    indexId: 'WP2-PROJECT-AUTHORITY-INDEX',
    revision: 'REV-1',
    preparedAtUtc: '2026-08-02T13:30:00Z',
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
      approvalStatus: 'APPROVED',
    })),
    engineeringApproval: {
      status: 'APPROVED',
      approverName: 'RESPONSIBLE-PIPING-AUTHORITY',
      approverRole: 'LEAD-PIPING-STRESS-ENGINEER',
      organization: 'PROJECT-ENGINEERING',
      approvedAtUtc: '2026-08-02T13:31:00Z',
      evidenceReference: 'records/wp2/engineering-approval.json',
      evidenceHash: 'fnv1a64:aaaaaaaaaaaaaaaa',
    },
  });
}

function syntheticExternalPackage(projectAuthorityIndex) {
  return {
    schema: 'linear-piping-external-qualification-package/v2',
    packageId: 'EXTERNAL-QUALIFICATION-PACKAGE-001',
    exactHead: PHASE6I_FROZEN_CANDIDATE,
    projectAuthorityIndex,
    artifactReferences: {
      realModelReconciliation: syntheticArtifact('external/real-model-reconciliation.json', 1),
      commercialCorroboration: syntheticArtifact('external/commercial-corroboration.json', 2),
      performanceEvidence: syntheticArtifact('external/performance-evidence.json', 3),
      rollbackEvidence: syntheticArtifact('external/rollback-evidence.json', 4),
      signedDisposition: syntheticArtifact('external/signed-disposition.json', 5),
    },
    status: 'ELIGIBLE_FOR_RELEASE_REVIEW',
    semanticHash: 'fnv1a64:bbbbbbbbbbbbbbbb',
    evidenceHash: 'fnv1a64:cccccccccccccccc',
  };
}

function syntheticArtifact(relativePath, index) {
  const record = {
    semanticHash: `fnv1a64:${String(index + 1).repeat(16)}`,
    evidenceHash: `fnv1a64:${String(index + 2).repeat(16)}`,
    recordId: relativePath,
  };
  return {
    schema: EVIDENCE_ARTIFACT_REFERENCE_SCHEMA,
    path: relativePath,
    mediaType: 'application/json',
    contentHash: semanticHash(record),
    recordSemanticHash: record.semanticHash,
    recordEvidenceHash: record.evidenceHash,
  };
}

function artifact(relativePath, record) {
  return {
    schema: EVIDENCE_ARTIFACT_REFERENCE_SCHEMA,
    path: relativePath,
    mediaType: 'application/json',
    contentHash: semanticHash(record),
    recordSemanticHash: record.semanticHash,
    recordEvidenceHash: record.evidenceHash,
  };
}

function identity(value) {
  return value;
}

function writeJson(filePath, value, exclusive = true) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(
    filePath,
    `${JSON.stringify(value, null, 2)}\n`,
    exclusive ? { flag: 'wx' } : undefined,
  );
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}
