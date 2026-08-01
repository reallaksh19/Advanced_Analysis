#!/usr/bin/env node
import assert from 'node:assert/strict';
import * as analyticalHandoff from '../src/core/lafea-analytical-handoff.js';
import * as screeningProduct from '../src/core/local-attachment-screening/index.js';
import * as foundationProduct from '../src/core/local-stress/index.js';
import * as foundationHandoff from '../src/core/local-stress/finite-footprint-handoff.js';
import * as compositionBindings from '../src/workspace/lafea-stage-composition-bindings.js';
import * as compositionRoot from '../src/workspace/lafea-stage-composition-root.js';
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
    'LAFEA_STAGE_REGISTRY', 'LAFEA_STAGE_REGISTRY_SCHEMA',
    'lafeaRegisteredComposition', 'requireLafeaStageRegistryEntry',
  ]],
  [compositionBindings, [
    'LAFEA_BENCHMARK_BINDING_STATES', 'LAFEA_RELEASE_STATE_BINDINGS',
    'LAFEA_STAGE_COMPOSITION_BINDINGS', 'LAFEA_STAGE_COMPOSITION_BINDING_SCHEMA',
    'LAFEA_TECHNICAL_COMPONENT_IDS', 'LAFEA_TECHNICAL_COMPONENT_KINDS',
    'requireLafeaStageCompositionBinding',
  ]],
  [compositionRoot, [
    'LAFEA_STAGE_COMPOSITION_SCHEMA', 'lafeaStageCompositionIdentity',
    'requireLafeaStageComposition',
  ]],
  [analyticalHandoff, [
    'LAFEA_ANALYTICAL_HANDOFF_LIMITATIONS', 'LAFEA_ANALYTICAL_HANDOFF_SCHEMA',
    'LAFEA_ANALYTICAL_HANDOFF_TARGETS', 'createValidatedLafeaAnalyticalHandoff',
    'validateLafeaAnalyticalHandoff',
  ]],
  [foundationProduct, [
    'FINITE_FOOTPRINT_DISTRIBUTION_RULE', 'FINITE_FOOTPRINT_LIMITATIONS',
    'FINITE_FOOTPRINT_REQUEST_SCHEMA', 'FINITE_FOOTPRINT_RESULT_SCHEMA',
    'FINITE_FOOTPRINT_TYPES', 'compileFiniteFootprintDistribution',
    'validateFiniteFootprintDistribution',
  ]],
  [foundationHandoff, ['createFiniteFootprintHandoff']],
  [screeningProduct, [
    'SCREENING_APPLICABILITY_KINDS', 'SCREENING_APPLICABILITY_STATUSES',
    'SCREENING_PRODUCT_LIMITATIONS', 'SCREENING_PRODUCT_REQUEST_SCHEMA',
    'SCREENING_PRODUCT_RESULT_SCHEMA', 'SCREENING_PRODUCT_STATES',
    'createLocalAttachmentScreeningHandoff',
    'evaluateLocalAttachmentScreeningProduct',
    'validateLocalAttachmentScreeningProduct',
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
    assert.strictEqual(
      publicApi[name],
      module[name],
      `${name} must be re-exported without wrapping.`,
    );
    exported.push(name);
  }
}

assert.equal(publicApi.LAFEA_STAGE_REGISTRY_SCHEMA, 'lafea-stage-registry/v2');
assert.equal(publicApi.LAFEA_STAGE_COMPOSITION_BINDING_SCHEMA,
  'lafea-stage-composition-binding/v1');
assert.equal(publicApi.LAFEA_STAGE_COMPOSITION_SCHEMA, 'lafea-stage-composition/v1');
assert.equal(publicApi.LAFEA_LIFECYCLE_SCHEMA, 'lafea-analysis-lifecycle/v2');
assert.equal(publicApi.LAFEA_SOURCE_AUTHORITY_SCHEMA, 'lafea-source-authority/v1');
assert.equal(publicApi.LAFEA_PRODUCER_BATCH_SCHEMA, 'lafea-lifecycle-producer-batch/v1');
assert.equal(publicApi.LAFEA_WORKBENCH_STATE_SCHEMA, 'lafea-workbench-state/v2');
assert.equal(publicApi.requireLafeaStageComposition('LAFEA.1').releaseStateBinding,
  'RELEASE_NOT_QUALIFIED');
assert.equal(publicApi.requireLafeaStageComposition('LAFEA.1').productAssessmentSupported,
  true);
assert.equal(publicApi.requireLafeaStageComposition('LAFEA.2').handoffSupported, true);
assert.deepEqual(publicApi.lafeaLifecycleArtifactKinds('LAFEA.1'), [
  'CANONICAL_MODEL', 'EXECUTION', 'RESULT_EVIDENCE', 'REPORT_EVIDENCE',
]);
assert.deepEqual(publicApi.lafeaLifecycleArtifactKinds('LAFEA.6'), []);

console.log(JSON.stringify({
  check: 'lafea-u3a-public-surface',
  status: 'PASS',
  exportedContracts: exported,
  sourceAuthorityPublic: true,
  producerAdaptersPublic: true,
  analyticalProductVerticalsPublic: true,
  calculationResultCodeReleaseStatesPublic: true,
  stageCorrectProfilesPublic: true,
  registryV2Implemented: true,
  compositionRootPublic: true,
  releaseStateBinding: 'RELEASE_NOT_QUALIFIED',
}));
