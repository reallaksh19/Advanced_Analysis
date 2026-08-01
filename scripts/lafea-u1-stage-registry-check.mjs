#!/usr/bin/env node

import assert from 'node:assert/strict';
import {
  LAFEA_ENGINE_STATES,
  LAFEA_PREVIEW_POLICIES,
  LAFEA_STAGE_CATEGORIES,
  LAFEA_STAGE_DEFINITIONS,
  LAFEA_STAGE_IDS,
  LAFEA_STAGE_REGISTRY,
  LAFEA_STAGE_REGISTRY_SCHEMA,
  lafeaRegisteredCollectionPaths,
  lafeaRegisteredComposition,
  lafeaRegisteredExecutionSupported,
  lafeaRegisteredPreviewSource,
  requireLafeaStageRegistryEntry,
} from '../src/workspace/lafea-stage-registry.js';
import {
  LAFEA_STAGE_COMPOSITION_BINDING_SCHEMA,
  LAFEA_RELEASE_STATE_BINDINGS,
} from '../src/workspace/lafea-stage-composition-bindings.js';
import {
  lafeaCollectionPaths,
  lafeaStageExecutionSupported,
} from '../src/workspace/lafea-workbench-model.js';

const ENTRY_KEYS = Object.freeze([
  'authority', 'category', 'collectionPaths', 'composition', 'enginePackage',
  'engineState', 'inputContractRole', 'label', 'limitation', 'limitations',
  'presenterRole', 'previewPolicy', 'previewSource', 'purpose',
  'resultContractRole', 'schema', 'stageId', 'unitSourceRole',
].sort());

assert.equal(LAFEA_STAGE_REGISTRY_SCHEMA, 'lafea-stage-registry/v2');
assert.equal(LAFEA_STAGE_REGISTRY.length, LAFEA_STAGE_IDS.length);
assert.deepEqual(LAFEA_STAGE_REGISTRY.map((row) => row.stageId), LAFEA_STAGE_IDS);
assert.equal(new Set(LAFEA_STAGE_IDS).size, LAFEA_STAGE_IDS.length);
assert.equal(new Set(LAFEA_STAGE_REGISTRY.map((row) => row.category)).size, LAFEA_STAGE_IDS.length);
assert.equal(new Set(LAFEA_STAGE_REGISTRY.map((row) => row.composition.compositionRootId)).size,
  LAFEA_STAGE_IDS.length);
assert.ok(Object.isFrozen(LAFEA_STAGE_REGISTRY));
assert.ok(Object.isFrozen(LAFEA_STAGE_IDS));
assert.ok(Object.isFrozen(LAFEA_STAGE_DEFINITIONS));

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
  assert.deepEqual(entry.composition, lafeaRegisteredComposition(entry.stageId));
  assert.equal(entry.composition.schema, LAFEA_STAGE_COMPOSITION_BINDING_SCHEMA);
  assert.equal(entry.composition.stageId, entry.stageId);
  assert.ok(LAFEA_RELEASE_STATE_BINDINGS.includes(entry.composition.releaseStateBinding));
  assert.equal(entry.composition.releaseStateBinding, 'RELEASE_NOT_QUALIFIED');
  assert.equal(
    lafeaRegisteredExecutionSupported(entry.stageId),
    lafeaStageExecutionSupported(entry.stageId),
  );
  for (const value of [entry, entry.collectionPaths, entry.limitations,
    entry.previewSource, entry.composition, entry.composition.componentIds,
    entry.composition.benchmarkManifestIds]) assert.ok(Object.isFrozen(value));
  assert.equal(typeof entry.authority, 'string');
  assert.ok(entry.authority.length > 0);
  assert.ok(entry.limitations.length > 0);
}

const continuum = requireLafeaStageRegistryEntry('LAFEA.3');
assert.deepEqual(continuum.composition.benchmarkManifestIds, [
  'CONT-PATCH-01', 'CONT-CYL-01', 'CONT-HOLE-01',
]);
const shell = requireLafeaStageRegistryEntry('LAFEA.4');
assert.equal(shell.authority, 'CST_DKT_TRI3_THIN_SHELL_V1');
assert.equal(shell.enginePackage, 'local-shell');
assert.deepEqual(shell.composition.benchmarkManifestIds, [
  'SHELL-PATCH-01', 'SHELL-BEND-01',
]);
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
assert.equal(weld.composition.lifecycleProfileId, 'UNSUPPORTED_STAGE_V1');
assert.equal(weld.composition.componentIds.calculator, null);
assert.equal(lafeaRegisteredExecutionSupported('LAFEA.6'), false);

for (const stageId of ['LAFEA.1', 'LAFEA.2', 'LAFEA.3', 'LAFEA.4', 'LAFEA.5']) {
  const entry = requireLafeaStageRegistryEntry(stageId);
  assert.equal(entry.engineState, 'QUALIFIED_ROUTE_REGISTERED');
  assert.equal(typeof entry.enginePackage, 'string');
  assert.equal(typeof entry.composition.componentIds.calculator, 'string');
  assert.equal(lafeaRegisteredExecutionSupported(stageId), true);
}

assert.throws(() => requireLafeaStageRegistryEntry('LAFEA.99'), /Unsupported LAFEA stage identity/u);
assert.throws(() => { requireLafeaStageRegistryEntry('LAFEA.1').label = 'mutated'; }, TypeError);

console.log(JSON.stringify({
  check: 'lafea-u1-stage-registry',
  schema: LAFEA_STAGE_REGISTRY_SCHEMA,
  status: 'PASS',
  stageCount: LAFEA_STAGE_REGISTRY.length,
  compositionRoots: LAFEA_STAGE_REGISTRY.length,
  releaseStateBinding: 'RELEASE_NOT_QUALIFIED',
  unsupportedStages: LAFEA_STAGE_REGISTRY
    .filter((row) => row.engineState === 'ENGINE_NOT_IMPLEMENTED')
    .map((row) => row.stageId),
  migrationStatus: 'NB-T3_COMPOSITION_ROOT',
}));
