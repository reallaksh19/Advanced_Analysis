#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import {
  hashUtf8,
  semanticHash,
} from '../src/core/shared-piping-model/canonical-json.js';
import { deepFreeze } from '../src/core/shared-piping-model/immutable.js';

const MODULE_PATH = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(MODULE_PATH), '..');
const RELEASE_PATH = path.join(ROOT, 'release-evidence/lfea-piping-release-evidence.json');
const RELEASE_SCHEMA = 'lfea-piping-release-evidence/v1';
const RELEASE_PROGRAM = 'PRIORITY_2_LINEAR_PIPING_FEA_APPLICATION_CHAIN';
const INTERNAL_MANIFEST_SCHEMA = 'lfea-piping-exact-head-manifest/v1';
const INTERNAL_MANIFEST_ARTIFACT = 'exactHeadManifest';
const INTERNAL_INTAKE_SCHEMA = 'lfea-piping-internal-release-intake/v1';
const HEAD_PATTERN = /^[0-9a-f]{40}$/u;
const HASH_PATTERN = /^fnv1a64:[0-9a-f]{16}$/u;
const UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u;
const REQUIRED_GATE_KEYS = Object.freeze([
  'G0_EXACT_HEAD',
  'G1_UPSTREAM_NUMERICAL_CHAIN',
  'G2_T0_APPLICATION_SEQUENCING',
  'G3_SOURCE_ORCHESTRATION',
  'G4_INTERFACES',
  'G5_INTERFACE_RECOVERY',
  'G6_CODE_AND_ALLOWABLES',
  'G7_PRESENTATION_EXPORT',
]);
const REQUIRED_COMMAND_ROLE = Object.freeze({
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
const REQUIRED_COMMAND_IDS = Object.freeze(Object.keys(REQUIRED_COMMAND_ROLE).sort(compareAscii));
const ARTIFACT_BINDINGS = Object.freeze([
  Object.freeze({ role: 'upstreamGateLog', mediaType: 'text/plain' }),
  Object.freeze({ role: 't0GateLog', mediaType: 'text/plain' }),
  Object.freeze({ role: 'sourceOrchestrationEvidence', mediaType: 'application/json' }),
  Object.freeze({ role: 'interfaceEvidence', mediaType: 'application/json' }),
  Object.freeze({ role: 'interfaceRecoveryEvidence', mediaType: 'application/json' }),
  Object.freeze({ role: 'codeAndAllowableEvidence', mediaType: 'application/json' }),
  Object.freeze({ role: 'presentationExportEvidence', mediaType: 'application/json' }),
]);
const ARTIFACT_ROLES = Object.freeze(ARTIFACT_BINDINGS.map((entry) => entry.role).sort(compareAscii));
const INELIGIBLE_ROOTS = Object.freeze([
  'script', 'scripts', 'test', 'tests', 'fixture', 'fixtures', 'mock', 'mocks',
]);
const MANIFEST_KEYS = Object.freeze([
  'schema', 'repository', 'exactHead', 'createdAtUtc', 'runtime', 'cleanTree',
  'commands', 'artifactReferences', 'semanticHash', 'evidenceHash',
]);
const RUNTIME_KEYS = Object.freeze([
  'runtimeName', 'runtimeVersion', 'operatingSystem', 'architecture', 'dependencyLockHash',
]);
const CLEAN_TREE_KEYS = Object.freeze(['diffCheckPassed', 'statusClean', 'statusHash']);
const COMMAND_KEYS = Object.freeze([
  'commandId', 'commandText', 'exitCode', 'status', 'artifactRole', 'artifactContentHash',
]);
const ARTIFACT_REFERENCE_KEYS = Object.freeze(['path', 'mediaType', 'contentHash']);

if (path.resolve(process.argv[1] ?? '') === MODULE_PATH) {
  const ledger = readJson(RELEASE_PATH, 'LFEA_RELEASE_EVIDENCE_JSON_INVALID');
  const result = validateInternalReleaseEvidence({
    root: ROOT,
    ledger,
    releaseMode: process.argv.includes('--release'),
  });
  console.log(JSON.stringify(result));
}

export function validateInternalReleaseEvidence({ root, ledger: value, releaseMode = false }) {
  requireRecord(value, 'releaseEvidence');
  if (value.schema !== RELEASE_SCHEMA || value.program !== RELEASE_PROGRAM) {
    fail('LFEA_INTERNAL_RELEASE_MANIFEST_INVALID', {
      schema: value.schema,
      program: value.program,
    });
  }
  requireRecord(value.gates, 'releaseEvidence.gates');
  requireRecord(value.artifacts, 'releaseEvidence.artifacts');
  if (!Object.hasOwn(value.artifacts, INTERNAL_MANIFEST_ARTIFACT)) {
    fail('LFEA_INTERNAL_MANIFEST_SLOT_MISSING');
  }

  const manifestPath = value.artifacts[INTERNAL_MANIFEST_ARTIFACT];
  if (manifestPath === null) {
    if (releaseMode) fail('LFEA_INTERNAL_MANIFEST_ARTIFACT_MISSING');
    return deepFreeze({
      schema: INTERNAL_INTAKE_SCHEMA,
      status: 'UNRESOLVED_GATE',
      exactHead: value.exactHead,
      manifestPath: null,
      artifactCount: 0,
      commandCount: 0,
      manifestSemanticHash: null,
      manifestEvidenceHash: null,
      releaseEligible: false,
    });
  }

  if (!HEAD_PATTERN.test(value.exactHead ?? '')) {
    fail('LFEA_INTERNAL_RELEASE_HEAD_INVALID', { exactHead: value.exactHead });
  }
  const manifestAbsolutePath = resolveEvidencePath(root, manifestPath, 'application/json');
  const manifest = requireInternalExactHeadManifest(
    readJson(manifestAbsolutePath, 'LFEA_INTERNAL_MANIFEST_JSON_INVALID'),
  );
  if (manifest.exactHead !== value.exactHead) {
    fail('LFEA_INTERNAL_MANIFEST_HEAD_MISMATCH', {
      manifestHead: manifest.exactHead,
      releaseHead: value.exactHead,
    });
  }

  const validatedArtifacts = ARTIFACT_BINDINGS.map((binding) => (
    validateArtifactBinding(root, value.artifacts, manifest, binding, manifestPath)
  ));

  if (releaseMode) {
    for (const gate of REQUIRED_GATE_KEYS) {
      if (value.gates[gate] !== 'VERIFIED') {
        fail('LFEA_INTERNAL_RELEASE_GATE_NOT_VERIFIED', {
          gate,
          status: value.gates[gate],
        });
      }
    }
  }

  return deepFreeze({
    schema: INTERNAL_INTAKE_SCHEMA,
    status: 'ELIGIBLE_FOR_RELEASE_REVIEW',
    exactHead: manifest.exactHead,
    manifestPath,
    artifactCount: validatedArtifacts.length,
    commandCount: manifest.commands.length,
    manifestSemanticHash: manifest.semanticHash,
    manifestEvidenceHash: manifest.evidenceHash,
    releaseEligible: releaseMode,
  });
}

export function sealInternalExactHeadManifest(input) {
  requireRecord(input, 'internalExactHeadManifest');
  requireExactKeys(input, MANIFEST_KEYS, 'internalExactHeadManifest');
  if (input.schema !== INTERNAL_MANIFEST_SCHEMA
    || input.repository !== 'reallaksh19/Advanced_Analysis') {
    fail('LFEA_INTERNAL_MANIFEST_INVALID');
  }
  const exactHead = requireHead(input.exactHead, 'internalExactHeadManifest.exactHead');
  const createdAtUtc = requireUtc(input.createdAtUtc, 'internalExactHeadManifest.createdAtUtc');
  const runtime = canonicalRuntime(input.runtime);
  const cleanTree = canonicalCleanTree(input.cleanTree);
  const artifactReferences = canonicalArtifactReferences(input.artifactReferences);
  const commands = canonicalCommands(input.commands, artifactReferences);
  const draft = {
    schema: INTERNAL_MANIFEST_SCHEMA,
    repository: input.repository,
    exactHead,
    createdAtUtc,
    runtime,
    cleanTree,
    commands,
    artifactReferences,
    semanticHash: '',
    evidenceHash: '',
  };
  draft.semanticHash = semanticHash(internalManifestSemanticProjection(draft));
  draft.evidenceHash = semanticHash({
    semanticHash: draft.semanticHash,
    createdAtUtc: draft.createdAtUtc,
    dependencyLockHash: draft.runtime.dependencyLockHash,
    cleanTreeStatusHash: draft.cleanTree.statusHash,
    artifactContentHashes: ARTIFACT_ROLES.map((role) => ({
      role,
      contentHash: draft.artifactReferences[role].contentHash,
    })),
  });
  if (input.semanticHash !== '' && input.semanticHash !== draft.semanticHash) {
    fail('LFEA_INTERNAL_MANIFEST_HASH_MISMATCH');
  }
  if (input.evidenceHash !== '' && input.evidenceHash !== draft.evidenceHash) {
    fail('LFEA_INTERNAL_MANIFEST_HASH_MISMATCH');
  }
  return deepFreeze(draft);
}

export function requireInternalExactHeadManifest(record) {
  const sealed = sealInternalExactHeadManifest(record);
  if (record.semanticHash !== sealed.semanticHash || record.evidenceHash !== sealed.evidenceHash) {
    fail('LFEA_INTERNAL_MANIFEST_HASH_MISMATCH');
  }
  return sealed;
}

export function internalManifestSemanticProjection(record) {
  const { semanticHash: _semanticHash, evidenceHash: _evidenceHash, ...projection } = record;
  return projection;
}

export function contentHashForInternalArtifact(mediaType, content) {
  if (mediaType === 'text/plain') return hashUtf8(String(content));
  if (mediaType === 'application/json') return semanticHash(content);
  fail('LFEA_INTERNAL_ARTIFACT_MEDIA_TYPE_INVALID', { mediaType });
}

function canonicalRuntime(value) {
  requireRecord(value, 'internalExactHeadManifest.runtime');
  requireExactKeys(value, RUNTIME_KEYS, 'internalExactHeadManifest.runtime');
  return deepFreeze({
    runtimeName: requireText(value.runtimeName, 'runtime.runtimeName'),
    runtimeVersion: requireText(value.runtimeVersion, 'runtime.runtimeVersion'),
    operatingSystem: requireText(value.operatingSystem, 'runtime.operatingSystem'),
    architecture: requireText(value.architecture, 'runtime.architecture'),
    dependencyLockHash: requireHash(value.dependencyLockHash, 'runtime.dependencyLockHash'),
  });
}

function canonicalCleanTree(value) {
  requireRecord(value, 'internalExactHeadManifest.cleanTree');
  requireExactKeys(value, CLEAN_TREE_KEYS, 'internalExactHeadManifest.cleanTree');
  if (value.diffCheckPassed !== true || value.statusClean !== true) {
    fail('LFEA_INTERNAL_CLEAN_TREE_NOT_PROVEN');
  }
  return deepFreeze({
    diffCheckPassed: true,
    statusClean: true,
    statusHash: requireHash(value.statusHash, 'cleanTree.statusHash'),
  });
}

function canonicalArtifactReferences(value) {
  requireRecord(value, 'internalExactHeadManifest.artifactReferences');
  requireExactKeys(value, ARTIFACT_ROLES, 'internalExactHeadManifest.artifactReferences');
  const result = {};
  const paths = [];
  for (const role of ARTIFACT_ROLES) {
    const source = value[role];
    requireRecord(source, `artifactReferences.${role}`);
    requireExactKeys(source, ARTIFACT_REFERENCE_KEYS, `artifactReferences.${role}`);
    const binding = ARTIFACT_BINDINGS.find((entry) => entry.role === role);
    if (source.mediaType !== binding.mediaType) {
      fail('LFEA_INTERNAL_ARTIFACT_MEDIA_TYPE_INVALID', {
        role,
        mediaType: source.mediaType,
      });
    }
    const pathValue = requireText(source.path, `artifactReferences.${role}.path`);
    paths.push(pathValue);
    result[role] = deepFreeze({
      path: pathValue,
      mediaType: source.mediaType,
      contentHash: requireHash(source.contentHash, `artifactReferences.${role}.contentHash`),
    });
  }
  if (new Set(paths).size !== paths.length) {
    fail('LFEA_INTERNAL_ARTIFACT_PATH_DUPLICATE');
  }
  return deepFreeze(result);
}

function canonicalCommands(value, artifactReferences) {
  if (!Array.isArray(value)) fail('LFEA_INTERNAL_COMMANDS_INVALID');
  const commands = value.map((source, index) => {
    requireRecord(source, `commands[${index}]`);
    requireExactKeys(source, COMMAND_KEYS, `commands[${index}]`);
    const commandId = requireText(source.commandId, `commands[${index}].commandId`);
    const expectedRole = REQUIRED_COMMAND_ROLE[commandId];
    if (!expectedRole || source.artifactRole !== expectedRole) {
      fail('LFEA_INTERNAL_COMMAND_ROLE_INVALID', {
        commandId,
        expectedRole,
        artifactRole: source.artifactRole,
      });
    }
    if (source.exitCode !== 0 || source.status !== 'PASS') {
      fail('LFEA_INTERNAL_COMMAND_NOT_PASSED', {
        commandId,
        exitCode: source.exitCode,
        status: source.status,
      });
    }
    const artifactContentHash = requireHash(
      source.artifactContentHash,
      `commands[${index}].artifactContentHash`,
    );
    if (artifactContentHash !== artifactReferences[expectedRole].contentHash) {
      fail('LFEA_INTERNAL_COMMAND_ARTIFACT_HASH_MISMATCH', { commandId, expectedRole });
    }
    return deepFreeze({
      commandId,
      commandText: requireText(source.commandText, `commands[${index}].commandText`),
      exitCode: 0,
      status: 'PASS',
      artifactRole: expectedRole,
      artifactContentHash,
    });
  }).sort((left, right) => compareAscii(left.commandId, right.commandId));
  const ids = commands.map((entry) => entry.commandId);
  if (new Set(ids).size !== ids.length
    || JSON.stringify(ids) !== JSON.stringify(REQUIRED_COMMAND_IDS)) {
    fail('LFEA_INTERNAL_COMMAND_COVERAGE_INVALID', {
      actual: ids,
      expected: REQUIRED_COMMAND_IDS,
    });
  }
  return deepFreeze(commands);
}

function validateArtifactBinding(root, artifacts, manifest, binding, manifestPath) {
  const releasePath = artifacts[binding.role];
  if (typeof releasePath !== 'string' || releasePath.trim() === '') {
    fail('LFEA_INTERNAL_ARTIFACT_PATH_MISSING', { role: binding.role });
  }
  const reference = manifest.artifactReferences[binding.role];
  if (reference.path !== releasePath) {
    fail('LFEA_INTERNAL_ARTIFACT_PATH_MISMATCH', {
      role: binding.role,
      releasePath,
      manifestPath: reference.path,
    });
  }
  if (releasePath === manifestPath) {
    fail('LFEA_INTERNAL_ARTIFACT_PATH_DUPLICATE', { role: binding.role });
  }
  const absolutePath = resolveEvidencePath(root, releasePath, binding.mediaType);
  let actualContentHash;
  if (binding.mediaType === 'text/plain') {
    const text = fs.readFileSync(absolutePath, 'utf8');
    if (!text.includes(manifest.exactHead)) {
      fail('LFEA_INTERNAL_ARTIFACT_HEAD_MISSING', { role: binding.role });
    }
    actualContentHash = contentHashForInternalArtifact(binding.mediaType, text);
  } else {
    const record = readJson(absolutePath, 'LFEA_INTERNAL_ARTIFACT_JSON_INVALID');
    if (record.exactHead !== manifest.exactHead) {
      fail('LFEA_INTERNAL_ARTIFACT_HEAD_MISMATCH', {
        role: binding.role,
        artifactHead: record.exactHead,
        manifestHead: manifest.exactHead,
      });
    }
    actualContentHash = contentHashForInternalArtifact(binding.mediaType, record);
  }
  if (reference.contentHash !== actualContentHash) {
    fail('LFEA_INTERNAL_ARTIFACT_CONTENT_HASH_MISMATCH', {
      role: binding.role,
      actual: actualContentHash,
      expected: reference.contentHash,
    });
  }
  return deepFreeze({ role: binding.role, path: releasePath, contentHash: actualContentHash });
}

function resolveEvidencePath(root, relativePath, mediaType) {
  if (typeof relativePath !== 'string' || relativePath.trim() === '') {
    fail('LFEA_INTERNAL_ARTIFACT_PATH_INVALID', { relativePath });
  }
  const normalized = relativePath.replaceAll('\\', '/');
  if (path.posix.isAbsolute(normalized) || /^[A-Za-z]:\//u.test(normalized)) {
    fail('LFEA_INTERNAL_ARTIFACT_PATH_INVALID', { relativePath });
  }
  const segments = normalized.split('/');
  if (segments.includes('..') || segments.includes('.') || segments.includes('')) {
    fail('LFEA_INTERNAL_ARTIFACT_PATH_INVALID', { relativePath });
  }
  if (INELIGIBLE_ROOTS.includes(segments[0].toLowerCase())) {
    fail('LFEA_INTERNAL_ARTIFACT_PATH_INELIGIBLE', { relativePath });
  }
  const expectedExtension = mediaType === 'application/json' ? '.json' : '.log';
  if (!normalized.toLowerCase().endsWith(expectedExtension)) {
    fail('LFEA_INTERNAL_ARTIFACT_PATH_INVALID', { relativePath, expectedExtension });
  }

  const rootRealPath = fs.realpathSync(root);
  const absolutePath = path.resolve(rootRealPath, ...segments);
  const relativeToRoot = path.relative(rootRealPath, absolutePath);
  if (relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot)) {
    fail('LFEA_INTERNAL_ARTIFACT_PATH_INVALID', { relativePath });
  }
  if (!fs.existsSync(absolutePath)) {
    fail('LFEA_INTERNAL_ARTIFACT_FILE_MISSING', { relativePath });
  }
  const linkStatus = fs.lstatSync(absolutePath);
  if (linkStatus.isSymbolicLink() || !linkStatus.isFile()) {
    fail('LFEA_INTERNAL_ARTIFACT_PATH_INELIGIBLE', { relativePath });
  }
  const fileRealPath = fs.realpathSync(absolutePath);
  const realRelativeToRoot = path.relative(rootRealPath, fileRealPath);
  if (realRelativeToRoot.startsWith('..') || path.isAbsolute(realRelativeToRoot)) {
    fail('LFEA_INTERNAL_ARTIFACT_PATH_INVALID', { relativePath });
  }
  return fileRealPath;
}

function requireExactKeys(value, expected, field) {
  const actualKeys = Object.keys(value).sort(compareAscii);
  const expectedKeys = [...expected].sort(compareAscii);
  if (JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)) {
    fail('LFEA_INTERNAL_RECORD_KEYS_INVALID', { field, actualKeys, expectedKeys });
  }
}

function requireRecord(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('LFEA_INTERNAL_RECORD_REQUIRED', { field });
  }
  return value;
}

function requireText(value, field) {
  if (typeof value !== 'string' || value.trim() === '') {
    fail('LFEA_INTERNAL_TEXT_REQUIRED', { field });
  }
  return value;
}

function requireHead(value, field) {
  if (typeof value !== 'string' || !HEAD_PATTERN.test(value)) {
    fail('LFEA_INTERNAL_HEAD_INVALID', { field, value });
  }
  return value;
}

function requireHash(value, field) {
  if (typeof value !== 'string' || !HASH_PATTERN.test(value)) {
    fail('LFEA_INTERNAL_HASH_INVALID', { field, value });
  }
  return value;
}

function requireUtc(value, field) {
  if (typeof value !== 'string' || !UTC_PATTERN.test(value) || !Number.isFinite(Date.parse(value))) {
    fail('LFEA_INTERNAL_TIME_INVALID', { field, value });
  }
  return value;
}

function readJson(filePath, code) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    fail(code, { filePath, message: error.message });
  }
}

function compareAscii(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function fail(code, evidence = {}) {
  const error = new Error(code);
  error.code = code;
  error.evidence = evidence;
  throw error;
}
