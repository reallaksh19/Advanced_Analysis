#!/usr/bin/env node

import assert from 'node:assert/strict';
import {
  LAFEA_RENDER_FIELD_SCHEMA,
  LAFEA_RENDER_LINEAGE_SCHEMA,
  LAFEA_RENDER_PACKET_V2_SCHEMA,
  requireRenderPacketV2,
} from '../src/workspace/lafea-canvas/render-packet-v2-contract.js';

const base = packet();
assert.throws(
  () => requireRenderPacketV2({
    ...clone(base),
    drawTriangleIndices: new Uint32Array([0, 1, 1]),
  }),
  (error) => error.code === 'LAFEA_RENDER_DEGENERATE_DRAW_TRIANGLE',
);
assert.throws(
  () => requireRenderPacketV2({
    ...clone(base),
    positions: new Float32Array([0, 0, 0, 1, 0, 0, 2, 0, 0]),
  }),
  (error) => error.code === 'LAFEA_RENDER_DEGENERATE_DRAW_TRIANGLE',
);
assert.throws(
  () => requireRenderPacketV2({
    ...clone(base),
    sourceElementIds: ['E1', 'E2-UNUSED'],
  }),
  (error) => error.code === 'LAFEA_RENDER_SOURCE_ELEMENT_COVERAGE_INVALID',
);

console.log(JSON.stringify({
  check: 'lafea-u4c-render-packet-v2-topology-guard',
  status: 'PASS',
  repeatedVertexTrianglesRejected: true,
  zeroAreaTrianglesRejected: true,
  unreferencedEngineeringElementsRejected: true,
}));

function packet() {
  return {
    schema: LAFEA_RENDER_PACKET_V2_SCHEMA,
    sceneRevision: 1,
    stageId: 'LAFEA.3',
    sourceElementType: 'T3',
    positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    vertexMeshNodeIds: ['N1', 'N2', 'N3'],
    drawTriangleIndices: new Uint32Array([0, 1, 2]),
    drawTriangleElementIndices: new Uint32Array([0]),
    sourceElementIds: ['E1'],
    fieldValues: new Float32Array([1, 2, 3]),
    qualityFlags: new Uint8Array([0, 0, 0]),
    field: {
      schema: LAFEA_RENDER_FIELD_SCHEMA,
      fieldId: 'FIELD-1',
      kind: 'PROJECTED_NODAL',
      units: 'MPa',
      sourcePath: 'qualifiedRecovery.displayFields.FIELD-1',
      valueRole: 'PRODUCER_PROJECTED_DISPLAY_ONLY',
      bounds: {
        minimum: 1,
        maximum: 3,
        source: 'QUALIFIED_RECOVERY_FIELD_BOUNDS',
        semanticHash: 'sha256:bounds-1',
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
      sourceHash: 'sha256:source-1',
      topologyHash: 'sha256:topology-1',
      meshHash: 'sha256:mesh-1',
      executionHash: 'sha256:execution-1',
      recoveryHash: 'sha256:recovery-1',
      displayGeometryHash: 'sha256:display-geometry-1',
      renderProfileHash: 'sha256:render-profile-1',
      producerRef: 'U4C-TOPOLOGY-GUARD',
    },
  };
}

function clone(value) {
  return {
    ...value,
    positions: new Float32Array(value.positions),
    vertexMeshNodeIds: [...value.vertexMeshNodeIds],
    drawTriangleIndices: new Uint32Array(value.drawTriangleIndices),
    drawTriangleElementIndices: new Uint32Array(value.drawTriangleElementIndices),
    sourceElementIds: [...value.sourceElementIds],
    fieldValues: new Float32Array(value.fieldValues),
    qualityFlags: new Uint8Array(value.qualityFlags),
    field: structuredClone(value.field),
    pickMap: structuredClone(value.pickMap),
    lineage: structuredClone(value.lineage),
  };
}
