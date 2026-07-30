/**
 * Transverse-shear recovery (spec §8): a NEW output category that the legacy
 * CST/DKT path cannot produce at all, because Kirchhoff thin-plate theory
 * assumes transverse shear strain is identically zero. It is therefore
 * available only for the Reissner-Mindlin (MITC) formulations, and a caller
 * asking for it on a CST/DKT result must be refused rather than handed a
 * fabricated zero — hence `requireTransverseShearCapableFormulation`.
 *
 * What is recovered, per integration point:
 *   gamma  = [gamma_xz, gamma_yz]   tied transverse shear STRAIN
 *   tau    = kappa * G * gamma      average transverse shear STRESS
 *   q      = kappa * G * t * gamma  transverse shear FORCE RESULTANT (per unit width)
 *
 * `tau` here is the shear-correction-weighted AVERAGE through the thickness,
 * not the parabolic peak. Reissner-Mindlin kinematics assume a uniform shear
 * distribution and correct the energy with `kappa`; the true parabolic
 * distribution peaks at `1.5 * tau_average` at the midsurface. That peak is
 * reported separately and explicitly as `parabolicPeakStress` rather than
 * being conflated with the average, so neither value can be mistaken for the
 * other downstream.
 */
import { MITC3_FORMULATION } from './mitc3-element.js';
import { MITC4_FORMULATION, SHEAR_CORRECTION_FACTOR } from './mitc4-element.js';
import { ShellModelError } from './errors.js';

export const TRANSVERSE_SHEAR_FORMULA_ID = 'LAFEA4.MITC_TIED_TRANSVERSE_SHEAR_RECOVERY/v1';
export const TRANSVERSE_SHEAR_LAYER = 'INTEGRATION_POINT_TRANSVERSE_SHEAR';

/**
 * Formulations whose kinematics actually carry transverse shear. Kept as an
 * explicit allow-list: a formulation added later must opt in deliberately,
 * rather than silently inheriting a capability its theory does not have.
 */
export const TRANSVERSE_SHEAR_CAPABLE_FORMULATIONS = Object.freeze([
  MITC4_FORMULATION,
  MITC3_FORMULATION,
]);

/** Parabolic-to-average peak ratio for a rectangular section (3/2). */
export const PARABOLIC_PEAK_RATIO = 1.5;

export function requireTransverseShearCapableFormulation(formulation) {
  if (!TRANSVERSE_SHEAR_CAPABLE_FORMULATIONS.includes(formulation)) {
    throw new ShellModelError(
      `Transverse shear is not recoverable from formulation ${formulation}: `
      + 'Kirchhoff (CST/DKT) kinematics assume zero transverse shear strain, so any '
      + 'value reported here would be fabricated rather than recovered.',
      'TRANSVERSE_SHEAR_NOT_AVAILABLE_FOR_FORMULATION',
    );
  }
  return formulation;
}

/**
 * Recovers transverse shear at every integration point of one element.
 *
 * @param {{formulation: string, gaussEvidence: readonly object[], thickness: number, shearModulus: number}} element
 * @param {readonly number[]} localDisplacements Element-local DOF vector ([u,v,w,betaX,betaY] per node).
 */
export function recoverElementTransverseShear(element, localDisplacements) {
  requireTransverseShearCapableFormulation(element.formulation);
  const rigidity = SHEAR_CORRECTION_FACTOR * element.shearModulus;
  return Object.freeze(element.gaussEvidence.map((gp) => {
    const gammaXZ = dot(gp.shearB[0], localDisplacements);
    const gammaYZ = dot(gp.shearB[1], localDisplacements);
    const tauXZ = rigidity * gammaXZ;
    const tauYZ = rigidity * gammaYZ;
    const magnitude = Math.hypot(tauXZ, tauYZ);
    return Object.freeze({
      pointId: gp.pointId,
      recoveryLayer: TRANSVERSE_SHEAR_LAYER,
      strain: Object.freeze({ gammaXZ, gammaYZ }),
      averageStress: Object.freeze({ tauXZ, tauYZ, magnitude }),
      // Reported separately and named for what it is; never merged into
      // `averageStress`, which is a different quantity.
      parabolicPeakStress: Object.freeze({
        tauXZ: PARABOLIC_PEAK_RATIO * tauXZ,
        tauYZ: PARABOLIC_PEAK_RATIO * tauYZ,
        magnitude: PARABOLIC_PEAK_RATIO * magnitude,
      }),
      forceResultantPerUnitWidth: Object.freeze({
        qX: tauXZ * element.thickness,
        qY: tauYZ * element.thickness,
      }),
      shearCorrectionFactor: SHEAR_CORRECTION_FACTOR,
      formulaId: TRANSVERSE_SHEAR_FORMULA_ID,
    });
  }));
}

function dot(row, vector) {
  let total = 0;
  for (let i = 0; i < row.length; i += 1) total += row[i] * vector[i];
  return total;
}
