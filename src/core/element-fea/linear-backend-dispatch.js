import { LINEAR_BACKENDS } from './constants.js';
import { solveDenseLdlt } from './linear-backend.js';
import { profileLinearBackend } from './profile.js';
import { solveSparsePcg } from './sparse-pcg.js';

export function solveLinearSystem(partition, profile) {
  const backend = profileLinearBackend(profile);
  if (!partition.freeEquations.length) return zeroFreeDofResult(backend, profile);
  if (backend === LINEAR_BACKENDS.DENSE_REFERENCE) return solveDenseLdlt(partition.Kff, partition.effectiveFreeLoad, profile.tolerances);
  if (backend === LINEAR_BACKENDS.SPARSE_PCG_V1) return solveSparsePcg(partition.Kff, partition.effectiveFreeLoad, profile);
  return Object.freeze({ ok: false, classification: 'UNSUPPORTED_BACKEND', backendIdentity: backend, breakdownReason: 'UNSUPPORTED_BACKEND' });
}

function zeroFreeDofResult(backend, profile) {
  if (backend === LINEAR_BACKENDS.DENSE_REFERENCE) return Object.freeze({ ok: true, solution: [], pivotRatio: 1, pivots: [], minimumPivot: null, maximumPivot: null, backendIdentity: 'dense-ldlt-reference/v1' });
  if (backend === LINEAR_BACKENDS.SPARSE_PCG_V1) return Object.freeze({ ok: true, solution: [], backendIdentity: backend, storageIdentity: 'CSR_FULL_V1', preconditionerIdentity: profile.preconditioner, absoluteResidualTolerance: profile.absoluteResidualTolerance, relativeResidualTolerance: profile.relativeResidualTolerance, maximumIterations: profile.maximumIterations, targetResidual: profile.absoluteResidualTolerance, initialResidualL2: 0, finalRecursiveResidualL2: 0, finalTrueResidualL2: 0, finalTrueResidualInfinity: 0, iterationCount: 0, matrixVectorProductCount: 0, residualNormHistory: Object.freeze([{ iteration: 0, residualL2: 0 }]), terminationStatus: 'RESIDUAL_TARGET_SATISFIED', breakdownReason: null });
  return Object.freeze({ ok: false, classification: 'UNSUPPORTED_BACKEND', backendIdentity: backend, breakdownReason: 'UNSUPPORTED_BACKEND' });
}
