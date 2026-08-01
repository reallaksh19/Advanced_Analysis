#!/usr/bin/env node
import assert from 'node:assert/strict';
import { sourceFixture as attachmentFixture } from './lafea.1-fixtures.mjs';
import { rawRequestFixture as screeningFixture } from './lafea.2-fixtures.mjs';
import { triangleSource as continuumFixture } from './lafea.3-fixtures.mjs';
import { triangleSource as shellFixture } from './lafea.4-fixtures.mjs';
import { workflowSource as trunnionFixture } from './lafea.5-fixtures.mjs';
import {
  LAFEA_BENCHMARK_GATE_CATALOG,
  LAFEA_REQUIRED_ANTI_DRIFT_GATE_IDS,
  LAFEA_REQUIRED_BENCHMARK_GATE_IDS,
  LAFEA_STAGE_BENCHMARK_MANIFESTS,
  LAFEA_STAGE_COMPOSITION_METADATA,
  LAFEA_STAGE_IDS,
  LAFEA_STAGE_REGISTRY,
  LAFEA_STAGE_REGISTRY_SCHEMA,
  createLafeaLifecycleProducerBatch,
  executeLafeaStage,
  issueLafeaSourceAuthority,
  requireLafeaLifecycleProfileForStage,
  requireLafeaStageBenchmarkManifest,
  requireLafeaStageRegistryEntry,
} from '../src/workspace/lafea-workbench.js';

const FIXTURES = Object.freeze({
  'LAFEA.1': attachmentFixture,
  'LAFEA.2': screeningFixture,
  'LAFEA.3': continuumFixture,
  'LAFEA.4': shellFixture,
  'LAFEA.5': trunnionFixture,
});

assert.equal(LAFEA_STAGE_REGISTRY_SCHEMA, 'lafea-stage-registry/v2');
assert.equal(LAFEA_STAGE_REGISTRY.length, 6);
assert.equal(LAFEA_STAGE_COMPOSITION_METADATA.length, 6);
assert.equal(LAFEA_STAGE_BENCHMARK_MANIFESTS.length, 5);
assert.equal(LAFEA_REQUIRED_BENCHMARK_GATE_IDS.length, 16);
assert.equal(LAFEA_REQUIRED_ANTI_DRIFT_GATE_IDS.length, 16);
assert.equal(LAFEA_BENCHMARK_GATE_CATALOG.length, 32);
assert.equal(new Set(LAFEA_BENCHMARK_GATE_CATALOG.map((row) => row.gateId)).size, 32);
assert.equal(LAFEA_BENCHMARK_GATE_CATALOG.every((row) => (
  row.status === 'REQUIRED_UNBOUND'
  && row.expectedEvidenceAuthority === 'INDEPENDENT_EXPECTED_EVIDENCE_REQUIRED'
  && row.releaseBlocking === true
)), true);

const boundGateIds = LAFEA_STAGE_BENCHMARK_MANIFESTS
  .flatMap((manifest) => manifest.requiredGateIds);
assert.deepEqual(
  [...boundGateIds].sort(),
  [...LAFEA_REQUIRED_BENCHMARK_GATE_IDS, ...LAFEA_REQUIRED_ANTI_DRIFT_GATE_IDS].sort(),
);
assert.equal(new Set(boundGateIds).size, 32);

for (const stageId of Object.keys(FIXTURES)) {
  const entry = requireLafeaStageRegistryEntry(stageId);
  const metadata = LAFEA_STAGE_COMPOSITION_METADATA.find((row) => row.stageId === stageId);
  const profile = requireLafeaLifecycleProfileForStage(stageId);
  const manifest = requireLafeaStageBenchmarkManifest(entry.benchmarkManifestId);
  assert.equal(metadata.compositionRootId, entry.compositionRootId);
  assert.deepEqual(metadata.componentIds, entry.componentIds);
  assert.equal(metadata.executionSupported, true);
  assert.equal(profile.profileId, entry.lifecycleProfileId);
  assert.equal(manifest.stageId, stageId);
  assert.equal(manifest.qualificationStatus, 'NOT_QUALIFIED');
  assert.equal(manifest.releaseState, 'RELEASE_NOT_QUALIFIED');
  assert.equal(manifest.qualifiedGateCount, 0);
  assert.equal(manifest.governingFailurePolicy, 'ANY_REQUIRED_GATE_FAILURE_BLOCKS_RELEASE');
  assert.equal(entry.releaseState, 'RELEASE_NOT_QUALIFIED');

  const execution = executeLafeaStage(stageId, FIXTURES[stageId]());
  assert.equal(execution.status, 'QUALIFIED', `${stageId} current core must retain acceptance.`);
  const authority = issueLafeaSourceAuthority(
    stageId, execution.source, `NB-T3-CHECK/${stageId}`,
  );
  const producerBatch = createLafeaLifecycleProducerBatch({
    stageId, sourceAuthority: authority, execution,
  });
  assert.equal(producerBatch.profileId, entry.lifecycleProfileId);
  assert.equal(producerBatch.releaseQualified, false);
  assert.equal(producerBatch.codeAssessmentProduced, false);
  assert.equal(producerBatch.reportProduced, false);
  for (const record of producerBatch.records) {
    assert.match(record.producerRef,
      new RegExp(`^${escapeRegex(entry.componentIds.lifecycleProducer)}/`, 'u'));
  }
}

const unsupported = requireLafeaStageRegistryEntry('LAFEA.6');
const unsupportedMetadata = LAFEA_STAGE_COMPOSITION_METADATA
  .find((row) => row.stageId === 'LAFEA.6');
assert.equal(unsupported.engineState, 'ENGINE_NOT_IMPLEMENTED');
assert.equal(unsupported.benchmarkManifestId, null);
assert.equal(unsupported.releaseState, 'RELEASE_NOT_QUALIFIED');
assert.equal(unsupported.releaseGatePolicy, 'ENGINE_NOT_IMPLEMENTED_BLOCKS_RELEASE');
assert.equal(unsupportedMetadata.executionSupported, false);
assert.equal(unsupported.componentIds.calculator, null);
assert.equal(unsupported.componentIds.lifecycleProducer, null);
const weldExecution = executeLafeaStage('LAFEA.6', {
  schema: 'lafea-weld-profile-placeholder/v1',
  identity: 'WELD-NOT-IMPLEMENTED',
});
assert.equal(weldExecution.status, 'FAILED');
assert.equal(weldExecution.diagnostics[0].code, 'UNSUPPORTED_STAGE_ENGINE_NOT_IMPLEMENTED');

assert.deepEqual(
  LAFEA_STAGE_COMPOSITION_METADATA.map((row) => row.stageId),
  LAFEA_STAGE_IDS,
);
assert.equal(new Set(LAFEA_STAGE_COMPOSITION_METADATA.map((row) => row.compositionRootId)).size, 6);
assert.equal(LAFEA_STAGE_REGISTRY.some((row) => row.releaseState === 'RELEASE_QUALIFIED'), false);

console.log(JSON.stringify({
  check: 'lafea-nb-t3-registry-composition',
  status: 'PASS',
  registrySchema: LAFEA_STAGE_REGISTRY_SCHEMA,
  stageCount: 6,
  compositionRouteCount: 6,
  duplicateDispatchMaps: 0,
  benchmarkManifestCount: 5,
  independentBenchmarkGateCount: 16,
  antiDriftGateCount: 16,
  qualifiedManifestCount: 0,
  releaseQualifiedStageCount: 0,
  lifecycleProfileBindingsExact: true,
  currentCoreExecutionsRetained: 5,
  numericalAuthorityChanged: false,
  shellAuthorityChanged: false,
  codeAuthorityPromoted: false,
  lafea6Enabled: false,
}));

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}
