import assert from 'node:assert/strict';
import {
  calculateB31SustainedStress,
  resolveSectionStates,
} from '../src/core/empirical-piping-mechanics/index.js';

const sectionStates = resolveSectionStates({
  outsideDiameterM: 0.4064,
  nominalWallM: 0.009525,
  stiffnessWallM: 0.009525,
  weightWallM: 0.009525,
  corrosionAllowanceM: 0.0016002,
  codeStressWallRule: 'NOMINAL_MINUS_CORROSION',
  authority: {
    nominalWall: 'ASME-B31.3-2006-APP-S',
    stiffnessWall: 'PROJECT-MECHANICAL-NOMINAL',
    weightWall: 'PROJECT-PHYSICAL-NOMINAL',
    codeStressWall: 'ASME-B31.3-2006-DATASET',
  },
});

const result = calculateB31SustainedStress({
  stationId: 'N20',
  sectionStates,
  pressurePa: 3.795e6,
  mechanicalAxialForceN: 12.575e3,
  axialCombination: 'PRESSURE_MINUS_MECHANICAL',
  inPlaneMomentNm: 82.845e3,
  outOfPlaneMomentNm: 0,
  torsionalMomentNm: 0,
  sustainedInPlaneIndex: 1,
  sustainedOutOfPlaneIndex: 1,
  indexCitation: 'ASME B31.3-2006 Appendix S Table S302.6.3 straight-station benchmark basis',
  allowablePa: 124.5e6,
  codeDataset: {
    id: 'ASME-B31.3-2006-SUS-V1',
    edition: '2006',
    sustainedRuleCitation: 'ASME B31.3-2006 edition-bound sustained longitudinal stress dataset',
    pressureAreaCitation: 'EMP-PROD-05B-EBR-001 adopted corroded internal-diameter pressure-force basis',
    pressureAreaBasis: 'CORRODED_INTERNAL_DIAMETER',
  },
});

assertNear(sectionStates.codeStress.wallThicknessM, 0.0079248, 1e-12, 'corroded wall');
assertNear(sectionStates.codeStress.areaM2, 0.009920635211237776, 1e-12, 'stress area');
assertNear(sectionStates.codeStress.sectionModulusM3, 0.0009693935482374893, 1e-12, 'section modulus');
assertNear(result.pressureForceAreaM2, 0.11979647943772163, 1e-12, 'pressure-force area');
assertNear(result.pressureForceN, 454627.6394661536, 1e-12, 'pressure force');
assertNear(result.sustainedAxialForceN, 442052.6394661536, 1e-12, 'sustained axial force');
assertNear(result.axialStressPa, 44558904.75293463, 1e-10, 'axial stress');
assertNear(result.bendingStressPa, 85460647.17536578, 1e-10, 'bending stress');
assert.equal(result.torsionalStressPa, 0);
assertNear(result.sustainedLongitudinalStressPa, 130019551.92830041, 1e-10, 'sustained stress');
const publishedPa = 129.975e6;
const errorPercent = 100 * Math.abs(result.sustainedLongitudinalStressPa - publishedPa) / publishedPa;
assert.ok(errorPercent < 0.5, `Node 20 error ${errorPercent}% exceeds 0.5%`);
assert.equal(result.disposition, 'FAIL');
assert.ok(result.utilization > 1);

const wrongSign = calculateB31SustainedStress({
  stationId: 'N20-MUTATION',
  sectionStates,
  pressurePa: 3.795e6,
  mechanicalAxialForceN: 12.575e3,
  axialCombination: 'PRESSURE_PLUS_MECHANICAL',
  inPlaneMomentNm: 82.845e3,
  outOfPlaneMomentNm: 0,
  torsionalMomentNm: 0,
  sustainedInPlaneIndex: 1,
  sustainedOutOfPlaneIndex: 1,
  indexCitation: 'MUTATION-TEST',
  codeDataset: {
    id: 'MUTATION', edition: '2006',
    sustainedRuleCitation: 'MUTATION-TEST',
    pressureAreaCitation: 'MUTATION-TEST',
    pressureAreaBasis: 'CORRODED_INTERNAL_DIAMETER',
  },
});
assert.ok(
  Math.abs(wrongSign.sustainedLongitudinalStressPa - publishedPa) > 0.5e6,
  'pressure-sign mutation must be detected by the benchmark',
);

console.log(`✅ Table S302.6.3 Node 20 sustained-stress check passed (${(result.sustainedLongitudinalStressPa / 1e6).toFixed(6)} MPa, ${errorPercent.toFixed(5)}%).`);

function assertNear(actual, expected, relativeTolerance, label) {
  assert.ok(
    Math.abs(actual - expected) <= relativeTolerance * Math.max(1, Math.abs(expected)),
    `${label}: ${actual} != ${expected}`,
  );
}
