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
  EVIDENCE_ARTIFACT_REFERENCE_SCHEMA,
  requireLinearPipingExternalQualificationPackage,
} from '../src/core/linear-piping-project-qualification/index.js';
import {
  PROJECT_AUTHORITY_BOUND_PACKAGE_REQUEST_SCHEMA,
  compileProjectAuthorityBoundExternalPackage,
  requireProjectAuthorityBoundExternalPackage,
} from '../src/core/linear-piping-project-qualification/project-authority-bound-external-package.js';
import {
  requireApprovedProjectAuthorityIndex,
} from '../src/core/linear-piping-project-qualification/project-authority-index.js';

const MODULE_PATH = fileURLToPath(import.meta.url);
const REPOSITORY_ROOT = path.resolve(path.dirname(MODULE_PATH), '..');
const SUMMARY_SCHEMA = 'lfea-piping-phase6h-project-authority-binding-summary/v1';
const SUMMARY_PATH = 'external/project-authority-binding-summary.json';
const HEAD_PATTERN = /^[0-9a-f]{40}$/u;
const INELIGIBLE_ROOTS = Object.freeze([
  'e2e', 'script', 'scripts', 'test', 'tests', 'fixture', 'fixtures', 'mock', 'mocks',
]);

if (path.resolve(process.argv[1] ?? '') === MODULE_PATH) {
  const options = parseProjectAuthorityBindingInvocation(process.argv.slice(2));
  const result = bindProjectAuthorityEvidence(options);
  console.log(JSON.stringify(result));
}

export function parseProjectAuthorityBindingInvocation(args) {
  const required = new Set([
    'authority-index',
    'exact-head',
    'output',
    'package',
    'root',
  ]);
  const values = new Map();
  for (const argument of args) {
    if (!argument.startsWith('--') || !argument.includes('=')) {
      fail('LFEA_PHASE6H_WP2_BINDING_OPTION_INVALID', { argument });
    }
    const separator = argument.indexOf('=');
    const key = argument.slice(2, separator);
    const value = argument.slice(separator + 1);
    if (!required.has(key) || values.has(key) || value.trim() === '') {
      fail('LFEA_PHASE6H_WP2_BINDING_OPTION_INVALID', { argument });
    }
    values.set(key, value);
  }
  const missing = [...required].filter((key) => !values.has(key));
  if (missing.length > 0) {
    fail('LFEA_PHASE6H_WP2_BINDING_OPTIONS_MISSING', { missing });
  }
  const expectedHead = values.get('exact-head');
  if (!HEAD_PATTERN.test(expectedHead)) {
    fail('LFEA_PHASE6H_WP2_BINDING_HEAD_INVALID', { expectedHead });
  }
  return Object.freeze({
    repositoryRoot: REPOSITORY_ROOT,
    root: path.resolve(values.get('root')),
    packagePath: values.get('package'),
    authorityIndexPath: values.get('authority-index'),
    outputPath: values.get('output'),
    expectedHead,
  });
}

export function bindProjectAuthorityEvidence({
  repositoryRoot = REPOSITORY_ROOT,
  root,
  packagePath,
  authorityIndexPath,
  outputPath,
  expectedHead,
  authorityValidator = requireApprovedProjectAuthorityIndex,
  packageValidator = requireLinearPipingExternalQualificationPackage,
  bindingCompiler = compileProjectAuthorityBoundExternalPackage,
  bindingValidator = requireProjectAuthorityBoundExternalPackage,
}) {
  if (!HEAD_PATTERN.test(expectedHead ?? '')) {
    fail('LFEA_PHASE6H_WP2_BINDING_HEAD_INVALID', { expectedHead });
  }
  const repository = requireDirectory(
    repositoryRoot,
    'LFEA_PHASE6H_WP2_BINDING_REPOSITORY_INVALID',
  );
  const evidenceRoot = requireDirectory(
    root,
    'LFEA_PHASE6H_WP2_BINDING_ROOT_INVALID',
  );
  if (isWithin(evidenceRoot, repository) || isWithin(repository, evidenceRoot)) {
    fail('LFEA_PHASE6H_WP2_BINDING_ROOT_OVERLAP');
  }
  const packageRelative = requireSafeRelativeJsonPath(
    packagePath,
    'LFEA_PHASE6H_WP2_BINDING_PACKAGE_PATH_INVALID',
  );
  const authorityRelative = requireSafeRelativeJsonPath(
    authorityIndexPath,
    'LFEA_PHASE6H_WP2_BINDING_AUTHORITY_PATH_INVALID',
  );
  const outputRelative = requireSafeRelativeJsonPath(
    outputPath,
    'LFEA_PHASE6H_WP2_BINDING_OUTPUT_PATH_INVALID',
  );
  if (new Set([
    packageRelative.toLowerCase(),
    authorityRelative.toLowerCase(),
    outputRelative.toLowerCase(),
    SUMMARY_PATH.toLowerCase(),
  ]).size !== 4) {
    fail('LFEA_PHASE6H_WP2_BINDING_PATH_DUPLICATE');
  }
  const packageRecord = packageValidator(readJson(
    resolveSourceFile(evidenceRoot, packageRelative),
    'LFEA_PHASE6H_WP2_BINDING_PACKAGE_JSON_INVALID',
  ));
  const authorityRecord = authorityValidator(readJson(
    resolveSourceFile(evidenceRoot, authorityRelative),
    'LFEA_PHASE6H_WP2_BINDING_AUTHORITY_JSON_INVALID',
  ));
  if (packageRecord.exactHead !== expectedHead) {
    fail('LFEA_PHASE6H_WP2_BINDING_PACKAGE_HEAD_MISMATCH', {
      expectedHead,
      packageHead: packageRecord.exactHead,
    });
  }
  if (canonicalStringify(packageRecord.projectAuthorityIndex)
    !== canonicalStringify(authorityRecord)) {
    fail('LFEA_PHASE6H_WP2_BINDING_AUTHORITY_RECORD_MISMATCH');
  }
  const projectAuthorityIndexArtifact = Object.freeze({
    schema: EVIDENCE_ARTIFACT_REFERENCE_SCHEMA,
    path: authorityRelative,
    mediaType: 'application/json',
    contentHash: semanticHash(authorityRecord),
    recordSemanticHash: authorityRecord.semanticHash,
    recordEvidenceHash: authorityRecord.evidenceHash,
  });
  const bound = bindingCompiler({
    schema: PROJECT_AUTHORITY_BOUND_PACKAGE_REQUEST_SCHEMA,
    externalPackage: packageRecord,
    projectAuthorityIndexArtifact,
  }, { packageValidator });
  const accepted = bindingValidator(bound, { packageValidator });
  const summary = Object.freeze({
    schema: SUMMARY_SCHEMA,
    status: accepted.status,
    exactHead: expectedHead,
    packagePath: packageRelative,
    authorityIndexPath: authorityRelative,
    boundPackagePath: outputRelative,
    externalPackageSemanticHash: packageRecord.semanticHash,
    externalPackageEvidenceHash: packageRecord.evidenceHash,
    projectAuthorityIndexSemanticHash: authorityRecord.semanticHash,
    projectAuthorityIndexEvidenceHash: authorityRecord.evidenceHash,
    boundPackageSemanticHash: accepted.semanticHash,
    boundPackageEvidenceHash: accepted.evidenceHash,
  });
  publishBindingPair({
    evidenceRoot,
    outputRelative,
    outputValue: accepted,
    summaryValue: summary,
  });
  return summary;
}

function publishBindingPair({
  evidenceRoot,
  outputRelative,
  outputValue,
  summaryValue,
}) {
  const outputTarget = resolveNewFile(evidenceRoot, outputRelative);
  const summaryTarget = resolveNewFile(evidenceRoot, SUMMARY_PATH);
  const stagingRoot = path.join(
    evidenceRoot,
    `.wp2-binding-staging-${process.pid}-${Date.now()}`,
  );
  if (fs.existsSync(stagingRoot)) {
    fail('LFEA_PHASE6H_WP2_BINDING_STAGING_EXISTS', { stagingRoot });
  }
  fs.mkdirSync(stagingRoot, { recursive: false });
  const stagedOutput = path.join(stagingRoot, 'bound-package.json');
  const stagedSummary = path.join(stagingRoot, 'binding-summary.json');
  let outputPublished = false;
  let summaryPublished = false;
  try {
    writeJson(stagedOutput, outputValue);
    writeJson(stagedSummary, summaryValue);
    fs.mkdirSync(path.dirname(outputTarget), { recursive: true });
    fs.mkdirSync(path.dirname(summaryTarget), { recursive: true });
    fs.renameSync(stagedOutput, outputTarget);
    outputPublished = true;
    fs.renameSync(stagedSummary, summaryTarget);
    summaryPublished = true;
  } catch (error) {
    if (summaryPublished) fs.rmSync(summaryTarget, { force: true });
    if (outputPublished) fs.rmSync(outputTarget, { force: true });
    throw error;
  } finally {
    fs.rmSync(stagingRoot, { recursive: true, force: true });
  }
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
    fail('LFEA_PHASE6H_WP2_BINDING_SOURCE_INVALID', { relativePath });
  }
  const status = fs.lstatSync(absolute);
  if (status.isSymbolicLink() || !status.isFile()) {
    fail('LFEA_PHASE6H_WP2_BINDING_SOURCE_INVALID', { relativePath });
  }
  const real = fs.realpathSync(absolute);
  const realRelative = path.relative(root, real);
  if (realRelative.startsWith('..') || path.isAbsolute(realRelative)) {
    fail('LFEA_PHASE6H_WP2_BINDING_SOURCE_INVALID', { relativePath });
  }
  return real;
}

function resolveNewFile(root, relativePath) {
  const absolute = path.resolve(root, ...relativePath.split('/'));
  const relative = path.relative(root, absolute);
  if (relative.startsWith('..') || path.isAbsolute(relative) || fs.existsSync(absolute)) {
    fail('LFEA_PHASE6H_WP2_BINDING_OUTPUT_EXISTS', { relativePath });
  }
  return absolute;
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
}

function readJson(filePath, code) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    fail(code, { filePath, message: error.message });
  }
}

function isWithin(parent, child) {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function fail(code, evidence = {}) {
  const error = new Error(code);
  error.code = code;
  error.evidence = evidence;
  throw error;
}
