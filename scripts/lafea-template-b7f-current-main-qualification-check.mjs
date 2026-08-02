#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REQUIRED_MERGES = Object.freeze({
  b7d: '4ea645b91c8b74fae3d2e8af31278d52505cac84',
  b7e: '07af67696bede4a809f3a61d1670609a5888b4fe',
  nbT6g: '13792e342fe5b9fb494a8103e6d8936245bd05ff',
});
const B7E_REPORT = path.resolve(
  ROOT,
  process.env.B7E_REPORT_PATH
    ?? 'reports/qualification/lafea-b7e-b7-gate-closure.json',
);
const REPORT_PATH = path.resolve(
  ROOT,
  process.env.B7F_REPORT_PATH
    ?? 'reports/qualification/lafea-b7f-current-main-qualification.json',
);

const exactHead = git(['rev-parse', 'HEAD']);
const expectedHead = process.env.EXPECTED_HEAD_SHA?.trim() || exactHead;
const diffBase = resolveDiffBase(exactHead);
const mainHead = resolveMainHead();
const context = resolveContext({ exactHead, mainHead });
const checks = [];

recordAssertion('EXACT_HEAD', exactHead === expectedHead,
  `Expected ${expectedHead}; checked out ${exactHead}.`);
recordAssertion('DIFF_BASE_IN_ANCESTRY', isAncestor(diffBase, exactHead),
  `Diff base ${diffBase} is not in exact-head ancestry.`);
recordAssertion('CURRENT_MAIN_CONTEXT_VERIFIED',
  context !== 'CURRENT_MAIN' || mainHead === exactHead,
  `Current-main context requires exact head ${exactHead} to match origin/main ${String(mainHead)}.`);
for (const [id, sha] of Object.entries(REQUIRED_MERGES)) {
  recordAssertion(`${id.toUpperCase()}_MERGE_IN_ANCESTRY`, isAncestor(sha, exactHead),
    `Required merge ${sha} is not in exact-head ancestry.`);
}

runCheck({
  id: 'B7E_AGGREGATE',
  command: process.execPath,
  args: ['scripts/lafea-template-b7e-b7-gate-closure-check.mjs'],
  env: {
    ...process.env,
    EXPECTED_HEAD_SHA: exactHead,
    PR_BASE_SHA: diffBase,
    B7E_REPORT_PATH: path.relative(ROOT, B7E_REPORT),
  },
});

let b7eReport = null;
recordAssertion('B7E_REPORT_PRESENT', fs.existsSync(B7E_REPORT),
  `Expected B7E report at ${path.relative(ROOT, B7E_REPORT)}.`);
if (fs.existsSync(B7E_REPORT)) {
  try {
    b7eReport = JSON.parse(fs.readFileSync(B7E_REPORT, 'utf8'));
    recordAssertion('B7E_REPORT_SCHEMA',
      b7eReport.schema === 'lafea-b7e-b7-gate-closure-report/v1',
      `Unexpected B7E schema ${String(b7eReport.schema)}.`);
    recordAssertion('B7E_REPORT_PASS', b7eReport.status === 'PASS',
      `B7E status is ${String(b7eReport.status)}.`);
    recordAssertion('B7E_REPORT_EXACT_HEAD', b7eReport.exactHead === exactHead,
      `B7E report head ${String(b7eReport.exactHead)} does not match ${exactHead}.`);
    recordAssertion('B7E_REPORT_EXPECTED_HEAD', b7eReport.expectedHead === exactHead,
      `B7E expected head ${String(b7eReport.expectedHead)} does not match ${exactHead}.`);
  } catch (error) {
    recordAssertion('B7E_REPORT_PARSE', false,
      error instanceof Error ? error.message : String(error));
  }
}

runCheck({
  id: 'NB_T6G_CURRENT_CONTEXT',
  command: process.execPath,
  args: ['scripts/lafea-nb-t6g-read-only-review-panel-check.mjs'],
});
runCheck({
  id: 'NON_BUCKET_STACK',
  command: process.execPath,
  args: ['scripts/lafea-nonbucket-stack-check.mjs'],
});

const trackedStatus = git(['status', '--porcelain=v1', '--untracked-files=no']);
recordAssertion('TRACKED_WORKTREE_CLEAN', trackedStatus === '',
  trackedStatus || 'Tracked worktree is clean.');

const failures = checks.filter((entry) => entry.status !== 'PASS');
const status = failures.length ? 'BLOCKED' : 'PASS';
const b7eReportSha256 = b7eReport === null
  ? null
  : `sha256:${createHash('sha256')
    .update(JSON.stringify(b7eReport))
    .digest('hex')}`;
const report = Object.freeze({
  schema: 'lafea-b7f-current-main-qualification-report/v1',
  status,
  context,
  exactHead,
  expectedHead,
  diffBase,
  mainHead,
  requiredMerges: REQUIRED_MERGES,
  b7eReportSha256,
  checks: Object.freeze(checks.map((entry) => Object.freeze({ ...entry }))),
  failures: Object.freeze(failures.map((entry) => Object.freeze({ ...entry }))),
  currentMainQualified: status === 'PASS' && context === 'CURRENT_MAIN',
  b7GateClosureEligible: status === 'PASS' && context === 'CURRENT_MAIN',
  boundedPilot: 'C2D-LUG-PINHOLE -> LAFEA.3',
  authority: Object.freeze({
    generalT7dAuthorized: false,
    additionalContinuumTemplatesAuthorized: false,
    arbitraryOuterProfileAuthorized: false,
    arbitraryHoleTopologyAuthorized: false,
    shellAuthorized: false,
    sclAuthorized: false,
    structuralStressAuthorized: false,
    assessmentReady: false,
    codeReady: false,
    reportAuthority: false,
    releaseQualified: false,
    lafea6Enabled: false,
    displayValuesAuthoritative: false,
  }),
});

fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report));
if (status !== 'PASS') process.exit(1);

function runCheck({ id, command, args, env = process.env }) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    env,
    encoding: 'utf8',
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  checks.push(Object.freeze({
    id,
    status: result.status === 0 ? 'PASS' : 'BLOCKED',
    exitCode: result.status,
    signal: result.signal ?? null,
    error: result.error?.message ?? null,
  }));
}

function recordAssertion(id, passed, details) {
  checks.push(Object.freeze({
    id,
    status: passed ? 'PASS' : 'BLOCKED',
    details,
  }));
}

function resolveContext({ exactHead: head, mainHead: remoteMain }) {
  const event = process.env.GITHUB_EVENT_NAME;
  const ref = process.env.GITHUB_REF;
  const exactCurrentMain = ref === 'refs/heads/main'
    && remoteMain !== null
    && remoteMain === head;
  if (exactCurrentMain && (event === 'push' || event === 'workflow_dispatch')) {
    return 'CURRENT_MAIN';
  }
  return 'CANDIDATE_HEAD';
}

function resolveMainHead() {
  const candidates = [
    ['rev-parse', 'refs/remotes/origin/main'],
    ['rev-parse', 'refs/heads/main'],
  ];
  for (const args of candidates) {
    const result = spawnSync('git', args, {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    if (result.status === 0 && /^[0-9a-f]{40}$/u.test(result.stdout.trim())) {
      return result.stdout.trim();
    }
  }
  return null;
}

function resolveDiffBase(head) {
  const supplied = process.env.PR_BASE_SHA?.trim();
  if (supplied && /^[0-9a-f]{40}$/u.test(supplied)
      && !/^0{40}$/u.test(supplied)) return supplied;
  const parent = spawnSync('git', ['rev-parse', `${head}^`], {
    cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
  });
  return parent.status === 0 ? parent.stdout.trim() : REQUIRED_MERGES.b7e;
}

function isAncestor(base, head) {
  return spawnSync('git', ['merge-base', '--is-ancestor', base, head], {
    cwd: ROOT, stdio: 'ignore',
  }).status === 0;
}

function git(args) {
  const result = spawnSync('git', args, {
    cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `git ${args.join(' ')} failed.`);
  }
  return result.stdout.trim();
}
