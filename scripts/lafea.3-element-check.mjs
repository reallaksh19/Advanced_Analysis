import assert from 'node:assert/strict';
import { bMatrix, buildElementEvidence, constitutiveEvidence, createCanonicalLocalContinuumModel, FORMULATIONS } from '../src/core/local-continuum/index.js';
import { matrixVector } from '../src/core/local-continuum/matrix.js';
import { clone, triangleSource } from './lafea.3-fixtures.mjs';
const model=createCanonicalLocalContinuumModel(triangleSource()),element=buildElementEvidence(model)[0],nodes=model.nodes;
const affine=nodes.flatMap((node)=>[2+0.01*node.x+0.02*node.y,-3+0.03*node.x-0.04*node.y]);closeVector(matrixVector(element.bMatrix,affine),[0.01,-0.04,0.05]);const translation=nodes.flatMap(()=>[2,-3]);closeVector(matrixVector(element.bMatrix,translation),[0,0,0]);const rotation=nodes.flatMap((node)=>[-0.001*node.y,0.001*node.x]);closeVector(matrixVector(element.bMatrix,rotation),[0,0,0]);
const clockwise=createCanonicalLocalContinuumModel(triangleSource({clockwise:true}));assert.equal(clockwise.semanticHash,model.semanticHash);assert.deepEqual(buildElementEvidence(clockwise)[0],element);assert.equal(element.stiffnessSymmetry.accepted,true);assert.equal(element.constitutiveSymmetry.accepted,true);
const doubleE=buildElementEvidence(createCanonicalLocalContinuumModel(triangleSource({elasticModulus:400000})))[0],doubleT=buildElementEvidence(createCanonicalLocalContinuumModel(triangleSource({thickness:20})))[0];close(doubleE.localStiffnessMatrix[0][0],2*element.localStiffnessMatrix[0][0]);close(doubleT.localStiffnessMatrix[0][0],2*element.localStiffnessMatrix[0][0]);
const material=model.materials[0],stress=constitutiveEvidence(material,FORMULATIONS.PLANE_STRESS,model.qualificationProfile).matrix,strain=constitutiveEvidence(material,FORMULATIONS.PLANE_STRAIN,model.qualificationProfile).matrix;close(stress[0][0],200000/(1-0.3**2));close(stress[0][1],stress[0][0]*0.3);close(strain[0][0],200000*(1-0.3)/((1+0.3)*(1-0.6)));close(strain[0][1],200000*0.3/((1+0.3)*(1-0.6)));
assert.throws(()=>createCanonicalLocalContinuumModel({...clone(triangleSource()),elements:[{...triangleSource().elements[0],nodeIds:['A','B','B']}]}));
console.log('LAFEA.3 affine, rigid-body, orientation, symmetry, scaling and constitutive benchmarks passed.');
function close(actual,expected){assert.ok(Math.abs(actual-expected)<=1e-9*Math.max(1,Math.abs(expected)),`${actual} != ${expected}`);}
function closeVector(actual,expected){actual.forEach((value,index)=>close(value,expected[index]));}
