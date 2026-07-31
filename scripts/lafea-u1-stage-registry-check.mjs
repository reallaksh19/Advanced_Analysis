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
  lafeaRegisteredExecutionSupported,
  lafeaRegisteredPreviewSource,
  requireLafeaStageRegistryEntry,
} from '../src/workspace/lafea-stage-registry.js';
import {
  lafeaCollectionPaths,
  lafeaStageExecutionSupported,
} from '../src/workspace/lafea-workbench-model.js';

const ENTRY_KEYS = Object.freeze([
  'authority',
  'category',
  'collectionPaths',
  'enginePackage',
  'engineState',
  'inputContractRole',
  'label',
  'limitation',
  'limitations',
  'presenterRole',
  'previewPolicy',
  'previewSource',
  'purpose',
  'resultContractRole',
  'schema',
  'stageId',
  'unitSourceRole',
].sort());

assert.equal(LAFEA_STAGE_REGISTRY.length, LAFEA_STAGE_IDS.length);
assert.deepEqual(
  LAFEA_STAGE_REGISTRY.map((row) => row.stageId),
  LAFEA_STAGE_IDS,
);
assert.equal(new Set(LAFEA_STAGE_IDS).size, LAFEA_STAGE_IDS.length);
assert.equal(new Set(LAFEA_STAGE_REGISTRY.map((row) => row.category)).size, LAFEA_STAGE_IDS.length);
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
  assert.equal(
    lafeaRegisteredExecutionSupported(entry.stageId),
    lafeaStageExecutionSupported(entry.stageId),
  );
  assert.ok(Object.isFrozen(entry));
  assert.ok(Object.isFrozen(entry.collectionPaths));
  assert.ok(Object.isFrozen(entry.limitations));
  assert.ok(Object.isFrozen(entry.previewSource));
  assert.equal(typeof entry.authority, 'string');
  assert.ok(entry.authority.length > 0);
  assert.ok(entry.limitations.length > 0);
}

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
assert.equal(lafeaRegisteredExecutionSupported('LAFEA.6'), false);

for (const stageId of ['LAFEA.1', 'LAFEA.2', 'LAFEA.3', 'LAFEA.4', 'LAFEA.5']) {
  const entry = requireLafeaStageRegistryEntry(stageId);
  assert.equal(entry.engineState, 'QUALIFIED_ROUTE_REGISTERED');
  assert.equal(typeof entry.enginePackage, 'string');
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
  unsupportedStages: LAFEA_STAGE_REGISTRY
    .filter((row) => row.engineState === 'ENGINE_NOT_IMPLEMENTED')
    .map((row) => row.stageId),
  migrationStatus: 'U1B_REGISTRY_CONSUMER_MIGRATION',
}));
