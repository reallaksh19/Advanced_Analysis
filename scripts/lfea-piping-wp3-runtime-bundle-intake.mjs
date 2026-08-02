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
  PHASE6I_FROZEN_CANDIDATE,
  requireLinearPipingExternalQualificationPackage,
  requirePhase6iExternalEvidenceHandoff,
  requirePhase6iExternalEvidenceHandoffAcceptance,
  requireProjectAuthorityBoundExternalPackage,
} from '../src/core/linear-piping-project-qualification/index.js';

const MODULE_PATH = fileURLToPath(import.meta.url);
const REPOSITORY_ROOT = path.resolve(path.dirname(MODULE_PATH), '..');
const INTAKE_SCHEMA = 'lfea-piping-wp3-runtime-bundle-intake/v1';
const SUMMARY_SCHEMA = 'lfea-piping-wp3-runtime-bundle-assembly/v1';
const RELEASE_SCHEMA = 'lfea-piping-release-evidence/v1';
const REQUEST_SCHEMA = 'lfea-piping-external-materialization-request/v2';
const HEAD_PATTERN = /^[0-9a-f]{40}$/u;
const HASH_PATTERN = /^(?:fnv1a64:[0-9a-f]{16}|sha256:[0-9a-f]{64})$/u;
const SUMMARY_KEYS = Object.freeze([
  'schema', 'status', 'exactHead', 'manifestPath', 'internalManifestPath',
  'externalPackagePath', 'projectAuthorityIndexPath',
  'projectAuthorityBoundPackagePath', 'sourceHandoffPath',
  'sourceMaterializationRequestPath', 'sourceHandoffAcceptancePath',
  'sourceRunId', 'sourceArtifactName', 'copiedFileCount', 'verifiedGateCount',
  'internalManifestSemanticHash', 'internalManifestEvidenceHash',
  'externalPackageSemanticHash', 'externalPackageEvidenceHash',
  'projectAuthorityIndexSemanticHash', 'projectAuthorityIndexEvidenceHash',
  'projectAuthorityBoundPackageSemanticHash',
  'projectAuthorityBoundPackageEvidenceHash', 'sourceRequestContentHash',
  'sourceHandoffContentHash', 'sourceHandoffSemanticHash',
  'sourceHandoffEvidenceHash', 'sourceHandoffAcceptanceContentHash',
  'sourceHandoffAcceptanceSemanticHash', 'sourceHandoffAcceptanceEvidenceHash',
]);
const REQUEST_KEYS = Object.freeze([
  'schema', 'packageId', 'exactHead', 'projectAuthorityIndex', 'records',
]);
const RECORD_KEYS = Object.freeze([
  'applicationResult', 'presentation', 'realModelReconciliation',
  'commercialCorroboration', 'performanceEvidence', 'rollbackEvidence',
  'reviewDisposition',
]);
const HASH_FIELDS = Object.freeze([
  'internalManifestSemanticHash', 'internalManifestEvidenceHash',
  'externalPackageSemanticHash', 'externalPackageEvidenceHash',
  'projectAuthorityIndexSemanticHash', 'projectAuthorityIndexEvidenceHash',
  'projectAuthorityBoundPackageSemanticHash',
  'projectAuthorityBoundPackageEvidenceHash', 'sourceRequestContentHash',
  'sourceHandoffContentHash', 'sourceHandoffSemanticHash',
  'sourceHandoffEvidenceHash', 'sourceHandoffAcceptanceContentHash',
  'sourceHandoffAcceptanceSemanticHash', 'sourceHandoffAcceptanceEvidenceHash',
]);
const PATH_FIELDS = Object.freeze([
  'manifestPath', 'internalManifestPath', 'externalPackagePath',
  'projectAuthorityIndexPath', 'projectAuthorityBoundPackagePath',
  'sourceHandoffPath', 'sourceMaterializationRequestPath',
  'sourceHandoffAcceptancePath',
]);
const INELIGIBLE_ROOTS = Object.freeze([
  'e2e', 'script', 'scripts', 'test', 'tests', 'fixture', 'fixtures', 'mock', 'mocks',
]);

if (path.resolve(process.argv[1] ?? '') === MODULE_PATH) {
  const options = parseWp3RuntimeBundleIntakeInvocation(process.argv.slice(2));
  const result = validateWp3RuntimeReleaseBundle(options);
  console.log(JSON.stringify(result));
}

export function parseWp3RuntimeBundleIntakeInvocation(args) {
  const required = new Set([
    'evidence-root', 'expected-head', 'manifest', 'output', 'summary',
  ]);
  const values = new Map();
  for (const argument of args) {
    if (!argument.startsWith('--') || !argument.includes('=')) {
      fail('LFEA_WP3_RUNTIME_INTAKE_OPTION_INVALID', { argument });
    }
    const separator = argument.indexOf('=');
    const key = argument.slice(2, separator);
    const value = argument.slice(separator + 1);
    if (!required.has(key) || values.has(key) || value.trim() === '') {
      fail('LFEA_WP3_RUNTIME_INTAKE_OPTION_INVALID', { argument });
    }
    values.set(key, value);
  }
  const missing = [...required].filter((key) => !values.has(key));
  if (missing.length > 0) fail('LFEA_WP3_RUNTIME_INTAKE_OPTIONS_MISSING', { missing });
  const expectedHead = values.get('expected-head');
  if (!HEAD_PATTERN.test(expectedHead) || expectedHead !== PHASE6I_FROZEN_CANDIDATE) {
    fail('LFEA_WP3_RUNTIME_INTAKE_HEAD_INVALID', { expectedHead });
  }
  return Object.freeze({
    repositoryRoot: REPOSITORY_ROOT,
    evidenceRoot: path.resolve(values.get('evidence-root')),
    manifestPath: values.get('manifest'),
    summaryPath: values.get('summary'),
    outputPath: path.resolve(values.get('output')),
    expectedHead,
  });
}

export function validateWp3RuntimeReleaseBundle({
  repositoryRoot = REPOSITORY_ROOT,
  evidenceRoot,
  manifestPath,
  summaryPath,
  outputPath,
  expectedHead,
  externalPackageValidator = requireLinearPipingExternalQualificationPackage,
  boundPackageValidator = requireProjectAuthorityBoundExternalPackage,
  handoffValidator = requirePhase6iExternalEvidenceHandoff,
  acceptanceValidator = requirePhase6iExternalEvidenceHandoffAcceptance,
}) {
  if (expectedHead !== PHASE6I_FROZEN_CANDIDATE) {
    fail('LFEA_WP3_RUNTIME_INTAKE_HEAD_INVALID', { expectedHead });
  }
  const repository = requireDirectory(
    repositoryRoot,
    'LFEA_WP3_RUNTIME_INTAKE_REPOSITORY_INVALID',
  );
  const root = requireDirectory(
    evidenceRoot,
    'LFEA_WP3_RUNTIME_INTAKE_EVIDENCE_ROOT_INVALID',
  );
  if (isWithin(repository, root) || isWithin(root, repository)) {
    fail('LFEA_WP3_RUNTIME_INTAKE_ROOT_OVERLAP');
  }
  const manifestRelative = requireSafeRelativeJsonPath(
    manifestPath,
    'LFEA_WP3_RUNTIME_INTAKE_MANIFEST_PATH_INVALID',
  );
  const summaryRelative = requireSafeRelativeJsonPath(
    summaryPath,
    'LFEA_WP3_RUNTIME_INTAKE_SUMMARY_PATH_INVALID',
  );
  const output = requireNewOutputFile(repository, root, outputPath);
  const summary = requireWp3AssemblySummary(readJson(
    resolveSourceFile(root, summaryRelative),
    'LFEA_WP3_RUNTIME_INTAKE_SUMMARY_JSON_INVALID',
  ), expectedHead);
  if (summary.manifestPath !== manifestRelative) {
    fail('LFEA_WP3_RUNTIME_INTAKE_MANIFEST_PATH_MISMATCH');
  }

  const manifest = readJson(
    resolveSourceFile(root, manifestRelative),
    'LFEA_WP3_RUNTIME_INTAKE_MANIFEST_JSON_INVALID',
  );
  const internalManifest = readJson(
    resolveSourceFile(root, summary.internalManifestPath),
    'LFEA_WP3_RUNTIME_INTAKE_INTERNAL_MANIFEST_JSON_INVALID',
  );
  const externalPackage = externalPackageValidator(readJson(
    resolveSourceFile(root, summary.externalPackagePath),
    'LFEA_WP3_RUNTIME_INTAKE_EXTERNAL_PACKAGE_JSON_INVALID',
  ));
  const boundPackage = boundPackageValidator(readJson(
    resolveSourceFile(root, summary.projectAuthorityBoundPackagePath),
    'LFEA_WP3_RUNTIME_INTAKE_BOUND_PACKAGE_JSON_INVALID',
  ));
  const authority = readJson(
    resolveSourceFile(root, summary.projectAuthorityIndexPath),
    'LFEA_WP3_RUNTIME_INTAKE_AUTHORITY_JSON_INVALID',
  );
  const handoff = handoffValidator(readJson(
    resolveSourceFile(root, summary.sourceHandoffPath),
    'LFEA_WP3_RUNTIME_INTAKE_HANDOFF_JSON_INVALID',
  ));
  const request = requireSourceRequest(readJson(
    resolveSourceFile(root, summary.sourceMaterializationRequestPath),
    'LFEA_WP3_RUNTIME_INTAKE_REQUEST_JSON_INVALID',
  ), expectedHead);
  const acceptance = acceptanceValidator(readJson(
    resolveSourceFile(root, summary.sourceHandoffAcceptancePath),
    'LFEA_WP3_RUNTIME_INTAKE_ACCEPTANCE_JSON_INVALID',
  ));

  requireBundleConsistency({
    expectedHead,
    manifest,
    internalManifest,
    summary,
    externalPackage,
    boundPackage,
    authority,
    handoff,
    request,
    acceptance,
  });

  const result = Object.freeze({
    schema: INTAKE_SCHEMA,
    status: 'ELIGIBLE_FOR_RUNTIME_RELEASE_VALIDATION',
    exactHead: expectedHead,
    manifestPath: manifestRelative,
    assemblySummaryPath: summaryRelative,
    sourceHandoffPath: summary.sourceHandoffPath,
    sourceMaterializationRequestPath: summary.sourceMaterializationRequestPath,
    sourceHandoffAcceptancePath: summary.sourceHandoffAcceptancePath,
    sourceRunId: summary.sourceRunId,
    sourceArtifactName: summary.sourceArtifactName,
    sourceRequestContentHash: summary.sourceRequestContentHash,
    sourceHandoffEvidenceHash: summary.sourceHandoffEvidenceHash,
    sourceHandoffAcceptanceEvidenceHash:
      summary.sourceHandoffAcceptanceEvidenceHash,
    projectAuthorityIndexEvidenceHash:
      summary.projectAuthorityIndexEvidenceHash,
    projectAuthorityBoundPackageEvidenceHash:
      summary.projectAuthorityBoundPackageEvidenceHash,
    releaseQualified: false,
  });
  writeJson(output, result);
  return result;
}

function requireBundleConsistency({
  expectedHead,
  manifest,
  internalManifest,
  summary,
  externalPackage,
  boundPackage,
  authority,
  handoff,
  request,
  acceptance,
}) {
  if (manifest.schema !== RELEASE_SCHEMA
    || manifest.programDisposition !== 'QUALIFIED'
    || manifest.exactHead !== expectedHead
    || manifest.artifacts?.externalQualificationPackage
      !== summary.externalPackagePath) {
    fail('LFEA_WP3_RUNTIME_INTAKE_RELEASE_MANIFEST_INVALID');
  }
  if (internalManifest.exactHead !== expectedHead
    || internalManifest.semanticHash !== summary.internalManifestSemanticHash
    || internalManifest.evidenceHash !== summary.internalManifestEvidenceHash) {
    fail('LFEA_WP3_RUNTIME_INTAKE_INTERNAL_MANIFEST_MISMATCH');
  }
  if (externalPackage.exactHead !== expectedHead
    || boundPackage.exactHead !== expectedHead
    || handoff.candidateSha !== expectedHead
    || acceptance.candidateSha !== expectedHead) {
    fail('LFEA_WP3_RUNTIME_INTAKE_INPUT_HEAD_MISMATCH');
  }
  if (canonicalStringify(externalPackage)
    !== canonicalStringify(boundPackage.externalPackage)) {
    fail('LFEA_WP3_RUNTIME_INTAKE_EXTERNAL_PACKAGE_MISMATCH');
  }
  const authorityReference = boundPackage.projectAuthorityIndexArtifact;
  const embeddedAuthority = boundPackage.externalPackage.projectAuthorityIndex;
  if (summary.projectAuthorityIndexPath !== authorityReference.path
    || canonicalStringify(authority) !== canonicalStringify(embeddedAuthority)
    || semanticHash(authority) !== authorityReference.contentHash
    || authority.semanticHash !== authorityReference.recordSemanticHash
    || authority.evidenceHash !== authorityReference.recordEvidenceHash) {
    fail('LFEA_WP3_RUNTIME_INTAKE_AUTHORITY_MISMATCH');
  }
  if (summary.externalPackageSemanticHash !== externalPackage.semanticHash
    || summary.externalPackageEvidenceHash !== externalPackage.evidenceHash
    || summary.projectAuthorityIndexSemanticHash !== authority.semanticHash
    || summary.projectAuthorityIndexEvidenceHash !== authority.evidenceHash
    || summary.projectAuthorityBoundPackageSemanticHash !== boundPackage.semanticHash
    || summary.projectAuthorityBoundPackageEvidenceHash !== boundPackage.evidenceHash) {
    fail('LFEA_WP3_RUNTIME_INTAKE_SUMMARY_PARENT_MISMATCH');
  }
  const requestHash = semanticHash(request);
  if (request.packageId !== boundPackage.packageId
    || handoff.requestContentHash !== requestHash
    || acceptance.requestContentHash !== requestHash
    || summary.sourceRequestContentHash !== requestHash) {
    fail('LFEA_WP3_RUNTIME_INTAKE_REQUEST_MISMATCH');
  }
  if (acceptance.sourceHandoffPath !== summary.sourceHandoffPath
    || acceptance.sourceRequestPath !== summary.sourceMaterializationRequestPath
    || acceptance.projectAuthorityIndexPath !== summary.projectAuthorityIndexPath
    || handoff.sourceRunId !== summary.sourceRunId
    || acceptance.sourceRunId !== summary.sourceRunId
    || handoff.sourceArtifactName !== summary.sourceArtifactName
    || acceptance.sourceArtifactName !== summary.sourceArtifactName) {
    fail('LFEA_WP3_RUNTIME_INTAKE_CUSTODY_PATH_MISMATCH');
  }
  if (summary.sourceHandoffContentHash !== semanticHash(handoff)
    || summary.sourceHandoffSemanticHash !== handoff.semanticHash
    || summary.sourceHandoffEvidenceHash !== handoff.evidenceHash
    || acceptance.sourceHandoffContentHash !== semanticHash(handoff)
    || acceptance.sourceHandoffSemanticHash !== handoff.semanticHash
    || acceptance.sourceHandoffEvidenceHash !== handoff.evidenceHash) {
    fail('LFEA_WP3_RUNTIME_INTAKE_HANDOFF_MISMATCH');
  }
  if (summary.sourceHandoffAcceptanceContentHash !== semanticHash(acceptance)
    || summary.sourceHandoffAcceptanceSemanticHash !== acceptance.semanticHash
    || summary.sourceHandoffAcceptanceEvidenceHash !== acceptance.evidenceHash) {
    fail('LFEA_WP3_RUNTIME_INTAKE_ACCEPTANCE_MISMATCH');
  }
  if (handoff.projectAuthorityIndexSemanticHash !== authority.semanticHash
    || handoff.projectAuthorityIndexEvidenceHash !== authority.evidenceHash
    || acceptance.projectAuthorityIndexSemanticHash !== authority.semanticHash
    || acceptance.projectAuthorityIndexEvidenceHash !== authority.evidenceHash) {
    fail('LFEA_WP3_RUNTIME_INTAKE_CUSTODY_AUTHORITY_MISMATCH');
  }
}

function requireWp3AssemblySummary(value, expectedHead) {
  requireExactKeys(value, SUMMARY_KEYS, 'LFEA_WP3_RUNTIME_INTAKE_SUMMARY_INVALID');
  if (value.schema !== SUMMARY_SCHEMA
    || value.status !== 'ELIGIBLE_FOR_RELEASE_CERTIFICATION'
    || value.exactHead !== expectedHead
    || value.verifiedGateCount !== 11
    || !Number.isInteger(value.copiedFileCount)
    || value.copiedFileCount < 1
    || typeof value.sourceRunId !== 'string'
    || !/^[1-9][0-9]*$/u.test(value.sourceRunId)
    || typeof value.sourceArtifactName !== 'string'
    || value.sourceArtifactName.trim() === '') {
    fail('LFEA_WP3_RUNTIME_INTAKE_SUMMARY_INVALID');
  }
  for (const field of PATH_FIELDS) {
    requireSafeRelativeJsonPath(value[field], 'LFEA_WP3_RUNTIME_INTAKE_SUMMARY_INVALID');
  }
  for (const field of HASH_FIELDS) {
    requireHash(value[field], field);
  }
  const paths = PATH_FIELDS.map((field) => value[field].toLowerCase());
  if (new Set(paths).size !== paths.length) {
    fail('LFEA_WP3_RUNTIME_INTAKE_SUMMARY_PATH_DUPLICATE');
  }
  return value;
}

function requireSourceRequest(value, expectedHead) {
  requireExactKeys(value, REQUEST_KEYS, 'LFEA_WP3_RUNTIME_INTAKE_REQUEST_INVALID');
  if (value.schema !== REQUEST_SCHEMA
    || value.exactHead !== expectedHead
    || typeof value.packageId !== 'string'
    || value.packageId.trim() === '') {
    fail('LFEA_WP3_RUNTIME_INTAKE_REQUEST_INVALID');
  }
  const authorityPath = requireSafeRelativeJsonPath(
    value.projectAuthorityIndex,
    'LFEA_WP3_RUNTIME_INTAKE_REQUEST_INVALID',
  );
  requireExactKeys(value.records, RECORD_KEYS, 'LFEA_WP3_RUNTIME_INTAKE_REQUEST_INVALID');
  const recordPaths = RECORD_KEYS.map((key) => requireSafeRelativeJsonPath(
    value.records[key],
    'LFEA_WP3_RUNTIME_INTAKE_REQUEST_INVALID',
  ));
  if (new Set([authorityPath, ...recordPaths].map((entry) => entry.toLowerCase())).size
    !== recordPaths.length + 1) {
    fail('LFEA_WP3_RUNTIME_INTAKE_REQUEST_PATH_DUPLICATE');
  }
  return value;
}

function requireDirectory(value, code) {
  const absolute = path.resolve(value);
  if (!fs.existsSync(absolute)) fail(code, { value });
  const status = fs.lstatSync(absolute);
  if (status.isSymbolicLink() || !status.isDirectory()) fail(code, { value });
  return fs.realpathSync(absolute);
}

function requireNewOutputFile(repository, evidenceRoot, outputPath) {
  const output = path.resolve(outputPath);
  if (fs.existsSync(output)) fail('LFEA_WP3_RUNTIME_INTAKE_OUTPUT_EXISTS', { output });
  const parent = requireDirectory(
    path.dirname(output),
    'LFEA_WP3_RUNTIME_INTAKE_OUTPUT_PARENT_INVALID',
  );
  const resolved = path.join(parent, path.basename(output));
  for (const [name, root] of [['repository', repository], ['evidence', evidenceRoot]]) {
    if (isWithin(root, resolved) || isWithin(resolved, root)) {
      fail('LFEA_WP3_RUNTIME_INTAKE_OUTPUT_OVERLAP', { name, output: resolved, root });
    }
  }
  return resolved;
}

function requireSafeRelativeJsonPath(value, code) {
  if (typeof value !== 'string' || value.trim() === '') fail(code, { value });
  const normalized = value.replaceAll('\\', '/');
  const segments = normalized.split('/');
  if (path.posix.isAbsolute(normalized)
    || /^[A-Za-z]:\//u.test(normalized)
    || !normalized.toLowerCase().endsWith('.json')
    || segments.some((segment) => segment === '' || segment === '.' || segment === '..')
    || INELIGIBLE_ROOTS.includes(segments[0].toLowerCase())) {
    fail(code, { value });
  }
  return normalized;
}

function resolveSourceFile(root, relativePath) {
  const absolute = path.resolve(root, ...relativePath.split('/'));
  const relative = path.relative(root, absolute);
  if (relative.startsWith('..') || path.isAbsolute(relative) || !fs.existsSync(absolute)) {
    fail('LFEA_WP3_RUNTIME_INTAKE_SOURCE_INVALID', { relativePath });
  }
  const status = fs.lstatSync(absolute);
  if (status.isSymbolicLink() || !status.isFile()) {
    fail('LFEA_WP3_RUNTIME_INTAKE_SOURCE_INVALID', { relativePath });
  }
  const real = fs.realpathSync(absolute);
  const realRelative = path.relative(root, real);
  if (realRelative.startsWith('..') || path.isAbsolute(realRelative)) {
    fail('LFEA_WP3_RUNTIME_INTAKE_SOURCE_INVALID', { relativePath });
  }
  return real;
}

function readJson(filePath, code) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    fail(code, { filePath, message: error.message });
  }
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
}

function requireExactKeys(value, expectedKeys, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code);
  const actual = Object.keys(value).sort(compareAscii);
  const expected = [...expectedKeys].sort(compareAscii);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(code, { actual, expected });
}

function requireHash(value, field) {
  if (typeof value !== 'string' || !HASH_PATTERN.test(value)) {
    fail('LFEA_WP3_RUNTIME_INTAKE_HASH_INVALID', { field });
  }
}

function isWithin(parent, child) {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
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
