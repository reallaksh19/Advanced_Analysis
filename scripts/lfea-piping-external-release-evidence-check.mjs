#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import {
  canonicalStringify,
  semanticHash,
} from '../src/core/shared-piping-model/canonical-json.js';
import {
  requireLinearPipingExternalQualificationPackage,
} from '../src/core/linear-piping-project-qualification/index.js';

const MODULE_PATH = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(MODULE_PATH), '..');
const RELEASE_PATH = path.join(ROOT, 'release-evidence/lfea-piping-release-evidence.json');
const EXTERNAL_PACKAGE_ARTIFACT = 'externalQualificationPackage';
const RELEASE_SCHEMA = 'lfea-piping-release-evidence/v1';
const RELEASE_PROGRAM = 'PRIORITY_2_LINEAR_PIPING_FEA_APPLICATION_CHAIN';
const HEAD_PATTERN = /^[0-9a-f]{40}$/u;
const REQUIRED_GATE_KEYS = Object.freeze([
  'G8_REAL_MODEL_RECONCILIATION',
  'G9_COMMERCIAL_CORROBORATION',
  'G10_RELEASE_ROLLBACK',
]);
const ROLE_BINDINGS = Object.freeze([
  Object.freeze({
    ledgerKey: 'realModelReconciliation',
    referenceKey: 'realModelReconciliation',
    recordKey: 'realModelReconciliation',
  }),
  Object.freeze({
    ledgerKey: 'commercialCorroboration',
    referenceKey: 'commercialCorroboration',
    recordKey: 'commercialCorroboration',
  }),
  Object.freeze({
    ledgerKey: 'performanceEvidence',
    referenceKey: 'performanceEvidence',
    recordKey: 'performanceEvidence',
  }),
  Object.freeze({
    ledgerKey: 'rollbackEvidence',
    referenceKey: 'rollbackEvidence',
    recordKey: 'rollbackEvidence',
  }),
  Object.freeze({
    ledgerKey: 'signedDisposition',
    referenceKey: 'signedDisposition',
    recordKey: 'reviewDisposition',
  }),
]);
const INELIGIBLE_ROOTS = Object.freeze([
  'script', 'scripts', 'test', 'tests', 'fixture', 'fixtures', 'mock', 'mocks',
]);

if (path.resolve(process.argv[1] ?? '') === MODULE_PATH) {
  const ledger = readJson(RELEASE_PATH, 'LFEA_RELEASE_EVIDENCE_JSON_INVALID');
  const result = validateExternalReleaseEvidence({
    root: ROOT,
    ledger,
    releaseMode: process.argv.includes('--release'),
  });
  console.log(JSON.stringify(result));
}

export function validateExternalReleaseEvidence({ root, ledger: value, releaseMode = false }) {
  requireRecord(value, 'releaseEvidence');
  if (value.schema !== RELEASE_SCHEMA || value.program !== RELEASE_PROGRAM) {
    fail('LFEA_EXTERNAL_RELEASE_MANIFEST_INVALID', {
      schema: value.schema,
      program: value.program,
    });
  }
  requireRecord(value.gates, 'releaseEvidence.gates');
  requireRecord(value.artifacts, 'releaseEvidence.artifacts');
  if (!Object.hasOwn(value.artifacts, EXTERNAL_PACKAGE_ARTIFACT)) {
    fail('LFEA_EXTERNAL_PACKAGE_SLOT_MISSING');
  }

  const packagePath = value.artifacts[EXTERNAL_PACKAGE_ARTIFACT];
  if (packagePath === null) {
    if (releaseMode) fail('LFEA_EXTERNAL_PACKAGE_ARTIFACT_MISSING');
    return Object.freeze({
      schema: 'lfea-piping-external-release-intake/v1',
      status: 'UNRESOLVED_GATE',
      exactHead: value.exactHead,
      packagePath: null,
      artifactCount: 0,
      artifactPaths: Object.freeze([]),
      packageSemanticHash: null,
      packageEvidenceHash: null,
      releaseEligible: false,
    });
  }

  if (!HEAD_PATTERN.test(value.exactHead ?? '')) {
    fail('LFEA_EXTERNAL_RELEASE_HEAD_INVALID', { exactHead: value.exactHead });
  }
  const packageAbsolutePath = resolveEvidencePath(root, packagePath);
  const packageRecord = requireLinearPipingExternalQualificationPackage(
    readJson(packageAbsolutePath, 'LFEA_EXTERNAL_PACKAGE_JSON_INVALID'),
  );
  if (packageRecord.exactHead !== value.exactHead) {
    fail('LFEA_EXTERNAL_PACKAGE_HEAD_MISMATCH', {
      packageHead: packageRecord.exactHead,
      manifestHead: value.exactHead,
    });
  }

  const validatedArtifacts = ROLE_BINDINGS.map((binding) => (
    validateArtifactBinding(root, value.artifacts, packageRecord, binding)
  ));

  if (releaseMode) {
    for (const gate of REQUIRED_GATE_KEYS) {
      if (value.gates[gate] !== 'VERIFIED') {
        fail('LFEA_EXTERNAL_RELEASE_GATE_NOT_VERIFIED', {
          gate,
          status: value.gates[gate],
        });
      }
    }
  }

  return Object.freeze({
    schema: 'lfea-piping-external-release-intake/v1',
    status: packageRecord.status,
    exactHead: packageRecord.exactHead,
    packagePath,
    artifactCount: validatedArtifacts.length,
    artifactPaths: Object.freeze(validatedArtifacts.map((row) => row.path)),
    packageSemanticHash: packageRecord.semanticHash,
    packageEvidenceHash: packageRecord.evidenceHash,
    releaseEligible: releaseMode,
  });
}

export function canonicalJsonArtifactHash(record) {
  return semanticHash(record);
}

function validateArtifactBinding(root, artifacts, packageRecord, binding) {
  const manifestPath = artifacts[binding.ledgerKey];
  if (typeof manifestPath !== 'string' || manifestPath.trim() === '') {
    fail('LFEA_EXTERNAL_ARTIFACT_PATH_MISSING', { role: binding.ledgerKey });
  }
  const reference = packageRecord.artifactReferences[binding.referenceKey];
  if (reference.path !== manifestPath) {
    fail('LFEA_EXTERNAL_ARTIFACT_PATH_MISMATCH', {
      role: binding.ledgerKey,
      manifestPath,
      packagePath: reference.path,
    });
  }
  if (reference.mediaType !== 'application/json') {
    fail('LFEA_EXTERNAL_ARTIFACT_MEDIA_TYPE_INVALID', {
      role: binding.ledgerKey,
      mediaType: reference.mediaType,
    });
  }

  const actualRecord = readJson(
    resolveEvidencePath(root, manifestPath),
    'LFEA_EXTERNAL_ARTIFACT_JSON_INVALID',
  );
  const expectedRecord = packageRecord[binding.recordKey];
  let actualCanonical;
  let expectedCanonical;
  try {
    actualCanonical = canonicalStringify(actualRecord);
    expectedCanonical = canonicalStringify(expectedRecord);
  } catch (error) {
    fail('LFEA_EXTERNAL_ARTIFACT_CANONICALIZATION_INVALID', {
      role: binding.ledgerKey,
      message: error.message,
    });
  }
  if (actualCanonical !== expectedCanonical) {
    fail('LFEA_EXTERNAL_ARTIFACT_RECORD_MISMATCH', { role: binding.ledgerKey });
  }
  const actualContentHash = canonicalJsonArtifactHash(actualRecord);
  if (reference.contentHash !== actualContentHash) {
    fail('LFEA_EXTERNAL_ARTIFACT_CONTENT_HASH_MISMATCH', {
      role: binding.ledgerKey,
      actual: actualContentHash,
      expected: reference.contentHash,
    });
  }
  if (reference.recordSemanticHash !== actualRecord.semanticHash
    || reference.recordEvidenceHash !== actualRecord.evidenceHash) {
    fail('LFEA_EXTERNAL_ARTIFACT_IDENTITY_MISMATCH', { role: binding.ledgerKey });
  }
  return Object.freeze({ role: binding.ledgerKey, path: manifestPath });
}

function resolveEvidencePath(root, relativePath) {
  if (typeof relativePath !== 'string' || relativePath.trim() === '') {
    fail('LFEA_EXTERNAL_ARTIFACT_PATH_INVALID', { relativePath });
  }
  const normalized = relativePath.replaceAll('\\', '/');
  if (path.posix.isAbsolute(normalized) || /^[A-Za-z]:\//u.test(normalized)) {
    fail('LFEA_EXTERNAL_ARTIFACT_PATH_INVALID', { relativePath });
  }
  const segments = normalized.split('/');
  if (segments.includes('..') || segments.includes('.') || segments.includes('')) {
    fail('LFEA_EXTERNAL_ARTIFACT_PATH_INVALID', { relativePath });
  }
  if (INELIGIBLE_ROOTS.includes(segments[0].toLowerCase())) {
    fail('LFEA_EXTERNAL_ARTIFACT_PATH_INELIGIBLE', { relativePath });
  }
  if (!normalized.toLowerCase().endsWith('.json')) {
    fail('LFEA_EXTERNAL_ARTIFACT_PATH_INVALID', { relativePath });
  }

  const rootRealPath = fs.realpathSync(root);
  const absolutePath = path.resolve(rootRealPath, ...segments);
  const relativeToRoot = path.relative(rootRealPath, absolutePath);
  if (relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot)) {
    fail('LFEA_EXTERNAL_ARTIFACT_PATH_INVALID', { relativePath });
  }
  if (!fs.existsSync(absolutePath)) {
    fail('LFEA_EXTERNAL_ARTIFACT_FILE_MISSING', { relativePath });
  }
  const linkStatus = fs.lstatSync(absolutePath);
  if (linkStatus.isSymbolicLink() || !linkStatus.isFile()) {
    fail('LFEA_EXTERNAL_ARTIFACT_PATH_INELIGIBLE', { relativePath });
  }
  const fileRealPath = fs.realpathSync(absolutePath);
  const realRelativeToRoot = path.relative(rootRealPath, fileRealPath);
  if (realRelativeToRoot.startsWith('..') || path.isAbsolute(realRelativeToRoot)) {
    fail('LFEA_EXTERNAL_ARTIFACT_PATH_INVALID', { relativePath });
  }
  return fileRealPath;
}

function readJson(filePath, code) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    fail(code, { filePath, message: error.message });
  }
}

function requireRecord(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('LFEA_EXTERNAL_RELEASE_RECORD_REQUIRED', { field });
  }
  return value;
}

function fail(code, evidence = {}) {
  const error = new Error(code);
  error.code = code;
  error.evidence = evidence;
  throw error;
}
