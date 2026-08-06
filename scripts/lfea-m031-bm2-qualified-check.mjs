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
assert.equal(
  report.localForceReportingAuthority.junctionAdjacentStraightProfile,
  'M032_BM2_JUNCTION_ADJACENT_REPORTING_PLANE_V1',
);
assert.equal(report.nonlinearRestraints.status, 'QUALIFIED_COMPLEMENTARITY_ACTIVE_SET_V1');
assert.equal(report.restraintClassification.type15.canonicalType, '+Z');
assert.equal(report.restraintClassification.type15.expectedDof, 'UZ');
assert.equal(report.restraintClassification.type15.resolvedDof, 'UZ');
assert.equal(report.counts.plusZCandidates, 1);
assert.equal(report.restraintClassification.globalVerticalAxis, 'Y');
assert.equal(report.restraintClassification.sourceLocationCount, 5);
assert.equal(report.restraintClassification.validOccurrenceCount, 6);
assert.equal(report.restraintClassification.node40IndependentOccurrenceCount, 2);
assert.deepEqual(
  report.restraintClassification.occurrences.map((row) => ({
    nodeId: row.nodeId,
    occurrence: row.occurrence,
    sourceTypeCode: row.sourceTypeCode,
    correctedTypeCode: row.correctedTypeCode,
    canonicalType: row.canonicalType,
    dof: row.dof,
    axis: row.axis,
  })),
  [
    { nodeId: '10', occurrence: 1, sourceTypeCode: '0', correctedTypeCode: '0', canonicalType: 'ANC', dof: 'UX,UY,UZ,RX,RY,RZ', axis: null },
    { nodeId: '40', occurrence: 1, sourceTypeCode: '17', correctedTypeCode: '14', canonicalType: '+Y', dof: 'UY', axis: 'Y' },
    { nodeId: '40', occurrence: 2, sourceTypeCode: '7', correctedTypeCode: '9', canonicalType: 'GUI', dof: 'UX', axis: 'X' },
    { nodeId: '130', occurrence: 1, sourceTypeCode: '18', correctedTypeCode: '15', canonicalType: '+Z', dof: 'UZ', axis: 'Z' },
    { nodeId: '190', occurrence: 1, sourceTypeCode: '0', correctedTypeCode: '0', canonicalType: 'ANC', dof: 'UX,UY,UZ,RX,RY,RZ', axis: null },
    { nodeId: '240', occurrence: 1, sourceTypeCode: '0', correctedTypeCode: '0', canonicalType: 'ANC', dof: 'UX,UY,UZ,RX,RY,RZ', axis: null },
  ],
);
const sustainedContactByKey = new Map(report.nonlinearRestraints.sustained.ledger.map((row) => [row.key, row]));
const operatingContactByKey = new Map(report.nonlinearRestraints.operating.ledger.map((row) => [row.key, row]));
assert.equal(sustainedContactByKey.get('40:UY').state, 'ACTIVE');
assert.equal(sustainedContactByKey.get('40:UY').gap, 0);
assert.ok(sustainedContactByKey.get('40:UY').reaction > 0);
assert.equal(operatingContactByKey.get('40:UY').state, 'INACTIVE');
assert.ok(operatingContactByKey.get('40:UY').gap > 0);
assert.equal(operatingContactByKey.get('40:UY').reaction, 0);
assert.equal(sustainedContactByKey.get('130:UZ').state, 'INACTIVE');
assert.ok(sustainedContactByKey.get('130:UZ').gap > 0);
assert.equal(sustainedContactByKey.get('130:UZ').reaction, 0);
assert.equal(operatingContactByKey.get('130:UZ').state, 'ACTIVE');
assert.equal(operatingContactByKey.get('130:UZ').gap, 0);
assert.ok(operatingContactByKey.get('130:UZ').reaction > 0);
const bend170 = solved.bendAuthorities.find((row) => row.sourceSegmentId === 'IX-S17');
assert.ok(bend170);
assert.equal(bend170.doubleCountGuard.declaredFactorApplicationBasis, 'DEVELOPED_ARC_ELEMENT_BENDING_RIGIDITY_V1');
assert.equal(bend170.doubleCountGuard.totalFlexibilityReferenceBasis, 'DIRECT_TANGENT_CHORD_COMPLIANCE_V1');
assert.equal(bend170.doubleCountGuard.totalFlexibilityIdentity, 'TOTAL_EQUALS_GEOMETRIC_RATIO_TIMES_APPLIED_CORRECTION_V1');
assert.ok(bend170.doubleCountGuard.totalRatioIdentityResidual <= bend170.doubleCountGuard.tolerance);
assert.notEqual(bend170.doubleCountGuard.totalFlexibilityRatio, bend170.doubleCountGuard.appliedCorrectionRatio);
const collapsed170 = report.elements.find((row) => row.fromNode === '170' && row.toNode === '180');
assert.ok(collapsed170);
assert.equal(collapsed170.sourceType, 'TANGENT_CONSUMED_REPORT_TRANSFER');
assert.equal(collapsed170.operating.custody.authority, 'ZERO_PHYSICAL_LENGTH_REPORT_ACTION_ALIAS_V1');
assert.equal(collapsed170.operating.custody.rule, 'LOAD_FREE_COLLAPSED_SPAN_EQUAL_OPPOSITE_GLOBAL_ACTIONS_V1');
for (const component of ['fx', 'fy', 'fz', 'mx', 'my', 'mz']) {
  assert.equal(collapsed170.operating.global.I[component], -collapsed170.operating.global.J[component]);
  assert.equal(collapsed170.sustained.global.I[component], -collapsed170.sustained.global.J[component]);
}
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
const outputRestraintAuthority = [...new Map(
  comparison.cases.OPE.restraint.rows.map((row) => [
    row.rowIdentity.sourceComponentUid,
    {
      nodeId: row.rowIdentity.stationNode,
      restraintType: row.rowIdentity.restraintType,
      ownedDofs: row.rowIdentity.ownedDofs,
    },
  ]),
).values()];
assert.deepEqual(outputRestraintAuthority, [
  { nodeId: '10', restraintType: 'Rigid ANC', ownedDofs: ['UX', 'UY', 'UZ', 'RX', 'RY', 'RZ'] },
  { nodeId: '40', restraintType: 'Rigid +Y', ownedDofs: ['UY'] },
  { nodeId: '40', restraintType: 'Rigid GUI', ownedDofs: ['UX'] },
  { nodeId: '130', restraintType: 'Rigid +Z', ownedDofs: ['UZ'] },
  { nodeId: '190', restraintType: 'Rigid ANC', ownedDofs: ['UX', 'UY', 'UZ', 'RX', 'RY', 'RZ'] },
  { nodeId: '240', restraintType: 'Rigid ANC', ownedDofs: ['UX', 'UY', 'UZ', 'RX', 'RY', 'RZ'] },
]);
const collapsedRows = Object.values(comparison.cases).flatMap((section) => [
  ...section.globalForce.rows.filter((row) => row.identifier === '170-180'),
  ...section.localForce.rows.filter((row) => row.identifier === '170-180'),
]);
assert.equal(collapsedRows.length, 72);
assert.equal(collapsedRows.filter((row) => row.passed).length, 64);
assert.ok(collapsedRows.every((row) => Math.abs(row.percentDifference ?? 0) < 60));
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
assert.ok(comparison.totals.passed > 4404);
assert.ok(comparison.totals.failed < 1194);

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
