#!/usr/bin/env node

import assert from 'node:assert/strict';
import { sourceFixture as attachmentFixture } from './lafea.1-fixtures.mjs';
import { rawRequestFixture as screeningFixture } from './lafea.2-fixtures.mjs';
import { triangleSource as continuumFixture } from './lafea.3-fixtures.mjs';
import { triangleSource as shellFixture } from './lafea.4-fixtures.mjs';
import { workflowSource as trunnionFixture } from './lafea.5-fixtures.mjs';
import {
  LAFEA_STAGE_REGISTRY,
  LAFEA_STAGE_REGISTRY_SCHEMA,
} from '../src/workspace/lafea-stage-registry.js';
import {
  LAFEA_TECHNICAL_COMPONENT_KINDS,
  LAFEA_STAGE_COMPOSITION_BINDINGS,
} from '../src/workspace/lafea-stage-composition-bindings.js';
import {
  lafeaTechnicalComponentRegistered,
} from '../src/workspace/lafea-stage-components.js';
import {
  LAFEA_STAGE_COMPOSITION_SCHEMA,
  requireLafeaStageComposition,
} from '../src/workspace/lafea-stage-composition-root.js';
import {
  requireLafeaLifecycleProfileForStage,
} from '../src/workspace/lafea-lifecycle-profiles.js';
import {
  executeLafeaStage,
  normalizeLafeaStageDocument,
} from '../src/workspace/lafea-workbench-model.js';

const FIXTURES = Object.freeze({
  'LAFEA.1': attachmentFixture,
  'LAFEA.2': screeningFixture,
  'LAFEA.3': continuumFixture,
  'LAFEA.4': shellFixture,
  'LAFEA.5': trunnionFixture,
  'LAFEA.6': () => ({
    schema: 'lafea-weld-profile-placeholder/v1',
    identity: 'WELD-NOT-IMPLEMENTED',
  }),
});

assert.equal(LAFEA_STAGE_REGISTRY_SCHEMA, 'lafea-stage-registry/v2');
assert.equal(LAFEA_STAGE_COMPOSITION_BINDINGS.length, LAFEA_STAGE_REGISTRY.length);
assert.equal(new Set(LAFEA_STAGE_COMPOSITION_BINDINGS
  .map((row) => row.compositionRootId)).size, LAFEA_STAGE_REGISTRY.length);

for (const entry of LAFEA_STAGE_REGISTRY) {
  const composition = requireLafeaStageComposition(entry.stageId);
  const profile = requireLafeaLifecycleProfileForStage(entry.stageId);
  assert.equal(composition.schema, LAFEA_STAGE_COMPOSITION_SCHEMA);
  assert.equal(composition.registryEntry, entry);
  assert.equal(composition.lifecycleProfileId, profile.profileId);
  assert.equal(composition.releaseStateBinding, 'RELEASE_NOT_QUALIFIED');
  assert.equal(composition.compositionRootId, entry.composition.compositionRootId);
  assert.deepEqual(composition.benchmarkManifestIds,
    entry.composition.benchmarkManifestIds);
  assert.ok(Object.isFrozen(composition));
  assert.ok(Object.isFrozen(composition.benchmarkManifestIds));
  assertComponents(entry);
}

for (const stageId of ['LAFEA.1', 'LAFEA.2', 'LAFEA.3', 'LAFEA.4', 'LAFEA.5']) {
  const source = FIXTURES[stageId]();
  const normalized = normalizeLafeaStageDocument(stageId, source);
  const result = executeLafeaStage(stageId, normalized);
  const composition = requireLafeaStageComposition(stageId);
  assert.equal(composition.executionSupported, true);
  assert.equal(typeof composition.calculate, 'function');
  assert.equal(typeof composition.presentResult, 'function');
  assert.equal(result.status, 'QUALIFIED', `${stageId} retained route must remain qualified.`);
  assert.equal(result.stageId, stageId);
}

for (const stageId of ['LAFEA.1', 'LAFEA.2']) {
  const composition = requireLafeaStageComposition(stageId);
  assert.equal(composition.productAssessmentSupported, true);
  assert.equal(composition.handoffSupported, true);
  assert.equal(typeof composition.evaluateProductAssessment, 'function');
  assert.equal(typeof composition.createHandoff, 'function');
}
for (const stageId of ['LAFEA.3', 'LAFEA.4', 'LAFEA.5', 'LAFEA.6']) {
  const composition = requireLafeaStageComposition(stageId);
  assert.equal(composition.productAssessmentSupported, false);
  assert.equal(composition.handoffSupported, false);
  assert.equal(composition.evaluateProductAssessment, null);
  assert.equal(composition.createHandoff, null);
}

const unsupportedComposition = requireLafeaStageComposition('LAFEA.6');
assert.equal(unsupportedComposition.executionSupported, false);
assert.equal(unsupportedComposition.calculate, null);
assert.equal(unsupportedComposition.presentResult, null);
assert.equal(unsupportedComposition.releaseStateBinding, 'RELEASE_NOT_QUALIFIED');
const unsupportedResult = executeLafeaStage('LAFEA.6', FIXTURES['LAFEA.6']());
assert.equal(unsupportedResult.status, 'FAILED');
assert.equal(unsupportedResult.diagnostics[0].code,
  'UNSUPPORTED_STAGE_ENGINE_NOT_IMPLEMENTED');

assert.deepEqual(requireLafeaStageComposition('LAFEA.3').benchmarkManifestIds, [
  'CONT-PATCH-01', 'CONT-CYL-01', 'CONT-HOLE-01',
]);
assert.deepEqual(requireLafeaStageComposition('LAFEA.4').benchmarkManifestIds, [
  'SHELL-PATCH-01', 'SHELL-BEND-01',
]);
for (const stageId of ['LAFEA.1', 'LAFEA.2', 'LAFEA.5', 'LAFEA.6']) {
  const composition = requireLafeaStageComposition(stageId);
  assert.deepEqual(composition.benchmarkManifestIds, []);
  assert.equal(composition.benchmarkBindingState,
    'NO_GOVERNED_MANIFEST_REGISTERED');
}

console.log(JSON.stringify({
  check: 'lafea-nb-t3-registry-v2-composition-root',
  status: 'PASS',
  registrySchema: LAFEA_STAGE_REGISTRY_SCHEMA,
  stageCount: LAFEA_STAGE_REGISTRY.length,
  compositionRootCount: LAFEA_STAGE_COMPOSITION_BINDINGS.length,
  retainedQualifiedRoutes: 5,
  analyticalProductRoutes: ['LAFEA.1', 'LAFEA.2'],
  unsupportedStages: ['LAFEA.6'],
  benchmarkManifestBindings: {
    'LAFEA.3': ['CONT-PATCH-01', 'CONT-CYL-01', 'CONT-HOLE-01'],
    'LAFEA.4': ['SHELL-PATCH-01', 'SHELL-BEND-01'],
  },
  releaseStateBinding: 'RELEASE_NOT_QUALIFIED',
  duplicateRuntimeDispatchMaps: false,
  numericalAuthorityChanged: false,
  shellAuthorityChanged: false,
  codeAuthorityPromoted: false,
  releaseQualified: false,
  lafea6Enabled: false,
}));

function assertComponents(entry) {
  const componentIds = entry.composition.componentIds;
  const kindsByKey = Object.freeze({
    normalizer: 'NORMALIZER',
    canonicalizer: 'CANONICALIZER',
    calculator: 'CALCULATOR',
    acceptance: 'ACCEPTANCE',
    presenter: 'PRESENTER',
    unitResolver: 'UNIT_RESOLVER',
    productAssessment: 'PRODUCT_ASSESSMENT',
    handoff: 'HANDOFF',
  });
  assert.deepEqual(Object.values(kindsByKey), LAFEA_TECHNICAL_COMPONENT_KINDS);
  for (const [key, kind] of Object.entries(kindsByKey)) {
    const componentId = componentIds[key];
    if (componentId === null) {
      if (['productAssessment', 'handoff'].includes(key)) continue;
      assert.equal(entry.engineState, 'ENGINE_NOT_IMPLEMENTED');
      continue;
    }
    assert.equal(lafeaTechnicalComponentRegistered(kind, componentId), true,
      `${entry.stageId} ${key} must resolve to one technical component.`);
  }
}
