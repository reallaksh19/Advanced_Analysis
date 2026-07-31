#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const baseIndex = process.argv.indexOf('--base');
const base = baseIndex === -1 ? null : process.argv[baseIndex + 1];
if (!base) {
  throw new TypeError(
    'Usage: node scripts/lafea-template-t7a-source-guard.mjs --base <sha>',
  );
}

const expected = [
  'scripts/lafea-template-t7a-parameter-entry-check.mjs',
  'scripts/lafea-template-t7a-source-guard.mjs',
  'src/workspace/lafea-templates/parameter-draft.js',
  'src/workspace/lafea-templates/parameter-entry-accessory-panel.js',
  'src/workspace/lafea-templates/parameter-entry-live-panel.js',
  'src/workspace/lafea-templates/parameter-entry-panel.js',
  'src/workspace/lafea-templates/parameter-wizard.js',
  'src/workspace/lafea-templates/parameter-workbench-registration.js',
  'src/workspace/lafea-templates/t7a-parameter-entry.js',
].sort();
const changed = git(['diff', '--name-only', `${base}...HEAD`])
  .trim().split('\n').filter(Boolean).sort();
assert.deepEqual(changed, expected);
const statuses = git(['diff', '--name-status', `${base}...HEAD`])
  .trim().split('\n').filter(Boolean);
assert.equal(statuses.every((line) => line.startsWith('A\t')), true);

const draft = read('src/workspace/lafea-templates/parameter-draft.js');
const panel = read('src/workspace/lafea-templates/parameter-entry-panel.js');
const livePanel = read(
  'src/workspace/lafea-templates/parameter-entry-live-panel.js',
);
const wizard = read('src/workspace/lafea-templates/parameter-wizard.js');
const descriptor = read(
  'src/workspace/lafea-templates/parameter-entry-accessory-panel.js',
);
const registration = read(
  'src/workspace/lafea-templates/parameter-workbench-registration.js',
);
const publicSurface = read('src/workspace/lafea-templates/t7a-parameter-entry.js');
const production = `${draft}\n${panel}\n${livePanel}\n${wizard}\n${descriptor}\n${registration}`;
for (const required of [
  'validateTemplateParameters(parameterSchema, rawParameters)',
  "'lafea-template-parameter-draft/v1'",
  "'lafea-template-parameter-draft-validation/v1'",
  "'lafea-t7a-parameter-wizard-model/v1'",
  "'lafea-t7a-parameter-wizard-selection/v1'",
  "'PARAMETER_DRAFT_VALIDATION_ONLY'",
  'parameterEntry: true',
  'parameterValidation: true',
  'selectionOnly: false',
  'templateSelection: true',
  'accessoryPanels: Object.freeze([descriptor])',
  'mountLafeaT7aParameterPanel',
  'mountLafeaT7aParameterWizard',
  'createLafeaT7aParameterWizardModel',
  'createLafeaLiveTemplateWizardModel',
  'LAFEA_T7A_PARAMETER_WIZARD_ACTION_AUTHORITY',
  'Template selection, parameter drafting and governed validation are enabled.',
  'Parameter drafting and governed validation are active; compilation, document import and engine execution remain disabled.',
  'validateLafeaAccessoryPanelDescriptor(descriptor)',
]) {
  assert.equal(
    production.includes(required),
    true,
    `Missing required T7A token: ${required}`,
  );
}
assert.match(publicSurface, /mountLafeaT7aParameterPanel/u);
assert.match(publicSurface, /mountLafeaT7aParameterWizard/u);
assert.match(publicSurface, /LAFEA_T7A_PARAMETER_WIZARD_ACTION_AUTHORITY/u);
assert.match(publicSurface, /LAFEA_T7A_PARAMETER_WIZARD_ACTIONS/u);
assert.match(publicSurface, /createLafeaT7aParameterWizardModel/u);
assert.doesNotMatch(publicSurface, /LafeaTemplateParameterPanelController/u);
assert.doesNotMatch(publicSurface, /mountLafeaTemplateParameterPanel/u);

const staleT6cBlocker =
  'Live workbench composition is active through the governed accessory-panel seam; parameter entry, compilation, document import and engine execution remain disabled.';
assert.equal(
  production.includes(staleT6cBlocker),
  false,
  'T7A production must not retain the T6C parameter-entry blocker.',
);
assert.equal(
  production.includes(
    'Selection and evidence inspection only; parameter entry, compilation, document import and engine execution remain disabled.',
  ),
  false,
  'T7A must not render the historical T6C parameter-entry blocker.',
);

for (const source of [draft, panel, livePanel, wizard, descriptor, registration]) {
  for (const forbidden of [
    'compileLafeaApplicationTemplate',
    'compileLafeaContinuumApplicationTemplate',
    'controller.getState(',
    'controller.importDocument(',
    'executeLafeaStage',
    'initializeLifecycle',
    'registerLifecycleArtifact',
    'applyLifecycleEvent',
    'LAFEA_STAGE_REGISTRY',
    'benchmarkPanel',
  ]) {
    assert.equal(
      source.includes(forbidden),
      false,
      `Forbidden T7A authority token: ${forbidden}`,
    );
  }
}

for (const forbiddenPath of [
  'package.json',
  '.github/workflows/',
  'src/workspace/lafea-workbench.js',
  'src/workspace/lafea-workbench-controller.js',
  'src/workspace/lafea-workbench-view.js',
  'src/workspace/lafea-workbench-accessory-panels.js',
  'src/workspace/lafea-templates/live-wizard.js',
  'src/workspace/lafea-templates/live-accessory-panel-descriptor.js',
  'src/workspace/lafea-templates/workbench-registration.js',
  'src/workspace/lafea-templates/t6c-live-registration.js',
  'src/workspace/lafea-stage-registry.js',
  'src/workspace/lafea-lifecycle.js',
  'src/core/',
]) {
  assert.equal(
    changed.some((path) => path === forbiddenPath || path.startsWith(forbiddenPath)),
    false,
  );
}

console.log(JSON.stringify({
  check: 'lafea-template-t7a-source-guard',
  status: 'PASS',
  additiveFiles: expected.length,
  modifiedExistingFiles: 0,
  agent1FilesModified: 0,
  historicalT6FilesModified: 0,
  parameterEntryPaths: 1,
  parameterValidationPaths: 1,
  truthfulParameterWizardPaths: 1,
  truthfulParameterWizardModelPaths: 1,
  selectionOnlyPaths: 0,
  staleT6cParameterBlockerPaths: 0,
  publicGenericPanelPaths: 0,
  controllerFacadeMethodInvocations: 0,
  compilerInvocationPaths: 0,
  workbenchImportPaths: 0,
  engineExecutionPaths: 0,
  lifecycleRegistrationPaths: 0,
  releasePromotionPaths: 0,
}, null, 2));

function read(path) {
  return readFileSync(path, 'utf8');
}

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' });
}
