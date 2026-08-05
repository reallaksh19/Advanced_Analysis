#!/usr/bin/env node

import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findElements } from '../src/core/geometry/adapters/inputxml-tag-scanner.js';
import { CAESAR_INPUTXML_RESTRAINT_TYPE_CORRECTION_PROFILE_ID } from '../src/core/geometry/adapters/inputxml-restraint-type-mutation.js';
import { buildBm2CiiComparisonConditioned } from './lfea-b3.26-bm2-output-comparison-runtime.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUTPUT_PATH = resolve(ROOT, 'benchmarks/LFEA/BM2/Output_BM2.xml');
const REPORT_PATH = resolve(ROOT, 'reports/bm2-consolidated-latest-output.json');
const OUT_OF_TOLERANCE_JSON_PATH = resolve(ROOT, 'reports/bm2-nonfriction-linear-fea-out-of-tolerance.json');
const OUT_OF_TOLERANCE_CSV_PATH = resolve(ROOT, 'reports/bm2-nonfriction-linear-fea-out-of-tolerance.csv');
const STRICT_RELATIVE_LIMIT = 0.05;
const CASE_FAMILY_SCALARS = Object.freeze({
  displacement: 366,
  restraint: 36,
  globalForce: 732,
  localForce: 732,
});
const RETAINED_SCALARS_PER_CASE = Object.values(CASE_FAMILY_SCALARS)
  .reduce((sum, value) => sum + value, 0);
const FAMILY_ORDER = Object.freeze({ displacement: 0, restraint: 1, globalForce: 2, localForce: 3 });
const STRICT_CASE_AUTHORITY = Object.freeze({
  OPE: Object.freeze({
    number: 3,
    category: 'OPE',
    formula: 'W+T1+P1',
    tier: 'STRICT_NO_FRICTION',
    custody: 'EXPLICIT_PHYSICAL_SOURCE_REPORT',
  }),
  SUS: Object.freeze({
    number: 4,
    category: 'SUS',
    formula: 'W+P1',
    tier: 'STRICT_NO_FRICTION',
    custody: 'EXPLICIT_PHYSICAL_SOURCE_REPORT',
  }),
  EXP: Object.freeze({
    number: 6,
    category: 'EXP',
    formula: 'L6=L3-L4',
    tier: 'STRICT_NO_FRICTION',
    custody: 'DERIVED_FROM_MATCHED_CASE_3_MINUS_CASE_4_ROWS',
  }),
});
const EXPECTED_EXPLICIT_CASES = Object.freeze([
  STRICT_CASE_AUTHORITY.OPE,
  STRICT_CASE_AUTHORITY.SUS,
]);
const OMITTED_DIAGNOSTIC_CASES = Object.freeze([
  Object.freeze({ number: 1, category: 'OPE', formula: 'W+T1+P1' }),
  Object.freeze({ number: 2, category: 'SUS', formula: 'W+P1' }),
  Object.freeze({ number: 5, category: 'EXP', formula: 'L5=L1-L2' }),
]);

function parseCaseLabel(label) {
  const match = /^CASE\s+(\d+)\s+\(([A-Z]+)\)\s+(.+)$/u.exec(String(label ?? '').trim());
  if (!match) throw new Error(`Unrecognised BM2 LOADCASE: ${label}`);
  return Object.freeze({
    number: Number(match[1]),
    category: match[2],
    formula: match[3],
    label: String(label),
  });
}

function numeric(attributes, key) {
  const value = Number(attributes?.[key]);
  if (!Number.isFinite(value)) throw new Error(`Non-finite BM2 ${key}: ${attributes?.[key]}`);
  return value;
}

function reportValues(report, family) {
  if (family === 'displacement') {
    return findElements(report.inner, 'NODE').flatMap((row) => {
      const translations = findElements(row.inner, 'TRANSLATIONS')[0];
      const rotations = findElements(row.inner, 'ROTATIONS')[0];
      return ['DX', 'DY', 'DZ'].map((key) => numeric(translations.attributes, key))
        .concat(['RX', 'RY', 'RZ'].map((key) => numeric(rotations.attributes, key)));
    });
  }
  if (family === 'restraint') {
    return findElements(report.inner, 'RESTRAINT').flatMap((row) => {
      const forces = findElements(row.inner, 'FORCES')[0];
      const moments = findElements(row.inner, 'MOMENTS')[0];
      return ['FX', 'FY', 'FZ'].map((key) => numeric(forces.attributes, key))
        .concat(['MX', 'MY', 'MZ'].map((key) => numeric(moments.attributes, key)));
    });
  }
  return findElements(report.inner, 'ELEMENT').flatMap((row) => {
    const forces = findElements(row.inner, 'FORCES')[0];
    const moments = findElements(row.inner, 'MOMENTS')[0];
    const forceFrom = findElements(forces.inner, 'FROM')[0];
    const forceTo = findElements(forces.inner, 'TO')[0];
    const momentFrom = findElements(moments.inner, 'FROM')[0];
    const momentTo = findElements(moments.inner, 'TO')[0];
    return ['FX', 'FY', 'FZ'].map((key) => numeric(forceFrom.attributes, key))
      .concat(['MX', 'MY', 'MZ'].map((key) => numeric(momentFrom.attributes, key)))
      .concat(['FX', 'FY', 'FZ'].map((key) => numeric(forceTo.attributes, key)))
      .concat(['MX', 'MY', 'MZ'].map((key) => numeric(momentTo.attributes, key)));
  });
}

function inventoryExplicitSourceCases(xmlText) {
  const definitions = Object.freeze([
    Object.freeze(['displacement', 'DISPLACEMENT_REPORT']),
    Object.freeze(['restraint', 'RESTRAINT_REPORT']),
    Object.freeze(['globalForce', 'GLOBAL_FORCE_REPORT']),
    Object.freeze(['localForce', 'LOCAL_FORCE_REPORT']),
  ]);
  const byCase = new Map();
  for (const [family, tag] of definitions) {
    for (const report of findElements(xmlText, tag)) {
      const parsed = parseCaseLabel(report.attributes.LOADCASE);
      if (!byCase.has(parsed.number)) byCase.set(parsed.number, { ...parsed, families: {} });
      const entry = byCase.get(parsed.number);
      assert.equal(entry.category, parsed.category, `BM2 CASE ${parsed.number} category consistency`);
      assert.equal(entry.formula, parsed.formula, `BM2 CASE ${parsed.number} formula consistency`);
      assert.equal(entry.families[family], undefined, `BM2 CASE ${parsed.number} duplicate ${family} report`);
      const values = Object.freeze(reportValues(report, family));
      entry.families[family] = Object.freeze({ reportCount: 1, scalarCount: values.length });
    }
  }
  return [...byCase.values()].sort((left, right) => left.number - right.number);
}

function strictRelativePass(reference, solver) {
  if (reference === 0) return solver === 0;
  return Math.abs((solver - reference) / reference) < STRICT_RELATIVE_LIMIT;
}

function qualifyBoundary() {
  assert.equal(strictRelativePass(100, 104.999999), true);
  assert.equal(strictRelativePass(100, 105), false);
  assert.equal(strictRelativePass(100, 95), false);
  assert.equal(strictRelativePass(0, 0), true);
  assert.equal(strictRelativePass(0, Number.EPSILON), false);
}

function percentile(sorted, probability) {
  if (sorted.length === 0) return null;
  if (sorted.length === 1) return sorted[0];
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

function summarizeFailures(rows) {
  const nonzero = rows.filter((row) => row.absoluteRelativeError !== null);
  const relative = nonzero.map((row) => row.absoluteRelativeError).sort((a, b) => a - b);
  const signed = nonzero.map((row) => row.signedRelativeError);
  return Object.freeze({
    failed: rows.length,
    exactZeroMismatchCount: rows.filter((row) => row.failureReason === 'EXACT_ZERO_REFERENCE_MISMATCH').length,
    nonzeroRelativeFailureCount: nonzero.length,
    meanAbsoluteRelativeError: relative.length === 0
      ? null
      : relative.reduce((sum, value) => sum + value, 0) / relative.length,
    medianAbsoluteRelativeError: percentile(relative, 0.5),
    p90AbsoluteRelativeError: percentile(relative, 0.9),
    p95AbsoluteRelativeError: percentile(relative, 0.95),
    maximumAbsoluteRelativeError: relative.length === 0 ? null : relative.at(-1),
    meanSignedRelativeError: signed.length === 0
      ? null
      : signed.reduce((sum, value) => sum + value, 0) / signed.length,
  });
}

function groupedFailureSummary(rows, keyBuilder, descriptorBuilder) {
  const groups = new Map();
  for (const row of rows) {
    const key = keyBuilder(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return Object.freeze([...groups.entries()]
    .map(([key, groupRows]) => Object.freeze({
      key,
      ...descriptorBuilder(groupRows[0]),
      ...summarizeFailures(groupRows),
    }))
    .sort((left, right) => right.failed - left.failed || String(left.key).localeCompare(String(right.key))));
}

function csvCell(value) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\r\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function failureCsv(rows) {
  const columns = [
    'caseNumber', 'caseCategory', 'caseFormula', 'family', 'identifier', 'end', 'field',
    'reference', 'solver', 'signedAbsoluteError', 'absoluteError', 'signedRelativeError',
    'absoluteRelativeError', 'signedPercentError', 'absolutePercentError', 'strictLimit',
    'failureReason',
  ];
  return `${columns.join(',')}\n${rows.map((row) => columns
    .map((column) => csvCell(row[column])).join(',')).join('\n')}\n`;
}

function strictMatchedSubset() {
  const comparison = buildBm2CiiComparisonConditioned();
  const rows = [];
  for (const [caseLabel, section] of Object.entries(comparison.cases)) {
    const authority = STRICT_CASE_AUTHORITY[caseLabel];
    assert.ok(authority, `BM2 strict comparison case ${caseLabel} lacks no-friction case authority.`);
    for (const family of Object.keys(CASE_FAMILY_SCALARS)) {
      assert.equal(
        section[family].rows.length * (family === 'globalForce' || family === 'localForce' ? 12 : 6),
        CASE_FAMILY_SCALARS[family],
        `BM2 ${caseLabel} ${family} retained scalar custody`,
      );
      for (const source of section[family].rows) {
        const signedAbsoluteError = source.ours - source.cii;
        const absoluteError = Math.abs(signedAbsoluteError);
        const signedRelativeError = source.cii === 0 ? null : signedAbsoluteError / source.cii;
        const absoluteRelativeError = signedRelativeError === null ? null : Math.abs(signedRelativeError);
        const passed = strictRelativePass(source.cii, source.ours);
        rows.push(Object.freeze({
          caseNumber: authority.number,
          caseCategory: authority.category,
          caseFormula: authority.formula,
          caseLabel,
          family,
          identifier: source.identifier,
          end: source.end ?? null,
          field: source.field,
          reference: source.cii,
          solver: source.ours,
          ours: source.ours,
          signedAbsoluteError,
          absoluteError,
          signedRelativeError,
          absoluteRelativeError,
          relativeError: absoluteRelativeError,
          signedPercentError: signedRelativeError === null ? null : signedRelativeError * 100,
          absolutePercentError: absoluteRelativeError === null ? null : absoluteRelativeError * 100,
          strictLimit: STRICT_RELATIVE_LIMIT,
          failureReason: passed
            ? null
            : source.cii === 0
              ? 'EXACT_ZERO_REFERENCE_MISMATCH'
              : 'RELATIVE_ERROR_NOT_BELOW_5_PERCENT',
          passed,
        }));
      }
    }
  }
  const passed = rows.filter((row) => row.passed).length;
  const failures = rows.filter((row) => !row.passed)
    .sort((left, right) => left.caseNumber - right.caseNumber
      || FAMILY_ORDER[left.family] - FAMILY_ORDER[right.family]
      || String(left.identifier).localeCompare(String(right.identifier), undefined, { numeric: true })
      || String(left.end ?? '').localeCompare(String(right.end ?? ''))
      || String(left.field).localeCompare(String(right.field)));
  const failed = failures.length;
  const summaries = Object.freeze({
    overall: summarizeFailures(failures),
    byCase: groupedFailureSummary(
      failures,
      (row) => String(row.caseNumber),
      (row) => ({
        caseNumber: row.caseNumber,
        caseCategory: row.caseCategory,
        caseFormula: row.caseFormula,
      }),
    ),
    byFamily: groupedFailureSummary(
      failures,
      (row) => row.family,
      (row) => ({ family: row.family }),
    ),
    byCaseAndFamily: groupedFailureSummary(
      failures,
      (row) => `${row.caseNumber}:${row.family}`,
      (row) => ({
        caseNumber: row.caseNumber,
        caseCategory: row.caseCategory,
        family: row.family,
      }),
    ),
    byComponent: groupedFailureSummary(
      failures,
      (row) => row.field,
      (row) => ({ field: row.field }),
    ),
    byCaseFamilyAndComponent: groupedFailureSummary(
      failures,
      (row) => `${row.caseNumber}:${row.family}:${row.field}`,
      (row) => ({
        caseNumber: row.caseNumber,
        caseCategory: row.caseCategory,
        family: row.family,
        field: row.field,
      }),
    ),
    byFailureReason: groupedFailureSummary(
      failures,
      (row) => row.failureReason,
      (row) => ({ failureReason: row.failureReason }),
    ),
  });
  for (const summary of [
    summaries.byCase,
    summaries.byFamily,
    summaries.byCaseAndFamily,
    summaries.byComponent,
    summaries.byCaseFamilyAndComponent,
    summaries.byFailureReason,
  ]) {
    assert.equal(
      summary.reduce((sum, row) => sum + row.failed, 0),
      failed,
      'BM2 no-friction failure summary reconciliation',
    );
  }
  assert.equal(passed + failed, rows.length, 'BM2 strict pass/fail denominator reconciliation');
  assert.equal(rows.length, RETAINED_SCALARS_PER_CASE * 3, 'BM2 three-case retained scalar denominator');
  assert.equal(comparison.coverage.coverageStatus, 'COMPLETE', 'BM2 retained station coverage');
  assert.equal(comparison.coverage.unresolvedClassificationRows, 0, 'BM2 unresolved classification rows');
  assert.equal(comparison.coverage.unmatchedSolverRows, 0, 'BM2 unmatched solver rows');
  return Object.freeze({
    sourceCaseMapping: Object.freeze({ OPE: 3, SUS: 4, EXP: 6 }),
    expansionDerivation: Object.freeze({
      caseNumber: 6,
      formula: 'L6=L3-L4',
      status: 'DERIVED_FROM_MATCHED_CASE_3_MINUS_CASE_4_ROWS',
    }),
    scope: comparison.comparisonScope,
    matchedScalarDenominator: rows.length,
    passed,
    failed,
    coverage: comparison.coverage,
    status: failed === 0 ? 'PASS' : 'INCOMPLETE_BLOCKED',
    solverQualification: comparison.solverQualification,
    failureSummaries: summaries,
    failures: Object.freeze(failures),
    topFailures: Object.freeze([...failures]
      .sort((left, right) => (right.absoluteRelativeError ?? Number.POSITIVE_INFINITY)
        - (left.absoluteRelativeError ?? Number.POSITIVE_INFINITY))
      .slice(0, 50)),
  });
}

function inventoryRecord(entry, custody, derivation = null) {
  return Object.freeze({
    number: entry.number,
    category: entry.category,
    formula: entry.formula,
    label: entry.label ?? `CASE ${entry.number} (${entry.category}) ${entry.formula}`,
    tier: entry.tier,
    custody,
    derivation,
    retainedResponseScalarCount: RETAINED_SCALARS_PER_CASE,
    familyScalarCounts: CASE_FAMILY_SCALARS,
  });
}

qualifyBoundary();
assert.equal(RETAINED_SCALARS_PER_CASE, 1866);
const xmlText = readFileSync(OUTPUT_PATH, 'utf8');
const explicitCases = inventoryExplicitSourceCases(xmlText);
assert.deepEqual(
  explicitCases.map(({ number, category, formula }) => ({ number, category, formula })),
  EXPECTED_EXPLICIT_CASES.map(({ number, category, formula }) => ({ number, category, formula })),
);
for (const entry of explicitCases) {
  const authority = EXPECTED_EXPLICIT_CASES.find((candidate) => candidate.number === entry.number);
  entry.tier = authority.tier;
  entry.custody = authority.custody;
  for (const [family, expectedScalars] of Object.entries(CASE_FAMILY_SCALARS)) {
    assert.ok(entry.families[family], `BM2 CASE ${entry.number} missing ${family}`);
    assert.equal(
      entry.families[family].scalarCount,
      expectedScalars,
      `BM2 CASE ${entry.number} ${family} scalar custody`,
    );
  }
}

const strict = strictMatchedSubset();
const explicitCaseInventory = Object.freeze(explicitCases.map((entry) => inventoryRecord(
  entry,
  'EXPLICIT_PHYSICAL_SOURCE_REPORT',
)));
const derivedCaseInventory = Object.freeze([inventoryRecord(
  STRICT_CASE_AUTHORITY.EXP,
  'DERIVED_REFERENCE_REPORT',
  Object.freeze({
    operation: 'SUBTRACTION',
    leftCase: 3,
    rightCase: 4,
    formula: 'L6=L3-L4',
    rowMatching: 'SEMANTIC_IDENTITY_AND_OCCURRENCE_REQUIRED',
  }),
)]);
const caseInventory = Object.freeze([...explicitCaseInventory, ...derivedCaseInventory]
  .sort((left, right) => left.number - right.number));
assert.equal(
  caseInventory.reduce((sum, entry) => sum + entry.retainedResponseScalarCount, 0),
  strict.matchedScalarDenominator,
  'BM2 explicit plus derived case inventory denominator',
);

const outOfToleranceReport = Object.freeze({
  schema: 'lfea-bm2-nonfriction-linear-fea-out-of-tolerance/v2',
  benchmark: 'BM2',
  sourceOutput: 'benchmarks/LFEA/BM2/Output_BM2.xml',
  sourceStandardAuthority: Object.freeze({
    code: 'ASME B31.3',
    edition: '2018',
    appendix: 'D',
    scope: 'SOURCE_SAMPLE_JUNCTION_SIF_AND_FLEXIBILITY_AUTHORITY',
    correction: 'B31J_IS_NOT_THE_SOURCE_STANDARD_AUTHORITY_FOR_THIS_SAMPLE_OUTPUT',
  }),
  analysisScope: Object.freeze({
    method: 'LINEAR_FEA',
    friction: 'EXCLUDED',
    explicitPhysicalCases: explicitCaseInventory,
    derivedCases: derivedCaseInventory,
    diagnosticCasesUnavailable: OMITTED_DIAGNOSTIC_CASES,
  }),
  strictPolicy: Object.freeze({
    rule: 'abs((solver-reference)/reference) < 0.05',
    relativeLimit: STRICT_RELATIVE_LIMIT,
    exactBoundaryPasses: false,
    zeroReferenceRule: 'EXACT_ZERO',
    unmatchedRows: 'FAIL',
  }),
  totals: Object.freeze({
    matchedScalarDenominator: strict.matchedScalarDenominator,
    passed: strict.passed,
    failed: strict.failed,
    passRate: strict.passed / strict.matchedScalarDenominator,
    failureRate: strict.failed / strict.matchedScalarDenominator,
    coverageStatus: strict.coverage.coverageStatus,
  }),
  summaries: strict.failureSummaries,
  reconciliation: Object.freeze({
    detailedFailureRows: strict.failures.length,
    expectedFailureRows: strict.failed,
    reconciled: strict.failures.length === strict.failed,
    unresolvedClassificationRows: strict.coverage.unresolvedClassificationRows,
    unmatchedSolverRows: strict.coverage.unmatchedSolverRows,
  }),
  failures: strict.failures,
});

const report = Object.freeze({
  schema: 'lfea-bm2-consolidated-latest-output/v4',
  benchmark: 'BM2',
  sourceOutput: 'benchmarks/LFEA/BM2/Output_BM2.xml',
  sourceStandardAuthority: outOfToleranceReport.sourceStandardAuthority,
  restraintSourceCorrection: Object.freeze({
    profileId: CAESAR_INPUTXML_RESTRAINT_TYPE_CORRECTION_PROFILE_ID,
    status: 'GOVERNED_SOURCE_CORRECTION',
    mechanicalClassificationStatus: 'M031_MATRIX_MECHANICS',
    unilateralActiveSetStatus: strict.solverQualification?.nonlinearRestraints?.status
      ?? 'NOT_REPORTED_BY_COMPARISON_RUNTIME',
  }),
  strictPolicy: outOfToleranceReport.strictPolicy,
  diagnosticPolicy: Object.freeze({
    cases: OMITTED_DIAGNOSTIC_CASES,
    sourceAvailability: 'NOT_PRESENT_IN_RETAINED_OUTPUT',
    omissionAllowed: true,
    reason: 'RETAINED_OUTPUT_IS_STRICT_NONFRICTION_PHYSICAL_CASES_ONLY',
  }),
  explicitSourceCaseInventory: explicitCaseInventory,
  derivedCaseInventory,
  caseInventory,
  explicitSourceRetainedResponseScalarCount: explicitCaseInventory
    .reduce((sum, entry) => sum + entry.retainedResponseScalarCount, 0),
  retainedResponseScalarCount: caseInventory
    .reduce((sum, entry) => sum + entry.retainedResponseScalarCount, 0),
  referenceVariantSensitivity: Object.freeze({
    status: 'NOT_AVAILABLE_EXPLICIT_DIAGNOSTIC_VARIANTS_OMITTED',
    omittedCases: OMITTED_DIAGNOSTIC_CASES,
  }),
  strictMatchedSubset: Object.freeze({
    ...strict,
    failures: undefined,
    failureDetailArtifact: Object.freeze({
      json: 'reports/bm2-nonfriction-linear-fea-out-of-tolerance.json',
      csv: 'reports/bm2-nonfriction-linear-fea-out-of-tolerance.csv',
      detailedFailureRows: strict.failed,
    }),
  }),
  excludedAgentWork: Object.freeze({
    pullRequest: 656,
    sourceCorrectionDisposition: 'SUPERSEDED_BY_GOVERNED_COMMON_PROFILE',
    reason: 'BLOCKED_OUTPUT_INFERRED_UNILATERAL_ACTIVE_STATE_WITHOUT_COMPLEMENTARITY_GAP_STIFFNESS_FRICTION_QUALIFICATION',
  }),
  closedM031Scope: Object.freeze([
    'BEND_ARC_AND_FLEXIBILITY_IN_ASSEMBLED_STIFFNESS',
    'JUNCTION_RUN_AND_BRANCH_DIRECTIONAL_STIFFNESS_SINGLE_OWNER_PENDING_B31_3_2018_APPENDIX_D_REQUALIFICATION',
    'PLUS_Y_AND_PLUS_Z_COMPLEMENTARITY_ACTIVE_SET',
    'SCALED_CONDITION_AND_WEAKEST_NODE_DOF_DIAGNOSTIC',
    'FULL_RETAINED_STATION_ROW_CUSTODY',
    'EXPLICIT_PHYSICAL_AND_DERIVED_EXPANSION_CASE_CUSTODY',
  ]),
  nextPriority: Object.freeze([
    'REQUALIFY_JUNCTION_SIF_AND_FLEXIBILITY_TO_ASME_B31_3_2018_APPENDIX_D',
    'USE_NONFRICTION_OUT_OF_TOLERANCE_LEDGER_TO_PRIORITIZE_REMAINING_LINEAR_FEA_DELTAS',
    'CLOSE_REMAINING_NUMERICAL_DELTAS_WITHOUT_CHANGING_THE_FIVE_PERCENT_POLICY',
  ]),
  qualificationStatus: strict.status,
});

if (process.argv.includes('--write')) {
  mkdirSync(dirname(REPORT_PATH), { recursive: true });
  writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  writeFileSync(OUT_OF_TOLERANCE_JSON_PATH, `${JSON.stringify(outOfToleranceReport, null, 2)}\n`, 'utf8');
  writeFileSync(OUT_OF_TOLERANCE_CSV_PATH, failureCsv(strict.failures), 'utf8');
}

console.log(JSON.stringify({
  benchmark: report.benchmark,
  explicitSourceCaseCount: report.explicitSourceCaseInventory.length,
  derivedCaseCount: report.derivedCaseInventory.length,
  retainedResponseScalarCount: report.retainedResponseScalarCount,
  sourceStandardAuthority: report.sourceStandardAuthority,
  correctionProfile: report.restraintSourceCorrection.profileId,
  strictMatchedScalarDenominator: strict.matchedScalarDenominator,
  strictPassed: strict.passed,
  strictFailed: strict.failed,
  strictCoverageStatus: strict.coverage.coverageStatus,
  strictFailuresByCase: strict.failureSummaries.byCase,
  strictFailuresByFamily: strict.failureSummaries.byFamily,
  detailedFailureArtifactRows: strict.failures.length,
  expansionDerivation: strict.expansionDerivation,
  qualificationStatus: report.qualificationStatus,
}, null, 2));
console.log('BM2 non-friction linear-FEA custody PASS; explicit CASE 3/4 and derived CASE 6 are fully traced.');
