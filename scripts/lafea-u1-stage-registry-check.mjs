#!/usr/bin/env node

import assert from 'node:assert/strict';
import {
  LAFEA_ENGINE_STATES,
  LAFEA_PREVIEW_POLICIES,
  LAFEA_RELEASE_BINDING_POLICIES,
  LAFEA_RELEASE_BINDING_STATES,
  LAFEA_STAGE_AUTHORITY_PATH_IDS,
  LAFEA_STAGE_CATEGORIES,
  LAFEA_STAGE_DEFINITIONS,
  LAFEA_STAGE_IDS,
  LAFEA_STAGE_REGISTRY,
  LAFEA_STAGE_REGISTRY_SCHEMA,
  lafeaRegisteredAuthorityPath,
  lafeaRegisteredBenchmarkManifestIds,
  lafeaRegisteredCollectionPaths,
  lafeaRegisteredComponentIds,
  lafeaRegisteredExecutionSupported,
  lafeaRegisteredLifecycleProfileId,
  lafeaRegisteredPreviewSource,
  lafeaRegisteredReleaseStateBinding,
  requireLafeaStageRegistryEntry,
} from '../src/workspace/lafea-stage-registry.js';
import {
  lafeaCollectionPaths,
  lafeaStageExecutionSupported,
} from '../src/workspace/lafea-workbench-model.js';

const ENTRY_KEYS = Object.freeze([
  'authority',
  'authorityPathId',
  'benchmarkManifestIds',
  'category',
  'collectionPaths',
  'componentIds',
  'enginePackage',
  'engineState',
  'inputContractRole',
  'label',
  'lifecycleProfileId',
  'limitation',
  'limitations',
  'presenterRole',
  'previewPolicy',
  'previewSource',
  'purpose',
  'releaseStateBinding',
  'resultContractRole',
  'schema',
  'stageId',
  'unitSourceRole',
].sort());

assert.equal(LAFEA_STAGE_REGISTRY_SCHEMA, 'lafea-stage-registry/v2');
assert.equal(LAFEA_STAGE_REGISTRY.length, LAFEA_STAGE_IDS.length);
assert.deepEqual(LAFEA_STAGE_REGISTRY.map((row) => row.stageId), LAFEA_STAGE_IDS);
assert.equal(new Set(LAFEA_STAGE_IDS).size, LAFEA_STAGE_IDS.length);
assert.equal(new Set(LAFEA_STAGE_REGISTRY.map((row) => row.category)).size, LAFEA_STAGE_IDS.length);
assert.equal(
  new Set(LAFEA_STAGE_REGISTRY.map((row) => row.authorityPathId)).size,
  LAFEA_STAGE_IDS.length,
);
assert.ok(Object.isFrozen(LAFEA_STAGE_REGISTRY));
assert.ok(Object.isFrozen(LAFEA_STAGE_IDS));
assert.ok(Object.isFrozen(LAFEA_STAGE_DEFINITIONS));
assert.ok(Object.isFrozen(LAFEA_STAGE_AUTHORITY_PATH_IDS));

const componentIds = [];
const benchmarkManifestIds = [];

for (const definition of LAFEA_STAGE_DEFINITIONS) {
  const entry = requireLafeaStageRegistryEntry(definition.stageId);
  assert.deepEqual(Object.keys(entry).sort(), ENTRY_KEYS, `${entry.stageId} registry keys drifted.`);
  assert.equal(entry.schema, LAFEA_STAGE_REGISTRY_SCHEMA);
  assert.equal(entry.label, definition.label);
  assert.equal(entry.purpose, definition.purpose);
  assert.ok(LAFEA_STAGE_CATEGORIES.includes(entry.category));
  assert.ok(LAFEA_ENGINE_STATES.includes(entry.engineState));
  assert.ok(LAFEA_PREVIEW_POLICIES.includes(entry.previewPolicy));
  assert.deepEqual(entry.collectionPaths, lafeaRegisteredCollectionPaths(entry.stageId));
  assert.deepEqual(entry.collectionPaths, lafeaCollectionPaths(entry.stageId));
  assert.deepEqual(entry.previewSource, lafeaRegisteredPreviewSource(entry.stageId));
  assert.equal(entry.authorityPathId, lafeaRegisteredAuthorityPath(entry.stageId));
  assert.equal(entry.authorityPathId, LAFEA_STAGE_AUTHORITY_PATH_IDS[entry.stageId]);
  assert.deepEqual(entry.componentIds, lafeaRegisteredComponentIds(entry.stageId));
  assert.deepEqual(
    entry.benchmarkManifestIds,
    lafeaRegisteredBenchmarkManifestIds(entry.stageId),
  );
  assert.equal(entry.lifecycleProfileId, lafeaRegisteredLifecycleProfileId(entry.stageId));
  assert.deepEqual(
    entry.releaseStateBinding,
    lafeaRegisteredReleaseStateBinding(entry.stageId),
  );
  assert.equal(
    lafeaRegisteredExecutionSupported(entry.stageId),
    lafeaStageExecutionSupported(entry.stageId),
  );
  assert.ok(Object.isFrozen(entry));
  assert.ok(Object.isFrozen(entry.collectionPaths));
  assert.ok(Object.isFrozen(entry.limitations));
  assert.ok(Object.isFrozen(entry.previewSource));
  assert.ok(Object.isFrozen(entry.componentIds));
  assert.ok(Object.isFrozen(entry.benchmarkManifestIds));
  assert.ok(Object.isFrozen(entry.releaseStateBinding));
  assert.equal(typeof entry.authority, 'string');
  assert.ok(entry.authority.length > 0);
  assert.ok(entry.limitations.length > 0);
  assert.equal(entry.releaseStateBinding.state, 'RELEASE_NOT_QUALIFIED');
  assert.equal(entry.releaseStateBinding.automaticPromotion, false);
  assert.ok(LAFEA_RELEASE_BINDING_STATES.includes(entry.releaseStateBinding.state));
  assert.ok(LAFEA_RELEASE_BINDING_POLICIES.includes(entry.releaseStateBinding.policy));
  componentIds.push(...Object.values(entry.componentIds));
  benchmarkManifestIds.push(...entry.benchmarkManifestIds);
}

assert.equal(new Set(componentIds).size, componentIds.length);
assert.equal(new Set(benchmarkManifestIds).size, benchmarkManifestIds.length);

const shell = requireLafeaStageRegistryEntry('LAFEA.4');
assert.equal(shell.authority, 'CST_DKT_TRI3_THIN_SHELL_V1');
assert.equal(shell.enginePackage, 'local-shell');
assert.match(shell.purpose, /Legacy five-DOF triangular CST\+DKT/u);
assert.ok(shell.limitations.some((value) => /No production MITC4\/MITC3 claim/u.test(value)));

const weld = requireLafeaStageRegistryEntry('LAFEA.6');
assert.equal(weld.engineState, 'ENGINE_NOT_IMPLEMENTED');
assert.equal(weld.enginePackage, null);
assert.equal(weld.resultContractRole, null);
assert.equal(weld.presenterRole, 'UNSUPPORTED_STAGE_DIAGNOSTIC');
assert.equal(weld.unitSourceRole, null);
assert.equal(weld.previewPolicy, 'EXPLICIT_SOURCE_GEOMETRY_DISPLAY_ONLY');
assert.equal(weld.previewSource.editable, false);
assert.deepEqual(weld.benchmarkManifestIds, []);
assert.equal(weld.lifecycleProfileId, 'UNSUPPORTED_STAGE_V1');
assert.equal(weld.releaseStateBinding.policy, 'UNSUPPORTED_STAGE');
assert.equal(lafeaRegisteredExecutionSupported('LAFEA.6'), false);

for (const stageId of ['LAFEA.1', 'LAFEA.2', 'LAFEA.3', 'LAFEA.4', 'LAFEA.5']) {
  const entry = requireLafeaStageRegistryEntry(stageId);
  assert.equal(entry.engineState, 'QUALIFIED_ROUTE_REGISTERED');
  assert.equal(typeof entry.enginePackage, 'string');
  assert.equal(entry.benchmarkManifestIds.length, 1);
  assert.equal(entry.releaseStateBinding.policy,
    'EXPLICIT_GOVERNED_RELEASE_EVIDENCE_REQUIRED');
  assert.equal(lafeaRegisteredExecutionSupported(stageId), true);
}

assert.throws(
  () => requireLafeaStageRegistryEntry('LAFEA.99'),
  /Unsupported LAFEA stage identity/u,
);
assert.throws(
  () => { requireLafeaStageRegistryEntry('LAFEA.1').label = 'mutated'; },
  TypeError,
);

console.log(JSON.stringify({
  check: 'lafea-u1-stage-registry',
  schema: LAFEA_STAGE_REGISTRY_SCHEMA,
  status: 'PASS',
  stageCount: LAFEA_STAGE_REGISTRY.length,
  uniqueAuthorityPathCount: new Set(
    LAFEA_STAGE_REGISTRY.map((row) => row.authorityPathId),
  ).size,
  componentIdCount: componentIds.length,
  benchmarkManifestIdCount: benchmarkManifestIds.length,
  lifecycleProfilesBound: true,
  releaseBindingsFailClosed: true,
  unsupportedStages: LAFEA_STAGE_REGISTRY
    .filter((row) => row.engineState === 'ENGINE_NOT_IMPLEMENTED')
    .map((row) => row.stageId),
  migrationStatus: 'NB_T3_REGISTRY_V2_COMPOSITION_ROOT',
}));
