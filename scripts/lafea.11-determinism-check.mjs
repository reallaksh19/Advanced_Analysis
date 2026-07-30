#!/usr/bin/env node

/**
 * LAFEA upgrade spec §11 solver determinism check.
 *
 * Covers `src/core/lafea-linear-solve/`: assembling and solving the same
 * system twice (in-process and across two independent Node process
 * invocations) produces byte-identical results — no `Math.random()`
 * anywhere in the sparse assembly, factorization, or evidence pipeline.
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  assembleSparseSymmetric,
  sparseCholeskyFactorize,
  sparseCholeskySolve,
  sparseLdltFactorize,
  sparseLdltSolve,
} from '../src/core/lafea-linear-solve/index.js';

console.log('\n--- LAFEA §11 solver determinism check ---');
checkInProcessRepeatability();
checkCrossProcessRepeatability();
console.log('\n✅ LAFEA §11 solver determinism check passed.\n');

function fixtureMatrix() {
  const A = [[10, 1, 0, 2], [1, 8, 0.5, 0], [0, 0.5, 6, 1], [2, 0, 1, 12]];
  return assembleSparseSymmetric(4, [{ indices: [0, 1, 2, 3], localMatrix: A }]);
}

function checkInProcessRepeatability() {
  const b = [1, 2, 3, 4];
  const cholA = sparseCholeskySolve(sparseCholeskyFactorize(fixtureMatrix(), 1e-10), b);
  const cholB = sparseCholeskySolve(sparseCholeskyFactorize(fixtureMatrix(), 1e-10), b);
  assert.deepEqual(cholA, cholB);

  const ldltA = sparseLdltSolve(sparseLdltFactorize(fixtureMatrix(), 1e-10), b);
  const ldltB = sparseLdltSolve(sparseLdltFactorize(fixtureMatrix(), 1e-10), b);
  assert.deepEqual(ldltA, ldltB);
  console.log('✅ Repeated in-process assembly and solve is byte-identical for both Cholesky and LDLT.');
}

function checkCrossProcessRepeatability() {
  const scriptPath = fileURLToPath(new URL('./lafea-solver-determinism-worker.mjs', import.meta.url));
  const outputA = execFileSync('node', [scriptPath], { cwd: path.dirname(scriptPath), encoding: 'utf8' });
  const outputB = execFileSync('node', [scriptPath], { cwd: path.dirname(scriptPath), encoding: 'utf8' });
  assert.equal(outputA, outputB);
  assert.ok(outputA.length > 0);
  console.log('✅ Two independent Node process invocations produce byte-identical solver output.');
}
