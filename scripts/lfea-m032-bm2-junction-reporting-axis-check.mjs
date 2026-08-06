#!/usr/bin/env node
import assert from 'node:assert/strict';
import { buildBm2CiiComparisonConditioned } from './lfea-b3.26-bm2-output-comparison-runtime.mjs';
import { solveBm2InputXmlQualified as solveCorrected } from './lfea-m031-bm2-qualified-runtime.mjs';
import { solveBm2InputXmlQualified as solveBaseline } from './lfea-m031-bm2-qualified-runtime-base.mjs';

const BASELINE = Object.freeze({ denominator: 5598, passed: 4404, failed: 1194 });
const TARGET_PAIR = '130-140';

function elementIndex(solved) {
  return new Map(solved.report.elements.map((element) => [
    `${element.fromNode}-${element.toNode}`,
    element,
  ]));
}

const baseline = solveBaseline();
const corrected = solveCorrected();
assert.deepEqual(corrected.report.stationCustody, baseline.report.stationCustody);
assert.deepEqual(corrected.report.nodes, baseline.report.nodes);
assert.deepEqual(corrected.report.localForceReportingAuthority.correctedPairs, [TARGET_PAIR]);

const before = elementIndex(baseline);
const after = elementIndex(corrected);
assert.deepEqual([...after.keys()], [...before.keys()]);
for (const [pair, baselineElement] of before) {
  const correctedElement = after.get(pair);
  assert.deepEqual(correctedElement.sustained.global, baselineElement.sustained.global, `${pair} sustained global action`);
  assert.deepEqual(correctedElement.operating.global, baselineElement.operating.global, `${pair} operating global action`);
  if (pair !== TARGET_PAIR) {
    assert.deepEqual(correctedElement, baselineElement, `${pair} remains byte-semantic equivalent`);
  }
}

const targetBefore = before.get(TARGET_PAIR);
const targetAfter = after.get(TARGET_PAIR);
assert.ok(targetBefore && targetAfter, `${TARGET_PAIR} report pair`);
assert.equal(targetAfter.reportingAxisCustody.profile, 'M032_BM2_JUNCTION_ADJACENT_REPORTING_PLANE_V1');
assert.equal(
  targetAfter.reportingAxisCustody.basis,
  'CORRECT_ONLY_EXACT_180_DEGREE_TRANSVERSE_FRAME_DISCONTINUITY',
);
assert.notDeepEqual(targetAfter.sustained.local.I, targetBefore.sustained.local.I);
assert.deepEqual(targetAfter.sustained.global.I, targetBefore.sustained.global.I);

const comparison = buildBm2CiiComparisonConditioned();
assert.equal(comparison.coverage.matchedScalarDenominator, BASELINE.denominator);
assert.equal(comparison.coverage.coverageStatus, 'COMPLETE');
assert.equal(comparison.coverage.unresolvedClassificationRows, 0);
assert.equal(comparison.coverage.unmatchedSolverRows, 0);
assert.equal(comparison.totals.untraced, 0);
assert.ok(comparison.totals.passed > BASELINE.passed, 'M032-B must improve the frozen BM2 pass count.');
assert.ok(comparison.totals.failed < BASELINE.failed, 'M032-B must reduce the frozen BM2 failure count.');

const requiredPasses = Object.freeze([
  ['OPE', 'fy'],
  ['OPE', 'mz'],
  ['SUS', 'fy'],
  ['SUS', 'fz'],
  ['SUS', 'my'],
  ['SUS', 'mz'],
  ['EXP', 'fy'],
  ['EXP', 'mz'],
]);
for (const [caseLabel, field] of requiredPasses) {
  const row = comparison.cases[caseLabel].localForce.rows.find((candidate) => (
    candidate.identifier === TARGET_PAIR && candidate.end === 'I' && candidate.field === field
  ));
  assert.ok(row, `${caseLabel}/${TARGET_PAIR}/I/${field} comparison row`);
  assert.equal(row.passed, true, `${caseLabel}/${TARGET_PAIR}/I/${field} strict pass`);
}

console.log(JSON.stringify({
  status: 'PASS',
  hypothesis: 'EXACT_180_DEGREE_TRANSVERSE_FRAME_DISCONTINUITY',
  denominator: comparison.totals.comparisons,
  before: BASELINE,
  after: comparison.totals,
  delta: {
    passed: comparison.totals.passed - BASELINE.passed,
    failed: comparison.totals.failed - BASELINE.failed,
  },
  correctedPairs: corrected.report.localForceReportingAuthority.correctedPairs,
  targetPair: TARGET_PAIR,
  requiredPasses,
}, null, 2));
