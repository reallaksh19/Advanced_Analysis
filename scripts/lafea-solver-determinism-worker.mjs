#!/usr/bin/env node

/**
 * Cross-process determinism worker for `lafea.11-determinism-check.mjs`.
 * Assembles and solves a fixed sparse system with both backends and prints
 * the result as JSON; the parent script runs this twice in separate `node`
 * invocations and diffs the output.
 */

import {
  assembleSparseSymmetric,
  sparseCholeskyFactorize,
  sparseCholeskySolve,
  sparseLdltFactorize,
  sparseLdltSolve,
} from '../src/core/lafea-linear-solve/index.js';

const A = [[10, 1, 0, 2], [1, 8, 0.5, 0], [0, 0.5, 6, 1], [2, 0, 1, 12]];
const matrix = assembleSparseSymmetric(4, [{ indices: [0, 1, 2, 3], localMatrix: A }]);
const b = [1, 2, 3, 4];

const cholesky = sparseCholeskySolve(sparseCholeskyFactorize(matrix, 1e-10), b);
const ldlt = sparseLdltSolve(sparseLdltFactorize(matrix, 1e-10), b);

process.stdout.write(JSON.stringify({ cholesky, ldlt }));
