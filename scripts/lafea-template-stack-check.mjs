#!/usr/bin/env node

import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const BEHAVIOR_CHECKS = Object.freeze([
  ['T1', 'scripts/lafea-template-t1-contract-check.mjs'],
  ['T2', 'scripts/lafea-template-t2-catalog-check.mjs'],
  ['T3', 'scripts/lafea-template-t3-analytical-compiler-check.mjs'],
  ['T4', 'scripts/lafea-template-t4-continuum-compiler-check.mjs'],
  ['T5', 'scripts/lafea-template-t5-compiler-golden-check.mjs'],
  ['T5', 'scripts/lafea-template-t5-anti-drift-check.mjs'],
  ['T6A', 'scripts/lafea-template-t6a-standalone-wizard-check.mjs'],
  ['T6B', 'scripts/lafea-template-t6b-accessory-panel-check.mjs'],
  ['T6C', 'scripts/lafea-template-t6c-cross-contract-check.mjs'],
  ['T7A', 'scripts/lafea-template-t7a-parameter-entry-check.mjs'],
  ['T7B', 'scripts/lafea-template-t7b-compilation-preview-check.mjs'],
  ['T7B', 'scripts/lafea-template-t7b-validation-parent-check.mjs'],
  ['T7B', 'scripts/lafea-template-t7b-certification-workflow-check.mjs'],
  ['T7B', 'scripts/lafea-template-t7b-evidence-correction-workflow-check.mjs'],
  ['T7C', 'scripts/lafea-template-t7c-workbench-import-check.mjs'],
  ['T7C', 'scripts/lafea-template-t7c-certification-workflow-check.mjs'],
]);

const DIRECT_SOURCE_GUARDS = Object.freeze([
  ['T1', 'scripts/lafea-template-t1-source-guard.mjs'],
  ['T2', 'scripts/lafea-template-t2-source-guard.mjs'],
  ['T3', 'scripts/lafea-template-t3-source-guard.mjs'],
  ['T3', 'scripts/lafea-template-t3-unit-projection-source-guard.mjs'],
]);

const SYNTHETIC_SOURCE_GUARDS = Object.freeze([
  guard('T4', 'scripts/lafea-template-t4-source-guard.mjs', [
    'scripts/lafea-template-t4-continuum-compiler-check.mjs',
    'scripts/lafea-template-t4-source-guard.mjs',
    'src/core/lafea-application-templates/compile-continuum-template.js',
    'src/core/lafea-application-templates/compilers/continuum/bindings.js',
    'src/core/lafea-application-templates/compilers/continuum/common.js',
    'src/core/lafea-application-templates/compilers/continuum/index.js',
    'src/core/lafea-application-templates/compilers/continuum/source-intake.js',
    'src/core/lafea-application-templates/parameter-schemas/continuum.js',
    'src/core/lafea-application-templates/t4-continuum.js',
  ]),
  guard('T5', 'scripts/lafea-template-t5-source-guard.mjs', [
    'scripts/lafea-template-t5-anti-drift-check.mjs',
    'scripts/lafea-template-t5-compiler-golden-check.mjs',
    'scripts/lafea-template-t5-source-guard.mjs',
    'src/core/lafea-application-templates/benchmark-fixtures/t5-controlled-reference.js',
    'src/core/lafea-application-templates/benchmark-manifests/t5-compiler-golden.js',
    'src/core/lafea-application-templates/t5-qualification.js',
  ]),
  guard('T6A', 'scripts/lafea-template-t6a-source-guard.mjs', [
    'scripts/lafea-template-t6a-source-guard.mjs',
    'scripts/lafea-template-t6a-standalone-wizard-check.mjs',
    'src/workspace/lafea-templates/t6a-standalone-wizard.js',
    'src/workspace/lafea-templates/wizard-constants.js',
    'src/workspace/lafea-templates/wizard-controller.js',
    'src/workspace/lafea-templates/wizard-model.js',
    'src/workspace/lafea-templates/wizard-view.js',
  ]),
  guard('T6B', 'scripts/lafea-template-t6b-source-guard.mjs', [
    'scripts/lafea-template-t6b-accessory-panel-check.mjs',
    'scripts/lafea-template-t6b-source-guard.mjs',
    'src/workspace/lafea-templates/accessory-panel-descriptor.js',
    'src/workspace/lafea-templates/t6b-accessory-panel.js',
  ]),
  guard('T6C', 'scripts/lafea-template-t6c-source-guard.mjs', [
    'scripts/lafea-template-t6c-cross-contract-check.mjs',
    'scripts/lafea-template-t6c-source-guard.mjs',
    'src/workspace/lafea-templates/live-accessory-panel-descriptor.js',
    'src/workspace/lafea-templates/live-wizard.js',
    'src/workspace/lafea-templates/t6c-live-registration.js',
    'src/workspace/lafea-templates/workbench-registration.js',
  ]),
  guard('T7A', 'scripts/lafea-template-t7a-source-guard.mjs', [
    'scripts/lafea-template-t7a-parameter-entry-check.mjs',
    'scripts/lafea-template-t7a-source-guard.mjs',
    'src/workspace/lafea-templates/parameter-draft.js',
    'src/workspace/lafea-templates/parameter-entry-accessory-panel.js',
    'src/workspace/lafea-templates/parameter-entry-live-panel.js',
    'src/workspace/lafea-templates/parameter-entry-panel.js',
    'src/workspace/lafea-templates/parameter-wizard.js',
    'src/workspace/lafea-templates/parameter-workbench-registration.js',
    'src/workspace/lafea-templates/t7a-parameter-entry.js',
  ]),
  guard('T7B', 'scripts/lafea-template-t7b-source-guard.mjs', [
    'scripts/lafea-template-t7b-compilation-preview-check.mjs',
    'scripts/lafea-template-t7b-source-guard.mjs',
    'scripts/lafea-template-t7b-validation-parent-check.mjs',
    'src/workspace/lafea-templates/compilation-preview-accessory-panel.js',
    'src/workspace/lafea-templates/compilation-preview-panel.js',
    'src/workspace/lafea-templates/compilation-preview-wizard.js',
    'src/workspace/lafea-templates/compilation-preview-workbench-registration.js',
    'src/workspace/lafea-templates/compilation-preview.js',
    'src/workspace/lafea-templates/t7b-compilation-preview.js',
  ]),
  guard('T7C', 'scripts/lafea-template-t7c-source-guard.mjs', [
    'scripts/lafea-template-t7c-source-guard.mjs',
    'scripts/lafea-template-t7c-workbench-import-check.mjs',
    'src/workspace/lafea-templates/t7c-workbench-import.js',
    'src/workspace/lafea-templates/workbench-import-accessory-panel.js',
    'src/workspace/lafea-templates/workbench-import-panel.js',
    'src/workspace/lafea-templates/workbench-import-wizard.js',
    'src/workspace/lafea-templates/workbench-import-workbench-registration.js',
    'src/workspace/lafea-templates/workbench-import.js',
  ]),
]);

const failures = [];
const packageAudit = auditPackageScriptKeys();
if (packageAudit.duplicateKeys.length) {
  failures.push({ scope: 'PACKAGE', check: 'script-key-uniqueness', code: 'DUPLICATE_PACKAGE_SCRIPT_KEYS', details: packageAudit.duplicateKeys });
}

for (const [scope, script] of [...BEHAVIOR_CHECKS, ...DIRECT_SOURCE_GUARDS]) {
  runNode(scope, script, [], ROOT, failures);
}
for (const row of SYNTHETIC_SOURCE_GUARDS) runSyntheticGuard(row, failures);
runNpm('FOUNDATION', 'syntax:strict', failures);
runNpm('FOUNDATION', 'check:imports', failures);

const report = Object.freeze({
  schema: 'lafea-template-stack-report/v1',
  check: 'lafea-template-stack-certification',
  status: failures.length ? 'FAIL' : 'PASS',
  exactHead: git(ROOT, ['rev-parse', 'HEAD'], true),
  behaviorChecks: BEHAVIOR_CHECKS.map(([scope, script]) => ({ scope, script })),
  directSourceGuards: DIRECT_SOURCE_GUARDS.map(([scope, script]) => ({ scope, script })),
  syntheticSourceGuards: SYNTHETIC_SOURCE_GUARDS.map(({ scope, script, packagePaths }) => ({ scope, script, packagePaths })),
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

function guard(scope, script, packagePaths) {
  return Object.freeze({ scope, script, packagePaths: Object.freeze(packagePaths) });
}

function runNode(scope, script, args, cwd, targetFailures) {
  const absolute = path.join(cwd, script);
  if (!fs.existsSync(absolute)) {
    targetFailures.push({ scope, check: script, code: 'CHECK_SCRIPT_MISSING' });
    return;
  }
  const result = spawnSync(process.execPath, [absolute, ...args], { cwd, encoding: 'utf8', stdio: 'inherit' });
  if (result.error) targetFailures.push({ scope, check: script, code: 'CHECK_SPAWN_FAILED', message: result.error.message });
  else if (result.status !== 0) targetFailures.push({ scope, check: script, code: 'CHECK_FAILED', status: result.status });
}

function runNpm(scope, script, targetFailures) {
  const result = spawnSync('npm', ['run', script], { cwd: ROOT, encoding: 'utf8', stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.error) targetFailures.push({ scope, check: `npm run ${script}`, code: 'CHECK_SPAWN_FAILED', message: result.error.message });
  else if (result.status !== 0) targetFailures.push({ scope, check: `npm run ${script}`, code: 'CHECK_FAILED', status: result.status });
}

function runSyntheticGuard(row, targetFailures) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lafea-template-guard-'));
  try {
    const archive = execFileSync('git', ['archive', '--format=tar', 'HEAD'], { cwd: ROOT, encoding: 'buffer' });
    const extract = spawnSync('tar', ['-xf', '-', '-C', temp], { input: archive, encoding: 'buffer' });
    if (extract.status !== 0) throw new Error(`tar extraction failed with status ${extract.status}.`);
    git(temp, ['init', '--quiet']);
    git(temp, ['config', 'user.email', 'lafea-template-stack@invalid.local']);
    git(temp, ['config', 'user.name', 'LAFEA Template Stack']);
    for (const relative of row.packagePaths) fs.rmSync(path.join(temp, relative), { recursive: true, force: true });
    git(temp, ['add', '-A']);
    git(temp, ['commit', '--quiet', '-m', `synthetic ${row.scope} base`]);
    const base = git(temp, ['rev-parse', 'HEAD']);
    for (const relative of row.packagePaths) copyPath(path.join(ROOT, relative), path.join(temp, relative));
    git(temp, ['add', '-A']);
    git(temp, ['commit', '--quiet', '-m', `synthetic ${row.scope} head`]);
    const rootModules = path.join(ROOT, 'node_modules');
    const tempModules = path.join(temp, 'node_modules');
    if (fs.existsSync(rootModules) && !fs.existsSync(tempModules)) fs.symlinkSync(rootModules, tempModules, 'dir');
    runNode(row.scope, row.script, ['--base', base], temp, targetFailures);
  } catch (error) {
    targetFailures.push({ scope: row.scope, check: row.script, code: 'SYNTHETIC_SOURCE_GUARD_FAILED', message: error.message });
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

function copyPath(source, destination) {
  if (!fs.existsSync(source)) throw new Error(`Required retained source is missing: ${path.relative(ROOT, source)}.`);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.cpSync(source, destination, { recursive: true });
}

function git(cwd, args, nullable = false) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status === 0) return result.stdout.trim();
  if (nullable) return null;
  throw new Error(result.stderr.trim() || `git ${args.join(' ')} failed.`);
}

function auditPackageScriptKeys() {
  const text = fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8');
  const start = text.indexOf('{', text.indexOf('"scripts"') + 9);
  const end = matchingBrace(text, start);
  const counts = new Map();
  for (const match of text.slice(start + 1, end).matchAll(/^\s*"([^"]+)"\s*:/gmu)) counts.set(match[1], (counts.get(match[1]) ?? 0) + 1);
  return {
    keyCount: [...counts.values()].reduce((sum, count) => sum + count, 0),
    duplicateKeys: [...counts].filter(([, count]) => count > 1).map(([key, count]) => ({ key, count })).sort((a, b) => a.key.localeCompare(b.key)),
  };
}

function matchingBrace(text, start) {
  let depth = 0;
  let string = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (string) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') string = false;
    } else if (char === '"') string = true;
    else if (char === '{') depth += 1;
    else if (char === '}' && --depth === 0) return index;
  }
  throw new Error('package.json scripts object is not closed.');
}
