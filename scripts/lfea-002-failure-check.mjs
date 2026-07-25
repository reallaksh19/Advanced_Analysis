import assert from 'node:assert/strict';
import { Q4_GAUSS_POINTS, createQ4PointGeometry, solveContinuumModel } from '../src/core/element-fea/index.js';
import {
  clone, edgeTraction, loadCase, model, node, profile, q4, rectangleQ4, t3,
} from './lfea-002-fixtures.mjs';
const rejected = (input, status = 'REJECTED_INVALID') => {
  const result = solveContinuumModel(input); assert.equal(result.status, status, JSON.stringify(result)); assert.equal(result.qualifiedResults, null);
  ['nodalDisplacements','reactions','integrationPointResults','elementStresses','strainEnergy'].forEach((field)=>assert.equal(Object.hasOwn(result,field),false)); return result;
};

const reversed = rectangleQ4(); reversed.elements[0].nodeIds=['N1','N4','N3','N2']; rejected(reversed);
const crossed = rectangleQ4(); crossed.elements[0].nodeIds=['N1','N3','N2','N4']; rejected(crossed);
const concave = rectangleQ4(); concave.nodes[2].x=0.5; concave.nodes[2].y=0.2;
const concaveCoordinates=concave.elements[0].nodeIds.map((id)=>concave.nodes.find((row)=>row.nodeId===id));
assert.ok(createQ4PointGeometry(concaveCoordinates,{xi:0,eta:0}).determinant>0);
assert.ok(Q4_GAUSS_POINTS.some((point)=>createQ4PointGeometry(concaveCoordinates,point).determinant<0));
rejected(concave);
const collapsed = rectangleQ4(); collapsed.nodes[1].x=0; collapsed.nodes[1].y=0; rejected(collapsed);
const nearCoincident = rectangleQ4(); nearCoincident.nodes[1].x=1e-14; rejected(nearCoincident);
const repeated = rectangleQ4(); repeated.elements[0].nodeIds=['N1','N2','N2','N4']; rejected(repeated);
const unsupported = rectangleQ4(); unsupported.elements[0].type='Q8'; rejected(unsupported);
const reduced = rectangleQ4(); reduced.elements[0].integrationRule='REDUCED_1X1'; rejected(reduced);
const hourglass = rectangleQ4(); hourglass.solverProfile.hourglassControl=true; rejected(hourglass);
const signedArea = rectangleQ4(); signedArea.elements[0].signedArea=2; rejected(signedArea);
const planeStrainThickness = rectangleQ4((x)=>[0.01*x,0],{formulation:'PLANE_STRAIN'}); planeStrainThickness.elements[0].thickness=1; rejected(planeStrainThickness);

const duplicateCoincident = rectangleQ4(); duplicateCoincident.nodes.push(node('N5',2,1)); rejected(duplicateCoincident);
const hangingNodes=[node('A',0,0),node('B',2,0),node('C',2,1),node('D',0,1),node('H',1,0),node('F',1,-1)];
const hanging=model({modelIdentity:'HANGING',solverProfile:profile(),nodes:hangingNodes,elements:[q4('E1',['A','B','C','D']),t3('E2',['A','H','F'])]});
rejected(hanging);

const crossingNodes=[node('A',0,0),node('B',1,0),node('C',1,1),node('D',0,1),node('E',2,0.5),node('F',0.5,2)];
const crossingMesh=model({modelIdentity:'CROSSING-MESH',solverProfile:profile(),nodes:crossingNodes,elements:[q4('E1',['A','B','C','D']),t3('E2',['A','E','F'])]});
rejected(crossingMesh);

const patchNodes=[node('N1',0,0),node('N2',1,0),node('N3',2,0),node('N4',0,1),node('N5',1,1),node('N6',2,1)];
const patch=model({modelIdentity:'INTERNAL-EDGE',solverProfile:profile(),nodes:patchNodes,elements:[q4('E1',['N1','N2','N5','N4']),q4('E2',['N2','N3','N6','N5'])],loadCases:[loadCase('LC1',[],[edgeTraction('T1','E1',['N2','N5'],1,0)])]});
rejected(patch);
const duplicateEdge=rectangleQ4(); duplicateEdge.loadCases=[loadCase('LC1',[],[edgeTraction('T1','E1',['N1','N2'],1,0),edgeTraction('T2','E1',['N2','N1'],2,0)])]; rejected(duplicateEdge);
const stale=rectangleQ4(); stale.elements[0].sourceSemanticHash='stale'; rejected(stale);
const nonfinite=rectangleQ4(); nonfinite.nodes[0].x=Number.NaN; rejected(nonfinite);
const capacity=rectangleQ4(); capacity.solverProfile.referenceBackendMaxDofs=6; rejected(capacity);
const singular=rectangleQ4(); singular.prescribedDisplacements=[]; singular.loadCases=[loadCase('LC1')]; rejected(singular,'REJECTED_SINGULAR');

const noRepair=clone(reversed); rejected(noRepair); assert.deepEqual(noRepair.elements[0].nodeIds,['N1','N4','N3','N2']);
console.log('LFEA-002 Jacobian, distortion, mixed-conformity and fail-closed fixtures passed.');
