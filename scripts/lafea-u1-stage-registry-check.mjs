#!/usr/bin/env node

import assert from 'node:assert/strict';
import {
  LAFEA_STAGE_DEFINITIONS,
  LAFEA_STAGE_IDS,
  lafeaCollectionPaths,
  lafeaStageExecutionSupported,
} from '../src/workspace/lafea-workbench-model.js';
import {
  LAFEA_ENGINE_STATES,
  LAFEA_STAGE_CATEGORIES,
  LAFEA_STAGE_REGISTRY,
  LAFEA_STAGE_REGISTRY_SCHEMA,
  lafeaRegisteredExecutionSupported,
  requireLafeaStageRegistryEntry,
} from '../src/workspace/lafea-stage-registry.js';

assert.equal(LAFEA_STAGE_REGISTRY.length, LAFEA_STAGE_IDS.length);
assert.deepEqual(
  LAFEA_STAGE_REGISTRY.map((row) => row.stageId),
  LAFEA_STAGE_IDS,
);
assert.equal(new Set(LAFEA_STAGE_REGISTRY.map((row) => row.stageId)).size, LAFEA_STAGE_IDS.length);
assert.equal(new Set(LAFEA_STAGE_REGISTRY.map((row) => row.category)).size, LAFEA_STAGE_IDS.length);

for (const definition of LAFEA_STAGE_DEFINITIONS) {
  const entry = requireLafeaStageRegistryEntry(definition.stageId);
  assert.equal(entry.schema, LAFEA_STAGE_REGISTRY_SCHEMA);
  assert.equal(entry.label, definition.label);
  assert.equal(entry.limitation, definition.description);
  assert.ok(LAFEA_STAGE_CATEGORIES.includes(entry.category));
  assert.ok(LAFEA_ENGINE_STATES.includes(entry.engineState));
  assert.deepEqual(entry.collectionPaths, lafeaCollectionPaths(entry.stageId));
  assert.equal(
    lafeaRegisteredExecutionSupported(entry.stageId),
    lafeaStageExecutionSupported(entry.stageId),
  );
  assert.ok(Object.isFrozen(entry));
  assert.ok(Object.isFrozen(entry.collectionPaths));
}

const weld = requireLafeaStageRegistryEntry('LAFEA.6');
assert.equal(weld.engineState, 'ENGINE_NOT_IMPLEMENTED');
assert.equal(weld.enginePackage, null);
assert.equal(weld.resultContractRole, null);
assert.equal(weld.presenterRole, 'UNSUPPORTED_STAGE_DIAGNOSTIC');
assert.equal(weld.previewPolicy, 'EXPLICIT_SOURCE_GEOMETRY_DISPLAY_ONLY');
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

console.log(JSON.stringify({
  check: 'lafea-u1-stage-registry',
  schema: LAFEA_STAGE_REGISTRY_SCHEMA,
  stageCount: LAFEA_STAGE_REGISTRY.length,
  unsupportedStages: LAFEA_STAGE_REGISTRY
    .filter((row) => row.engineState === 'ENGINE_NOT_IMPLEMENTED')
    .map((row) => row.stageId),
  migrationStatus: 'U1A_REGISTRY_CONTRACT_ONLY',
}));
