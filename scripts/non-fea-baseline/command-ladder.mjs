import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

export const NON_FEA_P0_COMMANDS = Object.freeze([
  ['non-fea-p0-tests', ['node', ['--test', 'tests/non-fea-p0-*.test.mjs']]],
  ['check:workspace-contracts', ['npm', ['run', 'check:workspace-contracts']]],
  ['check:first-cut', ['npm', ['run', 'check:first-cut']]],
  ['check:first-cut-engineering-benchmarks', ['npm', ['run', 'check:first-cut-engineering-benchmarks']]],
  ['w10.6-engineering-benchmark', ['node', ['scripts/w10.6-engineering-benchmark-check.mjs']]],
  ['authorized-empirical', ['node', ['scripts/run-authorized-empirical-load-execution-checks.mjs']]],
  ['authorized-enrichment-api', ['node', ['scripts/run-authorized-enrichment-workspace-api-checks.mjs']]],
  ['authorized-empirical-view', ['node', ['scripts/run-authorized-empirical-execution-view-checks.mjs']]],
  ['check:sequential-sketcher', ['npm', ['run', 'check:sequential-sketcher']]],
  ['topology-edit-tests', ['node', ['--test', '--test-concurrency=1', 'tests/topology-edit-*.test.mjs']]],
  ['three-viewport-navigation-node', ['node', ['--test', 'tests/three-viewport-navigation.test.mjs']]],
  ['three-viewport-navigation-browser', ['npx', ['playwright', 'test', 'e2e/three-viewport-navigation.spec.js', '--workers=1', '--reporter=line']]],
  ['syntax:strict', ['npm', ['run', 'syntax:strict']]],
  ['build', ['npm', ['run', 'build']]],
]);

export function runNonFeaP0Command([commandId, [command, args]], cwd) {
  const started = Date.now();
  try {
    const result = spawnSync(command, args, {
      cwd,
      encoding: 'utf8',
      shell: true,
      maxBuffer: 20 * 1024 * 1024,
    });
    const output = `${result.stdout || ''}${result.stderr || ''}`;
    return {
      commandId,
      command: [command, ...args].join(' '),
      status: result.error ? 'BLOCKED' : result.status === 0 ? 'PASS' : 'FAIL',
      exitCode: result.status,
      durationMs: Date.now() - started,
      outputSha256: sha256(output),
      outputTail: output.split(/\r?\n/u).slice(-40),
      error: result.error ? String(result.error.message || result.error) : null,
    };
  } catch (error) {
    return {
      commandId,
      command: [command, ...args].join(' '),
      status: 'BLOCKED',
      exitCode: null,
      durationMs: Date.now() - started,
      outputSha256: null,
      outputTail: [],
      error: String(error.message || error),
    };
  }
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}
