import { FORMULATIONS } from './constants.js';

export function constitutiveMatrix(material, formulation) {
  if (formulation === FORMULATIONS.PLANE_STRESS) return planeStressMatrix(material.E, material.nu);
  if (formulation === FORMULATIONS.PLANE_STRAIN) return planeStrainMatrix(material.E, material.nu);
  throw new TypeError('Unsupported LFEA formulation.');
}
export function planeStressMatrix(E, nu) {
  const factor = E / (1 - nu * nu);
  return [[factor, factor * nu, 0], [factor * nu, factor, 0], [0, 0, E / (2 * (1 + nu))]];
}
export function planeStrainMatrix(E, nu) {
  const factor = E / ((1 + nu) * (1 - 2 * nu));
  return [[factor * (1 - nu), factor * nu, 0], [factor * nu, factor * (1 - nu), 0], [0, 0, E / (2 * (1 + nu))]];
}
export function recoverSigmaZ(stress, material, formulation) {
  return formulation === FORMULATIONS.PLANE_STRAIN ? material.nu * (stress[0] + stress[1]) : 0;
}
export function principalStress(stress, sigmaZ, formulation) {
  const [sx, sy, txy] = stress;
  const mean = 0.5 * (sx + sy);
  const radius = Math.hypot(0.5 * (sx - sy), txy);
  const inPlane = [mean + radius, mean - radius];
  const angleRadians = radius === 0 ? null : 0.5 * Math.atan2(2 * txy, sx - sy);
  const values = formulation === FORMULATIONS.PLANE_STRAIN
    ? [...inPlane, sigmaZ].sort((left, right) => right - left) : inPlane;
  return { values, inPlane, angleRadians, orientationDefined: angleRadians !== null };
}
export function vonMisesStress(stress, sigmaZ) {
  const [sx, sy, txy] = stress;
  const invariant = 0.5 * ((sx - sy) ** 2 + (sy - sigmaZ) ** 2 + (sigmaZ - sx) ** 2) + 3 * txy ** 2;
  return Math.sqrt(Math.max(0, invariant));
}
