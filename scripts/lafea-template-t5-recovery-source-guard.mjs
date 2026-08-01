#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const baseIndex = process.argv.indexOf('--base');
const base = baseIndex === -1 ? process.env.PR_BASE_SHA : process.argv[baseIndex + 1];
if (!base) {
  throw new TypeError(
    'Usage: node scripts/lafea-template-t5-recovery-source-guard.mjs --base <sha>',
  );
}

const expected = [
  '.github/workflows/lafea-template-t5-controlled-reference-recovery.yml',
  'scripts/lafea-template-t5-controlled-reference-adjudication.mjs',
  'scripts/lafea-template-t5-recovery-source-guard.mjs',
  'src/core/lafea-application-templates/compilers/analytical/pipe-section-combined.js',
].sort();
const changed = git(['diff', '--name-only', `${base}...HEAD`])
  .trim().split('\n').filter(Boolean).sort();
assert.deepEqual(changed, expected);

const statuses = git(['diff', '--name-status', `${base}...HEAD`])
  .trim().split('\n').filter(Boolean);
assert.equal(
  statuses.filter((line) => line.startsWith('M\t')).length,
  1,
  'Exactly one production compiler file may be modified.',
);
assert.equal(
  statuses.filter((line) => line.startsWith('A\t')).length,
  3,
  'Exactly three additive certification files are required.',
);

const compiler = read(
  'src/core/lafea-application-templates/compilers/analytical/pipe-section-combined.js',
);
const adjudication = read(
  'scripts/lafea-template-t5-controlled-reference-adjudication.mjs',
);
const controlledReference = read(
  'src/core/lafea-application-templates/benchmark-fixtures/t5-controlled-reference.js',
);
const workflow = read(
  '.github/workflows/lafea-template-t5-controlled-reference-recovery.yml',
);

for (const required of [
  "kind: 'RETAINED_MECHANICAL_RESULTANT_FACTOR'",
  "kind: 'RETAINED_PRESSURE_DEFINITION_FACTOR'",
  'screeningCase.pressureDefinitionId',
  'screeningCase.pressureFactor',
  'screeningCase.sourceReference',
  'projectT3ResultUnits(foundationModel.units)',
  'T3_RESULT_UNIT_PROJECTION_POLICY_ID',
]) {
  assert.equal(compiler.includes(required), true, `Missing compiler token: ${required}`);
}
for (const forbidden of [
  "kind: 'REFERENCED_FOUNDATION_LOAD_CASE'",
  'term.pressureDefinitionId',
  'term.sourceReference',
  'executeLafeaStage',
  'initializeLifecycle',
  'registerLifecycleArtifact',
  'applyLifecycleEvent',
  'registerDisplayPacket',
  'setDisplayPacket',
  'releasePromotion: true',
]) {
  assert.equal(compiler.includes(forbidden), false, `Forbidden compiler token: ${forbidden}`);
}

assert.equal(
  controlledReference.includes('"expectedResultHash": "fnv1a64:94de6d2af6543bf7"'),
  true,
  'The retained T5 expected hash must remain unchanged.',
);
assert.equal(
  controlledReference.includes('"RETAINED_MECHANICAL_RESULTANT_FACTOR"'),
  true,
);
assert.equal(
  controlledReference.includes('"RETAINED_PRESSURE_DEFINITION_FACTOR"'),
  true,
);

for (const required of [
  'requireT5CompilerReferenceCase',
  'rawRequestFixture',
  'semanticHash(independentlyDerivedProjection)',
  "gitShow(`${T5_REFERENCE_COMMIT}:${COMPILER_PATH}`)",
  "gitShow(`${UNIT_PROJECTION_COMMIT}:${COMPILER_PATH}`)",
  'controlledReferenceChanged: false',
  'engineExecutionPaths: 0',
  'releaseAuthorityChanged: false',
]) {
  assert.equal(adjudication.includes(required), true, `Missing adjudication token: ${required}`);
}

for (const required of [
  'fetch-depth: 0',
  'npm ci',
  'node scripts/lafea-template-t5-controlled-reference-adjudication.mjs',
  'node scripts/lafea-template-t5-recovery-source-guard.mjs --base "$PR_BASE_SHA"',
  'npm run check:lafea-template-stack',
  'npm run syntax:strict',
  'npm run check:imports',
  'npm run build',
  'git diff --check "$PR_BASE_SHA...HEAD"',
  'actions/upload-artifact@v4',
]) {
  assert.equal(workflow.includes(required), true, `Missing workflow token: ${required}`);
}

for (const forbiddenPath of [
  'src/core/lafea-application-templates/benchmark-fixtures/',
  'src/core/lafea-application-templates/benchmark-manifests/',
  'src/core/lafea-application-templates/contracts.js',
  'src/core/lafea-application-templates/template-registry.js',
  'src/core/lafea-application-templates/bucket-registry.js',
  'src/core/local-attachment-screening/',
  'src/core/local-stress/',
  'src/core/local-continuum/',
  'src/workspace/',
  'package.json',
  'package-lock.json',
]) {
  assert.equal(
    changed.some((path) => path === forbiddenPath || path.startsWith(forbiddenPath)),
    false,
    `Forbidden recovery path changed: ${forbiddenPath}`,
  );
}

console.log(JSON.stringify({
  check: 'lafea-template-t5-recovery-source-guard',
  status: 'PASS',
  base,
  changedFiles: changed.length,
  productionCompilerFilesModified: 1,
  additiveCertificationFiles: 3,
  controlledReferenceFilesModified: 0,
  benchmarkManifestFilesModified: 0,
  screeningAuthorityFilesModified: 0,
  numericalEngineFilesModified: 0,
  workspaceFilesModified: 0,
  engineExecutionAuthorityChanged: false,
  lifecycleAuthorityChanged: false,
  resultBindingAuthorityChanged: false,
  releaseAuthorityChanged: false,
  t7dAuthorized: false,
}, null, 2));

function read(path) {
  return readFileSync(path, 'utf8');
}

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' });
}
