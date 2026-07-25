import { distributionError } from './errors.js';
import { clean, maxAbs } from './vector.js';

export function tolerance(rule, scale) { return rule.absolute + rule.relative * Math.max(1, Math.abs(scale)); }
export function qualification(actual, scale, rule) {
  const allowed = tolerance(rule, scale);
  return { actual: clean(actual), scale: clean(scale), tolerance: clean(allowed), accepted: Math.abs(actual) <= allowed };
}
export function maxResidual(vector) { return maxAbs(vector); }

export function choleskySolve(matrix, rhs, rule) {
  const size = matrix.length;
  const lower = Array.from({ length: size }, () => Array(size).fill(0));
  const pivots = [];
  const matrixScale = Math.max(1, ...matrix.flat().map(Math.abs));
  const pivotTolerance = tolerance(rule, matrixScale);
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column <= row; column += 1) {
      let value = matrix[row][column];
      for (let index = 0; index < column; index += 1) value -= lower[row][index] * lower[column][index];
      if (row === column) {
        pivots.push(clean(value));
        if (!(value > pivotTolerance)) throw distributionError('RESULTANT_FIT_RANK_DEFICIENT', 'footprint', 'Footprint resultant-fit matrix is rank deficient or ill-conditioned.', { pivots, matrixScale, pivotTolerance });
        lower[row][column] = Math.sqrt(value);
      } else lower[row][column] = value / lower[column][column];
    }
  }
  const forward = Array(size).fill(0);
  for (let row = 0; row < size; row += 1) {
    let value = rhs[row];
    for (let column = 0; column < row; column += 1) value -= lower[row][column] * forward[column];
    forward[row] = value / lower[row][row];
  }
  const solution = Array(size).fill(0);
  for (let row = size - 1; row >= 0; row -= 1) {
    let value = forward[row];
    for (let column = row + 1; column < size; column += 1) value -= lower[column][row] * solution[column];
    solution[row] = clean(value / lower[row][row]);
  }
  return { solution, lower: lower.map((row) => row.map(clean)), pivots, matrixScale, pivotTolerance };
}