import { spawnSync } from 'node:child_process';
const files = [
  'lfea-002-contract-check.mjs',
  'lfea-002-numerical-check.mjs',
  'lfea-002-failure-check.mjs',
  'lfea-002-determinism-check.mjs',
  'lfea-002-source-guard.mjs',
];
for (const file of files) {
  const result = spawnSync(process.execPath, [new URL(file, import.meta.url).pathname], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log('LFEA-002 isolated qualification suite passed.');
