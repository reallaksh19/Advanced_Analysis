/**
 * Deterministic FEA benchmark runner.
 *
 * Executes verification cases and produces an immutable, semantically hashed
 * `fea-benchmark-report/v1`. The runner performs NO engineering judgement: each
 * case declares its own reference solution, tolerance and pass criterion, and
 * the runner only aggregates and reports.
 */
import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { deepFreeze } from '../shared-piping-model/immutable.js';

export const BENCHMARK_REPORT_SCHEMA = 'fea-benchmark-report/v1';

export const CASE_STATUS = Object.freeze({
  PASS: 'PASS',
  FAIL: 'FAIL',
  ERROR: 'ERROR',
});

/**
 * Run a set of benchmark cases.
 *
 * @param {Array<Record<string, unknown>>} cases Case definitions.
 * @param {{label?:string, onProgress?:Function, filter?:Function, measureTime?:boolean}} options Run options.
 * @returns {Readonly<Record<string, unknown>>} Immutable benchmark report.
 */
export function runBenchmarks(cases, options = {}) {
  const onProgress = options.onProgress ?? (() => {});
  const filter = options.filter ?? (() => true);
  const measureTime = options.measureTime ?? true;
  const selected = cases.filter(filter);

  const results = [];
  for (let index = 0; index < selected.length; index += 1) {
    const definition = selected[index];
    onProgress({ phase: 'START', caseId: definition.caseId, index, total: selected.length });
    const started = measureTime ? now() : 0;
    let record;
    try {
      const outcome = definition.run();
      const checks = (outcome.checks ?? []).map(normalizeCheck);
      const failed = checks.filter((row) => row.status === 'FAIL');
      record = {
        caseId: definition.caseId,
        title: definition.title,
        tier: definition.tier,
        category: definition.category,
        kernel: definition.kernel,
        reference: definition.reference,
        status: failed.length ? CASE_STATUS.FAIL : CASE_STATUS.PASS,
        checkCount: checks.length,
        failedCheckCount: failed.length,
        checks,
        evidence: outcome.evidence ?? null,
        error: null,
      };
    } catch (error) {
      record = {
        caseId: definition.caseId,
        title: definition.title,
        tier: definition.tier,
        category: definition.category,
        kernel: definition.kernel,
        reference: definition.reference,
        status: CASE_STATUS.ERROR,
        checkCount: 0,
        failedCheckCount: 0,
        checks: [],
        evidence: null,
        error: { message: String(error?.message ?? error), code: error?.code ?? null },
      };
    }
    if (measureTime) record.elapsedMs = round(now() - started, 3);
    results.push(record);
    onProgress({ phase: 'END', caseId: record.caseId, status: record.status, index, total: selected.length });
  }

  return deepFreeze(buildReport(results, options.label ?? 'unlabelled'));
}

function buildReport(results, label) {
  const passed = results.filter((row) => row.status === CASE_STATUS.PASS).length;
  const failed = results.filter((row) => row.status === CASE_STATUS.FAIL).length;
  const errored = results.filter((row) => row.status === CASE_STATUS.ERROR).length;
  const allChecks = results.flatMap((row) => row.checks);
  const relativeErrors = allChecks
    .filter((row) => row.toleranceType === 'RELATIVE' && Number.isFinite(row.relativeError))
    .map((row) => row.relativeError);

  const base = {
    schema: BENCHMARK_REPORT_SCHEMA,
    label,
    totals: {
      cases: results.length,
      passed,
      failed,
      errored,
      checks: allChecks.length,
      failedChecks: allChecks.filter((row) => row.status === 'FAIL').length,
      maximumRelativeError: relativeErrors.length ? Math.max(...relativeErrors) : 0,
    },
    byTier: summariseBy(results, 'tier'),
    byCategory: summariseBy(results, 'category'),
    // Timings are excluded from the hash: they are environment-dependent.
    results: results.map(({ elapsedMs: _elapsed, ...row }) => row),
  };
  const hash = semanticHash(base);
  return {
    ...base,
    semanticHash: hash,
    timings: results.map((row) => ({ caseId: row.caseId, elapsedMs: row.elapsedMs ?? null })),
  };
}

function summariseBy(results, key) {
  const groups = new Map();
  results.forEach((row) => {
    const bucket = groups.get(row[key]) ?? { passed: 0, failed: 0, errored: 0 };
    if (row.status === CASE_STATUS.PASS) bucket.passed += 1;
    else if (row.status === CASE_STATUS.FAIL) bucket.failed += 1;
    else bucket.errored += 1;
    groups.set(row[key], bucket);
  });
  return [...groups.entries()]
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([name, bucket]) => ({ name, ...bucket }));
}

function normalizeCheck(row) {
  return {
    checkId: row.checkId,
    quantity: row.quantity,
    unit: row.unit ?? null,
    computed: finiteOrNull(row.computed),
    reference: finiteOrNull(row.reference),
    absoluteError: finiteOrNull(row.absoluteError),
    relativeError: finiteOrNull(row.relativeError),
    tolerance: row.tolerance,
    toleranceType: row.toleranceType,
    status: row.status,
    note: row.note ?? null,
  };
}

function finiteOrNull(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function round(value, digits) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function now() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Number(process.hrtime.bigint() / 1000n) / 1000;
}

/**
 * Compare two benchmark reports and describe what changed.
 *
 * @param {Record<string, unknown>} before Baseline report.
 * @param {Record<string, unknown>} after Current report.
 * @returns {Readonly<Record<string, unknown>>} Comparison record.
 */
export function compareBenchmarkReports(before, after) {
  const beforeCases = new Map(before.results.map((row) => [row.caseId, row]));
  const afterCases = new Map(after.results.map((row) => [row.caseId, row]));
  const caseIds = [...new Set([...beforeCases.keys(), ...afterCases.keys()])].sort();

  const rows = caseIds.map((caseId) => {
    const b = beforeCases.get(caseId) ?? null;
    const a = afterCases.get(caseId) ?? null;
    let transition = 'UNCHANGED';
    if (!b) transition = 'ADDED';
    else if (!a) transition = 'REMOVED';
    else if (b.status !== a.status) transition = `${b.status}_TO_${a.status}`;
    return {
      caseId,
      title: a?.title ?? b?.title ?? null,
      tier: a?.tier ?? b?.tier ?? null,
      beforeStatus: b?.status ?? null,
      afterStatus: a?.status ?? null,
      transition,
      beforeMaxRelativeError: maxRelative(b),
      afterMaxRelativeError: maxRelative(a),
    };
  });

  return deepFreeze({
    schema: 'fea-benchmark-comparison/v1',
    beforeLabel: before.label,
    afterLabel: after.label,
    beforeHash: before.semanticHash,
    afterHash: after.semanticHash,
    regressions: rows.filter((row) => row.transition === 'PASS_TO_FAIL' || row.transition === 'PASS_TO_ERROR'),
    repairs: rows.filter((row) => row.transition === 'FAIL_TO_PASS' || row.transition === 'ERROR_TO_PASS'),
    rows,
  });
}

function maxRelative(record) {
  if (!record) return null;
  const values = record.checks
    .filter((row) => row.toleranceType === 'RELATIVE' && Number.isFinite(row.relativeError))
    .map((row) => row.relativeError);
  return values.length ? Math.max(...values) : 0;
}
