import { deepFreeze } from '../shared-piping-model/immutable.js';
import { adapterFailure, compareIdentity } from './mesh-package-contract.js';
import { MAPPING_STATUS } from './mesh-package-constants.js';

export function resolveMeshPackageEntities(pkg, topology) {
  const elementIds=new Set(topology.context.elements.map((row)=>row.elementId));
  const regions=pkg.regions.map((region)=>{const missing=region.elementIds.find((id)=>!elementIds.has(id));if(missing)throw adapterFailure('MISSING_REGION_ELEMENT',`Region ${region.regionId} references missing element ${missing}.`);return deepFreeze({...region,elementIds:[...region.elementIds].sort(compareIdentity)});}).sort((a,b)=>compareIdentity(a.regionId,b.regionId));
  const regionMap=new Map(regions.map((row)=>[row.regionId,row]));
  const boundaryMap=new Map(topology.entityEvidence.boundaries.map((row)=>[row.boundaryId,row]));
  const pointMap=new Map(topology.entityEvidence.points.map((row)=>[row.pointId,row]));
  const ledger=[...nodeMappings(pkg),...elementMappings(pkg),...regionMappings(regions),...boundaryMappings(topology.entityEvidence.boundaries),...pointMappings(topology.entityEvidence.points)];
  return { entityEvidence:deepFreeze({regions,boundaries:topology.entityEvidence.boundaries,points:topology.entityEvidence.points}), mappingLedger:ledger.sort(mappingCompare), context:{regionMap,boundaryMap,pointMap} };
}

function nodeMappings(pkg){return pkg.nodes.map((row)=>mapping(`NODE:${row.nodeId}`,row.sourceEntityId,row.nodeId,row.sourceSemanticHash));}
function elementMappings(pkg){return pkg.elements.map((row)=>mapping(`ELEMENT:${row.elementId}`,row.sourceEntityId,row.elementId,row.sourceSemanticHash));}
function regionMappings(rows){return rows.map((row)=>mappingMany(`REGION:${row.regionId}`,row.sourceEntityId,row.elementIds,row.sourceSemanticHash));}
function boundaryMappings(rows){return rows.map((row)=>mappingMany(`BOUNDARY:${row.boundaryId}`,row.sourceEntityId,row.edgeIdentities,row.sourceSemanticHash));}
function pointMappings(rows){return rows.map((row)=>mapping(`POINT:${row.pointId}`,row.sourceEntityId,row.resolvedNodeId,row.sourceSemanticHash));}
export function mapping(mappingIdentity,sourceIdentity,targetIdentity,sourceSemanticHash){return deepFreeze({mappingIdentity,sourceIdentity,targetIdentity,sourceSemanticHash,mappingStatus:MAPPING_STATUS});}
export function mappingMany(mappingIdentity,sourceIdentity,targetIdentities,sourceSemanticHash){return deepFreeze({mappingIdentity,sourceIdentity,targetIdentities:[...targetIdentities].sort(compareIdentity),sourceSemanticHash,mappingStatus:MAPPING_STATUS});}
export function mappingCompare(a,b){return compareIdentity(a.mappingIdentity,b.mappingIdentity);}
