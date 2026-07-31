// src/workspace/lafea-canvas/render-packet-contract.js

import {
  ELEMENT_TYPES,
  SCHEMAS,
  contractError,
  deepFreeze,
} from './contracts.js';

export function requireRenderPacket(packet) {
  if (packet?.schema !== SCHEMAS.renderPacket) {
    throw contractError('LAFEA_RENDER_PACKET_SCHEMA_INVALID');
  }

  requireTyped(packet.positions, Float32Array, 'positions');
  requireTyped(packet.indices, Uint32Array, 'indices');
  requireTyped(packet.elementIdIndices, Uint32Array, 'elementIdIndices');
  requireTyped(packet.fieldValues, Float32Array, 'fieldValues');
  requireTyped(packet.qualityFlags, Uint8Array, 'qualityFlags');

  if (!ELEMENT_TYPES.includes(packet.elementType)) {
    throw contractError('LAFEA_RENDER_ELEMENT_TYPE_UNSUPPORTED', {
      elementType: packet.elementType,
    });
  }

  if (packet.indices.length % packet.nodesPerElement !== 0) {
    throw contractError('LAFEA_RENDER_CONNECTIVITY_LENGTH_INVALID');
  }

  if (!Number.isInteger(packet.sceneRevision) || packet.sceneRevision < 0) {
    throw contractError('LAFEA_RENDER_SCENE_REVISION_INVALID');
  }

  if (packet.sceneRevision !== packet.pickMap?.sceneRevision) {
    throw contractError('LAFEA_RENDER_PICK_MAP_REVISION_MISMATCH');
  }

  requirePacketRelationships(packet);
  return packet;
}

export function sealRenderPacket(input) {
  requireRenderPacket(input);
  return deepFreeze({
    ...input,
    positions: new Float32Array(input.positions),
    indices: new Uint32Array(input.indices),
    elementIdIndices: new Uint32Array(input.elementIdIndices),
    fieldValues: new Float32Array(input.fieldValues),
    qualityFlags: new Uint8Array(input.qualityFlags),
    pickMap: structuredClone(input.pickMap),
  });
}

function requireTyped(value, Constructor, field) {
  if (!(value instanceof Constructor)) {
    throw contractError('LAFEA_RENDER_TYPED_ARRAY_REQUIRED', {
      field,
      expected: Constructor.name,
    });
  }
}

function requirePacketRelationships(packet) {
  const vertexCount = packet.positions.length / 3;
  const elementCount = packet.indices.length / packet.nodesPerElement;
  if (!Number.isInteger(vertexCount) || vertexCount < 1) {
    throw contractError('LAFEA_RENDER_POSITION_LENGTH_INVALID');
  }
  if (!Number.isInteger(packet.nodesPerElement) || packet.nodesPerElement < 3
    || !Number.isInteger(elementCount) || elementCount < 1) {
    throw contractError('LAFEA_RENDER_CONNECTIVITY_LENGTH_INVALID');
  }
  if (packet.fieldValues.length !== vertexCount || packet.qualityFlags.length !== vertexCount) {
    throw contractError('LAFEA_RENDER_VERTEX_FIELD_LENGTH_INVALID');
  }
  if (packet.elementIdIndices.length !== elementCount) {
    throw contractError('LAFEA_RENDER_ELEMENT_ID_LENGTH_INVALID');
  }
  if (packet.pickMap?.schema !== SCHEMAS.pickMap || !Array.isArray(packet.pickMap.entries)) {
    throw contractError('LAFEA_RENDER_PICK_MAP_INVALID');
  }
  if ([...packet.positions].some((value) => !Number.isFinite(value))) {
    throw contractError('LAFEA_RENDER_POSITION_NONFINITE');
  }
  if ([...packet.indices].some((value) => value >= vertexCount)) {
    throw contractError('LAFEA_RENDER_INDEX_OUT_OF_RANGE', { vertexCount });
  }
  for (let index = 0; index < vertexCount; index += 1) {
    if (!Number.isFinite(packet.fieldValues[index]) && packet.qualityFlags[index] === 0) {
      throw contractError('LAFEA_RENDER_UNRECOVERED_FIELD_FLAG_REQUIRED', { vertexIndex: index });
    }
  }
}

// Worker-owned packing function.
// The function may copy and index qualified data only.

export function packQualifiedMeshForRendering(input) {
  // BEGIN_AGENT_FILL:C3-PACK-QUALIFIED-MESH
  const vertexCount = input.positions?.length / 3;
  const elementCount = input.indices?.length / input.nodesPerElement;
  if (!Number.isInteger(vertexCount) || vertexCount < 1) {
    throw contractError('LAFEA_RENDER_POSITION_LENGTH_INVALID');
  }
  if (!Number.isInteger(input.nodesPerElement) || input.nodesPerElement < 3
    || !Number.isInteger(elementCount) || elementCount < 1) {
    throw contractError('LAFEA_RENDER_CONNECTIVITY_LENGTH_INVALID');
  }
  if (input.fieldValues?.length !== vertexCount
    || input.qualityFlags?.length !== vertexCount) {
    throw contractError('LAFEA_RENDER_VERTEX_FIELD_LENGTH_INVALID', {
      vertexCount,
      fieldValueCount: input.fieldValues?.length ?? null,
      qualityFlagCount: input.qualityFlags?.length ?? null,
    });
  }
  if (input.elementIdIndices?.length !== elementCount) {
    throw contractError('LAFEA_RENDER_ELEMENT_ID_LENGTH_INVALID', {
      elementCount,
      elementIdCount: input.elementIdIndices?.length ?? null,
    });
  }
  if (input.pickMap?.schema !== SCHEMAS.pickMap
    || input.pickMap.sceneRevision !== input.sceneRevision
    || !Array.isArray(input.pickMap.entries)) {
    throw contractError('LAFEA_RENDER_PICK_MAP_INVALID');
  }
  if ([...input.positions].some((value) => !Number.isFinite(value))) {
    throw contractError('LAFEA_RENDER_POSITION_NONFINITE');
  }
  if ([...input.indices].some((value) => !Number.isInteger(value) || value < 0 || value >= vertexCount)) {
    throw contractError('LAFEA_RENDER_INDEX_OUT_OF_RANGE', { vertexCount });
  }
  for (let index = 0; index < vertexCount; index += 1) {
    if (!Number.isFinite(input.fieldValues[index]) && input.qualityFlags[index] === 0) {
      throw contractError('LAFEA_RENDER_UNRECOVERED_FIELD_FLAG_REQUIRED', { vertexIndex: index });
    }
  }
  const packet = {
    schema: 'LafeaRenderPacket.v1',
    sceneRevision: input.sceneRevision,
    elementType: input.elementType,
    nodesPerElement: input.nodesPerElement,
    positions: new Float32Array(input.positions),
    indices: new Uint32Array(input.indices),
    elementIdIndices: new Uint32Array(input.elementIdIndices),
    fieldValues: new Float32Array(input.fieldValues),
    qualityFlags: new Uint8Array(input.qualityFlags),
    pickMap: input.pickMap,
  };
  return sealRenderPacket(packet);
  // END_AGENT_FILL:C3-PACK-QUALIFIED-MESH
}

function requiredSlot(slotId) {
  const error = new Error(`Required implementation slot ${slotId} is empty.`);
  error.code = 'LAFEA_REQUIRED_SLOT_UNIMPLEMENTED';
  error.slotId = slotId;
  return error;
}
