import { spawnSync } from 'node:child_process';

const files = [
  'src/core/nonlinear-shell-contact/real-module-qualification-contract.js',
  'src/core/nonlinear-shell-contact/real-module-qualification-evaluator.js',
  'src/core/nonlinear-shell-contact/real-module-negative-controls.js',
  'tests/nonlinear-shell-contact-nc08r-qualification.test.mjs',
];

for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const test = spawnSync(
  process.execPath,
  ['--test', 'tests/nonlinear-shell-contact-nc08r-qualification.test.mjs'],
  { stdio: 'inherit' },
);
if (test.status !== 0) process.exit(test.status ?? 1);

console.log('NC08R_GATE_IMPLEMENTED_NOT_A_REAL_QUALIFICATION_RECEIPT');
