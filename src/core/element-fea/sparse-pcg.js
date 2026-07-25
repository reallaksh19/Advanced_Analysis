import { csrDiagonal, csrMultiply } from './sparse-csr.js';

export const SPARSE_BACKEND_ID = 'SPARSE_PCG_V1';
export const JACOBI_PRECONDITIONER_ID = 'JACOBI_PRECONDITIONER_V1';
export const SUCCESS_TERMINATION = 'RESIDUAL_TARGET_SATISFIED';

export function solveSparsePcg(matrix, rightHandSide, profile) {
  const options = pcgOptions(profile, rightHandSide);
  const inputError = validateInputs(matrix, rightHandSide, options);
  if (inputError) return failure(inputError, options, [], 0, 0, null, null);
  if (rightHandSide.length === 0) return success([], options, [historyRow(0, 0)], 0, 0, 0, 0);
  const diagonal = csrDiagonal(matrix);
  const diagonalError = validateDiagonal(diagonal);
  if (diagonalError) return failure(diagonalError, options, [], 0, 0, null, null);
  return iteratePcg(matrix, Float64Array.from(rightHandSide), diagonal, options);
}

function iteratePcg(matrix, b, diagonal, options) {
  let solution = new Float64Array(b.length); let residual = Float64Array.from(b);
  let preconditioned = applyJacobi(residual, diagonal); let direction = Float64Array.from(preconditioned);
  let residualPreconditioned = dot(residual, preconditioned); let matrixVectorProductCount = 0;
  const initialResidualL2 = norm2(residual); const history = [historyRow(0, initialResidualL2)];
  if (initialResidualL2 <= options.targetResidual) return finalizeSuccess(matrix, b, solution, options, history, matrixVectorProductCount, initialResidualL2);
  if (!(residualPreconditioned > 0) || !Number.isFinite(residualPreconditioned)) return failure('NON_POSITIVE_R_DOT_Z', options, history, matrixVectorProductCount, 0, initialResidualL2, initialResidualL2);
  for (let iteration = 1; iteration <= options.maximumIterations; iteration += 1) {
    const step = pcgStep(matrix, residual, preconditioned, direction, residualPreconditioned);
    matrixVectorProductCount += 1;
    if (!step.ok) return failure(step.reason, options, history, matrixVectorProductCount, iteration - 1, initialResidualL2, norm2(residual));
    solution = addScaled(solution, direction, step.alpha); residual = subtractScaled(residual, step.matrixDirection, step.alpha);
    const recursiveResidualL2 = norm2(residual); history.push(historyRow(iteration, recursiveResidualL2));
    if (recursiveResidualL2 <= options.targetResidual) return finalizeSuccess(matrix, b, solution, options, history, matrixVectorProductCount, initialResidualL2, recursiveResidualL2);
    preconditioned = applyJacobi(residual, diagonal); const nextProduct = dot(residual, preconditioned);
    if (!(nextProduct > 0) || !Number.isFinite(nextProduct)) return failure('NON_POSITIVE_R_DOT_Z', options, history, matrixVectorProductCount, iteration, initialResidualL2, recursiveResidualL2);
    const beta = nextProduct / residualPreconditioned;
    if (!Number.isFinite(beta) || beta < 0) return failure('INVALID_BETA', options, history, matrixVectorProductCount, iteration, initialResidualL2, recursiveResidualL2);
    direction = combineDirection(preconditioned, direction, beta); residualPreconditioned = nextProduct;
  }
  return finalFailure(matrix, b, solution, options, history, matrixVectorProductCount, initialResidualL2);
}

function pcgStep(matrix, residual, preconditioned, direction, residualPreconditioned) {
  const matrixDirection = csrMultiply(matrix, direction); const denominator = dot(direction, matrixDirection);
  if (!(denominator > 0) || !Number.isFinite(denominator)) return { ok: false, reason: 'NON_POSITIVE_P_DOT_A_P' };
  const alpha = residualPreconditioned / denominator;
  if (!Number.isFinite(alpha) || !(alpha > 0)) return { ok: false, reason: 'INVALID_ALPHA' };
  if (!finiteVector(matrixDirection) || !finiteVector(residual) || !finiteVector(preconditioned) || !finiteVector(direction)) return { ok: false, reason: 'NON_FINITE_ITERATION_STATE' };
  return { ok: true, alpha, matrixDirection };
}

function finalizeSuccess(matrix, b, solution, options, history, productCount, initialResidualL2, recursiveResidualL2 = initialResidualL2) {
  const trueResidual = subtract(b, csrMultiply(matrix, solution)); const finalTrueResidualL2 = norm2(trueResidual); const finalTrueResidualInfinity = normInfinity(trueResidual);
  productCount += 1;
  if (!Number.isFinite(finalTrueResidualL2) || finalTrueResidualL2 > options.targetResidual) return failure('FINAL_TRUE_RESIDUAL_ABOVE_TARGET', options, history, productCount, history.length - 1, initialResidualL2, recursiveResidualL2, finalTrueResidualL2, finalTrueResidualInfinity);
  return success(Array.from(solution), options, history, productCount, history.length - 1, initialResidualL2, recursiveResidualL2, finalTrueResidualL2, finalTrueResidualInfinity);
}

function finalFailure(matrix, b, solution, options, history, productCount, initialResidualL2) {
  const trueResidual = subtract(b, csrMultiply(matrix, solution)); productCount += 1;
  return failure('MAXIMUM_ITERATIONS_EXHAUSTED', options, history, productCount, options.maximumIterations, initialResidualL2, history.at(-1).residualL2, norm2(trueResidual), normInfinity(trueResidual));
}

function success(solution, options, history, products, iterations, initial, recursive, trueL2 = recursive, trueInfinity = 0) {
  return Object.freeze({ ok: true, solution, backendIdentity: SPARSE_BACKEND_ID, storageIdentity: 'CSR_FULL_V1', preconditionerIdentity: JACOBI_PRECONDITIONER_ID, ...options, initialResidualL2: initial, finalRecursiveResidualL2: recursive, finalTrueResidualL2: trueL2, finalTrueResidualInfinity: trueInfinity, iterationCount: iterations, matrixVectorProductCount: products, residualNormHistory: Object.freeze(history), terminationStatus: SUCCESS_TERMINATION, breakdownReason: null });
}

function failure(reason, options, history, products, iterations, initial, recursive, trueL2 = null, trueInfinity = null) {
  return Object.freeze({ ok: false, classification: classify(reason), backendIdentity: SPARSE_BACKEND_ID, storageIdentity: 'CSR_FULL_V1', preconditionerIdentity: JACOBI_PRECONDITIONER_ID, ...options, initialResidualL2: initial, finalRecursiveResidualL2: recursive, finalTrueResidualL2: trueL2, finalTrueResidualInfinity: trueInfinity, iterationCount: iterations, matrixVectorProductCount: products, residualNormHistory: Object.freeze(history), terminationStatus: 'FAILED', breakdownReason: reason });
}

function pcgOptions(profile, rightHandSide) {
  const absoluteResidualTolerance = profile.absoluteResidualTolerance;
  const relativeResidualTolerance = profile.relativeResidualTolerance;
  const maximumIterations = profile.maximumIterations;
  const targetResidual = Math.max(absoluteResidualTolerance, relativeResidualTolerance * norm2(rightHandSide));
  return { absoluteResidualTolerance, relativeResidualTolerance, maximumIterations, targetResidual };
}
function validateInputs(matrix, b, options) { if (!matrix || matrix.rowCount !== matrix.columnCount || matrix.rowCount !== b.length) return 'INVALID_SYSTEM_DIMENSIONS'; if (!finiteVector(b)) return 'NON_FINITE_RIGHT_HAND_SIDE'; if (![options.absoluteResidualTolerance, options.relativeResidualTolerance, options.targetResidual].every((v) => Number.isFinite(v) && v > 0) || !Number.isInteger(options.maximumIterations) || options.maximumIterations <= 0) return 'INVALID_PCG_PROFILE'; return null; }
function validateDiagonal(diagonal) { for (let index = 0; index < diagonal.length; index += 1) if (!Number.isFinite(diagonal[index]) || !(diagonal[index] > 0)) return `NON_POSITIVE_DIAGONAL_AT_${index}`; return null; }
function applyJacobi(residual, diagonal) { const output = new Float64Array(residual.length); for (let index = 0; index < residual.length; index += 1) output[index] = residual[index] / diagonal[index]; return output; }
function addScaled(left, right, factor) { const output = new Float64Array(left.length); for (let index = 0; index < left.length; index += 1) output[index] = left[index] + factor * right[index]; return output; }
function subtractScaled(left, right, factor) { const output = new Float64Array(left.length); for (let index = 0; index < left.length; index += 1) output[index] = left[index] - factor * right[index]; return output; }
function combineDirection(preconditioned, direction, beta) { const output = new Float64Array(direction.length); for (let index = 0; index < direction.length; index += 1) output[index] = preconditioned[index] + beta * direction[index]; return output; }
function subtract(left, right) { const output = new Float64Array(left.length); for (let index = 0; index < left.length; index += 1) output[index] = left[index] - right[index]; return output; }
function dot(left, right) { let value = 0; for (let index = 0; index < left.length; index += 1) value += left[index] * right[index]; return value; }
function norm2(vector) { return Math.sqrt(Math.max(0, dot(vector, vector))); }
function normInfinity(vector) { let maximum = 0; for (const value of vector) maximum = Math.max(maximum, Math.abs(value)); return maximum; }
function finiteVector(vector) { for (const value of vector) if (!Number.isFinite(value)) return false; return true; }
function historyRow(iteration, residualL2) { return Object.freeze({ iteration, residualL2 }); }
function classify(reason) { return reason.startsWith('NON_POSITIVE_DIAGONAL') || reason === 'NON_POSITIVE_P_DOT_A_P' || reason === 'NON_POSITIVE_R_DOT_Z' ? 'BREAKDOWN' : reason === 'MAXIMUM_ITERATIONS_EXHAUSTED' || reason === 'FINAL_TRUE_RESIDUAL_ABOVE_TARGET' ? 'NONCONVERGED' : 'BACKEND_FAILURE'; }
