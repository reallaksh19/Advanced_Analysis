import { deepFreeze } from '../shared-piping-model/index.js';
import { FORMULA_IDS } from './constants.js';
import { toleranceLimit } from './numeric.js';

export function forceEquilibrium(appliedForceN, supportForceN, policy) {
  return residualProof(FORMULA_IDS.FORCE_EQUILIBRIUM, appliedForceN + supportForceN, Math.max(Math.abs(appliedForceN), Math.abs(supportForceN)), policy, { appliedForceN, supportForceN });
}
export function momentEquilibrium(appliedMomentNm, supportMomentNm, policy) {
  return residualProof(FORMULA_IDS.MOMENT_EQUILIBRIUM, appliedMomentNm + supportMomentNm, Math.max(Math.abs(appliedMomentNm), Math.abs(supportMomentNm)), policy, { appliedMomentNm, supportMomentNm, admissibleNodalCoupleNm: 0 });
}
export function matrixResidualProof(residualNorm, loadScale, policy) {
  return residualProof(FORMULA_IDS.MATRIX_RESIDUAL, residualNorm, loadScale, policy, { residualNorm });
}
export function displacementResidualProof(residualM, displacementScaleM, policy) {
  return residualProof('VERTICAL_BEAM_SUPPORT_DISPLACEMENT_CHECK_V1', residualM, displacementScaleM, policy, { supportDisplacementResidualM: residualM });
}
function residualProof(formulaId, residual, scale, policy, details) {
  const tolerance = toleranceLimit(policy, scale);
  return deepFreeze({
    formulaId, formulaVersion: '1.0.0', ...details,
    residual, absoluteResidual: Math.abs(residual),
    relativeResidual: Math.abs(residual) / Math.max(1, Math.abs(scale)),
    tolerancePolicy: policy, tolerance, pass: Math.abs(residual) <= tolerance,
  });
}
