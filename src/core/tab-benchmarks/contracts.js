import {
  canonicalStringify,
  deepFreeze,
  isPlainRecord,
  semanticHash,
  stringValue,
} from '../shared-piping-model/index.js';
import {
  ADVANCED_ANALYSIS_APP_ID,
  BENCHMARK_EVIDENCE_BASES,
  BENCHMARK_RESULT_STATUSES,
  TAB_BENCHMARK_RESULT_SCHEMA,
  TAB_BENCHMARK_SUITE_SCHEMA,
  TAB_QUALIFICATION_STATUSES,
} from './constants.js';

const RESULT_KEYS = Object.freeze([
  'actualEvidence',
  'appId',
  'caseId',
  'category',
  'diagnostics',
  'evidenceBasis',
  'expectedEvidence',
  'inputSemanticHash',
  'schema',
  'semanticHash',
  'status',
  'tabId',
  'tolerance',
]);

/**
 * Creates one immutable pass/fail benchmark result.
 *
 * @param {Readonly<object>} value Result fields excluding schema and hash.
 * @returns {Readonly<object>} Validated benchmark result.
 */
export function createTabBenchmarkResult(value) {
  assertRecord(value, 'Tab benchmark result input');
  const base = {
    schema: TAB_BENCHMARK_RESULT_SCHEMA,
    appId: required(value.appId, 'appId'),
    tabId: required(value.tabId, 'tabId'),
    caseId: required(value.caseId, 'caseId'),
    category: required(value.category, 'category'),
    evidenceBasis: oneOf(value.evidenceBasis, BENCHMARK_EVIDENCE_BASES, 'evidenceBasis'),
    inputSemanticHash: required(value.inputSemanticHash, 'inputSemanticHash'),
    expectedEvidence: evidence(value.expectedEvidence, 'expectedEvidence'),
    actualEvidence: evidence(value.actualEvidence, 'actualEvidence'),
    tolerance: tolerance(value.tolerance),
    status: oneOf(value.status, BENCHMARK_RESULT_STATUSES, 'status'),
    diagnostics: diagnostics(value.diagnostics),
  };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

/**
 * Validates a result without changing it.
 *
 * @param {unknown} value Candidate result.
 * @returns {Readonly<object>} Validation outcome.
 */
export function validateTabBenchmarkResult(value) {
  const errors = [];
  try {
    assertRecord(value, 'Tab benchmark result');
    exactKeys(value, RESULT_KEYS, 'Tab benchmark result');
    const { semanticHash: declaredHash, schema, ...input } = value;
    if (schema !== TAB_BENCHMARK_RESULT_SCHEMA) throw new TypeError('Invalid tab-benchmark-result/v1 schema.');
    const expected = createTabBenchmarkResult(input);
    if (declaredHash !== expected.semanticHash || canonicalStringify(value) !== canonicalStringify(expected)) {
      errors.push('Tab benchmark result semantic content is invalid.');
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  return deepFreeze({ ok: errors.length === 0, errors });
}

/**
 * Builds a deterministic suite and derives each tab's qualification status.
 *
 * @param {Readonly<object>} registry Required benchmark registry.
 * @param {ReadonlyArray<object>} results Completed pass/fail results.
 * @returns {Readonly<object>} Immutable qualification suite.
 */
export function createTabBenchmarkSuite(registry, results) {
  assertRecord(registry, 'Tab benchmark registry');
  if (!Array.isArray(results)) throw new TypeError('Tab benchmark results must be an array.');
  results.forEach((result) => {
    const validation = validateTabBenchmarkResult(result);
    if (!validation.ok) throw new TypeError(validation.errors.join(' '));
  });
  assertUniqueResults(results);
  const sortedResults = [...results].sort(compareResults);
  const qualifications = registry.tabs.map((tab) => qualification(tab, sortedResults));
  const base = {
    schema: TAB_BENCHMARK_SUITE_SCHEMA,
    appId: ADVANCED_ANALYSIS_APP_ID,
    registrySemanticHash: registry.semanticHash,
    tabIds: [...registry.tabIds],
    results: sortedResults,
    qualifications,
  };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

/**
 * Validates a suite against the current immutable benchmark registry.
 *
 * @param {unknown} value Candidate suite.
 * @param {Readonly<object>} registry Current benchmark registry.
 * @returns {Readonly<object>} Validation outcome.
 */
export function validateTabBenchmarkSuite(value, registry) {
  const errors = [];
  try {
    assertRecord(value, 'Tab benchmark suite');
    if (value.schema !== TAB_BENCHMARK_SUITE_SCHEMA) throw new TypeError('Invalid tab-benchmark-suite/v1 schema.');
    if (value.appId !== ADVANCED_ANALYSIS_APP_ID) throw new TypeError('Tab benchmark suite appId is invalid.');
    if (value.registrySemanticHash !== registry.semanticHash) throw new TypeError('Tab benchmark suite registry semantic hash is stale.');
    const expected = createTabBenchmarkSuite(registry, value.results);
    if (canonicalStringify(value) !== canonicalStringify(expected)) {
      errors.push('Tab benchmark suite semantic content is invalid.');
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  return deepFreeze({ ok: errors.length === 0, errors });
}

function qualification(tab, results) {
  const requiredIds = tab.requiredCases.map((item) => item.caseId);
  const completed = results.filter((result) => result.tabId === tab.tabId && requiredIds.includes(result.caseId));
  const completedIds = new Set(completed.map((result) => result.caseId));
  const missingCaseIds = requiredIds.filter((caseId) => !completedIds.has(caseId));
  const failedCaseIds = completed.filter((result) => result.status === 'FAIL').map((result) => result.caseId);
  const status = failedCaseIds.length ? 'Failed' : missingCaseIds.length ? 'Not Run' : 'Qualified';
  return deepFreeze({
    tabId: tab.tabId,
    status: oneOf(status, TAB_QUALIFICATION_STATUSES, 'qualification status'),
    passedCaseCount: completed.filter((result) => result.status === 'PASS').length,
    requiredCaseCount: requiredIds.length,
    failedCaseIds,
    missingCaseIds,
  });
}

function assertUniqueResults(results) {
  const identities = results.map((result) => `${result.appId}|${result.tabId}|${result.caseId}`);
  if (new Set(identities).size !== identities.length) throw new TypeError('Duplicate tab benchmark result identity.');
}

function compareResults(left, right) {
  return `${left.tabId}|${left.caseId}`.localeCompare(`${right.tabId}|${right.caseId}`);
}

function evidence(value, field) {
  if (!isPlainRecord(value)) throw new TypeError(`${field} must be a plain object.`);
  return value;
}

function tolerance(value) {
  if (value === null) return null;
  if (!isPlainRecord(value)) throw new TypeError('tolerance must be null or a plain object.');
  Object.entries(value).forEach(([key, number]) => {
    required(key, 'tolerance key');
    if (!Number.isFinite(number) || number < 0) throw new TypeError(`Tolerance ${key} must be a non-negative finite number.`);
  });
  return value;
}

function diagnostics(value) {
  if (!Array.isArray(value) || value.some((row) => !stringValue(row))) {
    throw new TypeError('diagnostics must be an array of non-empty strings.');
  }
  return [...value];
}

function exactKeys(value, keys, label) {
  if (canonicalStringify(Object.keys(value).sort()) !== canonicalStringify([...keys].sort())) {
    throw new TypeError(`${label} keys are invalid.`);
  }
}

function assertRecord(value, label) {
  if (!isPlainRecord(value)) throw new TypeError(`${label} must be a plain object.`);
}

function required(value, field) {
  if (!stringValue(value)) throw new TypeError(`${field} must be a non-empty string.`);
  return value;
}

function oneOf(value, allowed, field) {
  if (!allowed.includes(value)) throw new TypeError(`${field} is invalid.`);
  return value;
}
