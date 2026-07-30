import { ELEMENT_TYPE_CORNER_COUNTS, FORMULA_IDS } from './constants.js';
import { loadError, modelError, numericalError } from './errors.js';
import { zeros, symmetryResidual, matrixScale } from './matrix.js';
import { canonicalNumber, tolerance } from './numeric.js';
import { codeUnitCompare } from './validation.js';
export function assembleMesh(model,elementEvidence){const dofOrdering=model.nodes.flatMap((node)=>[`${node.nodeId}:UX`,`${node.nodeId}:UY`]),dofIndex=new Map(dofOrdering.map((id,index)=>[id,index])),stiffness=zeros(dofOrdering.length,dofOrdering.length);elementEvidence.forEach((element)=>assembleElement(stiffness,element,dofIndex));const residual=symmetryResidual(stiffness),scale=matrixScale(stiffness),limit=tolerance(model.qualificationProfile,'stiffnessSymmetry',scale);if(residual>limit)throw numericalError('GLOBAL_STIFFNESS_SYMMETRY_FAILURE','assembly','Global stiffness symmetry did not qualify.');const boundaryEdges=buildBoundaryEdges(model.elements);return {dofOrdering,globalStiffnessMatrix:stiffness.map((row)=>row.map((value)=>canonicalNumber(value,'global stiffness'))),globalStiffnessSymmetry:{residual,scale,tolerance:limit,accepted:true},boundaryEdges,formulaIds:[FORMULA_IDS.ASSEMBLY]};}
function assembleElement(global,element,dofIndex){const indices=element.localDofOrdering.map((id)=>dofIndex.get(id));indices.forEach((row,i)=>indices.forEach((column,j)=>{global[row][column]+=element.localStiffnessMatrix[i][j];}));}
export function buildBoundaryEdges(elements){const uses=new Map();elements.forEach((element)=>elementEdgeNodeSequences(element).forEach((edge)=>{const key=edgeKey(edge);const rows=uses.get(key)??[];rows.push({elementId:element.elementId,edgeNodeIds:[...edge].sort(codeUnitCompare),edgeNodeSequence:edge});uses.set(key,rows);}));return [...uses.entries()].filter(([,rows])=>rows.length===1).map(([key,rows])=>({edgeKey:key,...rows[0]})).sort((a,b)=>codeUnitCompare(a.edgeKey,b.edgeKey));}
/**
 * Per-edge node sequence in edge-local traversal order: `[corner, corner]`
 * for T3 (straight, spec-unchanged); `[corner, midside, corner]` for T6/Q8
 * (spec §10.4 "midside-geometry": a boundary edge on a quadratic element is
 * a 3-node quadratic curve, not its 2-node corner-only chord — load
 * integration and boundary matching must see the midside node, never
 * silently drop it to a straight facet).
 */
export function elementEdgeNodeSequences(element){const cornerCount=ELEMENT_TYPE_CORNER_COUNTS[element.elementType],corners=element.nodeIds.slice(0,cornerCount),midsides=element.nodeIds.slice(cornerCount);return corners.map((id,index)=>{const next=corners[(index+1)%cornerCount];return midsides.length?[id,midsides[index],next]:[id,next];});}
export function validateBoundaryTractions(model,mesh){const boundary=new Map(mesh.boundaryEdges.map((row)=>[row.edgeKey,row]));model.loadCases.forEach((loadCase)=>{loadCase.edgeTractions.forEach((traction)=>validateBoundaryEdgeLoad(boundary,loadCase.loadCaseId,traction.tractionId,traction.elementId,traction.edgeNodeIds,'TRACTION'));loadCase.pressureLoads.forEach((pressureLoad)=>validateBoundaryEdgeLoad(boundary,loadCase.loadCaseId,pressureLoad.pressureLoadId,pressureLoad.elementId,pressureLoad.edgeNodeIds,'PRESSURE_LOAD'));});}
function validateBoundaryEdgeLoad(boundary,loadCaseId,loadId,elementId,edgeNodeIds,kind){const key=edgeKey(edgeNodeIds),edge=boundary.get(key);if(!edge)throw loadError(`${kind}_EDGE_NOT_BOUNDARY`,`loadCases.${loadCaseId}.${loadId}`,'Edge load must be a true boundary edge.');if(edge.elementId!==elementId)throw modelError(`${kind}_ELEMENT_EDGE_MISMATCH`,`loadCases.${loadCaseId}.${loadId}`,'Edge load does not belong to the declared boundary element.');}
export function edgeKey(ids){return [...ids].sort(codeUnitCompare).join('\0');}
