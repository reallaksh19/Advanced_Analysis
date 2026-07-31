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

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RELEASE_PATH = path.join(ROOT, 'release-evidence/lfea-piping-release-evidence.json');
const RELEASE_MODE = process.argv.includes('--release');
const EXTERNAL_PACKAGE_ARTIFACT = 'externalQualificationPackage';
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

const ledger = readJson(RELEASE_PATH, 'LFEA_RELEASE_EVIDENCE_JSON_INVALID');
const result = validateExternalReleaseEvidence({
  root: ROOT,
  ledger,
  releaseMode: RELEASE_MODE,
});
console.log(JSON.stringify(result));

export function validateExternalReleaseEvidence({ root, ledger: value, releaseMode = false }) {
  requireRecord(value, 'releaseEvidence');
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
      releaseEligible: false,
    });
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
  if (canonicalStringify(actualRecord) !== canonicalStringify(expectedRecord)) {
    fail('LFEA_EXTERNAL_ARTIFACT_RECORD_MISMATCH', { role: binding.ledgerKey });
  }
  if (reference.contentHash !== canonicalJsonArtifactHash(actualRecord)) {
    fail('LFEA_EXTERNAL_ARTIFACT_CONTENT_HASH_MISMATCH', {
      role: binding.ledgerKey,
      actual: canonicalJsonArtifactHash(actualRecord),
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
  if (path.isAbsolute(relativePath)) {
    fail('LFEA_EXTERNAL_ARTIFACT_PATH_INVALID', { relativePath });
  }
  const normalized = relativePath.replaceAll('\\', '/');
  const segments = normalized.split('/');
  if (segments.includes('..') || segments.includes('.') || segments.includes('')) {
    fail('LFEA_EXTERNAL_ARTIFACT_PATH_INVALID', { relativePath });
  }
  if (['scripts', 'script', 'tests', 'test', 'fixtures', 'fixture', 'mocks', 'mock']
    .includes(segments[0].toLowerCase())) {
    fail('LFEA_EXTERNAL_ARTIFACT_PATH_INELIGIBLE', { relativePath });
  }
  const absolutePath = path.resolve(root, ...segments);
  const relativeToRoot = path.relative(root, absolutePath);
  if (relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot)) {
    fail('LFEA_EXTERNAL_ARTIFACT_PATH_INVALID', { relativePath });
  }
  if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
    fail('LFEA_EXTERNAL_ARTIFACT_FILE_MISSING', { relativePath });
  }
  return absolutePath;
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
