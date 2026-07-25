import assert from 'node:assert/strict';
import { semanticHash } from '../src/core/shared-piping-model/canonical-json.js';
import { adaptMeshPackage } from '../src/core/element-fea/index.js';
import {
  adapterProfile, allSidesPressurePackage, clone, holePackage, multipleMaterialPackage, multipleThicknessPackage,
  planeStrainPackage, prescribedBoundaryPackage, rectangularQ4Package, resealPackage, traction, twoElementQ4Package,
} from './lfea-005-fixtures.mjs';

function accepted(input){const result=adaptMeshPackage(input,adapterProfile());assert.equal(result.status,'ACCEPTED',JSON.stringify(result.diagnostics));return result;}
const materials=accepted(multipleMaterialPackage());assert.deepEqual(materials.qualifiedModel.elements.map((row)=>row.materialId),['MAT1','MAT2']);assert.equal(materials.assignmentEvidence.materialAssignments.length,2);
const thickness=accepted(multipleThicknessPackage());assert.deepEqual(thickness.qualifiedModel.elements.map((row)=>row.thickness),[1,2]);assert.equal(thickness.assignmentEvidence.thicknessAssignments.length,2);
const strain=accepted(planeStrainPackage());assert.ok(strain.qualifiedModel.elements.every((row)=>row.thickness===null));assert.equal(strain.assignmentEvidence.thicknessAssignments.length,0);assert.equal(strain.qualifiedModel.solverProfile.outOfPlaneScale,1);
const point=accepted(rectangularQ4Package());assert.deepEqual(point.qualifiedModel.loadCases[0].nodalForces.map((row)=>row.loadId),['F1']);assert.equal(point.qualifiedModel.loadCases[0].nodalForces[0].nodeId,'N3');
const tractionResult=accepted(twoElementQ4Package());assert.deepEqual(tractionResult.qualifiedModel.loadCases[0].edgeLoads.map((row)=>row.loadId),['T_RIGHT:E2:Q4_E2']);assert.equal(tractionResult.qualifiedModel.loadCases[0].edgeLoads[0].type,'TRACTION');
const allPressure=accepted(allSidesPressurePackage());assert.equal(allPressure.qualifiedModel.loadCases[0].edgeLoads.length,4);assert.ok(allPressure.qualifiedModel.loadCases[0].edgeLoads.every((row)=>row.type==='PRESSURE'));
const hole=accepted(holePackage({pressure:true}));const pressureEvidence=hole.assignmentEvidence.loadAssignments.find((row)=>row.parentLoadId==='P_HOLE');assert.equal(pressureEvidence.generatedChildren.length,4);assert.ok(pressureEvidence.generatedChildren.every((row)=>row.outwardNormalAuthority==='ELEMENT_LOCAL_COUNTERCLOCKWISE_CONNECTIVITY'));
const prescribed=accepted(prescribedBoundaryPackage());assert.equal(prescribed.qualifiedModel.prescribedDisplacements.length,2);assert.ok(prescribed.qualifiedModel.prescribedDisplacements.every((row)=>row.value===.01));assert.equal(prescribed.qualifiedModel.restraints.length,4);
const multiple=rectangularQ4Package();multiple.analysisDefinition.loadCase.pointForces=[];multiple.analysisDefinition.loadCase.boundaryTractions=[traction('T1','B_RIGHT',1,0),traction('T2','B_RIGHT',2,0)];const separate=accepted(resealPackage(multiple));assert.deepEqual(separate.qualifiedModel.loadCases[0].edgeLoads.map((row)=>row.loadId),['T1:E1:Q4_E2','T2:E1:Q4_E2']);assert.equal(separate.assignmentEvidence.loadAssignments.length,2);
assert.ok(separate.mappingLedger.some((row)=>row.mappingIdentity==='LOAD:T1'));assert.ok(separate.mappingLedger.some((row)=>row.mappingIdentity==='LOAD:T2'));
assert.ok(Object.isFrozen(separate.assignmentEvidence));assert.ok(Object.isFrozen(separate.qualifiedModel.loadCases));
console.log(`LFEA-005 deterministic material, thickness, load and constraint assignments passed: ${separate.qualifiedModel.semanticHash}`);
