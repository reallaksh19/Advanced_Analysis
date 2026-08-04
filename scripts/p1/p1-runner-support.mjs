import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { canonicalPrettyStringify } from '../../src/core/shared-piping-model/canonical-json.js';

const execFileAsync = promisify(execFile);
const SHA1 = /^[0-9a-f]{40}$/u;

export const P1_Q0_ALLOWED_EVIDENCE_PATHS = Object.freeze([
  'docs/p1-current-main-performance-audit.md',
  'docs/p1-protected-manifest-contract.md',
  'e2e/p1-browser-observer.js',
  'e2e/p1-current-main-performance-helpers.js',
  'e2e/p1-current-main-performance.spec.js',
  'reports/p1-current-main-qualification.json',
  'reports/p1-protected-manifest-before.json',
  'scripts/p1/p1-browser-run-validator.mjs',
  'scripts/p1/p1-contracts.mjs',
  'scripts/p1/p1-invalidation-recorder.mjs',
  'scripts/p1/p1-protected-manifest-validator.mjs',
  'scripts/p1/p1-protected-manifest.mjs',
  'scripts/p1/p1-qualification-evaluator.mjs',
  'scripts/p1/p1-report-validator.mjs',
  'scripts/p1/p1-runner-support.mjs',
  'scripts/p1/run-p1-current-main-qualification.mjs',
  'tests/p1-q0-browser-run-validator.test.mjs',
  'tests/p1-q0-invalidation-recorder.test.mjs',
  'tests/p1-q0-protected-manifest.test.mjs',
  'tests/p1-q0-report-validator.test.mjs',
  'tests/p1-q0-runner-support.test.mjs',
]);

export function parseP1Arguments(args) {
  const result = {
    p0Report: 'reports/non-fea-current-main-baseline.json',
    p0Acceptance: null,
    fixtureRole: 'LARGE_MODEL_4884_ENTITY',
    fixture: null,
    browserEvidence: null,
    output: 'reports/p1-current-main-qualification.json',
    manifestOutput: 'reports/p1-protected-manifest-before.json',
    executionId: null,
    baseCommit: null,
    failOnGate: false,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--p0-report') result.p0Report = requireValue(args[++index], arg);
    else if (arg === '--p0-acceptance') result.p0Acceptance = requireValue(args[++index], arg);
    else if (arg === '--fixture-role') result.fixtureRole = requireValue(args[++index], arg);
    else if (arg === '--fixture') result.fixture = requireValue(args[++index], arg);
    else if (arg === '--browser-evidence') result.browserEvidence = requireValue(args[++index], arg);
    else if (arg === '--output') result.output = requireValue(args[++index], arg);
    else if (arg === '--manifest-output') result.manifestOutput = requireValue(args[++index], arg);
    else if (arg === '--execution-id') result.executionId = requireValue(args[++index], arg);
    else if (arg === '--base-commit') result.baseCommit = requireValue(args[++index], arg);
    else if (arg === '--fail-on-gate') result.failOnGate = true;
    else throw new TypeError(`Unsupported argument: ${arg}.`);
  }
  return Object.freeze(result);
}

export async function resolveP1ScopeBase({
  explicitBase = null,
  exactHeadSha,
  gitRunner = git,
}) {
  requireSha(exactHeadSha, 'exactHeadSha');
  if (explicitBase !== null) requireSha(explicitBase, 'explicitBase');
  for (const ref of ['origin/main', 'main']) {
    try {
      const derived = await gitRunner(['merge-base', exactHeadSha, ref]);
      if (!SHA1.test(derived)) continue;
      if (explicitBase && explicitBase !== derived) {
        throw codedError('P1_SCOPE_BASE_OVERRIDE_MISMATCH',
          'Explicit P1 scope base differs from the current-main merge base.',
          { explicitBase, derived, ref });
      }
      await requireAncestor(derived, exactHeadSha, gitRunner);
      return derived;
    } catch (error) {
      if (error?.code === 'P1_SCOPE_BASE_OVERRIDE_MISMATCH') throw error;
    }
  }
  if (!explicitBase) {
    throw codedError('P1_SCOPE_BASE_UNRESOLVED',
      'Neither origin/main nor main could be resolved; an explicit verified base is required.',
      { exactHeadSha });
  }
  await requireAncestor(explicitBase, exactHeadSha, gitRunner);
  return explicitBase;
}

async function requireAncestor(baseSha, headSha, gitRunner) {
  try {
    await gitRunner(['merge-base', '--is-ancestor', baseSha, headSha]);
  } catch {
    throw codedError('P1_SCOPE_BASE_NOT_ANCESTOR',
      'The selected P1 scope base is not an ancestor of the exact head.',
      { baseSha, headSha });
  }
}

export async function git(args) {
  const { stdout } = await execFileAsync('git', args, { encoding: 'utf8' });
  return stdout.trim();
}

export async function writeCanonicalJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, canonicalPrettyStringify(value), 'utf8');
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function zeroSha256() { return '0'.repeat(64); }

export function deduplicateFailures(rows) {
  const map = new Map();
  rows.forEach((row) => map.set(`${row.code}\u0000${JSON.stringify(row.details)}`, row));
  return [...map.values()];
}

function requireSha(value, label) {
  if (!SHA1.test(value || '')) throw new TypeError(`${label} must be a lowercase Git SHA-1.`);
}
function codedError(code, message, details) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  return error;
}
function requireValue(value, option) {
  if (typeof value !== 'string' || !value || value.startsWith('--')) {
    throw new TypeError(`${option} requires a value.`);
  }
  return value;
}
