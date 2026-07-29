import { cleanNumber, positiveNumber } from '../shared-analysis-contract/numeric.js';
import { declaredLimitCheck, requireDeclaredValue } from '../shared-analysis-contract/declared-value.js';

export const LENGTH_SCALE_FORMULA_IDS = Object.freeze({
  ATTENUATION_LENGTH: 'SHELL_ATTENUATION_LENGTH_SQRT_R_T',
  MODEL_EXTENT: 'SHELL_MODEL_EXTENT_MULTIPLE_OF_ATTENUATION_LENGTH',
  DECAY_ZONE_ELEMENT_SIZE: 'SHELL_DECAY_ZONE_ELEMENT_SIZE_FRACTION_OF_ATTENUATION_LENGTH',
  DIAMETER_TO_THICKNESS: 'PIPE_DIAMETER_TO_THICKNESS_RATIO',
  ATTACHMENT_TO_RUN: 'ATTACHMENT_TO_RUN_DIAMETER_RATIO',
});

/**
 * Attenuation length of a cylindrical shell, `lambda = sqrt(R * t)`.
 *
 * A local disturbance in a cylindrical shell decays over this length. It is the
 * one length scale that decides whether a local model is trustworthy: it sets
 * how far the patch boundary must be from the attachment, and how small an
 * element has to be to resolve the bending boundary layer.
 *
 * The multipliers that turn it into an extent and an element size are NOT here.
 * They are engineering practice, they belong in the profile, and
 * `requiredModelExtent` and `decayZoneElementSize` read them from there.
 *
 * @param {number} meanRadius Mid-surface radius, from `pipeSectionProperties`.
 * @param {number} wallThickness Wall thickness, same units.
 * @returns {Readonly<{value:number, meanRadius:number, wallThickness:number, formulaId:string}>}
 */
export function attenuationLength(meanRadius, wallThickness) {
  const radius = positiveNumber(meanRadius, 'meanRadius');
  const thickness = positiveNumber(wallThickness, 'wallThickness');
  return Object.freeze({
    value: cleanNumber(Math.sqrt(radius * thickness)),
    meanRadius: radius,
    wallThickness: thickness,
    formulaId: LENGTH_SCALE_FORMULA_IDS.ATTENUATION_LENGTH,
  });
}

/**
 * Patch extent required from the attachment edge, as a declared multiple of the
 * attenuation length. Closer than this and the boundary condition contaminates
 * the peak stress.
 *
 * @param {Readonly<object>} lambda Output of `attenuationLength`.
 * @param {object} profile Profile carrying `modelExtentAttenuationMultiple`.
 * @returns {Readonly<object>} Required extent with the multiple and its source.
 */
export function requiredModelExtent(lambda, profile) {
  const multiple = requireDeclaredValue(profile, 'modelExtentAttenuationMultiple', { exclusiveMinimum: 0 });
  return Object.freeze({
    value: cleanNumber(multiple.value * lambda.value),
    attenuationLength: lambda.value,
    multiple: multiple.value,
    multipleSource: multiple.source,
    formulaId: LENGTH_SCALE_FORMULA_IDS.MODEL_EXTENT,
  });
}

/**
 * Target element edge length inside the decay zone, as a declared fraction of
 * the attenuation length. Longer than this and the bending boundary layer is
 * unresolved, which under-predicts the peak.
 *
 * @param {Readonly<object>} lambda Output of `attenuationLength`.
 * @param {object} profile Profile carrying `decayZoneElementFraction`.
 * @returns {Readonly<object>} Target element size with the fraction and its source.
 */
export function decayZoneElementSize(lambda, profile) {
  const fraction = requireDeclaredValue(profile, 'decayZoneElementFraction', { exclusiveMinimum: 0, maximum: 1 });
  return Object.freeze({
    value: cleanNumber(fraction.value * lambda.value),
    attenuationLength: lambda.value,
    fraction: fraction.value,
    fractionSource: fraction.source,
    formulaId: LENGTH_SCALE_FORMULA_IDS.DECAY_ZONE_ELEMENT_SIZE,
  });
}

/**
 * Thin-shell validity ratio `D/t`, checked against a declared minimum. Below
 * it, the DKT bending formulation — which carries no transverse shear — is out
 * of range.
 *
 * @param {number} outsideDiameter Run-pipe outside diameter.
 * @param {number} wallThickness Run-pipe wall thickness.
 * @param {object} profile Profile carrying `thinShellDiameterToThicknessMinimum`.
 * @returns {Readonly<object>} Check record carrying value, limit and limit source.
 */
export function diameterToThicknessCheck(outsideDiameter, wallThickness, profile) {
  const ratio = cleanNumber(positiveNumber(outsideDiameter, 'outsideDiameter') / positiveNumber(wallThickness, 'wallThickness'));
  const limit = requireDeclaredValue(profile, 'thinShellDiameterToThicknessMinimum', { exclusiveMinimum: 0 });
  return Object.freeze({
    ...declaredLimitCheck('THIN_SHELL_DIAMETER_TO_THICKNESS', ratio, limit, 'AT_LEAST'),
    formulaId: LENGTH_SCALE_FORMULA_IDS.DIAMETER_TO_THICKNESS,
  });
}

/**
 * Attachment-to-run diameter ratio `d/D`, checked against a declared maximum.
 * Above it the disturbance is no longer local and the patch idealisation fails.
 *
 * @param {number} attachmentDiameter Attachment outside diameter.
 * @param {number} runDiameter Run-pipe outside diameter.
 * @param {object} profile Profile carrying `attachmentToRunDiameterMaximum`.
 * @returns {Readonly<object>} Check record carrying value, limit and limit source.
 */
export function attachmentToRunRatioCheck(attachmentDiameter, runDiameter, profile) {
  const ratio = cleanNumber(positiveNumber(attachmentDiameter, 'attachmentDiameter') / positiveNumber(runDiameter, 'runDiameter'));
  const limit = requireDeclaredValue(profile, 'attachmentToRunDiameterMaximum', { exclusiveMinimum: 0 });
  return Object.freeze({
    ...declaredLimitCheck('ATTACHMENT_TO_RUN_DIAMETER', ratio, limit, 'AT_MOST'),
    formulaId: LENGTH_SCALE_FORMULA_IDS.ATTACHMENT_TO_RUN,
  });
}
