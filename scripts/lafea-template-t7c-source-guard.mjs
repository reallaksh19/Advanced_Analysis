#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const baseIndex = process.argv.indexOf('--base');
const base = baseIndex === -1 ? null : process.argv[baseIndex + 1];
if (!base) {
  throw new TypeError(
    'Usage: node scripts/lafea-template-t7c-source-guard.mjs --base <sha>',
  );
}

const expected = [
  'scripts/lafea-template-t7c-source-guard.mjs',
  'scripts/lafea-template-t7c-workbench-import-check.mjs',
  'src/workspace/lafea-templates/t7c-workbench-import.js',
  'src/workspace/lafea-templates/workbench-import-accessory-panel.js',
  'src/workspace/lafea-templates/workbench-import-panel.js',
  'src/workspace/lafea-templates/workbench-import-wizard.js',
  'src/workspace/lafea-templates/workbench-import-workbench-registration.js',
  'src/workspace/lafea-templates/workbench-import.js',
].sort();
const changed = git(['diff', '--name-only', `${base}...HEAD`])
  .trim().split('\n').filter(Boolean).sort();
assert.deepEqual(changed, expected);
const statuses = git(['diff', '--name-status', `${base}...HEAD`])
  .trim().split('\n').filter(Boolean);
assert.equal(statuses.length, expected.length);
assert.equal(statuses.every((line) => line.startsWith('A\t')), true);

const adapter = read('src/workspace/lafea-templates/workbench-import.js');
const wizard = read('src/workspace/lafea-templates/workbench-import-wizard.js');
const panel = read('src/workspace/lafea-templates/workbench-import-panel.js');
const descriptor = read(
  'src/workspace/lafea-templates/workbench-import-accessory-panel.js',
);
const registration = read(
  'src/workspace/lafea-templates/workbench-import-workbench-registration.js',
);
const publicSurface = read('src/workspace/lafea-templates/t7c-workbench-import.js');
const behavior = read('scripts/lafea-template-t7c-workbench-import-check.mjs');
const production = [adapter, wizard, panel, descriptor, registration, publicSurface]
  .join('\n');

for (const required of [
  "'lafea-template-workbench-import-receipt/v1'",
  "'lafea-template-workbench-import-attempt/v1'",
  "'IMPORTED_FOR_EDITING'",
  "'lafea-t7c-import-wizard-model/v1'",
  "'lafea-t7c-import-wizard-selection/v1'",
  "'CURRENT_HANDOFF_IMPORT_ONLY'",
  'workbenchImport: true',
  'engineExecution: false',
  'lifecycleInitialization: false',
  'lifecycleRegistration: false',
  'resultDisplayBinding: false',
  'releasePromotion: false',
  'attemptLafeaTemplateWorkbenchImport',
  'normalizeLafeaStageDocument',
  'CURRENT_COMPILATION_HANDOFF_IMPORTED',
  'ENGINE_NOT_EXECUTED',
  'LIFECYCLE_METHODS_NOT_INVOKED_BY_T7C',
  'OBSERVED_LIFECYCLE_BINDING_RECORDED',
  'RESULT_DISPLAY_NOT_BOUND',
  'createLafeaT7cImportAccessoryPanelDescriptor',
  'mountLafeaT7cImportWorkbench',
]) {
  assert.equal(
    production.includes(required),
    true,
    `Missing required T7C token: ${required}`,
  );
}

for (const required of [
  'retainedCompilationAttempt',
  "'T7C_RETAINED_COMPILATION_ATTEMPT_IDENTITY_MISMATCH'",
  "'lafea-workbench-state/v2'",
  "'lafea-lifecycle-binding/v1'",
  "'UNINITIALIZED'",
  "'CURRENT'",
  "'STALE_DOCUMENT_REVISION'",
  "'REVALIDATION_REQUIRED'",
  "'T7C_WORKBENCH_STATE_SCHEMA_INVALID'",
  "'T7C_WORKBENCH_LIFECYCLE_BINDING_REQUIRED'",
  "'T7C_WORKBENCH_LIFECYCLE_BINDING_STATUS_INVALID'",
  "'T7C_WORKBENCH_LIFECYCLE_BINDING_INCONSISTENT'",
  'workbenchStateIdentityHash',
]) {
  assert.equal(
    adapter.includes(required),
    true,
    `Missing fail-closed T7C adapter token: ${required}`,
  );
}

for (const required of [
  'const IMPORT_DOCUMENT_FACADES = new WeakMap();',
  'IMPORT_DOCUMENT_FACADES.set(this, importDocument)',
  'IMPORT_DOCUMENT_FACADES.get(this)',
  'IMPORT_DOCUMENT_FACADES.delete(this)',
  'compilationAttempt: retainedCompilationAttempt',
  'retainedCompilationAttempt: retainedCompilationAttempt',
]) {
  assert.equal(
    panel.includes(required),
    true,
    `Missing private-facade T7C panel token: ${required}`,
  );
}

for (const required of [
  "assert.equal(transferSource.units.moment, 'N·mm')",
  "geometryUnit(transfer.attempt.preview.compilation, 'moment'), 'N*mm'",
  "Object.prototype.hasOwnProperty.call(panel, 'importDocument')",
  "assert.equal('importDocument' in panel, false)",
  "'T7C_RETAINED_COMPILATION_ATTEMPT_IDENTITY_MISMATCH'",
  "'T7C_T7B_ATTEMPT_MUST_BE_FROZEN'",
  "'T7C_T7B_PREVIEW_MUST_BE_FROZEN'",
  "'T7C_WORKBENCH_STATE_SCHEMA_INVALID'",
  "'T7C_WORKBENCH_LIFECYCLE_BINDING_STATUS_INVALID'",
  "'T7C_WORKBENCH_LIFECYCLE_BINDING_INCONSISTENT'",
  'panel.wizard.selectTemplate',
  'preexistingLifecycleObserved: true',
  'perTemplateReceiptIsolation: true',
  'panelReceiptInvalidatedOnRecompile: true',
  'panelReceiptInvalidatedOnDraftMutation: true',
  'panelReceiptInvalidatedOnClear: true',
]) {
  assert.equal(
    behavior.includes(required),
    true,
    `Missing executable T7C evidence token: ${required}`,
  );
}

const fakeDocumentDeclaration = behavior.indexOf('class FakeDocument');
const firstFakeDocumentUse = behavior.indexOf('new FakeDocument()');
assert.notEqual(fakeDocumentDeclaration, -1);
assert.notEqual(firstFakeDocumentUse, -1);
assert.equal(
  fakeDocumentDeclaration < firstFakeDocumentUse,
  true,
  'Fake DOM classes must be initialized before T7C behavior execution.',
);

for (const forbiddenEvidence of [
  "transferSource.units.moment = 'N*mm'",
  "model.units.moment = 'N*mm'",
  "source.units.moment = 'N*mm'",
  'replaceAll(',
  'normalizeUnicode',
]) {
  assert.equal(
    behavior.includes(forbiddenEvidence),
    false,
    `Forbidden fixture-only T7C unit sanitization: ${forbiddenEvidence}`,
  );
}

assert.equal(
  occurrences(adapter, 'const returnedState = importDocument('),
  1,
  'T7C must have exactly one importDocument invocation path.',
);
assert.match(
  adapter,
  /importDocument\(\s*handoff\.stageSource,\s*handoff\.entryStageId,\s*\)/u,
);
assert.equal(occurrences(descriptor, 'controller.importDocument'), 1);
assert.equal(occurrences(production, 'controller.getState('), 0);
assert.equal(occurrences(production, 'sourceHash'), 0);
assert.equal(occurrences(panel, 'this.importDocument'), 0);
assert.equal(
  occurrences(panel, 'IMPORT_DOCUMENT_FACADES.set(this, importDocument)'),
  1,
);
assert.equal(occurrences(panel, 'IMPORT_DOCUMENT_FACADES.get(this)'), 1);
assert.equal(occurrences(panel, 'IMPORT_DOCUMENT_FACADES.delete(this)'), 1);

for (const forbidden of [
  '.run(',
  'executeLafeaStage(',
  'initializeLifecycle(',
  'applyLifecycleEvent(',
  'registerLifecycleArtifact(',
  'revalidateLifecycleBinding(',
  'setDisplayRenderPacket(',
  'bindLafeaWorkbenchDisplayRenderPacket(',
  'clearDisplayRenderPacket(',
  'registerLafeaArtifact(',
  'createTemplateReleaseRecord(',
]) {
  assert.equal(
    production.includes(forbidden),
    false,
    `Forbidden T7C authority path: ${forbidden}`,
  );
}

for (const forbiddenPath of [
  'package.json',
  '.github/workflows/',
  'src/core/',
  'src/workspace/lafea-workbench.js',
  'src/workspace/lafea-workbench-controller.js',
  'src/workspace/lafea-workbench-store.js',
  'src/workspace/lafea-lifecycle-workbench-store.js',
  'src/workspace/lafea-workbench-accessory-panels.js',
  'src/workspace/lafea-stage-registry.js',
  'src/workspace/lafea-lifecycle.js',
  'src/workspace/lafea-workbench-render-evidence.js',
  'src/workspace/lafea-templates/compilation-preview.js',
  'src/workspace/lafea-templates/compilation-preview-panel.js',
  'src/workspace/lafea-templates/compilation-preview-wizard.js',
  'src/workspace/lafea-templates/compilation-preview-accessory-panel.js',
  'src/workspace/lafea-templates/compilation-preview-workbench-registration.js',
  'src/workspace/lafea-templates/t7b-compilation-preview.js',
  'src/workspace/lafea-templates/parameter-draft.js',
  'src/workspace/lafea-templates/parameter-entry-panel.js',
  'src/workspace/lafea-templates/parameter-wizard.js',
]) {
  assert.equal(
    changed.some((path) => path === forbiddenPath || path.startsWith(forbiddenPath)),
    false,
    `Forbidden T7C write path: ${forbiddenPath}`,
  );
}

assert.match(publicSurface, /attemptLafeaTemplateWorkbenchImport/u);
assert.match(publicSurface, /mountLafeaT7cImportWorkbench/u);
assert.match(publicSurface, /LAFEA_T7C_IMPORT_WIZARD_ACTIONS/u);
assert.doesNotMatch(publicSurface, /LafeaT7bCompilationPreviewPanelController/u);

console.log(JSON.stringify({
  check: 'lafea-template-t7c-source-guard',
  status: 'PASS',
  additiveFiles: expected.length,
  modifiedExistingFiles: 0,
  agent1ProductionFilesModified: 0,
  historicalT6FilesModified: 0,
  t7aFilesModified: 0,
  t7bFilesModified: 0,
  importDocumentInvocationPaths: 1,
  importDocumentArgumentCount: 2,
  sourceHashArguments: 0,
  retainedAttemptIdentityRequired: true,
  privateFacadeStorage: true,
  rawImportFacadeProperties: 0,
  exactWorkbenchStateSchemaRequired: true,
  lifecycleBindingEvidenceRequired: true,
  observedLifecycleBindingRecorded: true,
  fakeDomInitializedBeforeUse: true,
  authoritativeUnicodeSourceRetained: true,
  canonicalAsciiResultConsumed: true,
  fixtureOnlySanitizationPaths: 0,
  getStateInvocationPaths: 0,
  engineExecutionPaths: 0,
  lifecycleInitializationPaths: 0,
  lifecycleRegistrationPaths: 0,
  resultDisplayBindingPaths: 0,
  releasePromotionPaths: 0,
}, null, 2));

function occurrences(source, token) {
  return source.split(token).length - 1;
}

function read(path) {
  return readFileSync(path, 'utf8');
}

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' });
}
