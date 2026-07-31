import assert from 'node:assert/strict';
import {
  PRESSURE_FORMULA_IDS,
  buildSustainedScreening,
  evaluatePressureFormula,
  validateSustainedScreening,
} from '../src/core/first-cut-load-estimation/index.js';

const pressure = {
  pressurePa: 2e6,
  outerDiameterM: 0.1143,
  evaluationThicknessM: 0.00602,
  pressureSource: '[SIMULATED] project pressure basis',
  thicknessSource: '[SIMULATED] evaluation thickness basis',
  applicabilitySource: 'User-authorized Priority 1 screening formula',
};
const contribution = evaluatePressureFormula(PRESSURE_FORMULA_IDS.USER_AUTHORIZED_LONGITUDINAL, pressure);
assert.equal(contribution.stressPa, pressure.pressurePa * (pressure.outerDiameterM - 2 * pressure.evaluationThicknessM) / (4 * pressure.evaluationThicknessM));
assert.throws(() => evaluatePressureFormula(PRESSURE_FORMULA_IDS.USER_AUTHORIZED_LONGITUDINAL, {
  ...pressure, evaluationThicknessM: pressure.outerDiameterM / 2,
}), /requires outerDiameterM/u);

const screening = buildSustainedScreening({
  loadCaseId: 'OPE',
  formulaId: PRESSURE_FORMULA_IDS.USER_AUTHORIZED_LONGITUDINAL,
  section: {
    outerDiameterM: pressure.outerDiameterM,
    evaluationThicknessM: pressure.evaluationThicknessM,
    areaM2: 0.002,
    sectionModulusM3: 1.2e-5,
    polarSectionModulusM3: 2.4e-5,
    source: '[SIMULATED] section basis',
  },
  actions: {
    axialForceN: 1000,
    inPlaneMomentNm: 2000,
    outOfPlaneMomentNm: 1000,
    torsionNm: 500,
    source: '[SIMULATED] first-cut actions',
  },
  factors: {
    axial: 1,
    inPlane: 1.1,
    outOfPlane: 1.2,
    torsion: 1.3,
    source: '[SIMULATED] project factors',
    applicability: 'Directional screening only',
  },
  allowable: {
    screeningAllowablePa: 200e6,
    material: '[SIMULATED] material',
    temperatureC: 100,
    source: '[SIMULATED] project allowable',
    revision: 'REV-1',
  },
  pressure,
});
assert(validateSustainedScreening(screening).ok, 'STR-01 contract');
const expectedBending = Math.hypot(1.1 * 2000 / 1.2e-5, 1.2 * 1000 / 1.2e-5);
assert.equal(screening.terms.bendingPa, expectedBending, 'STR-02 directional factors');
assert(screening.limitations.includes('NOT_B31_3_COMPLIANCE'));
assert.throws(() => buildSustainedScreening({
  ...screeningInput(), allowable: { ...screeningInput().allowable, source: '' },
}), /Allowable source/u, 'STR-B01');
console.log('✅ [SIMULATED] First-cut sustained-screening checks passed.');

function screeningInput() {
  return {
    loadCaseId: 'OPE',
    formulaId: PRESSURE_FORMULA_IDS.USER_AUTHORIZED_LONGITUDINAL,
    section: {
      outerDiameterM: pressure.outerDiameterM, evaluationThicknessM: pressure.evaluationThicknessM,
      areaM2: 0.002, sectionModulusM3: 1.2e-5, polarSectionModulusM3: 2.4e-5, source: '[SIMULATED]',
    },
    actions: { axialForceN: 0, inPlaneMomentNm: 0, outOfPlaneMomentNm: 0, torsionNm: 0, source: '[SIMULATED]' },
    factors: { axial: 1, inPlane: 1, outOfPlane: 1, torsion: 1, source: '[SIMULATED]', applicability: 'Declared' },
    allowable: { screeningAllowablePa: 1, material: '[SIMULATED]', temperatureC: 0, source: '[SIMULATED]', revision: '1' },
    pressure,
  };
}
