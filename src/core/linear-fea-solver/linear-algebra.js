/**
 * Dense direct linear algebra for the DENSE_DIRECT_CHOLESKY_LDLT_V1 backend
 * (see `solver-contract.js` module doc for why this is named honestly rather
 * than as a production sparse solver). Every routine here operates on flat
 * row-major arrays sized for the benchmark/single-system scale this release
 * targets; nothing allocates a sparse structure beyond the COO triplets
 * already built in `assembly.js`.
 */

export function subMatrix(K, n, indices) {
  const m = indices.length;
  const result = new Array(m * m).fill(0);
  for (let row = 0; row < m; row += 1) {
    for (let column = 0; column < m; column += 1) {
      result[row * m + column] = K[indices[row] * n + indices[column]];
    }
  }
  return result;
}

export function subRectangular(K, n, rowIndices, colIndices) {
  const rows = rowIndices.length;
  const cols = colIndices.length;
  const result = new Array(rows * cols).fill(0);
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < cols; column += 1) {
      result[row * cols + column] = K[rowIndices[row] * n + colIndices[column]];
    }
  }
  return result;
}

export function subVector(vector, indices) {
  return indices.map((index) => vector[index]);
}

export function matVec(K, n, vector) {
  const result = new Array(n).fill(0);
  for (let row = 0; row < n; row += 1) {
    let sum = 0;
    for (let column = 0; column < n; column += 1) sum += K[row * n + column] * vector[column];
    result[row] = sum;
  }
  return result;
}

export function rectMatVec(matrix, rows, cols, vector) {
  const result = new Array(rows).fill(0);
  for (let row = 0; row < rows; row += 1) {
    let sum = 0;
    for (let column = 0; column < cols; column += 1) sum += matrix[row * cols + column] * vector[column];
    result[row] = sum;
  }
  return result;
}

export function dot(a, b) {
  let sum = 0;
  for (let index = 0; index < a.length; index += 1) sum += a[index] * b[index];
  return sum;
}

export function norm2(a) {
  return Math.sqrt(dot(a, a));
}

/**
 * Classical Cholesky (`A = L L^T`) for a symmetric matrix believed
 * positive-definite. Aborts the moment a diagonal pivot is not strictly
 * positive rather than continuing with a poisoned factor, and reports which
 * row failed so the caller can fall back to LDLT and diagnose it.
 *
 * @param {Array<number>} A Flat row-major m*m symmetric matrix.
 * @param {number} m Order.
 * @returns {{success:boolean, L:Array<number>|null, failedIndex:number|null}}
 */
export function choleskyDecompose(A, m) {
  const L = new Array(m * m).fill(0);
  for (let row = 0; row < m; row += 1) {
    for (let column = 0; column <= row; column += 1) {
      let sum = A[row * m + column];
      for (let k = 0; k < column; k += 1) sum -= L[row * m + k] * L[column * m + k];
      if (row === column) {
        if (!(sum > 0)) return { success: false, L: null, failedIndex: row };
        L[row * m + column] = Math.sqrt(sum);
      } else {
        L[row * m + column] = sum / L[column * m + column];
      }
    }
  }
  return { success: true, L, failedIndex: null };
}

export function solveCholesky(L, m, rhs) {
  const y = new Array(m).fill(0);
  for (let row = 0; row < m; row += 1) {
    let sum = rhs[row];
    for (let k = 0; k < row; k += 1) sum -= L[row * m + k] * y[k];
    y[row] = sum / L[row * m + row];
  }
  const x = new Array(m).fill(0);
  for (let row = m - 1; row >= 0; row -= 1) {
    let sum = y[row];
    for (let k = row + 1; k < m; k += 1) sum -= L[k * m + row] * x[k];
    x[row] = sum / L[row * m + row];
  }
  return x;
}

/**
 * LDLT (no pivoting) for a symmetric matrix that may be indefinite or
 * singular (section 8 "LDLT/pivot diagnostics for mechanisms or indefinite
 * states"). `L` is unit lower triangular; `D` carries the diagonal pivots
 * directly, so a mechanism or rank deficiency shows up as a near-zero or
 * negative entry of `D` at the failing DOF, reported by index rather than
 * silently accepted.
 *
 * @param {Array<number>} A Flat row-major m*m symmetric matrix.
 * @param {number} m Order.
 * @param {number} nearZeroPivotTolerance Absolute tolerance below which a pivot is reported as near-zero.
 * @returns {{L:Array<number>, D:Array<number>, minAbsPivot:number, maxAbsPivot:number, firstBadPivotIndex:number|null, negativePivotCount:number}}
 */
export function ldltDecompose(A, m, nearZeroPivotTolerance) {
  const L = new Array(m * m).fill(0);
  const D = new Array(m).fill(0);
  for (let index = 0; index < m; index += 1) L[index * m + index] = 1;

  let minAbsPivot = Infinity;
  let maxAbsPivot = 0;
  let firstBadPivotIndex = null;
  let negativePivotCount = 0;

  for (let row = 0; row < m; row += 1) {
    let diagonal = A[row * m + row];
    for (let k = 0; k < row; k += 1) diagonal -= L[row * m + k] * L[row * m + k] * D[k];
    D[row] = diagonal;
    minAbsPivot = Math.min(minAbsPivot, Math.abs(diagonal));
    maxAbsPivot = Math.max(maxAbsPivot, Math.abs(diagonal));
    if (Math.abs(diagonal) <= nearZeroPivotTolerance && firstBadPivotIndex === null) firstBadPivotIndex = row;
    if (diagonal < 0) negativePivotCount += 1;

    for (let column = row + 1; column < m; column += 1) {
      let value = A[column * m + row];
      for (let k = 0; k < row; k += 1) value -= L[column * m + k] * L[row * m + k] * D[k];
      L[column * m + row] = Math.abs(diagonal) > 0 ? value / diagonal : 0;
    }
  }
  return { L, D, minAbsPivot, maxAbsPivot, firstBadPivotIndex, negativePivotCount };
}

export function solveLdlt(L, D, m, rhs) {
  const y = new Array(m).fill(0);
  for (let row = 0; row < m; row += 1) {
    let sum = rhs[row];
    for (let k = 0; k < row; k += 1) sum -= L[row * m + k] * y[k];
    y[row] = sum;
  }
  const z = y.map((value, index) => value / D[index]);
  const x = new Array(m).fill(0);
  for (let row = m - 1; row >= 0; row -= 1) {
    let sum = z[row];
    for (let k = row + 1; k < m; k += 1) sum -= L[k * m + row] * x[k];
    x[row] = sum;
  }
  return x;
}
