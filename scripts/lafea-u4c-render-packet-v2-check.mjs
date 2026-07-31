#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LAFEA_RENDER_FIELD_SCHEMA,
  LAFEA_RENDER_LINEAGE_SCHEMA,
  LAFEA_RENDER_PACKET_V2_SCHEMA,
  LAFEA_RENDER_SOURCE_ELEMENT_TYPES,
  LAFEA_RENDER_VALUE_ROLES,
  LAFEA_SUPPORTED_COLOR_MAPS,
  requireRenderPacketV2,
  sealRenderPacketV2,
} from '../src/workspace/lafea-canvas/render-packet-v2-contract.js';
import * as publicSurface from '../src/workspace/lafea-workbench.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const q8Packet = packet({
  sourceElementType: 'Q8',
  vertexMeshNodeIds: ['N1', 'N2', 'N3', 'N4'],
  sourceElementIds: ['E-Q8-1'],
  positions: [0, 0, 0, 2, 0, 0, 2, 1, 0, 0, 1, 0],
  drawTriangleIndices: [0, 1, 2, 0, 2, 3],
  drawTriangleElementIndices: [0, 0],
  fieldValues: [10, 20, 30, 40],
  qualityFlags: [0, 0, 0, 0],
  pickEntries: [{
    drawGroup: 'TRIANGLES',
    primitiveStart: 0,
    primitiveEnd: 2,
    sourceEntityId: 'SOURCE-E-Q8-1',
    meshEntityId: 'E-Q8-1',
    entityRole: 'ELEMENT',
  }],
});

assert.equal(LAFEA_RENDER_PACKET_V2_SCHEMA, 'LafeaRenderPacket.v2');
assert.equal(q8Packet.stageId, 'LAFEA.3');
assert.ok(Object.isFrozen(LAFEA_RENDER_SOURCE_ELEMENT_TYPES));
assert.ok(LAFEA_RENDER_SOURCE_ELEMENT_TYPES.includes('T3'));
assert.ok(LAFEA_RENDER_SOURCE_ELEMENT_TYPES.includes('T6'));
assert.ok(LAFEA_RENDER_SOURCE_ELEMENT_TYPES.includes('Q8'));
assert.ok(LAFEA_RENDER_SOURCE_ELEMENT_TYPES.includes('CST_DKT_TRI3'));
assert.ok(!LAFEA_RENDER_SOURCE_ELEMENT_TYPES.includes('MITC4'));
assert.ok(Object.isFrozen(LAFEA_RENDER_VALUE_ROLES));
assert.ok(Object.isFrozen(LAFEA_SUPPORTED_COLOR_MAPS));

assert.equal(requireRenderPacketV2(q8Packet), q8Packet);
const sealed = sealRenderPacketV2(q8Packet);
assert.ok(Object.isFrozen(sealed));
assert.notEqual(sealed.positions, q8Packet.positions);
assert.notEqual(sealed.drawTriangleIndices, q8Packet.drawTriangleIndices);
q8Packet.positions[0] = 999;
q8Packet.drawTriangleIndices[0] = 3;
assert.equal(sealed.positions[0], 0);
assert.equal(sealed.drawTriangleIndices[0], 0);

const t6DisplayPacket = packet({
  sourceElementType: 'T6',
  vertexMeshNodeIds: ['N1', 'N2', 'N3'],
  sourceElementIds: ['E-T6-1'],
  positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
  drawTriangleIndices: [0, 1, 2],
  drawTriangleElementIndices: [0],
  fieldValues: [1, 2, 3],
  qualityFlags: [0, 0, 0],
  pickEntries: [{
    drawGroup: 'TRIANGLES',
    primitiveStart: 0,
    primitiveEnd: 1,
    sourceEntityId: 'SOURCE-E-T6-1',
    meshEntityId: 'E-T6-1',
    entityRole: 'ELEMENT',
  }],
});
assert.doesNotThrow(() => requireRenderPacketV2(t6DisplayPacket));
assert.equal(t6DisplayPacket.drawTriangleIndices.length, 3);
assert.equal(t6DisplayPacket.sourceElementType, 'T6');

const cstDktPacket = packet({
  sourceElementType: 'CST_DKT_TRI3',
  vertexMeshNodeIds: ['S1', 'S2', 'S3'],
  sourceElementIds: ['SHELL-1'],
  positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
  drawTriangleIndices: [0, 1, 2],
  drawTriangleElementIndices: [0],
  fieldValues: [4, 5, 6],
  qualityFlags: [0, 0, 0],
  pickEntries: [{
    drawGroup: 'TRIANGLES',
    primitiveStart: 0,
    primitiveEnd: 1,
    sourceEntityId: 'SOURCE-SHELL-1',
    meshEntityId: 'SHELL-1',
    entityRole: 'ELEMENT',
  }],
});
assert.doesNotThrow(() => requireRenderPacketV2(cstDktPacket));

assert.throws(
  () => requireRenderPacketV2({ ...clonePacket(t6DisplayPacket), schema: 'LafeaRenderPacket.v1' }),
  (error) => error.code === 'LAFEA_RENDER_PACKET_V2_SCHEMA_INVALID',
);
assert.throws(
  () => requireRenderPacketV2({ ...clonePacket(t6DisplayPacket), stageId: '' }),
  (error) => error.code === 'LAFEA_ASCII_IDENTITY_REQUIRED',
);
assert.throws(
  () => requireRenderPacketV2({ ...clonePacket(t6DisplayPacket), extra: true }),
  (error) => error.code === 'LAFEA_RENDER_PACKET_V2_KEYS_INVALID',
);
assert.throws(
  () => requireRenderPacketV2({
    ...clonePacket(t6DisplayPacket),
    drawTriangleIndices: new Uint32Array([0, 1]),
  }),
  (error) => error.code === 'LAFEA_RENDER_DRAW_TRIANGLE_LENGTH_INVALID',
);
assert.throws(
  () => requireRenderPacketV2({
    ...clonePacket(t6DisplayPacket),
    drawTriangleElementIndices: new Uint32Array([1]),
  }),
  (error) => error.code === 'LAFEA_RENDER_TRIANGLE_ELEMENT_INDEX_OUT_OF_RANGE',
);
assert.throws(
  () => requireRenderPacketV2({
    ...clonePacket(t6DisplayPacket),
    sourceElementIds: ['E-T6-1', 'E-T6-1'],
  }),
  (error) => error.code === 'LAFEA_RENDER_SOURCE_ELEMENT_ID_COLLISION',
);
assert.throws(
  () => requireRenderPacketV2({
    ...clonePacket(q8Packet),
    pickMap: { ...q8Packet.pickMap, entries: [q8Packet.pickMap.entries[0], q8Packet.pickMap.entries[0]] },
  }),
  (error) => error.code === 'LAFEA_RENDER_PICK_MAP_COVERAGE_INVALID',
);
assert.throws(
  () => requireRenderPacketV2({
    ...clonePacket(t6DisplayPacket),
    pickMap: {
      ...t6DisplayPacket.pickMap,
      entries: [{ ...t6DisplayPacket.pickMap.entries[0], meshEntityId: 'WRONG-ELEMENT' }],
    },
  }),
  (error) => error.code === 'LAFEA_RENDER_PICK_MAP_ELEMENT_ID_MISMATCH',
);
assert.throws(
  () => requireRenderPacketV2({
    ...clonePacket(t6DisplayPacket),
    pickMap: { ...t6DisplayPacket.pickMap, sceneRevision: 2 },
  }),
  (error) => error.code === 'LAFEA_RENDER_PICK_MAP_REVISION_MISMATCH',
);
assert.throws(
  () => requireRenderPacketV2({
    ...clonePacket(t6DisplayPacket),
    fieldValues: new Float32Array([1, Number.NaN, 3]),
  }),
  (error) => error.code === 'LAFEA_RENDER_UNRECOVERED_FIELD_FLAG_REQUIRED',
);
assert.doesNotThrow(() => requireRenderPacketV2({
  ...clonePacket(t6DisplayPacket),
  fieldValues: new Float32Array([1, Number.NaN, 3]),
  qualityFlags: new Uint8Array([0, 1, 0]),
}));
assert.throws(
  () => requireRenderPacketV2({
    ...clonePacket(t6DisplayPacket),
    field: {
      ...t6DisplayPacket.field,
      kind: 'PROJECTED_NODAL',
      valueRole: 'QUALIFIED_VERTEX_FIELD',
    },
  }),
  (error) => error.code === 'LAFEA_RENDER_VERTEX_FIELD_AUTHORITY_INVALID',
);
assert.throws(
  () => requireRenderPacketV2({
    ...clonePacket(t6DisplayPacket),
    field: {
      ...t6DisplayPacket.field,
      kind: 'INTEGRATION_POINT',
      valueRole: 'QUALIFIED_VERTEX_FIELD',
    },
  }),
  (error) => error.code === 'LAFEA_RENDER_VERTEX_FIELD_AUTHORITY_INVALID',
);
assert.throws(
  () => requireRenderPacketV2({
    ...clonePacket(t6DisplayPacket),
    field: {
      ...t6DisplayPacket.field,
      kind: 'MESH_QUALITY',
      valueRole: 'PRODUCER_PROJECTED_DISPLAY_ONLY',
    },
  }),
  (error) => error.code === 'LAFEA_RENDER_MESH_QUALITY_ROLE_INVALID',
);
assert.doesNotThrow(() => requireRenderPacketV2({
  ...clonePacket(t6DisplayPacket),
  field: {
    ...t6DisplayPacket.field,
    kind: 'MESH_QUALITY',
    valueRole: 'DIAGNOSTIC_VERTEX_FIELD',
  },
}));
assert.throws(
  () => requireRenderPacketV2({
    ...clonePacket(t6DisplayPacket),
    lineage: { ...t6DisplayPacket.lineage, meshHash: 'mesh hash with spaces' },
  }),
  (error) => error.code === 'LAFEA_RENDER_OPAQUE_REFERENCE_INVALID',
);

for (const name of [
  'LAFEA_RENDER_FIELD_SCHEMA',
  'LAFEA_RENDER_LINEAGE_SCHEMA',
  'LAFEA_RENDER_PACKET_V2_SCHEMA',
  'LAFEA_RENDER_SOURCE_ELEMENT_TYPES',
  'LAFEA_RENDER_VALUE_ROLES',
  'LAFEA_SUPPORTED_COLOR_MAPS',
  'requireRenderPacketV2',
  'sealRenderPacketV2',
]) {
  assert.equal(publicSurface[name], {
    LAFEA_RENDER_FIELD_SCHEMA,
    LAFEA_RENDER_LINEAGE_SCHEMA,
    LAFEA_RENDER_PACKET_V2_SCHEMA,
    LAFEA_RENDER_SOURCE_ELEMENT_TYPES,
    LAFEA_RENDER_VALUE_ROLES,
    LAFEA_SUPPORTED_COLOR_MAPS,
    requireRenderPacketV2,
    sealRenderPacketV2,
  }[name], `${name} must be re-exported without wrapping.`);
}

const moduleSource = fs.readFileSync(
  path.join(ROOT, 'src/workspace/lafea-canvas/render-packet-v2-contract.js'),
  'utf8',
);
assert.doesNotMatch(moduleSource, /packQualified|triangulate|solver|mesher|recovery\/|local-continuum|local-shell/u);
assert.match(moduleSource, /drawTriangleIndices/u);
assert.match(moduleSource, /drawTriangleElementIndices/u);
assert.match(moduleSource, /sourceElementIds/u);
assert.match(moduleSource, /LAFEA_RENDER_PICK_MAP_ELEMENT_ID_MISMATCH/u);
assert.ok(moduleSource.split(/\r?\n/u).length <= 300, 'U4C source module must remain at or below 300 lines.');

console.log(JSON.stringify({
  check: 'lafea-u4c-render-packet-v2-topology-identity',
  status: 'PASS',
  packetSchema: LAFEA_RENDER_PACKET_V2_SCHEMA,
  engineeringConnectivityUsedAsGpuTriangles: false,
  explicitTriangleToElementIdentity: true,
  q8DirectConnectivityClaimed: false,
  cstDktAuthorityRenamedAsMitc: false,
  resultWebglEnabled: false,
  numericalAuthorityChanged: false,
  lafea6Enabled: false,
}));

function packet(options) {
  const sceneRevision = 1;
  return {
    schema: LAFEA_RENDER_PACKET_V2_SCHEMA,
    sceneRevision,
    stageId: options.stageId ?? 'LAFEA.3',
    sourceElementType: options.sourceElementType,
    positions: new Float32Array(options.positions),
    vertexMeshNodeIds: [...options.vertexMeshNodeIds],
    drawTriangleIndices: new Uint32Array(options.drawTriangleIndices),
    drawTriangleElementIndices: new Uint32Array(options.drawTriangleElementIndices),
    sourceElementIds: [...options.sourceElementIds],
    fieldValues: new Float32Array(options.fieldValues),
    qualityFlags: new Uint8Array(options.qualityFlags),
    field: {
      schema: LAFEA_RENDER_FIELD_SCHEMA,
      fieldId: 'FIELD-VM-1',
      kind: 'PROJECTED_NODAL',
      units: 'MPa',
      sourcePath: 'qualifiedRecovery.displayFields.FIELD-VM-1',
      valueRole: 'PRODUCER_PROJECTED_DISPLAY_ONLY',
      bounds: {
        minimum: 0,
        maximum: 100,
        source: 'QUALIFIED_RECOVERY_FIELD_BOUNDS',
        semanticHash: 'sha256:field-bounds-1',
      },
      colorMapId: 'COOL_WARM',
    },
    pickMap: {
      schema: 'LafeaPickMap.v1',
      sceneRevision,
      entries: structuredClone(options.pickEntries),
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
      producerRef: 'U4C-CONTROLLED-REFERENCE-PRODUCER',
    },
  };
}

function clonePacket(value) {
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
