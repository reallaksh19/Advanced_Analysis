import { deepFreeze } from '../shared-piping-model/index.js';
import { AUDIT_CODES, FORMULA_IDS } from './constants.js';
import { isFiniteMatrix, isFiniteVector, matrixVector, maxAbs, subtractVectors } from './numeric.js';

export function solveScaledPartialPivot(matrix, vector, policy) {
  validateDimensions(matrix, vector);
  if (!isFiniteMatrix(matrix) || !isFiniteVector(vector)) return failure(AUDIT_CODES.MATRIX_NONFINITE, matrix.length, policy);
  const size = vector.length;
  if (!size) return deepFreeze({ ok: true, solution: [], minimumPivot: null, minimumScaledPivot: null, residualNorm: 0, diagnostics: [], trace: trace(size, null, null) });
  const a = matrix.map((row) => [...row]), b = [...vector];
  const scales = a.map((row) => maxAbs(row));
  if (scales.some((value) => value === 0)) return failure(AUDIT_CODES.MATRIX_SINGULAR, size, policy);
  let minimumPivot = Infinity, minimumScaledPivot = Infinity;
  for (let column = 0; column < size; column += 1) {
    const pivotRow = selectPivot(a, scales, column);
    const pivot = Math.abs(a[pivotRow][column]);
    const scaledPivot = pivot / scales[pivotRow];
    if (pivot === 0) return failure(AUDIT_CODES.MATRIX_SINGULAR, size, policy, minimumPivot, minimumScaledPivot);
    if (nearSingular(pivot, scaledPivot, scales[pivotRow], policy)) {
      return failure(AUDIT_CODES.MATRIX_NEAR_SINGULAR, size, policy, Math.min(minimumPivot, pivot), Math.min(minimumScaledPivot, scaledPivot));
    }
    swap(a, column, pivotRow); swap(b, column, pivotRow); swap(scales, column, pivotRow);
    minimumPivot = Math.min(minimumPivot, pivot); minimumScaledPivot = Math.min(minimumScaledPivot, scaledPivot);
    eliminate(a, b, column);
  }
  const solution = backSubstitute(a, b);
  if (!isFiniteVector(solution)) return failure(AUDIT_CODES.MATRIX_NONFINITE, size, policy, minimumPivot, minimumScaledPivot);
  const residualNorm = maxAbs(subtractVectors(matrixVector(matrix, solution), vector));
  return deepFreeze({
    ok: true, solution, minimumPivot, minimumScaledPivot, residualNorm, diagnostics: [],
    trace: trace(size, minimumPivot, minimumScaledPivot, residualNorm, policy),
  });
}

function selectPivot(matrix, scales, column) {
  let selected = column, best = -1;
  for (let row = column; row < matrix.length; row += 1) {
    const ratio = Math.abs(matrix[row][column]) / scales[row];
    if (ratio > best) { best = ratio; selected = row; }
  }
  return selected;
}
function nearSingular(pivot, scaledPivot, rowScale, policy) {
  const absolute = policy?.pivotAbsoluteTolerance ?? 1e-14;
  const relative = policy?.pivotRelativeTolerance ?? 1e-12;
  return pivot <= absolute + relative * rowScale || scaledPivot <= relative;
}
function eliminate(matrix, vector, column) {
  const pivot = matrix[column][column];
  for (let row = column + 1; row < matrix.length; row += 1) {
    const factor = matrix[row][column] / pivot;
    matrix[row][column] = 0;
    for (let index = column + 1; index < matrix.length; index += 1) matrix[row][index] -= factor * matrix[column][index];
    vector[row] -= factor * vector[column];
  }
}
function backSubstitute(matrix, vector) {
  const result = Array(vector.length).fill(0);
  for (let row = vector.length - 1; row >= 0; row -= 1) {
    let value = vector[row];
    for (let column = row + 1; column < vector.length; column += 1) value -= matrix[row][column] * result[column];
    result[row] = value / matrix[row][row];
  }
  return result;
}
function swap(values, left, right) { if (left !== right) [values[left], values[right]] = [values[right], values[left]]; }
function failure(code, size, policy, minimumPivot = null, minimumScaledPivot = null) {
  return deepFreeze({ ok: false, solution: null, minimumPivot, minimumScaledPivot, residualNorm: null, diagnostics: [{ code, severity: 'ERROR' }], trace: trace(size, minimumPivot, minimumScaledPivot, null, policy) });
}
function trace(size, minimumPivot, minimumScaledPivot, residualNorm = null, policy = null) {
  return deepFreeze({ formulaId: FORMULA_IDS.LINEAR_SOLVE, formulaVersion: '1.0.0', method: 'SCALED_PARTIAL_PIVOTING', matrixSize: size, minimumPivot, minimumScaledPivot, residualNorm, pivotPolicy: policy || null });
}
function validateDimensions(matrix, vector) {
  if (!Array.isArray(matrix) || !Array.isArray(vector) || matrix.length !== vector.length || matrix.some((row) => !Array.isArray(row) || row.length !== vector.length)) {
    throw new TypeError('Linear solve requires one square matrix and matching vector.');
  }
}
