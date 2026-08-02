/** Pure projection from governed visual primitives to viewport records. */
import { deepFreeze } from '../../core/shared-piping-model/index.js';
import { positiveNumber } from './topology-edit-geometry-math.js';

export function projectVisualGeometryToViewport(model, canonicalTopology) {
  const nodes = (canonicalTopology?.nodes || []).map(projectNode);
  const primitives = (model?.components || []).flatMap((component) => component.primitives);
  return deepFreeze({
    elements: [...nodes, ...primitives.flatMap(projectPrimitiveElement)],
    segments: primitives.flatMap(projectPrimitiveSegment),
  });
}

function projectNode(node) {
  return {
    id: node.id,
    entityId: node.id,
    type: 'node',
    x: node.position.x,
    y: node.position.y,
    z: node.position.z,
    pickTarget: {
      objectKind: 'node',
      objectId: node.id,
      nodeId: node.id,
    },
  };
}

function projectPrimitiveSegment(primitive) {
  const parameters = primitive.parameters;
  if (!parameters.start || !parameters.end) return [];
  const diagnosticDiameter = primitive.kind === 'DIAGNOSTIC_CENTERLINE'
    ? positiveNumber(parameters.radiusMm) * 2
    : null;
  const diameter = positiveNumber(parameters.outsideDiameterMm)
    ?? positiveNumber(parameters.startOutsideDiameterMm)
    ?? diagnosticDiameter;
  if (!diameter) return [];
  return [{
    id: primitive.primitiveId,
    entityId: primitive.canonicalEntityId,
    type: primitive.kind,
    start: parameters.start,
    end: parameters.end,
    points: parameters.arcPoints || null,
    radiusMm: diameter / 2,
    endRadiusMm: positiveNumber(parameters.endOutsideDiameterMm)
      ? parameters.endOutsideDiameterMm / 2
      : null,
    pickTarget: primitivePick(primitive),
  }];
}

function projectPrimitiveElement(primitive) {
  const position = primitive.parameters.center || primitive.parameters.position;
  if (!position) return [];
  return [{
    id: primitive.primitiveId,
    entityId: primitive.canonicalEntityId,
    type: primitive.kind,
    x: position.x,
    y: position.y,
    z: position.z,
    pickTarget: primitivePick(primitive),
  }];
}

function primitivePick(primitive) {
  return {
    objectKind: 'component',
    objectId: primitive.canonicalEntityId,
    sourcePaths: primitive.sourcePaths,
    workspaceEntityIds: primitive.workspaceEntityIds,
    partRole: primitive.partRole,
  };
}
