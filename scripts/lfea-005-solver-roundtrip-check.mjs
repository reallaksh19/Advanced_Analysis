import assert from 'node:assert/strict';
import {
  adaptMeshPackage, createConvergenceStudy, interpretConvergenceStudy, solveContinuumModel,
  validateContinuumResult, validateConvergenceResult,
} from '../src/core/element-fea/index.js';
import {
  adapterProfile, holePackage, mixedPackage, planeStrainPackage, prescribedBoundaryPackage,
  rectangularQ4Package, resolveAdapterConvergenceStudy, sparseRoundTripPackage, t3PlatePackage, twoElementQ4Package,
} from './lfea-005-fixtures.mjs';

function solvePackage(input, expectedSchema){const adapted=adaptMeshPackage(input,adapterProfile());assert.equal(adapted.status,'ACCEPTED',JSON.stringify(adapted.diagnostics));const result=solveContinuumModel(adapted.qualifiedModel);assert.equal(result.status,'QUALIFIED',JSON.stringify(result.diagnostics));assert.equal(result.schema,expectedSchema);assert.equal(result.modelSemanticHash,adapted.qualifiedModel.semanticHash);assert.equal(validateContinuumResult(result).ok,true);assert.ok(result.freeDofResidual.infinityNorm<=adapted.qualifiedModel.solverProfile.tolerances.residualForceAbsolute+adapted.qualifiedModel.solverProfile.tolerances.residualForceRelative);assert.ok(Math.abs(result.equilibriumTotals.fx)<=adapted.qualifiedModel.solverProfile.tolerances.forceEquilibriumAbsolute);assert.ok(Math.abs(result.equilibriumTotals.fy)<=adapted.qualifiedModel.solverProfile.tolerances.forceEquilibriumAbsolute);return{adapted,result};}
const q4=solvePackage(rectangularQ4Package(),'fea-continuum-result/v2');
const two=solvePackage(twoElementQ4Package(),'fea-continuum-result/v2');
const t3=solvePackage(t3PlatePackage(),'fea-continuum-result/v1');
const mixed=solvePackage(mixedPackage(),'fea-continuum-result/v2');
const strain=solvePackage(planeStrainPackage(),'fea-continuum-result/v2');assert.ok(strain.result.integrationPointResults.every((row)=>Number.isFinite(row.sigmaZ)));
const prescribed=solvePackage(prescribedBoundaryPackage(),'fea-continuum-result/v2');assert.ok(prescribed.result.nodalDisplacements.some((row)=>row.value===.01));
const hole=solvePackage(holePackage({pressure:true}),'fea-continuum-result/v2');assert.equal(hole.adapted.qualifiedModel.loadCases[0].edgeLoads.length,4);
const sparse=solvePackage(sparseRoundTripPackage(),'fea-continuum-result/v3');assert.equal(sparse.result.backendTrace.backendIdentity,'SPARSE_PCG_V1');assert.ok(sparse.result.iterativeSolverEvidence.finalTrueResidualL2<=sparse.result.iterativeSolverEvidence.targetResidual);
const studyInput=await resolveAdapterConvergenceStudy();const study=createConvergenceStudy(studyInput);assert.ok(study.levels.every((level)=>level.result.schema==='fea-continuum-result/v3'));const interpretation=interpretConvergenceStudy(studyInput);assert.equal(interpretation.status,'QUALIFIED_INTERPRETATION_EVIDENCE');assert.equal(validateConvergenceResult(interpretation).ok,true);
assert.ok(Object.isFrozen(q4.adapted));assert.ok(Object.isFrozen(sparse.result));assert.ok(Object.isFrozen(study));
console.log(JSON.stringify({denseQ4:q4.result.semanticHash,denseT3:t3.result.semanticHash,mixed:mixed.result.semanticHash,sparse:sparse.result.semanticHash,study:study.semanticHash,interpretation:interpretation.semanticHash}));
