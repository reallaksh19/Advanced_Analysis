import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const commands = [
  ['scripts/check-enrichment-ui-phase0-fixtures.mjs'],
  ['scripts/check-enrichment-ui-phase0-containment.mjs'],
  ['scripts/check-enrichment-ui-phase0-antidrift.mjs'],
  ['scripts/benchmark-enrichment-ui-phase0.mjs', '--fixture', 'all'],
];

const results = [];
for (const args of commands) {
  const result = spawnSync(process.execPath, args, {
    cwd: repositoryRoot,
    env: { ...process.env, ENRICHMENT_UI_PHASE0_CHECK_ROOT: repositoryRoot },
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  assert.equal(result.status, 0, `E_QF_AGGREGATE_CHILD_FAILED: node ${args.join(' ')}`);
  results.push({
    command: `node ${args.join(' ')}`,
    status: 'PASS',
    lastOutputLine: result.stdout.trim().split('\n').at(-1) ?? '',
  });
}

console.log(JSON.stringify({
  check: 'enrichment-ui-phase0-aggregate',
  status: 'PASS',
  repositoryRoot,
  results,
}));
