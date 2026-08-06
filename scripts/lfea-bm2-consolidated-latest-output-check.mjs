#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findElements } from '../src/core/geometry/adapters/inputxml-tag-scanner.js';
import { CAESAR_INPUTXML_RESTRAINT_TYPE_CORRECTION_PROFILE_ID } from '../src/core/geometry/adapters/inputxml-restraint-type-mutation.js';
import {
  BM2_BENCHMARK_CASE_AUTHORITY,
  BM2_CASE_LABELS,
  BM2_CII_OUTPUT_PATH,
  BM2_EXPLICIT_CASE_LABELS,
} from './lfea-b3.26-bm2-case-authority.mjs';
import {
  BM2_COMPARISON_FAMILIES,
  buildBm2CiiComparisonConditioned,
} from './lfea-b3.26-bm2-output-comparison-runtime.mjs';
import { parseBm2CiiOutput } from './lfea-b3.26-bm2-output-comparison.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUTPUT_PATH = BM2_CII_OUTPUT_PATH;
const REPORT_PATH = resolve(ROOT, 'reports/bm2-consolidated-latest-output.json');
const STRICT_RELATIVE_LIMIT = 0.05;
const SOURCE_SCALARS_PER_CASE = 1866;
const FAMILY_SCALARS = Object.freeze({
  displacement: 366,
  restraint: 36,
  globalForce: 732,
  localForce: 732,
});

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
      assert.equal(entry.families[family], undefined, `BM2 CASE ${parsed.number} duplicates ${family}`);
      const values = Object.freeze(reportValues(report, family));
      entry.families[family] = Object.freeze({ reportCount: 1, scalarCount: values.length });
    }
  }
  return [...byCase.values()].sort((left, right) => left.number - right.number);
}

function expectedExplicitSourceCases() {
  return BM2_EXPLICIT_CASE_LABELS.map((label) => {
    const authority = BM2_BENCHMARK_CASE_AUTHORITY.cases[label];
    return Object.freeze({
      number: authority.caseNumber,
      category: authority.category,
      formula: authority.formula,
    });
  }).sort((left, right) => left.number - right.number);
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

function strictMatchedSubset(comparison) {
  const rows = [];
  for (const [caseLabel, section] of Object.entries(comparison.cases)) {
    const authority = BM2_BENCHMARK_CASE_AUTHORITY.cases[caseLabel];
    if (!authority) throw new Error(`BM2 comparison case ${caseLabel} lacks case authority.`);
    for (const family of BM2_COMPARISON_FAMILIES) {
      for (const source of section[family].rows) {
        const relativeError = source.cii === 0
          ? null
          : Math.abs((source.ours - source.cii) / source.cii);
        rows.push(Object.freeze({
          caseLabel,
          caseNumber: authority.caseNumber,
          caseCategory: authority.category,
          caseFormula: authority.formula,
          family,
          identifier: source.identifier,
          end: source.end,
          field: source.field,
          ours: source.ours,
          reference: source.cii,
          relativeError,
          passed: strictRelativePass(source.cii, source.ours),
        }));
      }
    }
  }
  const passed = rows.filter((row) => row.passed).length;
  const failed = rows.length - passed;
  const coverageComplete = comparison.coverage.coverageStatus === 'COMPLETE';
  return Object.freeze({
    sourceCaseMapping: Object.freeze(Object.fromEntries(BM2_CASE_LABELS.map((label) => [
      label,
      BM2_BENCHMARK_CASE_AUTHORITY.cases[label].caseNumber,
    ]))),
    expansionDerivation: Object.freeze({
      caseNumber: BM2_BENCHMARK_CASE_AUTHORITY.cases.EXP.caseNumber,
      formula: BM2_BENCHMARK_CASE_AUTHORITY.cases.EXP.formula,
      custody: BM2_BENCHMARK_CASE_AUTHORITY.cases.EXP.custody,
    }),
    scope: comparison.comparisonScope,
    matchedScalarDenominator: rows.length,
    passed,
    failed,
    coverage: comparison.coverage,
    status: failed === 0 && coverageComplete ? 'PASS' : 'INCOMPLETE_BLOCKED',
    topFailures: Object.freeze(rows.filter((row) => !row.passed)
      .sort((left, right) => (
        (right.relativeError ?? Number.POSITIVE_INFINITY)
        - (left.relativeError ?? Number.POSITIVE_INFINITY)
      ))
      .slice(0, 50)),
  });
}

function familyScalarCounts(parsedOutput, label) {
  const counts = {
    displacement: parsedOutput.displacement.get(label).rows.length * 6,
    restraint: parsedOutput.restraint.get(label).rows.length * 6,
    globalForce: parsedOutput.globalForce.get(label).rows.length * 12,
    localForce: parsedOutput.localForce.get(label).rows.length * 12,
  };
  assert.deepEqual(counts, FAMILY_SCALARS, `BM2 ${label} retained family scalar custody`);
  return Object.freeze(counts);
}

function gitBlobSha(content) {
  const bytes = Buffer.from(content, 'utf8');
  return createHash('sha1')
    .update(Buffer.from(`blob ${bytes.length}\0`, 'utf8'))
    .update(bytes)
    .digest('hex');
}

qualifyBoundary();
const xmlText = readFileSync(OUTPUT_PATH, 'utf8');
assert.equal(
  gitBlobSha(xmlText),
  BM2_BENCHMARK_CASE_AUTHORITY.expectedOutputGitBlobSha,
  'BM2 output source changed; update custody only after reviewing the complete case inventory',
);

const explicitCases = inventoryExplicitSourceCases(xmlText);
assert.deepEqual(
  explicitCases.map(({ number, category, formula }) => ({ number, category, formula })),
  expectedExplicitSourceCases(),
  'BM2 explicit source case inventory',
);
for (const entry of explicitCases) {
  for (const required of BM2_COMPARISON_FAMILIES) {
    assert.ok(entry.families[required], `BM2 CASE ${entry.number} missing ${required}`);
  }
  entry.retainedResponseScalarCount = Object.values(entry.families)
    .reduce((sum, family) => sum + family.scalarCount, 0);
  assert.equal(
    entry.retainedResponseScalarCount,
    SOURCE_SCALARS_PER_CASE,
    `BM2 CASE ${entry.number} complete response custody`,
  );
}

const parsedOutput = parseBm2CiiOutput(xmlText);
assert.equal(parsedOutput.expansionDerived, true, 'BM2 retained source must derive CASE 6 EXP');
const comparison = buildBm2CiiComparisonConditioned();
const strict = strictMatchedSubset(comparison);
const caseInventory = BM2_CASE_LABELS.map((label) => {
  const authority = BM2_BENCHMARK_CASE_AUTHORITY.cases[label];
  const custody = parsedOutput.caseCustody[label];
  const scalarCounts = familyScalarCounts(parsedOutput, label);
  return Object.freeze({
    number: authority.caseNumber,
    category: authority.category,
    formula: authority.formula,
    custody: custody.actualCustody,
    sourceReportPresent: custody.sourceReportPresent,
    retainedResponseScalarCount: Object.values(scalarCounts).reduce((sum, value) => sum + value, 0),
    familyScalarCounts: scalarCounts,
  });
});
assert.ok(caseInventory.every((entry) => entry.retainedResponseScalarCount === SOURCE_SCALARS_PER_CASE));

const report = Object.freeze({
  schema: 'lfea-bm2-consolidated-latest-output/v3',
  benchmark: 'BM2',
  sourceOutput: BM2_BENCHMARK_CASE_AUTHORITY.outputRepositoryPath,
  sourceOutputGitBlobSha: BM2_BENCHMARK_CASE_AUTHORITY.expectedOutputGitBlobSha,
  benchmarkCaseAuthority: BM2_BENCHMARK_CASE_AUTHORITY,
  restraintSourceCorrection: Object.freeze({
    profileId: CAESAR_INPUTXML_RESTRAINT_TYPE_CORRECTION_PROFILE_ID,
    status: 'GOVERNED_SOURCE_CORRECTION',
    mechanicalClassificationStatus: 'PARTIAL_LEGACY_BASELINE',
    unilateralActiveSetStatus: 'NOT_QUALIFIED',
  }),
  strictPolicy: Object.freeze({
    cases: Object.freeze(BM2_CASE_LABELS.map((label) => (
      BM2_BENCHMARK_CASE_AUTHORITY.cases[label].caseNumber
    ))),
    rule: 'abs((solver-reference)/reference) < 0.05',
    exactBoundaryPasses: false,
    zeroReferenceRule: 'EXACT_ZERO',
    unmatchedRows: 'FAIL',
  }),
  diagnosticPolicy: Object.freeze({
    omittedCases: BM2_BENCHMARK_CASE_AUTHORITY.omittedDiagnosticCases,
    sourceOmissionGoverned: true,
    referenceVariantSensitivityStatus: 'UNAVAILABLE_FROM_RETAINED_SOURCE',
  }),
  caseInventory: Object.freeze(caseInventory),
  explicitSourceCaseCount: explicitCases.length,
  explicitSourceResponseScalarCount: explicitCases
    .reduce((sum, entry) => sum + entry.retainedResponseScalarCount, 0),
  retainedResponseScalarCount: caseInventory
    .reduce((sum, entry) => sum + entry.retainedResponseScalarCount, 0),
  referenceVariantSensitivity: Object.freeze([]),
  strictMatchedSubset: strict,
  excludedAgentWork: Object.freeze({
    pullRequest: 656,
    sourceCorrectionDisposition: 'SUPERSEDED_BY_GOVERNED_COMMON_PROFILE',
    reason: 'BLOCKED_OUTPUT_INFERRED_UNILATERAL_ACTIVE_STATE_WITHOUT_COMPLEMENTARITY_GAP_STIFFNESS_FRICTION_QUALIFICATION',
  }),
  nextPriority: Object.freeze([
    'COMPLETE_BEND_ARC_AND_DIRECTIONAL_FLEXIBILITY_IN_SOLVE',
    'APPLY_B31J_JUNCTION_STIFFNESS_WITH_SINGLE_OWNERSHIP',
    'QUALIFY_CORRECTED_RESTRAINT_TYPE_MECHANICS_AND_UNILATERAL_ACTIVE_SET',
    'DIAGNOSE_CONDITIONING_AND_NEAR_NULL_MODES_BY_NODE_DOF',
    'CLOSE_FULL_STATION_ROW_CUSTODY_BEFORE_PARITY_CLAIM',
  ]),
  qualificationStatus: strict.status,
});

assert.equal(report.explicitSourceCaseCount, 2);
assert.equal(report.explicitSourceResponseScalarCount, 3732);
assert.equal(report.retainedResponseScalarCount, 5598);

if (process.argv.includes('--write')) {
  mkdirSync(dirname(REPORT_PATH), { recursive: true });
  writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

console.log(JSON.stringify({
  benchmark: report.benchmark,
  explicitSourceCaseCount: report.explicitSourceCaseCount,
  retainedQualifiedCaseCount: report.caseInventory.length,
  retainedResponseScalarCount: report.retainedResponseScalarCount,
  correctionProfile: report.restraintSourceCorrection.profileId,
  strictMatchedScalarDenominator: strict.matchedScalarDenominator,
  strictPassed: strict.passed,
  strictFailed: strict.failed,
  strictCoverageStatus: strict.coverage.coverageStatus,
  qualificationStatus: report.qualificationStatus,
  caseCustody: Object.fromEntries(report.caseInventory.map((entry) => [entry.number, entry.custody])),
}, null, 2));
console.log('BM2 consolidated latest-output custody PASS; numerical parity remains governed by qualificationStatus.');
