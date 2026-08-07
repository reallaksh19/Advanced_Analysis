#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const CORE = path.resolve('src/core/linear-fea-unilateral-solver');
const CORE_FILES = fs.readdirSync(CORE).filter((name) => name.endsWith('.js')).sort();
const SCRIPT_FILES = [
  'scripts/lfea-unilateral-closed-form-check.mjs',
  'scripts/lfea-unilateral-determinism-check.mjs',
  'scripts/lfea-m036-bm4-runtime.mjs',
  'scripts/lfea-m036-bm4-liftoff-check.mjs',
  'scripts/lfea-unilateral-anti-drift-check.mjs',
];
const FILES = [
  ...CORE_FILES.map((name) => path.join(CORE, name)),
  ...SCRIPT_FILES.map((name) => path.resolve(name)),
];

for (const file of FILES) {
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/u).length;
  assert.ok(lines < 300, `${file} has ${lines} physical lines; M036 limit is <300`);
}

const coreSource = Object.fromEntries(
  CORE_FILES.map((name) => [name, fs.readFileSync(path.join(CORE, name), 'utf8')]),
);
const combined = Object.values(coreSource).join('\n');
for (const [code, pattern] of [
  ['SOLVER_REIMPLEMENTATION', /assembleGlobal|factorizeFree|sparseCholesky|sparseLdlt|stiffnessMatrix/u],
  ['FULL_NL_MACHINERY', /Newton[-_ ]?Raphson|tangent stiffness|load incrementation/iu],
  ['PENALTY_CONTACT', /penalty\s*(spring|contact)|contact\s*stiffness/iu],
  ['RANDOM_ORDER', /Math\.random|randomUUID|localeCompare/u],
]) assert.doesNotMatch(combined, pattern, `${code}: unilateral core`);

assert.doesNotMatch(combined, /compileMechanicalModel|compileFrameElement|compileSolverExecution/u,
  'M036 core must remain above sealed compiler/element/solver contracts');
assert.match(coreSource['iteration.js'], /buildAndSolve/u);
assert.match(coreSource['iteration.js'], /maxIterationsFactor\s*\*\s*accepted\.length/u);
assert.match(coreSource['iteration.js'], /UnilateralConvergenceError/u);
assert.match(coreSource['support-status.js'], /signedReaction\s*<\s*-policy\.forceTolerance/u);
assert.match(coreSource['support-status.js'], /signedClearance\s*<\s*-policy\.penetrationTolerance/u);
assert.match(coreSource['unilateral-contract.js'], /UNILATERAL_FRICTION_NOT_MODELED/u);
assert.match(coreSource['unilateral-contract.js'], /PRESCRIBED_SLOT/u);
assert.match(fs.readFileSync('scripts/lfea-m036-bm4-runtime.mjs', 'utf8'), /BM4_FRICTION_NOT_MODELED/u);
assert.match(fs.readFileSync('scripts/lfea-m036-bm4-liftoff-check.mjs', 'utf8'), /9f1fb039511b7304c0208140d81543f11735c0a0/u);

const packageValue = JSON.parse(fs.readFileSync('package.json', 'utf8'));
assert.equal(
  packageValue.scripts['check:lfea-unilateral'],
  'node scripts/lfea-unilateral-closed-form-check.mjs && node scripts/lfea-unilateral-determinism-check.mjs && node scripts/lfea-m036-bm4-liftoff-check.mjs && node scripts/lfea-unilateral-anti-drift-check.mjs',
);
assert.match(packageValue.scripts['check:lfea-linear-core'], /check:lfea-unilateral/u);

console.log('M036 unilateral active-set anti-drift check PASS');
