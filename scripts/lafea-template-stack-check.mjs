#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const CURRENT_CHECKS = Object.freeze([
  check('T1', 'scripts/lafea-template-t1-contract-check.mjs'),
  check('T2', 'scripts/lafea-template-t2-catalog-check.mjs'),
  check('T3', 'scripts/lafea-template-t3-analytical-compiler-check.mjs'),
  check('T4', 'scripts/lafea-template-t4-continuum-compiler-check.mjs'),
  check('T5', 'scripts/lafea-template-t5-compiler-golden-check.mjs'),
  check('T5', 'scripts/lafea-template-t5-anti-drift-check.mjs'),
  check('T6A', 'scripts/lafea-template-t6a-standalone-wizard-check.mjs'),
  check('T6B', 'scripts/lafea-template-t6b-accessory-panel-check.mjs'),
  check('T6C', 'scripts/lafea-template-t6c-cross-contract-check.mjs'),
  check('T7A', 'scripts/lafea-template-t7a-parameter-entry-check.mjs'),
  check('T7B', 'scripts/lafea-template-t7b-compilation-preview-check.mjs'),
  check('T7B', 'scripts/lafea-template-t7b-validation-parent-check.mjs'),
  check('T7C', 'scripts/lafea-template-t7c-workbench-import-check.mjs'),
]);

const RETAINED_EVIDENCE_CHECKS = Object.freeze([
  historical('T1', 'scripts/lafea-template-t1-source-guard.mjs', 'ARG_BASE'),
  historical('T2', 'scripts/lafea-template-t2-source-guard.mjs', 'ARG_BASE'),
  historical('T3', 'scripts/lafea-template-t3-source-guard.mjs', 'ARG_BASE'),
  historical('T3-UNIT', 'scripts/lafea-template-t3-unit-projection-source-guard.mjs', 'ARG_BASE'),
  historical('T4', 'scripts/lafea-template-t4-source-guard.mjs', 'ARG_BASE'),
  historical('T5', 'scripts/lafea-template-t5-source-guard.mjs', 'ARG_BASE'),
  historical('T6A', 'scripts/lafea-template-t6a-source-guard.mjs', 'ARG_BASE'),
  historical('T6B', 'scripts/lafea-template-t6b-source-guard.mjs', 'ARG_BASE'),
  historical('T6C', 'scripts/lafea-template-t6c-source-guard.mjs', 'ARG_BASE'),
  historical('T7A', 'scripts/lafea-template-t7a-source-guard.mjs', 'ARG_BASE'),
  historical('T7B', 'scripts/lafea-template-t7b-source-guard.mjs', 'ARG_BASE'),
  historical(
    'T7B-WORKFLOW',
    'scripts/lafea-template-t7b-evidence-correction-workflow-check.mjs',
    'ENV_BASE',
  ),
  historical('T7C', 'scripts/lafea-template-t7c-source-guard.mjs', 'ARG_BASE'),
  historical(
    'T7C-WORKFLOW',
    'scripts/lafea-template-t7c-certification-workflow-check.mjs',
    'NO_BASE',
  ),
]);

const failures = [];
const retainedEvidence = [];
const packageAudit = auditPackageScriptKeys();
if (packageAudit.duplicateKeys.length) {
  failures.push({
    scope: 'PACKAGE',
    check: 'script-key-uniqueness',
    code: 'DUPLICATE_PACKAGE_SCRIPT_KEYS',
    details: packageAudit.duplicateKeys,
  });
}

for (const row of CURRENT_CHECKS) {
  runNode(row.scope, row.script, [], ROOT, process.env, failures);
}
for (const row of RETAINED_EVIDENCE_CHECKS) {
  runRetainedEvidenceCheck(row, failures, retainedEvidence);
}
runNpm('FOUNDATION', 'syntax:strict', failures);
runNpm('FOUNDATION', 'check:imports', failures);

const report = Object.freeze({
  schema: 'lafea-template-stack-report/v1',
  check: 'lafea-template-stack-certification',
  status: failures.length ? 'FAIL' : 'PASS',
  exactHead: git(ROOT, ['rev-parse', 'HEAD'], true),
  currentChecks: CURRENT_CHECKS,
  retainedEvidence,
  packageScriptKeyCount: packageAudit.keyCount,
  duplicatePackageScriptKeys: packageAudit.duplicateKeys,
  failures,
  authority: Object.freeze({
    catalogueOnlyThroughT2: true,
    compilerHandoffOnlyThroughT5: true,
    t6cUiCompositionOnly: true,
    t7aValidationOnly: true,
    t7bCompilationInspectionOnly: true,
    t7cImportForEditingOnly: true,
    engineExecution: false,
    lifecycleInitialization: false,
    lifecycleRegistration: false,
    resultBinding: false,
    releasePromotion: false,
    t7dAuthorized: false,
  }),
});

console.log(JSON.stringify(report));
if (failures.length) process.exit(1);

function check(scope, script) {
  return Object.freeze({ scope, script });
}

function historical(scope, script, baseMode) {
  return Object.freeze({ scope, script, baseMode });
}

function runRetainedEvidenceCheck(row, targetFailures, evidence) {
  const currentScript = path.join(ROOT, row.script);
  if (!fs.existsSync(currentScript)) {
    targetFailures.push({
      scope: row.scope,
      check: row.script,
      code: 'CHECK_SCRIPT_MISSING',
    });
    return;
  }

  const commit = git(
    ROOT,
    ['log', '-1', '--format=%H', 'HEAD', '--', row.script],
    true,
  );
  if (!commit) {
    targetFailures.push({
      scope: row.scope,
      check: row.script,
      code: 'RETAINED_EVIDENCE_COMMIT_MISSING',
    });
    return;
  }

  const ancestry = spawnSync(
    'git',
    ['merge-base', '--is-ancestor', commit, 'HEAD'],
    { cwd: ROOT, encoding: 'utf8' },
  );
  if (ancestry.status !== 0) {
    targetFailures.push({
      scope: row.scope,
      check: row.script,
      code: 'RETAINED_EVIDENCE_NOT_IN_CURRENT_ANCESTRY',
      commit,
    });
    return;
  }

  const parent = git(ROOT, ['rev-parse', `${commit}^`], true);
  if (!parent) {
    targetFailures.push({
      scope: row.scope,
      check: row.script,
      code: 'RETAINED_EVIDENCE_PARENT_MISSING',
      commit,
    });
    return;
  }

  const container = fs.mkdtempSync(path.join(os.tmpdir(), 'lafea-retained-evidence-'));
  const worktree = path.join(container, 'checkout');
  let worktreeAdded = false;
  try {
    const add = spawnSync(
      'git',
      ['worktree', 'add', '--detach', worktree, commit],
      { cwd: ROOT, encoding: 'utf8' },
    );
    if (add.status !== 0) {
      throw new Error(add.stderr.trim() || `Unable to add worktree for ${commit}.`);
    }
    worktreeAdded = true;

    const rootModules = path.join(ROOT, 'node_modules');
    const worktreeModules = path.join(worktree, 'node_modules');
    if (fs.existsSync(rootModules)) fs.symlinkSync(rootModules, worktreeModules, 'dir');

    const args = row.baseMode === 'ARG_BASE' ? ['--base', parent] : [];
    const env = row.baseMode === 'ENV_BASE'
      ? { ...process.env, PR_BASE_SHA: parent }
      : process.env;
    const passed = runNode(row.scope, row.script, args, worktree, env, targetFailures);
    evidence.push(Object.freeze({
      scope: row.scope,
      script: row.script,
      baseMode: row.baseMode,
      evidenceCommit: commit,
      evidenceParent: parent,
      currentAncestor: true,
      status: passed ? 'PASS' : 'FAIL',
    }));
  } catch (error) {
    targetFailures.push({
      scope: row.scope,
      check: row.script,
      code: 'RETAINED_EVIDENCE_EXECUTION_FAILED',
      commit,
      parent,
      message: error.message,
    });
  } finally {
    if (worktreeAdded) {
      fs.rmSync(path.join(worktree, 'node_modules'), { force: true });
      const remove = spawnSync(
        'git',
        ['worktree', 'remove', '--force', worktree],
        { cwd: ROOT, encoding: 'utf8' },
      );
      if (remove.status !== 0) {
        targetFailures.push({
          scope: row.scope,
          check: row.script,
          code: 'RETAINED_EVIDENCE_CLEANUP_FAILED',
          message: remove.stderr.trim(),
        });
      }
    }
    fs.rmSync(container, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 50,
    });
  }
}

function runNode(scope, script, args, cwd, env, targetFailures) {
  const absolute = path.join(cwd, script);
  if (!fs.existsSync(absolute)) {
    targetFailures.push({ scope, check: script, code: 'CHECK_SCRIPT_MISSING' });
    return false;
  }
  const result = spawnSync(process.execPath, [absolute, ...args], {
    cwd,
    env,
    encoding: 'utf8',
    stdio: 'inherit',
  });
  if (result.error) {
    targetFailures.push({
      scope,
      check: script,
      code: 'CHECK_SPAWN_FAILED',
      message: result.error.message,
    });
    return false;
  }
  if (result.status !== 0) {
    targetFailures.push({ scope, check: script, code: 'CHECK_FAILED', status: result.status });
    return false;
  }
  return true;
}

function runNpm(scope, script, targetFailures) {
  const result = spawnSync('npm', ['run', script], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.error) {
    targetFailures.push({
      scope,
      check: `npm run ${script}`,
      code: 'CHECK_SPAWN_FAILED',
      message: result.error.message,
    });
  } else if (result.status !== 0) {
    targetFailures.push({
      scope,
      check: `npm run ${script}`,
      code: 'CHECK_FAILED',
      status: result.status,
    });
  }
}

function git(cwd, args, nullable = false) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status === 0) return result.stdout.trim();
  if (nullable) return null;
  throw new Error(result.stderr.trim() || `git ${args.join(' ')} failed.`);
}

function auditPackageScriptKeys() {
  const text = fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8');
  const markerIndex = text.indexOf('"scripts"');
  if (markerIndex < 0) throw new Error('package.json has no scripts object.');
  const start = text.indexOf('{', markerIndex + 9);
  if (start < 0) throw new Error('package.json scripts object is malformed.');
  const end = matchingBrace(text, start);
  const counts = new Map();
  for (const match of text.slice(start + 1, end).matchAll(/^\s*"([^"]+)"\s*:/gmu)) {
    counts.set(match[1], (counts.get(match[1]) ?? 0) + 1);
  }
  return {
    keyCount: [...counts.values()].reduce((sum, count) => sum + count, 0),
    duplicateKeys: [...counts]
      .filter(([, count]) => count > 1)
      .map(([key, count]) => ({ key, count }))
      .sort((left, right) => left.key.localeCompare(right.key)),
  };
}

function matchingBrace(text, start) {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const character = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === '{') depth += 1;
    else if (character === '}') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  throw new Error('package.json scripts object is not closed.');
}
