import { spawnSync } from 'node:child_process';

for (const script of [
  'scripts/common-enriched-properties-contract-check.mjs',
  'scripts/common-enriched-properties-anti-drift-check.mjs',
]) {
  const result = spawnSync(process.execPath, [script], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log('PASS common enriched properties aggregate checks');
