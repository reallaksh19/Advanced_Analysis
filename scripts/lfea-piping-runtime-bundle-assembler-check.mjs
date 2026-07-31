#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  semanticHash,
} from '../src/core/shared-piping-model/canonical-json.js';
import { evaluateReleaseReadiness } from './lfea-piping-release-orchestrator.mjs';
import {
  assembleRuntimeReleaseBundle,
  parseRuntimeBundleAssemblyInvocation,
} from './lfea-piping-runtime-bundle-assembler.mjs';

console.log('[SIMULATED][INELIGIBLE_FOR_RELEASE_EVIDENCE][NO_ENGINEERING_COMMAND_EXECUTION]');

const EXACT_HEAD = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const INTERNAL_ROLES = Object.freeze([
  ['upstreamGateLog', 'internal/upstream-gate.log', 'text/plain'],
  ['t0GateLog', 'internal/t0-gate.log', 'text/plain'],
  ['sourceOrchestrationEvidence', 'internal/source-orchestration.json', 'application/json'],
  ['interfaceEvidence', 'internal/interface-evidence.json', 'application/json'],
  ['interfaceRecoveryEvidence', 'internal/interface-recovery.json', 'application/json'],
  ['codeAndAllowableEvidence', 'internal/code-and-allowable.json', 'application/json'],
  ['presentationExportEvidence', 'internal/presentation-export.json', 'application/json'],
]);
const EXTERNAL_ROLES = Object.freeze([
  ['realModelReconciliation', 'external/real-model.json'],
  ['commercialCorroboration', 'external/commercial.json'],
  ['performanceEvidence', 'external/performance.json'],
  ['rollbackEvidence', 'external/rollback.json'],
  ['signedDisposition', 'external/signed-disposition.json'],
]);

const parsed = parseRuntimeBundleAssemblyInvocation([
  `--exact-head=${EXACT_HEAD}`,
  '--internal-root=/tmp/internal',
  '--external-root=/tmp/external',
  '--external-package=external/package.json',
  '--output=/tmp/output',
]);
assert.equal(parsed.exactHead, EXACT_HEAD);
assert.equal(parsed.internalManifestPath, 'internal/exact-head-manifest.json');
assert.throws(
  () => parseRuntimeBundleAssemblyInvocation(['--output=/tmp/out']),
  errorCode('LFEA_RUNTIME_BUNDLE_OPTIONS_MISSING'),
);
assert.throws(
  () => parseRuntimeBundleAssemblyInvocation([
    '--exact-head=bad',
    '--internal-root=/tmp/internal',
    '--external-root=/tmp/external',
    '--external-package=external/package.json',
    '--output=/tmp/output',
  ]),
  errorCode('LFEA_RUNTIME_BUNDLE_HEAD_INVALID'),
);

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lfea-phase6g-'));
try {
  const first = createInputs(path.join(temp, 'first'));
  const outputOne = path.join(temp, 'bundle-one');
  const resultOne = await assemble(first, outputOne);
  assert.equal(resultOne.status, 'ELIGIBLE_FOR_RELEASE_CERTIFICATION');
  assert.equal(resultOne.exactHead, EXACT_HEAD);
  assert.equal(resultOne.copiedFileCount, 15);
  assert.equal(resultOne.verifiedGateCount, 11);
  assert.equal(fs.existsSync(path.join(outputOne, 'release-evidence.json')), true);
  assert.equal(fs.existsSync(path.join(outputOne, 'bundle/assembly-summary.json')), true);
  assert.equal(fs.existsSync(path.join(outputOne, 'internal/audit-baseline.runtime.json')), true);

  const manifest = readJson(path.join(outputOne, 'release-evidence.json'));
  assert.equal(manifest.schema, 'lfea-piping-release-evidence/v1');
  assert.equal(manifest.programDisposition, 'QUALIFIED');
  assert.equal(manifest.exactHead, EXACT_HEAD);
  assert.ok(Object.values(manifest.gates).every((status) => status === 'VERIFIED'));
  assert.equal(manifest.artifacts.exactHeadManifest, 'internal/exact-head-manifest.json');
  assert.equal(manifest.artifacts.externalQualificationPackage, 'external/package.json');
  assert.equal(
    fs.readFileSync(path.join(outputOne, 'external/commercial.json'), 'utf8'),
    fs.readFileSync(path.join(first.externalRoot, 'external/commercial.json'), 'utf8'),
  );

  const second = createInputs(path.join(temp, 'second'));
  const outputTwo = path.join(temp, 'bundle-two');
  await assemble(second, outputTwo);
  assert.equal(
    fs.readFileSync(path.join(outputOne, 'release-evidence.json'), 'utf8'),
    fs.readFileSync(path.join(outputTwo, 'release-evidence.json'), 'utf8'),
  );
  assert.equal(
    fs.readFileSync(path.join(outputOne, 'bundle/assembly-summary.json'), 'utf8'),
    fs.readFileSync(path.join(outputTwo, 'bundle/assembly-summary.json'), 'utf8'),
  );

  const headMismatch = createInputs(path.join(temp, 'head-mismatch'));
  headMismatch.externalPackage.exactHead = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
  writeJson(
    path.join(headMismatch.externalRoot, 'external/package.json'),
    headMismatch.externalPackage,
  );
  const headMismatchOutput = path.join(temp, 'head-mismatch-output');
  await assert.rejects(
    () => assemble(headMismatch, headMismatchOutput),
    errorCode('LFEA_RUNTIME_BUNDLE_INPUT_HEAD_MISMATCH'),
  );
  assert.equal(fs.existsSync(headMismatchOutput), false);

  const existing = createInputs(path.join(temp, 'existing'));
  const existingOutput = path.join(temp, 'existing-output');
  fs.mkdirSync(existingOutput);
  await assert.rejects(
    () => assemble(existing, existingOutput),
    errorCode('LFEA_RUNTIME_BUNDLE_OUTPUT_EXISTS'),
  );

  const collision = createInputs(path.join(temp, 'collision'));
  collision.externalPackagePath = 'internal/exact-head-manifest.json';
  writeJson(
    path.join(collision.externalRoot, collision.externalPackagePath),
    collision.externalPackage,
  );
  await assert.rejects(
    () => assemble(collision, path.join(temp, 'collision-output')),
    errorCode('LFEA_RUNTIME_BUNDLE_PATH_COLLISION'),
  );

  const traversal = createInputs(path.join(temp, 'traversal'));
  traversal.externalPackage.artifactReferences.realModelReconciliation.path = '../escape.json';
  writeJson(
    path.join(traversal.externalRoot, 'external/package.json'),
    traversal.externalPackage,
  );
  await assert.rejects(
    () => assemble(traversal, path.join(temp, 'traversal-output')),
    errorCode('LFEA_RUNTIME_BUNDLE_EXTERNAL_ARTIFACT_PATH_INVALID'),
  );

  const staleSummary = createInputs(path.join(temp, 'stale-summary'));
  const staleSummaryPath = path.join(staleSummary.internalRoot, 'internal/collection-summary.json');
  const staleSummaryRecord = readJson(staleSummaryPath);
  staleSummaryRecord.manifestEvidenceHash = 'fnv1a64:ffffffffffffffff';
  writeJson(staleSummaryPath, staleSummaryRecord);
  await assert.rejects(
    () => assemble(staleSummary, path.join(temp, 'stale-summary-output')),
    errorCode('LFEA_RUNTIME_BUNDLE_COLLECTION_SUMMARY_INVALID'),
  );

  const failedValidation = createInputs(path.join(temp, 'failed-validation'));
  const failedValidationOutput = path.join(temp, 'failed-validation-output');
  await assert.rejects(
    () => assemble(failedValidation, failedValidationOutput, {
      releaseEvaluator: async () => {
        const error = new Error('synthetic release rejection');
        error.code = 'SYNTHETIC_RELEASE_REJECTION';
        throw error;
      },
    }),
    errorCode('SYNTHETIC_RELEASE_REJECTION'),
  );
  assert.equal(fs.existsSync(failedValidationOutput), false);
  assert.equal(
    fs.readdirSync(temp).some((name) => name.startsWith('failed-validation-output.staging-')),
    false,
  );
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}

console.log(JSON.stringify({
  check: 'lfea-piping-runtime-bundle-assembler',
  status: 'PASS',
  exactHead: EXACT_HEAD,
  engineeringCommandsExecuted: false,
}));

async function assemble(input, outputRoot, overrides = {}) {
  return assembleRuntimeReleaseBundle({
    repositoryRoot: input.repositoryRoot,
    internalRoot: input.internalRoot,
    externalRoot: input.externalRoot,
    externalPackagePath: input.externalPackagePath,
    outputRoot,
    exactHead: EXACT_HEAD,
    internalManifestValidator: (record) => Object.freeze(record),
    externalPackageValidator: (record) => Object.freeze(record),
    releaseEvaluator: overrides.releaseEvaluator ?? evaluateReleaseReadiness,
    validators: {
      internal: ({ root, ledger, releaseMode }) => {
        assert.equal(releaseMode, true);
        assert.equal(fs.existsSync(path.join(root, ledger.artifacts.exactHeadManifest)), true);
        return Object.freeze({
          status: 'ELIGIBLE_FOR_RELEASE_REVIEW',
          releaseEligible: true,
          exactHead: ledger.exactHead,
          manifestSemanticHash: input.internalManifest.semanticHash,
        });
      },
      external: ({ root, ledger, releaseMode }) => {
        assert.equal(releaseMode, true);
        assert.equal(fs.existsSync(path.join(root, ledger.artifacts.externalQualificationPackage)), true);
        return Object.freeze({
          status: 'ELIGIBLE_FOR_RELEASE_REVIEW',
          releaseEligible: true,
          exactHead: ledger.exactHead,
          packageSemanticHash: input.externalPackage.semanticHash,
        });
      },
    },
  });
}

function createInputs(root) {
  const repositoryRoot = path.join(root, 'repository');
  const internalRoot = path.join(root, 'internal-source');
  const externalRoot = path.join(root, 'external-source');
  fs.mkdirSync(repositoryRoot, { recursive: true });
  fs.mkdirSync(internalRoot, { recursive: true });
  fs.mkdirSync(externalRoot, { recursive: true });

  const internalArtifactReferences = Object.fromEntries(INTERNAL_ROLES.map(([role, file, mediaType]) => {
    writeArtifact(path.join(internalRoot, file), mediaType, role);
    return [role, Object.freeze({
      path: file,
      mediaType,
      contentHash: 'fnv1a64:1111111111111111',
    })];
  }));
  const internalManifest = {
    schema: 'lfea-piping-exact-head-manifest/v1',
    exactHead: EXACT_HEAD,
    semanticHash: 'fnv1a64:2222222222222222',
    evidenceHash: 'fnv1a64:3333333333333333',
    artifactReferences: internalArtifactReferences,
  };
  writeJson(path.join(internalRoot, 'internal/exact-head-manifest.json'), internalManifest);
  const baseline = {
    schema: 'lfea-piping-audit-baseline-runtime/v1',
    repository: 'reallaksh19/Advanced_Analysis',
    exactHeadCommit: EXACT_HEAD,
    checkout: { clean: true },
    evidenceStatus: 'EXACT_HEAD_BASELINE_CAPTURED',
  };
  writeJson(path.join(internalRoot, 'internal/audit-baseline.runtime.json'), baseline);
  writeJson(path.join(internalRoot, 'internal/collection-summary.json'), {
    schema: 'lfea-piping-internal-evidence-collection/v1',
    status: 'PASS',
    exactHead: EXACT_HEAD,
    commandCount: 10,
    artifactCount: 7,
    manifestPath: 'internal/exact-head-manifest.json',
    auditBaselinePath: 'internal/audit-baseline.runtime.json',
    auditBaselineContentHash: semanticHash(baseline),
    manifestSemanticHash: internalManifest.semanticHash,
    manifestEvidenceHash: internalManifest.evidenceHash,
  });

  const externalArtifactReferences = Object.fromEntries(EXTERNAL_ROLES.map(([role, file], index) => {
    writeJson(path.join(externalRoot, file), { role, exactHead: EXACT_HEAD, index });
    return [role, Object.freeze({ path: file })];
  }));
  const externalPackage = {
    schema: 'linear-piping-external-qualification-package/v1',
    exactHead: EXACT_HEAD,
    status: 'ELIGIBLE_FOR_RELEASE_REVIEW',
    semanticHash: 'fnv1a64:4444444444444444',
    evidenceHash: 'fnv1a64:5555555555555555',
    artifactReferences: externalArtifactReferences,
  };
  const externalPackagePath = 'external/package.json';
  writeJson(path.join(externalRoot, externalPackagePath), externalPackage);
  return {
    repositoryRoot,
    internalRoot,
    externalRoot,
    externalPackagePath,
    internalManifest,
    externalPackage,
  };
}

function writeArtifact(filePath, mediaType, role) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  if (mediaType === 'text/plain') {
    fs.writeFileSync(filePath, `${EXACT_HEAD}\n${role}\n`);
  } else {
    writeJson(filePath, { role, exactHead: EXACT_HEAD, status: 'PASS' });
  }
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function errorCode(code) {
  return (error) => error?.code === code;
}
