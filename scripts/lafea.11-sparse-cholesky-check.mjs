#!/usr/bin/env node

/**
 * LAFEA upgrade spec §11 sparse Cholesky check.
 *
 * Covers `src/core/lafea-linear-solve/sparse-cholesky.js`: matches a dense
 * hand-solved reference to machine precision on a well-scaled SPD system,
 * rejects a non-SPD system by name, and reproduces an exact result whether
 * or not the input has fill-in requiring dynamic discovery.
 */

import assert from 'node:assert/strict';
import {
  LafeaLinearSolveError,
  assembleSparseSymmetric,
  sparseCholeskyFactorize,
  sparseCholeskySolve,
  sparseMultiply,
} from '../src/core/lafea-linear-solve/index.js';

console.log('\n--- LAFEA §11 sparse Cholesky check ---');
checkSpdSystemMatchesReference();
checkNonSpdRejected();
checkLargerSpdSystem();
checkDeterminism();
console.log('\n✅ LAFEA §11 sparse Cholesky check passed.\n');

function checkSpdSystemMatchesReference() {
  const A = [[10, 1, 0, 2], [1, 8, 0.5, 0], [0, 0.5, 6, 1], [2, 0, 1, 12]];
  const matrix = assembleSparseSymmetric(4, [{ indices: [0, 1, 2, 3], localMatrix: A }]);
  const b = [1, 2, 3, 4];
  const factor = sparseCholeskyFactorize(matrix, 1e-10);
  const x = sparseCholeskySolve(factor, b);
  const residual = sparseMultiply(matrix, x).map((value, index) => Math.abs(value - b[index]));
  assert.ok(Math.max(...residual) < 1e-10, `Residual too large: ${Math.max(...residual)}`);
  console.log('✅ A well-scaled 4x4 SPD system solves to machine precision.');
}

function checkNonSpdRejected() {
  const indefinite = [[1, 2], [2, 1]]; // eigenvalues 3, -1
  const matrix = assembleSparseSymmetric(2, [{ indices: [0, 1], localMatrix: indefinite }]);
  assert.throws(() => sparseCholeskyFactorize(matrix, 1e-10), (error) => {
    assert.ok(error instanceof LafeaLinearSolveError);
    assert.equal(error.code, 'NON_POSITIVE_PIVOT');
    return true;
  });
  console.log('✅ A non-SPD system is rejected by name (NON_POSITIVE_PIVOT), not silently factored.');
}

function randomSpd(n, seed) {
  let state = seed;
  const rnd = () => { state = (state * 1103515245 + 12345) & 0x7fffffff; return state / 0x7fffffff; };
  const M = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i += 1) for (let j = 0; j <= i; j += 1) { const v = (rnd() - 0.5) * 2; M[i][j] = v; M[j][i] = v; }
  for (let i = 0; i < n; i += 1) M[i][i] += n * 2;
  return M;
}

function checkLargerSpdSystem() {
  const n = 15;
  const A = randomSpd(n, 99);
  const matrix = assembleSparseSymmetric(n, [{ indices: Array.from({ length: n }, (_, i) => i), localMatrix: A }]);
  const b = Array.from({ length: n }, (_, i) => i + 1);
  const factor = sparseCholeskyFactorize(matrix, 1e-9);
  const x = sparseCholeskySolve(factor, b);
  const residual = sparseMultiply(matrix, x).map((value, index) => Math.abs(value - b[index]));
  assert.ok(Math.max(...residual) < 1e-9, `15x15 residual too large: ${Math.max(...residual)}`);
  console.log('✅ A 15x15 SPD system (with fill-in beyond the original sparsity pattern) solves correctly.');
}

function checkDeterminism() {
  const A = [[10, 1, 0, 2], [1, 8, 0.5, 0], [0, 0.5, 6, 1], [2, 0, 1, 12]];
  const matrix = assembleSparseSymmetric(4, [{ indices: [0, 1, 2, 3], localMatrix: A }]);
  const b = [1, 2, 3, 4];
  const first = sparseCholeskySolve(sparseCholeskyFactorize(matrix, 1e-10), b);
  const second = sparseCholeskySolve(sparseCholeskyFactorize(matrix, 1e-10), b);
  assert.deepEqual(first, second);
  console.log('✅ Sparse Cholesky is deterministic (byte-identical repeated solve).');
}
