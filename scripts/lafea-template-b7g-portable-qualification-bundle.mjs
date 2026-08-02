#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPORT_DIR = path.resolve(ROOT, 'reports/qualification');
const B7E_REPORT_PATH = resolveOutputPath(
  process.env.B7E_REPORT_PATH,
  'reports/qualification/lafea-b7e-b7-gate-closure.json',
);
const B7F_REPORT_PATH = resolveOutputPath(
  process.env.B7F_REPORT_PATH,
  'reports/qualification/lafea-b7f-current-main-qualification.json',
);
const BUNDLE_PATH = resolveOutputPath(
  process.env.B7G_BUNDLE_PATH,
  'reports/qualification/lafea-b7g-portable-qualification-bundle.json',
);
const LOG_PATH = resolveOutputPath(
  process.env.B7G_LOG_PATH,
  'reports/qualification/lafea-b7g-portable-qualification.log',
);
const MAX_CAPTURE_BYTES = 64 * 1024 * 1024;
const AUTHORITY = Object.freeze({
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
});

const exactHead = git(['rev-parse', 'HEAD']);
const expectedHead = process.env.EXPECTED_HEAD_SHA?.trim() || exactHead;
const diffBase = resolveDiffBase(exactHead);
const trackedBefore = git(['status', '--porcelain=v1', '--untracked-files=no']);
const checks = [];

record('EXACT_HEAD', exactHead === expectedHead,
  `Expected ${expectedHead}; checked out ${exactHead}.`);
record('TRACKED_TREE_CLEAN_BEFORE', trackedBefore === '',
  trackedBefore || 'Tracked tree is clean before execution.');
record('B7F_SCRIPT_PRESENT',
  fs.existsSync(path.resolve(ROOT,
    'scripts/lafea-template-b7f-current-main-qualification-check.mjs')),
  'The retained B7F aggregate script must exist.');

fs.mkdirSync(REPORT_DIR, { recursive: true });
const child = spawnSync(process.execPath, [
  'scripts/lafea-template-b7f-current-main-qualification-check.mjs',
], {
  cwd: ROOT,
  env: {
    ...process.env,
    EXPECTED_HEAD_SHA: exactHead,
    PR_BASE_SHA: diffBase,
    B7E_REPORT_PATH: relative(B7E_REPORT_PATH),
    B7F_REPORT_PATH: relative(B7F_REPORT_PATH),
  },
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
  maxBuffer: MAX_CAPTURE_BYTES,
});

const logText = [
  'LAFEA B7G PORTABLE EXACT-HEAD QUALIFICATION LOG',
  `exactHead=${exactHead}`,
  `expectedHead=${expectedHead}`,
  `diffBase=${diffBase}`,
  `executionContext=${executionContext()}`,
  `node=${process.version}`,
  `platform=${process.platform}`,
  `arch=${process.arch}`,
  `command=${process.execPath} scripts/lafea-template-b7f-current-main-qualification-check.mjs`,
  `exitCode=${child.status === null ? 'null' : child.status}`,
  `signal=${child.signal ?? 'null'}`,
  `spawnError=${child.error?.message ?? 'null'}`,
  '--- STDOUT ---',
  child.stdout ?? '',
  '--- STDERR ---',
  child.stderr ?? '',
].join('\n');
fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
fs.writeFileSync(LOG_PATH, logText.endsWith('\n') ? logText : `${logText}\n`);

record('B7F_PROCESS_EXIT', child.status === 0,
  child.error?.message ?? `B7F exit code ${String(child.status)}.`);
record('B7G_LOG_BOUNDED', fs.statSync(LOG_PATH).size <= MAX_CAPTURE_BYTES,
  `Log size is ${fs.statSync(LOG_PATH).size} bytes.`);

const b7eReport = readJsonEvidence(
  'B7E_REPORT',
  B7E_REPORT_PATH,
  'lafea-b7e-b7-gate-closure-report/v1',
);
const b7fReport = readJsonEvidence(
  'B7F_REPORT',
  B7F_REPORT_PATH,
  'lafea-b7f-current-main-qualification-report/v1',
);

if (b7eReport) {
  record('B7E_PASS', b7eReport.status === 'PASS',
    `B7E status is ${String(b7eReport.status)}.`);
  record('B7E_EXACT_HEAD', b7eReport.exactHead === exactHead,
    `B7E head is ${String(b7eReport.exactHead)}.`);
  record('B7E_EXPECTED_HEAD', b7eReport.expectedHead === exactHead,
    `B7E expected head is ${String(b7eReport.expectedHead)}.`);
  record('B7E_AUTHORITY_RETAINED', authorityRetained(b7eReport.authority),
    'B7E authority flags must remain false.');
}
if (b7fReport) {
  record('B7F_PASS', b7fReport.status === 'PASS',
    `B7F status is ${String(b7fReport.status)}.`);
  record('B7F_EXACT_HEAD', b7fReport.exactHead === exactHead,
    `B7F head is ${String(b7fReport.exactHead)}.`);
  record('B7F_EXPECTED_HEAD', b7fReport.expectedHead === exactHead,
    `B7F expected head is ${String(b7fReport.expectedHead)}.`);
  record('B7F_AUTHORITY_RETAINED', authorityRetained(b7fReport.authority),
    'B7F authority flags must remain false.');
}

const trackedAfter = git(['status', '--porcelain=v1', '--untracked-files=no']);
record('TRACKED_TREE_CLEAN_AFTER', trackedAfter === '',
  trackedAfter || 'Tracked tree is clean after execution.');

const failures = checks.filter((entry) => entry.status !== 'PASS');
const status = failures.length === 0 ? 'PASS' : 'BLOCKED';
const payload = Object.freeze({
  schema: 'lafea-b7g-portable-qualification-bundle/v1',
  status,
  exactHead,
  expectedHead,
  diffBase,
  boundedPilot: 'C2D-LUG-PINHOLE -> LAFEA.3',
  execution: Object.freeze({
    context: executionContext(),
    githubActions: process.env.GITHUB_ACTIONS === 'true',
    runnerEnvironment: process.env.RUNNER_ENVIRONMENT ?? null,
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    command: Object.freeze({
      executable: process.execPath,
      arguments: Object.freeze([
        'scripts/lafea-template-b7f-current-main-qualification-check.mjs',
      ]),
      exitCode: child.status,
      signal: child.signal ?? null,
      spawnError: child.error?.message ?? null,
    }),
  }),
  evidence: Object.freeze({
    log: fileEvidence(LOG_PATH),
    b7eReport: fileEvidence(B7E_REPORT_PATH, b7eReport),
    b7fReport: fileEvidence(B7F_REPORT_PATH, b7fReport),
  }),
  checks: Object.freeze(checks.map((entry) => Object.freeze({ ...entry }))),
  failures: Object.freeze(failures.map((entry) => Object.freeze({ ...entry }))),
  gateDisposition: Object.freeze({
    portableEvidenceReady: status === 'PASS',
    retainedB7fContext: b7fReport?.context ?? null,
    retainedB7fCurrentMainQualified:
      b7fReport?.currentMainQualified === true,
    retainedB7fGateClosureEligible:
      b7fReport?.b7GateClosureEligible === true,
    hostedCiPassClaimedByB7g: false,
    automaticIssueClosureAuthorized: false,
    governingAcceptanceRequired: true,
  }),
  authority: AUTHORITY,
});
const bundle = Object.freeze({
  ...payload,
  bundleHash: sha256(canonical(payload)),
});

fs.mkdirSync(path.dirname(BUNDLE_PATH), { recursive: true });
fs.writeFileSync(BUNDLE_PATH, `${JSON.stringify(bundle, null, 2)}\n`);
console.log(JSON.stringify(bundle));
if (status !== 'PASS') process.exit(1);

function readJsonEvidence(id, filePath, schema) {
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

function fileEvidence(filePath, parsed = null) {
  if (!fs.existsSync(filePath)) return Object.freeze({
    path: relative(filePath),
    present: false,
    sha256: null,
    byteLength: null,
    schema: null,
    status: null,
    exactHead: null,
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

function authorityRetained(value) {
  return value && Object.entries(AUTHORITY)
    .every(([key, expected]) => value[key] === expected);
}

function executionContext() {
  if (process.env.GITHUB_ACTIONS !== 'true') return 'LOCAL_OPERATOR';
  return process.env.RUNNER_ENVIRONMENT === 'self-hosted'
    ? 'GITHUB_ACTIONS_SELF_HOSTED'
    : 'GITHUB_ACTIONS_HOSTED';
}

function resolveDiffBase(head) {
  const supplied = process.env.PR_BASE_SHA?.trim();
  if (supplied && /^[0-9a-f]{40}$/u.test(supplied)
      && !/^0{40}$/u.test(supplied)) return supplied;
  const parent = spawnSync('git', ['rev-parse', `${head}^`], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  if (parent.status !== 0) throw new Error('Unable to resolve diff base.');
  return parent.stdout.trim();
}

function resolveOutputPath(value, fallback) {
  const resolved = path.resolve(ROOT, value?.trim() || fallback);
  if (resolved !== ROOT && !resolved.startsWith(`${ROOT}${path.sep}`)) {
    throw new Error(`Evidence path escapes repository root: ${resolved}`);
  }
  return resolved;
}

function relative(filePath) {
  return path.relative(ROOT, filePath).split(path.sep).join('/');
}

function record(id, passed, details) {
  checks.push(Object.freeze({
    id,
    status: passed ? 'PASS' : 'BLOCKED',
    details,
  }));
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
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `git ${args.join(' ')} failed.`);
  }
  return result.stdout.trim();
}
