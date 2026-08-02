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
  PROJECT_AUTHORITY_BOUND_PACKAGE_REQUEST_SCHEMA,
  compileProjectAuthorityBoundExternalPackage,
  requireProjectAuthorityBoundExternalPackage,
} from '../src/core/linear-piping-project-qualification/project-authority-bound-external-package.js';
import {
  PHASE6I_FROZEN_CANDIDATE,
  PHASE6I_IMMUTABLE_REF,
  PROJECT_AUTHORITY_GROUP_IDS,
  buildProjectAuthorityIndex,
} from '../src/core/linear-piping-project-qualification/project-authority-index.js';
import {
  bindProjectAuthorityEvidence,
  parseProjectAuthorityBindingInvocation,
} from './lfea-piping-phase6h-project-authority-binder.mjs';

console.log('[SIMULATED][INELIGIBLE_FOR_PROJECT_EVIDENCE][NO_ENGINEERING_COMMAND_EXECUTION]');

const PACKAGE_PATH = 'external/external-qualification-package.json';
const AUTHORITY_PATH = 'external/project-authority-index.json';
const BOUND_PATH = 'external/project-authority-bound-package.json';

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

const parsed = parseProjectAuthorityBindingInvocation([
  '--root=/tmp/evidence',
  `--package=${PACKAGE_PATH}`,
  `--authority-index=${AUTHORITY_PATH}`,
  `--output=${BOUND_PATH}`,
  `--exact-head=${PHASE6I_FROZEN_CANDIDATE}`,
]);
assert.equal(parsed.packagePath, PACKAGE_PATH);
assert.equal(parsed.authorityIndexPath, AUTHORITY_PATH);
assert.equal(parsed.outputPath, BOUND_PATH);

const authority = approvedAuthority();
const externalPackage = syntheticExternalPackage(authority);
const projectAuthorityIndexArtifact = artifact(AUTHORITY_PATH, authority);
const packageValue = compileProjectAuthorityBoundExternalPackage({
  schema: PROJECT_AUTHORITY_BOUND_PACKAGE_REQUEST_SCHEMA,
  externalPackage,
  projectAuthorityIndexArtifact,
}, { packageValidator: identity });

test('WP2-P6H-01', 'Approved candidate-bound package compiles deterministically', () => {
  assert.equal(packageValue.status, 'ELIGIBLE_FOR_PHASE6G_ASSEMBLY');
  assert.equal(packageValue.exactHead, PHASE6I_FROZEN_CANDIDATE);
  assert.equal(packageValue.projectAuthorityIndexArtifact.path, AUTHORITY_PATH);
  assert.equal(
    requireProjectAuthorityBoundExternalPackage(
      packageValue,
      { packageValidator: identity },
    ).semanticHash,
    packageValue.semanticHash,
  );
});

test('WP2-P6H-02', 'Package head must equal the approved WP2 candidate', () => {
  const stale = syntheticExternalPackage(authority, {
    exactHead: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  });
  expectCode(
    () => compileProjectAuthorityBoundExternalPackage({
      schema: PROJECT_AUTHORITY_BOUND_PACKAGE_REQUEST_SCHEMA,
      externalPackage: stale,
      projectAuthorityIndexArtifact,
    }, { packageValidator: identity }),
    'PIPING_PROJECT_AUTHORITY_HEAD_MISMATCH',
  );
});

test('WP2-P6H-03', 'Retained authority artifact must bind exact record hashes', () => {
  const tampered = structuredClone(projectAuthorityIndexArtifact);
  tampered.contentHash = 'fnv1a64:0000000000000000';
  expectCode(
    () => compileProjectAuthorityBoundExternalPackage({
      schema: PROJECT_AUTHORITY_BOUND_PACKAGE_REQUEST_SCHEMA,
      externalPackage,
      projectAuthorityIndexArtifact: tampered,
    }, { packageValidator: identity }),
    'PIPING_PROJECT_AUTHORITY_ARTIFACT_MISMATCH',
  );
});

test('WP2-P6H-04', 'Authority artifact path cannot alias other external evidence', () => {
  const duplicate = artifact(
    externalPackage.artifactReferences.realModelReconciliation.path,
    authority,
  );
  expectCode(
    () => compileProjectAuthorityBoundExternalPackage({
      schema: PROJECT_AUTHORITY_BOUND_PACKAGE_REQUEST_SCHEMA,
      externalPackage,
      projectAuthorityIndexArtifact: duplicate,
    }, { packageValidator: identity }),
    'PIPING_PROJECT_AUTHORITY_ARTIFACT_PATH_DUPLICATE',
  );
});

test('WP2-P6H-05', 'Tampered binding hashes are rejected', () => {
  const tampered = structuredClone(packageValue);
  tampered.evidenceHash = 'fnv1a64:0000000000000000';
  expectCode(
    () => requireProjectAuthorityBoundExternalPackage(
      tampered,
      { packageValidator: identity },
    ),
    'PIPING_PROJECT_AUTHORITY_PACKAGE_HASH_MISMATCH',
  );
});

test('WP2-P6H-06', 'Materialized files are compared and retained before binding', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lfea-wp2-p6h-'));
  try {
    const repositoryRoot = path.join(temp, 'repository');
    const root = path.join(temp, 'evidence');
    fs.mkdirSync(repositoryRoot, { recursive: true });
    writeJson(path.join(root, PACKAGE_PATH), externalPackage);
    writeJson(path.join(root, AUTHORITY_PATH), authority);
    const summary = bindProjectAuthorityEvidence({
      repositoryRoot,
      root,
      packagePath: PACKAGE_PATH,
      authorityIndexPath: AUTHORITY_PATH,
      outputPath: BOUND_PATH,
      expectedHead: PHASE6I_FROZEN_CANDIDATE,
      packageValidator: identity,
    });
    assert.equal(summary.status, 'ELIGIBLE_FOR_PHASE6G_ASSEMBLY');
    assert.equal(fs.existsSync(path.join(root, BOUND_PATH)), true);
    assert.equal(
      fs.existsSync(path.join(root, 'external/project-authority-binding-summary.json')),
      true,
    );
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('WP2-P6H-07', 'Different retained authority bytes fail closed', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lfea-wp2-mismatch-'));
  try {
    const repositoryRoot = path.join(temp, 'repository');
    const root = path.join(temp, 'evidence');
    fs.mkdirSync(repositoryRoot, { recursive: true });
    writeJson(path.join(root, PACKAGE_PATH), externalPackage);
    const changed = structuredClone(authority);
    changed.evidenceHash = 'fnv1a64:0000000000000000';
    writeJson(path.join(root, AUTHORITY_PATH), changed);
    expectCode(
      () => bindProjectAuthorityEvidence({
        repositoryRoot,
        root,
        packagePath: PACKAGE_PATH,
        authorityIndexPath: AUTHORITY_PATH,
        outputPath: BOUND_PATH,
        expectedHead: PHASE6I_FROZEN_CANDIDATE,
        packageValidator: identity,
        authorityValidator: identity,
      }),
      'LFEA_PHASE6H_WP2_BINDING_AUTHORITY_RECORD_MISMATCH',
    );
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

console.log(JSON.stringify({
  schema: 'lfea-piping-phase6h-project-authority-binding-check-result/v1',
  status: 'PASS',
  executedEngineeringCommands: false,
  projectEvidenceEligible: false,
  releaseQualified: false,
}));

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

function syntheticExternalPackage(projectAuthorityIndex, overrides = {}) {
  return Object.freeze({
    schema: 'linear-piping-external-qualification-package/v2',
    packageId: 'EXTERNAL-QUALIFICATION-PACKAGE-001',
    exactHead: PHASE6I_FROZEN_CANDIDATE,
    projectAuthorityIndex,
    artifactReferences: Object.freeze({
      realModelReconciliation: syntheticArtifact('external/real-model-reconciliation.json', 1),
      commercialCorroboration: syntheticArtifact('external/commercial-corroboration.json', 2),
      performanceEvidence: syntheticArtifact('external/performance-evidence.json', 3),
      rollbackEvidence: syntheticArtifact('external/rollback-evidence.json', 4),
      signedDisposition: syntheticArtifact('external/signed-disposition.json', 5),
    }),
    status: 'ELIGIBLE_FOR_RELEASE_REVIEW',
    semanticHash: 'fnv1a64:bbbbbbbbbbbbbbbb',
    evidenceHash: 'fnv1a64:cccccccccccccccc',
    ...overrides,
  });
}

function syntheticArtifact(relativePath, index) {
  return Object.freeze({
    schema: EVIDENCE_ARTIFACT_REFERENCE_SCHEMA,
    path: relativePath,
    mediaType: 'application/json',
    contentHash: `fnv1a64:${String(index).repeat(16)}`,
    recordSemanticHash: `fnv1a64:${String(index + 1).repeat(16)}`,
    recordEvidenceHash: `fnv1a64:${String(index + 2).repeat(16)}`,
  });
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

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}
