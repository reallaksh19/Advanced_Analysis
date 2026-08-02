#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REQUIRED_B7D_MERGE = '4ea645b91c8b74fae3d2e8af31278d52505cac84';
const REPORT_PATH = path.resolve(
  ROOT,
  process.env.B7E_REPORT_PATH
    ?? 'reports/qualification/lafea-b7e-b7-gate-closure.json',
);

const exactHead = git(['rev-parse', 'HEAD']);
const expectedHead = process.env.EXPECTED_HEAD_SHA?.trim() || exactHead;
const diffBase = resolveDiffBase(exactHead);
const checks = [];

recordAssertion(
  'EXACT_HEAD',
  exactHead === expectedHead,
  `Expected ${expectedHead}; checked out ${exactHead}.`,
);
recordAssertion(
  'B7D_MERGE_IN_ANCESTRY',
  isAncestor(REQUIRED_B7D_MERGE, exactHead),
  `Required B7D merge ${REQUIRED_B7D_MERGE} is not in current ancestry.`,
);
recordAssertion(
  'DIFF_BASE_IN_ANCESTRY',
  isAncestor(diffBase, exactHead),
  `Diff base ${diffBase} is not in current ancestry.`,
);

const executableChecks = [
  nodeCheck(
    'B7D_CONTROLLER',
    'scripts/lafea-template-b7d-controlled-continuum-controller-check.mjs',
  ),
  nodeCheck(
    'B7C_CONTRACTS',
    'scripts/lafea-template-b7c-controlled-continuum-contract-check.mjs',
  ),
  nodeCheck(
    'B7B_BENCHMARKS',
    'scripts/lafea-template-b7b-continuum-benchmark-convergence-check.mjs',
  ),
  nodeCheck(
    'B7A_MAPPING',
    'scripts/lafea-template-b7a-lug-pinhole-mapping-check.mjs',
  ),
  nodeCheck(
    'B6_CALLER_MESH',
    'scripts/lafea-template-b6-caller-mesh-binding-check.mjs',
  ),
  npmCheck('STRICT_SYNTAX', 'syntax:strict'),
  npmCheck('IMPORT_BOUNDARIES', 'check:imports'),
  npmCheck('PRODUCTION_BUILD', 'build'),
];

for (const check of executableChecks) runCheck(check);
runCheck({
  id: 'PATCH_HYGIENE',
  command: 'git',
  args: ['diff', '--check', `${diffBase}...${exactHead}`],
});

const trackedStatus = git(['status', '--porcelain=v1', '--untracked-files=no']);
recordAssertion(
  'TRACKED_WORKTREE_CLEAN',
  trackedStatus === '',
  trackedStatus || 'Tracked worktree is clean.',
);

const failures = checks.filter((check) => check.status !== 'PASS');
const report = Object.freeze({
  schema: 'lafea-b7e-b7-gate-closure-report/v1',
  status: failures.length ? 'BLOCKED' : 'PASS',
  exactHead,
  expectedHead,
  diffBase,
  requiredB7dMerge: REQUIRED_B7D_MERGE,
  pilot: Object.freeze({
    templateId: 'C2D-LUG-PINHOLE',
    stageId: 'LAFEA.3',
    scope: 'BOUNDED_CONTINUUM_PILOT_ONLY',
  }),
  checks: Object.freeze(checks.map((check) => Object.freeze({ ...check }))),
  blockingCheckIds: Object.freeze(failures.map((check) => check.id)),
  authority: Object.freeze({
    b7ImplementationMerged: true,
    exactHeadExecutableEvidence: failures.length === 0,
    boundedPilotQualified: failures.length === 0,
    generalT7dAuthorized: false,
    additionalContinuumTemplatesAuthorized: false,
    shellAuthorized: false,
    assessmentReady: false,
    codeReady: false,
    reportAuthority: false,
    releaseQualified: false,
  }),
});

fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report));
if (failures.length) process.exit(1);

function nodeCheck(id, script) {
  return { id, command: process.execPath, args: [script] };
}

function npmCheck(id, script) {
  return { id, command: 'npm', args: ['run', script] };
}

function runCheck(check) {
  const result = spawnSync(check.command, check.args, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: 'inherit',
    shell: process.platform === 'win32' && check.command === 'npm',
  });
  checks.push({
    id: check.id,
    command: [check.command, ...check.args].join(' '),
    status: result.status === 0 && !result.error ? 'PASS' : 'FAIL',
    exitCode: Number.isInteger(result.status) ? result.status : null,
    error: result.error?.message ?? null,
  });
}

function recordAssertion(id, accepted, message) {
  checks.push({
    id,
    command: null,
    status: accepted ? 'PASS' : 'FAIL',
    exitCode: accepted ? 0 : 1,
    error: accepted ? null : message,
  });
}

function resolveDiffBase(head) {
  const supplied = process.env.PR_BASE_SHA?.trim()
    || process.env.B7E_DIFF_BASE_SHA?.trim();
  if (!supplied || /^0+$/u.test(supplied) || supplied === head) {
    return REQUIRED_B7D_MERGE;
  }
  return supplied;
}

function isAncestor(ancestor, descendant) {
  const result = spawnSync(
    'git', ['merge-base', '--is-ancestor', ancestor, descendant],
    { cwd: ROOT, encoding: 'utf8' },
  );
  return result.status === 0;
}

function git(args) {
  const result = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `git ${args.join(' ')} failed.`);
  }
  return result.stdout.trim();
}
