import { LafeaLinearSolveError } from './errors.js';

/**
 * Profile-controlled diagonal (Jacobi) scaling (spec §11: "Profile-
 * controlled diagonal or energy scaling; retained scale factors."). Scaling
 * conditions the system for factorization but never changes the physical
 * answer: `A x = b` and `(S A S) (S^-1 x) = S b` have the same solution `x`
 * once un-scaled — the retained factors make that reversal explicit and
 * auditable rather than baked in silently.
 */
export function diagonalScaleFactors(matrix) {
  const { size, rows } = matrix;
  const factors = new Array(size).fill(1);
  for (let i = 0; i < size; i += 1) {
    const diagonal = rows[i].get(i) ?? 0;
    if (!(diagonal > 0)) {
      throw new LafeaLinearSolveError(`Diagonal scaling requires a positive diagonal at DOF ${i}, got ${diagonal}`, 'NON_POSITIVE_DIAGONAL');
    }
    factors[i] = 1 / Math.sqrt(diagonal);
  }
  return Object.freeze(factors);
}

/** `S A S` — scale both the matrix (rows and columns) by the caller's declared factors. */
export function applyDiagonalScalingToMatrix(matrix, factors) {
  const { size, rows } = matrix;
  const scaledRows = rows.map((row, rowIndex) => {
    const scaled = new Map();
    for (const [column, value] of row) scaled.set(column, value * factors[rowIndex] * factors[column]);
    return Object.freeze(scaled);
  });
  return Object.freeze({ size, rows: Object.freeze(scaledRows) });
}

/** `S b` — scale a right-hand-side vector. */
export function applyDiagonalScalingToVector(vector, factors) {
  return Object.freeze(vector.map((value, index) => value * factors[index]));
}

/** `S^-1 x` — undo scaling on a solved vector to recover the physical answer. */
export function undoDiagonalScaling(scaledSolution, factors) {
  return Object.freeze(scaledSolution.map((value, index) => value * factors[index]));
}
