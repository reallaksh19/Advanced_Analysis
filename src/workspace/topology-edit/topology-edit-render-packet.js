/** Pure canonical-topology to viewport and candidate-exact ghost projection. */
import { deepFreeze, semanticHash } from '../../core/shared-piping-model/index.js';
export const TOPOLOGY_EDIT_GHOST_PACKET_SCHEMA = 'TopologyEditGhostPacket.v1';
function scenePart(topology){const nodesById=new Map((topology.nodes??[]).map((node)=>[node.id,node]));const elements=(topology.nodes??[]).map((node)=>({id:node.id,entityId:node.id,type:'node',x:node.position.x,y:node.position.y,z:node.position.z}));const segments=(topology.edges??[]).map((edge)=>edgeSegment(edge,nodesById)).filter(Boolean);return{elements,segments};}
function edgeSegment(edge,nodesById){const from=nodesById.get(edge.fromNodeId);const to=nodesById.get(edge.toNodeId);if(!from||!to)return null;return{id:edge.id,entityId:edge.componentKey||edge.id,type:edge.entityType||'edge',start:from.position,end:to.position,radiusMm:Number.isFinite(edge.diameterMm)?edge.diameterMm/2:null};}
export function buildTopologyEditRenderPacket(baseTopology,draftTopology){return deepFreeze({source:scenePart(baseTopology),draft:scenePart(draftTopology)});}
function recordMap(rows){return new Map((rows??[]).map((row)=>[row.id,row]));}
function changedIds(beforeRows,afterRows){const before=recordMap(beforeRows);return new Set((afterRows??[]).filter((row)=>!before.has(row.id)||semanticHash(before.get(row.id))!==semanticHash(row)).map((row)=>row.id));}
function removedIds(beforeRows,afterRows){const after=new Set((afterRows??[]).map((row)=>row.id));return(beforeRows??[]).filter((row)=>!after.has(row.id)).map((row)=>row.id).sort();}
export function buildTopologyEditGhostPacket(currentTopology,candidateTopology,candidateDraftHash=null){
  const changedNodeIds=changedIds(currentTopology.nodes,candidateTopology.nodes);
  const changedEdgeIds=changedIds(currentTopology.edges,candidateTopology.edges);
  for(const edge of candidateTopology.edges??[]){if(changedNodeIds.has(edge.fromNodeId)||changedNodeIds.has(edge.toNodeId))changedEdgeIds.add(edge.id);}
  const candidate=scenePart(candidateTopology);
  const elements=candidate.elements.filter((row)=>changedNodeIds.has(row.id));
  const segments=candidate.segments.filter((row)=>changedEdgeIds.has(row.id));
  const material={schema:TOPOLOGY_EDIT_GHOST_PACKET_SCHEMA,priorCanonicalTopologyHash:currentTopology.canonicalTopologyHash,candidateCanonicalTopologyHash:candidateTopology.canonicalTopologyHash,candidateDraftHash,elements,segments,removedElementIds:removedIds(currentTopology.nodes,candidateTopology.nodes),removedSegmentIds:removedIds(currentTopology.edges,candidateTopology.edges)};
  return deepFreeze({...material,ghostHash:semanticHash(material)});
}
export function assertTopologyEditGhostPacket(value){if(value?.schema!==TOPOLOGY_EDIT_GHOST_PACKET_SCHEMA)throw new TypeError(`Topology edit ghost packet must use ${TOPOLOGY_EDIT_GHOST_PACKET_SCHEMA}.`);const material={...value};delete material.ghostHash;if(value.ghostHash!==semanticHash(material))throw new Error('TopologyEditGhostPacket: ghost hash mismatch.');return value;}
export function topologyEditEntityIdsForObject(topology,objectId){const entityIds=new Set();if(String(objectId).startsWith('edge:')){const edge=(topology.edges??[]).find((row)=>row.id===objectId);if(edge?.componentKey)entityIds.add(edge.componentKey);}if(String(objectId).startsWith('node:'))addNodeEntityIds(topology,objectId,entityIds);return[...entityIds].sort();}
function addNodeEntityIds(topology,nodeId,entityIds){for(const edge of topology.edges??[])if((edge.fromNodeId===nodeId||edge.toNodeId===nodeId)&&edge.componentKey)entityIds.add(edge.componentKey);for(const support of topology.supports??[])if(support.nodeId===nodeId&&support.entityId)entityIds.add(support.entityId);}
