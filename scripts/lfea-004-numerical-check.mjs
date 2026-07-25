import assert from 'node:assert/strict';
import { createCsrFromRows, solveContinuumModel, solveSparsePcg } from '../src/core/element-fea/index.js';
import { constrainedLoadQ4, loadedMixed, loadedQ4, loadedT3, prescribedQ4 } from './lfea-004-fixtures.mjs';

const tolerance = 2e-8;
const system = createCsrFromRows([
  [{column:0,value:4},{column:1,value:1}],
  [{column:0,value:1},{column:1,value:3}],
],2,1e-15);
const hand = solveSparsePcg(system,[1,2],{absoluteResidualTolerance:1e-13,relativeResidualTolerance:1e-13,maximumIterations:10});
assert.equal(hand.ok,true); close(hand.solution[0],1/11,1e-14); close(hand.solution[1],7/11,1e-14);
assert.ok(hand.finalTrueResidualL2 <= hand.targetResidual); assert.equal(hand.iterationCount,2);

compareBackends(() => loadedT3(), () => loadedT3({sparse:false}), 'T3 plane stress');
compareBackends(() => loadedQ4(), () => loadedQ4({sparse:false}), 'Q4 plane stress');
compareBackends(() => loadedMixed(), () => loadedMixed({sparse:false}), 'mixed plane stress');
compareBackends(() => loadedT3({formulation:'PLANE_STRAIN'}), () => loadedT3({sparse:false,formulation:'PLANE_STRAIN'}), 'T3 plane strain');
compareBackends(() => loadedQ4({formulation:'PLANE_STRAIN'}), () => loadedQ4({sparse:false,formulation:'PLANE_STRAIN'}), 'Q4 plane strain');
compareBackends(() => prescribedQ4(), () => prescribedQ4({sparse:false}), 'nonzero prescribed displacement');

const constrained = solveContinuumModel(constrainedLoadQ4());
assert.equal(constrained.status,'QUALIFIED'); assert.equal(constrained.iterativeSolverEvidence.iterationCount,0);
close(constrained.appliedLoadTotals.fx + constrained.reactionTotals.fx,0,1e-10);
close(constrained.appliedLoadTotals.fy + constrained.reactionTotals.fy,0,1e-10);
close(constrained.appliedLoadTotals.mz + constrained.reactionTotals.mz,0,1e-10);
assert.ok(constrained.freeDofResidual.infinityNorm <= 1e-12);

function compareBackends(sparseFactory,denseFactory,label) {
  const sparse=solveContinuumModel(sparseFactory()); const dense=solveContinuumModel(denseFactory());
  assert.equal(sparse.status,'QUALIFIED',`${label}: ${JSON.stringify(sparse.diagnostics)}`); assert.equal(dense.status,'QUALIFIED',label);
  compareRows(sparse.nodalDisplacements,dense.nodalDisplacements,'equationIdentity','value',label+' displacement');
  compareRows(sparse.reactions,dense.reactions,'equationIdentity','value',label+' reaction');
  compareRawStress(rawPoints(sparse),rawPoints(dense),label);
  close(sparse.freeDofResidual.infinityNorm,dense.freeDofResidual.infinityNorm,tolerance);
  close(sparse.globalResidual.infinityNorm,dense.globalResidual.infinityNorm,tolerance);
  close(sparse.equilibriumTotals.fx,dense.equilibriumTotals.fx,tolerance); close(sparse.equilibriumTotals.fy,dense.equilibriumTotals.fy,tolerance); close(sparse.equilibriumTotals.mz,dense.equilibriumTotals.mz,tolerance);
  close(sparse.strainEnergy,dense.strainEnergy,tolerance); close(sparse.energyConsistency.elementEnergyTotal,dense.energyConsistency.elementEnergyTotal,tolerance);
  assert.ok(sparse.iterativeSolverEvidence.finalTrueResidualL2 <= sparse.iterativeSolverEvidence.targetResidual);
}
function rawPoints(result) {
  if(result.schema!=='fea-continuum-result/v1') return result.integrationPointResults.map((row)=>({id:`${row.elementId}:${row.integrationPointId}`,stress:row.stress,sigmaZ:row.sigmaZ,principal:row.principalStresses,vm:row.vonMisesStress}));
  return result.elementStresses.map((row)=>{const principal=result.principalStresses.find((item)=>item.elementId===row.elementId);const vm=result.vonMisesStress.find((item)=>item.elementId===row.elementId);return{id:`${row.elementId}:T3_CONSTANT`,stress:row.values,sigmaZ:row.sigmaZ,principal:principal.values,vm:vm.value};});
}
function compareRawStress(left,right,label){const a=[...left].sort(byId),b=[...right].sort(byId);assert.equal(a.length,b.length,label);a.forEach((row,index)=>{assert.equal(row.id,b[index].id,label);row.stress.forEach((v,i)=>close(v,b[index].stress[i],tolerance));close(row.sigmaZ,b[index].sigmaZ,tolerance);row.principal.forEach((v,i)=>close(v,b[index].principal[i],tolerance));close(row.vm,b[index].vm,tolerance);});}
function compareRows(left,right,key,value,label){const a=new Map(left.map((row)=>[row[key],row[value]]));const b=new Map(right.map((row)=>[row[key],row[value]]));assert.deepEqual([...a.keys()].sort(),[...b.keys()].sort(),label);a.forEach((v,id)=>close(v,b.get(id),tolerance));}
function close(actual,expected,limit=tolerance){assert.ok(Number.isFinite(actual)&&Math.abs(actual-expected)<=limit,`${actual} vs ${expected}`);}
function byId(a,b){return a.id<b.id?-1:a.id>b.id?1:0;}
console.log('LFEA-004 PCG hand solve and dense/sparse T3/Q4/mixed equivalence passed.');
