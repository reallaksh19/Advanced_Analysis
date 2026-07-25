import { spawnSync } from 'node:child_process';
const files = [
  'lfea-001-contract-check.mjs',
  'lfea-001-numerical-check.mjs',
  'lfea-001-failure-check.mjs',
  'lfea-001-determinism-check.mjs',
  'lfea-001-source-guard.mjs',
];
for (const file of files) {
  const result = spawnSync(process.execPath, [new URL(file, import.meta.url).pathname], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log('LFEA-001 isolated qualification suite passed.');
