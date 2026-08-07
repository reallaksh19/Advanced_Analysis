#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve('src/core/linear-fea-unilateral-solver');
const CORE_FILES = fs.readdirSync(ROOT)
  .filter((name) => name.endsWith('.js'))
  .sort()
  .map((name) => path.join(ROOT, name));
const CHECK_FILES = [
  'scripts/lfea-unilateral-closed-form-check.mjs',
  'scripts/lfea-unilateral-determinism-check.mjs',
  'scripts/lfea-unilateral-linear-noop-check.mjs',
  'scripts/lfea-m036-bm4-runtime.mjs',
  'scripts/lfea-m036-bm4-liftoff-check.mjs',
  'scripts/lfea-unilateral-anti-drift-check.mjs',
].filter((file) => fs.existsSync(file));

for (const file of [...CORE_FILES, ...CHECK_FILES]) {
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/u).length;
  assert.ok(lines < 300, `${file} has ${lines} physical lines; M036 limit is <300`);
}

const source = Object.fromEntries(CORE_FILES.map((file) => [path.basename(file), fs.readFileSync(file, 'utf8')]));
const combined = Object.values(source).join('\n');

for (const [code, pattern] of [
  ['INNER_COMPILER_REIMPLEMENTATION', /function\s+compileMechanicalModel|function\s+compileFrameElement|function\s+compileSolverExecution/u],
  ['FULL_NONLINEAR_MACHINERY', /Newton[- ]?Raphson|tangent stiffness|load incrementation/u],
  ['PENALTY_CONTACT', /penalty\s+(spring|contact)|contact\s+stiffness/u],
  ['RANDOMNESS', /Math\.random|randomUUID/u],
  ['LOCALE_ORDERING', /localeCompare/u],
]) assert.doesNotMatch(combined, pattern, `${code}: unilateral core`);

assert.match(source['unilateral-contract.js'], /13:[\s\S]*UX[\s\S]*14:[\s\S]*UY[\s\S]*15:[\s\S]*UZ/u);
assert.match(source['unilateral-contract.js'], /16:[\s\S]*UX[\s\S]*17:[\s\S]*UY[\s\S]*18:[\s\S]*UZ/u);
assert.match(source['unilateral-contract.js'], /PRESCRIBED_SLOT/u);
assert.match(source['unilateral-contract.js'], /BM4_FRICTION_NOT_MODELED/u);
assert.match(source['support-status.js'], /normalizedReaction\s*<\s*-policy\.forceTolerance/u);
assert.match(source['support-status.js'], /normalizedDisplacement\s*<\s*penetrationLimit/u);
assert.match(source['support-status.js'], /UNILATERAL_SUPPORT_FROZEN_RELEASED/u);
assert.match(source['iteration.js'], /checked\.flips/u);
assert.match(source['iteration.js'], /prescribedMovements/u);
assert.match(source['iteration.js'], /UNILATERAL_NON_CONVERGENCE/u);
assert.doesNotMatch(source['iteration.js'], /linear-fea-model-compiler|linear-fea-frame-element|linear-fea-solver/u);

console.log('LFEA M036 unilateral anti-drift check PASS');
