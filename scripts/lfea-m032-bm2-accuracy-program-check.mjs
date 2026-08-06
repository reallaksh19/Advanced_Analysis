#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BM2_COMPARISON_FAMILIES,
  buildBm2CiiComparisonConditioned,
} from './lfea-b3.26-bm2-output-comparison-runtime.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const BASELINE_PATH = resolve(ROOT, 'benchmarks/LFEA/BM2/accuracy-program-baseline-v1.json');
const JSON_PATH = resolve(ROOT, 'reports/bm2-accuracy-program-clusters.json');
const CSV_PATH = resolve(ROOT, 'reports/bm2-accuracy-program-clusters.csv');
const FREEZE = process.argv.includes('--freeze');
const WRITE = process.argv.includes('--write');

function compareText(left, right) {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function finiteOrNull(value) {
  return Number.isFinite(value) ? value : null;
}

function quantile(values, probability) {
  if (values.length === 0) return null;
  const ordered = [...values].sort((left, right) => left - right);
  const index = Math.min(ordered.length - 1, Math.floor(probability * ordered.length));
  return ordered[index];
}

function stationIdentity(row) {
  const identity = row.rowIdentity ?? {};
  if (identity.stationNode) return `NODE:${identity.stationNode}`;
  if (identity.reportFromNode != null && identity.reportToNode != null) {
    const occurrence = identity.occurrenceOrdinalWithinCaseFamilyAndPair ?? 0;
    return `PAIR:${identity.reportFromNode}-${identity.reportToNode}:OCC:${occurrence}`;
  }
  return `IDENTIFIER:${row.identifier}`;
}

function hypotheses(row) {
  const values = new Set();
  if (row.family === 'globalForce' || row.family === 'localForce') {
    values.add('END_ACTION_RECOVERY_AND_LOCAL_AXIS');
  }
  if (row.family === 'displacement') values.add('GLOBAL_STIFFNESS_AND_LOAD_PATH');
  if (row.family === 'restraint') values.add('RESTRAINT_REACTION_AND_COMPLEMENTARITY');
  if (row.comparisonMode === 'ABSOLUTE_NEAR_ZERO_REFERENCE') {
    values.add('ZERO_REFERENCE_CHANNEL_AND_NUMERICAL_NOISE');
  }
  for (const code of row.causeCodes ?? []) {
    if (code.includes('BEND')) values.add('BEND_DIRECTIONAL_FLEXIBILITY');
    if (code.includes('WELDOLET') || code.includes('WELDING_TEE')) {
      values.add('JUNCTION_STIFFNESS_AND_BRANCH_OWNERSHIP');
    }
    if (code.includes('UNILATERAL') || code.includes('PLUS_Z')) {
      values.add('UNILATERAL_RESTRAINT_COMPLEMENTARITY');
    }
    if (code.includes('RIGID')) values.add('RIGID_LOAD_AND_STIFFNESS_DISTRIBUTION');
  }
  if (values.size === 0) values.add('UNCLASSIFIED_MECHANICS_DELTA');
  return [...values].sort(compareText);
}

function flattenRows(comparison) {
  const rows = [];
  for (const caseLabel of Object.keys(comparison.cases).sort(compareText)) {
    const section = comparison.cases[caseLabel];
    for (const family of BM2_COMPARISON_FAMILIES) {
      for (const source of section[family].rows) {
        rows.push(Object.freeze({
          ...source,
          caseLabel,
          family,
          stationIdentity: stationIdentity(source),
          hypotheses: Object.freeze(hypotheses(source)),
        }));
      }
    }
  }
  return Object.freeze(rows);
}

function clusterDefinitions(row) {
  const identity = row.rowIdentity ?? {};
  const definitions = [
    ['CASE', row.caseLabel],
    ['RESULT_FAMILY', row.family],
    ['CASE_RESULT_FAMILY', `${row.caseLabel}:${row.family}`],
    ['SOURCE_COMPONENT', String(identity.sourceComponentUid ?? row.identifier)],
    ['STATION', row.stationIdentity],
    ['CASE_STATION_FAMILY', `${row.caseLabel}:${row.stationIdentity}:${row.family}`],
    ['FIELD_OR_DOF', `${row.family}:${row.field}`],
    ['COMPARISON_MODE', row.comparisonMode],
  ];
  for (const code of row.causeCodes ?? []) definitions.push(['CAUSE_CODE', code]);
  for (const hypothesis of row.hypotheses) definitions.push(['MECHANICS_HYPOTHESIS', hypothesis]);
  return definitions;
}

function rowSeverity(row) {
  if (Number.isFinite(row.percentDifference)) return Math.abs(row.percentDifference);
  const tolerance = Math.abs(row.tolerance ?? 0);
  if (!(tolerance > 0)) return Math.abs(row.absoluteDifference ?? 0);
  return Math.abs(row.absoluteDifference ?? 0) / tolerance;
}

function summarizeCluster(dimension, key, rows) {
  const failures = rows.filter((row) => !row.passed);
  const relativeFailures = failures.filter((row) => Number.isFinite(row.percentDifference));
  const signedPercentErrors = relativeFailures.map((row) => row.percentDifference);
  const absolutePercentErrors = signedPercentErrors.map(Math.abs);
  const topFailureRows = failures
    .map((row) => ({ row, severity: rowSeverity(row) }))
    .sort((left, right) => right.severity - left.severity
      || compareText(left.row.caseLabel, right.row.caseLabel)
      || compareText(left.row.family, right.row.family)
      || compareText(String(left.row.identifier), String(right.row.identifier))
      || compareText(String(left.row.end ?? ''), String(right.row.end ?? ''))
      || compareText(left.row.field, right.row.field))
    .slice(0, 20)
    .map(({ row, severity }) => Object.freeze({
      caseLabel: row.caseLabel,
      family: row.family,
      sourceComponentUid: row.rowIdentity?.sourceComponentUid ?? null,
      stationIdentity: row.stationIdentity,
      identifier: row.identifier,
      end: row.end,
      field: row.field,
      comparisonMode: row.comparisonMode,
      reference: row.cii,
      solver: row.ours,
      absoluteDifference: row.absoluteDifference,
      percentDifference: finiteOrNull(row.percentDifference),
      severity,
      causeCodes: row.causeCodes,
      hypotheses: row.hypotheses,
    }));
  const passed = rows.length - failures.length;
  return Object.freeze({
    dimension,
    key,
    comparisons: rows.length,
    passed,
    failed: failures.length,
    passRate: rows.length === 0 ? 0 : passed / rows.length,
    exactOrNearZeroFailureCount: failures.filter(
      (row) => row.comparisonMode === 'ABSOLUTE_NEAR_ZERO_REFERENCE',
    ).length,
    relativeFailureCount: relativeFailures.length,
    medianAbsolutePercentError: quantile(absolutePercentErrors, 0.5),
    p90AbsolutePercentError: quantile(absolutePercentErrors, 0.9),
    p95AbsolutePercentError: quantile(absolutePercentErrors, 0.95),
    maximumAbsolutePercentError: absolutePercentErrors.length === 0
      ? null
      : Math.max(...absolutePercentErrors),
    meanSignedPercentError: signedPercentErrors.length === 0
      ? null
      : signedPercentErrors.reduce((sum, value) => sum + value, 0) / signedPercentErrors.length,
    maximumAbsoluteDifference: failures.length === 0
      ? 0
      : Math.max(...failures.map((row) => Math.abs(row.absoluteDifference))),
    topFailureRows: Object.freeze(topFailureRows),
  });
}

function buildClusters(rows) {
  const grouped = new Map();
  for (const row of rows) {
    for (const [dimension, key] of clusterDefinitions(row)) {
      const compound = `${dimension}\u0000${key}`;
      if (!grouped.has(compound)) grouped.set(compound, { dimension, key, rows: [] });
      grouped.get(compound).rows.push(row);
    }
  }
  return Object.freeze([...grouped.values()]
    .map(({ dimension, key, rows: clusterRows }) => summarizeCluster(dimension, key, clusterRows))
    .sort((left, right) => compareText(left.dimension, right.dimension)
      || right.failed - left.failed
      || compareText(left.key, right.key)));
}

function priorityRows(clusters, dimension, limit) {
  return Object.freeze(clusters
    .filter((row) => row.dimension === dimension && row.failed > 0)
    .sort((left, right) => right.failed - left.failed
      || (right.p90AbsolutePercentError ?? -1) - (left.p90AbsolutePercentError ?? -1)
      || compareText(left.key, right.key))
    .slice(0, limit));
}

function csvCell(value) {
  const text = value == null ? '' : String(value);
  return /[",\n\r]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function renderCsv(clusters) {
  const headers = [
    'dimension',
    'key',
    'comparisons',
    'passed',
    'failed',
    'passRate',
    'exactOrNearZeroFailureCount',
    'relativeFailureCount',
    'medianAbsolutePercentError',
    'p90AbsolutePercentError',
    'p95AbsolutePercentError',
    'maximumAbsolutePercentError',
    'meanSignedPercentError',
    'maximumAbsoluteDifference',
  ];
  const lines = [headers.join(',')];
  for (const row of clusters) {
    lines.push(headers.map((header) => csvCell(row[header])).join(','));
  }
  return `${lines.join('\n')}\n`;
}

const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
const comparison = buildBm2CiiComparisonConditioned();
const rows = flattenRows(comparison);
const clusters = buildClusters(rows);

assert.equal(comparison.comparisonScope, baseline.comparisonScope);
assert.equal(comparison.coverage.metricName, baseline.coverageMetric);
assert.equal(comparison.coverage.fullStationScalarDenominator, baseline.fullStationScalarDenominator);
assert.equal(comparison.coverage.matchedScalarDenominator, baseline.fullStationScalarDenominator);
assert.equal(comparison.coverage.unresolvedClassificationRows, baseline.requiredUnresolvedClassificationRows);
assert.equal(comparison.coverage.unmatchedSolverRows, baseline.requiredUnmatchedSolverRows);
assert.equal(comparison.coverage.coverageStatus, baseline.requiredCoverageStatus);
assert.equal(comparison.totals.untraced, baseline.requiredUntracedScalars);
assert.ok(comparison.totals.passed >= baseline.minimumPassingScalars);
assert.ok(comparison.totals.failed <= baseline.maximumFailingScalars);
assert.equal(rows.length, baseline.fullStationScalarDenominator);
if (FREEZE) {
  assert.equal(comparison.totals.passed, baseline.baselinePassingScalars);
  assert.equal(comparison.totals.failed, baseline.baselineFailingScalars);
}

const report = Object.freeze({
  schema: 'lfea-bm2-accuracy-program-clusters/v1',
  benchmark: 'BM2',
  programIssue: 797,
  mode: FREEZE ? 'BASELINE_FREEZE' : 'NO_REGRESSION_CANDIDATE',
  baseline,
  candidate: Object.freeze({
    targetHeadSha: process.env.TARGET_HEAD_SHA ?? 'UNBOUND_LOCAL_RUN',
    comparisonScope: comparison.comparisonScope,
    fullStationScalarDenominator: comparison.coverage.fullStationScalarDenominator,
    passingScalars: comparison.totals.passed,
    failingScalars: comparison.totals.failed,
    untracedScalars: comparison.totals.untraced,
    coverageStatus: comparison.coverage.coverageStatus,
    improvementFromBaseline: comparison.totals.passed - baseline.baselinePassingScalars,
  }),
  gate: Object.freeze({
    denominatorStable: comparison.coverage.fullStationScalarDenominator
      === baseline.fullStationScalarDenominator,
    coverageComplete: comparison.coverage.coverageStatus === baseline.requiredCoverageStatus,
    rowCustodyComplete: comparison.coverage.unresolvedClassificationRows === 0
      && comparison.coverage.unmatchedSolverRows === 0
      && comparison.totals.untraced === 0,
    noAccuracyRegression: comparison.totals.passed >= baseline.minimumPassingScalars
      && comparison.totals.failed <= baseline.maximumFailingScalars,
    baselineReproduced: comparison.totals.passed === baseline.baselinePassingScalars
      && comparison.totals.failed === baseline.baselineFailingScalars,
    status: 'PASS',
  }),
  priorities: Object.freeze({
    mechanicsHypotheses: priorityRows(clusters, 'MECHANICS_HYPOTHESIS', 20),
    caseResultFamilies: priorityRows(clusters, 'CASE_RESULT_FAMILY', 20),
    stations: priorityRows(clusters, 'STATION', 30),
    sourceComponents: priorityRows(clusters, 'SOURCE_COMPONENT', 30),
    fields: priorityRows(clusters, 'FIELD_OR_DOF', 30),
    causeCodes: priorityRows(clusters, 'CAUSE_CODE', 30),
  }),
  clusters,
});

if (WRITE) {
  mkdirSync(dirname(JSON_PATH), { recursive: true });
  writeFileSync(JSON_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  writeFileSync(CSV_PATH, renderCsv(clusters), 'utf8');
}

console.log(JSON.stringify({
  benchmark: report.benchmark,
  mode: report.mode,
  targetHeadSha: report.candidate.targetHeadSha,
  denominator: report.candidate.fullStationScalarDenominator,
  passed: report.candidate.passingScalars,
  failed: report.candidate.failingScalars,
  improvementFromBaseline: report.candidate.improvementFromBaseline,
  coverageStatus: report.candidate.coverageStatus,
  topMechanicsHypotheses: report.priorities.mechanicsHypotheses.slice(0, 8).map((row) => ({
    hypothesis: row.key,
    failed: row.failed,
    exactOrNearZeroFailures: row.exactOrNearZeroFailureCount,
    relativeFailures: row.relativeFailureCount,
    p90AbsolutePercentError: row.p90AbsolutePercentError,
  })),
  status: report.gate.status,
}, null, 2));
