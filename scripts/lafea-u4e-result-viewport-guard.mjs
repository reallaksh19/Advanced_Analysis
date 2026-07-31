#!/usr/bin/env node

import assert from 'node:assert/strict';
import {
  createLafeaResultRenderRequest,
} from '../src/workspace/lafea-canvas/result-render-request.js';
import {
  LAFEA_RENDER_FIELD_SCHEMA,
  LAFEA_RENDER_LINEAGE_SCHEMA,
  LAFEA_RENDER_PACKET_V2_SCHEMA,
  sealRenderPacketV2,
} from '../src/workspace/lafea-canvas/render-packet-v2-contract.js';
import {
  LAFEA_RENDER_EVIDENCE_INTAKE_SCHEMA,
} from '../src/workspace/lafea-render-evidence-intake.js';

const packet = sealRenderPacketV2({
  schema: LAFEA_RENDER_PACKET_V2_SCHEMA,
  sceneRevision: 1,
  stageId: 'LAFEA.3',
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
    fieldId: 'FIELD-VIEWPORT-GUARD',
    kind: 'PROJECTED_NODAL',
    units: 'MPa',
    sourcePath: 'qualifiedRecovery.displayFields.FIELD-VIEWPORT-GUARD',
    valueRole: 'PRODUCER_PROJECTED_DISPLAY_ONLY',
    bounds: {
      minimum: 0,
      maximum: 100,
      source: 'QUALIFIED_RECOVERY_FIELD_BOUNDS',
      semanticHash: 'sha256:bounds-viewport-guard',
    },
    colorMapId: 'COOL_WARM',
  },
  pickMap: {
    schema: 'LafeaPickMap.v1',
    sceneRevision: 1,
    entries: [{
      drawGroup: 'TRIANGLES',
      primitiveStart: 0,
      primitiveEnd: 1,
      sourceEntityId: 'SOURCE-E1',
      meshEntityId: 'E1',
      entityRole: 'ELEMENT',
    }],
  },
  lineage: {
    schema: LAFEA_RENDER_LINEAGE_SCHEMA,
    sourceHash: 'sha256:source-viewport-guard',
    topologyHash: 'sha256:topology-viewport-guard',
    meshHash: 'sha256:mesh-viewport-guard',
    executionHash: 'sha256:execution-viewport-guard',
    recoveryHash: 'sha256:recovery-viewport-guard',
    displayGeometryHash: 'sha256:display-viewport-guard',
    renderProfileHash: 'sha256:profile-viewport-guard',
    producerRef: 'U4E-VIEWPORT-GUARD',
  },
});
const intake = Object.freeze({
  schema: LAFEA_RENDER_EVIDENCE_INTAKE_SCHEMA,
  stageId: 'LAFEA.3',
  sceneRevision: 1,
  status: 'READY',
  renderEvidenceReady: true,
  packet,
  blockingReasons: Object.freeze([]),
});
const viewport = {
  schema: 'LafeaViewportState.v2',
  projection: 'XY_ENGINEERING',
  cameraMode: 'ORTHOGRAPHIC',
  worldBounds: {
    minimum: { x: -0.1, y: -0.1, z: 0 },
    maximum: { x: 2.1, y: 1.1, z: 0 },
  },
  viewMatrix: identityMatrix(),
  projectionMatrix: identityMatrix(),
  cssWidth: 640,
  cssHeight: 420,
  devicePixelRatio: 1,
  clippingPlanes: [],
  displayOptions: {
    sourceAuthoring: false,
    wireframe: false,
    fieldBounds: structuredClone(packet.field.bounds),
    colorMapId: packet.field.colorMapId,
    deformationScale: 0,
  },
};

assert.doesNotThrow(() => createLafeaResultRenderRequest({
  intake, viewport, mode: 'STRESS_CONTOUR',
}));
assert.throws(
  () => createLafeaResultRenderRequest({
    intake,
    viewport: { ...viewport, clippingPlanes: [{ axis: 'X' }] },
    mode: 'STRESS_CONTOUR',
  }),
  (error) => error.code === 'LAFEA_RESULT_VIEWPORT_CLIPPING_UNSUPPORTED',
);
assert.throws(
  () => createLafeaResultRenderRequest({
    intake,
    viewport: {
      ...viewport,
      worldBounds: {
        ...viewport.worldBounds,
        maximum: { ...viewport.worldBounds.maximum, x: 1.5 },
      },
    },
    mode: 'STRESS_CONTOUR',
  }),
  (error) => error.code === 'LAFEA_RESULT_GEOMETRY_OUTSIDE_VIEWPORT',
);

console.log(JSON.stringify({
  check: 'lafea-u4e-result-viewport-integrity',
  status: 'PASS',
  clippingAllowed: false,
  allDrawVerticesInsideDeclaredBounds: true,
}));

function identityMatrix() {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}
