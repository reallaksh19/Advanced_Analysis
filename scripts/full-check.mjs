import { spawnSync } from 'node:child_process';

const checks = [
  ['npm', ['run', 'check:package-json']],
  ['npm', ['run', 'check:imports']],
  ['npm', ['run', 'syntax:strict']],
  ['npm', ['run', 'check:registry']],
  ['npm', ['run', 'check:benchmarks']],
  ['npm', ['run', 'check:smoke']]
];

for (const [cmd, args] of checks) {
  const label = `${cmd} ${args.join(' ')}`;
  console.log(`\n▶ ${label}`);
  const result = spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.status !== 0) {
    console.error(`\nFull check failed at: ${label}`);
    process.exit(result.status ?? 1);
  }
}

console.log('\nFull check completed successfully.');
