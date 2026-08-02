#!/usr/bin/env node
import assert from 'node:assert/strict';
import * as analyticalProducts from '../src/workspace/lafea-analytical-product-producers.js';
import * as meshEvidence from '../src/workspace/lafea-analysis-mesh-evidence.js';
import * as recoveryRender from '../src/workspace/lafea-recovery-render-producer.js';
import * as compositionBindings from '../src/workspace/lafea-stage-composition-bindings.js';
import * as compositionRoot from '../src/workspace/lafea-stage-composition-root.js';
import * as hash from '../src/workspace/lafea-canonical-sha256.js';
import * as lifecycle from '../src/workspace/lafea-lifecycle.js';
import * as producers from '../src/workspace/lafea-lifecycle-producers.js';
import * as profiles from '../src/workspace/lafea-lifecycle-profiles.js';
import * as registry from '../src/workspace/lafea-stage-registry.js';
import * as sourceAuthority from '../src/workspace/lafea-source-authority.js';
import * as store from '../src/workspace/lafea-lifecycle-workbench-store.js';
import * as pilotController from '../src/workspace/lafea-template-execution-public.js';
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
  [analyticalProducts, [
    'LAFEA_ANALYTICAL_PRODUCT_BATCH_SCHEMA',
    'LAFEA_ANALYTICAL_PRODUCT_PRODUCER_REVISION',
    'createLafeaAnalyticalProductBatch', 'registerLafeaAnalyticalProductBatch',
  ]],
  [meshEvidence, [
    'LAFEA_ANALYSIS_MESH_AUTHORITY_ROLE',
    'LAFEA_ANALYSIS_MESH_AUTHORITY_SCHEMA',
    'LAFEA_ANALYSIS_MESH_AUTHORITY_STATUS',
    'LAFEA_ANALYSIS_MESH_EVIDENCE_SCHEMA',
    'LAFEA_ANALYSIS_MESH_FEA_STAGES',
    'LAFEA_ANALYSIS_MESH_INTAKE_SCHEMA',
    'LAFEA_ANALYSIS_MESH_PRODUCER_REVISION',
    'LAFEA_ANALYSIS_MESH_QUALITY_SCHEMA',
    'LAFEA_ANALYSIS_MESH_SCHEMA',
    'createLafeaAnalysisMeshEvidence',
    'lafeaAnalysisMeshContentHash',
    'registerLafeaAnalysisMeshEvidence',
  ]],
  [recoveryRender, [
    'LAFEA_RECOVERY_RENDER_DISPLAY_FIELD_SCHEMA',
    'LAFEA_RECOVERY_RENDER_FEA_STAGES',
    'LAFEA_RECOVERY_RENDER_FIELD_REQUEST_SCHEMA',
    'LAFEA_RECOVERY_RENDER_INTAKE_SCHEMA',
    'LAFEA_RECOVERY_RENDER_LOCATION_KINDS',
    'LAFEA_RECOVERY_RENDER_LOCATION_SCHEMA',
    'LAFEA_RECOVERY_RENDER_PACKAGE_SCHEMA',
    'LAFEA_RECOVERY_RENDER_PRODUCER_REVISION',
    'LAFEA_RECOVERY_RENDER_QUANTITIES',
    'LAFEA_RECOVERY_RENDER_SHELL_SURFACES',
    'LAFEA_RECOVERY_RENDER_TESSELLATION_POLICY',
    'createLafeaRecoveryRenderPackage',
    'lafeaRecoveryRenderDisplayGeometryHash',
    'lafeaRecoveryRenderPackageHash',
    'lafeaRecoveryRenderProfileHash',
    'registerLafeaRecoveryRenderPackage',
  ]],
  [store, [
    'LAFEA_CALCULATION_STATES', 'LAFEA_CODE_STATES',
    'LAFEA_LIFECYCLE_BINDING_SCHEMA', 'LAFEA_LIFECYCLE_BINDING_STATUSES',
    'LAFEA_RELEASE_STATES', 'LAFEA_RESULT_STATES',
    'LAFEA_WORKBENCH_STATE_SCHEMA', 'createLafeaWorkbenchStore',
  ]],
  [pilotController, [
    'LAFEA_TEMPLATE_EXECUTION_CONTROLLER_RESULT_SCHEMA',
    'LAFEA_TEMPLATE_EXECUTION_CONTROLLER_REVISION',
    'executeControlledLafeaAnalyticalPilot',
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
assert.equal(publicApi.LAFEA_STAGE_COMPOSITION_BINDING_SCHEMA,
  'lafea-stage-composition-binding/v2');
assert.equal(publicApi.LAFEA_STAGE_COMPOSITION_SCHEMA, 'lafea-stage-composition/v2');
assert.equal(publicApi.LAFEA_LIFECYCLE_SCHEMA, 'lafea-analysis-lifecycle/v2');
assert.equal(publicApi.LAFEA_SOURCE_AUTHORITY_SCHEMA, 'lafea-source-authority/v1');
assert.equal(publicApi.LAFEA_PRODUCER_BATCH_SCHEMA, 'lafea-lifecycle-producer-batch/v1');
assert.equal(publicApi.LAFEA_ANALYTICAL_PRODUCT_BATCH_SCHEMA,
  'lafea-analytical-product-batch/v1');
assert.equal(publicApi.LAFEA_ANALYSIS_MESH_INTAKE_SCHEMA,
  'lafea-analysis-mesh-intake/v1');
assert.equal(publicApi.LAFEA_ANALYSIS_MESH_EVIDENCE_SCHEMA,
  'lafea-analysis-mesh-evidence/v1');
assert.equal(publicApi.LAFEA_RECOVERY_RENDER_INTAKE_SCHEMA,
  'lafea-recovery-render-intake/v1');
assert.equal(publicApi.LAFEA_RECOVERY_RENDER_PACKAGE_SCHEMA,
  'lafea-recovery-render-package/v1');
assert.equal(publicApi.LAFEA_WORKBENCH_STATE_SCHEMA, 'lafea-workbench-state/v2');
assert.equal(publicApi.LAFEA_TEMPLATE_EXECUTION_CONTROLLER_RESULT_SCHEMA,
  'lafea-template-execution-controller-result/v1');
assert.equal(publicApi.requireLafeaStageComposition('LAFEA.1').releaseStateBinding,
  'RELEASE_NOT_QUALIFIED');
assert.equal(publicApi.requireLafeaStageComposition('LAFEA.1').productSupported, true);
assert.equal(publicApi.requireLafeaStageComposition('LAFEA.2').productSupported, true);
assert.deepEqual(publicApi.LAFEA_ANALYSIS_MESH_FEA_STAGES,
  ['LAFEA.3', 'LAFEA.4', 'LAFEA.5']);
assert.deepEqual(publicApi.LAFEA_RECOVERY_RENDER_FEA_STAGES,
  ['LAFEA.3', 'LAFEA.4', 'LAFEA.5']);
assert.deepEqual(publicApi.lafeaLifecycleArtifactKinds('LAFEA.1'), [
  'CANONICAL_MODEL', 'EXECUTION', 'RESULT_EVIDENCE',
  'FOUNDATION_DISTRIBUTION', 'REPORT_EVIDENCE',
]);
assert.deepEqual(publicApi.lafeaLifecycleArtifactKinds('LAFEA.6'), []);

console.log(JSON.stringify({
  check: 'lafea-u3a-public-surface',
  status: 'PASS',
  exportedContracts: exported,
  sourceAuthorityPublic: true,
  producerAdaptersPublic: true,
  analyticalProductProducersPublic: true,
  analysisMeshEvidencePublic: true,
  recoveryRenderProducerPublic: true,
  analyticalPilotControllerPublic: true,
  calculationResultCodeReleaseStatesPublic: true,
  stageCorrectProfilesPublic: true,
  registryV2Implemented: true,
  compositionRootPublic: true,
  releaseStateBinding: 'RELEASE_NOT_QUALIFIED',
}));
