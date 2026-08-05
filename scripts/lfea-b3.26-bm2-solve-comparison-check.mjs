#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { solveBm2InputXmlConditioned } from './lfea-b3.26-bm2-solve-runtime.mjs';
import {
  BM2_CII_OUTPUT_PATH,
  BM2_COMPARISON_POLICY,
  parseBm2CiiOutput,
} from './lfea-b3.26-bm2-output-comparison.mjs';
import {
  absoluteToleranceForComparison,
  BM2_COMPARISON_FAMILIES,
  BM2_COVERAGE_SCHEMA,
  BM2_MATCHED_SUBSET_METRIC,
  buildBm2CiiComparisonConditioned,
} from './lfea-b3.26-bm2-output-comparison-runtime.mjs';

console.log('\n--- LFEA B-3.26 M027 BM2 benchmark custody + matched-subset comparison ---');

assert.deepEqual(BM2_COMPARISON_FAMILIES, [
  'displacement',
  'restraint',
  'globalForce',
  'localForce',
]);
for (const field of ['UX', 'UY', 'UZ']) {
  assert.equal(
    absoluteToleranceForComparison('displacement', field),
    BM2_COMPARISON_POLICY.absoluteTolerance.translation,
  );
  assert.equal(
    absoluteToleranceForComparison('restraint', field),
    BM2_COMPARISON_POLICY.absoluteTolerance.force,
  );
}
for (const field of ['RX', 'RY', 'RZ']) {
  assert.equal(
    absoluteToleranceForComparison('displacement', field),
    BM2_COMPARISON_POLICY.absoluteTolerance.rotation,
  );
  assert.equal(
    absoluteToleranceForComparison('restraint', field),
    BM2_COMPARISON_POLICY.absoluteTolerance.moment,
  );
}
for (const family of ['globalForce', 'localForce']) {
  for (const field of ['fx', 'fy', 'fz']) {
    assert.equal(
      absoluteToleranceForComparison(family, field),
      BM2_COMPARISON_POLICY.absoluteTolerance.force,
    );
  }
  for (const field of ['mx', 'my', 'mz']) {
    assert.equal(
      absoluteToleranceForComparison(family, field),
      BM2_COMPARISON_POLICY.absoluteTolerance.moment,
    );
  }
}
assert.throws(
  () => absoluteToleranceForComparison('displacement', 'fx'),
  /Unsupported BM2 comparison family\/field/u,
);
assert.throws(
  () => absoluteToleranceForComparison('unknown', 'UX'),
  /Unsupported BM2 comparison family\/field/u,
);

const solved = solveBm2InputXmlConditioned();
assert.equal(solved.normalized.geometry.valid, true);
assert.equal(solved.report.schema, 'm027-bm2-first-solve-report/v1');
assert.equal(solved.report.counts.sourceElements, 35);
assert.equal(solved.report.counts.rigidElements, 9);
assert.equal(solved.report.counts.bendTaggedElements, 9);
assert.equal(solved.report.counts.reducerTaggedElements, 0);
assert.equal(solved.report.solverConditioningProfile.backend, 'FEA_SPARSE_DIRECT_CHOLESKY_LDLT_V1');
assert.equal(solved.report.solverConditioningProfile.nearZeroPivotTolerance.value, 1e-12);
assert.ok(['QUALIFIED', 'CONDITIONAL'].includes(solved.sustained.execution.status));
assert.ok(['QUALIFIED', 'CONDITIONAL'].includes(solved.operating.execution.status));
assert.equal(solved.sustained.recovery.elementActions.length, 35);
assert.equal(solved.operating.recovery.elementActions.length, 35);

const rigidRows = solved.report.elements.filter((row) => row.rigid);
assert.equal(rigidRows.length, 9);
assert.ok(rigidRows.every((row) => row.rigidAuthority !== null));
assert.ok(rigidRows.every((row) => row.codeStressEligible === false));
assert.ok(rigidRows.every(
  (row) => row.rigidAuthority.structuralParticipation.recoverForcesAndMoments === true,
));
const zeroRigid = rigidRows.find((row) => row.fromNode === '300' && row.toNode === '310');
assert.ok(zeroRigid, 'The real zero-weight rigid element 300-310 must be present.');
assert.equal(zeroRigid.rigidAuthority.gravity.enteredRigidWeight, 0);
assert.equal(zeroRigid.rigidAuthority.gravity.totalWeight, 0);
assert.equal(zeroRigid.rigidAuthority.gravity.totalLineWeight, 0);
assert.ok(rigidRows.filter((row) => row !== zeroRigid).every(
  (row) => row.rigidAuthority.gravity.enteredRigidWeight > 0,
));
assert.equal(solved.report.elements.some((row) => row.rigid && row.codeStressEligible), false);
assert.equal(solved.report.limitations.some((row) => row.code === 'BM2_NO_TRUE_REDUCER_TAG'), true);
assert.equal(
  solved.report.limitations.some((row) => row.code === 'BM2_SOLVER_CONDITIONING_PROFILE_STUDY'),
  true,
);

const output = parseBm2CiiOutput(readFileSync(BM2_CII_OUTPUT_PATH, 'utf8'));
assert.equal(output.schema, 'fea-caesar-output-row-custody/v1');
for (const label of ['OPE', 'SUS', 'EXP']) {
  assert.equal(output.displacement.get(label).rows.length, 61);
  assert.equal(output.globalForce.get(label).rows.length, 61);
  assert.equal(output.localForce.get(label).rows.length, 61);
  assert.equal(output.restraint.get(label).rows.length, 6);
  assert.equal(output.restraint.get(label).aggregatedByNode.size, 5);
  assert.equal(output.restraint.get(label).duplicateRowOccurrences, 1);
}

const actionBlock = (fromNode, toNode, fx) => `
  <ELEMENT FROM_NODE="${fromNode}" TO_NODE="${toNode}">
    <FORCES><FROM FX="${fx}" FY="0" FZ="0"/><TO FX="${-fx}" FY="0" FZ="0"/></FORCES>
    <MOMENTS><FROM MX="0" MY="0" MZ="0"/><TO MX="0" MY="0" MZ="0"/></MOMENTS>
  </ELEMENT>`;
const reportFixture = (label) => `
<DISPLACEMENT_REPORT LOADCASE="L1 (${label})">
  <NODE NUMBER="1"><TRANSLATIONS DX="0" DY="0" DZ="0"/><ROTATIONS RX="0" RY="0" RZ="0"/></NODE>
</DISPLACEMENT_REPORT>
<RESTRAINT_REPORT LOADCASE="L1 (${label})">
  <RESTRAINT NODE="1" TYPE="+Y"><FORCES FX="0" FY="1" FZ="0"/><MOMENTS MX="0" MY="0" MZ="0"/></RESTRAINT>
</RESTRAINT_REPORT>
<GLOBAL_FORCE_REPORT LOADCASE="L1 (${label})">
  ${actionBlock('1', '2', 1)}
  ${actionBlock('1', '2', 2)}
  ${actionBlock('2', '1', 3)}
</GLOBAL_FORCE_REPORT>
<LOCAL_FORCE_REPORT LOADCASE="L1 (${label})">
  ${actionBlock('1', '2', 1)}
  ${actionBlock('1', '2', 2)}
  ${actionBlock('2', '1', 3)}
</LOCAL_FORCE_REPORT>`;
const fixture = parseBm2CiiOutput(`<OUTPUT>${['OPE', 'SUS', 'EXP'].map(reportFixture).join('\n')}</OUTPUT>`);
for (const label of ['OPE', 'SUS', 'EXP']) {
  const global = fixture.globalForce.get(label);
  assert.equal(global.rows.length, 3, 'Duplicate and reversed report rows must all survive.');
  assert.equal(global.byPair.get('1-2').length, 2);
  assert.equal(global.byPair.get('1-2')[0].occurrenceOrdinalWithinCaseFamilyAndPair, 0);
  assert.equal(global.byPair.get('1-2')[1].occurrenceOrdinalWithinCaseFamilyAndPair, 1);
  assert.equal(global.byPair.get('2-1').length, 1);
  assert.equal(global.duplicateRowOccurrences, 1);
  assert.equal(new Set(global.rows.map((row) => row.rowUid)).size, 3);
}

const comparison = buildBm2CiiComparisonConditioned();
assert.equal(comparison.schema, 'lfea-bm2-cii-output-comparison/v4');
assert.equal(comparison.comparisonMetric, BM2_MATCHED_SUBSET_METRIC);
assert.equal(comparison.comparisonScope, 'MATCHED_SOURCE_SUBSET_ONLY');
assert.equal(comparison.completeComparisonClaim, false);
assert.equal(comparison.toleranceAuthority, 'RESULT_FAMILY_AND_COMPONENT_V1');
assert.equal(comparison.matchedSubsetStatus, 'GAP_DISCLOSED');
assert.equal(comparison.qualificationStatus, 'INCOMPLETE_BLOCKED');
assert.match(comparison.restraintAuthorityStatus, /PROJECT_MUTATIONS_NOT_BENCHMARK_AUTHORITY/u);
assert.deepEqual(comparison.totals, {
  comparisons: 2232,
  passed: 771,
  failed: 1461,
  untraced: 0,
});
assert.equal(comparison.coverage.schema, BM2_COVERAGE_SCHEMA);
assert.equal(comparison.coverage.metricName, BM2_MATCHED_SUBSET_METRIC);
assert.equal(comparison.coverage.matchedScalarDenominator, 2232);
assert.equal(comparison.coverage.sourceLevelScalarDenominator, 3240);
assert.equal(comparison.coverage.fullStationScalarDenominator, 5598);
assert.equal(comparison.coverage.declaredReportRows, 567);
assert.equal(comparison.coverage.parsedReportRows, 567);
assert.equal(comparison.coverage.duplicateRowOccurrences, 3);
assert.equal(comparison.coverage.unresolvedClassificationRows, 318);
assert.equal(comparison.coverage.unmatchedSolverRows, 84);
assert.equal(comparison.coverage.coverageStatus, 'INCOMPLETE_BLOCKED');
for (const family of BM2_COMPARISON_FAMILIES) {
  assert.equal(typeof comparison.toleranceAudit[family], 'object');
}
assert.equal(comparison.totals.comparisons, comparison.totals.passed + comparison.totals.failed);
assert.equal(
  comparison.totals.untraced,
  0,
  'Every out-of-tolerance matched-subset result must name at least one cause code.',
);
for (const label of ['OPE', 'SUS', 'EXP']) {
  const section = comparison.cases[label];
  assert.equal(section.displacement.coverage.matchedScalarDenominator, 210);
  assert.equal(section.restraint.coverage.matchedScalarDenominator, 30);
  assert.equal(section.globalForce.coverage.matchedScalarDenominator, 252);
  assert.equal(section.localForce.coverage.matchedScalarDenominator, 252);
  assert.equal(section.displacement.coverage.unresolvedClassificationRows, 26);
  assert.equal(section.globalForce.coverage.unresolvedClassificationRows, 40);
  assert.equal(section.localForce.coverage.unresolvedClassificationRows, 40);
  assert.equal(section.globalForce.coverage.unmatchedSolverRows, 14);
  assert.equal(section.localForce.coverage.unmatchedSolverRows, 14);
  assert.equal(section.restraint.coverage.duplicateRowOccurrences, 1);
  for (const family of BM2_COMPARISON_FAMILIES) {
    assert.equal(section[family].summary.untraced, 0, `${label} ${family} untraced failures`);
    assert.equal(section[family].coverage.schema, BM2_COVERAGE_SCHEMA);
  }
}

const repeated = buildBm2CiiComparisonConditioned();
assert.equal(JSON.stringify(repeated), JSON.stringify(comparison), 'BM2 solve/comparison must be deterministic.');

const reportDirectory = fileURLToPath(new URL('../reports', import.meta.url));
mkdirSync(reportDirectory, { recursive: true });
writeFileSync(
  fileURLToPath(new URL('../reports/lfea-bm2-cii-output-comparison.json', import.meta.url)),
  `${JSON.stringify(comparison, null, 2)}\n`,
);

const caseSummary = Object.fromEntries(Object.entries(comparison.cases).map(([label, section]) => [label, {
  displacement: section.displacement.summary,
  restraint: section.restraint.summary,
  globalForce: section.globalForce.summary,
  localForce: section.localForce.summary,
  coverage: Object.fromEntries(BM2_COMPARISON_FAMILIES.map((family) => [family, {
    matchedRows: section[family].coverage.matchedRows,
    unresolvedClassificationRows: section[family].coverage.unresolvedClassificationRows,
    unmatchedSolverRows: section[family].coverage.unmatchedSolverRows,
    matchedScalarDenominator: section[family].coverage.matchedScalarDenominator,
    fullStationScalarDenominator: section[family].coverage.fullStationScalarDenominator,
    coverageStatus: section[family].coverage.coverageStatus,
  }])),
}]));
console.log(JSON.stringify({
  qualificationStatus: comparison.qualificationStatus,
  matchedSubsetStatus: comparison.matchedSubsetStatus,
  totals: comparison.totals,
  coverage: comparison.coverage,
  restraintAuthorityStatus: comparison.restraintAuthorityStatus,
  toleranceAuthority: comparison.toleranceAuthority,
  toleranceAudit: comparison.toleranceAudit,
  executionStatus: {
    sustained: solved.sustained.execution.status,
    operating: solved.operating.execution.status,
  },
  cases: caseSummary,
  solverFactorization: {
    sustained: solved.sustained.execution.factorization,
    operating: solved.operating.execution.factorization,
  },
  rigidAuthorities: rigidRows.map((row) => ({
    pair: `${row.fromNode}-${row.toNode}`,
    totalWeight: row.rigidAuthority.gravity.totalWeight,
    codeStressEligible: row.codeStressEligible,
  })),
  limitations: comparison.limitations,
}, null, 2));
console.log(`LFEA B-3.26 M027 benchmark ${comparison.qualificationStatus}; matched subset ${comparison.matchedSubsetStatus}`);
