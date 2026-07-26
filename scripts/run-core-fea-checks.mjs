import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const suites = [
  ['001', [
    'contract',
    'numerical',
    'failure',
    'determinism',
  ]],
  ['002', [
    'contract',
    'numerical',
    'failure',
    'determinism',
  ]],
  ['003', [
    'contract',
    'numerical',
    'failure',
    'determinism',
  ]],
  ['004', [
    'contract',
    'numerical',
    'failure',
    'determinism',
    'capacity',
  ]],
  ['005', [
    'contract',
    'topology',
    'assignment',
    'solver-roundtrip',
    'failure',
    'determinism',
  ]],
  ['006', [
    'contract',
    'qualification',
    'review',
    'export',
    'failure',
    'determinism',
  ]],
];

for (const [wave, checks] of suites) {
  for (const check of checks) {
    run(`lfea-${wave}-${check}-check.mjs`);
  }
}

console.log('Aggregate LFEA core qualification checks passed.');

function run(file) {
  const script = fileURLToPath(new URL(file, import.meta.url));
  const result = spawnSync(process.execPath, [script], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
