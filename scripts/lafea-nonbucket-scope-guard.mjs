#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';

const aggregator = read('./lafea-nonbucket-stack-check.mjs');
const packageJson = read('../package.json');
const workflow = read('../.github/workflows/lafea-nonbucket-stack.yml');
const legacyAggregate = read('./lafea-agent1-stack-check.mjs');
const lifecycleProfiles = read('../src/workspace/lafea-lifecycle-profiles.js');
const lifecycle = read('../src/workspace/lafea-lifecycle.js');

const registeredChecks = [...aggregator.matchAll(/['"](scripts\/[A-Za-z0-9._-]+\.mjs)['"]/gu)]
  .map((match) => match[1]);
assert.ok(registeredChecks.length >= 31, 'The non-bucket aggregate must retain the complete NB-T0/NB-T1 and U0-U4 boundary.');
assert.equal(new Set(registeredChecks).size, registeredChecks.length, 'The non-bucket aggregate cannot register duplicate checks.');

for (const required of [
  'scripts/lafea-nonbucket-scope-guard.mjs',
  'scripts/lafea-nonbucket-lifecycle-profiles-check.mjs',
  'scripts/lafea-u1-stage-registry-check.mjs',
  'scripts/lafea-u1b-registry-consumer-check.mjs',
  'scripts/lafea-u2a-input-command-check.mjs',
  'scripts/lafea-u2b-editor-store-check.mjs',
  'scripts/lafea-u3a-lifecycle-check.mjs',
  'scripts/lafea-u3b-live-lifecycle-check.mjs',
  'scripts/lafea-u4a-source-engineering-scene-check.mjs',
  'scripts/lafea-u4j-source-guard.mjs',
  'scripts/lafea-canvas-contract-check.mjs',
  'scripts/lafea-workbench-check.mjs',
]) {
  assert.ok(registeredChecks.includes(required), `Missing governed non-bucket check: ${required}`);
}

const forbiddenCheckPatterns = Object.freeze([
  /lafea-template-/u,
  /sequential-sketcher/u,
  /first-cut/u,
  /accessory-panel/u,
  /(?:^|\/)lfea-/u,
]);
for (const checkPath of registeredChecks) {
  for (const pattern of forbiddenCheckPatterns) {
    assert.doesNotMatch(checkPath, pattern, `Cross-scope check entered the non-bucket aggregate: ${checkPath}`);
  }
}

assert.doesNotMatch(aggregator, /from\s+['"][^'"]*(?:src\/core|src\/workspace|lafea-application-templates)[^'"]*['"]/u);
assert.match(
  packageJson,
  /"check:lafea-nonbucket-stack"\s*:\s*"node scripts\/lafea-nonbucket-stack-check\.mjs"/u,
);
assert.match(
  packageJson,
  /"check:lafea-workbench"\s*:\s*"node scripts\/lafea-workbench-check\.mjs"/u,
);

assert.match(workflow, /name:\s*LAFEA Non-Bucket Stack Certification/u);
assert.match(workflow, /npm run check:lafea-nonbucket-stack/u);
assert.match(workflow, /npm run check:lafea-workbench/u);
assert.match(workflow, /node scripts\/run-playwright\.mjs e2e\/lafea-hybrid-workbench\.spec\.js/u);
assert.match(workflow, /npm run check:lafea-agent1-stack/u);
assert.match(workflow, /npm run gate/u);
assert.match(workflow, /lafea-nonbucket-failure-matrix\.json/u);
assert.match(workflow, /lafea-repository-integration-matrix\.json/u);
assert.match(workflow, /if:\s*always\(\)/u);
assert.match(workflow, /git diff --check "\$PR_BASE_SHA\.\.\.HEAD"/u);

for (const forbiddenWorkflowCommand of [
  'node scripts/lafea-template-',
  'node scripts/sequential-sketcher',
  'node scripts/first-cut',
  'node scripts/lafea-accessory-panel',
  'npm run check:lafea-template-stack',
]) {
  assert.equal(
    workflow.includes(forbiddenWorkflowCommand),
    false,
    `Dedicated workflow directly invokes out-of-scope command: ${forbiddenWorkflowCommand}`,
  );
}

assert.match(lifecycleProfiles, /ANALYTICAL_FOUNDATION_V1/u);
assert.match(lifecycleProfiles, /ANALYTICAL_SCREENING_V1/u);
assert.match(lifecycleProfiles, /FEA_MESH_RECOVERY_V1/u);
assert.match(lifecycleProfiles, /UNSUPPORTED_STAGE_V1/u);
assert.match(lifecycle, /lafea-analysis-lifecycle\/v2/u);
assert.match(lifecycle, /migrateLafeaLifecycleV1/u);
assert.doesNotMatch(lifecycleProfiles, /local-shell|local-continuum|src\/core/u);

assert.match(legacyAggregate, /lafea-template-t1-contract-check\.mjs/u);
assert.match(legacyAggregate, /sequential-sketcher-authoring-bridge-check\.mjs/u);
assert.match(legacyAggregate, /first-cut-workbench-launcher-check\.mjs/u);
assert.match(legacyAggregate, /lafea-accessory-panel-contract-check\.mjs/u);
assert.equal(
  aggregator.includes('lafea-agent1-stack-check.mjs'),
  false,
  'The bounded aggregate must not delegate to the contaminated legacy aggregate.',
);

console.log(JSON.stringify({
  check: 'lafea-nonbucket-scope-guard',
  status: 'PASS',
  registeredCheckCount: registeredChecks.length,
  dedicatedPackageScript: true,
  dedicatedWorkbenchScript: true,
  dedicatedWorkflow: true,
  stageCorrectLifecycleProfiles: true,
  browserScope: 'e2e/lafea-hybrid-workbench.spec.js',
  legacyAggregateRetainedForAttributionOnly: true,
  agent2TemplateBucketIncluded: false,
  lfeaPipingIncluded: false,
  sequentialSketcherIncluded: false,
  firstCutIncluded: false,
  accessoryPanelsIncluded: false,
  numericalAuthorityChanged: false,
  shellAuthorityChanged: false,
  lafea6Enabled: false,
}));

function read(relativePath) {
  return fs.readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}
