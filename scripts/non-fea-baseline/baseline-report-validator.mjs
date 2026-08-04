import { semanticHash } from '../../src/core/shared-piping-model/canonical-json.js';
import { deepFreeze } from '../../src/core/shared-piping-model/immutable.js';
import {
  NON_FEA_BASELINE_SCHEMA,
  NON_FEA_FAILURE_CLASSIFICATIONS,
  NON_FEA_PROCESS_LOG_SCHEMA,
  NON_FEA_ROUTE_INVENTORY_SCHEMA,
  NON_FEA_STAGE_IDS,
  codeUnitCompare,
  requireExactKeys,
} from './contracts.mjs';
import { requiredNonFeaFixtureRoles } from './fixture-role-bindings.mjs';
import { NON_FEA_ENVIRONMENT_EVIDENCE_SCHEMA } from './environment-evidence.mjs';
import { nonFeaP0CommandIds } from './command-ladder.mjs';
import { requireNonFeaBrowserEvidence } from './browser-baseline.mjs';

const REPORT_KEYS = [
  'schema', 'status', 'planPreparationBaseSha', 'programmeBaseSha', 'exactHeadSha',
  'dirtyStatus', 'executionId', 'generatedAt', 'environment', 'routeInventory',
  'fixtureLedger', 'fixtureRoleBindings', 'fixtureRuns', 'stageStatistics',
  'browserEvidence', 'commandRuns', 'failures', 'observabilityGaps',
  'sourceMutationDisposition',
];
const ENVIRONMENT_KEYS = [
  'schema', 'nodeVersion', 'v8Version', 'platform', 'architecture', 'cpuCount',
  'cpuModels', 'totalMemoryBytes', 'logicalConcurrency', 'ci', 'timezone',
  'language', 'nodeOptions',
];
const ROUTE_KEYS = ['schema', 'programme', 'p0Authority', 'stages', 'semanticHash'];
const ROUTE_STAGE_KEYS = [
  'stageId', 'entryPoint', 'owningFile', 'inputSchema', 'outputSchema', 'trigger',
  'sourceMutation', 'workspaceMutation', 'mainThread', 'repeatCondition',
  'cacheRule', 'currentCoverage', 'currentIssueOrPr', 'presentDefectOrUncertainty',
  'intendedOwner', 'forbiddenParallelOwner',
];
const FIXTURE_LEDGER_KEYS = [
  'path', 'byteLength', 'status', 'sourceSha256', 'declaredUse',
  'realOrSimulated', 'expectedIdentity', 'authorityNotes',
];
const FIXTURE_BINDING_KEYS = [
  'role', 'sourceKind', 'path', 'bindingSource', 'status', 'sourceSha256',
  'expectedSourceSha256', 'actualIdentity', 'expectedIdentity', 'authoritySource',
];
const FIXTURE_RUN_KEYS = [
  'schema', 'executionId', 'fixturePath', 'sampleKind', 'sampleIndex', 'records',
  'failures', 'identity', 'products', 'sourceHashes',
];
const STAGE_STATISTIC_KEYS = [
  'fixturePath', 'sampleKind', 'stageId', 'sampleCount', 'medianMs', 'p95Ms', 'maxMs',
];
const COMMAND_KEYS = [
  'commandId', 'command', 'status', 'exitCode', 'durationMs', 'outputSha256',
  'outputTail', 'error',
];
const FAILURE_KEYS = ['classification', 'code', 'message', 'stageId', 'details'];
const SHA1 = /^[0-9a-f]{40}$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const SEMANTIC_HASH = /^fnv1a64:[0-9a-f]{16}$/u;
const BINDING_STATUSES = [
  'UNBOUND', 'MISSING', 'NOT_EXECUTED', 'CAPTURED_PENDING_OWNER_ACCEPTANCE',
  'MISMATCH', 'VERIFIED',
];

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
  requireFixtureRuns(value.fixtureRuns, value.executionId);
  requireStageStatistics(value.stageStatistics, value.fixtureRuns);
  requireFailures(value.failures);
  requireBrowserEvidence(value.browserEvidence, value);
  requireCommands(value.commandRuns, value.failures);
  requireStringArray(value.observabilityGaps, 'OBSERVABILITY_GAPS');
  requireSourceMutationDisposition(value.sourceMutationDisposition, value.failures);
  requireDirtyDisposition(value.dirtyStatus, value.failures);
  const shouldPass = value.failures.length === 0;
  if ((value.status === 'PASS') !== shouldPass) fail('P0_REPORT_STATUS_FAILURE_MISMATCH');
  if (value.status === 'PASS') requirePassCompleteness(value);
  return deepFreeze(value);
}

function requireEnvironment(value) {
  requireExactKeys(value, ENVIRONMENT_KEYS, 'environmentEvidence');
  if (value.schema !== NON_FEA_ENVIRONMENT_EVIDENCE_SCHEMA) {
    fail('P0_REPORT_ENVIRONMENT_INVALID');
  }
  requireString(value.nodeVersion, 'ENVIRONMENT_NODE_VERSION');
  requireString(value.v8Version, 'ENVIRONMENT_V8_VERSION');
  requireString(value.platform, 'ENVIRONMENT_PLATFORM');
  requireString(value.architecture, 'ENVIRONMENT_ARCHITECTURE');
  if (!Number.isInteger(value.cpuCount) || value.cpuCount <= 0) {
    fail('P0_REPORT_ENVIRONMENT_INVALID');
  }
  if (!Number.isInteger(value.logicalConcurrency) || value.logicalConcurrency <= 0) {
    fail('P0_REPORT_ENVIRONMENT_INVALID');
  }
  if (!Number.isSafeInteger(value.totalMemoryBytes) || value.totalMemoryBytes <= 0) {
    fail('P0_REPORT_ENVIRONMENT_INVALID');
  }
  requireStringArray(value.cpuModels, 'ENVIRONMENT_CPU_MODELS');
  if (!value.cpuModels.length) fail('P0_REPORT_ENVIRONMENT_CPU_MODELS_INVALID');
  if (![true, false, null].includes(value.ci)) fail('P0_REPORT_ENVIRONMENT_CI_INVALID');
  ['timezone', 'language', 'nodeOptions'].forEach((key) => requireNullableString(value[key], `ENVIRONMENT_${key.toUpperCase()}`));
}

function requireRoutes(value) {
  requireExactKeys(value, ROUTE_KEYS, 'routeInventory');
  if (value.schema !== NON_FEA_ROUTE_INVENTORY_SCHEMA || !Array.isArray(value.stages)) {
    fail('P0_REPORT_ROUTE_INVENTORY_INVALID');
  }
  requireString(value.programme, 'ROUTE_PROGRAMME');
  requireString(value.p0Authority, 'ROUTE_P0_AUTHORITY');
  if (typeof value.semanticHash !== 'string' || !SEMANTIC_HASH.test(value.semanticHash)) {
    fail('P0_REPORT_ROUTE_HASH_INVALID');
  }
  const semanticMaterial = {
    schema: value.schema,
    programme: value.programme,
    p0Authority: value.p0Authority,
    stages: value.stages,
  };
  if (semanticHash(semanticMaterial) !== value.semanticHash) fail('P0_REPORT_ROUTE_HASH_MISMATCH');
  if (value.stages.length !== NON_FEA_STAGE_IDS.length) fail('P0_REPORT_ROUTE_COUNT_INVALID');
  value.stages.forEach((row) => {
    requireExactKeys(row, ROUTE_STAGE_KEYS, 'routeStage');
    ROUTE_STAGE_KEYS.filter((key) => !['sourceMutation', 'workspaceMutation'].includes(key))
      .forEach((key) => requireString(row[key], `ROUTE_STAGE_${key.toUpperCase()}`));
    if (row.sourceMutation !== false || typeof row.workspaceMutation !== 'boolean') {
      fail('P0_REPORT_ROUTE_MUTATION_INVALID');
    }
  });
  const ids = value.stages.map((row) => row.stageId);
  requireUnique(ids, 'P0_REPORT_ROUTE_ID_DUPLICATE');
  if (!sameSorted(ids, NON_FEA_STAGE_IDS)) fail('P0_REPORT_ROUTE_COVERAGE_INVALID');
}

function requireFixtureLedger(rows) {
  if (!Array.isArray(rows)) fail('P0_REPORT_FIXTURE_LEDGER_INVALID');
  rows.forEach((row) => {
    requireExactKeys(row, FIXTURE_LEDGER_KEYS, 'fixtureLedgerRow');
    requireString(row.path, 'FIXTURE_PATH');
    if (!['PRESENT', 'MISSING'].includes(row.status)) fail('P0_REPORT_FIXTURE_STATUS_INVALID');
    if (row.status === 'PRESENT') {
      if (!Number.isSafeInteger(row.byteLength) || row.byteLength < 0) {
        fail('P0_REPORT_FIXTURE_BYTE_LENGTH_INVALID');
      }
      requireSha256(row.sourceSha256, 'FIXTURE_SOURCE_SHA256');
    } else if (row.byteLength !== null || row.sourceSha256 !== null) {
      fail('P0_REPORT_MISSING_FIXTURE_EVIDENCE_INVALID');
    }
    requireStringArray(row.declaredUse, 'FIXTURE_DECLARED_USE');
    requireString(row.realOrSimulated, 'FIXTURE_REAL_OR_SIMULATED');
    requireRecord(row.expectedIdentity, 'FIXTURE_EXPECTED_IDENTITY');
    requireStringArray(row.authorityNotes, 'FIXTURE_AUTHORITY_NOTES');
  });
  requireUnique(rows.map((row) => row.path), 'P0_REPORT_FIXTURE_PATH_DUPLICATE');
}

function requireFixtureBindings(rows) {
  if (!Array.isArray(rows)) fail('P0_REPORT_FIXTURE_BINDINGS_INVALID');
  rows.forEach((row) => {
    requireExactKeys(row, FIXTURE_BINDING_KEYS, 'fixtureBinding');
    requireString(row.role, 'FIXTURE_ROLE');
    requireString(row.sourceKind, 'FIXTURE_SOURCE_KIND');
    requireNullableString(row.path, 'FIXTURE_BINDING_PATH');
    requireString(row.bindingSource, 'FIXTURE_BINDING_SOURCE');
    if (!BINDING_STATUSES.includes(row.status)) fail('P0_REPORT_FIXTURE_BINDING_STATUS_INVALID');
    requireNullableSha256(row.sourceSha256, 'FIXTURE_BINDING_SOURCE_SHA256');
    requireNullableSha256(row.expectedSourceSha256, 'FIXTURE_BINDING_EXPECTED_SHA256');
    requireRecord(row.actualIdentity, 'FIXTURE_ACTUAL_IDENTITY');
    requireRecord(row.expectedIdentity, 'FIXTURE_EXPECTED_IDENTITY');
    requireExactKeys(row.authoritySource, ['path', 'evidence'], 'fixtureAuthoritySource');
    requireString(row.authoritySource.path, 'FIXTURE_AUTHORITY_PATH');
    requireString(row.authoritySource.evidence, 'FIXTURE_AUTHORITY_EVIDENCE');
    if (row.status === 'VERIFIED') {
      requireString(row.path, 'VERIFIED_FIXTURE_PATH');
      requireSha256(row.sourceSha256, 'VERIFIED_FIXTURE_SOURCE_SHA256');
      requireSha256(row.expectedSourceSha256, 'VERIFIED_FIXTURE_EXPECTED_SHA256');
      if (row.sourceSha256 !== row.expectedSourceSha256) fail('P0_REPORT_VERIFIED_FIXTURE_SHA_MISMATCH');
      if (JSON.stringify(row.actualIdentity) !== JSON.stringify(row.expectedIdentity)) {
        fail('P0_REPORT_VERIFIED_FIXTURE_IDENTITY_MISMATCH');
      }
    }
  });
  const roles = rows.map((row) => row.role);
  requireUnique(roles, 'P0_REPORT_FIXTURE_ROLE_DUPLICATE');
  if (!sameSorted(roles, requiredNonFeaFixtureRoles())) {
    fail('P0_REPORT_FIXTURE_ROLE_COVERAGE_INVALID');
  }
}

function requireFixtureRuns(rows, executionId) {
  if (!Array.isArray(rows)) fail('P0_REPORT_FIXTURE_RUNS_INVALID');
  rows.forEach((row) => {
    requireExactKeys(row, FIXTURE_RUN_KEYS, 'fixtureRun');
    if (row.schema !== NON_FEA_PROCESS_LOG_SCHEMA) fail('P0_REPORT_FIXTURE_RUN_SCHEMA_INVALID');
    if (row.executionId !== executionId) fail('P0_REPORT_FIXTURE_RUN_EXECUTION_ID_MISMATCH');
    requireString(row.fixturePath, 'FIXTURE_RUN_PATH');
    if (!['COLD', 'WARM'].includes(row.sampleKind)) fail('P0_REPORT_SAMPLE_KIND_INVALID');
    if (!Number.isInteger(row.sampleIndex) || row.sampleIndex < 0) {
      fail('P0_REPORT_SAMPLE_INDEX_INVALID');
    }
    requireRecord(row.identity, 'FIXTURE_RUN_IDENTITY');
    requireRecord(row.products, 'FIXTURE_RUN_PRODUCTS');
    requireExactKeys(row.sourceHashes, ['before', 'after', 'bytes'], 'fixtureSourceHashes');
    ['before', 'after'].forEach((key) => requireNullableSemanticHash(row.sourceHashes[key], `FIXTURE_RUN_SOURCE_${key.toUpperCase()}`));
    requireNullableSha256(row.sourceHashes.bytes, 'FIXTURE_RUN_SOURCE_BYTES');
    requireFailures(row.failures);
    requireStageRecords(row.records);
  });
  requireUnique(
    rows.map((row) => `${row.fixturePath}|${row.sampleKind}|${row.sampleIndex}`),
    'P0_REPORT_FIXTURE_RUN_DUPLICATE',
  );
}

function requireStageRecords(rows) {
  if (!Array.isArray(rows)) fail('P0_REPORT_STAGE_RECORDS_INVALID');
  rows.forEach((row) => {
    const expected = row.status === 'FAIL'
      ? ['stageId', 'status', 'durationMs', 'evidence', 'failure']
      : ['stageId', 'status', 'durationMs', 'evidence'];
    requireExactKeys(row, expected, 'stageRecord');
    if (!NON_FEA_STAGE_IDS.includes(row.stageId)) fail('P0_REPORT_STAGE_RECORD_ID_INVALID');
    if (!['PASS', 'FAIL', 'BLOCKED'].includes(row.status)) fail('P0_REPORT_STAGE_RECORD_STATUS_INVALID');
    requireRecord(row.evidence, 'STAGE_RECORD_EVIDENCE');
    if (row.status === 'BLOCKED') {
      if (row.durationMs !== null) fail('P0_REPORT_BLOCKED_STAGE_DURATION_INVALID');
    } else if (!Number.isFinite(row.durationMs) || row.durationMs < 0) {
      fail('P0_REPORT_STAGE_RECORD_DURATION_INVALID');
    }
    if (row.status === 'FAIL') requireFailure(row.failure);
  });
  requireUnique(rows.map((row) => row.stageId), 'P0_REPORT_STAGE_RECORD_DUPLICATE');
}

function requireStageStatistics(rows, runs) {
  if (!Array.isArray(rows)) fail('P0_REPORT_STAGE_STATISTICS_INVALID');
  const groupKeys = [...new Set(runs.map((row) => `${row.fixturePath}|${row.sampleKind}`))]
    .sort(codeUnitCompare);
  const expectedKeys = groupKeys.flatMap((group) => (
    NON_FEA_STAGE_IDS.map((stageId) => `${group}|${stageId}`)
  )).sort(codeUnitCompare);
  const actualKeys = rows.map((row) => (
    `${row.fixturePath}|${row.sampleKind}|${row.stageId}`
  )).sort(codeUnitCompare);
  requireUnique(actualKeys, 'P0_REPORT_STAGE_STATISTIC_DUPLICATE');
  if (JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)) {
    fail('P0_REPORT_STAGE_STATISTIC_COVERAGE_INVALID');
  }
  rows.forEach((row) => {
    requireExactKeys(row, STAGE_STATISTIC_KEYS, 'stageStatistic');
    requireString(row.fixturePath, 'STAGE_STATISTIC_FIXTURE_PATH');
    if (!['COLD', 'WARM'].includes(row.sampleKind)) {
      fail('P0_REPORT_STAGE_STATISTIC_SAMPLE_KIND_INVALID');
    }
    if (!NON_FEA_STAGE_IDS.includes(row.stageId)) fail('P0_REPORT_STAGE_STATISTIC_ID_INVALID');
    if (!Number.isInteger(row.sampleCount) || row.sampleCount < 0) {
      fail('P0_REPORT_STAGE_STATISTIC_VALUE_INVALID');
    }
    const expectedCount = runs.filter((run) => (
      run.fixturePath === row.fixturePath && run.sampleKind === row.sampleKind
    )).reduce((count, run) => count + run.records.filter((record) => (
      record.stageId === row.stageId && record.status === 'PASS'
      && Number.isFinite(record.durationMs)
    )).length, 0);
    if (row.sampleCount !== expectedCount) fail('P0_REPORT_STAGE_STATISTIC_SAMPLE_COUNT_MISMATCH');
    const timings = [row.medianMs, row.p95Ms, row.maxMs];
    if (row.sampleCount === 0) {
      if (timings.some((item) => item !== null)) {
        fail('P0_REPORT_STAGE_STATISTIC_EMPTY_VALUE_INVALID');
      }
      return;
    }
    if (timings.some((item) => !Number.isFinite(item) || item < 0)) {
      fail('P0_REPORT_STAGE_STATISTIC_VALUE_INVALID');
    }
    if (row.maxMs < row.medianMs || row.p95Ms < row.medianMs || row.maxMs < row.p95Ms) {
      fail('P0_REPORT_STAGE_STATISTIC_ORDER_INVALID');
    }
  });
}

function requireBrowserEvidence(value, report) {
  if (value === null) {
    if (!hasFailure(report.failures, 'P0_BROWSER_LEDGER_NOT_PROVIDED')) {
      fail('P0_REPORT_BROWSER_LEDGER_FAILURE_MISSING');
    }
    return;
  }
  requireNonFeaBrowserEvidence(value, {
    executionId: report.executionId,
    exactHeadSha: report.exactHeadSha,
    fixtureRole: 'LARGE_MODEL_4884_ENTITY',
  });
}

function requireCommands(rows, failures) {
  if (!Array.isArray(rows)) fail('P0_REPORT_COMMANDS_INVALID');
  rows.forEach((row) => {
    requireExactKeys(row, COMMAND_KEYS, 'commandEvidence');
    requireString(row.commandId, 'COMMAND_ID');
    requireString(row.command, 'COMMAND');
    if (!['PASS', 'FAIL', 'BLOCKED'].includes(row.status)) fail('P0_REPORT_COMMAND_STATUS_INVALID');
    if (row.exitCode !== null && !Number.isInteger(row.exitCode)) fail('P0_REPORT_COMMAND_EXIT_CODE_INVALID');
    if (!Number.isFinite(row.durationMs) || row.durationMs < 0) fail('P0_REPORT_COMMAND_DURATION_INVALID');
    requireSha256(row.outputSha256, 'COMMAND_OUTPUT_SHA256');
    requireStringArray(row.outputTail, 'COMMAND_OUTPUT_TAIL');
    requireNullableString(row.error, 'COMMAND_ERROR');
    if (row.status === 'PASS' && (row.exitCode !== 0 || row.error !== null)) {
      fail('P0_REPORT_PASS_COMMAND_EVIDENCE_INVALID');
    }
    if (row.status === 'BLOCKED' && row.error === null) fail('P0_REPORT_BLOCKED_COMMAND_ERROR_MISSING');
  });
  const ids = rows.map((row) => row.commandId);
  requireUnique(ids, 'P0_REPORT_COMMAND_ID_DUPLICATE');
  if (!rows.length) {
    if (!hasFailure(failures, 'P0_COMMAND_LADDER_NOT_EXECUTED')) {
      fail('P0_REPORT_COMMAND_LADDER_FAILURE_MISSING');
    }
  } else if (!sameSorted(ids, nonFeaP0CommandIds())) {
    fail('P0_REPORT_COMMAND_COVERAGE_INVALID');
  }
}

function requireFailures(rows) {
  if (!Array.isArray(rows)) fail('P0_REPORT_FAILURES_INVALID');
  rows.forEach(requireFailure);
  requireUnique(rows.map((row) => JSON.stringify(row)), 'P0_REPORT_FAILURE_DUPLICATE');
}
function requireFailure(row) {
  requireExactKeys(row, FAILURE_KEYS, 'failure');
  if (!NON_FEA_FAILURE_CLASSIFICATIONS.includes(row.classification)) {
    fail('P0_REPORT_FAILURE_CLASSIFICATION_INVALID');
  }
  requireString(row.code, 'FAILURE_CODE');
  requireString(row.message, 'FAILURE_MESSAGE');
  if (row.stageId !== null && !NON_FEA_STAGE_IDS.includes(row.stageId)) {
    fail('P0_REPORT_FAILURE_STAGE_INVALID');
  }
}

function requireSourceMutationDisposition(disposition, failures) {
  if (!['FAIL', 'NO_MUTATION_OBSERVED_IN_COMPLETED_SAMPLES'].includes(disposition)) {
    fail('P0_REPORT_SOURCE_MUTATION_DISPOSITION_INVALID');
  }
  const mutationFailure = hasFailure(failures, 'P0_SOURCE_MUTATED');
  if ((disposition === 'FAIL') !== mutationFailure) {
    fail('P0_REPORT_SOURCE_MUTATION_FAILURE_MISMATCH');
  }
}
function requireDirtyDisposition(dirtyStatus, failures) {
  const dirtyFailure = hasFailure(failures, 'P0_WORKTREE_DIRTY');
  if (Boolean(dirtyStatus) !== dirtyFailure) fail('P0_REPORT_DIRTY_FAILURE_MISMATCH');
}
function requirePassCompleteness(value) {
  if (value.dirtyStatus || value.browserEvidence === null) fail('P0_REPORT_PASS_EVIDENCE_INCOMPLETE');
  if (!value.fixtureRoleBindings.every((row) => row.status === 'VERIFIED')) {
    fail('P0_REPORT_PASS_FIXTURE_AUTHORITY_INCOMPLETE');
  }
  if (!value.commandRuns.length || value.commandRuns.some((row) => row.status !== 'PASS')) {
    fail('P0_REPORT_PASS_COMMANDS_INCOMPLETE');
  }
}

function requireTimestamp(value) {
  requireString(value, 'GENERATED_AT');
  try {
    if (new Date(value).toISOString() !== value) fail('P0_REPORT_TIMESTAMP_INVALID');
  } catch {
    fail('P0_REPORT_TIMESTAMP_INVALID');
  }
}
function requireRecord(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`P0_REPORT_${label}_INVALID`);
  }
}
function requireSha1(value, label) {
  if (typeof value !== 'string' || !SHA1.test(value)) fail(`P0_REPORT_${label}_INVALID`);
}
function requireSha256(value, label) {
  if (typeof value !== 'string' || !SHA256.test(value)) fail(`P0_REPORT_${label}_INVALID`);
}
function requireNullableSha256(value, label) {
  if (value !== null) requireSha256(value, label);
}
function requireNullableSemanticHash(value, label) {
  if (value !== null && (typeof value !== 'string' || !SEMANTIC_HASH.test(value))) {
    fail(`P0_REPORT_${label}_INVALID`);
  }
}
function requireString(value, label) {
  if (typeof value !== 'string' || value.trim() !== value || !value) {
    fail(`P0_REPORT_${label}_INVALID`);
  }
}
function requireNullableString(value, label) {
  if (value !== null && (typeof value !== 'string' || value.trim() !== value)) {
    fail(`P0_REPORT_${label}_INVALID`);
  }
}
function requireStringArray(value, label) {
  if (!Array.isArray(value) || value.some((row) => typeof row !== 'string')) {
    fail(`P0_REPORT_${label}_INVALID`);
  }
}
function requireUnique(values, code) {
  if (new Set(values).size !== values.length) fail(code);
}
function sameSorted(left, right) {
  return JSON.stringify([...left].sort(codeUnitCompare))
    === JSON.stringify([...right].sort(codeUnitCompare));
}
function hasFailure(rows, code) { return rows.some((row) => row.code === code); }
function fail(code) { const error = new Error(code); error.code = code; throw error; }
