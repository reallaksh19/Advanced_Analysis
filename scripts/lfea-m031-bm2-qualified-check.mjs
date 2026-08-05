#!/usr/bin/env node
import assert from 'node:assert/strict';
import { buildBm2CiiComparisonConditioned } from './lfea-b3.26-bm2-output-comparison-runtime.mjs';
import { solveBm2InputXmlQualified } from './lfea-m031-bm2-qualified-runtime.mjs';

console.log('\n--- M031 BM2 qualified mechanics and full-station comparison ---');
const solved = solveBm2InputXmlQualified();
const report = solved.report;
assert.equal(report.schema, 'm031-bm2-qualified-solve-report/v1');
assert.equal(report.counts.bends, 11);
assert.equal(report.counts.bendStations, 21);
assert.equal(report.counts.b31jJunctions, 5);
assert.equal(report.counts.retainedReportNodes, 61);
assert.equal(report.counts.retainedReportPairs, 61);
assert.ok(report.flexibilityOwnership.bendElements > 11);
assert.equal(report.flexibilityOwnership.duplicateOwnerCount, 0);
assert.equal(report.flexibilityOwnership.fictitiousRigidElements, 5);
assert.equal(report.flexibilityOwnership.fictitiousRigidAuthority, 'CAESAR_RIGID_10X_ENTERED_WALL_ZERO_MASS_ZERO_THERMAL_V1');
assert.equal(report.junctionClassification.weldingTees, 3);
assert.equal(report.junctionClassification.weldolets, 2);
assert.equal(report.junctionClassification.falseWeldingTeeSubstitutions, 0);
assert.equal(report.localForceReportingAuthority.rule, 'CAESAR_ELEMENT_ENDPOINT_LOCAL_ABC_V1');
assert.equal(report.nonlinearRestraints.status, 'QUALIFIED_COMPLEMENTARITY_ACTIVE_SET_V1');
assert.equal(report.restraintClassification.type15.canonicalType, '+Z');
assert.equal(report.restraintClassification.type15.dof, 'UZ');
assert.equal(report.counts.plusZCandidates, 1);
assert.ok(report.nonlinearRestraints.sustained.ledger.every((row) => row.passed));
assert.ok(report.nonlinearRestraints.operating.ledger.every((row) => row.passed));
assert.equal(report.nonlinearRestraints.expansion.status, 'DERIVED_FROM_CONVERGED_PHYSICAL_CASES');
assert.equal(report.conditioning.sustained.matrixConditioned, true);
assert.equal(report.conditioning.operating.matrixConditioned, true);
assert.equal(report.conditioning.sustained.residualQualified, true);
assert.equal(report.conditioning.sustained.qualificationStatus, 'PASS');
assert.ok(report.conditioning.sustained.backwardResidual.value < 1e-9);
assert.equal(report.conditioning.operating.residualQualified, true);
assert.equal(report.conditioning.operating.wellConditioned, true);
assert.ok(report.conditioning.sustained.weakestNodeDof);
assert.ok(report.conditioning.operating.weakestNodeDof);
assert.equal(report.stationCustody.sourceLevelScalarDenominator, 3240);
assert.equal(report.stationCustody.fullRetainedStationScalarDenominator, 5598);

const comparison = buildBm2CiiComparisonConditioned();
const custodyDiagnostics = Object.fromEntries(Object.entries(comparison.cases).map(([caseLabel, section]) => [
  caseLabel,
  Object.fromEntries(['displacement', 'restraint', 'globalForce', 'localForce'].map((family) => [
    family,
    {
      coverageStatus: section[family].coverage.coverageStatus,
      matchedScalarDenominator: section[family].coverage.matchedScalarDenominator,
      unresolvedClassificationRows: section[family].coverage.unresolvedClassificationRows,
      unmatchedSolverRows: section[family].coverage.unmatchedSolverRows,
      unmatchedReferenceRowUids: section[family].coverage.unmatchedReferenceRowUids,
      unmatchedSolverRowUids: section[family].coverage.unmatchedSolverRowUids,
    },
  ])),
]));
console.log(JSON.stringify({ custodyDiagnostics }, null, 2));

assert.equal(comparison.comparisonScope, 'FULL_RETAINED_STATION_ROWS');
assert.equal(comparison.coverage.sourceLevelScalarDenominator, 3240);
assert.equal(comparison.coverage.fullStationScalarDenominator, 5598);
assert.equal(comparison.coverage.matchedScalarDenominator, 5598);
assert.equal(comparison.coverage.unresolvedClassificationRows, 0);
assert.equal(comparison.coverage.unmatchedSolverRows, 0);
assert.equal(comparison.coverage.coverageStatus, 'COMPLETE');
assert.equal(comparison.completeComparisonClaim, true);
assert.equal(comparison.totals.untraced, 0);
assert.equal(comparison.totals.passed, 4364);
assert.equal(comparison.totals.failed, 1234);

console.log(JSON.stringify({
  status: 'PASS',
  mechanics: {
    bends: report.counts.bends,
    bendElements: report.flexibilityOwnership.bendElements,
    junctions: report.counts.b31jJunctions,
    plusYCandidates: report.counts.plusYCandidates,
    plusZCandidates: report.counts.plusZCandidates,
    unilateralCandidates: report.counts.unilateralCandidates,
    unilateralStatus: report.nonlinearRestraints.status,
  },
  conditioning: report.conditioning,
  stationCustody: report.stationCustody,
  comparison: {
    comparisons: comparison.totals.comparisons,
    passed: comparison.totals.passed,
    failed: comparison.totals.failed,
    untraced: comparison.totals.untraced,
    passRate: comparison.totals.comparisons === 0
      ? 0
      : comparison.totals.passed / comparison.totals.comparisons,
    coverage: comparison.coverage,
  },
}, null, 2));