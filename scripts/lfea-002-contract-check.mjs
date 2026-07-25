import assert from 'node:assert/strict';
import {
  CONTINUUM_RESULT_SCHEMA, CONTINUUM_RESULT_SCHEMA_V2, Q4_GAUSS_POINTS, Q4_INTEGRATION_RULE, Q4_NODE_ORDER,
  createContinuumModel, q4GlobalCoordinates, q4ShapeFunctions, solveContinuumModel, validateContinuumResult,
} from '../src/core/element-fea/index.js';
import { model, node, prescribedField, profile, q4, rectangleQ4, t3 } from './lfea-002-fixtures.mjs';

const naturalNodes = [[-1,-1],[1,-1],[1,1],[-1,1]];
naturalNodes.forEach(([xi,eta], nodeIndex) => {
  const values = q4ShapeFunctions(xi, eta);
  values.forEach((value, index) => assert.equal(value, index === nodeIndex ? 1 : 0));
});
for (const [xi,eta] of [[0,0],[-0.4,0.7],[0.8,-0.2]]) {
  const values = q4ShapeFunctions(xi,eta);
  assert.ok(Math.abs(values.reduce((sum,value)=>sum+value,0)-1) < 1e-15);
  const point = q4GlobalCoordinates([{x:0,y:0},{x:2,y:0},{x:2,y:1},{x:0,y:1}], values);
  assert.ok(Math.abs(point.x-(xi+1)) < 1e-15);
  assert.ok(Math.abs(point.y-0.5*(eta+1)) < 1e-15);
}
assert.equal(Q4_NODE_ORDER, 'Q4_CCW_N1_NEG_NEG_N2_POS_NEG_N3_POS_POS_N4_NEG_POS_V1');
assert.equal(Q4_INTEGRATION_RULE, 'Q4_GAUSS_2X2_FULL_V1');
assert.deepEqual(Q4_GAUSS_POINTS.map((row)=>row.integrationPointId), ['GP1','GP2','GP3','GP4']);

const input = rectangleQ4();
const qualifiedModel = createContinuumModel(input);
assert.equal(qualifiedModel.elements[0].type, 'Q4');
assert.equal(qualifiedModel.elements[0].qualityEvidence.integrationRule, Q4_INTEGRATION_RULE);
const result = solveContinuumModel(input);
assert.equal(result.schema, CONTINUUM_RESULT_SCHEMA_V2);
assert.equal(result.status, 'QUALIFIED');
assert.equal(result.integrationPointResults.length, 4);
assert.equal(result.elementIntegrationEvidence[0].points.length, 4);
assert.equal(result.elementQualityEvidence[0].elementType, 'Q4');
assert.equal(result.resultContractCompatibility.predecessor, CONTINUUM_RESULT_SCHEMA);
assert.equal(Object.hasOwn(result, 'elementStresses'), false);
assert.equal(validateContinuumResult(result).ok, true);
assert.ok(Object.isFrozen(result));
assert.ok(Object.isFrozen(result.integrationPointResults));

const t3Nodes = [node('T1',0,0),node('T2',1,0),node('T3',0,1)];
const t3Input = model({ modelIdentity:'T3-REGRESSION', solverProfile:profile(), nodes:t3Nodes, elements:[t3('TE1',['T1','T2','T3'])], prescribedDisplacements:prescribedField(t3Nodes,(x)=>[0.01*x,0]) });
const t3Result = solveContinuumModel(t3Input);
assert.equal(t3Result.schema, CONTINUUM_RESULT_SCHEMA);
assert.equal(t3Result.status, 'QUALIFIED');
assert.equal(Object.hasOwn(t3Result, 'integrationPointResults'), false);
assert.equal(t3Result.elementStrains[0].recoveryLocation, 'T3_CONSTANT_ELEMENT_DOMAIN');
assert.equal(validateContinuumResult(t3Result).ok, true);
console.log('LFEA-002 Q4 interpolation, versioned integration, v2 evidence and T3-v1 compatibility contracts passed.');
