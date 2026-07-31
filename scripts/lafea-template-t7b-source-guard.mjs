#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const baseIndex = process.argv.indexOf('--base');
const base = baseIndex === -1 ? null : process.argv[baseIndex + 1];
if (!base) {
  throw new TypeError(
    'Usage: node scripts/lafea-template-t7b-source-guard.mjs --base <sha>',
  );
}

const expected = [
  'scripts/lafea-template-t7b-compilation-preview-check.mjs',
  'scripts/lafea-template-t7b-source-guard.mjs',
  'scripts/lafea-template-t7b-validation-parent-check.mjs',
  'src/workspace/lafea-templates/compilation-preview-accessory-panel.js',
  'src/workspace/lafea-templates/compilation-preview-panel.js',
  'src/workspace/lafea-templates/compilation-preview-wizard.js',
  'src/workspace/lafea-templates/compilation-preview-workbench-registration.js',
  'src/workspace/lafea-templates/compilation-preview.js',
  'src/workspace/lafea-templates/t7b-compilation-preview.js',
].sort();
const changed = git(['diff', '--name-only', `${base}...HEAD`])
  .trim().split('\n').filter(Boolean).sort();
assert.deepEqual(changed, expected);
const statuses = git(['diff', '--name-status', `${base}...HEAD`])
  .trim().split('\n').filter(Boolean);
assert.equal(statuses.every((line) => line.startsWith('A\t')), true);

const preview = read('src/workspace/lafea-templates/compilation-preview.js');
const wizard = read('src/workspace/lafea-templates/compilation-preview-wizard.js');
const panel = read('src/workspace/lafea-templates/compilation-preview-panel.js');
const descriptor = read(
  'src/workspace/lafea-templates/compilation-preview-accessory-panel.js',
);
const registration = read(
  'src/workspace/lafea-templates/compilation-preview-workbench-registration.js',
);
const publicSurface = read('src/workspace/lafea-templates/t7b-compilation-preview.js');
const production = `${preview}\n${wizard}\n${panel}\n${descriptor}\n${registration}\n${publicSurface}`;

for (const required of [
  "'lafea-template-compilation-preview/v1'",
  "'lafea-template-compilation-preview-attempt/v1'",
  "'lafea-t7b-compilation-wizard-model/v1'",
  "'lafea-t7b-compilation-wizard-selection/v1'",
  "'COMPILATION_PREVIEW_ONLY'",
  'compilerInvocation: true',
  'compilationInspection: true',
  'handoffInspection: true',
  'workbenchImport: false',
  'engineExecution: false',
  'createLafeaRawParametersFromDraft',
  'requireExactKeys(validation, VALIDATION_KEYS',
  'declaredValidationHash !== semanticHash(validationBase)',
  'validateTemplateParameterSet(validation.parameterSet)',
  'validation.status !== \'VALID\'',
  'validation.draftSemanticHash !== draft.semanticHash',
  'compileLafeaApplicationTemplate({ templateId, rawParameters })',
  'compileLafeaContinuumApplicationTemplate({ templateId, rawParameters })',
  'validateTemplateHandoff(compilation.handoff)',
  'WORKBENCH_IMPORT_NOT_AUTHORIZED',
  'HANDOFF_INSPECTION_ONLY',
  'invalidateCurrentPreview()',
  'mountLafeaT7bCompilationWizard',
  'accessoryPanels: Object.freeze([descriptor])',
  'validateLafeaAccessoryPanelDescriptor(descriptor)',
]) {
  assert.equal(
    production.includes(required),
    true,
    `Missing required T7B token: ${required}`,
  );
}

assert.equal(
  occurrences(preview, 'compileLafeaApplicationTemplate({ templateId, rawParameters })'),
  1,
);
assert.equal(
  occurrences(
    preview,
    'compileLafeaContinuumApplicationTemplate({ templateId, rawParameters })',
  ),
  1,
);
for (const source of [wizard, panel, descriptor, registration, publicSurface]) {
  assert.equal(source.includes('compileLafeaApplicationTemplate('), false);
  assert.equal(source.includes('compileLafeaContinuumApplicationTemplate('), false);
}

for (const source of [preview, wizard, panel, descriptor, registration, publicSurface]) {
  for (const forbidden of [
    'controller.getState(',
    'controller.importDocument(',
    '.importDocument(',
    'executeLafeaStage',
    'initializeLifecycle',
    'registerLifecycleArtifact',
    'applyLifecycleEvent',
    'LAFEA_STAGE_REGISTRY',
    'registerDisplayPacket',
    'setDisplayPacket',
    'releasePromotion: true',
    'workbenchImport: true',
    'engineExecution: true',
  ]) {
    assert.equal(
      source.includes(forbidden),
      false,
      `Forbidden T7B authority token: ${forbidden}`,
    );
  }
}

assert.match(publicSurface, /createLafeaTemplateCompilationPreview/u);
assert.match(publicSurface, /mountLafeaT7bCompilationPreviewPanel/u);
assert.match(publicSurface, /mountLafeaT7bCompilationWorkbench/u);
assert.doesNotMatch(publicSurface, /mountLafeaT7aParameterPanel/u);
assert.doesNotMatch(publicSurface, /mountLafeaTemplateParameterPanel/u);

for (const forbiddenPath of [
  'package.json',
  '.github/workflows/',
  'src/core/',
  'src/workspace/lafea-workbench.js',
  'src/workspace/lafea-workbench-controller.js',
  'src/workspace/lafea-workbench-view.js',
  'src/workspace/lafea-workbench-accessory-panels.js',
  'src/workspace/lafea-result-display-',
  'src/workspace/lafea-stage-registry.js',
  'src/workspace/lafea-lifecycle.js',
  'src/workspace/lafea-templates/parameter-draft.js',
  'src/workspace/lafea-templates/parameter-entry-panel.js',
  'src/workspace/lafea-templates/parameter-entry-live-panel.js',
  'src/workspace/lafea-templates/parameter-entry-accessory-panel.js',
  'src/workspace/lafea-templates/parameter-workbench-registration.js',
  'src/workspace/lafea-templates/parameter-wizard.js',
  'src/workspace/lafea-templates/t7a-parameter-entry.js',
  'src/workspace/lafea-templates/live-wizard.js',
  'src/workspace/lafea-templates/t6c-live-registration.js',
]) {
  assert.equal(
    changed.some((path) => path === forbiddenPath || path.startsWith(forbiddenPath)),
    false,
    `Forbidden T7B path changed: ${forbiddenPath}`,
  );
}

console.log(JSON.stringify({
  check: 'lafea-template-t7b-source-guard',
  status: 'PASS',
  additiveFiles: expected.length,
  modifiedExistingFiles: 0,
  agent1FilesModified: 0,
  historicalT6FilesModified: 0,
  t7aFilesModified: 0,
  coreCompilerFilesModified: 0,
  validationParentHashChecks: 1,
  validationParentContractChecks: 1,
  compilerInvocationPaths: 2,
  compilationInspectionPaths: 1,
  handoffInspectionPaths: 1,
  workbenchImportPaths: 0,
  engineExecutionPaths: 0,
  lifecycleRegistrationPaths: 0,
  releasePromotionPaths: 0,
}, null, 2));

function read(path) {
  return readFileSync(path, 'utf8');
}

function occurrences(source, token) {
  return source.split(token).length - 1;
}

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' });
}
