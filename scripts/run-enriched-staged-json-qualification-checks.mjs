import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const commands = [
  ['scripts/check-enriched-staged-json-fixtures.mjs'],
  ['scripts/check-enriched-staged-json-preservation.mjs'],
  ['scripts/check-enriched-staged-json-parity.mjs'],
  ['scripts/check-enriched-staged-json-antidrift.mjs'],
  ['scripts/benchmark-enriched-staged-json-qualification.mjs'],
];

const results = [];
for (const args of commands) {
  const child = spawnSync(process.execPath, args, {
    cwd: process.cwd(),
    env: { ...process.env, TZ: 'UTC' },
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  assert.equal(child.status, 0, `${args[0]} failed\n${child.stdout}\n${child.stderr}`);
  process.stdout.write(child.stdout);
  results.push({ command: `node ${args.join(' ')}`, status: 'PASS' });
}
console.log(JSON.stringify({
  status: 'PASS',
  check: 'aggregate',
  childChecks: results.length,
  results,
}));
