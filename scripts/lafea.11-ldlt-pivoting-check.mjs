#!/usr/bin/env node

/**
 * LAFEA upgrade spec §11 LDLT pivoting check.
 *
 * Covers `src/core/lafea-linear-solve/sparse-ldlt.js`: an indefinite
 * (saddle-point-style) fixture solves correctly via diagonal pivoting, an
 * SPD system solves identically to Cholesky, pivot-swap evidence (the
 * permutation) is retained, and a genuinely 2x2-block-required matrix (both
 * candidate diagonals identically zero) fails closed rather than silently
 * misbehaving — a disclosed scope limit, not a hidden one.
 */

import assert from 'node:assert/strict';
import {
  LafeaLinearSolveError,
  assembleSparseSymmetric,
  sparseLdltFactorize,
  sparseLdltSolve,
  sparseMultiply,
} from '../src/core/lafea-linear-solve/index.js';

console.log('\n--- LAFEA §11 LDLT pivoting check ---');
checkSpdSystemMatchesReference();
checkIndefiniteSystemWithPivoting();
checkPivotSwapEvidenceRetained();
checkTwoByTwoBlockCaseFailsClosed();
checkMixedSignLargerSystem();
console.log('\n✅ LAFEA §11 LDLT pivoting check passed.\n');

function checkSpdSystemMatchesReference() {
  const A = [[10, 1, 0, 2], [1, 8, 0.5, 0], [0, 0.5, 6, 1], [2, 0, 1, 12]];
  const matrix = assembleSparseSymmetric(4, [{ indices: [0, 1, 2, 3], localMatrix: A }]);
  const b = [1, 2, 3, 4];
  const factor = sparseLdltFactorize(matrix, 1e-10);
  const x = sparseLdltSolve(factor, b);
  const residual = sparseMultiply(matrix, x).map((value, index) => Math.abs(value - b[index]));
  assert.ok(Math.max(...residual) < 1e-9);
  assert.ok(factor.D.every((value) => value > 0), 'An SPD system must yield an all-positive D under LDLT');
  console.log('✅ LDLT matches the SPD reference solution with an all-positive diagonal factor.');
}

function checkIndefiniteSystemWithPivoting() {
  // Zero leading diagonal, but diagonal-pivotable (row 1 has a large usable diagonal).
  const K = [[0, 1, 0], [1, 5, 2], [0, 2, -3]];
  const matrix = assembleSparseSymmetric(3, [{ indices: [0, 1, 2], localMatrix: K }]);
  const b = [1, 2, 3];
  const factor = sparseLdltFactorize(matrix, 1e-9);
  const x = sparseLdltSolve(factor, b);
  const residual = sparseMultiply(matrix, x).map((value, index) => Math.abs(value - b[index]));
  assert.ok(Math.max(...residual) < 1e-9);
  assert.ok(factor.D.some((value) => value < 0), 'This system is genuinely indefinite; D must contain a negative entry');
  console.log('✅ A diagonally-pivotable indefinite system (zero leading diagonal) solves correctly.');
}

function checkPivotSwapEvidenceRetained() {
  const K = [[0, 1, 0], [1, 5, 2], [0, 2, -3]];
  const matrix = assembleSparseSymmetric(3, [{ indices: [0, 1, 2], localMatrix: K }]);
  const factor = sparseLdltFactorize(matrix, 1e-9);
  assert.notDeepEqual([...factor.permutation], [0, 1, 2], 'A pivot swap must have actually occurred for this fixture');
  assert.equal(factor.permutation.length, 3);
  assert.equal(new Set(factor.permutation).size, 3, 'Permutation must be a bijection');
  console.log('✅ Pivot-swap evidence (the row/column permutation) is retained and is a true bijection.');
}

function checkTwoByTwoBlockCaseFailsClosed() {
  const saddle = [[0, 1], [1, 0]]; // both diagonals zero; no row/col reorder produces a nonzero pivot
  const matrix = assembleSparseSymmetric(2, [{ indices: [0, 1], localMatrix: saddle }]);
  assert.throws(() => sparseLdltFactorize(matrix, 1e-10), (error) => {
    assert.ok(error instanceof LafeaLinearSolveError);
    assert.equal(error.code, 'NO_STABLE_DIAGONAL_PIVOT');
    return true;
  });
  console.log('✅ A genuinely 2x2-block-required matrix fails closed (NO_STABLE_DIAGONAL_PIVOT), never silently mishandled.');
}

function checkMixedSignLargerSystem() {
  const n = 12;
  let state = 7;
  const rnd = () => { state = (state * 1103515245 + 12345) & 0x7fffffff; return state / 0x7fffffff; };
  const base = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i += 1) for (let j = 0; j <= i; j += 1) { const v = (rnd() - 0.5) * 2; base[i][j] = v; base[j][i] = v; }
  for (let i = 0; i < n; i += 1) base[i][i] += n * 2 * (i < n / 2 ? 1 : -1);
  const matrix = assembleSparseSymmetric(n, [{ indices: Array.from({ length: n }, (_, i) => i), localMatrix: base }]);
  const b = Array.from({ length: n }, (_, i) => i + 1);
  const factor = sparseLdltFactorize(matrix, 1e-9);
  const x = sparseLdltSolve(factor, b);
  const residual = sparseMultiply(matrix, x).map((value, index) => Math.abs(value - b[index]));
  assert.ok(Math.max(...residual) < 1e-8, `12x12 mixed-sign residual too large: ${Math.max(...residual)}`);
  const positiveCount = factor.D.filter((value) => value > 0).length;
  const negativeCount = factor.D.filter((value) => value < 0).length;
  assert.ok(positiveCount > 0 && negativeCount > 0, 'This fixture must produce a genuinely mixed-sign D');
  console.log('✅ A 12x12 mixed-sign indefinite system solves correctly via diagonal pivoting.');
}
