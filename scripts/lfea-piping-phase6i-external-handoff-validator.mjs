#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { semanticHash } from '../src/core/shared-piping-model/canonical-json.js';
import {
  PHASE6I_FROZEN_CANDIDATE,
  compilePhase6iExternalEvidenceHandoffAcceptance,
  requireApprovedProjectAuthorityIndex,
  requirePhase6iExternalEvidenceHandoff,
} from '../src/core/linear-piping-project-qualification/index.js';

const MODULE_PATH = fileURLToPath(import.meta.url);
const REPOSITORY_ROOT = path.resolve(path.dirname(MODULE_PATH), '..');
const REQUEST_SCHEMA = 'lfea-piping-external-materialization-request/v2';
const ACCEPTED_HANDOFF_PATH = 'external/source-handoff.json';
const ACCEPTED_REQUEST_PATH = 'external/source-materialization-request.json';
const ACCEPTED_AUTHORITY_PATH = 'external/project-authority-index.json';
const HEAD_PATTERN = /^[0-9a-f]{40}$/u;
const HASH_PATTERN = /^(?:fnv1a64:[0-9a-f]{16}|sha256:[0-9a-f]{64})$/u;
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
const INELIGIBLE_ROOTS = Object.freeze([
  'e2e', 'script', 'scripts', 'test', 'tests', 'fixture', 'fixtures', 'mock', 'mocks',
]);

if (path.resolve(process.argv[1] ?? '') === MODULE_PATH) {
  const options = parseExternalHandoffValidationInvocation(process.argv.slice(2));
  const result = validatePhase6iExternalEvidenceHandoff(options);
  console.log(JSON.stringify(result));
}

export function parseExternalHandoffValidationInvocation(args) {
  const required = new Set([
    'expected-head',
    'handoff',
    'input-root',
    'output',
    'request',
    'source-artifact-name',
    'source-run-id',
  ]);
  const values = new Map();
  for (const argument of args) {
    if (!argument.startsWith('--') || !argument.includes('=')) {
      fail('LFEA_WP3_HANDOFF_OPTION_INVALID', { argument });
    }
    const separator = argument.indexOf('=');
    const key = argument.slice(2, separator);
    const value = argument.slice(separator + 1);
    if (!required.has(key) || values.has(key) || value.trim() === '') {
      fail('LFEA_WP3_HANDOFF_OPTION_INVALID', { argument });
    }
    values.set(key, value);
  }
  const missing = [...required].filter((key) => !values.has(key));
  if (missing.length > 0) fail('LFEA_WP3_HANDOFF_OPTIONS_MISSING', { missing });
  const expectedHead = values.get('expected-head');
  if (!HEAD_PATTERN.test(expectedHead) || expectedHead !== PHASE6I_FROZEN_CANDIDATE) {
    fail('LFEA_WP3_HANDOFF_EXPECTED_HEAD_INVALID', { expectedHead });
  }
  return Object.freeze({
    repositoryRoot: REPOSITORY_ROOT,
    inputRoot: path.resolve(values.get('input-root')),
    handoffPath: values.get('handoff'),
    requestPath: values.get('request'),
    outputPath: path.resolve(values.get('output')),
    expectedHead,
    sourceRunId: values.get('source-run-id'),
    sourceArtifactName: values.get('source-artifact-name'),
  });
}

export function validatePhase6iExternalEvidenceHandoff({
  repositoryRoot = REPOSITORY_ROOT,
  inputRoot,
  handoffPath,
  requestPath,
  outputPath,
  expectedHead,
  sourceRunId,
  sourceArtifactName,
  authorityValidator = requireApprovedProjectAuthorityIndex,
}) {
  if (expectedHead !== PHASE6I_FROZEN_CANDIDATE) {
    fail('LFEA_WP3_HANDOFF_EXPECTED_HEAD_INVALID', { expectedHead });
  }
  const repository = requireDirectory(repositoryRoot, 'LFEA_WP3_HANDOFF_REPOSITORY_INVALID');
  const input = requireDirectory(inputRoot, 'LFEA_WP3_HANDOFF_INPUT_ROOT_INVALID');
  if (isWithin(repository, input) || isWithin(input, repository)) {
    fail('LFEA_WP3_HANDOFF_INPUT_ROOT_OVERLAP');
  }
  const handoffRelative = requireSafeJsonPath(
    handoffPath,
    'LFEA_WP3_HANDOFF_PATH_INVALID',
  );
  const requestRelative = requireSafeJsonPath(
    requestPath,
    'LFEA_WP3_HANDOFF_REQUEST_PATH_INVALID',
  );
  if (handoffRelative.toLowerCase() === requestRelative.toLowerCase()) {
    fail('LFEA_WP3_HANDOFF_SOURCE_PATH_DUPLICATE');
  }
  const output = requireNewOutputFile(input, outputPath);
  const handoff = requirePhase6iExternalEvidenceHandoff(readJson(
    resolveSourceFile(input, handoffRelative),
    'LFEA_WP3_HANDOFF_JSON_INVALID',
  ));
  if (handoff.candidateSha !== expectedHead
    || handoff.sourceRunId !== sourceRunId
    || handoff.sourceArtifactName !== sourceArtifactName
    || handoff.requestPath !== requestRelative) {
    fail('LFEA_WP3_HANDOFF_DISPATCH_IDENTITY_MISMATCH', {
      expectedHead,
      handoffHead: handoff.candidateSha,
      sourceRunId,
      handoffSourceRunId: handoff.sourceRunId,
      sourceArtifactName,
      handoffSourceArtifactName: handoff.sourceArtifactName,
      requestPath: requestRelative,
      handoffRequestPath: handoff.requestPath,
    });
  }

  const request = requireMaterializationRequest(readJson(
    resolveSourceFile(input, requestRelative),
    'LFEA_WP3_HANDOFF_REQUEST_JSON_INVALID',
  ));
  if (request.exactHead !== expectedHead) {
    fail('LFEA_WP3_HANDOFF_REQUEST_HEAD_MISMATCH', {
      expectedHead,
      requestHead: request.exactHead,
    });
  }
  if (handoff.requestContentHash !== semanticHash(request)) {
    fail('LFEA_WP3_HANDOFF_REQUEST_CONTENT_HASH_MISMATCH');
  }

  const sourcePaths = [
    handoffRelative,
    requestRelative,
    request.projectAuthorityIndex,
    ...Object.values(request.records),
  ].map((value) => value.toLowerCase());
  if (new Set(sourcePaths).size !== sourcePaths.length) {
    fail('LFEA_WP3_HANDOFF_SOURCE_PATH_DUPLICATE');
  }

  const authority = authorityValidator(readJson(
    resolveSourceFile(input, request.projectAuthorityIndex),
    'LFEA_WP3_HANDOFF_AUTHORITY_JSON_INVALID',
  ));
  if (authority.candidate?.sha !== expectedHead
    || authority.semanticHash !== handoff.projectAuthorityIndexSemanticHash
    || authority.evidenceHash !== handoff.projectAuthorityIndexEvidenceHash) {
    fail('LFEA_WP3_HANDOFF_AUTHORITY_IDENTITY_MISMATCH', {
      expectedHead,
      authorityHead: authority.candidate?.sha,
    });
  }

  for (const [recordKey, relativePath] of Object.entries(request.records)) {
    const record = readJson(
      resolveSourceFile(input, relativePath),
      'LFEA_WP3_HANDOFF_RECORD_JSON_INVALID',
    );
    requireRecordIdentity(record, recordKey);
  }

  const acceptance = compilePhase6iExternalEvidenceHandoffAcceptance({
    handoff,
    sourceHandoffPath: ACCEPTED_HANDOFF_PATH,
    sourceRequestPath: ACCEPTED_REQUEST_PATH,
    projectAuthorityIndexPath: ACCEPTED_AUTHORITY_PATH,
  });
  writeJson(output, acceptance);
  return acceptance;
}

function requireMaterializationRequest(value) {
  requireExactKeys(value, REQUEST_KEYS, 'LFEA_WP3_HANDOFF_REQUEST_INVALID');
  if (value.schema !== REQUEST_SCHEMA
    || typeof value.packageId !== 'string'
    || value.packageId.trim() === ''
    || !HEAD_PATTERN.test(value.exactHead ?? '')) {
    fail('LFEA_WP3_HANDOFF_REQUEST_INVALID');
  }
  const projectAuthorityIndex = requireSafeJsonPath(
    value.projectAuthorityIndex,
    'LFEA_WP3_HANDOFF_AUTHORITY_PATH_INVALID',
  );
  requireExactKeys(value.records, RECORD_KEYS, 'LFEA_WP3_HANDOFF_RECORD_PATHS_INVALID');
  const records = Object.freeze(Object.fromEntries(RECORD_KEYS.map((recordKey) => [
    recordKey,
    requireSafeJsonPath(
      value.records[recordKey],
      'LFEA_WP3_HANDOFF_RECORD_PATH_INVALID',
    ),
  ])));
  if (Object.keys(records).length !== 7) fail('LFEA_WP3_HANDOFF_RECORD_COUNT_INVALID');
  return Object.freeze({
    schema: value.schema,
    packageId: value.packageId,
    exactHead: value.exactHead,
    projectAuthorityIndex,
    records,
  });
}

function requireRecordIdentity(record, recordKey) {
  if (!record || typeof record !== 'object' || Array.isArray(record)
    || !HASH_PATTERN.test(record.semanticHash ?? '')
    || !HASH_PATTERN.test(record.evidenceHash ?? '')) {
    fail('LFEA_WP3_HANDOFF_RECORD_IDENTITY_INVALID', { recordKey });
  }
}

function requireDirectory(value, code) {
  const absolute = path.resolve(value);
  if (!fs.existsSync(absolute)) fail(code, { value });
  const status = fs.lstatSync(absolute);
  if (status.isSymbolicLink() || !status.isDirectory()) fail(code, { value });
  return fs.realpathSync(absolute);
}

function requireNewOutputFile(inputRoot, outputPath) {
  const output = path.resolve(outputPath);
  if (fs.existsSync(output)) fail('LFEA_WP3_HANDOFF_OUTPUT_EXISTS', { output });
  const parent = requireDirectory(
    path.dirname(output),
    'LFEA_WP3_HANDOFF_OUTPUT_PARENT_INVALID',
  );
  const resolved = path.join(parent, path.basename(output));
  if (isWithin(inputRoot, resolved) || isWithin(resolved, inputRoot)) {
    fail('LFEA_WP3_HANDOFF_OUTPUT_OVERLAP');
  }
  return resolved;
}

function requireSafeJsonPath(value, code) {
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
    fail('LFEA_WP3_HANDOFF_SOURCE_FILE_INVALID', { relativePath });
  }
  const status = fs.lstatSync(absolute);
  if (status.isSymbolicLink() || !status.isFile()) {
    fail('LFEA_WP3_HANDOFF_SOURCE_FILE_INVALID', { relativePath });
  }
  const real = fs.realpathSync(absolute);
  const realRelative = path.relative(root, real);
  if (realRelative.startsWith('..') || path.isAbsolute(realRelative)) {
    fail('LFEA_WP3_HANDOFF_SOURCE_FILE_INVALID', { relativePath });
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
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(code, { actual, expected });
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
