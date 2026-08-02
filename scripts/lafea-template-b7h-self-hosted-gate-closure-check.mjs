#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REQUIRED_MERGES = Object.freeze({
  b7d: '4ea645b91c8b74fae3d2e8af31278d52505cac84',
  b7e: '07af67696bede4a809f3a61d1670609a5888b4fe',
  nbT6g: '13792e342fe5b9fb494a8103e6d8936245bd05ff',
  b7f: 'dbb24700133c416e77ea1ec800432f5203bd80d3',
  b7g: 'c4d4af771eee0cfb51a6776ee1da9813bb5c5e47',
});
const COMMON_FALSE_AUTHORITY = Object.freeze([
  'generalT7dAuthorized',
  'additionalContinuumTemplatesAuthorized',
  'shellAuthorized',
  'assessmentReady',
  'codeReady',
  'reportAuthority',
  'releaseQualified',
]);
const FULL_FALSE_AUTHORITY = Object.freeze([
  ...COMMON_FALSE_AUTHORITY,
  'arbitraryOuterProfileAuthorized',
  'arbitraryHoleTopologyAuthorized',
  'sclAuthorized',
  'structuralStressAuthorized',
  'lafea6Enabled',
  'displayValuesAuthoritative',
]);
const PATHS = Object.freeze({
  b7e: resolveInsideRoot(process.env.B7E_REPORT_PATH
    ?? 'reports/qualification/lafea-b7e-b7-gate-closure.json'),
  b7f: resolveInsideRoot(process.env.B7F_REPORT_PATH
    ?? 'reports/qualification/lafea-b7f-current-main-qualification.json'),
  b7g: resolveInsideRoot(process.env.B7G_BUNDLE_PATH
    ?? 'reports/qualification/lafea-b7g-portable-qualification-bundle.json'),
  b7h: resolveInsideRoot(process.env.B7H_REPORT_PATH
    ?? 'reports/qualification/lafea-b7h-self-hosted-gate-closure.json'),
});
const checks = [];
const exactHead = git(['rev-parse', 'HEAD']);
const expectedHead = process.env.EXPECTED_HEAD_SHA?.trim() || exactHead;
const mainHead = resolveMainHead();
const runnerEnvironment = resolveRunnerEnvironment();

record('GITHUB_ACTIONS', process.env.GITHUB_ACTIONS === 'true',
  'B7H requires GitHub Actions execution.');
record('SELF_HOSTED_RUNNER', runnerEnvironment === 'self-hosted',
  `Runner environment is ${String(runnerEnvironment)}.`);
record('WORKFLOW_DISPATCH', process.env.GITHUB_EVENT_NAME === 'workflow_dispatch',
  `Event is ${String(process.env.GITHUB_EVENT_NAME)}.`);
record('MAIN_REF', process.env.GITHUB_REF === 'refs/heads/main',
  `Ref is ${String(process.env.GITHUB_REF)}.`);
record('EXACT_HEAD', exactHead === expectedHead,
  `Expected ${expectedHead}; checked out ${exactHead}.`);
record('REMOTE_MAIN_RESOLVED', mainHead !== null,
  'origin/main must be available.');
record('EXACT_CURRENT_MAIN', mainHead === exactHead,
  `origin/main is ${String(mainHead)}; checkout is ${exactHead}.`);
for (const [id, sha] of Object.entries(REQUIRED_MERGES)) {
  record(`${id.toUpperCase()}_MERGE_IN_ANCESTRY`, isAncestor(sha, exactHead),
    `Required merge ${sha} is not in exact-head ancestry.`);
}

const b7e = readReport('B7E', PATHS.b7e,
  'lafea-b7e-b7-gate-closure-report/v1');
const b7f = readReport('B7F', PATHS.b7f,
  'lafea-b7f-current-main-qualification-report/v1');
const b7g = readReport('B7G', PATHS.b7g,
  'lafea-b7g-portable-qualification-bundle/v1');

validateExactReport('B7E', b7e);
validateExactReport('B7F', b7f);
validateExactReport('B7G', b7g);
record('B7F_CURRENT_MAIN_CONTEXT', b7f?.context === 'CURRENT_MAIN',
  `B7F context is ${String(b7f?.context)}.`);
record('B7F_MAIN_HEAD_MATCH', b7f?.mainHead === exactHead,
  `B7F main head is ${String(b7f?.mainHead)}.`);
record('B7F_CURRENT_MAIN_QUALIFIED', b7f?.currentMainQualified === true,
  'B7F currentMainQualified must be true.');
record('B7F_GATE_CLOSURE_ELIGIBLE', b7f?.b7GateClosureEligible === true,
  'B7F b7GateClosureEligible must be true.');
record('B7G_BUNDLE_HASH', verifyBundleHash(b7g),
  'B7G canonical bundle hash must verify.');
record('B7G_SELF_HOSTED_CONTEXT',
  b7g?.execution?.context === 'GITHUB_ACTIONS_SELF_HOSTED'
    && b7g?.execution?.githubActions === true
    && b7g?.execution?.runnerEnvironment === 'self-hosted',
  `B7G execution context is ${String(b7g?.execution?.context)}.`);
record('B7G_RETAINS_B7F_GATE_STATE',
  b7g?.gateDisposition?.retainedB7fContext === 'CURRENT_MAIN'
    && b7g?.gateDisposition?.retainedB7fCurrentMainQualified === true
    && b7g?.gateDisposition?.retainedB7fGateClosureEligible === true,
  'B7G must retain the positive exact-current-main B7F disposition.');
record('B7G_NONCLAIMS_RETAINED',
  b7g?.gateDisposition?.hostedCiPassClaimedByB7g === false
    && b7g?.gateDisposition?.automaticIssueClosureAuthorized === false
    && b7g?.gateDisposition?.governingAcceptanceRequired === true,
  'B7G non-claims must remain intact.');
record('B7E_AUTHORITY_RETAINED',
  authorityRetained(b7e?.authority, COMMON_FALSE_AUTHORITY),
  'B7E common broader authority must remain false.');
record('B7F_AUTHORITY_RETAINED',
  authorityRetained(b7f?.authority, FULL_FALSE_AUTHORITY),
  'B7F broader authority must remain false.');
record('B7G_AUTHORITY_RETAINED',
  authorityRetained(b7g?.authority, FULL_FALSE_AUTHORITY),
  'B7G broader authority must remain false.');
record('TRACKED_TREE_CLEAN',
  git(['status', '--porcelain=v1', '--untracked-files=no']) === '',
  'Tracked worktree must remain clean.');

const failures = checks.filter((entry) => entry.status !== 'PASS');
const status = failures.length === 0 ? 'PASS' : 'BLOCKED';
const report = Object.freeze({
  schema: 'lafea-b7h-self-hosted-gate-closure-report/v1',
  status,
  exactHead,
  expectedHead,
  mainHead,
  boundedPilot: 'C2D-LUG-PINHOLE -> LAFEA.3',
  execution: Object.freeze({
    context: 'GITHUB_ACTIONS_SELF_HOSTED',
    event: process.env.GITHUB_EVENT_NAME ?? null,
    ref: process.env.GITHUB_REF ?? null,
    runnerEnvironment,
    runnerName: process.env.RUNNER_NAME ?? null,
  }),
  requiredMerges: REQUIRED_MERGES,
  evidence: Object.freeze({
    b7e: evidence(PATHS.b7e, b7e),
    b7f: evidence(PATHS.b7f, b7f),
    b7g: evidence(PATHS.b7g, b7g),
  }),
  checks: Object.freeze(checks.map((entry) => Object.freeze({ ...entry }))),
  failures: Object.freeze(failures.map((entry) => Object.freeze({ ...entry }))),
  exactCurrentMainExecutableEvidence: status === 'PASS',
  selfHostedCiQualified: status === 'PASS',
  b7GateClosureEligible: status === 'PASS',
  automaticIssueClosureAuthorized: false,
  governingReviewRequired: true,
  authority: Object.freeze(Object.fromEntries(
    FULL_FALSE_AUTHORITY.map((key) => [key, false]))),
});
fs.mkdirSync(path.dirname(PATHS.b7h), { recursive: true });
fs.writeFileSync(PATHS.b7h, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report));
if (status !== 'PASS') process.exit(1);

function validateExactReport(id, reportValue) {
  record(`${id}_PASS`, reportValue?.status === 'PASS',
    `${id} status is ${String(reportValue?.status)}.`);
  record(`${id}_EXACT_HEAD`, reportValue?.exactHead === exactHead,
    `${id} exact head is ${String(reportValue?.exactHead)}.`);
  record(`${id}_EXPECTED_HEAD`, reportValue?.expectedHead === exactHead,
    `${id} expected head is ${String(reportValue?.expectedHead)}.`);
}

function readReport(id, filePath, schema) {
  record(`${id}_PRESENT`, fs.existsSync(filePath),
    `Expected ${relative(filePath)}.`);
  if (!fs.existsSync(filePath)) return null;
  try {
    const value = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    record(`${id}_SCHEMA`, value.schema === schema,
      `Expected ${schema}; received ${String(value.schema)}.`);
    return value;
  } catch (error) {
    record(`${id}_PARSE`, false,
      error instanceof Error ? error.message : String(error));
    return null;
  }
}

function verifyBundleHash(value) {
  if (!value || typeof value.bundleHash !== 'string') return false;
  const { bundleHash, ...payload } = value;
  return bundleHash === sha256(canonical(payload));
}

function authorityRetained(value, requiredKeys) {
  return value && typeof value === 'object'
    && requiredKeys.every((key) => value[key] === false);
}

function evidence(filePath, parsed) {
  if (!fs.existsSync(filePath)) return Object.freeze({
    path: relative(filePath), present: false, sha256: null,
    schema: null, status: null, exactHead: null,
  });
  const bytes = fs.readFileSync(filePath);
  return Object.freeze({
    path: relative(filePath),
    present: true,
    sha256: sha256(bytes),
    byteLength: bytes.byteLength,
    schema: parsed?.schema ?? null,
    status: parsed?.status ?? null,
    exactHead: parsed?.exactHead ?? null,
  });
}

function resolveRunnerEnvironment() {
  const dedicated = process.env.LAFEA_RUNNER_ENVIRONMENT?.trim();
  if (dedicated) return dedicated;
  return process.env.RUNNER_ENVIRONMENT?.trim() || null;
}

function resolveMainHead() {
  const result = spawnSync('git', ['rev-parse', 'refs/remotes/origin/main'], {
    cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
  });
  const value = result.status === 0 ? result.stdout.trim() : '';
  return /^[0-9a-f]{40}$/u.test(value) ? value : null;
}

function resolveInsideRoot(value) {
  const resolved = path.resolve(ROOT, value);
  if (resolved !== ROOT && !resolved.startsWith(`${ROOT}${path.sep}`)) {
    throw new Error(`Evidence path escapes repository root: ${value}`);
  }
  return resolved;
}

function isAncestor(base, head) {
  return spawnSync('git', ['merge-base', '--is-ancestor', base, head], {
    cwd: ROOT, stdio: 'ignore',
  }).status === 0;
}

function record(id, passed, details) {
  checks.push(Object.freeze({
    id,
    status: passed ? 'PASS' : 'BLOCKED',
    details,
  }));
}

function relative(filePath) {
  return path.relative(ROOT, filePath).split(path.sep).join('/');
}

function sha256(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
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
