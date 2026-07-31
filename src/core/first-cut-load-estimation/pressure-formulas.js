/**
 * Functionality: Evaluates explicitly selected project pressure-screening
 * formulas. The registry contains no code-compliance or allowable data.
 */

import { deepFreeze } from '../shared-piping-model/index.js';
import { PRESSURE_FORMULA_IDS } from './constants.js';
import { assertEnum, assertExactKeys, assertFinite, assertString } from './validation.js';

const INPUT_KEYS = Object.freeze([
  'pressurePa', 'outerDiameterM', 'evaluationThicknessM',
  'pressureSource', 'thicknessSource', 'applicabilitySource',
]);

export function evaluatePressureFormula(formulaId, inputs) {
  assertEnum(formulaId, Object.values(PRESSURE_FORMULA_IDS), 'Pressure formula ID');
  assertExactKeys(inputs, INPUT_KEYS, 'Pressure formula inputs');
  const pressurePa = assertFinite(inputs.pressurePa, 'Pressure', (value) => value >= 0);
  const outerDiameterM = assertFinite(inputs.outerDiameterM, 'Outer diameter', (value) => value > 0);
  const evaluationThicknessM = assertFinite(
    inputs.evaluationThicknessM, 'Evaluation thickness', (value) => value > 0,
  );
  if (!(outerDiameterM > 2 * evaluationThicknessM)) {
    throw new TypeError('Pressure formula requires outerDiameterM > 2 * evaluationThicknessM.');
  }
  const stressPa = pressurePa * (outerDiameterM - 2 * evaluationThicknessM)
    / (4 * evaluationThicknessM);
  return deepFreeze({
    formulaId,
    equation: 'P * (Do - 2*t) / (4*t)',
    stressPa,
    canonicalInputs: { pressurePa, outerDiameterM, evaluationThicknessM },
    evidence: {
      pressureSource: assertString(inputs.pressureSource, 'Pressure source'),
      thicknessSource: assertString(inputs.thicknessSource, 'Thickness source'),
      applicabilitySource: assertString(inputs.applicabilitySource, 'Formula applicability source'),
    },
    classification: 'PROJECT_SCREENING_FORMULA_NOT_CODE_COMPLIANCE',
  });
}
