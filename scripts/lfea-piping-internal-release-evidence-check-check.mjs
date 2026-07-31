#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { semanticHash } from '../src/core/shared-piping-model/canonical-json.js';
import {
  contentHashForInternalArtifact,
  requireInternalExactHeadManifest,
  sealInternalExactHeadManifest,
  validateInternalReleaseEvidence,
} from './lfea-piping-internal-release-evidence-check.mjs';

const EXACT_HEAD = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const ROLE_MEDIA = Object.freeze({
  upstreamGateLog: 'text/plain',
  t0GateLog: 'text/plain',
  sourceOrchestrationEvidence: 'application/json',
  interfaceEvidence: 'application/json',
  interfaceRecoveryEvidence: 'application/json',
  codeAndAllowableEvidence: 'application/json',
  presentationExportEvidence: 'application/json',
});
const COMMAND_ROLE = Object.freeze({
  CLEAN_TREE: 'upstreamGateLog',
  CODE_AND_ALLOWABLES: 'codeAndAllowableEvidence',
  EXACT_HEAD_BASELINE: 'upstreamGateLog',
  FULL_REPOSITORY_GATE: 'upstreamGateLog',
  INTERFACES: 'interfaceEvidence',
  INTERFACE_RECOVERY: 'interfaceRecoveryEvidence',
  PRESENTATION_EXPORT: 'presentationExportEvidence',
  SOURCE_ORCHESTRATION: 'sourceOrchestrationEvidence',
  T0_APPLICATION_SEQUENCING: 't0GateLog',
  UPSTREAM_NUMERICAL_CHAIN: 'upstreamGateLog',
});
const GATES = Object.freeze([
  'G0_EXACT_HEAD',
  'G1_UPSTREAM_NUMERICAL_CHAIN',
  'G2_T0_APPLICATION_SEQUENCING',
  'G3_SOURCE_ORCHESTRATION',
  'G4_INTERFACES',
  'G5_INTERFACE_RECOVERY',
  'G6_CODE_AND_ALLOWABLES',
  'G7_PRESENTATION_EXPORT',
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

function artifactPath(role) {
  if (role === 'upstreamGateLog') return 'evidence/upstream-gate.log';
  if (role === 't0GateLog') return 'evidence/t0-gate.log';
  return `evidence/${role.replaceAll(/[A-Z]/gu, (value) => `-${value.toLowerCase()}`)}.json`;
}

function artifactContent(role, exactHead = EXACT_HEAD) {
  if (ROLE_MEDIA[role] === 'text/plain') {
    return `${role} PASS\nexactHead=${exactHead}\n`;
  }
  const record = {
    schema: 'lfea-piping-internal-phase-evidence/v1',
    role,
    exactHead,
    status: 'PASS',
  };
  return { ...record, semanticHash: semanticHash(record) };
}

function writeContent(root, role, content) {
  const relativePath = artifactPath(role);
  const absolutePath = path.join(root, ...relativePath.split('/'));
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(
    absolutePath,
    ROLE_MEDIA[role] === 'text/plain'
      ? content
      : `${JSON.stringify(content, null, 2)}\n`,
  );
  return relativePath;
}

function buildCandidate(root, options = {}) {
  fs.mkdirSync(path.join(root, 'evidence'), { recursive: true });
  const artifactReferences = {};
  const contents = {};
  for (const role of Object.keys(ROLE_MEDIA)) {
    const content = options.artifactHeadOverride?.role === role
      ? artifactContent(role, options.artifactHeadOverride.exactHead)
      : artifactContent(role);
    contents[role] = content;
    artifactReferences[role] = {
      path: artifactPath(role),
      mediaType: ROLE_MEDIA[role],
      contentHash: contentHashForInternalArtifact(ROLE_MEDIA[role], content),
    };
    writeContent(root, role, content);
  }

  const commands = Object.entries(COMMAND_ROLE).map(([commandId, artifactRole]) => ({
    commandId,
    commandText: `node scripts/${commandId.toLowerCase().replaceAll('_', '-')}.mjs`,
    exitCode: 0,
    status: 'PASS',
    artifactRole,
    artifactContentHash: artifactReferences[artifactRole].contentHash,
  }));
  if (options.omitCommand) {
    const index = commands.findIndex((entry) => entry.commandId === options.omitCommand);
    if (index >= 0) commands.splice(index, 1);
  }

  const cleanTree = {
    diffCheckPassed: options.cleanTree === false ? false : true,
    statusClean: true,
    statusHash: 'fnv1a64:1111111111111111',
  };
  const manifest = sealInternalExactHeadManifest({
    schema: 'lfea-piping-exact-head-manifest/v1',
    repository: 'reallaksh19/Advanced_Analysis',
    exactHead: EXACT_HEAD,
    createdAtUtc: '2026-07-31T12:20:00Z',
    runtime: {
      runtimeName: 'NODE-JS',
      runtimeVersion: '22.18.0',
      operatingSystem: 'LINUX-X64',
      architecture: 'X64',
      dependencyLockHash: 'fnv1a64:2222222222222222',
    },
    cleanTree,
    commands,
    artifactReferences,
    semanticHash: '',
    evidenceHash: '',
  });
  const manifestPath = 'evidence/exact-head-manifest.json';
  fs.writeFileSync(
    path.join(root, manifestPath),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );

  const value = ledger();
  value.exactHead = EXACT_HEAD;
  value.artifacts.exactHeadManifest = manifestPath;
  for (const role of Object.keys(ROLE_MEDIA)) value.artifacts[role] = artifactPath(role);
  for (const gate of GATES) value.gates[gate] = 'VERIFIED';
  return { ledger: value, manifest, contents };
}

console.log('\n--- [SIMULATED][INELIGIBLE_FOR_RELEASE_EVIDENCE] Phase 6D internal intake ---');

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lfea-phase6d-'));
try {
  test('P6D-INTAKE-01', 'Policy mode remains unresolved without an exact-head manifest', () => {
    const result = validateInternalReleaseEvidence({
      root: process.cwd(),
      ledger: ledger(),
      releaseMode: false,
    });
    assert.equal(result.status, 'UNRESOLVED_GATE');
    assert.equal(result.releaseEligible, false);
    assert.equal(result.manifestPath, null);
  });

  test('P6D-INTAKE-02', 'Release mode fails closed without an exact-head manifest', () => {
    expectCode(
      () => validateInternalReleaseEvidence({
        root: process.cwd(),
        ledger: ledger(),
        releaseMode: true,
      }),
      'LFEA_INTERNAL_MANIFEST_ARTIFACT_MISSING',
    );
  });

  test('P6D-INTAKE-03', 'A complete exact-head package is accepted in policy mode', () => {
    const candidate = buildCandidate(tempRoot);
    const result = validateInternalReleaseEvidence({
      root: tempRoot,
      ledger: candidate.ledger,
      releaseMode: false,
    });
    assert.equal(result.status, 'ELIGIBLE_FOR_RELEASE_REVIEW');
    assert.equal(result.releaseEligible, false);
    assert.equal(result.artifactCount, 7);
    assert.equal(result.commandCount, 10);
    assert.equal(result.manifestSemanticHash, candidate.manifest.semanticHash);
  });

  test('P6D-INTAKE-04', 'Complete G0-G7 evidence passes internal release intake', () => {
    const candidate = buildCandidate(tempRoot);
    const result = validateInternalReleaseEvidence({
      root: tempRoot,
      ledger: candidate.ledger,
      releaseMode: true,
    });
    assert.equal(result.releaseEligible, true);
    assert.equal(result.exactHead, EXACT_HEAD);
  });

  test('P6D-INTAKE-05', 'Command coverage is exact and mandatory', () => {
    expectCode(
      () => buildCandidate(tempRoot, { omitCommand: 'INTERFACE_RECOVERY' }),
      'LFEA_INTERNAL_COMMAND_COVERAGE_INVALID',
    );
  });

  test('P6D-INTAKE-06', 'A dirty or unproven tree is rejected', () => {
    expectCode(
      () => buildCandidate(tempRoot, { cleanTree: false }),
      'LFEA_INTERNAL_CLEAN_TREE_NOT_PROVEN',
    );
  });

  test('P6D-INTAKE-07', 'Release and manifest heads cannot diverge', () => {
    const candidate = buildCandidate(tempRoot);
    candidate.ledger.exactHead = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
    expectCode(
      () => validateInternalReleaseEvidence({
        root: tempRoot,
        ledger: candidate.ledger,
        releaseMode: false,
      }),
      'LFEA_INTERNAL_MANIFEST_HEAD_MISMATCH',
    );
  });

  test('P6D-INTAKE-08', 'Release and manifest artifact paths cannot diverge', () => {
    const candidate = buildCandidate(tempRoot);
    candidate.ledger.artifacts.interfaceEvidence = 'evidence/other-interface.json';
    expectCode(
      () => validateInternalReleaseEvidence({
        root: tempRoot,
        ledger: candidate.ledger,
        releaseMode: false,
      }),
      'LFEA_INTERNAL_ARTIFACT_PATH_MISMATCH',
    );
  });

  test('P6D-INTAKE-09', 'Persisted artifact tampering is rejected', () => {
    const candidate = buildCandidate(tempRoot);
    fs.appendFileSync(path.join(tempRoot, artifactPath('upstreamGateLog')), 'tampered\n');
    expectCode(
      () => validateInternalReleaseEvidence({
        root: tempRoot,
        ledger: candidate.ledger,
        releaseMode: false,
      }),
      'LFEA_INTERNAL_ARTIFACT_CONTENT_HASH_MISMATCH',
    );
  });

  test('P6D-INTAKE-10', 'JSON phase evidence must cite the exact manifest head', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lfea-phase6d-head-'));
    try {
      const candidate = buildCandidate(root, {
        artifactHeadOverride: {
          role: 'interfaceEvidence',
          exactHead: 'cccccccccccccccccccccccccccccccccccccccc',
        },
      });
      expectCode(
        () => validateInternalReleaseEvidence({
          root,
          ledger: candidate.ledger,
          releaseMode: false,
        }),
        'LFEA_INTERNAL_ARTIFACT_HEAD_MISMATCH',
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('P6D-INTAKE-11', 'Release mode requires every G0-G7 gate to be verified', () => {
    const candidate = buildCandidate(tempRoot);
    candidate.ledger.gates.G5_INTERFACE_RECOVERY = 'PARTIALLY_VERIFIED';
    expectCode(
      () => validateInternalReleaseEvidence({
        root: tempRoot,
        ledger: candidate.ledger,
        releaseMode: true,
      }),
      'LFEA_INTERNAL_RELEASE_GATE_NOT_VERIFIED',
    );
  });

  test('P6D-INTAKE-12', 'Traversal and ineligible evidence roots are rejected', () => {
    for (const relativePath of ['../evidence/manifest.json', 'scripts/manifest.json']) {
      const changed = ledger();
      changed.exactHead = EXACT_HEAD;
      changed.artifacts.exactHeadManifest = relativePath;
      expectCode(
        () => validateInternalReleaseEvidence({
          root: process.cwd(),
          ledger: changed,
          releaseMode: false,
        }),
        relativePath.startsWith('..')
          ? 'LFEA_INTERNAL_ARTIFACT_PATH_INVALID'
          : 'LFEA_INTERNAL_ARTIFACT_PATH_INELIGIBLE',
      );
    }
  });

  test('P6D-INTAKE-13', 'Manifest identity is invariant to command input order', () => {
    const candidate = buildCandidate(tempRoot);
    const reversed = sealInternalExactHeadManifest({
      ...clone(candidate.manifest),
      commands: [...candidate.manifest.commands].reverse(),
      semanticHash: '',
      evidenceHash: '',
    });
    assert.equal(reversed.semanticHash, candidate.manifest.semanticHash);
    assert.equal(reversed.evidenceHash, candidate.manifest.evidenceHash);
    assert.equal(
      requireInternalExactHeadManifest(candidate.manifest).semanticHash,
      candidate.manifest.semanticHash,
    );
  });

  test('P6D-INTAKE-14', 'Committed release evidence remains blocked and unpopulated', () => {
    const value = ledger();
    assert.equal(value.programDisposition, 'BLOCKED');
    assert.equal(value.artifacts.exactHeadManifest, null);
    for (const gate of GATES) assert.notEqual(value.gates[gate], 'VERIFIED');
  });
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

console.log('[SIMULATED][INELIGIBLE_FOR_RELEASE_EVIDENCE] Phase 6D checks PASS');
