#!/usr/bin/env node
import assert from 'node:assert/strict';
import * as hash from '../src/workspace/lafea-canonical-sha256.js';
import * as lifecycle from '../src/workspace/lafea-lifecycle.js';
import * as producers from '../src/workspace/lafea-lifecycle-producers.js';
import * as profiles from '../src/workspace/lafea-lifecycle-profiles.js';
import * as registry from '../src/workspace/lafea-stage-registry.js';
import * as sourceAuthority from '../src/workspace/lafea-source-authority.js';
import * as store from '../src/workspace/lafea-lifecycle-workbench-store.js';
import * as publicApi from '../src/workspace/lafea-workbench.js';

const groups = Object.freeze([
  [registry, [
    'LAFEA_ENGINE_STATES', 'LAFEA_PREVIEW_POLICIES',
    'LAFEA_STAGE_CATEGORIES', 'LAFEA_STAGE_DEFINITIONS',
    'LAFEA_STAGE_IDS', 'LAFEA_STAGE_REGISTRY', 'LAFEA_STAGE_REGISTRY_SCHEMA',
    'lafeaRegisteredCollectionPaths', 'lafeaRegisteredExecutionSupported',
    'lafeaRegisteredPreviewSource', 'requireLafeaStageRegistryEntry',
  ]],
  [lifecycle, [
    'LAFEA_ARTIFACT_KINDS', 'LAFEA_ARTIFACT_RECORD_SCHEMA',
    'LAFEA_ARTIFACT_STATUSES', 'LAFEA_ARTIFACT_REGISTRATION_SCHEMA',
    'LAFEA_LEGACY_ARTIFACT_KINDS', 'LAFEA_LEGACY_ARTIFACT_RECORD_SCHEMA',
    'LAFEA_LEGACY_ARTIFACT_REGISTRATION_SCHEMA', 'LAFEA_LEGACY_LIFECYCLE_SCHEMA',
    'LAFEA_LIFECYCLE_CHANGE_CLASSES', 'LAFEA_LIFECYCLE_EVENT_SCHEMA',
    'LAFEA_LIFECYCLE_SCHEMA', 'LAFEA_QUALIFICATION_STATES',
    'applyLafeaLifecycleEvent', 'createLafeaArtifactRecord', 'createLafeaLifecycle',
    'createLafeaLifecycleEvent', 'lafeaLifecycleReadiness',
    'migrateLafeaLifecycleV1', 'registerLafeaArtifact',
  ]],
  [profiles, [
    'LAFEA_LIFECYCLE_PROFILE_IDS', 'LAFEA_LIFECYCLE_PROFILE_SCHEMA',
    'LAFEA_LIFECYCLE_PROFILES', 'LAFEA_STAGE_LIFECYCLE_PROFILE_IDS',
    'lafeaLifecycleArtifactKinds', 'requireLafeaLifecycleArtifactDefinition',
    'requireLafeaLifecycleProfile', 'requireLafeaLifecycleProfileForStage',
  ]],
  [hash, [
    'LAFEA_CANONICAL_SHA256_PROFILE', 'canonicalLafeaJson', 'canonicalLafeaSha256',
  ]],
  [sourceAuthority, [
    'LAFEA_SOURCE_AUTHORITY_EVENT_SCHEMA', 'LAFEA_SOURCE_AUTHORITY_ROLE',
    'LAFEA_SOURCE_AUTHORITY_SCHEMA', 'createLafeaSourceAuthorityEvent',
    'issueLafeaSourceAuthority', 'sourceAuthorityDocument',
    'validateLafeaSourceAuthority', 'validateLafeaSourceAuthorityEvent',
  ]],
  [producers, [
    'LAFEA_PRODUCER_BATCH_SCHEMA', 'LAFEA_PRODUCER_REVISION',
    'createLafeaLifecycleProducerBatch', 'registerLafeaLifecycleProducerBatch',
  ]],
  [store, [
    'LAFEA_CALCULATION_STATES', 'LAFEA_CODE_STATES',
    'LAFEA_LIFECYCLE_BINDING_SCHEMA', 'LAFEA_LIFECYCLE_BINDING_STATUSES',
    'LAFEA_RELEASE_STATES', 'LAFEA_RESULT_STATES',
    'LAFEA_WORKBENCH_STATE_SCHEMA', 'createLafeaWorkbenchStore',
  ]],
]);

const exported = [];
for (const [module, names] of groups) {
  for (const name of names) {
    assert.ok(name in module, `Authority module is missing ${name}.`);
    assert.ok(name in publicApi, `Public workbench surface is missing ${name}.`);
    assert.strictEqual(publicApi[name], module[name], `${name} must be re-exported without wrapping.`);
    exported.push(name);
  }
}

assert.equal(publicApi.LAFEA_STAGE_REGISTRY_SCHEMA, 'lafea-stage-registry/v2');
const continuumRegistry = publicApi.requireLafeaStageRegistryEntry('LAFEA.3');
assert.equal(continuumRegistry.authorityPathId,
  'LAFEA.3/CURRENT_CORE/T3_T6_Q8_CONTINUUM/V1');
assert.equal(continuumRegistry.lifecycleProfileId, 'FEA_MESH_RECOVERY_V1');
assert.equal(continuumRegistry.benchmarkManifestIds.length, 1);
assert.equal(continuumRegistry.releaseStateBinding.state, 'RELEASE_NOT_QUALIFIED');
assert.equal(continuumRegistry.releaseStateBinding.automaticPromotion, false);
assert.equal(Object.keys(continuumRegistry.componentIds).length, 6);

assert.equal(publicApi.LAFEA_LIFECYCLE_SCHEMA, 'lafea-analysis-lifecycle/v2');
assert.equal(publicApi.LAFEA_SOURCE_AUTHORITY_SCHEMA, 'lafea-source-authority/v1');
assert.equal(publicApi.LAFEA_PRODUCER_BATCH_SCHEMA, 'lafea-lifecycle-producer-batch/v1');
assert.equal(publicApi.LAFEA_WORKBENCH_STATE_SCHEMA, 'lafea-workbench-state/v2');
assert.deepEqual(publicApi.lafeaLifecycleArtifactKinds('LAFEA.1'), [
  'CANONICAL_MODEL', 'EXECUTION', 'RESULT_EVIDENCE', 'REPORT_EVIDENCE',
]);
assert.deepEqual(publicApi.lafeaLifecycleArtifactKinds('LAFEA.6'), []);

console.log(JSON.stringify({
  check: 'lafea-u3a-public-surface',
  status: 'PASS',
  exportedContracts: exported,
  registryV2Public: true,
  registryAuthorityPathsPublic: true,
  registryComponentIdsPublic: true,
  registryBenchmarkManifestIdsPublic: true,
  registryLifecycleAndReleaseBindingsPublic: true,
  sourceAuthorityPublic: true,
  producerAdaptersPublic: true,
  calculationResultCodeReleaseStatesPublic: true,
  stageCorrectProfilesPublic: true,
  registryV2Implemented: true,
}));
