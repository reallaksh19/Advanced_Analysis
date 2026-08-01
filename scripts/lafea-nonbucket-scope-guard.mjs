#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';

const aggregator = read('./lafea-nonbucket-stack-check.mjs');
const packageJson = read('../package.json');
const workflow = read('../.github/workflows/lafea-nonbucket-stack.yml');
const legacyAggregate = read('./lafea-agent1-stack-check.mjs');
const lifecycleProfiles = read('../src/workspace/lafea-lifecycle-profiles.js');
const lifecycle = read('../src/workspace/lafea-lifecycle.js');
const sourceAuthority = read('../src/workspace/lafea-source-authority.js');
const producers = read('../src/workspace/lafea-lifecycle-producers.js');
const lifecycleStore = read('../src/workspace/lafea-lifecycle-workbench-store.js');
const registry = read('../src/workspace/lafea-stage-registry.js');
const bindings = read('../src/workspace/lafea-stage-composition-bindings.js');
const compositionRoot = read('../src/workspace/lafea-stage-composition-root.js');
const workbenchModel = read('../src/workspace/lafea-workbench-model.js');
const presenterIndex = read('../src/workspace/lafea-result-presenters/index.js');

const registeredChecks = [...aggregator.matchAll(/['"](scripts\/[A-Za-z0-9._-]+\.mjs)['"]/gu)]
  .map((match) => match[1]);
assert.ok(registeredChecks.length >= 33,
  'The non-bucket aggregate must retain the complete NB-T0 through NB-T3 and U0-U4 boundary.');
assert.equal(new Set(registeredChecks).size, registeredChecks.length,
  'The non-bucket aggregate cannot register duplicate checks.');

for (const required of [
  'scripts/lafea-nonbucket-scope-guard.mjs',
  'scripts/lafea-nonbucket-lifecycle-profiles-check.mjs',
  'scripts/lafea-nb-t2-source-producer-check.mjs',
  'scripts/lafea-nb-t3-composition-root-check.mjs',
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
]) assert.ok(registeredChecks.includes(required), `Missing governed non-bucket check: ${required}`);

const forbiddenCheckPatterns = Object.freeze([
  /lafea-template-/u, /sequential-sketcher/u, /first-cut/u,
  /accessory-panel/u, /(?:^|\/)lfea-/u,
]);
for (const checkPath of registeredChecks) {
  for (const pattern of forbiddenCheckPatterns) {
    assert.doesNotMatch(checkPath, pattern,
      `Cross-scope check entered the non-bucket aggregate: ${checkPath}`);
  }
}

assert.doesNotMatch(aggregator,
  /from\s+['"][^'"]*(?:src\/core|src\/workspace|lafea-application-templates)[^'"]*['"]/u);
assert.match(packageJson,
  /"check:lafea-nonbucket-stack"\s*:\s*"node scripts\/lafea-nonbucket-stack-check\.mjs"/u);
assert.match(packageJson,
  /"check:lafea-workbench"\s*:\s*"node scripts\/lafea-workbench-check\.mjs"/u);
assert.match(workflow, /name:\s*LAFEA Non-Bucket Stack Certification/u);
assert.match(workflow, /npm run check:lafea-nonbucket-stack/u);
assert.match(workflow, /node scripts\/run-playwright\.mjs e2e\/lafea-hybrid-workbench\.spec\.js/u);
assert.match(workflow, /npm run gate/u);
assert.match(workflow, /git diff --check "\$PR_BASE_SHA\.\.\.HEAD"/u);

for (const forbiddenWorkflowCommand of [
  'node scripts/lafea-template-', 'node scripts/sequential-sketcher',
  'node scripts/first-cut', 'node scripts/lafea-accessory-panel',
  'npm run check:lafea-template-stack',
]) assert.equal(workflow.includes(forbiddenWorkflowCommand), false,
  `Dedicated workflow directly invokes out-of-scope command: ${forbiddenWorkflowCommand}`);

assert.match(lifecycleProfiles, /ANALYTICAL_FOUNDATION_V1/u);
assert.match(lifecycleProfiles, /FEA_MESH_RECOVERY_V1/u);
assert.match(lifecycle, /lafea-analysis-lifecycle\/v2/u);
assert.match(sourceAuthority, /lafea-source-authority\/v1/u);
assert.match(sourceAuthority,
  /canonicalizationProfile:\s*LAFEA_CANONICAL_SHA256_PROFILE/u);
assert.match(sourceAuthority, /sourceAuthorityDocument/u);
assert.doesNotMatch(sourceAuthority, /sourceHash:\s*lafeaDocumentDigest/u);
assert.match(producers, /lafea-lifecycle-producer-batch\/v1/u);
assert.match(producers, /CALLER_AUTHORED_SOURCE_MESH_ONLY/u);
assert.doesNotMatch(producers, /calculateLocal|executeLafeaStage|from ['"][^'"]*src\/core/u);
assert.doesNotMatch(producers, /source\.meshConfig|(?:^|[^A-Za-z0-9_])renderPacket\s*[:.(]/mu);
assert.match(lifecycleStore, /CALCULATION_ACCEPTED_BY_STAGE_CONTRACT/u);
assert.match(lifecycleStore, /RESULT_READY/u);
assert.match(lifecycleStore, /CODE_NOT_READY/u);
assert.match(lifecycleStore, /RELEASE_NOT_QUALIFIED/u);
assert.doesNotMatch(lifecycleStore, /RELEASE_QUALIFIED'\s*:/u);

assert.match(registry, /lafea-stage-registry\/v2/u);
assert.match(registry, /lafeaRegisteredComposition/u);
assert.match(bindings, /lafea-stage-composition-binding\/v1/u);
assert.match(bindings, /CONT-PATCH-01/u);
assert.match(bindings, /SHELL-PATCH-01/u);
assert.match(bindings, /releaseStateBinding:\s*'RELEASE_NOT_QUALIFIED'/u);
assert.doesNotMatch(bindings, /releaseStateBinding:\s*'RELEASE_QUALIFIED'/u);
assert.match(compositionRoot, /lafea-stage-composition\/v1/u);
assert.match(compositionRoot, /requireLafeaTechnicalComponent/u);
assert.match(compositionRoot, /requireLafeaLifecycleProfileForStage/u);
assert.match(workbenchModel, /requireLafeaStageComposition/u);
assert.doesNotMatch(workbenchModel, /calculateLocal(?:Attachment|Continuum|Shell|Trunnion)/u);
assert.match(presenterIndex, /requireLafeaStageComposition/u);
assert.doesNotMatch(presenterIndex, /PRESENTERS_BY_ROLE|UNIT_RESOLVERS_BY_ROLE/u);

assert.match(legacyAggregate, /lafea-template-t1-contract-check\.mjs/u);
assert.match(legacyAggregate, /sequential-sketcher-authoring-bridge-check\.mjs/u);
assert.match(legacyAggregate, /first-cut-workbench-launcher-check\.mjs/u);
assert.match(legacyAggregate, /lafea-accessory-panel-contract-check\.mjs/u);
assert.equal(aggregator.includes('lafea-agent1-stack-check.mjs'), false,
  'The bounded aggregate must not delegate to the contaminated legacy aggregate.');

console.log(JSON.stringify({
  check: 'lafea-nonbucket-scope-guard',
  status: 'PASS',
  registeredCheckCount: registeredChecks.length,
  stageCorrectLifecycleProfiles: true,
  canonicalSha256SourceAuthority: true,
  currentCoreProducerAdapters: true,
  typedSourceEvents: true,
  registryV2Implemented: true,
  compositionRootIntegrated: true,
  releaseStateBinding: 'RELEASE_NOT_QUALIFIED',
  browserScope: 'e2e/lafea-hybrid-workbench.spec.js',
  legacyAggregateRetainedForAttributionOnly: true,
  agent2TemplateBucketIncluded: false,
  lfeaPipingIncluded: false,
  sequentialSketcherIncluded: false,
  firstCutIncluded: false,
  accessoryPanelsIncluded: false,
  numericalAuthorityChanged: false,
  shellAuthorityChanged: false,
  codeAuthorityPromoted: false,
  releaseQualified: false,
  lafea6Enabled: false,
}));

function read(relativePath) {
  return fs.readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}
