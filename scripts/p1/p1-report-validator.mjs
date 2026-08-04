import { canonicalStringify } from '../../src/core/shared-piping-model/canonical-json.js';
import { deepFreeze } from '../../src/core/shared-piping-model/immutable.js';
import { requireP1BrowserEvidence } from './p1-browser-run-validator.mjs';
import {
  P1_QUALIFICATION_SCHEMA,
  P1_QUALIFICATION_STATUSES,
  P1_REQUIRED_P0_STAGE_IDS,
  P1_THRESHOLDS,
  requireExactKeys,
  requireIntegerNonNegative,
  requireNullableFiniteNonNegative,
  requireNullableString,
  requireSha1,
  requireSha256,
  requireString,
  requireTimestamp,
} from './p1-contracts.mjs';
import { requireP1InvalidationEvidence } from './p1-invalidation-recorder.mjs';
import { requireP1ProtectedManifest } from './p1-protected-manifest-validator.mjs';
import { evaluateP1QualificationEvidence } from './p1-qualification-evaluator.mjs';

const REPORT_KEYS = [
  'schema', 'status', 'exactHeadSha', 'baseCommitSha', 'executionId',
  'generatedAt', 'p0Evidence', 'fixture', 'thresholds', 'stageStatistics',
  'browserEvidence', 'invalidationEvidence', 'protectedManifest', 'violations',
  'recommendedFixes', 'failures',
];
const P0_KEYS = [
  'reportPath', 'reportSha256', 'reportStatus', 'exactHeadSha', 'accepted',
  'acceptancePath', 'acceptanceStatus',
];
const FIXTURE_KEYS = ['role', 'path', 'sourceSha256', 'authorityStatus'];
const STAGE_KEYS = [
  'fixturePath', 'sampleKind', 'stageId', 'sampleCount', 'medianMs', 'p95Ms', 'maxMs',
];
const VIOLATION_KEYS = ['metric', 'threshold', 'observed', 'comparison', 'evidence'];
const RECOMMENDATION_KEYS = ['rank', 'fixId', 'rationale', 'allowedWriteSet', 'blockedBy'];
const FAILURE_KEYS = ['code', 'message', 'details'];

export function requireP1QualificationReport(value) {
  requireExactKeys(value, REPORT_KEYS, 'p1QualificationReport');
  if (value.schema !== P1_QUALIFICATION_SCHEMA) fail('P1_REPORT_SCHEMA_INVALID');
  if (!P1_QUALIFICATION_STATUSES.includes(value.status)) fail('P1_REPORT_STATUS_INVALID');
  requireSha1(value.exactHeadSha, 'report.exactHeadSha');
  requireSha1(value.baseCommitSha, 'report.baseCommitSha');
  requireString(value.executionId, 'report.executionId');
  requireTimestamp(value.generatedAt, 'report.generatedAt');
  requireP0Evidence(value.p0Evidence);
  requireFixture(value.fixture);
  requireThresholds(value.thresholds);
  requireStageStatistics(value.stageStatistics);
  if (value.browserEvidence !== null) requireP1BrowserEvidence(value.browserEvidence);
  if (value.invalidationEvidence !== null) requireP1InvalidationEvidence(value.invalidationEvidence);
  if (value.protectedManifest !== null) requireP1ProtectedManifest(value.protectedManifest);
  requireRows(value.violations, VIOLATION_KEYS, 'violations');
  requireRows(value.recommendedFixes, RECOMMENDATION_KEYS, 'recommendedFixes');
  requireFailures(value.failures);
  validateCrossFields(value);
  return deepFreeze(value);
}

export { requireP1BrowserEvidence };

function requireP0Evidence(value) {
  requireExactKeys(value, P0_KEYS, 'p0Evidence');
  requireString(value.reportPath, 'p0Evidence.reportPath');
  requireSha256(value.reportSha256, 'p0Evidence.reportSha256');
  requireNullableString(value.reportStatus, 'p0Evidence.reportStatus');
  requireNullableString(value.exactHeadSha, 'p0Evidence.exactHeadSha');
  if (value.exactHeadSha !== null) requireSha1(value.exactHeadSha, 'p0Evidence.exactHeadSha');
  if (typeof value.accepted !== 'boolean') fail('P1_P0_ACCEPTED_INVALID');
  requireNullableString(value.acceptancePath, 'p0Evidence.acceptancePath');
  requireNullableString(value.acceptanceStatus, 'p0Evidence.acceptanceStatus');
}
function requireFixture(value) {
  requireExactKeys(value, FIXTURE_KEYS, 'fixture');
  requireString(value.role, 'fixture.role');
  requireNullableString(value.path, 'fixture.path');
  if (value.sourceSha256 !== null) requireSha256(value.sourceSha256, 'fixture.sourceSha256');
  requireString(value.authorityStatus, 'fixture.authorityStatus');
}
function requireThresholds(value) {
  requireExactKeys(value, Object.keys(P1_THRESHOLDS), 'thresholds');
  Object.entries(P1_THRESHOLDS).forEach(([key, expected]) => {
    if (value[key] !== expected) fail(`P1_THRESHOLD_DRIFT_${key.toUpperCase()}`);
  });
}
function requireStageStatistics(rows) {
  if (!Array.isArray(rows)) fail('P1_STAGE_STATISTICS_INVALID');
  const keys = [];
  rows.forEach((row, index) => {
    requireExactKeys(row, STAGE_KEYS, `stageStatistics[${index}]`);
    requireString(row.fixturePath, `stageStatistics[${index}].fixturePath`);
    if (!['COLD', 'WARM'].includes(row.sampleKind)) fail('P1_STAGE_SAMPLE_KIND_INVALID');
    requireString(row.stageId, `stageStatistics[${index}].stageId`);
    requireIntegerNonNegative(row.sampleCount, `stageStatistics[${index}].sampleCount`);
    ['medianMs', 'p95Ms', 'maxMs'].forEach((key) =>
      requireNullableFiniteNonNegative(row[key], `stageStatistics[${index}].${key}`));
    keys.push(`${row.fixturePath}\u0000${row.sampleKind}\u0000${row.stageId}`);
  });
  if (new Set(keys).size !== keys.length) fail('P1_STAGE_STATISTIC_DUPLICATE');
}
function requireRows(rows, keys, label) {
  if (!Array.isArray(rows)) fail(`P1_${label.toUpperCase()}_INVALID`);
  rows.forEach((row, index) => requireExactKeys(row, keys, `${label}[${index}]`));
}
function requireFailures(rows) {
  requireRows(rows, FAILURE_KEYS, 'failures');
  rows.forEach((row) => {
    requireString(row.code, 'failure.code');
    requireString(row.message, 'failure.message');
    if (row.details !== null
        && (!row.details || typeof row.details !== 'object' || Array.isArray(row.details))) {
      fail('P1_FAILURE_DETAILS_INVALID');
    }
  });
  const keys = rows.map((row) => canonicalStringify(row));
  if (new Set(keys).size !== keys.length) fail('P1_FAILURE_DUPLICATE');
}
function validateCrossFields(report) {
  validateBrowserCustody(report);
  validateManifestCustody(report);
  const evaluation = evaluateP1QualificationEvidence({
    p0Report: null,
    stageStatistics: report.stageStatistics,
    browserEvidence: report.browserEvidence,
    invalidationEvidence: report.invalidationEvidence,
  });
  if (canonicalStringify(report.violations) !== canonicalStringify(evaluation.violations)) {
    fail('P1_REPORT_VIOLATION_RECOMPUTATION_MISMATCH');
  }
  if (canonicalStringify(report.recommendedFixes)
      !== canonicalStringify(evaluation.recommendedFixes)) {
    fail('P1_REPORT_RECOMMENDATION_RECOMPUTATION_MISMATCH');
  }
  requireEvaluationFailures(report.failures, evaluation.failures);

  const complete = hasCompleteAuthority(report)
    && hasCompleteStageStatistics(report.stageStatistics, report.fixture.path);
  const expectedStatus = report.failures.length
    ? 'BLOCKED'
    : report.violations.length
      ? 'QUALIFIED_FOR_FIX'
      : 'NO_THRESHOLD_VIOLATION';
  if (report.status !== expectedStatus) fail('P1_REPORT_STATUS_RECOMPUTATION_MISMATCH');
  if (report.status !== 'BLOCKED' && !complete) {
    fail('P1_REPORT_NONBLOCKED_WITH_INCOMPLETE_EVIDENCE');
  }
}
function validateBrowserCustody(report) {
  const browser = report.browserEvidence;
  if (!browser) return;
  if (browser.executionId !== report.executionId) fail('P1_BROWSER_EXECUTION_MISMATCH');
  if (browser.exactHeadSha !== report.exactHeadSha) fail('P1_BROWSER_HEAD_MISMATCH');
  if (browser.fixtureRole !== report.fixture.role) fail('P1_BROWSER_FIXTURE_ROLE_MISMATCH');
  if (browser.fixturePath !== report.fixture.path) fail('P1_BROWSER_FIXTURE_PATH_MISMATCH');
  if (browser.sourceSha256 !== report.fixture.sourceSha256) fail('P1_BROWSER_FIXTURE_SHA_MISMATCH');
  if (canonicalStringify(browser.invalidationEvidence)
      !== canonicalStringify(report.invalidationEvidence)) {
    fail('P1_BROWSER_INVALIDATION_CONTENT_MISMATCH');
  }
}
function validateManifestCustody(report) {
  const manifest = report.protectedManifest;
  if (!manifest) return;
  if (manifest.executionId !== report.executionId) fail('P1_MANIFEST_EXECUTION_MISMATCH');
  if (manifest.exactHeadSha !== report.exactHeadSha) fail('P1_MANIFEST_HEAD_MISMATCH');
  if (manifest.fixtureRole !== report.fixture.role) fail('P1_MANIFEST_FIXTURE_ROLE_MISMATCH');
  if (manifest.fixturePath !== report.fixture.path) fail('P1_MANIFEST_FIXTURE_PATH_MISMATCH');
  if (manifest.sourceSha256 !== report.fixture.sourceSha256) fail('P1_MANIFEST_FIXTURE_SHA_MISMATCH');
}
function requireEvaluationFailures(actual, required) {
  const keys = new Set(actual.map((row) => canonicalStringify(row)));
  if (required.some((row) => !keys.has(canonicalStringify(row)))) {
    fail('P1_REPORT_REQUIRED_FAILURE_MISSING');
  }
}
function hasCompleteAuthority(report) {
  return report.p0Evidence.accepted
    && report.p0Evidence.reportStatus === 'PASS'
    && report.p0Evidence.acceptanceStatus === 'ACCEPTED'
    && report.p0Evidence.exactHeadSha !== null
    && report.fixture.authorityStatus === 'VERIFIED'
    && report.browserEvidence !== null
    && report.invalidationEvidence !== null
    && report.protectedManifest !== null
    && report.browserEvidence.observabilityGaps.length === 0;
}
function hasCompleteStageStatistics(rows, fixturePath) {
  return P1_REQUIRED_P0_STAGE_IDS.every((stageId) => ['COLD', 'WARM'].every(
    (sampleKind) => rows.some((row) => row.fixturePath === fixturePath
      && row.sampleKind === sampleKind && row.stageId === stageId
      && row.sampleCount > 0 && Number.isFinite(row.p95Ms)),
  ));
}
function fail(code) { const error = new Error(code); error.code = code; throw error; }
