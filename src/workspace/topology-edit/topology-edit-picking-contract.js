/** Canonical picking crosswalk returned by the topology-edit viewport. */
export const TOPOLOGY_EDIT_PICK = 'TopologyEditPick.v1';

export function createTopologyEditPick(input = {}) {
  return Object.freeze({
    schema: TOPOLOGY_EDIT_PICK,
    modelRole: input.modelRole || 'draft',
    objectKind: input.objectKind || 'node',
    objectId: input.objectId || '',
    nodeId: input.nodeId || '',
    partRole: input.partRole || '',
    supportId: input.supportId || '',
    restraintId: input.restraintId || '',
    restraintFamily: input.restraintFamily || '',
    sourcePaths: Object.freeze([...(input.sourcePaths || [])]),
    workspaceEntityIds: Object.freeze([...(input.workspaceEntityIds || [])]),
    point: Object.freeze(input.point || { x: 0, y: 0, z: 0 }),
    edgeFraction: input.edgeFraction ?? null,
    connector: input.connector === true,
  });
}
