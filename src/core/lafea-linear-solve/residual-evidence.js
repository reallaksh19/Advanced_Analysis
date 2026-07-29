import { sparseMultiply } from './sparse-matrix.js';

/**
 * Absolute and normalized residual, free-DOF equilibrium, constrained
 * reactions, and global force/moment balance (spec §11 + §11.1 tolerance
 * table). Every quantity here is measured from the assembled matrix and
 * solved displacement — never re-derived from a smoothed or display value.
 */

/** `K u - F` at every DOF, plus its normalized (relative) magnitude. */
export function computeResidualEvidence(matrix, displacement, forceVector, freeIndices) {
  const residual = sparseMultiply(matrix, displacement).map((value, index) => value - forceVector[index]);
  const forceScale = Math.max(1e-12, ...forceVector.map((value) => Math.abs(value)));
  const freeResidualMaximum = freeIndices.length > 0 ? Math.max(...freeIndices.map((index) => Math.abs(residual[index]))) : 0;
  const normalizedResidual = freeResidualMaximum / forceScale;
  return Object.freeze({
    residualVector: Object.freeze([...residual]),
    absoluteFreeResidualMaximum: freeResidualMaximum,
    forceScale,
    normalizedResidual,
  });
}

/**
 * Spec §11.1: normalized residual default <=1e-9 (warn 1e-9..1e-7, block
 * >1e-7).
 */
export function qualifyNormalizedResidual(normalizedResidual, { acceptAt = 1e-9, blockAt = 1e-7 } = {}) {
  const status = normalizedResidual <= acceptAt ? 'OK' : normalizedResidual <= blockAt ? 'WARNING' : 'BLOCK';
  return Object.freeze({ metric: 'NORMALIZED_RESIDUAL', value: normalizedResidual, acceptAt, blockAt, status });
}

/**
 * Global force (and, given a moment-arm map, moment) equilibrium: applied
 * force/moment plus reaction must balance to within `max(relativeLimit *
 * appliedResultant, absoluteFloor)` (spec §11.1).
 */
export function qualifyGlobalEquilibrium(appliedResultant, reactionResultant, { relativeLimit, absoluteFloor }) {
  const imbalance = Math.abs(appliedResultant + reactionResultant);
  const limit = Math.max(relativeLimit * Math.abs(appliedResultant), absoluteFloor);
  return Object.freeze({ metric: 'GLOBAL_EQUILIBRIUM', imbalance, limit, accepted: imbalance <= limit });
}

/** Reaction at each constrained DOF: `(K u)[i] - F_applied[i]`, named by DOF identity. */
export function computeReactions(matrix, displacement, appliedForceVector, prescribedIndices, dofIdentities) {
  const kU = sparseMultiply(matrix, displacement);
  return Object.freeze(prescribedIndices.map((index) => Object.freeze({
    dofIdentity: dofIdentities[index],
    reaction: kU[index] - appliedForceVector[index],
    prescribedDisplacement: displacement[index],
  })));
}
