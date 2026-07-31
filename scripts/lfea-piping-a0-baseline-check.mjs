#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const POLICY_PATH = path.join(ROOT, 'audit-baseline.json');
const POLICY_KEYS = Object.freeze([
  'schema',
  'repository',
  'program',
  'sourceBaselineCommit',
  'sourceBaselineRole',
  'requiredDefaultBranch',
  'requiredCleanCheckout',
  'exactHeadAuthority',
  'dependencyLockPath',
  'requiredCommands',
  'programDispositionBeforeA0A7',
]);
const EXPECTED_COMMANDS = Object.freeze([
  'npm ci',
  'node scripts/lfea-piping-a0-baseline-check.mjs --release',
  'npm run check:linear-piping-analysis-consumer',
  'npm run gate',
  'git diff --check',
  'test -z "$(git status --short)"',
]);

const options = parseOptions(process.argv.slice(2));
const policy = JSON.parse(fs.readFileSync(POLICY_PATH, 'utf8'));
requireExactKeys(policy, POLICY_KEYS, 'LFEA_A0_POLICY_KEYS_INVALID');
requirePolicy(policy);

const headSha = git(['rev-parse', 'HEAD']);
const remoteUrl = git(['remote', 'get-url', 'origin']);
const branch = process.env.GITHUB_HEAD_REF
  || process.env.GITHUB_REF_NAME
  || git(['branch', '--show-current'])
  || 'DETACHED_HEAD';
const status = git(['status', '--porcelain=v1']);

git(['cat-file', '-e', `${policy.sourceBaselineCommit}^{commit}`]);
git(['merge-base', '--is-ancestor', policy.sourceBaselineCommit, headSha]);
git(['diff', '--check']);

if (!remoteUrl.includes(policy.repository)) {
  fail('LFEA_A0_REPOSITORY_MISMATCH', { expected: policy.repository, remoteUrl });
}

if (options.release) {
  if (process.env.GITHUB_ACTIONS !== 'true' || process.env.CI !== 'true') {
    fail('LFEA_A0_RELEASE_REQUIRES_GITHUB_ACTIONS');
  }
  if (!process.env.GITHUB_SHA || process.env.GITHUB_SHA !== headSha) {
    fail('LFEA_A0_EXACT_HEAD_MISMATCH', {
      gitHead: headSha,
      githubSha: process.env.GITHUB_SHA ?? null,
    });
  }
  if (policy.requiredCleanCheckout && status !== '') {
    fail('LFEA_A0_WORKTREE_NOT_CLEAN', { status: status.split('\n') });
  }
}

const dependencyLock = path.resolve(ROOT, policy.dependencyLockPath);
if (!fs.existsSync(dependencyLock)) {
  fail('LFEA_A0_DEPENDENCY_LOCK_MISSING', { path: policy.dependencyLockPath });
}

const runtimeManifest = Object.freeze({
  schema: 'lfea-piping-audit-baseline-runtime/v1',
  repository: policy.repository,
  program: policy.program,
  sourceBaselineCommit: policy.sourceBaselineCommit,
  exactHeadCommit: headSha,
  branch,
  remoteUrl,
  dependencyLock: {
    path: policy.dependencyLockPath,
    sha256: sha256File(dependencyLock),
  },
  packageManifest: {
    path: 'package.json',
    sha256: sha256File(path.join(ROOT, 'package.json')),
  },
  runtime: {
    node: process.version,
    npm: execText('npm', ['--version']),
    platform: process.platform,
    architecture: process.arch,
    operatingSystem: `${os.type()} ${os.release()}`,
  },
  checkout: {
    clean: status === '',
    statusLines: status === '' ? [] : status.split('\n'),
    exactHeadAuthority: policy.exactHeadAuthority,
    githubRunId: process.env.GITHUB_RUN_ID ?? null,
    githubRunAttempt: process.env.GITHUB_RUN_ATTEMPT ?? null,
  },
  requiredCommands: [...policy.requiredCommands],
  programDisposition: policy.programDispositionBeforeA0A7,
  evidenceStatus: options.release
    ? 'EXACT_HEAD_BASELINE_CAPTURED'
    : 'BASELINE_POLICY_VERIFIED',
});

if (options.emitPath) {
  const target = path.resolve(ROOT, options.emitPath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(runtimeManifest, null, 2)}\n`);
}

console.log(JSON.stringify(runtimeManifest));

function requirePolicy(value) {
  if (value.schema !== 'lfea-piping-audit-baseline/v1') {
    fail('LFEA_A0_POLICY_SCHEMA_INVALID', { actual: value.schema ?? null });
  }
  if (value.repository !== 'reallaksh19/Advanced_Analysis') {
    fail('LFEA_A0_POLICY_REPOSITORY_INVALID');
  }
  if (!/^[0-9a-f]{40}$/u.test(value.sourceBaselineCommit)) {
    fail('LFEA_A0_SOURCE_BASELINE_SHA_INVALID');
  }
  if (value.sourceBaselineRole !== 'MERGED_PR16_REBASE_POINT') {
    fail('LFEA_A0_SOURCE_BASELINE_ROLE_INVALID');
  }
  if (value.requiredDefaultBranch !== 'main') {
    fail('LFEA_A0_DEFAULT_BRANCH_INVALID');
  }
  if (value.requiredCleanCheckout !== true) {
    fail('LFEA_A0_CLEAN_CHECKOUT_MUST_BE_REQUIRED');
  }
  if (value.exactHeadAuthority !== 'GITHUB_SHA') {
    fail('LFEA_A0_EXACT_HEAD_AUTHORITY_INVALID');
  }
  if (value.dependencyLockPath !== 'package-lock.json') {
    fail('LFEA_A0_DEPENDENCY_LOCK_PATH_INVALID');
  }
  if (JSON.stringify(value.requiredCommands) !== JSON.stringify(EXPECTED_COMMANDS)) {
    fail('LFEA_A0_REQUIRED_COMMANDS_CHANGED', {
      expected: EXPECTED_COMMANDS,
      actual: value.requiredCommands,
    });
  }
  if (value.programDispositionBeforeA0A7 !== 'BLOCKED') {
    fail('LFEA_A0_PROGRAM_DISPOSITION_INVALID');
  }
}

function requireExactKeys(value, expected, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(code, { reason: 'NOT_A_RECORD' });
  }
  const actual = Object.keys(value).sort();
  const required = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(required)) {
    fail(code, { actual, expected: required });
  }
}

function parseOptions(args) {
  const allowed = new Set(['--release']);
  let release = false;
  let emitPath = null;
  for (const argument of args) {
    if (argument === '--release') {
      release = true;
      continue;
    }
    if (argument.startsWith('--emit=')) {
      emitPath = argument.slice('--emit='.length);
      if (!emitPath) fail('LFEA_A0_EMIT_PATH_INVALID');
      continue;
    }
    if (!allowed.has(argument)) {
      fail('LFEA_A0_ARGUMENT_UNSUPPORTED', { argument });
    }
  }
  return { release, emitPath };
}

function git(args) {
  return execText('git', ['-C', ROOT, ...args]);
}

function execText(command, args) {
  return execFileSync(command, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex').toUpperCase();
}

function fail(code, evidence = {}) {
  const error = new Error(code);
  error.code = code;
  error.evidence = evidence;
  throw error;
}
