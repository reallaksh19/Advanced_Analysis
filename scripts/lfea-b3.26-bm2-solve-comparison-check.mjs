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
  buildBm2CiiComparisonConditioned,
} from './lfea-b3.26-bm2-output-comparison-runtime.mjs';

console.log('\n--- LFEA B-3.26 M027 BM2 first solve + real CAESAR comparison ---');

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
// Phase 1 proves 11 physical BEND child records; 9 retain resolved bend-radius geometry.
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
for (const label of ['OPE', 'SUS', 'EXP']) {
  assert.equal(output.displacement.get(label).size, 61);
  assert.equal(output.globalForce.get(label).size, 61);
  assert.equal(output.localForce.get(label).size, 61);
  assert.ok(output.restraint.get(label).size > 0);
}

const comparison = buildBm2CiiComparisonConditioned();
assert.equal(comparison.schema, 'lfea-bm2-cii-output-comparison/v3');
assert.equal(comparison.toleranceAuthority, 'RESULT_FAMILY_AND_COMPONENT_V1');
assert.ok(['WITHIN_TOLERANCE', 'GAP_DISCLOSED'].includes(comparison.qualificationStatus));
assert.deepEqual(comparison.totals, {
  comparisons: 2232,
  passed: 771,
  failed: 1461,
  untraced: 0,
});
for (const family of BM2_COMPARISON_FAMILIES) {
  assert.equal(typeof comparison.toleranceAudit[family], 'object');
}
assert.equal(comparison.totals.comparisons, comparison.totals.passed + comparison.totals.failed);
assert.equal(
  comparison.totals.untraced,
  0,
  'Every out-of-tolerance result must name at least one cause code.',
);
for (const label of ['OPE', 'SUS', 'EXP']) {
  const section = comparison.cases[label];
  assert.ok(section.displacement.rows.length > 0, `${label} displacement matches`);
  assert.ok(section.restraint.rows.length > 0, `${label} restraint matches`);
  assert.ok(section.globalForce.rows.length > 0, `${label} global-force matches`);
  assert.ok(section.localForce.rows.length > 0, `${label} local-force matches`);
  for (const family of BM2_COMPARISON_FAMILIES) {
    assert.equal(section[family].summary.untraced, 0, `${label} ${family} untraced failures`);
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
  unmatchedCiiNodes: section.displacement.unmatchedNodes.length,
  unmatchedCiiGlobalPairs: section.globalForce.unmatchedPairKeys.length,
  unmatchedCiiLocalPairs: section.localForce.unmatchedPairKeys.length,
}]));
console.log(JSON.stringify({
  qualificationStatus: comparison.qualificationStatus,
  totals: comparison.totals,
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
console.log(`LFEA B-3.26 M027 BM2 comparison ${comparison.qualificationStatus}`);
