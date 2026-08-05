#!/usr/bin/env node

import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findElements } from '../src/core/geometry/adapters/inputxml-tag-scanner.js';
import { buildBm2CiiComparisonConditioned } from './lfea-b3.26-bm2-output-comparison-runtime.mjs';
import { CAESAR_INPUTXML_RESTRAINT_TYPE_CORRECTION_PROFILE_ID } from '../src/core/geometry/adapters/inputxml-restraint-type-mutation.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUTPUT_PATH = resolve(ROOT, 'benchmarks/LFEA/BM2/Output_BM2.xml');
const REPORT_PATH = resolve(ROOT, 'reports/bm2-consolidated-latest-output.json');
const STRICT_RELATIVE_LIMIT = 0.05;
const EXPECTED_CASES = Object.freeze([
  Object.freeze({ number: 1, category: 'OPE', tier: 'DIAGNOSTIC_PRIORITY', formula: 'W+T1+P1' }),
  Object.freeze({ number: 2, category: 'SUS', tier: 'DIAGNOSTIC_PRIORITY', formula: 'W+P1' }),
  Object.freeze({ number: 3, category: 'OPE', tier: 'STRICT_NO_FRICTION', formula: 'W+T1+P1' }),
  Object.freeze({ number: 4, category: 'SUS', tier: 'STRICT_NO_FRICTION', formula: 'W+P1' }),
  Object.freeze({ number: 5, category: 'EXP', tier: 'DIAGNOSTIC_PRIORITY', formula: 'L5=L1-L2' }),
  Object.freeze({ number: 6, category: 'EXP', tier: 'STRICT_NO_FRICTION', formula: 'L6=L3-L4' }),
]);

function parseCaseLabel(label) {
  const match = /^CASE\s+(\d+)\s+\(([A-Z]+)\)\s+(.+)$/u.exec(String(label ?? '').trim());
  if (!match) throw new Error(`Unrecognised BM2 LOADCASE: ${label}`);
  return Object.freeze({ number: Number(match[1]), category: match[2], formula: match[3], label: String(label) });
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

function inventory(xmlText) {
  const definitions = [
    ['displacement', 'DISPLACEMENT_REPORT'],
    ['restraint', 'RESTRAINT_REPORT'],
    ['globalForce', 'GLOBAL_FORCE_REPORT'],
    ['localForce', 'LOCAL_FORCE_REPORT'],
  ];
  const byCase = new Map();
  for (const [family, tag] of definitions) {
    for (const report of findElements(xmlText, tag)) {
      const parsed = parseCaseLabel(report.attributes.LOADCASE);
      if (!byCase.has(parsed.number)) byCase.set(parsed.number, { ...parsed, families: {} });
      const entry = byCase.get(parsed.number);
      assert.equal(entry.category, parsed.category);
      assert.equal(entry.formula, parsed.formula);
      const values = Object.freeze(reportValues(report, family));
      entry.families[family] = Object.freeze({ reportCount: 1, scalarCount: values.length, values });
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

function compareReferenceCases(cases, leftNumber, rightNumber) {
  const left = cases.find((row) => row.number === leftNumber);
  const right = cases.find((row) => row.number === rightNumber);
  const families = {};
  for (const family of ['displacement', 'restraint', 'globalForce', 'localForce']) {
    const a = left.families[family].values;
    const b = right.families[family].values;
    assert.equal(a.length, b.length, `BM2 CASE ${leftNumber}/${rightNumber} ${family} scalar custody`);
    let changed = 0;
    let maximumRelativeDelta = 0;
    for (let index = 0; index < a.length; index += 1) {
      if (a[index] !== b[index]) changed += 1;
      const scale = Math.max(Math.abs(a[index]), Math.abs(b[index]), Number.MIN_VALUE);
      maximumRelativeDelta = Math.max(maximumRelativeDelta, Math.abs(a[index] - b[index]) / scale);
    }
    families[family] = Object.freeze({ pairedScalars: a.length, changedScalars: changed, maximumRelativeDelta });
  }
  return Object.freeze({ leftCase: leftNumber, rightCase: rightNumber, families: Object.freeze(families) });
}

function strictMatchedSubset() {
  const comparison = buildBm2CiiComparisonConditioned();
  const rows = [];
  for (const [caseLabel, section] of Object.entries(comparison.cases)) {
    for (const family of ['displacement', 'restraint', 'globalForce', 'localForce']) {
      for (const source of section[family].rows) {
        const relativeError = source.cii === 0 ? null : Math.abs((source.ours - source.cii) / source.cii);
        rows.push(Object.freeze({
          caseLabel,
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
    sourceCaseMapping: Object.freeze({ OPE: 3, SUS: 4, EXP: 6 }),
    scope: comparison.comparisonScope,
    matchedScalarDenominator: rows.length,
    passed,
    failed,
    coverage: comparison.coverage,
    status: failed === 0 && coverageComplete ? 'PASS' : 'INCOMPLETE_BLOCKED',
    solverQualification: comparison.solverQualification,
    topFailures: Object.freeze(rows.filter((row) => !row.passed)
      .sort((left, right) => (right.relativeError ?? Number.POSITIVE_INFINITY) - (left.relativeError ?? Number.POSITIVE_INFINITY))
      .slice(0, 50)),
  });
}

qualifyBoundary();
const xmlText = readFileSync(OUTPUT_PATH, 'utf8');
const cases = inventory(xmlText);
assert.deepEqual(
  cases.map(({ number, category, formula }) => ({ number, category, formula })),
  EXPECTED_CASES.map(({ number, category, formula }) => ({ number, category, formula })),
);

for (const entry of cases) {
  entry.tier = EXPECTED_CASES.find((expected) => expected.number === entry.number).tier;
  entry.retainedResponseScalarCount = Object.values(entry.families)
    .reduce((sum, family) => sum + family.scalarCount, 0);
  assert.equal(entry.retainedResponseScalarCount, 1866, `BM2 CASE ${entry.number} complete response custody`);
  for (const required of ['displacement', 'restraint', 'globalForce', 'localForce']) {
    assert.ok(entry.families[required], `BM2 CASE ${entry.number} missing ${required}`);
  }
}

const sensitivity = Object.freeze([
  compareReferenceCases(cases, 1, 3),
  compareReferenceCases(cases, 2, 4),
  compareReferenceCases(cases, 5, 6),
]);
const strict = strictMatchedSubset();
const report = Object.freeze({
  schema: 'lfea-bm2-consolidated-latest-output/v2',
  benchmark: 'BM2',
  sourceOutput: 'benchmarks/LFEA/BM2/Output_BM2.xml',
  restraintSourceCorrection: Object.freeze({
    profileId: CAESAR_INPUTXML_RESTRAINT_TYPE_CORRECTION_PROFILE_ID,
    status: 'GOVERNED_SOURCE_CORRECTION',
    mechanicalClassificationStatus: 'M031_MATRIX_MECHANICS',
    unilateralActiveSetStatus: strict.solverQualification.nonlinearRestraints.status,
  }),
  strictPolicy: Object.freeze({
    cases: Object.freeze([3, 4, 6]),
    rule: 'abs((solver-reference)/reference) < 0.05',
    exactBoundaryPasses: false,
    zeroReferenceRule: 'EXACT_ZERO',
    unmatchedRows: 'FAIL',
  }),
  diagnosticPolicy: Object.freeze({ cases: Object.freeze([1, 2, 5]), omissionAllowed: false }),
  caseInventory: Object.freeze(cases.map((entry) => Object.freeze({
    number: entry.number,
    category: entry.category,
    formula: entry.formula,
    label: entry.label,
    tier: entry.tier,
    retainedResponseScalarCount: entry.retainedResponseScalarCount,
    familyScalarCounts: Object.freeze(Object.fromEntries(Object.entries(entry.families)
      .map(([family, value]) => [family, value.scalarCount]))),
  }))),
  retainedResponseScalarCount: cases.reduce((sum, entry) => sum + entry.retainedResponseScalarCount, 0),
  referenceVariantSensitivity: sensitivity,
  strictMatchedSubset: strict,
  excludedAgentWork: Object.freeze({
    pullRequest: 656,
    sourceCorrectionDisposition: 'SUPERSEDED_BY_GOVERNED_COMMON_PROFILE',
    reason: 'BLOCKED_OUTPUT_INFERRED_UNILATERAL_ACTIVE_STATE_WITHOUT_COMPLEMENTARITY_GAP_STIFFNESS_FRICTION_QUALIFICATION',
  }),
  closedM031Scope: Object.freeze([
    'BEND_ARC_AND_FLEXIBILITY_IN_ASSEMBLED_STIFFNESS',
    'B31J_RUN_AND_BRANCH_DIRECTIONAL_STIFFNESS_SINGLE_OWNER',
    'PLUS_Y_COMPLEMENTARITY_ACTIVE_SET',
    'SCALED_CONDITION_AND_WEAKEST_NODE_DOF_DIAGNOSTIC',
    'FULL_RETAINED_STATION_ROW_CUSTODY',
  ]),
  nextPriority: Object.freeze([
    'CLASSIFY_CORRECTED_RESTRAINT_TYPE_15_WITH_SOURCE_AUTHORITY',
    'RESOLVE_SOURCE_SIF_TYPE_5_B31J_APPLICABILITY',
    'CLOSE_REMAINING_NUMERICAL_DELTAS_WITHOUT_CHANGING_THE_FIVE_PERCENT_POLICY',
  ]),
  qualificationStatus: strict.status,
});

if (process.argv.includes('--write')) {
  mkdirSync(dirname(REPORT_PATH), { recursive: true });
  writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

console.log(JSON.stringify({
  benchmark: report.benchmark,
  caseCount: report.caseInventory.length,
  retainedResponseScalarCount: report.retainedResponseScalarCount,
  correctionProfile: report.restraintSourceCorrection.profileId,
  strictMatchedScalarDenominator: strict.matchedScalarDenominator,
  strictPassed: strict.passed,
  strictFailed: strict.failed,
  strictCoverageStatus: strict.coverage.coverageStatus,
  qualificationStatus: report.qualificationStatus,
  referencePairsChangedScalars: sensitivity.map((pair) => ({
    pair: `${pair.leftCase}/${pair.rightCase}`,
    changed: Object.values(pair.families).reduce((sum, family) => sum + family.changedScalars, 0),
  })),
}, null, 2));
console.log('BM2 consolidated latest-output custody PASS; numerical parity remains governed by qualificationStatus.');
