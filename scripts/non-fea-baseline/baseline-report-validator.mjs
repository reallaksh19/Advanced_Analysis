import { deepFreeze } from '../../src/core/shared-piping-model/immutable.js';
import {
  NON_FEA_BASELINE_SCHEMA,
  NON_FEA_ROUTE_INVENTORY_SCHEMA,
  NON_FEA_STAGE_IDS,
  codeUnitCompare,
  requireExactKeys,
} from './contracts.mjs';
import { requiredNonFeaFixtureRoles } from './fixture-role-bindings.mjs';
import { NON_FEA_ENVIRONMENT_EVIDENCE_SCHEMA } from './environment-evidence.mjs';

const REPORT_KEYS = [
  'schema', 'status', 'planPreparationBaseSha', 'programmeBaseSha', 'exactHeadSha',
  'dirtyStatus', 'executionId', 'generatedAt', 'environment', 'routeInventory',
  'fixtureLedger', 'fixtureRoleBindings', 'fixtureRuns', 'stageStatistics',
  'commandRuns', 'failures', 'observabilityGaps', 'sourceMutationDisposition',
];
const SHA1 = /^[0-9a-f]{40}$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const SEMANTIC_HASH = /^fnv1a64:[0-9a-f]{16}$/u;

export function requireNonFeaBaselineReport(value) {
  requireExactKeys(value, REPORT_KEYS, 'nonFeaBaselineReport');
  if (value.schema !== NON_FEA_BASELINE_SCHEMA) fail('P0_REPORT_SCHEMA_INVALID');
  if (!['PASS', 'UNRESOLVED_GATE'].includes(value.status)) fail('P0_REPORT_STATUS_INVALID');
  requireSha1(value.planPreparationBaseSha, 'PLAN_PREPARATION_BASE_SHA');
  requireSha1(value.programmeBaseSha, 'PROGRAMME_BASE_SHA');
  requireSha1(value.exactHeadSha, 'EXACT_HEAD_SHA');
  if (typeof value.dirtyStatus !== 'string') fail('P0_REPORT_DIRTY_STATUS_INVALID');
  requireString(value.executionId, 'EXECUTION_ID');
  requireTimestamp(value.generatedAt);
  requireEnvironment(value.environment);
  requireRoutes(value.routeInventory);
  requireFixtureLedger(value.fixtureLedger);
  requireFixtureBindings(value.fixtureRoleBindings);
  requireFixtureRuns(value.fixtureRuns);
  requireStageStatistics(value.stageStatistics, value.fixtureRuns);
  requireCommands(value.commandRuns);
  requireFailures(value.failures);
  requireStringArray(value.observabilityGaps, 'OBSERVABILITY_GAPS');
  if (!['FAIL', 'NO_MUTATION_OBSERVED_IN_COMPLETED_SAMPLES'].includes(value.sourceMutationDisposition)) {
    fail('P0_REPORT_SOURCE_MUTATION_DISPOSITION_INVALID');
  }
  const shouldPass = value.failures.length === 0;
  if ((value.status === 'PASS') !== shouldPass) fail('P0_REPORT_STATUS_FAILURE_MISMATCH');
  return deepFreeze(value);
}

function requireEnvironment(value) {
  if (!value || value.schema !== NON_FEA_ENVIRONMENT_EVIDENCE_SCHEMA) fail('P0_REPORT_ENVIRONMENT_INVALID');
  requireString(value.nodeVersion, 'ENVIRONMENT_NODE_VERSION');
  requireString(value.v8Version, 'ENVIRONMENT_V8_VERSION');
  requireString(value.platform, 'ENVIRONMENT_PLATFORM');
  requireString(value.architecture, 'ENVIRONMENT_ARCHITECTURE');
  if (!Number.isInteger(value.cpuCount) || value.cpuCount <= 0) fail('P0_REPORT_ENVIRONMENT_INVALID');
  if (!Number.isInteger(value.logicalConcurrency) || value.logicalConcurrency <= 0) fail('P0_REPORT_ENVIRONMENT_INVALID');
  if (!Number.isInteger(value.totalMemoryBytes) || value.totalMemoryBytes <= 0) fail('P0_REPORT_ENVIRONMENT_INVALID');
  requireStringArray(value.cpuModels, 'ENVIRONMENT_CPU_MODELS');
}

function requireRoutes(value) {
  if (!value || value.schema !== NON_FEA_ROUTE_INVENTORY_SCHEMA || !Array.isArray(value.stages)) {
    fail('P0_REPORT_ROUTE_INVENTORY_INVALID');
  }
  if (typeof value.semanticHash !== 'string' || !SEMANTIC_HASH.test(value.semanticHash)) fail('P0_REPORT_ROUTE_HASH_INVALID');
  if (value.stages.length !== NON_FEA_STAGE_IDS.length) fail('P0_REPORT_ROUTE_COUNT_INVALID');
  const ids = value.stages.map((row) => row.stageId);
  requireUnique(ids, 'P0_REPORT_ROUTE_ID_DUPLICATE');
  if (JSON.stringify([...ids].sort(codeUnitCompare)) !== JSON.stringify([...NON_FEA_STAGE_IDS].sort(codeUnitCompare))) {
    fail('P0_REPORT_ROUTE_COVERAGE_INVALID');
  }
}

function requireFixtureLedger(rows) {
  if (!Array.isArray(rows)) fail('P0_REPORT_FIXTURE_LEDGER_INVALID');
  requireUnique(rows.map((row) => row.path), 'P0_REPORT_FIXTURE_PATH_DUPLICATE');
  rows.forEach((row) => {
    requireString(row.path, 'FIXTURE_PATH');
    if (!['PRESENT', 'MISSING'].includes(row.status)) fail('P0_REPORT_FIXTURE_STATUS_INVALID');
    if (row.status === 'PRESENT') requireSha256(row.sourceSha256, 'FIXTURE_SOURCE_SHA256');
  });
}

function requireFixtureBindings(rows) {
  if (!Array.isArray(rows)) fail('P0_REPORT_FIXTURE_BINDINGS_INVALID');
  const roles = rows.map((row) => row.role);
  requireUnique(roles, 'P0_REPORT_FIXTURE_ROLE_DUPLICATE');
  const expected = requiredNonFeaFixtureRoles().sort(codeUnitCompare);
  if (JSON.stringify([...roles].sort(codeUnitCompare)) !== JSON.stringify(expected)) fail('P0_REPORT_FIXTURE_ROLE_COVERAGE_INVALID');
}

function requireFixtureRuns(rows) {
  if (!Array.isArray(rows)) fail('P0_REPORT_FIXTURE_RUNS_INVALID');
  requireUnique(rows.map((row) => `${row.fixturePath}|${row.sampleKind}|${row.sampleIndex}`), 'P0_REPORT_FIXTURE_RUN_DUPLICATE');
  rows.forEach((row) => {
    requireString(row.fixturePath, 'FIXTURE_RUN_PATH');
    if (!['COLD', 'WARM'].includes(row.sampleKind)) fail('P0_REPORT_SAMPLE_KIND_INVALID');
    if (!Number.isInteger(row.sampleIndex) || row.sampleIndex < 0) fail('P0_REPORT_SAMPLE_INDEX_INVALID');
    requireSha256(row.sourceSha256, 'FIXTURE_RUN_SOURCE_SHA256');
  });
}

function requireStageStatistics(rows, runs) {
  if (!Array.isArray(rows)) fail('P0_REPORT_STAGE_STATISTICS_INVALID');
  const groupKeys = [...new Set(runs.map((row) => `${row.fixturePath}|${row.sampleKind}`))].sort(codeUnitCompare);
  const expectedKeys = groupKeys.flatMap((group) => NON_FEA_STAGE_IDS.map((stageId) => `${group}|${stageId}`)).sort(codeUnitCompare);
  const actualKeys = rows.map((row) => `${row.fixturePath}|${row.sampleKind}|${row.stageId}`).sort(codeUnitCompare);
  requireUnique(actualKeys, 'P0_REPORT_STAGE_STATISTIC_DUPLICATE');
  if (JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)) fail('P0_REPORT_STAGE_STATISTIC_COVERAGE_INVALID');
  rows.forEach((row) => {
    requireString(row.fixturePath, 'STAGE_STATISTIC_FIXTURE_PATH');
    if (!['COLD', 'WARM'].includes(row.sampleKind)) fail('P0_REPORT_STAGE_STATISTIC_SAMPLE_KIND_INVALID');
    if (!NON_FEA_STAGE_IDS.includes(row.stageId)) fail('P0_REPORT_STAGE_STATISTIC_ID_INVALID');
    if (!Number.isInteger(row.sampleCount) || row.sampleCount < 0) fail('P0_REPORT_STAGE_STATISTIC_VALUE_INVALID');
    const timings = [row.medianMs, row.p95Ms, row.maxMs];
    if (row.sampleCount === 0) {
      if (timings.some((value) => value !== null)) fail('P0_REPORT_STAGE_STATISTIC_EMPTY_VALUE_INVALID');
      return;
    }
    if (timings.some((value) => !Number.isFinite(value) || value < 0)) fail('P0_REPORT_STAGE_STATISTIC_VALUE_INVALID');
    if (row.maxMs < row.medianMs || row.p95Ms < row.medianMs || row.maxMs < row.p95Ms) {
      fail('P0_REPORT_STAGE_STATISTIC_ORDER_INVALID');
    }
  });
}

function requireCommands(rows) {
  if (!Array.isArray(rows)) fail('P0_REPORT_COMMANDS_INVALID');
  requireUnique(rows.map((row) => row.commandId), 'P0_REPORT_COMMAND_ID_DUPLICATE');
  rows.forEach((row) => {
    requireString(row.commandId, 'COMMAND_ID');
    if (!['PASS', 'FAIL', 'BLOCKED'].includes(row.status)) fail('P0_REPORT_COMMAND_STATUS_INVALID');
    requireSha256(row.outputSha256, 'COMMAND_OUTPUT_SHA256');
  });
}

function requireFailures(rows) {
  if (!Array.isArray(rows)) fail('P0_REPORT_FAILURES_INVALID');
  requireUnique(rows.map((row) => JSON.stringify(row)), 'P0_REPORT_FAILURE_DUPLICATE');
}

function requireTimestamp(value) {
  requireString(value, 'GENERATED_AT');
  if (new Date(value).toISOString() !== value) fail('P0_REPORT_TIMESTAMP_INVALID');
}
function requireSha1(value, label) { if (typeof value !== 'string' || !SHA1.test(value)) fail(`P0_REPORT_${label}_INVALID`); }
function requireSha256(value, label) { if (typeof value !== 'string' || !SHA256.test(value)) fail(`P0_REPORT_${label}_INVALID`); }
function requireString(value, label) { if (typeof value !== 'string' || value.trim() !== value || !value) fail(`P0_REPORT_${label}_INVALID`); }
function requireStringArray(value, label) { if (!Array.isArray(value) || value.some((row) => typeof row !== 'string')) fail(`P0_REPORT_${label}_INVALID`); }
function requireUnique(values, code) { if (new Set(values).size !== values.length) fail(code); }
function fail(code) { const error = new Error(code); error.code = code; throw error; }
