import { SharedAnalysisContractError } from '../shared-analysis-contract/errors.js';
import { cleanNumber, positiveNumber } from '../shared-analysis-contract/numeric.js';

export const SECTION_FORMULA_IDS = Object.freeze([
  'CIRCULAR_HOLLOW_AREA_PI_OVER_4_D2_MINUS_d2',
  'CIRCULAR_HOLLOW_INERTIA_PI_OVER_64_D4_MINUS_d4',
  'CIRCULAR_HOLLOW_POLAR_INERTIA_TWICE_INERTIA',
  'CIRCULAR_HOLLOW_SECTION_MODULUS_I_OVER_C',
  'PIPE_MEAN_RADIUS_D_MINUS_T_OVER_2',
]);

/**
 * Circular hollow section properties, from outside diameter and wall thickness
 * only. No approximations, and no thin-wall shortcuts.
 *
 * This is the single sanctioned source of these quantities for the beam (LFEA
 * B-2) and shell (LAFEA S-1) kernels. `meanRadius` is returned here rather than
 * recomputed downstream because it is the radius the shell attenuation length
 * is built on — the two kernels must agree on it exactly.
 *
 * @param {number} outsideDiameter Outside diameter, model length units.
 * @param {number} wallThickness Wall thickness, model length units.
 * @returns {Readonly<{area:number, inertia:number, polarInertia:number,
 *                     sectionModulus:number, meanRadius:number,
 *                     insideDiameter:number, formulaIds:readonly string[]}>}
 */
export function pipeSectionProperties(outsideDiameter, wallThickness) {
  const outside = positiveNumber(outsideDiameter, 'outsideDiameter');
  const thickness = positiveNumber(wallThickness, 'wallThickness');
  if (!(thickness < outside / 2)) {
    throw new SharedAnalysisContractError(
      'wallThickness must be less than half the outsideDiameter',
      'DEGENERATE_SECTION',
    );
  }
  const insideDiameter = cleanNumber(outside - 2 * thickness);
  const area = cleanNumber((Math.PI / 4) * (outside ** 2 - insideDiameter ** 2));
  const inertia = cleanNumber((Math.PI / 64) * (outside ** 4 - insideDiameter ** 4));
  return Object.freeze({
    insideDiameter,
    area,
    inertia,
    // Exact for a circular annulus, thin or thick.
    polarInertia: cleanNumber(2 * inertia),
    sectionModulus: cleanNumber(inertia / (outside / 2)),
    meanRadius: cleanNumber((outside - thickness) / 2),
    formulaIds: SECTION_FORMULA_IDS,
  });
}
