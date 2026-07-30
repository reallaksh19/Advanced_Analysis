import { LafeaLinearSolveError } from './errors.js';

/**
 * LDLT with diagonal pivoting for indefinite/diagnostic cases (spec §11:
 * "LDLT with pivoting for diagnostics/indefinite cases"). `A = L D L^T`,
 * `L` unit-lower-triangular, `D` diagonal (positive and negative entries
 * both allowed — that is exactly what makes this the indefinite-capable
 * counterpart to `sparse-cholesky.js`).
 *
 * Pivoting strategy, disclosed: at each elimination step, every remaining
 * row's true Schur-complement-updated diagonal (`dense[r][r] - sum_{k<step}
 * L[r][k]^2 * D[k]`, not the raw un-eliminated value) is compared, and the
 * largest-magnitude one is selected next (symmetric row/column permutation,
 * recorded in the returned evidence). This handles common sign-indefinite
 * FE cases (e.g. Lagrange-multiplier saddle-point systems) without
 * requiring a zero-diagonal row to be eliminated first. It does **not**
 * implement 2x2 block (Bunch-Kaufman) pivoting for matrices whose
 * indefiniteness cannot be resolved by row/column reordering alone — that
 * is explicit follow-up scope, not a hidden gap; such a case fails closed
 * with `NO_STABLE_DIAGONAL_PIVOT` rather than silently proceeding through a
 * near-zero pivot.
 */
export function sparseLdltFactorize(matrix, pivotTolerance) {
  const { size } = matrix;
  const dense = toDenseLowerFillable(matrix);
  const permutation = Array.from({ length: size }, (_, i) => i);
  const L = Array.from({ length: size }, () => new Map());
  const D = new Array(size).fill(0);

  for (let step = 0; step < size; step += 1) {
    const pivotRow = selectPivotRow(dense, L, D, step, size);
    if (pivotRow !== step) swapRowsAndColumns(dense, L, permutation, step, pivotRow, size);

    const diagonal = updatedDiagonal(dense, L, D, step, step);
    if (Math.abs(diagonal) <= pivotTolerance) {
      throw new LafeaLinearSolveError(
        `LDLT pivot magnitude ${Math.abs(diagonal)} at elimination step ${step} does not exceed tolerance ${pivotTolerance}`,
        'NO_STABLE_DIAGONAL_PIVOT',
        { step, diagonal, pivotTolerance, permutation: [...permutation] },
      );
    }
    D[step] = diagonal;
    L[step].set(step, 1);

    for (let row = step + 1; row < size; row += 1) {
      let value = dense[row][step];
      for (let k = 0; k < step; k += 1) {
        const lrk = L[row].get(k) ?? 0;
        const lsk = L[step].get(k) ?? 0;
        value -= lrk * D[k] * lsk;
      }
      if (value !== 0) L[row].set(step, value / diagonal);
    }
  }
  return Object.freeze({
    size,
    permutation: Object.freeze([...permutation]),
    L: Object.freeze(L.map((row) => Object.freeze(row))),
    D: Object.freeze([...D]),
  });
}

export function sparseLdltSolve(factor, rightHandSide) {
  const { size, permutation, L, D } = factor;
  const permuted = permutation.map((originalIndex) => rightHandSide[originalIndex]);
  const y = new Array(size).fill(0);
  for (let i = 0; i < size; i += 1) {
    let value = permuted[i];
    for (const [k, lik] of L[i]) { if (k < i) value -= lik * y[k]; }
    y[i] = value;
  }
  const z = y.map((value, index) => value / D[index]);
  const x = new Array(size).fill(0);
  for (let i = size - 1; i >= 0; i -= 1) {
    let value = z[i];
    for (let row = i + 1; row < size; row += 1) {
      const lri = L[row].get(i);
      if (lri !== undefined) value -= lri * x[row];
    }
    x[i] = value;
  }
  const solution = new Array(size).fill(0);
  permutation.forEach((originalIndex, permutedIndex) => { solution[originalIndex] = x[permutedIndex]; });
  return solution;
}

function toDenseLowerFillable(matrix) {
  const { size, rows } = matrix;
  const dense = Array.from({ length: size }, () => new Array(size).fill(0));
  for (let row = 0; row < size; row += 1) {
    for (const [column, value] of rows[row]) {
      dense[row][column] = value;
      dense[column][row] = value;
    }
  }
  return dense;
}

/** `dense[row][col] - sum_{k<step} L[row][k] * D[k] * L[col][k]` — the true Schur-complement-updated entry. */
function updatedDiagonal(dense, L, D, step, row) {
  let value = dense[row][row];
  for (let k = 0; k < step; k += 1) {
    const lrk = L[row].get(k) ?? 0;
    value -= lrk * lrk * D[k];
  }
  return value;
}

function selectPivotRow(dense, L, D, step, size) {
  let best = step;
  let bestMagnitude = Math.abs(updatedDiagonal(dense, L, D, step, step));
  for (let row = step + 1; row < size; row += 1) {
    const magnitude = Math.abs(updatedDiagonal(dense, L, D, step, row));
    if (magnitude > bestMagnitude) { best = row; bestMagnitude = magnitude; }
  }
  return best;
}

function swapRowsAndColumns(dense, L, permutation, a, b, size) {
  [dense[a], dense[b]] = [dense[b], dense[a]];
  for (let row = 0; row < size; row += 1) { const tmp = dense[row][a]; dense[row][a] = dense[row][b]; dense[row][b] = tmp; }
  [L[a], L[b]] = [L[b], L[a]]; // rows of L computed so far (columns < a,b, both already finalized and identical either way) travel with their row
  [permutation[a], permutation[b]] = [permutation[b], permutation[a]];
}
