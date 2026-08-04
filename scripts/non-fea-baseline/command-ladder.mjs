import { createHash } from 'node:crypto';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export const NON_FEA_P0_COMMANDS = Object.freeze([
  ['npm-ci', ['npm', ['ci']]],
  ['normalize-attribute-1835', ['node', [
    'scripts/benchmark-workspace-normalization.mjs',
    '--fixture', 'benchmarks/ATTRIBUTE-AML_ASIM-1835_managed_stage_enriched_stage.json',
    '--max-normalize-ms', '3000',
  ]]],
  ['normalize-sjson', ['node', [
    'scripts/benchmark-workspace-normalization.mjs',
    '--fixture', 'benchmarks/Sjson.json',
  ]]],
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
  ['git-diff-check', ['git', ['diff', '--check']]],
  ['git-status-short', ['git', ['status', '--short']]],
]);

export function nonFeaP0CommandIds() {
  return NON_FEA_P0_COMMANDS.map(([commandId]) => commandId);
}

export function runNonFeaP0Command([commandId, [command, args]], cwd, options = {}) {
  const started = Date.now();
  try {
    const expandedArgs = expandSimpleGlobs(args, cwd);
    const result = spawnSync(platformCommand(command), expandedArgs, {
      cwd,
      encoding: 'utf8',
      shell: false,
      maxBuffer: 20 * 1024 * 1024,
      env: { ...process.env, ...(options.env || {}) },
    });
    const errorText = result.error ? String(result.error.message || result.error) : '';
    const output = `${result.stdout || ''}${result.stderr || ''}${errorText}`;
    return commandEvidence({
      commandId,
      command,
      args: expandedArgs,
      status: result.error ? 'BLOCKED' : result.status === 0 ? 'PASS' : 'FAIL',
      exitCode: result.status,
      durationMs: Date.now() - started,
      output,
      error: result.error ? errorText : null,
    });
  } catch (error) {
    const message = String(error?.message || error);
    return commandEvidence({
      commandId,
      command,
      args,
      status: 'BLOCKED',
      exitCode: null,
      durationMs: Date.now() - started,
      output: message,
      error: message,
    });
  }
}

function expandSimpleGlobs(args, cwd) {
  return args.flatMap((argument) => {
    if (!argument.includes('*')) return [argument];
    const normalized = argument.replaceAll('\\', '/');
    const separator = normalized.lastIndexOf('/');
    const directory = separator >= 0 ? normalized.slice(0, separator) : '.';
    const pattern = separator >= 0 ? normalized.slice(separator + 1) : normalized;
    const expression = new RegExp(`^${escapeRegExp(pattern).replaceAll('\\*', '.*')}$`, 'u');
    let names;
    try {
      names = readdirSync(path.resolve(cwd, directory), { withFileTypes: true })
        .filter((entry) => entry.isFile() && expression.test(entry.name))
        .map((entry) => `${directory === '.' ? '' : `${directory}/`}${entry.name}`)
        .sort(codeUnitCompare);
    } catch {
      names = [];
    }
    return names.length ? names : [argument];
  });
}

function platformCommand(command) {
  if (process.platform !== 'win32') return command;
  return ['npm', 'npx'].includes(command) ? `${command}.cmd` : command;
}

function commandEvidence({ commandId, command, args, status, exitCode, durationMs, output, error }) {
  return Object.freeze({
    commandId,
    command: [command, ...args].join(' '),
    status,
    exitCode,
    durationMs,
    outputSha256: sha256(output),
    outputTail: output.split(/\r?\n/u).slice(-40),
    error,
  });
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}
function codeUnitCompare(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
function sha256(value) { return createHash('sha256').update(value).digest('hex'); }
