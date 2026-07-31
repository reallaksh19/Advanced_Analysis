#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createLafeaSourceEngineeringScene,
} from '../src/workspace/lafea-engineering-scene.js';
import {
  LAFEA_RENDER_FIELD_SCHEMA,
  LAFEA_RENDER_LINEAGE_SCHEMA,
  LAFEA_RENDER_PACKET_V2_SCHEMA,
  sealRenderPacketV2,
} from '../src/workspace/lafea-canvas/render-packet-v2-contract.js';
import {
  LAFEA_RENDER_EVIDENCE_INTAKE_SCHEMA,
} from '../src/workspace/lafea-render-evidence-intake.js';
import {
  LAFEA_HYBRID_RESULT_RENDER_POLICY,
  LAFEA_HYBRID_RESULT_VIEWPORT_SCHEMA,
  LAFEA_HYBRID_RESULT_VIEWPORT_STATUSES,
  createLafeaHybridResultViewportModel,
} from '../src/workspace/lafea-hybrid-result-viewport.js';
import * as publicSurface from '../src/workspace/lafea-workbench.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceHash = 'sha256:u4f-source';
const scene = sourceScene('LAFEA.3', 4, sourceHash);
const packet = sealRenderPacketV2(packetValue('LAFEA.3', 4, sourceHash));
const intake = readyIntake(packet);
const viewport = viewportValue(packet);

assert.equal(LAFEA_HYBRID_RESULT_VIEWPORT_SCHEMA, 'lafea-hybrid-result-viewport/v1');
assert.deepEqual(LAFEA_HYBRID_RESULT_VIEWPORT_STATUSES, ['READY', 'BLOCKED']);
assert.ok(Object.isFrozen(LAFEA_HYBRID_RESULT_VIEWPORT_STATUSES));
assert.ok(Object.isFrozen(LAFEA_HYBRID_RESULT_RENDER_POLICY));
assert.deepEqual(LAFEA_HYBRID_RESULT_RENDER_POLICY.allowedFallbackModes, []);

const ready = createLafeaHybridResultViewportModel({
  stageId: 'LAFEA.3',
  sourceScene: scene,
  intake,
  viewport,
  selection: null,
});
assert.equal(ready.status, 'READY');
assert.equal(ready.resultRequest.mode, 'STRESS_CONTOUR');
assert.equal(ready.resultRequest.renderPacket.lineage.sourceHash, sourceHash);
assert.deepEqual(ready.blockingReasons, []);
assert.equal(ready.selection.sourceEntityId, null);
assert.ok(Object.isFrozen(ready));

const selected = createLafeaHybridResultViewportModel({
  stageId: 'LAFEA.3',
  sourceScene: scene,
  intake,
  viewport,
  selection: {
    sceneRevision: 4,
    sourceEntityId: 'N2',
    meshEntityId: null,
    entityRole: 'SOURCE',
  },
});
assert.equal(selected.selection.sourceEntityId, 'N2');

const blockedIntake = createLafeaHybridResultViewportModel({
  stageId: 'LAFEA.3',
  sourceScene: scene,
  intake: {
    schema: LAFEA_RENDER_EVIDENCE_INTAKE_SCHEMA,
    stageId: 'LAFEA.3',
    sceneRevision: 4,
    status: 'BLOCKED',
    renderEvidenceReady: false,
    packet: null,
    blockingReasons: ['LAFEA_RENDER_LIFECYCLE_RESULT_NOT_READY'],
  },
  viewport: sourceOnlyViewport(),
  selection: null,
});
assert.equal(blockedIntake.status, 'BLOCKED');
assert.equal(blockedIntake.resultRequest, null);
assert.deepEqual(blockedIntake.blockingReasons, ['LAFEA_RENDER_LIFECYCLE_RESULT_NOT_READY']);

const staleScene = createLafeaHybridResultViewportModel({
  stageId: 'LAFEA.3',
  sourceScene: sourceScene('LAFEA.3', 5, sourceHash),
  intake,
  viewport,
  selection: null,
});
assert.equal(staleScene.status, 'BLOCKED');
assert.ok(staleScene.blockingReasons.includes(
  'LAFEA_HYBRID_RESULT_SOURCE_SCENE_REVISION_MISMATCH',
));

const sourceMismatch = createLafeaHybridResultViewportModel({
  stageId: 'LAFEA.3',
  sourceScene: sourceScene('LAFEA.3', 4, 'sha256:other-source'),
  intake,
  viewport,
  selection: null,
});
assert.equal(sourceMismatch.status, 'BLOCKED');
assert.ok(sourceMismatch.blockingReasons.includes('LAFEA_HYBRID_RESULT_SOURCE_HASH_MISMATCH'));
assert.equal(sourceMismatch.resultRequest, null);

const sourceOutside = createLafeaHybridResultViewportModel({
  stageId: 'LAFEA.3',
  sourceScene: sourceScene('LAFEA.3', 4, sourceHash, 10),
  intake,
  viewport,
  selection: null,
});
assert.ok(sourceOutside.blockingReasons.includes('LAFEA_HYBRID_RESULT_SOURCE_OUTSIDE_VIEWPORT'));

const wrongStage = createLafeaHybridResultViewportModel({
  stageId: 'LAFEA.4',
  sourceScene: scene,
  intake,
  viewport,
  selection: null,
});
assert.equal(wrongStage.status, 'BLOCKED');
assert.ok(wrongStage.blockingReasons.includes('LAFEA_HYBRID_RESULT_SOURCE_STAGE_MISMATCH'));
assert.ok(wrongStage.blockingReasons.includes('LAFEA_HYBRID_RESULT_INTAKE_STAGE_MISMATCH'));

const weld = createLafeaHybridResultViewportModel({
  stageId: 'LAFEA.6',
  sourceScene: sourceScene('LAFEA.6', 1, 'sha256:weld-source'),
  intake: {
    schema: LAFEA_RENDER_EVIDENCE_INTAKE_SCHEMA,
    stageId: 'LAFEA.6',
    sceneRevision: 1,
    status: 'BLOCKED',
    renderEvidenceReady: false,
    packet: null,
    blockingReasons: ['LAFEA_RENDER_STAGE_ENGINE_NOT_IMPLEMENTED'],
  },
  viewport: sourceOnlyViewport(),
  selection: null,
});
assert.ok(weld.blockingReasons.includes('LAFEA_HYBRID_RESULT_STAGE_ENGINE_NOT_IMPLEMENTED'));
assert.equal(weld.resultRequest, null);

assert.throws(
  () => createLafeaHybridResultViewportModel({
    stageId: 'LAFEA.3', sourceScene: scene, intake, viewport,
    selection: { sceneRevision: 4, sourceEntityId: '0', meshEntityId: null, entityRole: 'SOURCE' },
  }),
  (error) => error.code === 'LAFEA_HYBRID_RESULT_SOURCE_SELECTION_INVALID',
);
assert.throws(
  () => createLafeaHybridResultViewportModel({
    stageId: 'LAFEA.3', sourceScene: scene, intake,
    viewport: {
      ...viewport,
      worldBounds: {
        minimum: { x: 1, y: 0, z: 0 },
        maximum: { x: 0, y: 1, z: 0 },
      },
    },
    selection: null,
  }),
  (error) => error.code === 'LAFEA_HYBRID_RESULT_WORLD_BOUNDS_ORDER_INVALID',
);
assert.throws(
  () => createLafeaHybridResultViewportModel({
    stageId: 'LAFEA.3', sourceScene: scene, intake,
    viewport: {
      ...viewport,
      displayOptions: {
        ...viewport.displayOptions,
        fieldBounds: { minimum: 0, maximum: 1, source: '', semanticHash: '' },
      },
    },
    selection: null,
  }),
  (error) => error.code === 'LAFEA_HYBRID_RESULT_FIELD_BOUNDS_INVALID',
);

for (const name of [
  'LAFEA_HYBRID_RESULT_RENDER_POLICY',
  'LAFEA_HYBRID_RESULT_VIEWPORT_SCHEMA',
  'LAFEA_HYBRID_RESULT_VIEWPORT_STATUSES',
  'createLafeaHybridResultViewportModel',
]) {
  assert.equal(publicSurface[name], {
    LAFEA_HYBRID_RESULT_RENDER_POLICY,
    LAFEA_HYBRID_RESULT_VIEWPORT_SCHEMA,
    LAFEA_HYBRID_RESULT_VIEWPORT_STATUSES,
    createLafeaHybridResultViewportModel,
  }[name], `${name} must be re-exported without wrapping.`);
}

const source = fs.readFileSync(
  path.join(ROOT, 'src/workspace/lafea-hybrid-result-viewport.js'),
  'utf8',
);
assert.doesNotMatch(source, /lafea-workbench-view|lafea-workbench-store|stage\.execution/u);
assert.doesNotMatch(source, /SVG_FALLBACK|CANVAS2D_FALLBACK|RASTER_WEBGL_CAPTURE/u);
assert.match(source, /createLafeaResultRenderRequest/u);
assert.match(source, /createThreeMeshRendererV2/u);
assert.match(source, /PRINT_SOURCE/u);
assert.match(source, /STRESS_CONTOUR/u);

console.log(JSON.stringify({
  check: 'lafea-u4f-hybrid-result-model',
  status: 'PASS',
  sourceHashBound: true,
  sceneRevisionBound: true,
  blockedEvidenceShowsSourceOnly: true,
  fallbackAllowed: false,
  liveWorkbenchMounted: false,
  lafea6Enabled: false,
}));

function sourceScene(stageId, sceneRevision, hash, xOffset = 0) {
  const document = stageId === 'LAFEA.6'
    ? { nodes: [], elements: [] }
    : {
      nodes: [
        { nodeId: 'N1', x: 0 + xOffset, y: 0, z: 0 },
        { nodeId: 'N2', x: 2 + xOffset, y: 0, z: 0 },
        { nodeId: 'N3', x: 0 + xOffset, y: 1, z: 0 },
      ],
      elements: [{ elementId: 'E1', nodeIds: ['N1', 'N2', 'N3'] }],
    };
  return createLafeaSourceEngineeringScene({
    stageId,
    document,
    lifecycle: { source: { sourceHash: hash } },
    lifecycleBinding: { status: 'CURRENT' },
    sceneRevision,
  });
}

function readyIntake(renderPacket) {
  return {
    schema: LAFEA_RENDER_EVIDENCE_INTAKE_SCHEMA,
    stageId: renderPacket.stageId,
    sceneRevision: renderPacket.sceneRevision,
    status: 'READY',
    renderEvidenceReady: true,
    packet: renderPacket,
    blockingReasons: [],
  };
}

function packetValue(stageId, sceneRevision, hash) {
  return {
    schema: LAFEA_RENDER_PACKET_V2_SCHEMA,
    sceneRevision,
    stageId,
    sourceElementType: 'T3',
    positions: new Float32Array([0, 0, 0, 2, 0, 0, 0, 1, 0]),
    vertexMeshNodeIds: ['N1', 'N2', 'N3'],
    drawTriangleIndices: new Uint32Array([0, 1, 2]),
    drawTriangleElementIndices: new Uint32Array([0]),
    sourceElementIds: ['E1'],
    fieldValues: new Float32Array([0, 50, 100]),
    qualityFlags: new Uint8Array([0, 0, 0]),
    field: {
      schema: LAFEA_RENDER_FIELD_SCHEMA,
      fieldId: 'FIELD-U4F',
      kind: 'PROJECTED_NODAL',
      units: 'MPa',
      sourcePath: 'qualifiedRecovery.displayFields.FIELD-U4F',
      valueRole: 'PRODUCER_PROJECTED_DISPLAY_ONLY',
      bounds: {
        minimum: 0,
        maximum: 100,
        source: 'QUALIFIED_RECOVERY_FIELD_BOUNDS',
        semanticHash: 'sha256:bounds-u4f',
      },
      colorMapId: 'COOL_WARM',
    },
    pickMap: {
      schema: 'LafeaPickMap.v1',
      sceneRevision,
      entries: [{
        drawGroup: 'TRIANGLES', primitiveStart: 0, primitiveEnd: 1,
        sourceEntityId: 'N1', meshEntityId: 'E1', entityRole: 'ELEMENT',
      }],
    },
    lineage: {
      schema: LAFEA_RENDER_LINEAGE_SCHEMA,
      sourceHash: hash,
      topologyHash: 'sha256:topology-u4f',
      meshHash: 'sha256:mesh-u4f',
      executionHash: 'sha256:execution-u4f',
      recoveryHash: 'sha256:recovery-u4f',
      displayGeometryHash: 'sha256:display-u4f',
      renderProfileHash: 'sha256:profile-u4f',
      producerRef: 'U4F-MODEL-TEST',
    },
  };
}

function viewportValue(renderPacket) {
  const matrix = identityMatrix();
  return {
    schema: 'LafeaViewportState.v2',
    projection: 'XY_ENGINEERING',
    cameraMode: 'ORTHOGRAPHIC',
    worldBounds: {
      minimum: { x: -0.1, y: -0.1, z: 0 },
      maximum: { x: 2.1, y: 1.1, z: 0 },
    },
    viewMatrix: matrix,
    projectionMatrix: matrix,
    cssWidth: 640,
    cssHeight: 420,
    devicePixelRatio: 1,
    clippingPlanes: [],
    displayOptions: {
      sourceAuthoring: false,
      wireframe: false,
      fieldBounds: structuredClone(renderPacket.field.bounds),
      colorMapId: renderPacket.field.colorMapId,
      deformationScale: 0,
    },
  };
}

function sourceOnlyViewport() {
  const matrix = identityMatrix();
  return {
    schema: 'LafeaViewportState.v2',
    projection: 'XY_ENGINEERING',
    cameraMode: 'ORTHOGRAPHIC',
    worldBounds: {
      minimum: { x: -0.1, y: -0.1, z: 0 },
      maximum: { x: 2.1, y: 1.1, z: 0 },
    },
    viewMatrix: matrix,
    projectionMatrix: matrix,
    cssWidth: 640,
    cssHeight: 420,
    devicePixelRatio: 1,
    clippingPlanes: [],
    displayOptions: {
      sourceAuthoring: false,
      wireframe: false,
      fieldBounds: null,
      colorMapId: null,
      deformationScale: 0,
    },
  };
}

function identityMatrix() {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}
