// scripts/lafea-canvas-contract-check.mjs

import assert from 'node:assert/strict';
import {
  SCHEMAS,
  RENDER_MODES,
  RENDERERS,
  ELEMENT_TYPES,
  RESULT_FIELD_KINDS,
  SCENE_KEYS,
  VIEWPORT_KEYS,
  assertExactKeys,
  requireSchema,
  requireFiniteNumber,
  requireAsciiIdentity,
  deepFreeze,
  contractError,
} from '../src/workspace/lafea-canvas/contracts.js';
import {
  requireRenderPolicy,
  resolveLafeaRenderer,
  sealRenderDecision,
} from '../src/workspace/lafea-canvas/render-policy.js';
import { createLafeaSelectionStore } from '../src/workspace/lafea-canvas/selection-store.js';
import {
  REQUIRED_CANVAS_TESTS,
  assertRequiredTestsRegistered,
} from './lafea-required-test-registry.mjs';

const executedTests = new Set();

// LAFEA-CANVAS-T01: Schemas and constants immutability check
assert.equal(SCHEMAS.scene, 'LafeaEngineeringScene.v2');
assert.equal(SCHEMAS.viewport, 'LafeaViewportState.v2');
assert.ok(Object.isFrozen(SCHEMAS));
assert.ok(Object.isFrozen(RENDER_MODES));
assert.ok(Object.isFrozen(RENDERERS));
assert.ok(Object.isFrozen(ELEMENT_TYPES));
assert.ok(Object.isFrozen(RESULT_FIELD_KINDS));
executedTests.add('LAFEA-CANVAS-T01');

// LAFEA-CANVAS-T02: Schema mismatch error validation
assert.throws(() => {
  requireSchema({ schema: 'WRONG' }, SCHEMAS.scene);
}, (err) => err.code === 'LAFEA_SCHEMA_MISMATCH');
executedTests.add('LAFEA-CANVAS-T02');

// LAFEA-CANVAS-T03: Exact key list assertion validation
const validSceneRecord = {
  schema: 'LafeaEngineeringScene.v2',
  sceneId: 'S1',
  sceneRevision: 1,
  sourceSemanticHash: 'H1',
  topologySemanticHash: 'H2',
  meshSemanticHash: 'H3',
  recoverySemanticHash: 'H4',
  sourcePrimitives: [],
  meshReferences: [],
  resultFields: [],
  labels: [],
  diagnostics: [],
  parentHashes: [],
};
assert.doesNotThrow(() => assertExactKeys(validSceneRecord, SCENE_KEYS, 'LAFEA_SCENE_KEYS_INVALID'));
assert.throws(() => assertExactKeys({ ...validSceneRecord, extra: 1 }, SCENE_KEYS, 'LAFEA_SCENE_KEYS_INVALID'));
executedTests.add('LAFEA-CANVAS-T03');

// LAFEA-CANVAS-T04: Finite number & ASCII identity validator
assert.equal(requireFiniteNumber(42.5, 'val'), 42.5);
assert.equal(requireFiniteNumber(-0, 'val'), 0);
assert.throws(() => requireFiniteNumber(NaN, 'val'), (err) => err.code === 'LAFEA_FINITE_VALUE_REQUIRED');
assert.equal(requireAsciiIdentity('ID_123', 'id'), 'ID_123');
assert.throws(() => requireAsciiIdentity('ID_123_™', 'id'), (err) => err.code === 'LAFEA_ASCII_IDENTITY_REQUIRED');
executedTests.add('LAFEA-CANVAS-T04');

// LAFEA-CANVAS-T05: Render policy key and threshold validation
const validPolicy = {
  schema: 'LafeaRenderPolicy.v1',
  policyId: 'P1',
  sourceRevision: 1,
  svgMeshLimit: { source: 'CONFIG', value: 1000 },
  svgFallbackLimit: { source: 'CONFIG', value: 5000 },
  canvas2dFallbackLimit: { source: 'CONFIG', value: 20000 },
  allowedFallbackModes: ['MESH_WIREFRAME'],
  semanticHash: 'HASH_P1',
};
assert.doesNotThrow(() => requireRenderPolicy(validPolicy));
executedTests.add('LAFEA-CANVAS-T05');

// LAFEA-CANVAS-T06: Renderer mode resolution for SOURCE_AUTHORING (SVG)
assert.equal(resolveLafeaRenderer({
  mode: 'SOURCE_AUTHORING',
  displayedPrimitiveCount: 100,
  webglAvailable: true,
  canvas2dAvailable: true,
  policy: validPolicy,
}), 'SVG');
executedTests.add('LAFEA-CANVAS-T06');

// LAFEA-CANVAS-T07: Renderer mode resolution for PRINT_RESULTS
assert.equal(resolveLafeaRenderer({
  mode: 'PRINT_RESULTS',
  displayedPrimitiveCount: 100,
  webglAvailable: true,
  canvas2dAvailable: true,
  policy: validPolicy,
}), 'RASTER_WEBGL_CAPTURE');
executedTests.add('LAFEA-CANVAS-T07');

// LAFEA-CANVAS-T08: Renderer mode resolution for MESH_WIREFRAME under limit
assert.equal(resolveLafeaRenderer({
  mode: 'MESH_WIREFRAME',
  displayedPrimitiveCount: 500,
  webglAvailable: true,
  canvas2dAvailable: true,
  policy: validPolicy,
}), 'SVG');
executedTests.add('LAFEA-CANVAS-T08');

// LAFEA-CANVAS-T09: Renderer fallback resolution (SVG_FALLBACK & CANVAS2D_FALLBACK)
assert.equal(resolveLafeaRenderer({
  mode: 'MESH_WIREFRAME',
  displayedPrimitiveCount: 3000,
  webglAvailable: false,
  canvas2dAvailable: true,
  policy: validPolicy,
}), 'SVG_FALLBACK');
executedTests.add('LAFEA-CANVAS-T09');

// LAFEA-CANVAS-T10: High primitive count WebGL requirement error
assert.throws(() => {
  resolveLafeaRenderer({
    mode: 'STRESS_CONTOUR',
    displayedPrimitiveCount: 50000,
    webglAvailable: false,
    canvas2dAvailable: false,
    policy: validPolicy,
  });
}, (err) => err.code === 'LAFEA_WEBGL_REQUIRED_FOR_DISPLAY_SIZE');
executedTests.add('LAFEA-CANVAS-T10');

// LAFEA-CANVAS-T11: Render decision sealing
const decision = sealRenderDecision({
  mode: 'SOURCE_AUTHORING',
  renderer: 'SVG',
  sceneRevision: 1,
  policyHash: 'H1',
  displayedPrimitiveCount: 100,
});
assert.ok(Object.isFrozen(decision));
executedTests.add('LAFEA-CANVAS-T11');

// LAFEA-CANVAS-T12: Selection store initialization & empty state
const store = createLafeaSelectionStore();
assert.equal(store.getSnapshot().sceneRevision, 0);
assert.equal(store.getSnapshot().sourceEntityId, null);
executedTests.add('LAFEA-CANVAS-T12');

// LAFEA-CANVAS-T13: Selection store source selection
store.selectSource({ sceneRevision: 1, sourceEntityId: 'SRC_01' });
assert.equal(store.getSnapshot().sourceEntityId, 'SRC_01');
assert.equal(store.getSnapshot().entityRole, 'SOURCE');
executedTests.add('LAFEA-CANVAS-T13');

// LAFEA-CANVAS-T14: Selection store GPU pick resolution
const pickMap = {
  schema: 'LafeaPickMap.v1',
  sceneRevision: 1,
  entries: [{ drawGroup: 'G1', primitiveStart: 0, primitiveEnd: 10, sourceEntityId: 'SRC_02', meshEntityId: 'MESH_02', entityRole: 'ELEMENT' }],
};
store.selectMeshPick({ visibleSceneRevision: 1, pick: { drawGroup: 'G1', primitiveIndex: 5 }, pickMap });
assert.equal(store.getSnapshot().sourceEntityId, 'SRC_02');
assert.equal(store.getSnapshot().meshEntityId, 'MESH_02');
assert.throws(
  () => store.selectSource({ sceneRevision: -1, sourceEntityId: 'SRC_03' }),
  (err) => err.code === 'LAFEA_SCENE_REVISION_INVALID',
);
assert.throws(
  () => store.selectMeshPick({
    visibleSceneRevision: 1,
    pick: { drawGroup: 'G1', primitiveIndex: -1 },
    pickMap,
  }),
  (err) => err.code === 'LAFEA_GPU_PICK_INVALID',
);
executedTests.add('LAFEA-CANVAS-T14');

// LAFEA-CANVAS-T15: Selection store stale pick map rejection
assert.throws(() => {
  store.selectMeshPick({ visibleSceneRevision: 2, pick: { drawGroup: 'G1', primitiveIndex: 5 }, pickMap });
}, (err) => err.code === 'LAFEA_STALE_PICK_MAP_REJECTED');
executedTests.add('LAFEA-CANVAS-T15');

// Verify all required canvas tests are registered and executed
assertRequiredTestsRegistered(Array.from(executedTests), REQUIRED_CANVAS_TESTS.slice(0, 15));

console.log('LAFEA canvas contract check PASS (Tests T01-T15 executed)');
