import { FORMULA_IDS } from './constants.js';
import { cleanNumber } from './numeric.js';
import { stressInvariants } from './recovery.js';

/**
 * Identifies the extra invariant this module adds on top of `stressInvariants`.
 * Kept local to this file rather than added to `constants.js` `FORMULA_IDS`,
 * per LAFEA S-4's file list: this package creates two files and edits
 * `index.js` for exports only.
 */
export const STRESS_INTENSITY_FORMULA_ID = 'LAFEA4.PLANE_STRESS_TRESCA_STRESS_INTENSITY_SIGMA3_ZERO/v1';

/**
 * Both stress invariants LAFEA S-4 requires, for one in-plane stress state at a
 * shell surface: von Mises and the Tresca stress intensity `sigma1 - sigma3`.
 *
 * The principal stresses and von Mises come from `stressInvariants` in
 * `./recovery.js`, unchanged — this function does not recompute them. It adds
 * the stress intensity `max(|s1-s2|, |s1-s3|, |s2-s3|)` with the third
 * principal stress s3 = 0. That is the shell kernel's own declared surface
 * assumption (`NO_REISSNER_MINDLIN_TRANSVERSE_SHEAR`; there is no through
 * -thickness normal stress at a shell surface in this formulation), not a new
 * approximation introduced here.
 *
 * Different codes use different measures, and computing only one forces a
 * downstream reimplementation of the other — the failure mode this module
 * exists to close (LAFEA S-4 non-negotiable, "both invariants").
 *
 * Identity, useful as a caller-side sanity check: von Mises <= stress
 * intensity always holds when s3 = 0.
 *
 * @param {number} sigmaX In-plane normal stress, model units.
 * @param {number} sigmaY In-plane normal stress, model units.
 * @param {number} tauXY In-plane shear stress, model units.
 * @returns {Readonly<{principalMaximum:number, principalMinimum:number,
 *                     maximumInPlaneShear:number, vonMises:number,
 *                     stressIntensity:number, formulaIds:readonly string[]}>}
 */
export function surfaceStressEquivalents(sigmaX, sigmaY, tauXY) {
  const invariants = stressInvariants(sigmaX, sigmaY, tauXY);
  const stressIntensity = cleanNumber(Math.max(
    Math.abs(invariants.principalMaximum - invariants.principalMinimum),
    Math.abs(invariants.principalMaximum),
    Math.abs(invariants.principalMinimum),
  ));
  return Object.freeze({
    ...invariants,
    stressIntensity,
    formulaIds: Object.freeze([FORMULA_IDS.INVARIANTS, STRESS_INTENSITY_FORMULA_ID]),
  });
}
