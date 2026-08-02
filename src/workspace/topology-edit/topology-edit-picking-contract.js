/** Canonical picking crosswalk returned by the topology-edit viewport. */
import { deepFreeze, stringValue } from '../../core/shared-piping-model/index.js';

export const TOPOLOGY_EDIT_PICK = 'TopologyEditPick.v1';

export function createTopologyEditPick(input = {}) {
  return deepFreeze({
    schema: TOPOLOGY_EDIT_PICK,
    modelRole: stringValue(input.modelRole || 'draft').toLowerCase(),
    objectKind: stringValue(input.objectKind || 'node').toLowerCase(),
    objectId: stringValue(input.objectId),
    nodeId: stringValue(input.nodeId),
    partRole: stringValue(input.partRole),
    supportId: stringValue(input.supportId),
    restraintId: stringValue(input.restraintId),
    restraintFamily: stringValue(input.restraintFamily).toUpperCase(),
    sourcePaths: [...new Set((input.sourcePaths || []).map(stringValue).filter(Boolean))].sort(),
    workspaceEntityIds: [...new Set((input.workspaceEntityIds || []).map(stringValue).filter(Boolean))].sort(),
    point: normalizePoint(input.point),
    edgeFraction: input.edgeFraction ?? null,
    connector: input.connector === true,
  });
}

function normalizePoint(value) {
  const point = value || { x: 0, y: 0, z: 0 };
  if (![point.x, point.y, point.z].every((row) => Number.isFinite(Number(row)))) {
    throw new TypeError('Topology Edit pick point must contain finite x, y, and z coordinates.');
  }
  return {
    x: Number(point.x),
    y: Number(point.y),
    z: Number(point.z),
  };
}
