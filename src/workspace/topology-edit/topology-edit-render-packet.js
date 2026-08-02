/** Pure canonical-topology to viewport packet projection. */
import { deepFreeze } from '../../core/shared-piping-model/index.js';

function scenePart(topology) {
  const nodesById = new Map((topology.nodes ?? []).map((node) => [node.id, node]));
  const elements = (topology.nodes ?? []).map((node) => ({
    id: node.id,
    entityId: node.id,
    type: 'node',
    x: node.position.x,
    y: node.position.y,
    z: node.position.z,
  }));
  const segments = (topology.edges ?? []).map((edge) => edgeSegment(edge, nodesById)).filter(Boolean);
  return { elements, segments };
}

function edgeSegment(edge, nodesById) {
  const from = nodesById.get(edge.fromNodeId);
  const to = nodesById.get(edge.toNodeId);
  if (!from || !to) return null;
  return {
    id: edge.id,
    entityId: edge.componentKey || edge.id,
    type: edge.entityType || 'edge',
    start: from.position,
    end: to.position,
    radiusMm: Number.isFinite(edge.diameterMm) ? edge.diameterMm / 2 : null,
  };
}

export function buildTopologyEditRenderPacket(baseTopology, draftTopology) {
  return deepFreeze({
    source: scenePart(baseTopology),
    draft: scenePart(draftTopology),
  });
}

export function topologyEditEntityIdsForObject(topology, objectId) {
  const entityIds = new Set();
  if (String(objectId).startsWith('edge:')) {
    const edge = (topology.edges ?? []).find((row) => row.id === objectId);
    if (edge?.componentKey) entityIds.add(edge.componentKey);
  }
  if (String(objectId).startsWith('node:')) {
    addNodeEntityIds(topology, objectId, entityIds);
  }
  return [...entityIds].sort();
}

function addNodeEntityIds(topology, nodeId, entityIds) {
  for (const edge of topology.edges ?? []) {
    if ((edge.fromNodeId === nodeId || edge.toNodeId === nodeId) && edge.componentKey) {
      entityIds.add(edge.componentKey);
    }
  }
  for (const support of topology.supports ?? []) {
    if (support.nodeId === nodeId && support.entityId) entityIds.add(support.entityId);
  }
}
