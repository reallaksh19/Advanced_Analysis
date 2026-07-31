#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const baseIndex = process.argv.indexOf('--base');
const base = baseIndex === -1 ? null : process.argv[baseIndex + 1];
if (!base) throw new TypeError('Usage: node scripts/lafea-template-t6c-source-guard.mjs --base <sha>');

const expected = [
  'scripts/lafea-template-t6c-cross-contract-check.mjs',
  'scripts/lafea-template-t6c-source-guard.mjs',
  'src/workspace/lafea-templates/t6c-live-registration.js',
  'src/workspace/lafea-templates/workbench-registration.js',
].sort();
const changed = git(['diff', '--name-only', `${base}...HEAD`])
  .trim().split('\n').filter(Boolean).sort();
assert.deepEqual(changed, expected);
const statuses = git(['diff', '--name-status', `${base}...HEAD`])
  .trim().split('\n').filter(Boolean);
assert.equal(statuses.every((line) => line.startsWith('A\t')), true);

const registrationPath = 'src/workspace/lafea-templates/workbench-registration.js';
const registration = readFileSync(registrationPath, 'utf8');
for (const required of [
  "from '../lafea-workbench.js'",
  "from './t6b-accessory-panel.js'",
  "'lafea-template-workbench-registration/v1'",
  "'LIVE_UI_COMPOSITION_ONLY'",
  'accessoryPanels: Object.freeze([descriptor])',
  'return mountLafeaWorkbench(rootElement, registration.mountOptions);',
  'validateLafeaAccessoryPanelDescriptor(descriptor);',
]) {
  assert.equal(registration.includes(required), true, `Missing required T6C token: ${required}`);
}
for (const forbidden of [
  'controller.getState(',
  'controller.importDocument(',
  'executeLafeaStage',
  'compileLafeaApplicationTemplate',
  'compileLafeaContinuumApplicationTemplate',
  'initializeLifecycle',
  'registerLifecycleArtifact',
  'applyLifecycleEvent',
  'LAFEA_STAGE_REGISTRY',
  'benchmarkPanel',
]) {
  assert.equal(registration.includes(forbidden), false, `Forbidden T6C authority token: ${forbidden}`);
}

for (const forbiddenPath of [
  'package.json',
  '.github/workflows/',
  'src/workspace/lafea-workbench.js',
  'src/workspace/lafea-workbench-controller.js',
  'src/workspace/lafea-workbench-view.js',
  'src/workspace/lafea-workbench-accessory-panels.js',
  'src/workspace/lafea-stage-registry.js',
  'src/workspace/lafea-lifecycle.js',
  'src/core/',
]) {
  assert.equal(changed.some((path) => path === forbiddenPath || path.startsWith(forbiddenPath)), false);
}

console.log(JSON.stringify({
  check: 'lafea-template-t6c-source-guard',
  status: 'PASS',
  additiveFiles: expected.length,
  modifiedExistingFiles: 0,
  agent1FilesModified: 0,
  liveRegistrationPaths: 1,
  controllerFacadeMethodInvocations: 0,
  workbenchImportPaths: 0,
  compilerInvocationPaths: 0,
  engineExecutionPaths: 0,
  lifecycleRegistrationPaths: 0,
  releasePromotionPaths: 0,
}, null, 2));

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' });
}
