import assert from 'node:assert/strict';
import { solveContinuumModel } from '../src/core/element-fea/index.js';
import {
  distortedQ4Patch, edgePressure, edgeTraction, fixedLoadedQ4, mixedPatch, partiallyPrescribedQ4,
  rectangleQ4, regularQ4Patch,
} from './lfea-002-fixtures.mjs';
const close = (actual, expected, tolerance = 1e-10) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
const qualified = (input) => { const result = solveContinuumModel(input); assert.equal(result.status, 'QUALIFIED', JSON.stringify(result)); return result; };
const everyPoint = (result, expected) => result.integrationPointResults.forEach((row) => row.strain.forEach((value,index)=>close(value,expected[index],1e-10)));

const hand = qualified(rectangleQ4());
const gp1 = hand.integrationPointResults.find((row)=>row.integrationPointId === 'GP1');
const gp1Evidence = hand.elementIntegrationEvidence[0].points.find((row)=>row.integrationPointId === 'GP1');
const g = 1 / Math.sqrt(3);
close(gp1Evidence.determinant, 0.5);
close(gp1Evidence.jacobian[0][0], 1); close(gp1Evidence.jacobian[0][1], 0);
close(gp1Evidence.jacobian[1][0], 0); close(gp1Evidence.jacobian[1][1], 0.5);
close(gp1Evidence.B.length, 3); close(gp1Evidence.B[0].length, 8);
close(gp1.strain[0], 0.01); close(gp1.strain[1], 0); close(gp1.strain[2], 0);
close(gp1.stress[0], 1.0666666666666667); close(gp1.stress[1], 0.26666666666666666); close(gp1.stress[2], 0);
close(gp1.strainEnergyContribution, 0.002666666666666667);
close(hand.strainEnergy, 0.010666666666666668);
close(hand.energyConsistency.absoluteDifference, 0, 1e-12);
const shapes = [0.25*(1+g)*(1+g), 1/6, 0.25*(1-g)*(1-g), 1/6];
const natural = hand.elementIntegrationEvidence[0].points[0];
const reconstructed = natural.globalDerivatives.reduce((sum,row)=>sum+row.dNdx,0);
close(reconstructed,0,1e-14);
assert.ok(shapes.every((value)=>value>0));

const distortedSingle = rectangleQ4((x,y)=>[0.1+0.02*x+0.03*y,-0.2+0.04*x+0.05*y], { nodes:[
  {nodeId:'N1',x:0,y:0,sourceSemanticHash:'lfea-source:q4-qualified-v1'},
  {nodeId:'N2',x:2,y:-0.2,sourceSemanticHash:'lfea-source:q4-qualified-v1'},
  {nodeId:'N3',x:2.3,y:1.1,sourceSemanticHash:'lfea-source:q4-qualified-v1'},
  {nodeId:'N4',x:-0.1,y:1,sourceSemanticHash:'lfea-source:q4-qualified-v1'},
]});
everyPoint(qualified(distortedSingle), [0.02,0.05,0.07]);
const field = (x,y)=>[0.1+0.02*x+0.03*y,-0.2+0.04*x+0.05*y];
everyPoint(qualified(regularQ4Patch(field)), [0.02,0.05,0.07]);
everyPoint(qualified(distortedQ4Patch(field)), [0.02,0.05,0.07]);
everyPoint(qualified(mixedPatch(field)), [0.02,0.05,0.07]);

everyPoint(qualified(rectangleQ4(()=>[0.4,-0.3])), [0,0,0]);
everyPoint(qualified(rectangleQ4((x,y)=>[-0.2*y,0.2*x])), [0,0,0]);
const planeStrain = qualified(rectangleQ4((x)=>[0.01*x,0], { formulation:'PLANE_STRAIN' }));
planeStrain.integrationPointResults.forEach((row)=>{ close(row.stress[0],1.2); close(row.stress[1],0.4); close(row.sigmaZ,0.4); });
assert.ok(planeStrain.diagnostics.some((row)=>row.code==='Q4_PLANE_STRAIN_LOCKING_APPLICABILITY'));
assert.ok(planeStrain.limitations.some((row)=>row.includes('volumetric locking') || row.includes('incompressibility')));
const shear = qualified(rectangleQ4((_x,y)=>[0.02*y,0]));
shear.integrationPointResults.forEach((row)=>{ close(row.strain[2],0.02); close(row.stress[2],0.8); close(row.principalStresses[0],0.8); close(row.principalStresses[1],-0.8); close(row.principalOrientationRadians,Math.PI/4); });
everyPoint(qualified(rectangleQ4((x,y)=>[0.01*x,0.015*y])), [0.01,0.015,0]);

const traction = qualified(fixedLoadedQ4(edgeTraction('T1','E1',['N1','N2'],4,-2)));
close(traction.appliedLoadTotals.fx,8); close(traction.appliedLoadTotals.fy,-4);
close(traction.reactionTotals.fx,-8); close(traction.reactionTotals.fy,4);
assert.equal(traction.edgeLoadEvidence[0].integrationPoints.length,2);
const pressureCases = [
  {edge:['N1','N2'],expected:[0,6]}, {edge:['N2','N3'],expected:[-3,0]},
  {edge:['N3','N4'],expected:[0,-6]}, {edge:['N4','N1'],expected:[3,0]},
];
pressureCases.forEach(({edge,expected},index)=>{ const result=qualified(fixedLoadedQ4(edgePressure(`P${index+1}`,'E1',edge,3))); close(result.appliedLoadTotals.fx,expected[0]); close(result.appliedLoadTotals.fy,expected[1]); });

const partitioned = qualified(partiallyPrescribedQ4());
close(partitioned.nodalDisplacements.find((row)=>row.equationIdentity==='N2:UX').value,0.02);
assert.ok(partitioned.constraintPartition.imposedDisplacementLoad.some((value)=>Math.abs(value)>0));
assert.ok(partitioned.freeDofResidual.infinityNorm <= 1e-9);
assert.ok(partitioned.globalResidual.infinityNorm <= 1e-9);
close(partitioned.equilibriumTotals.fx,0,1e-9); close(partitioned.equilibriumTotals.fy,0,1e-9); close(partitioned.equilibriumTotals.mz,0,1e-8);
console.log('LFEA-002 hand check, patches, mixed mesh, loads, reactions, residuals and energy benchmarks passed.');
