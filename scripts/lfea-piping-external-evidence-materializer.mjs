#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { semanticHash } from '../src/core/shared-piping-model/canonical-json.js';
import {
  compileLinearPipingExternalQualificationPackage,
  requireApprovedProjectAuthorityIndex,
  requireLinearPipingExternalQualificationPackage,
} from '../src/core/linear-piping-project-qualification/index.js';
import {
  validateExternalReleaseEvidence,
} from './lfea-piping-external-release-evidence-check.mjs';

const MODULE_PATH = fileURLToPath(import.meta.url);
const REPOSITORY_ROOT = path.resolve(path.dirname(MODULE_PATH), '..');
const REQUEST_SCHEMA = 'lfea-piping-external-materialization-request/v2';
const SUMMARY_SCHEMA = 'lfea-piping-external-materialization-summary/v2';
const PACKAGE_REQUEST_SCHEMA = 'linear-piping-external-qualification-package-request/v2';
const ARTIFACT_REFERENCE_SCHEMA = 'linear-piping-evidence-artifact-reference/v1';
const RELEASE_SCHEMA = 'lfea-piping-release-evidence/v1';
const RELEASE_PROGRAM = 'PRIORITY_2_LINEAR_PIPING_FEA_APPLICATION_CHAIN';
const PACKAGE_PATH = 'external/external-qualification-package.json';
const AUTHORITY_INDEX_PATH = 'external/project-authority-index.json';
const SUMMARY_PATH = 'external/materialization-summary.json';
const HEAD_PATTERN = /^[0-9a-f]{40}$/u;
const REQUEST_KEYS = Object.freeze([
  'schema',
  'packageId',
  'exactHead',
  'projectAuthorityIndex',
  'records',
]);
const RECORD_KEYS = Object.freeze([
  'applicationResult',
  'presentation',
  'realModelReconciliation',
  'commercialCorroboration',
  'performanceEvidence',
  'rollbackEvidence',
  'reviewDisposition',
]);
const OUTPUT_RECORDS = Object.freeze({
  realModelReconciliation: 'external/real-model-reconciliation.json',
  commercialCorroboration: 'external/commercial-corroboration.json',
  performanceEvidence: 'external/performance-evidence.json',
  rollbackEvidence: 'external/rollback-evidence.json',
  reviewDisposition: 'external/signed-disposition.json',
});
const ARTIFACT_ROLE_BY_RECORD = Object.freeze({
  realModelReconciliation: 'realModelReconciliation',
  commercialCorroboration: 'commercialCorroboration',
  performanceEvidence: 'performanceEvidence',
  rollbackEvidence: 'rollbackEvidence',
  reviewDisposition: 'signedDisposition',
});
const INELIGIBLE_ROOTS = Object.freeze([
  'e2e', 'script', 'scripts', 'test', 'tests', 'fixture', 'fixtures', 'mock', 'mocks',
]);

if (path.resolve(process.argv[1] ?? '') === MODULE_PATH) {
  const options = parseExternalMaterializationInvocation(process.argv.slice(2));
  const result = materializeExternalQualificationEvidence({
    repositoryRoot: REPOSITORY_ROOT,
    ...options,
  });
  console.log(JSON.stringify(result));
}

export function parseExternalMaterializationInvocation(args) {
  const allowed = new Set(['exact-head', 'input-root', 'output', 'request']);
  const options = new Map();
  for (const argument of args) {
    if (!argument.startsWith('--') || !argument.includes('=')) {
      fail('LFEA_EXTERNAL_MATERIALIZATION_OPTION_INVALID', { argument });
    }
    const separator = argument.indexOf('=');
    const key = argument.slice(2, separator);
    const value = argument.slice(separator + 1);
    if (!allowed.has(key) || options.has(key) || value.trim() === '') {
      fail('LFEA_EXTERNAL_MATERIALIZATION_OPTION_INVALID', { argument });
    }
    options.set(key, value);
  }
  const missing = [...allowed].filter((key) => !options.has(key));
  if (missing.length > 0) fail('LFEA_EXTERNAL_MATERIALIZATION_OPTIONS_MISSING', { missing });
  const expectedHead = options.get('exact-head');
  if (!HEAD_PATTERN.test(expectedHead)) {
    fail('LFEA_EXTERNAL_MATERIALIZATION_HEAD_INVALID', { expectedHead });
  }
  return Object.freeze({
    expectedHead,
    inputRoot: path.resolve(options.get('input-root')),
    outputRoot: path.resolve(options.get('output')),
    requestPath: options.get('request'),
  });
}

export function materializeExternalQualificationEvidence({
  repositoryRoot,
  inputRoot,
  requestPath,
  outputRoot,
  expectedHead,
  authorityValidator = requireApprovedProjectAuthorityIndex,
  packageCompiler = compileLinearPipingExternalQualificationPackage,
  packageValidator = requireLinearPipingExternalQualificationPackage,
  intakeValidator = validateExternalReleaseEvidence,
}) {
  requireHead(expectedHead);
  const repository = requireDirectory(
    repositoryRoot,
    'LFEA_EXTERNAL_MATERIALIZATION_REPOSITORY_INVALID',
  );
  const input = requireDirectory(inputRoot, 'LFEA_EXTERNAL_MATERIALIZATION_INPUT_ROOT_INVALID');
  const output = prepareOutputPath(repository, input, outputRoot);
  const requestRelative = requireSafeRelativeJsonPath(
    requestPath,
    'LFEA_EXTERNAL_MATERIALIZATION_REQUEST_PATH_INVALID',
  );
  const request = requireMaterializationRequest(readJson(
    resolveSourceFile(input, requestRelative),
    'LFEA_EXTERNAL_MATERIALIZATION_REQUEST_JSON_INVALID',
  ));
  if (request.exactHead !== expectedHead) {
    fail('LFEA_EXTERNAL_MATERIALIZATION_REQUEST_HEAD_MISMATCH', {
      expectedHead,
      requestHead: request.exactHead,
    });
  }

  const projectAuthorityIndex = authorityValidator(readJson(
    resolveSourceFile(input, request.projectAuthorityIndex),
    'LFEA_EXTERNAL_MATERIALIZATION_AUTHORITY_INDEX_JSON_INVALID',
  ));
  const records = Object.fromEntries(RECORD_KEYS.map((key) => [
    key,
    readJson(
      resolveSourceFile(input, request.records[key]),
      'LFEA_EXTERNAL_MATERIALIZATION_RECORD_JSON_INVALID',
    ),
  ]));
  const artifactReferences = buildArtifactReferences(records);
  const compiled = packageCompiler({
    schema: PACKAGE_REQUEST_SCHEMA,
    packageId: request.packageId,
    exactHead: request.exactHead,
    applicationResult: records.applicationResult,
    presentation: records.presentation,
    projectAuthorityIndex,
    realModelReconciliation: records.realModelReconciliation,
    commercialCorroboration: records.commercialCorroboration,
    performanceEvidence: records.performanceEvidence,
    rollbackEvidence: records.rollbackEvidence,
    reviewDisposition: records.reviewDisposition,
    artifactReferences,
  });
  const packageRecord = packageValidator(compiled);
  if (packageRecord.exactHead !== expectedHead
    || packageRecord.status !== 'ELIGIBLE_FOR_RELEASE_REVIEW'
    || packageRecord.projectAuthorityIndex.semanticHash !== projectAuthorityIndex.semanticHash
    || packageRecord.projectAuthorityIndex.evidenceHash !== projectAuthorityIndex.evidenceHash) {
    fail('LFEA_EXTERNAL_MATERIALIZATION_PACKAGE_INVALID');
  }

  const staging = `${output}.staging-${process.pid}-${Date.now()}`;
  fs.mkdirSync(staging, { recursive: false });
  try {
    writeJson(staging, AUTHORITY_INDEX_PATH, projectAuthorityIndex);
    for (const key of Object.keys(OUTPUT_RECORDS)) {
      writeJson(staging, OUTPUT_RECORDS[key], records[key]);
    }
    writeJson(staging, PACKAGE_PATH, packageRecord);
    const intake = intakeValidator({
      root: staging,
      ledger: buildExternalIntakeLedger(expectedHead),
      releaseMode: true,
    });
    requireEligibleIntake(intake, expectedHead, packageRecord);
    const summary = Object.freeze({
      schema: SUMMARY_SCHEMA,
      status: 'ELIGIBLE_FOR_PHASE6G_ASSEMBLY',
      exactHead: expectedHead,
      packagePath: PACKAGE_PATH,
      projectAuthorityIndexPath: AUTHORITY_INDEX_PATH,
      evidenceRecordCount: Object.keys(OUTPUT_RECORDS).length + 1,
      requestContentHash: semanticHash(request),
      projectAuthorityIndexSemanticHash: projectAuthorityIndex.semanticHash,
      projectAuthorityIndexEvidenceHash: projectAuthorityIndex.evidenceHash,
      applicationResultSemanticHash: packageRecord.applicationResultSemanticHash,
      applicationResultEvidenceHash: packageRecord.applicationResultEvidenceHash,
      presentationSemanticHash: packageRecord.presentationSemanticHash,
      presentationEvidenceHash: packageRecord.presentationEvidenceHash,
      packageSemanticHash: packageRecord.semanticHash,
      packageEvidenceHash: packageRecord.evidenceHash,
    });
    writeJson(staging, SUMMARY_PATH, summary);
    fs.renameSync(staging, output);
    return summary;
  } catch (error) {
    fs.rmSync(staging, { recursive: true, force: true });
    throw error;
  }
}

function requireMaterializationRequest(value) {
  requireExactKeys(value, REQUEST_KEYS, 'LFEA_EXTERNAL_MATERIALIZATION_REQUEST_INVALID');
  if (value.schema !== REQUEST_SCHEMA) fail('LFEA_EXTERNAL_MATERIALIZATION_REQUEST_INVALID');
  if (typeof value.packageId !== 'string' || value.packageId.trim() === '') {
    fail('LFEA_EXTERNAL_MATERIALIZATION_REQUEST_INVALID');
  }
  requireHead(value.exactHead);
  const projectAuthorityIndex = requireSafeRelativeJsonPath(
    value.projectAuthorityIndex,
    'LFEA_EXTERNAL_MATERIALIZATION_AUTHORITY_INDEX_PATH_INVALID',
  );
  requireExactKeys(
    value.records,
    RECORD_KEYS,
    'LFEA_EXTERNAL_MATERIALIZATION_RECORD_PATHS_INVALID',
  );
  const records = Object.fromEntries(RECORD_KEYS.map((key) => [
    key,
    requireSafeRelativeJsonPath(
      value.records[key],
      'LFEA_EXTERNAL_MATERIALIZATION_RECORD_PATH_INVALID',
    ),
  ]));
  const paths = [projectAuthorityIndex, ...Object.values(records)]
    .map((entry) => entry.toLowerCase());
  if (new Set(paths).size !== paths.length) {
    fail('LFEA_EXTERNAL_MATERIALIZATION_RECORD_PATH_DUPLICATE');
  }
  return Object.freeze({
    schema: value.schema,
    packageId: value.packageId,
    exactHead: value.exactHead,
    projectAuthorityIndex,
    records: Object.freeze(records),
  });
}

function buildArtifactReferences(records) {
  return Object.freeze(Object.fromEntries(Object.entries(OUTPUT_RECORDS).map(([key, outputPath]) => {
    const record = records[key];
    if (!record || typeof record !== 'object' || Array.isArray(record)
      || typeof record.semanticHash !== 'string'
      || typeof record.evidenceHash !== 'string') {
      fail('LFEA_EXTERNAL_MATERIALIZATION_RECORD_IDENTITY_MISSING', { key });
    }
    return [ARTIFACT_ROLE_BY_RECORD[key], Object.freeze({
      schema: ARTIFACT_REFERENCE_SCHEMA,
      path: outputPath,
      mediaType: 'application/json',
      contentHash: semanticHash(record),
      recordSemanticHash: record.semanticHash,
      recordEvidenceHash: record.evidenceHash,
    })];
  })));
}

function buildExternalIntakeLedger(exactHead) {
  return Object.freeze({
    schema: RELEASE_SCHEMA,
    program: RELEASE_PROGRAM,
    exactHead,
    gates: Object.freeze({
      G8_REAL_MODEL_RECONCILIATION: 'VERIFIED',
      G9_COMMERCIAL_CORROBORATION: 'VERIFIED',
      G10_RELEASE_ROLLBACK: 'VERIFIED',
    }),
    artifacts: Object.freeze({
      realModelReconciliation: OUTPUT_RECORDS.realModelReconciliation,
      commercialCorroboration: OUTPUT_RECORDS.commercialCorroboration,
      performanceEvidence: OUTPUT_RECORDS.performanceEvidence,
      rollbackEvidence: OUTPUT_RECORDS.rollbackEvidence,
      signedDisposition: OUTPUT_RECORDS.reviewDisposition,
      externalQualificationPackage: PACKAGE_PATH,
    }),
  });
}

function requireEligibleIntake(value, exactHead, packageRecord) {
  if (!value
    || value.status !== 'ELIGIBLE_FOR_RELEASE_REVIEW'
    || value.releaseEligible !== true
    || value.exactHead !== exactHead
    || value.artifactCount !== Object.keys(OUTPUT_RECORDS).length
    || value.packageSemanticHash !== packageRecord.semanticHash
    || value.packageEvidenceHash !== packageRecord.evidenceHash) {
    fail('LFEA_EXTERNAL_MATERIALIZATION_INTAKE_INVALID', { value, exactHead });
  }
}

function prepareOutputPath(repository, input, outputRoot) {
  const requested = path.resolve(outputRoot);
  if (fs.existsSync(requested)) {
    fail('LFEA_EXTERNAL_MATERIALIZATION_OUTPUT_EXISTS', { output: requested });
  }
  const parent = requireDirectory(
    path.dirname(requested),
    'LFEA_EXTERNAL_MATERIALIZATION_OUTPUT_PARENT_INVALID',
  );
  const output = path.join(parent, path.basename(requested));
  for (const [name, root] of [['repository', repository], ['input', input]]) {
    if (isWithin(root, output) || isWithin(output, root)) {
      fail('LFEA_EXTERNAL_MATERIALIZATION_OUTPUT_OVERLAP', { name, output, root });
    }
  }
  return output;
}

function requireDirectory(value, code) {
  const absolute = path.resolve(value);
  if (!fs.existsSync(absolute)) fail(code, { value });
  const status = fs.lstatSync(absolute);
  if (status.isSymbolicLink() || !status.isDirectory()) fail(code, { value });
  return fs.realpathSync(absolute);
}

function requireSafeRelativeJsonPath(value, code) {
  if (typeof value !== 'string' || value.trim() === '') fail(code, { value });
  const normalized = value.replaceAll('\\', '/');
  const segments = normalized.split('/');
  if (path.posix.isAbsolute(normalized)
    || /^[A-Za-z]:\//u.test(normalized)
    || segments.some((segment) => segment === '' || segment === '.' || segment === '..')
    || INELIGIBLE_ROOTS.includes(segments[0].toLowerCase())
    || !normalized.toLowerCase().endsWith('.json')) {
    fail(code, { value });
  }
  return normalized;
}

function resolveSourceFile(root, relativePath) {
  const absolute = path.resolve(root, ...relativePath.split('/'));
  const relative = path.relative(root, absolute);
  if (relative.startsWith('..') || path.isAbsolute(relative) || !fs.existsSync(absolute)) {
    fail('LFEA_EXTERNAL_MATERIALIZATION_SOURCE_FILE_INVALID', { relativePath });
  }
  const status = fs.lstatSync(absolute);
  if (status.isSymbolicLink() || !status.isFile()) {
    fail('LFEA_EXTERNAL_MATERIALIZATION_SOURCE_FILE_INVALID', { relativePath });
  }
  const real = fs.realpathSync(absolute);
  const realRelative = path.relative(root, real);
  if (realRelative.startsWith('..') || path.isAbsolute(realRelative)) {
    fail('LFEA_EXTERNAL_MATERIALIZATION_SOURCE_FILE_INVALID', { relativePath });
  }
  return real;
}

function writeJson(root, relativePath, value) {
  const target = path.resolve(root, ...relativePath.split('/'));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
}

function readJson(filePath, code) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    fail(code, { filePath, message: error.message });
  }
}

function requireExactKeys(value, keys, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code);
  const actual = Object.keys(value).sort(compareAscii);
  const expected = [...keys].sort(compareAscii);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(code, { actual, expected });
}

function requireHead(value) {
  if (!HEAD_PATTERN.test(value ?? '')) fail('LFEA_EXTERNAL_MATERIALIZATION_HEAD_INVALID', { value });
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
