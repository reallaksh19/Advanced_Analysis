#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { sourceFixture as attachmentFixture } from './lafea.1-fixtures.mjs';
import { rawRequestFixture as screeningFixture } from './lafea.2-fixtures.mjs';
import { triangleSource as continuumFixture } from './lafea.3-fixtures.mjs';
import { triangleSource as shellFixture } from './lafea.4-fixtures.mjs';
import { workflowSource as trunnionFixture } from './lafea.5-fixtures.mjs';
import { requireLafeaLifecycleProfileForStage } from '../src/workspace/lafea-lifecycle-profiles.js';
import {
  LAFEA_STAGE_COMPOSITIONS,
  LAFEA_STAGE_COMPOSITION_SCHEMA,
  executeLafeaComposedStage,
  lafeaStageCompositionSummary,
  requireLafeaStageComposition,
} from '../src/workspace/lafea-stage-composition.js';
import {
  LAFEA_STAGE_IDS,
  LAFEA_STAGE_REGISTRY,
  LAFEA_STAGE_REGISTRY_SCHEMA,
  requireLafeaStageRegistryEntry,
} from '../src/workspace/lafea-stage-registry.js';
import { executeLafeaStage } from '../src/workspace/lafea-workbench-model.js';

const FIXTURES = Object.freeze({
  'LAFEA.1': attachmentFixture,
  'LAFEA.2': screeningFixture,
  'LAFEA.3': continuumFixture,
  'LAFEA.4': shellFixture,
  'LAFEA.5': trunnionFixture,
});

assert.equal(LAFEA_STAGE_REGISTRY_SCHEMA, 'lafea-stage-registry/v2');
assert.equal(LAFEA_STAGE_COMPOSITION_SCHEMA, 'lafea-stage-composition-root/v1');
assert.equal(LAFEA_STAGE_COMPOSITIONS.length, LAFEA_STAGE_REGISTRY.length);
assert.deepEqual(
  LAFEA_STAGE_COMPOSITIONS.map((row) => row.stageId),
  LAFEA_STAGE_IDS,
);

const authorityPaths = [];
const componentIds = [];
const benchmarkManifestIds = [];

for (const stageId of LAFEA_STAGE_IDS) {
  const registry = requireLafeaStageRegistryEntry(stageId);
  const composition = requireLafeaStageComposition(stageId);
  const summary = lafeaStageCompositionSummary(stageId);
  const profile = requireLafeaLifecycleProfileForStage(stageId);

  assert.equal(composition.schema, LAFEA_STAGE_COMPOSITION_SCHEMA);
  assert.equal(composition.authorityPathId, registry.authorityPathId);
  assert.deepEqual(composition.componentIds, registry.componentIds);
  assert.deepEqual(composition.benchmarkManifestIds, registry.benchmarkManifestIds);
  assert.equal(composition.lifecycleProfileId, registry.lifecycleProfileId);
  assert.equal(composition.lifecycleProfileId, profile.profileId);
  assert.deepEqual(composition.releaseStateBinding, registry.releaseStateBinding);
  assert.equal(composition.releaseStateBinding.state, 'RELEASE_NOT_QUALIFIED');
  assert.equal(composition.releaseStateBinding.automaticPromotion, false);
  assert.equal(summary.authorityPathId, composition.authorityPathId);
  assert.deepEqual(summary.componentIds, composition.componentIds);
  assert.equal('calculationExecutor' in summary, false);
  assert.equal('documentNormalizer' in summary, false);
  assert.ok(Object.isFrozen(composition));
  assert.ok(Object.isFrozen(summary));

  authorityPaths.push(composition.authorityPathId);
  componentIds.push(...Object.values(composition.componentIds));
  benchmarkManifestIds.push(...composition.benchmarkManifestIds);
}

assert.equal(new Set(authorityPaths).size, authorityPaths.length);
assert.equal(new Set(componentIds).size, componentIds.length);
assert.equal(new Set(benchmarkManifestIds).size, benchmarkManifestIds.length);

for (const [stageId, fixtureFactory] of Object.entries(FIXTURES)) {
  const source = fixtureFactory();
  const composed = executeLafeaComposedStage(stageId, source);
  const facade = executeLafeaStage(stageId, source);
  assert.deepEqual(facade, composed);
  assert.equal(composed.status, 'QUALIFIED');
  assert.equal(composed.authorityPathId, requireLafeaStageRegistryEntry(stageId).authorityPathId);
  assert.equal(composed.diagnostics.length, 0);
}

const weld = executeLafeaStage('LAFEA.6', {
  schema: 'lafea-weld-profile-placeholder/v1',
  identity: 'WELD-NOT-IMPLEMENTED',
});
assert.equal(weld.status, 'FAILED');
assert.equal(weld.authorityPathId, 'LAFEA.6/UNSUPPORTED/WELD_PROFILE_PLACEHOLDER/V1');
assert.equal(weld.diagnostics[0].code, 'UNSUPPORTED_STAGE_ENGINE_NOT_IMPLEMENTED');
assert.deepEqual(requireLafeaStageRegistryEntry('LAFEA.6').benchmarkManifestIds, []);

const registrySource = read('../src/workspace/lafea-stage-registry.js');
const compositionSource = read('../src/workspace/lafea-stage-composition.js');
const modelSource = read('../src/workspace/lafea-workbench-model.js');

assert.match(registrySource, /lafea-stage-registry\/v2/u);
assert.match(registrySource, /authorityPathId/u);
assert.match(registrySource, /benchmarkManifestIds/u);
assert.match(registrySource, /lifecycleProfileId/u);
assert.match(registrySource, /releaseStateBinding/u);
assert.match(compositionSource, /lafea-stage-composition-root\/v1/u);
assert.match(compositionSource, /requireLafeaLifecycleProfileForStage/u);
assert.doesNotMatch(compositionSource, /RELEASE_QUALIFIED/u);
assert.doesNotMatch(compositionSource, /registerLafeaArtifact|createLafeaLifecycleProducerBatch/u);
assert.match(modelSource, /from ['"]\.\/lafea-stage-composition\.js['"]/u);
assert.doesNotMatch(modelSource, /calculateLocal|createCanonicalLocal/u);
assert.doesNotMatch(modelSource, /if \(stageId === ['"]LAFEA\./u);

console.log(JSON.stringify({
  check: 'lafea-nb-t3-registry-composition',
  status: 'PASS',
  registrySchema: LAFEA_STAGE_REGISTRY_SCHEMA,
  compositionSchema: LAFEA_STAGE_COMPOSITION_SCHEMA,
  stageCount: LAFEA_STAGE_IDS.length,
  uniqueAuthorityPathCount: new Set(authorityPaths).size,
  componentIdCount: componentIds.length,
  benchmarkManifestIdCount: benchmarkManifestIds.length,
  lifecycleProfileBinding: true,
  releaseStateBinding: 'RELEASE_NOT_QUALIFIED',
  automaticReleasePromotion: false,
  workbenchDispatchOwnedByCompositionRoot: true,
  numericalAuthorityChanged: false,
  shellAuthorityChanged: false,
  lafea6Enabled: false,
}));

function read(relativePath) {
  return fs.readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}
