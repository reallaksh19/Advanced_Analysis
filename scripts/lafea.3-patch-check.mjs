import assert from 'node:assert/strict';
import { calculateLocalContinuum, createCanonicalLocalContinuumModel, FORMULATIONS, QUALIFICATION_STATES } from '../src/core/local-continuum/index.js';
import { patchSource } from './lafea.3-fixtures.mjs';
for(const formulation of [FORMULATIONS.PLANE_STRESS,FORMULATIONS.PLANE_STRAIN])checkPatch(formulation);
console.log('LAFEA.3 two-triangle extension patch, traction parity, scaling and independent cases passed.');
function checkPatch(formulation){const result=calculateLocalContinuum(createCanonicalLocalContinuumModel(patchSource({formulation})));assert.equal(result.qualification.state,QUALIFICATION_STATES.ACCEPTED);const traction=caseBy(result,'TRACTION'),nodal=caseBy(result,'NODAL'),reverse=caseBy(result,'REVERSE'),double=caseBy(result,'DOUBLE');compareDisplacements(traction,nodal,1);compareDisplacements(reverse,nodal,-1);compareDisplacements(double,nodal,2);for(const element of traction.elementResults){close(element.stress.sigmaX,10);close(element.stress.sigmaY,0);close(element.stress.tauXY,0);if(formulation===FORMULATIONS.PLANE_STRESS)close(element.stress.sigmaZ,0);else close(element.stress.sigmaZ,3);}assert.ok(traction.supportReactions.length===3);assert.equal(traction.equilibrium.accepted,true);}
function caseBy(result,id){return result.loadCaseResults.find((row)=>row.loadCaseId===id);}
function compareDisplacements(actual,expected,factor){actual.nodalDisplacements.forEach((row,index)=>{close(row.ux,factor*expected.nodalDisplacements[index].ux);close(row.uy,factor*expected.nodalDisplacements[index].uy);});}
function close(actual,expected){assert.ok(Math.abs(actual-expected)<=1e-7*Math.max(1,Math.abs(expected)),`${actual} != ${expected}`);}
