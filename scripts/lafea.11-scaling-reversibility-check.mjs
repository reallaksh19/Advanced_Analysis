#!/usr/bin/env node

/**
 * LAFEA upgrade spec §11 diagonal-scaling reversibility check.
 *
 * Covers `src/core/lafea-linear-solve/diagonal-scaling.js`: scaling a
 * badly-conditioned system, solving it, and undoing the scaling reproduces
 * the unscaled solution to machine precision — scaling changes conditioning
 * only, never the physical answer.
 */

import assert from 'node:assert/strict';
import {
  LafeaLinearSolveError,
  applyDiagonalScalingToMatrix,
  applyDiagonalScalingToVector,
  assembleSparseSymmetric,
  diagonalScaleFactors,
  sparseCholeskyFactorize,
  sparseCholeskySolve,
  undoDiagonalScaling,
} from '../src/core/lafea-linear-solve/index.js';

console.log('\n--- LAFEA §11 diagonal-scaling reversibility check ---');
checkScalingReproducesUnscaledSolution();
checkScaledMatrixHasUnitDiagonal();
checkNonPositiveDiagonalRejected();
console.log('\n✅ LAFEA §11 diagonal-scaling reversibility check passed.\n');

function badlyScaledMatrix() {
  const A = [
    [100000, 10, 0, 2],
    [10, 8, 0.5, 0],
    [0, 0.5, 0.05, 0.001],
    [2, 0, 0.001, 12],
  ];
  return assembleSparseSymmetric(4, [{ indices: [0, 1, 2, 3], localMatrix: A }]);
}

function checkScalingReproducesUnscaledSolution() {
  const matrix = badlyScaledMatrix();
  const b = [1, 2, 3, 4];

  const unscaledX = sparseCholeskySolve(sparseCholeskyFactorize(matrix, 1e-16), b);

  const factors = diagonalScaleFactors(matrix);
  const scaledMatrix = applyDiagonalScalingToMatrix(matrix, factors);
  const scaledB = applyDiagonalScalingToVector(b, factors);
  const scaledX = sparseCholeskySolve(sparseCholeskyFactorize(scaledMatrix, 1e-16), scaledB);
  const recoveredX = undoDiagonalScaling(scaledX, factors);

  const maxRelativeDiff = Math.max(...unscaledX.map((value, index) => Math.abs(value - recoveredX[index]) / Math.max(1, Math.abs(value))));
  assert.ok(maxRelativeDiff < 1e-10, `Scaling must not change the physical solution: max relative diff ${maxRelativeDiff}`);
  console.log('✅ Scale -> solve -> unscale reproduces the unscaled solution to machine precision.');
}

function checkScaledMatrixHasUnitDiagonal() {
  const matrix = badlyScaledMatrix();
  const factors = diagonalScaleFactors(matrix);
  const scaledMatrix = applyDiagonalScalingToMatrix(matrix, factors);
  for (let i = 0; i < scaledMatrix.size; i += 1) {
    assert.ok(Math.abs(scaledMatrix.rows[i].get(i) - 1) < 1e-9, `Diagonal at ${i} should be 1 after scaling`);
  }
  console.log('✅ Diagonal (Jacobi) scaling normalizes every diagonal entry to exactly 1.');
}

function checkNonPositiveDiagonalRejected() {
  const matrix = assembleSparseSymmetric(2, [{ indices: [0, 1], localMatrix: [[0, 1], [1, 4]] }]);
  assert.throws(() => diagonalScaleFactors(matrix), (error) => {
    assert.ok(error instanceof LafeaLinearSolveError);
    assert.equal(error.code, 'NON_POSITIVE_DIAGONAL');
    return true;
  });
  console.log('✅ A non-positive diagonal entry is rejected rather than producing a scaling factor via NaN/Infinity.');
}
