import {
  assertExactKeys,
  contractError,
  deepFreeze,
  requireAsciiIdentity,
  requireFiniteNumber,
} from './lafea-canvas/contracts.js';

export const LAFEA_SOURCE_PRIMITIVE_SCHEMA = 'lafea-source-primitive/v1';
export const LAFEA_SOURCE_PRIMITIVE_KINDS = Object.freeze([
  'SOURCE_POINT',
  'SOURCE_ELEMENT',
]);

const PRIMITIVE_KEYS = Object.freeze([
  'schema',
  'primitiveId',
  'kind',
  'stageId',
  'sourceEntityId',
  'sourcePath',
  'sceneEntityId',
  'coordinates',
  'nodeIds',
  'parentIdentity',
  'displayRole',
]);
const PARENT_KEYS = Object.freeze([
  'authorityLayer',
  'stageId',
  'sourceEntityId',
  'sourcePath',
]);
const VECTOR_KEYS = Object.freeze(['x', 'y', 'z']);

export function createSourcePrimitives(stageId, geometry) {
  return [
    ...geometry.nodes.map((node) => pointPrimitive(stageId, node)),
    ...geometry.elements.map((element) => elementPrimitive(
      stageId,
      element,
      geometry.nodes,
    )),
  ];
}

export function validateSourcePrimitive(value) {
  assertExactKeys(value, PRIMITIVE_KEYS, 'LAFEA_SOURCE_PRIMITIVE_KEYS_INVALID');
  if (value.schema !== LAFEA_SOURCE_PRIMITIVE_SCHEMA
    || !LAFEA_SOURCE_PRIMITIVE_KINDS.includes(value.kind)) {
    throw contractError('LAFEA_SOURCE_PRIMITIVE_SCHEMA_INVALID');
  }
  requireAsciiIdentity(value.primitiveId, 'primitiveId');
  requireAsciiIdentity(value.stageId, 'stageId');
  requireAsciiIdentity(value.sourceEntityId, 'sourceEntityId');
  requireAsciiIdentity(value.sourcePath, 'sourcePath');
  requireAsciiIdentity(value.sceneEntityId, 'sceneEntityId');
  if (value.displayRole !== 'SVG_SOURCE_AUTHORING') {
    throw contractError('LAFEA_SOURCE_PRIMITIVE_DISPLAY_ROLE_INVALID');
  }
  if (!Array.isArray(value.coordinates) || !value.coordinates.length
    || !Array.isArray(value.nodeIds) || !value.nodeIds.length) {
    throw contractError('LAFEA_SOURCE_PRIMITIVE_GEOMETRY_REQUIRED');
  }
  value.coordinates.forEach((row) => {
    assertExactKeys(row, VECTOR_KEYS, 'LAFEA_SOURCE_COORDINATE_KEYS_INVALID');
    requireFiniteNumber(row.x, 'coordinate.x');
    requireFiniteNumber(row.y, 'coordinate.y');
    requireFiniteNumber(row.z, 'coordinate.z');
  });
  value.nodeIds.forEach((id, index) => requireAsciiIdentity(id, `nodeIds[${index}]`));
  assertExactKeys(value.parentIdentity, PARENT_KEYS, 'LAFEA_SOURCE_PARENT_KEYS_INVALID');
  if (value.parentIdentity.authorityLayer !== 'SOURCE'
    || value.parentIdentity.stageId !== value.stageId
    || value.parentIdentity.sourceEntityId !== value.sourceEntityId
    || value.parentIdentity.sourcePath !== value.sourcePath) {
    throw contractError('LAFEA_SOURCE_PARENT_IDENTITY_INVALID');
  }
  return deepFreeze(structuredClone(value));
}

function pointPrimitive(stageId, node) {
  return validateSourcePrimitive({
    schema: LAFEA_SOURCE_PRIMITIVE_SCHEMA,
    primitiveId: `${stageId}:POINT:${node.sourceEntityId}`,
    kind: 'SOURCE_POINT',
    stageId,
    sourceEntityId: node.sourceEntityId,
    sourcePath: node.sourcePath,
    sceneEntityId: node.sceneEntityId,
    coordinates: [{ x: node.x, y: node.y, z: node.z }],
    nodeIds: [node.nodeId],
    parentIdentity: parentIdentity(stageId, node.sourceEntityId, node.sourcePath),
    displayRole: 'SVG_SOURCE_AUTHORING',
  });
}

function elementPrimitive(stageId, sourceElement, sourceNodes) {
  const nodeMap = new Map(sourceNodes.map((node) => [node.nodeId, node]));
  const coordinates = sourceElement.nodeIds.map((nodeId) => {
    const node = nodeMap.get(nodeId);
    if (!node) {
      throw contractError('LAFEA_SOURCE_ELEMENT_NODE_NOT_FOUND', {
        sourceEntityId: sourceElement.sourceEntityId,
        nodeId,
      });
    }
    return { x: node.x, y: node.y, z: node.z };
  });
  return validateSourcePrimitive({
    schema: LAFEA_SOURCE_PRIMITIVE_SCHEMA,
    primitiveId: `${stageId}:ELEMENT:${sourceElement.sourceEntityId}`,
    kind: 'SOURCE_ELEMENT',
    stageId,
    sourceEntityId: sourceElement.sourceEntityId,
    sourcePath: sourceElement.sourcePath,
    sceneEntityId: sourceElement.sceneEntityId,
    coordinates,
    nodeIds: [...sourceElement.nodeIds],
    parentIdentity: parentIdentity(
      stageId,
      sourceElement.sourceEntityId,
      sourceElement.sourcePath,
    ),
    displayRole: 'SVG_SOURCE_AUTHORING',
  });
}

function parentIdentity(stageId, sourceEntityId, sourcePath) {
  return {
    authorityLayer: 'SOURCE',
    stageId,
    sourceEntityId,
    sourcePath,
  };
}
