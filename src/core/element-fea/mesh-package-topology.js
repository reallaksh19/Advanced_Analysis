import { deepFreeze } from '../shared-piping-model/immutable.js';
import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { ELEMENT_TYPES } from './constants.js';
import { assertNoHangingNodes, assertNoImproperEdgeIntersections } from './element-quality.js';
import { Q4_GAUSS_POINTS, Q4_NATURAL_CORNERS } from './integration-points.js';
import { createQ4PointGeometry } from './q4-geometry.js';
import { signedArea } from './t3-geometry.js';
import { adapterDiagnostic, adapterFailure, compareIdentity } from './mesh-package-contract.js';
import { EDGE_CLASSIFICATIONS, LOCAL_EDGE_IDS } from './mesh-package-constants.js';

export function buildMeshPackageTopology(pkg, profile) {
  qualifyCapacity(pkg, profile);
  const nodeMap = new Map(pkg.nodes.map((row) => [row.nodeId, row]));
  const diagnostics = nearCoincidentDiagnostics(pkg.nodes, profile.coordinateAbsoluteTolerance);
  rejectExactCoincident(pkg.nodes);
  const elements = qualifyElements(pkg.elements, nodeMap, profile);
  rejectDuplicateConnectivity(elements);
  const edgeIndex = buildEdgeIndex(elements, profile.maximumEdges);
  qualifyGlobalTopology(pkg.nodes, elements, profile.areaAbsoluteTolerance);
  const boundaryEvidence = resolveBoundaries(pkg.boundaries, elements, edgeIndex);
  const pointEvidence = resolvePoints(pkg.points, nodeMap);
  const topologyEvidence = deepFreeze(createTopologyEvidence(edgeIndex, boundaryEvidence));
  const entityEvidence = deepFreeze({ regions: pkg.regions, boundaries: boundaryEvidence, points: pointEvidence });
  return { topologyEvidence, entityEvidence, diagnostics: diagnostics.sort(diagnosticCompare), context: { nodeMap, elements, edgeIndex, boundaryEvidence, pointEvidence } };
}

function qualifyCapacity(pkg, profile) {
  const assignmentCount = pkg.analysisDefinition.materialAssignments.length + pkg.analysisDefinition.thicknessAssignments.length
    + pkg.analysisDefinition.loadCase.pointForces.length + pkg.analysisDefinition.loadCase.boundaryTractions.length
    + pkg.analysisDefinition.loadCase.boundaryPressures.length + pkg.analysisDefinition.constraints.length;
  const edgeUpperBound = pkg.elements.reduce((sum, row) => sum + (row.elementType === ELEMENT_TYPES.Q4 ? 4 : 3), 0);
  const checks = [['nodes',pkg.nodes.length,profile.maximumNodes],['elements',pkg.elements.length,profile.maximumElements],['edges',edgeUpperBound,profile.maximumEdges],['regions',pkg.regions.length,profile.maximumRegions],['boundaries',pkg.boundaries.length,profile.maximumBoundaries],['points',pkg.points.length,profile.maximumPoints],['assignments',assignmentCount,profile.maximumAssignments]];
  const rejected = checks.find(([,actual,limit]) => actual > limit);
  if (rejected) throw adapterFailure('ADAPTER_CAPACITY_EXCEEDED', `${rejected[0]} capacity ${rejected[1]} exceeds approved limit ${rejected[2]}.`, { category: rejected[0], requested: rejected[1], approvedLimit: rejected[2] });
}

function rejectExactCoincident(nodes) {
  const seen = new Map();
  nodes.forEach((node) => { const key = `${node.x}|${node.y}`; const other = seen.get(key); if (other) throw adapterFailure('EXACT_COINCIDENT_NODES', `Nodes ${other} and ${node.nodeId} are exactly coincident.`); seen.set(key, node.nodeId); });
}
function nearCoincidentDiagnostics(nodes, tolerance) {
  const rows=[];
  for(let left=0;left<nodes.length;left+=1)for(let right=left+1;right<nodes.length;right+=1){const distance=Math.hypot(nodes[left].x-nodes[right].x,nodes[left].y-nodes[right].y);if(distance>0&&distance<=tolerance)rows.push({code:'NEAR_COINCIDENT_NODES',severity:'WARNING',message:`Nodes ${nodes[left].nodeId} and ${nodes[right].nodeId} are within coordinate qualification tolerance and were not modified.`,details:{nodeIds:[nodes[left].nodeId,nodes[right].nodeId],distance,tolerance}});}
  return rows;
}

function qualifyElements(source, nodeMap, profile) {
  return source.map((row) => {
    const nodes=row.nodeIds.map((id)=>nodeMap.get(id)); if(nodes.some((node)=>!node))throw adapterFailure('MISSING_ELEMENT_NODE',`Element ${row.elementId} references a missing node.`);
    const qualityEvidence = row.elementType===ELEMENT_TYPES.T3 ? qualifyT3(row,nodes,profile.areaAbsoluteTolerance) : qualifyQ4(row,nodes,profile);
    return deepFreeze({ elementId:row.elementId, type:row.elementType, nodeIds:[...row.nodeIds], sourceEntityId:row.sourceEntityId, sourceSemanticHash:row.sourceSemanticHash, qualityEvidence });
  }).sort((a,b)=>compareIdentity(a.elementId,b.elementId));
}
function qualifyT3(element,nodes,tolerance){const area=signedArea(nodes);if(!Number.isFinite(area)||!(area>tolerance))throw adapterFailure('INVALID_T3_GEOMETRY',`T3 element ${element.elementId} is clockwise, degenerate, or below area tolerance.`);return deepFreeze({signedArea:area,areaAbsoluteTolerance:tolerance});}
function qualifyQ4(element,nodes,profile){
  const turns=nodes.map((node,index)=>turn(node,nodes[(index+1)%4],nodes[(index+2)%4]));if(turns.some((value)=>!Number.isFinite(value)||!(value>profile.areaAbsoluteTolerance)))throw adapterFailure('INVALID_Q4_GEOMETRY',`Q4 element ${element.elementId} is clockwise, concave, crossed, or degenerate.`);
  const edgeLengths=nodes.map((node,index)=>Math.hypot(nodes[(index+1)%4].x-node.x,nodes[(index+1)%4].y-node.y));if(edgeLengths.some((value)=>!Number.isFinite(value)||!(value>0)))throw adapterFailure('COLLAPSED_Q4_EDGE',`Q4 element ${element.elementId} contains a collapsed or non-finite edge.`);
  const points=[...Q4_GAUSS_POINTS,...Q4_NATURAL_CORNERS].map((point)=>{const geometry=createQ4PointGeometry(nodes,point);if(!Number.isFinite(geometry.determinant)||!(geometry.determinant>profile.jacobianAbsoluteTolerance))throw adapterFailure('INVALID_Q4_JACOBIAN',`Q4 element ${element.elementId} has an invalid Jacobian at ${point.integrationPointId||point.pointId}.`);return{pointId:point.integrationPointId||point.pointId,xi:point.xi,eta:point.eta,determinant:geometry.determinant};});
  return deepFreeze({turns,edgeLengths,jacobians:points,minimumJacobianDeterminant:Math.min(...points.map((row)=>row.determinant)),areaAbsoluteTolerance:profile.areaAbsoluteTolerance,jacobianAbsoluteTolerance:profile.jacobianAbsoluteTolerance});
}
function turn(a,b,c){return(b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x);}
function rejectDuplicateConnectivity(elements){const seen=new Map();elements.forEach((row)=>{const key=`${row.type}|${[...row.nodeIds].sort(compareIdentity).join('|')}`;const other=seen.get(key);if(other)throw adapterFailure('DUPLICATE_ELEMENT_CONNECTIVITY',`Elements ${other} and ${row.elementId} have duplicate connectivity.`);seen.set(key,row.elementId);});}

function buildEdgeIndex(elements, maximumEdges) {
  const map=new Map();
  elements.forEach((element)=>localEdges(element).forEach((edge)=>{const key=edgeKey(edge.nodeIds);const row=map.get(key)||{edgeIdentity:`EDGE:${key}`,canonicalNodePair:[...edge.nodeIds].sort(compareIdentity),incidents:[]};row.incidents.push({elementId:element.elementId,localEdgeId:edge.localEdgeId});map.set(key,row);}));
  if(map.size>maximumEdges)throw adapterFailure('ADAPTER_CAPACITY_EXCEEDED',`Derived edge count ${map.size} exceeds approved limit ${maximumEdges}.`);
  const rows=[...map.values()].map((row)=>{row.incidents.sort(incidentCompare);if(row.incidents.length>2)throw adapterFailure('NONMANIFOLD_EDGE',`Edge ${row.edgeIdentity} has ${row.incidents.length} incident elements.`);return deepFreeze({edgeIdentity:row.edgeIdentity,canonicalNodePair:row.canonicalNodePair,incidentElementIds:row.incidents.map((item)=>item.elementId),incidentLocalEdgeIds:row.incidents.map((item)=>item.localEdgeId),incidents:row.incidents,incidenceCount:row.incidents.length,classification:row.incidents.length===1?EDGE_CLASSIFICATIONS.EXTERIOR:EDGE_CLASSIFICATIONS.INTERIOR});}).sort((a,b)=>compareIdentity(a.edgeIdentity,b.edgeIdentity));
  return { rows, byKey:new Map(rows.map((row)=>[edgeKey(row.canonicalNodePair),row])) };
}
function localEdges(element){const ids=element.nodeIds;const pairs=element.type===ELEMENT_TYPES.Q4?[[ids[0],ids[1]],[ids[1],ids[2]],[ids[2],ids[3]],[ids[3],ids[0]]]:[[ids[0],ids[1]],[ids[1],ids[2]],[ids[2],ids[0]]];return pairs.map((nodeIds,index)=>({localEdgeId:LOCAL_EDGE_IDS[element.type][index],nodeIds}));}
function edgeKey(nodeIds){return[...nodeIds].sort(compareIdentity).join('|');}
function incidentCompare(a,b){return compareIdentity(a.elementId,b.elementId)||compareIdentity(a.localEdgeId,b.localEdgeId);}
function qualifyGlobalTopology(nodes,elements,tolerance){try{assertNoHangingNodes(nodes,elements,tolerance);assertNoImproperEdgeIntersections(nodes,elements,tolerance);}catch(error){const code=error.message.includes('Hanging')?'HANGING_NODE':'CROSSING_ELEMENT_EDGES';throw adapterFailure(code,error.message);}}

function resolveBoundaries(boundaries,elements,edgeIndex){
  const elementMap=new Map(elements.map((row)=>[row.elementId,row]));const claimed=new Map();
  return boundaries.map((boundary)=>{const edges=boundary.edgeReferences.map((reference)=>resolveBoundaryEdge(reference,elementMap,edgeIndex));edges.forEach((edge)=>{const owner=claimed.get(edge.edgeIdentity);if(owner)throw adapterFailure('DUPLICATE_BOUNDARY_OWNERSHIP',`Edge ${edge.edgeIdentity} is claimed by boundaries ${owner} and ${boundary.boundaryId}.`);claimed.set(edge.edgeIdentity,boundary.boundaryId);});const components=boundaryComponents(edges);return deepFreeze({boundaryId:boundary.boundaryId,sourceEntityId:boundary.sourceEntityId,sourceSemanticHash:boundary.sourceSemanticHash,edgeReferences:[...boundary.edgeReferences],edgeIdentities:edges.map((row)=>row.edgeIdentity).sort(compareIdentity),edgeCount:edges.length,nodeIdentities:[...new Set(edges.flatMap((row)=>row.canonicalNodePair))].sort(compareIdentity),uniqueNodeCount:new Set(edges.flatMap((row)=>row.canonicalNodePair)).size,...components});}).sort((a,b)=>compareIdentity(a.boundaryId,b.boundaryId));
}
function resolveBoundaryEdge(reference,elementMap,edgeIndex){const element=elementMap.get(reference.elementId);if(!element)throw adapterFailure('MISSING_BOUNDARY_EDGE',`Boundary references missing element ${reference.elementId}.`);const edge=localEdges(element).find((row)=>row.localEdgeId===reference.localEdgeId);if(!edge)throw adapterFailure('MISSING_BOUNDARY_EDGE',`Local edge ${reference.localEdgeId} does not belong to element ${reference.elementId}.`);const indexed=edgeIndex.byKey.get(edgeKey(edge.nodeIds));if(!indexed||indexed.classification!==EDGE_CLASSIFICATIONS.EXTERIOR)throw adapterFailure('INTERNAL_BOUNDARY_EDGE',`Boundary edge ${reference.elementId}:${reference.localEdgeId} is not exterior.`);return indexed;}
function boundaryComponents(edges){
  const adjacency=new Map();edges.forEach((edge)=>{const[a,b]=edge.canonicalNodePair;if(!adjacency.has(a))adjacency.set(a,new Set());if(!adjacency.has(b))adjacency.set(b,new Set());adjacency.get(a).add(b);adjacency.get(b).add(a);});
  const remaining=new Set(adjacency.keys());const components=[];while(remaining.size){const start=[...remaining].sort(compareIdentity)[0];const stack=[start];const nodes=[];while(stack.length){const node=stack.pop();if(!remaining.delete(node))continue;nodes.push(node);[...(adjacency.get(node)||[])].sort(compareIdentity).reverse().forEach((next)=>{if(remaining.has(next))stack.push(next);});}components.push(nodes.sort(compareIdentity));}
  const endpointIdentities=[...adjacency].filter(([,neighbors])=>neighbors.size===1).map(([id])=>id).sort(compareIdentity);const branchNodeIdentities=[...adjacency].filter(([,neighbors])=>neighbors.size>2).map(([id])=>id).sort(compareIdentity);
  let openChainCount=0,closedLoopCount=0;components.forEach((nodes)=>{const degrees=nodes.map((id)=>adjacency.get(id).size);if(degrees.every((value)=>value===2))closedLoopCount+=1;else if(degrees.filter((value)=>value===1).length===2&&degrees.every((value)=>value<=2))openChainCount+=1;});
  return{connectedComponentCount:components.length,openChainCount,closedLoopCount,endpointIdentities,branchNodeIdentities,components};
}
function resolvePoints(points,nodeMap){return points.map((point)=>{if(!nodeMap.has(point.nodeId))throw adapterFailure('MISSING_POINT_NODE',`Point ${point.pointId} references missing node ${point.nodeId}.`);return deepFreeze({...point,resolvedNodeId:point.nodeId});}).sort((a,b)=>compareIdentity(a.pointId,b.pointId));}
function createTopologyEvidence(edgeIndex,boundaries){const rows=edgeIndex.rows;const base={edgeCount:rows.length,exteriorEdgeCount:rows.filter((row)=>row.classification===EDGE_CLASSIFICATIONS.EXTERIOR).length,interiorEdgeCount:rows.filter((row)=>row.classification===EDGE_CLASSIFICATIONS.INTERIOR).length,edges:rows,boundaryIdentities:boundaries.map((row)=>row.boundaryId)};return{...base,topologyIdentity:semanticHash(base)};}
function diagnosticCompare(a,b){return compareIdentity(a.code,b.code)||compareIdentity(a.message,b.message);}
