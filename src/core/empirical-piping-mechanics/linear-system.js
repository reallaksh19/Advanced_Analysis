import { deepFreeze, requireFiniteNumber } from './contracts.js';
import { EMPIRICAL_FAILURE_CODES, empiricalFailure } from './failure-codes.js';

const MACHINE_EPSILON = Number.EPSILON;

function infinityNormMatrix(matrix) {
  return Math.max(...matrix.map(row => row.reduce((sum, value) => sum + Math.abs(value), 0)));
}

function infinityNormVector(vector) {
  return vector.length === 0 ? 0 : Math.max(...vector.map(Math.abs));
}

export function solveScaledDenseSystem(matrix, rhs, options = {}) {
  if (!Array.isArray(matrix) || matrix.length === 0 || matrix.some(row => row.length !== matrix.length)) {
    throw new TypeError('matrix must be a non-empty square array.');
  }
  if (!Array.isArray(rhs) || rhs.length !== matrix.length) {
    throw new TypeError('rhs length must match matrix order.');
  }
  const n = matrix.length;
  const pivotMultiplier = requireFiniteNumber(options.pivotMultiplier ?? 100, 'pivotMultiplier');
  const minimumReciprocalCondition = requireFiniteNumber(
    options.minimumReciprocalCondition ?? 1e-12,
    'minimumReciprocalCondition',
  );
  const scales = Array(n).fill(0);
  for (let i = 0; i < n; i += 1) {
    const diagonal = Math.abs(matrix[i][i]);
    const rowMax = Math.max(...matrix[i].map(Math.abs));
    const basis = diagonal > 0 ? diagonal : rowMax;
    if (!(basis > 0) || !Number.isFinite(basis)) {
      throw empiricalFailure(
        EMPIRICAL_FAILURE_CODES.MATRIX_SINGULAR,
        `No positive scaling basis exists for row ${i}.`,
      );
    }
    scales[i] = 1 / Math.sqrt(basis);
  }

  const a = Array.from({ length: n }, (_, i) => (
    Array.from({ length: n }, (_, j) => scales[i] * matrix[i][j] * scales[j])
  ));
  const b = rhs.map((value, i) => scales[i] * requireFiniteNumber(value, `rhs[${i}]`));
  const scaledNorm = infinityNormMatrix(a);
  const pivotTolerance = pivotMultiplier * MACHINE_EPSILON * Math.max(1, scaledNorm);
  const pivots = [];

  for (let column = 0; column < n; column += 1) {
    let pivotRow = column;
    let pivotMagnitude = Math.abs(a[column][column]);
    for (let row = column + 1; row < n; row += 1) {
      const candidate = Math.abs(a[row][column]);
      if (candidate > pivotMagnitude) {
        pivotMagnitude = candidate;
        pivotRow = row;
      }
    }
    if (!(pivotMagnitude > pivotTolerance)) {
      throw empiricalFailure(
        EMPIRICAL_FAILURE_CODES.MATRIX_SINGULAR,
        `Scaled pivot ${column} is below tolerance.`,
        { pivotMagnitude, pivotTolerance, scaledNorm },
      );
    }
    if (pivotRow !== column) {
      [a[column], a[pivotRow]] = [a[pivotRow], a[column]];
      [b[column], b[pivotRow]] = [b[pivotRow], b[column]];
    }
    const pivot = a[column][column];
    pivots.push(Math.abs(pivot));
    for (let row = column + 1; row < n; row += 1) {
      const factor = a[row][column] / pivot;
      a[row][column] = 0;
      for (let j = column + 1; j < n; j += 1) a[row][j] -= factor * a[column][j];
      b[row] -= factor * b[column];
    }
  }

  const y = Array(n).fill(0);
  for (let row = n - 1; row >= 0; row -= 1) {
    let remainder = b[row];
    for (let column = row + 1; column < n; column += 1) remainder -= a[row][column] * y[column];
    y[row] = remainder / a[row][row];
  }
  const solution = y.map((value, i) => scales[i] * value);
  const residual = matrix.map((row, i) => (
    row.reduce((sum, value, j) => sum + (value * solution[j]), 0) - rhs[i]
  ));
  const denominator = (infinityNormMatrix(matrix) * infinityNormVector(solution))
    + infinityNormVector(rhs);
  const scaledResidual = infinityNormVector(residual) / Math.max(1, denominator);
  const maxPivot = Math.max(...pivots);
  const minPivot = Math.min(...pivots);
  const reciprocalConditionEstimate = minPivot / maxPivot;
  if (reciprocalConditionEstimate < minimumReciprocalCondition) {
    throw empiricalFailure(
      EMPIRICAL_FAILURE_CODES.SYSTEM_ILL_CONDITIONED,
      'Scaled system failed the reciprocal-condition acceptance rule.',
      { reciprocalConditionEstimate, minimumReciprocalCondition, pivots },
    );
  }
  return deepFreeze({
    solution,
    residual,
    scaledResidual,
    scales,
    pivots,
    pivotTolerance,
    reciprocalConditionEstimate,
  });
}
