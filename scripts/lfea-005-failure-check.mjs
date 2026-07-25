import assert from 'node:assert/strict';
import { semanticHash } from '../src/core/shared-piping-model/canonical-json.js';
import { adaptMeshPackage, validateMeshAdapterResult } from '../src/core/element-fea/index.js';
import {
  adapterProfile, boundary, clone, constraint, element, fixed, free, materialAssignment, node, planeStrainPackage,
  point, pointForce, rectangularQ4Package, region, resealPackage, sealPackage, t3PlatePackage, twoElementQ4Package,
} from './lfea-005-fixtures.mjs';

function rejected(input, code, profile=adapterProfile()){const result=adaptMeshPackage(input,profile);assert.equal(result.status,'REJECTED',`Expected rejection, got ${JSON.stringify(result)}`);assert.equal(result.qualifiedModel,null);assert.equal(result.qualifiedModelSemanticHash,null);assert.equal(result.mappingLedger.length,0);assert.equal(validateMeshAdapterResult(result).ok,true,JSON.stringify(validateMeshAdapterResult(result).errors));if(code)assert.ok(result.diagnostics.some((row)=>row.code===code),`${code}: ${JSON.stringify(result.diagnostics)}`);return result;}
function mutate(base,change){const value=clone(base);change(value);return resealPackage(value);}

const rect=rectangularQ4Package();
let value=clone(rect);value.schema='mesh/v0';rejected(value,'UNSUPPORTED_PACKAGE_SCHEMA');
value=clone(rect);value.unitsIdentity='M_N_PA';rejected(value,'UNSUPPORTED_UNITS');
value=clone(rect);value.coordinateSystem='LEFT_HANDED';rejected(value,'UNSUPPORTED_COORDINATE_SYSTEM');
value=clone(rect);value.packageIdentity='STALE';rejected(value,'STALE_PACKAGE_SEMANTIC_HASH');
rejected(mutate(rect,(row)=>row.nodes.push({...row.nodes[0],x:9})),'DUPLICATE_IDENTITY');
rejected(mutate(rect,(row)=>{row.nodes.find((item)=>item.nodeId==='N2').x=0;row.nodes.find((item)=>item.nodeId==='N2').y=0;}),'EXACT_COINCIDENT_NODES');
const near=mutate(t3PlatePackage(),(row)=>{row.nodes.find((item)=>item.nodeId==='N2').x=1e-4;});const nearResult=adaptMeshPackage(near,adapterProfile({coordinateAbsoluteTolerance:1e-3}));assert.equal(nearResult.status,'ACCEPTED',JSON.stringify(nearResult.diagnostics));assert.ok(nearResult.diagnostics.some((row)=>row.code==='NEAR_COINCIDENT_NODES'));assert.equal(nearResult.qualifiedModel.nodes.find((row)=>row.nodeId==='N2').x,1e-4);
rejected(mutate(rect,(row)=>row.elements.push({...row.elements[0],nodeIds:['N1','N2','N4','N3']})),'DUPLICATE_IDENTITY');
const duplicateConnectivity=mutate(twoElementQ4Package(),(row)=>{row.elements.push({...row.elements[0],elementId:'E3',sourceEntityId:'SRC-E3'});row.regions[0].elementIds.push('E3');});rejected(duplicateConnectivity,'DUPLICATE_ELEMENT_CONNECTIVITY');
rejected(mutate(rect,(row)=>{row.elements[0].nodeIds[0]='MISSING';}),'MISSING_ELEMENT_NODE');
rejected(mutate(rect,(row)=>{row.elements[0].nodeIds[1]=row.elements[0].nodeIds[0];}),'DUPLICATE_IDENTITY');
rejected(mutate(t3PlatePackage(),(row)=>{row.elements[0].nodeIds=['N1','N3','N2'];}),'INVALID_T3_GEOMETRY');
rejected(mutate(t3PlatePackage(),(row)=>{const n=row.nodes.find((item)=>item.nodeId==='N3');n.x=1;n.y=0;}),'INVALID_T3_GEOMETRY');
rejected(mutate(rect,(row)=>{row.elements[0].nodeIds=['N1','N4','N3','N2'];}),'INVALID_Q4_GEOMETRY');
rejected(mutate(rect,(row)=>{const n=row.nodes.find((item)=>item.nodeId==='N3');n.x=.5;n.y=.2;}),'INVALID_Q4_GEOMETRY');
rejected(mutate(rect,(row)=>{row.elements[0].nodeIds=['N1','N3','N2','N4'];}),'INVALID_Q4_GEOMETRY');
const narrow=mutate(rect,(row)=>{row.nodes.find((item)=>item.nodeId==='N2').x=1e-4;row.nodes.find((item)=>item.nodeId==='N3').x=1e-4;});rejected(narrow,'INVALID_Q4_JACOBIAN',adapterProfile({jacobianAbsoluteTolerance:1e-3}));
rejected(mutate(rect,(row)=>row.nodes.push(node('N5',1,0))),'HANGING_NODE');
const nonmanifold=sealPackage({packageIdentity:'NONMANIFOLD',nodes:[node('A',0,0),node('B',1,0),node('C',0,1),node('D',0,-1),node('E',1,1)],elements:[element('T1','T3',['A','B','C']),element('T2','T3',['B','A','D']),element('T3','T3',['A','B','E'])],regions:[region('R_ALL',['T1','T2','T3'])],materialAssignments:[materialAssignment('MA1','R_ALL','MAT1')]});rejected(nonmanifold,'NONMANIFOLD_EDGE');
rejected(mutate(twoElementQ4Package(),(row)=>{row.boundaries.find((item)=>item.boundaryId==='B_RIGHT').edgeReferences=[{elementId:'E1',localEdgeId:'Q4_E2'}];}),'INTERNAL_BOUNDARY_EDGE');
rejected(mutate(rect,(row)=>{row.boundaries.find((item)=>item.boundaryId==='B_RIGHT').edgeReferences=[{elementId:'E1',localEdgeId:'T3_E1'}];}),'MISSING_BOUNDARY_EDGE');
rejected(mutate(rect,(row)=>{const b=row.boundaries.find((item)=>item.boundaryId==='B_RIGHT');b.edgeReferences.push({...b.edgeReferences[0]});}),'DUPLICATE_BOUNDARY_EDGE');
rejected(mutate(rect,(row)=>{row.analysisDefinition.materialAssignments[0].regionId='MISSING';}),'MISSING_MATERIAL_REGION');
rejected(mutate(rect,(row)=>{row.regions[0].elementIds=[];}),'EMPTY_REGION');
rejected(mutate(rect,(row)=>{row.analysisDefinition.materialAssignments=[];}),'UNASSIGNED_MATERIAL');
rejected(mutate(rect,(row)=>{row.analysisDefinition.materialAssignments.push({assignmentId:'MA2',regionId:'R_ALL',materialId:'MAT1'});}),'MULTIPLE_MATERIAL_ASSIGNMENT');
rejected(mutate(rect,(row)=>{row.analysisDefinition.thicknessAssignments=[];}),'MISSING_PLANE_STRESS_THICKNESS');
rejected(mutate(rect,(row)=>{row.analysisDefinition.thicknessAssignments.push({assignmentId:'TA2',regionId:'R_ALL',thickness:2,sourceSemanticHash:'mesh-source:lfea005-v1'});}),'MULTIPLE_THICKNESS_ASSIGNMENT');
rejected(mutate(planeStrainPackage(),(row)=>{row.analysisDefinition.thicknessAssignments=[{assignmentId:'TA1',regionId:'R_ALL',thickness:1,sourceSemanticHash:'mesh-source:lfea005-v1'}];}),'PLANE_STRAIN_THICKNESS_PROHIBITED');
rejected(mutate(rect,(row)=>{row.points.find((item)=>item.pointId==='P_N3').nodeId='MISSING';}),'MISSING_POINT_NODE');
value=clone(rect);value.points[0].nearestNodeTolerance=.01;rejected(value,'UNSUPPORTED_FIELD');
rejected(mutate(rect,(row)=>{row.analysisDefinition.loadCase.pointForces.push(pointForce('F1','P_N2',2,0));}),'DUPLICATE_IDENTITY');
rejected(mutate(rect,(row)=>{row.analysisDefinition.constraints.push(constraint('C3','POINT','P_N1',fixed(),free()));}),'CONFLICTING_CONSTRAINT_OWNERSHIP');
rejected(mutate(rect,(row)=>{row.analysisDefinition.constraints.push(constraint('C_FREE','POINT','P_N2',free(),free()));}),'EMPTY_SELECTOR_RESOLUTION');
rejected(mutate(rect,(row)=>{row.analysisDefinition.constraints[0].ux={type:'SPRING'};}),'UNSUPPORTED_CONSTRAINT_TYPE');
rejected(rect,'ADAPTER_CAPACITY_EXCEEDED',adapterProfile({maximumNodes:1}));
const accepted=adaptMeshPackage(rect,adapterProfile());assert.equal(accepted.status,'ACCEPTED');
const exposed=clone(rejected({...rect,schema:'bad'},'UNSUPPORTED_PACKAGE_SCHEMA'));exposed.qualifiedModel=accepted.qualifiedModel;exposed.qualifiedModelSemanticHash=accepted.qualifiedModel.semanticHash;{const{semanticHash:_,...base}=exposed;exposed.semanticHash=semanticHash(base);}assert.equal(validateMeshAdapterResult(exposed).ok,false);
const mixedAncestry=clone(accepted);mixedAncestry.sourcePackageSemanticHash='fnv1a64:0000000000000000';{const{semanticHash:_,...base}=mixedAncestry;mixedAncestry.semanticHash=semanticHash(base);}assert.equal(validateMeshAdapterResult(mixedAncestry).ok,false);assert.ok(validateMeshAdapterResult(mixedAncestry).errors.some((row)=>row.includes('ancestry')));
console.log('LFEA-005 contract, topology, assignment, capacity and ancestry failures passed.');
