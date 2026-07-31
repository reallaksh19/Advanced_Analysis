/**
 * Functionality: Computes the reviewed non-code sustained stress screening
 * indicator from explicit section, action, factor, pressure, and allowable data.
 */

import { deepFreeze } from '../shared-piping-model/index.js';
import { FIRST_CUT_SCHEMAS, FIRST_CUT_STATUSES } from './constants.js';
import { evaluatePressureFormula } from './pressure-formulas.js';
import {
  assertExactKeys, assertFinite, assertString, validateHashedContract, withSemanticHash,
} from './validation.js';

const INPUT_KEYS = Object.freeze([
  'loadCaseId', 'formulaId', 'section', 'actions', 'factors', 'allowable', 'pressure',
]);
const CONTRACT_KEYS = Object.freeze([
  'schema', 'loadCaseId', 'formulaId', 'section', 'actions', 'factors', 'allowable',
  'pressureContribution', 'terms', 'screeningStressPa', 'utilization', 'screeningStatus',
  'status', 'limitations',
]);

export function buildSustainedScreening(input) {
  assertExactKeys(input, INPUT_KEYS, 'Sustained-screening input');
  const section = validateSection(input.section);
  const actions = validateActions(input.actions);
  const factors = validateFactors(input.factors);
  const allowable = validateAllowable(input.allowable);
  const pressureContribution = evaluatePressureFormula(input.formulaId, input.pressure);
  assertPressureSectionMatch(section, input.pressure);
  const axialPa = (actions.axialForceN / section.areaM2) * factors.axial;
  const bendingPa = Math.hypot(
    factors.inPlane * actions.inPlaneMomentNm / section.sectionModulusM3,
    factors.outOfPlane * actions.outOfPlaneMomentNm / section.sectionModulusM3,
  );
  const torsionPa = factors.torsion * actions.torsionNm / section.polarSectionModulusM3;
  const screeningStressPa = Math.abs(pressureContribution.stressPa + axialPa)
    + Math.hypot(bendingPa, torsionPa);
  const utilization = screeningStressPa / allowable.screeningAllowablePa;
  const exceeds = utilization > 1;
  return withSemanticHash({
    schema: FIRST_CUT_SCHEMAS.SUSTAINED_SCREENING,
    loadCaseId: assertString(input.loadCaseId, 'Sustained load case'),
    formulaId: input.formulaId,
    section,
    actions,
    factors,
    allowable,
    pressureContribution,
    terms: deepFreeze({ pressurePa: pressureContribution.stressPa, axialPa, bendingPa, torsionPa }),
    screeningStressPa,
    utilization,
    screeningStatus: exceeds ? 'SCREENING EXCEEDS PROJECT LIMIT' : 'SCREENING WITHIN DECLARED METHOD',
    status: exceeds ? FIRST_CUT_STATUSES.ESCALATE : FIRST_CUT_STATUSES.QUALIFIED,
    limitations: Object.freeze([
      'NOT_B31_3_COMPLIANCE',
      'NO_THERMAL_EXPANSION_STRESS',
      'ONE_DIMENSIONAL_GRAVITY_ACTIONS_ONLY',
    ]),
  });
}

export function validateSustainedScreening(value) {
  return validateHashedContract(value, FIRST_CUT_SCHEMAS.SUSTAINED_SCREENING, CONTRACT_KEYS);
}

function validateSection(value) {
  const keys = ['outerDiameterM', 'evaluationThicknessM', 'areaM2', 'sectionModulusM3', 'polarSectionModulusM3', 'source'];
  assertExactKeys(value, keys, 'Sustained section');
  return deepFreeze(Object.fromEntries(keys.map((key) => [
    key, key === 'source'
      ? assertString(value[key], 'Section source')
      : assertFinite(value[key], `Section ${key}`, (number) => number > 0),
  ])));
}

function validateActions(value) {
  const keys = ['axialForceN', 'inPlaneMomentNm', 'outOfPlaneMomentNm', 'torsionNm', 'source'];
  assertExactKeys(value, keys, 'Sustained actions');
  return deepFreeze(Object.fromEntries(keys.map((key) => [
    key, key === 'source'
      ? assertString(value[key], 'Action source')
      : assertFinite(value[key], `Action ${key}`, () => true),
  ])));
}

function validateFactors(value) {
  const keys = ['axial', 'inPlane', 'outOfPlane', 'torsion', 'source', 'applicability'];
  assertExactKeys(value, keys, 'Sustained factors');
  return deepFreeze(Object.fromEntries(keys.map((key) => [
    key, ['source', 'applicability'].includes(key)
      ? assertString(value[key], `Factor ${key}`)
      : assertFinite(value[key], `Factor ${key}`, (number) => number >= 0),
  ])));
}

function validateAllowable(value) {
  const keys = ['screeningAllowablePa', 'material', 'temperatureC', 'source', 'revision'];
  assertExactKeys(value, keys, 'Screening allowable');
  return deepFreeze({
    screeningAllowablePa: assertFinite(value.screeningAllowablePa, 'Screening allowable', (number) => number > 0),
    material: assertString(value.material, 'Allowable material'),
    temperatureC: assertFinite(value.temperatureC, 'Allowable temperature', () => true),
    source: assertString(value.source, 'Allowable source'),
    revision: assertString(value.revision, 'Allowable revision'),
  });
}

function assertPressureSectionMatch(section, pressure) {
  if (section.outerDiameterM !== pressure.outerDiameterM
    || section.evaluationThicknessM !== pressure.evaluationThicknessM) {
    throw new TypeError('Pressure formula dimensions must match sustained section dimensions.');
  }
}
