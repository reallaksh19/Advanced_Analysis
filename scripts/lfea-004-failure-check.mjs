import assert from 'node:assert/strict';
import { createCsrFromRows, solveContinuumModel, solveSparsePcg } from '../src/core/element-fea/index.js';
import { clone, loadedMixed, loadedT3 } from './lfea-004-fixtures.mjs';

assert.throws(() => createCsrFromRows([[{column:1,value:1}],[{column:0,value:1},{column:1,value:2}]],2,1e-12), /missing its diagonal/);
assert.throws(() => createCsrFromRows([[{column:0,value:1},{column:1,value:2}],[{column:0,value:3},{column:1,value:1}]],2,1e-12), /symmetry tolerance/);
assert.throws(() => createCsrFromRows([[{column:0,value:1},{column:1,value:Infinity}],[{column:0,value:Infinity},{column:1,value:1}]],2,1e-12), /non-finite/);
assert.throws(() => createCsrFromRows([[{column:0,value:0}]],1,0), /explicit zero/);

const negative=createCsrFromRows([[{column:0,value:-1}]],1,0);
const negativeResult=solveSparsePcg(negative,[1],pcg()); assert.equal(negativeResult.ok,false); assert.match(negativeResult.breakdownReason,/NON_POSITIVE_DIAGONAL/);
const indefinite=createCsrFromRows([[{column:0,value:1},{column:1,value:2}],[{column:0,value:2},{column:1,value:1}]],2,0);
const pAp=solveSparsePcg(indefinite,[1,-1],pcg()); assert.equal(pAp.ok,false); assert.equal(pAp.breakdownReason,'NON_POSITIVE_P_DOT_A_P');
const spd=createCsrFromRows([[{column:0,value:4},{column:1,value:1}],[{column:0,value:1},{column:1,value:3}]],2,0);
const exhausted=solveSparsePcg(spd,[1,2],pcg({maximumIterations:1})); assert.equal(exhausted.ok,false); assert.equal(exhausted.breakdownReason,'MAXIMUM_ITERATIONS_EXHAUSTED');
const drift=createCsrFromRows([[{column:0,value:1e8},{column:1,value:1}],[{column:0,value:1},{column:1,value:1}]],2,0);
const trueResidual=solveSparsePcg(drift,[100000001,1],pcg({absoluteResidualTolerance:1e-30,relativeResidualTolerance:1e-30}));
assert.equal(trueResidual.ok,false); assert.equal(trueResidual.breakdownReason,'FINAL_TRUE_RESIDUAL_ABOVE_TARGET'); assert.ok(trueResidual.finalTrueResidualL2 > trueResidual.targetResidual);

const singular=loadedT3(); singular.restraints=[];
rejectedNoPartial(solveContinuumModel(singular),['REJECTED_SINGULAR','QUARANTINED_NUMERICAL']);
const unsupported=loadedT3(); unsupported.solverProfile.linearBackend='DENSE_REFERENCE';
rejectedNoPartial(solveContinuumModel(unsupported),['REJECTED_INVALID']);
const noFallback=loadedMixed(); noFallback.solverProfile.maximumIterations=1; noFallback.solverProfile.absoluteResidualTolerance=1e-30; noFallback.solverProfile.relativeResidualTolerance=1e-30;
const noFallbackResult=solveContinuumModel(noFallback); rejectedNoPartial(noFallbackResult,['QUARANTINED_NUMERICAL']); assert.equal(noFallbackResult.backendTrace.backendIdentity,'SPARSE_PCG_V1');
const dofCapacity=loadedT3(); dofCapacity.solverProfile.maximumDofs=2; const dofRejected=solveContinuumModel(dofCapacity); rejectedNoPartial(dofRejected,['REJECTED_INVALID']); assert.equal(dofRejected.capacityEvidence.status,'REJECTED');
const nnzCapacity=loadedT3(); nnzCapacity.solverProfile.maximumNonzeros=1; const nnzRejected=solveContinuumModel(nnzCapacity); rejectedNoPartial(nnzRejected,['REJECTED_INVALID']); assert.equal(nnzRejected.capacityEvidence.status,'REJECTED');

const nonfinite=clone(loadedT3()); nonfinite.loadCases[0].nodalForces[0].fx=NaN; rejectedNoPartial(solveContinuumModel(nonfinite),['REJECTED_INVALID']);
console.log('LFEA-004 breakdown, nonconvergence, capacity and no-fallback containment passed.');

function pcg(overrides={}){return{absoluteResidualTolerance:1e-12,relativeResidualTolerance:1e-12,maximumIterations:10,...overrides};}
function rejectedNoPartial(result,statuses){assert.ok(statuses.includes(result.status),JSON.stringify(result));assert.equal(result.qualifiedResults,null);['nodalDisplacements','reactions','integrationPointResults','elementStresses','strainEnergy','elementStrainEnergy'].forEach((field)=>assert.equal(Object.hasOwn(result,field),false));}
