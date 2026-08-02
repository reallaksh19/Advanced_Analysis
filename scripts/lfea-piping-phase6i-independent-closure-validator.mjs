#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { semanticHash } from '../src/core/shared-piping-model/canonical-json.js';
import {
  PHASE6I_FROZEN_CANDIDATE,
  PHASE6I_IMMUTABLE_REF,
  requirePhase6iAntiDriftReviewManifest,
  requirePhase6iBenchmarkReviewManifest,
  requirePhase6iIndependentClosureReview,
} from '../src/core/linear-piping-project-qualification/index.js';

const MODULE_PATH = fileURLToPath(import.meta.url);
const REPOSITORY_ROOT = path.resolve(path.dirname(MODULE_PATH), '..');
const ACCEPTANCE_SCHEMA = 'lfea-piping-phase6i-independent-closure-acceptance/v1';
const INTAKE_SCHEMA = 'lfea-piping-wp3-runtime-bundle-intake/v1';
const RUN_ID_PATTERN = /^\d+$/u;
const INELIGIBLE_ROOTS = Object.freeze([
  'e2e', 'script', 'scripts', 'test', 'tests', 'fixture', 'fixtures', 'mock', 'mocks',
]);

if (path.resolve(process.argv[1] ?? '') === MODULE_PATH) {
  const options = parseInvocation(process.argv.slice(2));
  const result = validateIndependentClosurePackage(options);
  console.log(JSON.stringify(result));
}

export function parseInvocation(args) {
  const required = new Set([
    'anti-drift', 'benchmarks', 'certification-artifact-name',
    'certification-root', 'certification-run-id', 'expected-head', 'output',
    'review', 'review-artifact-name', 'review-root', 'review-run-id',
  ]);
  const values = new Map();
  for (const argument of args) {
    if (!argument.startsWith('--') || !argument.includes('=')) {
      fail('LFEA_WP8_OPTION_INVALID', { argument });
    }
    const separator = argument.indexOf('=');
    const key = argument.slice(2, separator);
    const value = argument.slice(separator + 1);
    if (!required.has(key) || values.has(key) || value.trim() === '') {
      fail('LFEA_WP8_OPTION_INVALID', { argument });
    }
    values.set(key, value);
  }
  const missing = [...required].filter((key) => !values.has(key));
  if (missing.length > 0) fail('LFEA_WP8_OPTIONS_MISSING', { missing });
  const expectedHead = values.get('expected-head');
  if (expectedHead !== PHASE6I_FROZEN_CANDIDATE) {
    fail('LFEA_WP8_EXPECTED_HEAD_INVALID', { expectedHead });
  }
  for (const key of ['certification-run-id', 'review-run-id']) {
    if (!RUN_ID_PATTERN.test(values.get(key))) fail('LFEA_WP8_RUN_ID_INVALID', { key });
  }
  return Object.freeze({
    repositoryRoot: REPOSITORY_ROOT,
    certificationRoot: path.resolve(values.get('certification-root')),
    reviewRoot: path.resolve(values.get('review-root')),
    reviewPath: values.get('review'),
    benchmarkPath: values.get('benchmarks'),
    antiDriftPath: values.get('anti-drift'),
    outputPath: path.resolve(values.get('output')),
    expectedHead,
    certificationRunId: values.get('certification-run-id'),
    certificationArtifactName: values.get('certification-artifact-name'),
    reviewRunId: values.get('review-run-id'),
    reviewArtifactName: values.get('review-artifact-name'),
  });
}

export function validateIndependentClosurePackage({
  repositoryRoot = REPOSITORY_ROOT,
  certificationRoot,
  reviewRoot,
  reviewPath,
  benchmarkPath,
  antiDriftPath,
  outputPath,
  expectedHead,
  certificationRunId,
  certificationArtifactName,
  reviewRunId,
  reviewArtifactName,
  reviewValidator = requirePhase6iIndependentClosureReview,
  benchmarkValidator = requirePhase6iBenchmarkReviewManifest,
  antiDriftValidator = requirePhase6iAntiDriftReviewManifest,
}) {
  if (expectedHead !== PHASE6I_FROZEN_CANDIDATE) {
    fail('LFEA_WP8_EXPECTED_HEAD_INVALID', { expectedHead });
  }
  requireRunIdentity(certificationRunId, certificationArtifactName, 'CERTIFICATION');
  requireRunIdentity(reviewRunId, reviewArtifactName, 'REVIEW');
  if (certificationRunId === reviewRunId) {
    fail('LFEA_WP8_REVIEW_CUSTODY_NOT_INDEPENDENT', { reviewRunId });
  }
  const repository = requireDirectory(repositoryRoot, 'LFEA_WP8_REPOSITORY_INVALID');
  const certification = requireDirectory(
    certificationRoot,
    'LFEA_WP8_CERTIFICATION_ROOT_INVALID',
  );
  const reviewSource = requireDirectory(reviewRoot, 'LFEA_WP8_REVIEW_ROOT_INVALID');
  if (certification === reviewSource
    || isWithin(repository, certification)
    || isWithin(certification, repository)
    || isWithin(repository, reviewSource)
    || isWithin(reviewSource, repository)) {
    fail('LFEA_WP8_ROOT_OVERLAP');
  }
  const output = requireNewOutput(repository, certification, reviewSource, outputPath);
  const reviewRelative = requireSafeJsonPath(reviewPath, 'LFEA_WP8_REVIEW_PATH_INVALID');
  const benchmarkRelative = requireSafeJsonPath(
    benchmarkPath,
    'LFEA_WP8_BENCHMARK_PATH_INVALID',
  );
  const antiDriftRelative = requireSafeJsonPath(
    antiDriftPath,
    'LFEA_WP8_ANTI_DRIFT_PATH_INVALID',
  );
  requireUniquePaths([reviewRelative, benchmarkRelative, antiDriftRelative]);

  const review = reviewValidator(readJson(
    resolveSourceFile(reviewSource, reviewRelative),
    'LFEA_WP8_REVIEW_JSON_INVALID',
  ));
  const benchmarks = benchmarkValidator(readJson(
    resolveSourceFile(reviewSource, benchmarkRelative),
    'LFEA_WP8_BENCHMARK_JSON_INVALID',
  ));
  const antiDrift = antiDriftValidator(readJson(
    resolveSourceFile(reviewSource, antiDriftRelative),
    'LFEA_WP8_ANTI_DRIFT_JSON_INVALID',
  ));
  const intakeRelative = requireSafeJsonPath(
    review.runtimeCertification.intakePath,
    'LFEA_WP8_INTAKE_PATH_INVALID',
  );
  const releaseValidationRelative = requireSafeJsonPath(
    review.runtimeCertification.releaseValidationPath,
    'LFEA_WP8_RELEASE_VALIDATION_PATH_INVALID',
  );
  requireUniquePaths([intakeRelative, releaseValidationRelative]);
  const intake = readJson(
    resolveSourceFile(certification, intakeRelative),
    'LFEA_WP8_INTAKE_JSON_INVALID',
  );
  const releaseValidation = readJson(
    resolveSourceFile(certification, releaseValidationRelative),
    'LFEA_WP8_RELEASE_VALIDATION_JSON_INVALID',
  );

  requireConsistency({
    expectedHead,
    review,
    benchmarks,
    antiDrift,
    reviewRelative,
    benchmarkRelative,
    antiDriftRelative,
    intake,
    intakeRelative,
    releaseValidation,
    releaseValidationRelative,
    certificationRunId,
    certificationArtifactName,
    reviewRunId,
  });

  const base = Object.freeze({
    schema: ACCEPTANCE_SCHEMA,
    status: 'ELIGIBLE_FOR_GOVERNANCE_CLOSURE_RECORDING',
    candidateSha: expectedHead,
    immutableRef: PHASE6I_IMMUTABLE_REF,
    certificationRunId,
    certificationArtifactName,
    reviewRunId,
    reviewArtifactName,
    reviewPath: reviewRelative,
    reviewContentHash: semanticHash(review),
    reviewSemanticHash: review.semanticHash,
    reviewEvidenceHash: review.evidenceHash,
    benchmarkManifestPath: benchmarkRelative,
    benchmarkManifestContentHash: semanticHash(benchmarks),
    benchmarkManifestSemanticHash: benchmarks.semanticHash,
    benchmarkManifestEvidenceHash: benchmarks.evidenceHash,
    antiDriftManifestPath: antiDriftRelative,
    antiDriftManifestContentHash: semanticHash(antiDrift),
    antiDriftManifestSemanticHash: antiDrift.semanticHash,
    antiDriftManifestEvidenceHash: antiDrift.evidenceHash,
    runtimeIntakePath: intakeRelative,
    runtimeIntakeContentHash: semanticHash(intake),
    releaseValidationPath: releaseValidationRelative,
    releaseValidationContentHash: semanticHash(releaseValidation),
    reviewerId: review.reviewer.reviewerId,
    audA7Disposition: review.audA7Disposition,
    releaseQualified: false,
  });
  const semantic = semanticHash(base);
  const result = Object.freeze({
    ...base,
    semanticHash: semantic,
    evidenceHash: semanticHash({ ...base, semanticHash: semantic }),
  });
  writeJson(output, result);
  return result;
}

function requireConsistency({
  expectedHead,
  review,
  benchmarks,
  antiDrift,
  reviewRelative,
  benchmarkRelative,
  antiDriftRelative,
  intake,
  intakeRelative,
  releaseValidation,
  releaseValidationRelative,
  certificationRunId,
  certificationArtifactName,
  reviewRunId,
}) {
  if (review.candidateSha !== expectedHead
    || benchmarks.candidateSha !== expectedHead
    || antiDrift.candidateSha !== expectedHead) {
    fail('LFEA_WP8_CANDIDATE_MISMATCH');
  }
  if (review.executionChain.phase6E.runId !== certificationRunId
    || review.executionChain.phase6E.artifactName !== certificationArtifactName) {
    fail('LFEA_WP8_CERTIFICATION_IDENTITY_MISMATCH');
  }
  const executionRunIds = Object.values(review.executionChain)
    .map((entry) => entry.runId);
  if (executionRunIds.includes(reviewRunId)) {
    fail('LFEA_WP8_REVIEW_CUSTODY_NOT_INDEPENDENT', { reviewRunId });
  }
  requireManifestMatch(review.benchmarkManifest, benchmarkRelative, benchmarks,
    'LFEA_WP8_BENCHMARK_IDENTITY_MISMATCH');
  requireManifestMatch(review.antiDriftManifest, antiDriftRelative, antiDrift,
    'LFEA_WP8_ANTI_DRIFT_IDENTITY_MISMATCH');
  if (review.runtimeCertification.intakePath !== intakeRelative
    || review.runtimeCertification.releaseValidationPath !== releaseValidationRelative
    || review.runtimeCertification.intakeContentHash !== semanticHash(intake)
    || review.runtimeCertification.releaseValidationContentHash
      !== semanticHash(releaseValidation)) {
    fail('LFEA_WP8_RUNTIME_CERTIFICATION_IDENTITY_MISMATCH');
  }
  if (intake.schema !== INTAKE_SCHEMA
    || intake.status !== 'ELIGIBLE_FOR_RUNTIME_RELEASE_VALIDATION'
    || intake.exactHead !== expectedHead
    || intake.releaseQualified !== false) {
    fail('LFEA_WP8_RUNTIME_INTAKE_INVALID');
  }
  if (releaseValidation.check !== 'lfea-piping-release-readiness'
    || releaseValidation.mode !== 'RELEASE'
    || releaseValidation.programDisposition !== 'QUALIFIED'
    || releaseValidation.exactHead !== expectedHead
    || releaseValidation.verifiedGateCount !== 11
    || releaseValidation.totalGateCount !== 11
    || releaseValidation.releaseEligible !== true
    || releaseValidation.qualificationHarness !== 'PERSISTED_RELEASE_EVIDENCE') {
    fail('LFEA_WP8_RELEASE_VALIDATION_INVALID');
  }
  if (reviewRelative === intakeRelative || reviewRelative === releaseValidationRelative) {
    fail('LFEA_WP8_CROSS_ARTIFACT_PATH_COLLISION');
  }
}

function requireManifestMatch(reference, relativePath, record, code) {
  if (reference.path !== relativePath
    || reference.contentHash !== semanticHash(record)
    || reference.semanticHash !== record.semanticHash
    || reference.evidenceHash !== record.evidenceHash) {
    fail(code);
  }
}

function requireRunIdentity(runId, artifactName, kind) {
  if (!RUN_ID_PATTERN.test(runId ?? '')
    || typeof artifactName !== 'string'
    || artifactName.trim() === ''
    || /[\\/]/u.test(artifactName)) {
    fail(`LFEA_WP8_${kind}_IDENTITY_INVALID`, { runId, artifactName });
  }
}

function requireUniquePaths(paths) {
  const folded = paths.map((value) => value.toLowerCase());
  if (new Set(folded).size !== folded.length) fail('LFEA_WP8_PATH_COLLISION');
}

function requireDirectory(value, code) {
  const absolute = path.resolve(value);
  if (!fs.existsSync(absolute)) fail(code, { value });
  const status = fs.lstatSync(absolute);
  if (status.isSymbolicLink() || !status.isDirectory()) fail(code, { value });
  return fs.realpathSync(absolute);
}

function requireSafeJsonPath(value, code) {
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
    fail('LFEA_WP8_SOURCE_FILE_INVALID', { relativePath });
  }
  const status = fs.lstatSync(absolute);
  if (status.isSymbolicLink() || !status.isFile()) {
    fail('LFEA_WP8_SOURCE_FILE_INVALID', { relativePath });
  }
  const real = fs.realpathSync(absolute);
  const realRelative = path.relative(root, real);
  if (realRelative.startsWith('..') || path.isAbsolute(realRelative)) {
    fail('LFEA_WP8_SOURCE_FILE_INVALID', { relativePath });
  }
  return real;
}

function requireNewOutput(repository, certification, reviewRoot, outputPath) {
  const output = path.resolve(outputPath);
  if (fs.existsSync(output)) fail('LFEA_WP8_OUTPUT_EXISTS', { output });
  const parent = requireDirectory(path.dirname(output), 'LFEA_WP8_OUTPUT_PARENT_INVALID');
  const resolved = path.join(parent, path.basename(output));
  for (const root of [repository, certification, reviewRoot]) {
    if (isWithin(root, resolved) || isWithin(resolved, root)) {
      fail('LFEA_WP8_OUTPUT_OVERLAP', { output: resolved, root });
    }
  }
  return resolved;
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
