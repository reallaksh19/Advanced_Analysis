#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { semanticHash } from '../src/core/shared-piping-model/canonical-json.js';
import { evaluateReleaseReadiness } from './lfea-piping-release-orchestrator.mjs';
import {
  assembleRuntimeReleaseBundle,
  parseRuntimeBundleAssemblyInvocation,
} from './lfea-piping-runtime-bundle-assembler.mjs';

console.log('[SIMULATED][INELIGIBLE_FOR_RELEASE_EVIDENCE][NO_ENGINEERING_COMMAND_EXECUTION]');

const HEAD = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const INTERNAL = Object.freeze([
  ['upstreamGateLog', 'internal/upstream-gate.log', 'text/plain'],
  ['t0GateLog', 'internal/t0-gate.log', 'text/plain'],
  ['sourceOrchestrationEvidence', 'internal/source-orchestration.json', 'application/json'],
  ['interfaceEvidence', 'internal/interface-evidence.json', 'application/json'],
  ['interfaceRecoveryEvidence', 'internal/interface-recovery.json', 'application/json'],
  ['codeAndAllowableEvidence', 'internal/code-and-allowable.json', 'application/json'],
  ['presentationExportEvidence', 'internal/presentation-export.json', 'application/json'],
]);
const EXTERNAL = Object.freeze([
  ['realModelReconciliation', 'external/real-model.json'],
  ['commercialCorroboration', 'external/commercial.json'],
  ['performanceEvidence', 'external/performance.json'],
  ['rollbackEvidence', 'external/rollback.json'],
  ['signedDisposition', 'external/signed-disposition.json'],
]);

const parsed = parseRuntimeBundleAssemblyInvocation([
  `--exact-head=${HEAD}`,
  '--internal-root=/tmp/internal',
  '--external-root=/tmp/external',
  '--external-package=external/package.json',
  '--output=/tmp/output',
]);
assert.equal(parsed.internalManifestPath, 'internal/exact-head-manifest.json');
assert.throws(
  () => parseRuntimeBundleAssemblyInvocation(['--output=/tmp/out']),
  hasCode('LFEA_RUNTIME_BUNDLE_OPTIONS_MISSING'),
);
assert.throws(
  () => parseRuntimeBundleAssemblyInvocation([
    '--exact-head=bad', '--internal-root=/tmp/i', '--external-root=/tmp/e',
    '--external-package=external/package.json', '--output=/tmp/o',
  ]),
  hasCode('LFEA_RUNTIME_BUNDLE_HEAD_INVALID'),
);

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lfea-phase6g-'));
try {
  const first = fixture(path.join(temp, 'first'));
  const bundleOne = path.join(temp, 'bundle-one');
  const summary = await assemble(first, bundleOne);
  assert.equal(summary.status, 'ELIGIBLE_FOR_RELEASE_CERTIFICATION');
  assert.equal(summary.copiedFileCount, 16);
  assert.equal(summary.verifiedGateCount, 11);
  const manifest = json(path.join(bundleOne, 'release-evidence.json'));
  assert.equal(manifest.programDisposition, 'QUALIFIED');
  assert.equal(manifest.exactHead, HEAD);
  assert.ok(Object.values(manifest.gates).every((status) => status === 'VERIFIED'));
  assert.equal(manifest.artifacts.exactHeadManifest, 'internal/exact-head-manifest.json');
  assert.equal(manifest.artifacts.externalQualificationPackage, 'external/package.json');
  assert.equal(fs.existsSync(path.join(bundleOne, 'bundle/assembly-summary.json')), true);
  assert.equal(fs.existsSync(path.join(bundleOne, 'internal/audit-baseline.runtime.json')), true);
  assert.equal(
    fs.readFileSync(path.join(bundleOne, 'external/commercial.json'), 'utf8'),
    fs.readFileSync(path.join(first.externalRoot, 'external/commercial.json'), 'utf8'),
  );

  const second = fixture(path.join(temp, 'second'));
  const bundleTwo = path.join(temp, 'bundle-two');
  await assemble(second, bundleTwo);
  assert.equal(text(bundleOne, 'release-evidence.json'), text(bundleTwo, 'release-evidence.json'));
  assert.equal(
    text(bundleOne, 'bundle/assembly-summary.json'),
    text(bundleTwo, 'bundle/assembly-summary.json'),
  );

  const mismatch = fixture(path.join(temp, 'mismatch'));
  mismatch.externalPackage.exactHead = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
  writeJson(path.join(mismatch.externalRoot, mismatch.externalPackagePath), mismatch.externalPackage);
  await rejected(mismatch, path.join(temp, 'mismatch-out'), 'LFEA_RUNTIME_BUNDLE_INPUT_HEAD_MISMATCH');

  const existing = fixture(path.join(temp, 'existing'));
  const existingOut = path.join(temp, 'existing-out');
  fs.mkdirSync(existingOut);
  await rejected(existing, existingOut, 'LFEA_RUNTIME_BUNDLE_OUTPUT_EXISTS');

  const collision = fixture(path.join(temp, 'collision'));
  collision.externalPackagePath = 'internal/exact-head-manifest.json';
  writeJson(path.join(collision.externalRoot, collision.externalPackagePath), collision.externalPackage);
  await rejected(collision, path.join(temp, 'collision-out'), 'LFEA_RUNTIME_BUNDLE_PATH_COLLISION');

  const traversal = fixture(path.join(temp, 'traversal'));
  traversal.externalPackage.artifactReferences.realModelReconciliation.path = '../escape.json';
  writeJson(path.join(traversal.externalRoot, traversal.externalPackagePath), traversal.externalPackage);
  await rejected(
    traversal,
    path.join(temp, 'traversal-out'),
    'LFEA_RUNTIME_BUNDLE_EXTERNAL_ARTIFACT_PATH_INVALID',
  );

  const stale = fixture(path.join(temp, 'stale'));
  const stalePath = path.join(stale.internalRoot, 'internal/collection-summary.json');
  const staleRecord = json(stalePath);
  staleRecord.manifestEvidenceHash = 'fnv1a64:ffffffffffffffff';
  writeJson(stalePath, staleRecord);
  await rejected(stale, path.join(temp, 'stale-out'), 'LFEA_RUNTIME_BUNDLE_COLLECTION_SUMMARY_INVALID');

  const failed = fixture(path.join(temp, 'failed'));
  const failedOut = path.join(temp, 'failed-out');
  await assert.rejects(
    () => assemble(failed, failedOut, async () => {
      const error = new Error('synthetic rejection');
      error.code = 'SYNTHETIC_RELEASE_REJECTION';
      throw error;
    }),
    hasCode('SYNTHETIC_RELEASE_REJECTION'),
  );
  assert.equal(fs.existsSync(failedOut), false);
  assert.equal(
    fs.readdirSync(temp).some((name) => name.startsWith('failed-out.staging-')),
    false,
  );
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}

console.log(JSON.stringify({
  check: 'lfea-piping-runtime-bundle-assembler',
  status: 'PASS',
  exactHead: HEAD,
  engineeringCommandsExecuted: false,
}));

async function assemble(input, outputRoot, releaseEvaluator = evaluateReleaseReadiness) {
  return assembleRuntimeReleaseBundle({
    repositoryRoot: input.repositoryRoot,
    internalRoot: input.internalRoot,
    externalRoot: input.externalRoot,
    externalPackagePath: input.externalPackagePath,
    outputRoot,
    exactHead: HEAD,
    internalManifestValidator: (record) => Object.freeze(record),
    externalPackageValidator: (record) => Object.freeze(record),
    releaseEvaluator,
    validators: {
      internal: ({ root, ledger, releaseMode }) => {
        assert.equal(releaseMode, true);
        assert.equal(fs.existsSync(path.join(root, ledger.artifacts.exactHeadManifest)), true);
        return Object.freeze({
          status: 'ELIGIBLE_FOR_RELEASE_REVIEW', releaseEligible: true,
          exactHead: ledger.exactHead, manifestSemanticHash: input.internalManifest.semanticHash,
        });
      },
      external: ({ root, ledger, releaseMode }) => {
        assert.equal(releaseMode, true);
        assert.equal(fs.existsSync(path.join(root, ledger.artifacts.externalQualificationPackage)), true);
        return Object.freeze({
          status: 'ELIGIBLE_FOR_RELEASE_REVIEW', releaseEligible: true,
          exactHead: ledger.exactHead, packageSemanticHash: input.externalPackage.semanticHash,
        });
      },
    },
  });
}

async function rejected(input, output, code) {
  await assert.rejects(() => assemble(input, output), hasCode(code));
  if (code !== 'LFEA_RUNTIME_BUNDLE_OUTPUT_EXISTS') assert.equal(fs.existsSync(output), false);
}

function fixture(root) {
  const repositoryRoot = path.join(root, 'repository');
  const internalRoot = path.join(root, 'internal-source');
  const externalRoot = path.join(root, 'external-source');
  for (const directory of [repositoryRoot, internalRoot, externalRoot]) {
    fs.mkdirSync(directory, { recursive: true });
  }
  const artifactReferences = Object.fromEntries(INTERNAL.map(([role, file, mediaType]) => {
    writeArtifact(path.join(internalRoot, file), mediaType, role);
    return [role, { path: file, mediaType, contentHash: 'fnv1a64:1111111111111111' }];
  }));
  const internalManifest = {
    schema: 'lfea-piping-exact-head-manifest/v1', exactHead: HEAD,
    semanticHash: 'fnv1a64:2222222222222222',
    evidenceHash: 'fnv1a64:3333333333333333', artifactReferences,
  };
  writeJson(path.join(internalRoot, 'internal/exact-head-manifest.json'), internalManifest);
  const baseline = {
    schema: 'lfea-piping-audit-baseline-runtime/v1',
    repository: 'reallaksh19/Advanced_Analysis', exactHeadCommit: HEAD,
    checkout: { clean: true }, evidenceStatus: 'EXACT_HEAD_BASELINE_CAPTURED',
  };
  writeJson(path.join(internalRoot, 'internal/audit-baseline.runtime.json'), baseline);
  writeJson(path.join(internalRoot, 'internal/collection-summary.json'), {
    schema: 'lfea-piping-internal-evidence-collection/v1', status: 'PASS', exactHead: HEAD,
    commandCount: 10, artifactCount: 7, manifestPath: 'internal/exact-head-manifest.json',
    auditBaselinePath: 'internal/audit-baseline.runtime.json',
    auditBaselineContentHash: semanticHash(baseline),
    manifestSemanticHash: internalManifest.semanticHash,
    manifestEvidenceHash: internalManifest.evidenceHash,
  });
  const externalReferences = Object.fromEntries(EXTERNAL.map(([role, file], index) => {
    writeJson(path.join(externalRoot, file), { role, exactHead: HEAD, index });
    return [role, { path: file }];
  }));
  const externalPackage = {
    schema: 'linear-piping-external-qualification-package/v2', exactHead: HEAD,
    status: 'ELIGIBLE_FOR_RELEASE_REVIEW',
    projectAuthorityIndex: {
      schema: 'lfea-piping-phase6i-project-authority-index/v1',
      semanticHash: 'fnv1a64:6666666666666666',
      evidenceHash: 'fnv1a64:7777777777777777',
      wp2Status: 'WP2_COMPLETE',
    },
    semanticHash: 'fnv1a64:4444444444444444',
    evidenceHash: 'fnv1a64:5555555555555555',
    artifactReferences: externalReferences,
  };
  const externalPackagePath = 'external/package.json';
  writeJson(path.join(externalRoot, externalPackagePath), externalPackage);
  return {
    repositoryRoot, internalRoot, externalRoot, externalPackagePath,
    internalManifest, externalPackage,
  };
}

function writeArtifact(filePath, mediaType, role) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  if (mediaType === 'text/plain') fs.writeFileSync(filePath, `${HEAD}\n${role}\n`);
  else writeJson(filePath, { role, exactHead: HEAD, status: 'PASS' });
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}
function json(filePath) { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }
function text(root, relative) { return fs.readFileSync(path.join(root, relative), 'utf8'); }
function hasCode(code) { return (error) => error?.code === code; }
