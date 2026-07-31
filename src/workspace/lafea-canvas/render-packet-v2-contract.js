import {
  RESULT_FIELD_KINDS,
  SCHEMAS,
  contractError,
  deepFreeze,
  requireAsciiIdentity,
  requireFiniteNumber,
} from './contracts.js';
export const LAFEA_RENDER_PACKET_V2_SCHEMA = SCHEMAS.renderPacketV2;
export const LAFEA_RENDER_FIELD_SCHEMA = 'LafeaRenderField.v1';
export const LAFEA_RENDER_LINEAGE_SCHEMA = 'LafeaRenderLineage.v1';
export const LAFEA_RENDER_SOURCE_ELEMENT_TYPES = Object.freeze([
  'T3',
  'T6',
  'Q8',
  'CST_DKT_TRI3',
]);
export const LAFEA_RENDER_VALUE_ROLES = Object.freeze([
  'QUALIFIED_VERTEX_FIELD',
  'PRODUCER_PROJECTED_DISPLAY_ONLY',
  'DIAGNOSTIC_VERTEX_FIELD',
]);
export const LAFEA_SUPPORTED_COLOR_MAPS = Object.freeze([
  'AUTODESK_SIMULATION_RAINBOW',
  'JET',
  'COOL_WARM',
]);
const PACKET_KEYS = Object.freeze([
  'schema',
  'sceneRevision',
  'stageId',
  'sourceElementType',
  'positions',
  'vertexMeshNodeIds',
  'drawTriangleIndices',
  'drawTriangleElementIndices',
  'sourceElementIds',
  'fieldValues',
  'qualityFlags',
  'field',
  'pickMap',
  'lineage',
]);
const FIELD_KEYS = Object.freeze([
  'schema', 'fieldId', 'kind', 'units', 'sourcePath', 'valueRole',
  'bounds', 'colorMapId',
]);
const BOUNDS_KEYS = Object.freeze([
  'minimum', 'maximum', 'source', 'semanticHash',
]);
const LINEAGE_KEYS = Object.freeze([
  'schema', 'sourceHash', 'topologyHash', 'meshHash', 'executionHash',
  'recoveryHash', 'displayGeometryHash', 'renderProfileHash', 'producerRef',
]);
const PICK_MAP_KEYS = Object.freeze(['schema', 'sceneRevision', 'entries']);
const PICK_ENTRY_KEYS = Object.freeze([
  'drawGroup', 'primitiveStart', 'primitiveEnd', 'sourceEntityId',
  'meshEntityId', 'entityRole',
]);
/** Validate a GPU-ready packet without treating draw indices as engineering topology. */
export function requireRenderPacketV2(packet) {
  exactKeys(packet, PACKET_KEYS, 'LAFEA_RENDER_PACKET_V2_KEYS_INVALID');
  if (packet.schema !== LAFEA_RENDER_PACKET_V2_SCHEMA) {
    throw contractError('LAFEA_RENDER_PACKET_V2_SCHEMA_INVALID');
  }
  requireRevision(packet.sceneRevision);
  requireAsciiIdentity(packet.stageId, 'stageId');
  if (!LAFEA_RENDER_SOURCE_ELEMENT_TYPES.includes(packet.sourceElementType)) {
    throw contractError('LAFEA_RENDER_SOURCE_ELEMENT_TYPE_UNSUPPORTED', {
      sourceElementType: packet.sourceElementType,
    });
  }
  requireTyped(packet.positions, Float32Array, 'positions');
  requireTyped(packet.drawTriangleIndices, Uint32Array, 'drawTriangleIndices');
  requireTyped(
    packet.drawTriangleElementIndices,
    Uint32Array,
    'drawTriangleElementIndices',
  );
  requireTyped(packet.fieldValues, Float32Array, 'fieldValues');
  requireTyped(packet.qualityFlags, Uint8Array, 'qualityFlags');
  const vertexCount = packet.positions.length / 3;
  if (!Number.isInteger(vertexCount) || vertexCount < 3) {
    throw contractError('LAFEA_RENDER_POSITION_LENGTH_INVALID');
  }
  const triangleCount = packet.drawTriangleIndices.length / 3;
  if (!Number.isInteger(triangleCount) || triangleCount < 1) {
    throw contractError('LAFEA_RENDER_DRAW_TRIANGLE_LENGTH_INVALID');
  }
  requireIdentityArray(packet.vertexMeshNodeIds, vertexCount, 'vertexMeshNodeIds');
  requireIdentityArray(packet.sourceElementIds, null, 'sourceElementIds');
  requireUnique(packet.sourceElementIds, 'LAFEA_RENDER_SOURCE_ELEMENT_ID_COLLISION');
  if (!packet.sourceElementIds.length) {
    throw contractError('LAFEA_RENDER_SOURCE_ELEMENT_IDS_REQUIRED');
  }
  if (packet.drawTriangleElementIndices.length !== triangleCount) {
    throw contractError('LAFEA_RENDER_TRIANGLE_ELEMENT_MAP_LENGTH_INVALID');
  }
  if (packet.fieldValues.length !== vertexCount
    || packet.qualityFlags.length !== vertexCount) {
    throw contractError('LAFEA_RENDER_VERTEX_FIELD_LENGTH_INVALID');
  }
  if ([...packet.positions].some((value) => !Number.isFinite(value))) {
    throw contractError('LAFEA_RENDER_POSITION_NONFINITE');
  }
  if ([...packet.drawTriangleIndices].some((value) => value >= vertexCount)) {
    throw contractError('LAFEA_RENDER_DRAW_INDEX_OUT_OF_RANGE', { vertexCount });
  }
  for (let triangleIndex = 0; triangleIndex < triangleCount; triangleIndex += 1) {
    const start = triangleIndex * 3;
    const vertexIndices = packet.drawTriangleIndices.slice(start, start + 3);
    if (new Set(vertexIndices).size !== 3
      || triangleAreaSquared(packet.positions, vertexIndices) === 0) {
      throw contractError('LAFEA_RENDER_DEGENERATE_DRAW_TRIANGLE', { triangleIndex });
    }
  }
  if ([...packet.drawTriangleElementIndices].some(
    (value) => value >= packet.sourceElementIds.length,
  )) {
    throw contractError('LAFEA_RENDER_TRIANGLE_ELEMENT_INDEX_OUT_OF_RANGE', {
      sourceElementCount: packet.sourceElementIds.length,
    });
  }
  if (new Set(packet.drawTriangleElementIndices).size !== packet.sourceElementIds.length) {
    throw contractError('LAFEA_RENDER_SOURCE_ELEMENT_COVERAGE_INVALID');
  }
  for (let index = 0; index < vertexCount; index += 1) {
    if (!Number.isFinite(packet.fieldValues[index]) && packet.qualityFlags[index] === 0) {
      throw contractError('LAFEA_RENDER_UNRECOVERED_FIELD_FLAG_REQUIRED', {
        vertexIndex: index,
      });
    }
  }
  validateField(packet.field);
  validateLineage(packet.lineage);
  validatePickMap(packet.pickMap, packet, triangleCount);
  return packet;
}
/** Seal typed-array copies so producer buffers cannot mutate retained display evidence. */
export function sealRenderPacketV2(packet) {
  requireRenderPacketV2(packet);
  return deepFreeze({
    ...packet,
    positions: new Float32Array(packet.positions),
    vertexMeshNodeIds: Object.freeze([...packet.vertexMeshNodeIds]),
    drawTriangleIndices: new Uint32Array(packet.drawTriangleIndices),
    drawTriangleElementIndices: new Uint32Array(packet.drawTriangleElementIndices),
    sourceElementIds: Object.freeze([...packet.sourceElementIds]),
    fieldValues: new Float32Array(packet.fieldValues),
    qualityFlags: new Uint8Array(packet.qualityFlags),
    field: structuredClone(packet.field),
    pickMap: structuredClone(packet.pickMap),
    lineage: structuredClone(packet.lineage),
  });
}
function validateField(field) {
  exactKeys(field, FIELD_KEYS, 'LAFEA_RENDER_FIELD_KEYS_INVALID');
  if (field.schema !== LAFEA_RENDER_FIELD_SCHEMA) {
    throw contractError('LAFEA_RENDER_FIELD_SCHEMA_INVALID');
  }
  requireAsciiIdentity(field.fieldId, 'field.fieldId');
  requireAsciiIdentity(field.units, 'field.units');
  requireAsciiIdentity(field.sourcePath, 'field.sourcePath');
  if (!RESULT_FIELD_KINDS.includes(field.kind)) {
    throw contractError('LAFEA_RENDER_FIELD_KIND_UNSUPPORTED', { kind: field.kind });
  }
  if (!LAFEA_RENDER_VALUE_ROLES.includes(field.valueRole)) {
    throw contractError('LAFEA_RENDER_VALUE_ROLE_UNSUPPORTED', {
      valueRole: field.valueRole,
    });
  }
  if (field.kind === 'MESH_QUALITY') {
    if (field.valueRole !== 'DIAGNOSTIC_VERTEX_FIELD') {
      throw contractError('LAFEA_RENDER_MESH_QUALITY_ROLE_INVALID');
    }
  } else if (field.valueRole !== 'PRODUCER_PROJECTED_DISPLAY_ONLY') {
    throw contractError('LAFEA_RENDER_VERTEX_FIELD_AUTHORITY_INVALID');
  }
  if (!LAFEA_SUPPORTED_COLOR_MAPS.includes(field.colorMapId)) {
    throw contractError('LAFEA_RENDER_COLOR_MAP_UNSUPPORTED', {
      colorMapId: field.colorMapId,
    });
  }
  exactKeys(field.bounds, BOUNDS_KEYS, 'LAFEA_RENDER_FIELD_BOUNDS_KEYS_INVALID');
  requireFiniteNumber(field.bounds.minimum, 'field.bounds.minimum');
  requireFiniteNumber(field.bounds.maximum, 'field.bounds.maximum');
  if (field.bounds.maximum < field.bounds.minimum) {
    throw contractError('LAFEA_RENDER_FIELD_BOUNDS_INVALID');
  }
  requireAsciiIdentity(field.bounds.source, 'field.bounds.source');
  requireOpaqueReference(field.bounds.semanticHash, 'field.bounds.semanticHash');
}
function validateLineage(lineage) {
  exactKeys(lineage, LINEAGE_KEYS, 'LAFEA_RENDER_LINEAGE_KEYS_INVALID');
  if (lineage.schema !== LAFEA_RENDER_LINEAGE_SCHEMA) {
    throw contractError('LAFEA_RENDER_LINEAGE_SCHEMA_INVALID');
  }
  for (const field of LINEAGE_KEYS.filter((key) => !['schema', 'producerRef'].includes(key))) {
    requireOpaqueReference(lineage[field], `lineage.${field}`);
  }
  requireAsciiIdentity(lineage.producerRef, 'lineage.producerRef');
}
function validatePickMap(pickMap, packet, triangleCount) {
  exactKeys(pickMap, PICK_MAP_KEYS, 'LAFEA_RENDER_PICK_MAP_KEYS_INVALID');
  if (pickMap.schema !== 'LafeaPickMap.v1' || !Array.isArray(pickMap.entries)) {
    throw contractError('LAFEA_RENDER_PICK_MAP_INVALID');
  }
  if (pickMap.sceneRevision !== packet.sceneRevision) {
    throw contractError('LAFEA_RENDER_PICK_MAP_REVISION_MISMATCH');
  }
  pickMap.entries.forEach((entry, index) => {
    exactKeys(entry, PICK_ENTRY_KEYS, 'LAFEA_RENDER_PICK_MAP_ENTRY_KEYS_INVALID');
    if (entry.drawGroup !== 'TRIANGLES'
      || !Number.isInteger(entry.primitiveStart) || entry.primitiveStart < 0
      || !Number.isInteger(entry.primitiveEnd)
      || entry.primitiveEnd <= entry.primitiveStart
      || entry.primitiveEnd > triangleCount) {
      throw contractError('LAFEA_RENDER_PICK_MAP_ENTRY_INVALID', { index });
    }
    requireAsciiIdentity(entry.sourceEntityId, `pickMap.entries[${index}].sourceEntityId`);
    requireAsciiIdentity(entry.meshEntityId, `pickMap.entries[${index}].meshEntityId`);
    if (entry.entityRole !== 'ELEMENT') {
      throw contractError('LAFEA_RENDER_PICK_MAP_ROLE_INVALID', { index });
    }
  });
  for (let triangleIndex = 0; triangleIndex < triangleCount; triangleIndex += 1) {
    const matches = pickMap.entries.filter(
      (entry) => triangleIndex >= entry.primitiveStart
        && triangleIndex < entry.primitiveEnd,
    );
    if (matches.length !== 1) {
      throw contractError('LAFEA_RENDER_PICK_MAP_COVERAGE_INVALID', {
        triangleIndex,
        matchCount: matches.length,
      });
    }
    const sourceElementId = packet.sourceElementIds[
      packet.drawTriangleElementIndices[triangleIndex]
    ];
    if (matches[0].meshEntityId !== sourceElementId) {
      throw contractError('LAFEA_RENDER_PICK_MAP_ELEMENT_ID_MISMATCH', {
        triangleIndex,
        expected: sourceElementId,
        actual: matches[0].meshEntityId,
      });
    }
  }
}
function triangleAreaSquared(positions, indices) {
  const point = (index) => positions.slice(index * 3, (index * 3) + 3);
  const [a, b, c] = [...indices].map(point);
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const cross = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  return cross.reduce((sum, value) => sum + (value * value), 0);
}
function requireTyped(value, Constructor, field) {
  if (!(value instanceof Constructor)) {
    throw contractError('LAFEA_RENDER_TYPED_ARRAY_REQUIRED', {
      field,
      expected: Constructor.name,
    });
  }
}
function requireIdentityArray(value, expectedLength, field) {
  if (!Array.isArray(value)
    || (expectedLength !== null && value.length !== expectedLength)) {
    throw contractError('LAFEA_RENDER_IDENTITY_ARRAY_INVALID', {
      field,
      expectedLength,
      actualLength: value?.length ?? null,
    });
  }
  value.forEach((identity, index) => requireAsciiIdentity(identity, `${field}[${index}]`));
}
function requireUnique(values, code) {
  if (new Set(values).size !== values.length) throw contractError(code);
}
function requireRevision(value) {
  if (!Number.isInteger(value) || value < 0) {
    throw contractError('LAFEA_RENDER_SCENE_REVISION_INVALID');
  }
}

function requireOpaqueReference(value, field) {
  requireAsciiIdentity(value, field);
  if (/\s/u.test(value)) throw contractError('LAFEA_RENDER_OPAQUE_REFERENCE_INVALID', { field });
}

function exactKeys(value, keys, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw contractError(code, { reason: 'NOT_A_RECORD' });
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw contractError(code, { actual, expected });
  }
}
