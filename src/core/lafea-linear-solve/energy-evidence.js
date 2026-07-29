import { LafeaLinearSolveError } from './errors.js';
import { sparseMultiply } from './sparse-matrix.js';

/**
 * Internal strain energy, external work, and prescribed-displacement work,
 * with explicit sign-convention evidence (spec §11: "Internal strain
 * energy, external work and prescribed-displacement work with sign-
 * convention evidence.").
 *
 * Sign/scale convention, made explicit rather than assumed: for a linear-
 * elastic system with load and displacement both building up proportionally
 * from zero, external work is `0.5 * (F . u)`, the same half-factor as
 * internal strain energy `0.5 * u^T K u` — not the full `F . u` a
 * unit-load reading might suggest. `externalWorkFromAppliedForce` sums only
 * over free DOFs (where `forceVector` is a genuine independent applied
 * load); `prescribedDisplacementWork` sums the reaction-times-displacement
 * product at prescribed DOFs, using `(K u)` as the reaction — never the
 * caller's `forceVector` entry there, which is not physically meaningful
 * for a DOF whose displacement, not force, is the boundary condition.
 *
 * @param {readonly number[]} freeIndices Indices treated as free (not prescribed).
 */
export function computeEnergyEvidence(matrix, displacement, forceVector, prescribedIndices, freeIndices) {
  const kU = sparseMultiply(matrix, displacement);
  const internalStrainEnergy = 0.5 * dot(displacement, kU);
  const externalWorkFromAppliedForce = freeIndices.reduce((sum, index) => sum + displacement[index] * forceVector[index], 0);
  const prescribedDisplacementWork = prescribedIndices.reduce((sum, index) => sum + kU[index] * displacement[index], 0);
  const totalExternalWork = 0.5 * (externalWorkFromAppliedForce + prescribedDisplacementWork);
  const denominator = Math.max(Math.abs(internalStrainEnergy), Math.abs(totalExternalWork), 1e-15);
  const relativeImbalance = Math.abs(internalStrainEnergy - totalExternalWork) / denominator;
  return Object.freeze({
    signConvention: 'HALF_LOAD_DISPLACEMENT_PRODUCT_INTERNAL_EQUALS_EXTERNAL_PLUS_PRESCRIBED_WORK',
    internalStrainEnergy,
    externalWorkFromAppliedForce,
    prescribedDisplacementWork,
    totalExternalWork,
    relativeImbalance,
  });
}

/** Spec §11.1: energy balance default relative mismatch <=1e-7 for linear static benchmark models. */
export function qualifyEnergyBalance(energyEvidence, relativeLimit = 1e-7) {
  if (!(relativeLimit > 0)) throw new LafeaLinearSolveError('relativeLimit must be positive', 'INVALID_ENERGY_LIMIT');
  return Object.freeze({
    metric: 'ENERGY_BALANCE',
    relativeImbalance: energyEvidence.relativeImbalance,
    relativeLimit,
    accepted: energyEvidence.relativeImbalance <= relativeLimit,
  });
}

function dot(a, b) { return a.reduce((sum, value, index) => sum + value * b[index], 0); }
