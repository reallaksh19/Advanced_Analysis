import { LafeaLinearSolveError } from './errors.js';

/**
 * Qualified sparse Cholesky for SPD systems (spec §11: "Qualified sparse
 * Cholesky for positive-definite systems"). Storage is sparse (Map-based
 * rows, `sparse-matrix.js`); the elimination order is the caller's declared
 * DOF order — this pass does **not** perform fill-reducing (AMD/nested-
 * dissection) reordering, a disclosed scoping limit appropriate to the
 * local/patch-scale models this package targets, not a hidden one. Fill-in
 * is discovered and stored correctly regardless (every `L[i][j]` for
 * `j<=i` is computed, whether or not `A[i][j]` was originally nonzero).
 *
 * Fails closed on any pivot at or below the caller-declared tolerance —
 * never silently substitutes, skips, or regularizes a bad pivot.
 */
export function sparseCholeskyFactorize(matrix, pivotTolerance) {
  const { size, rows } = matrix;
  const factorRows = Array.from({ length: size }, () => new Map());
  const pivots = [];
  for (let i = 0; i < size; i += 1) {
    const li = factorRows[i];
    for (let j = 0; j <= i; j += 1) {
      let value = rows[i].get(j) ?? 0;
      const lj = factorRows[j];
      for (const [k, likValue] of li) {
        if (k >= j) continue;
        const ljk = lj.get(k);
        if (ljk !== undefined) value -= likValue * ljk;
      }
      if (i === j) {
        if (!(value > pivotTolerance)) {
          throw new LafeaLinearSolveError(
            `Cholesky pivot ${value} at row ${i} does not exceed tolerance ${pivotTolerance}`,
            'NON_POSITIVE_PIVOT',
            { row: i, value, pivotTolerance },
          );
        }
        li.set(i, Math.sqrt(value));
        pivots.push(value);
      } else if (value !== 0) {
        li.set(j, value / lj.get(j));
      }
    }
  }
  return Object.freeze({ size, L: Object.freeze(factorRows.map((row) => Object.freeze(row))), pivots: Object.freeze(pivots) });
}

/** Solve `L y = b` then `L^T x = y` for a factorized sparse Cholesky. */
export function sparseCholeskySolve(factor, rightHandSide) {
  const { size, L } = factor;
  const y = new Array(size).fill(0);
  for (let i = 0; i < size; i += 1) {
    let value = rightHandSide[i];
    for (const [k, lik] of L[i]) { if (k < i) value -= lik * y[k]; }
    y[i] = value / L[i].get(i);
  }
  const x = new Array(size).fill(0);
  for (let i = size - 1; i >= 0; i -= 1) {
    let value = y[i];
    for (let row = i + 1; row < size; row += 1) {
      const lri = L[row].get(i);
      if (lri !== undefined) value -= lri * x[row];
    }
    x[i] = value / L[i].get(i);
  }
  return x;
}
