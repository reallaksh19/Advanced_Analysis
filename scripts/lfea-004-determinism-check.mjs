import assert from 'node:assert/strict';
import { buildCsrMatrix, solveContinuumModel } from '../src/core/element-fea/index.js';
import { clone, loadedMixed } from './lfea-004-fixtures.mjs';
const limits={maximumDofs:20,maximumNonzeros:100,maximumEstimatedStorageBytes:10000};
const contributions=[
  {contributionIdentity:'E2',indices:[1,2],stiffness:[[3,-1],[-1,2]]},
  {contributionIdentity:'E1',indices:[0,1],stiffness:[[2,-1],[-1,3]]},
  {contributionIdentity:'E3',indices:[0,1],stiffness:[[1,1],[1,1]]},
];
const matrixA=buildCsrMatrix(3,contributions,limits,1e-12);
const matrixB=buildCsrMatrix(3,[...contributions].reverse(),limits,1e-12);
assert.deepEqual(Array.from(matrixA.rowPointers),Array.from(matrixB.rowPointers));
assert.deepEqual(Array.from(matrixA.columnIndices),Array.from(matrixB.columnIndices));
assert.deepEqual(Array.from(matrixA.values),Array.from(matrixB.values));
assert.equal(matrixA.evidence.matrixIdentity,matrixB.evidence.matrixIdentity);
assert.equal(matrixA.rowPointers[1]-matrixA.rowPointers[0],1);
assert.ok(!Array.from(matrixA.values).some((value,index)=>value===0 && matrixA.columnIndices[index]!==rowFor(matrixA,index)));

const original=loadedMixed(); const first=solveContinuumModel(original); const repeated=solveContinuumModel(clone(original));
assert.equal(first.status,'QUALIFIED'); assert.equal(first.semanticHash,repeated.semanticHash); assert.equal(JSON.stringify(first),JSON.stringify(repeated));
const reordered=clone(original); reordered.nodes.reverse(); reordered.elements.reverse(); reordered.materials.reverse(); reordered.restraints.reverse(); reordered.prescribedDisplacements.reverse(); reordered.loadCases.reverse(); reordered.sourceReferences.reverse(); reordered.limitations.reverse();
reordered.loadCases.forEach((row)=>{row.nodalForces.reverse();row.edgeLoads.reverse();});
const second=solveContinuumModel(reordered);
assert.equal(second.status,'QUALIFIED'); assert.equal(first.semanticHash,second.semanticHash); assert.equal(JSON.stringify(first),JSON.stringify(second));
assert.equal(first.sparseMatrixEvidence.matrixIdentity,second.sparseMatrixEvidence.matrixIdentity);
assert.ok(Object.isFrozen(first)); assert.ok(Object.isFrozen(first.iterativeSolverEvidence)); assert.ok(Object.isFrozen(first.iterativeSolverEvidence.residualNormHistory));
assert.equal(findForbiddenKey(first),null);
console.log(`LFEA-004 deterministic CSR and sparse result identity passed: ${first.semanticHash}`);
function rowFor(matrix,index){let row=0;while(matrix.rowPointers[row+1]<=index)row+=1;return row;}
function findForbiddenKey(value,path='$'){if(!value||typeof value!=='object')return null;for(const [key,child] of Object.entries(value)){if(/duration|wall.?clock|heap|runner/i.test(key))return `${path}.${key}`;const found=findForbiddenKey(child,`${path}.${key}`);if(found)return found;}return null;}
