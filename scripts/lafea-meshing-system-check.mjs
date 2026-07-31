// scripts/lafea-meshing-system-check.mjs

import assert from 'node:assert/strict';
import { createMeshingCommand } from '../src/workspace/lafea-canvas/meshing-intent.js';
import {
  REQUIRED_CANVAS_TESTS,
  assertRequiredTestsRegistered,
} from './lafea-required-test-registry.mjs';

// LAFEA-CANVAS-T19: Meshing command intent creation & validation
const validInput = {
  operationId: 'OP_MESH_01',
  baseSourceRevision: 1,
  profileId: 'FINE_MESH',
  parameters: {
    globalSize: { source: 'USER', value: 10.0 },
    edgeSizes: [{ boundaryId: 'EDGE_1', size: { source: 'USER', value: 5.0 } }],
    curvatureSize: { source: 'USER', value: 2.0 },
    refinementZones: [{ zoneId: 'ZONE_A', targetSize: { source: 'USER', value: 1.0 } }],
    mappedDirections: [],
    transitionControl: { source: '[SIMULATED] PROJECT_PROFILE', value: 1.2 },
  },
  sourceEvidence: { hash: 'EVIDENCE_123' },
};
const validIntent = createMeshingCommand(validInput);

assert.equal(validIntent.schema, 'LafeaMeshingCommand.v1');
assert.equal(validIntent.profileId, 'FINE_MESH');
assert.ok(Object.isFrozen(validIntent));
validInput.parameters.globalSize.value = 20;
assert.equal(validIntent.parameters.globalSize.value, 10);
assert.equal(Object.isFrozen(validInput), false);
validInput.parameters.globalSize.value = 10;

assert.throws(() => createMeshingCommand({
  ...validInput,
  operationId: 'OP_MESH_INVALID',
  parameters: { ...validInput.parameters, globalSize: { source: '', value: 10 } },
}), (error) => error.code === 'LAFEA_MESH_VALUE_SOURCE_REQUIRED');

assertRequiredTestsRegistered(
  ['LAFEA-CANVAS-T19'],
  REQUIRED_CANVAS_TESTS.slice(18, 19),
);
console.log('[SIMULATED] LAFEA meshing-intent check PASS (T19 executed; no meshing benchmark claim)');
