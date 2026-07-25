import assert from 'node:assert/strict';
import {
  CONTINUUM_RESULT_SCHEMA, CONTINUUM_RESULT_SCHEMA_V2, CONTINUUM_RESULT_SCHEMA_V3,
  JACOBI_PRECONDITIONER_ID, LFEA_PROFILE_SCHEMA, LFEA_PROFILE_SCHEMA_V2, LINEAR_BACKENDS,
  SPARSE_STORAGE_ID, buildCsrMatrix, createConvergenceStudy, createLfeaProfile, interpretConvergenceStudy, solveContinuumModel, validateContinuumResult,
} from '../src/core/element-fea/index.js';
import { loadedQ4, loadedT3, sparseConvergenceStudy, sparseProfile } from './lfea-004-fixtures.mjs';

const legacy = loadedT3({ sparse: false }).solverProfile;
assert.equal(createLfeaProfile(legacy).schema, LFEA_PROFILE_SCHEMA);
const sparse = createLfeaProfile(sparseProfile());
assert.equal(sparse.schema, LFEA_PROFILE_SCHEMA_V2);
assert.equal(sparse.linearBackend, LINEAR_BACKENDS.SPARSE_PCG_V1);
assert.equal(sparse.preconditioner, JACOBI_PRECONDITIONER_ID);
['absoluteResidualTolerance','relativeResidualTolerance','maximumIterations','maximumDofs','maximumNonzeros','maximumEstimatedStorageBytes'].forEach((field) => assert.ok(Number.isFinite(sparse[field]) && sparse[field] > 0));
assert.throws(() => createLfeaProfile({ ...sparseProfile(), linearBackend: 'DENSE_REFERENCE' }), /linearBackend/);
const missing = sparseProfile(); delete missing.maximumIterations; assert.throws(() => createLfeaProfile(missing), /missing required fields/);

const limits = { maximumDofs: 10, maximumNonzeros: 20, maximumEstimatedStorageBytes: 4096 };
const matrix = buildCsrMatrix(3, [
  { contributionIdentity:'E2', indices:[1,2], stiffness:[[2,-1],[-1,2]] },
  { contributionIdentity:'E1', indices:[0,1], stiffness:[[2,-1],[-1,2]] },
], limits, 1e-12);
assert.ok(matrix.rowPointers instanceof Int32Array);
assert.ok(matrix.columnIndices instanceof Int32Array);
assert.ok(matrix.values instanceof Float64Array);
assert.equal(matrix.storageIdentity, SPARSE_STORAGE_ID);
assert.equal(matrix.evidence.storageIdentity, SPARSE_STORAGE_ID);
assert.equal(matrix.evidence.rowCount, 3); assert.equal(matrix.evidence.columnCount, 3);
assert.equal(matrix.evidence.symmetryEvidence.status, 'QUALIFIED_SYMMETRIC');
assert.equal(matrix.evidence.diagonalEvidence.status, 'DIAGONAL_PRESENT_FINITE_NONZERO');
assert.equal(matrix.capacityEvidence.status, 'ACCEPTED');
assert.ok(Object.isFrozen(matrix.evidence));
for (let row=0;row<matrix.rowCount;row+=1) for(let index=matrix.rowPointers[row]+1;index<matrix.rowPointers[row+1];index+=1) assert.ok(matrix.columnIndices[index-1] < matrix.columnIndices[index]);

const denseT3 = solveContinuumModel(loadedT3({ sparse:false }));
const denseQ4 = solveContinuumModel(loadedQ4({ sparse:false }));
const sparseT3 = solveContinuumModel(loadedT3());
assert.equal(denseT3.schema, CONTINUUM_RESULT_SCHEMA); assert.equal(denseT3.status, 'QUALIFIED');
assert.equal(denseQ4.schema, CONTINUUM_RESULT_SCHEMA_V2); assert.equal(denseQ4.status, 'QUALIFIED');
assert.equal(sparseT3.schema, CONTINUUM_RESULT_SCHEMA_V3); assert.equal(sparseT3.status, 'QUALIFIED');
assert.equal(sparseT3.backendIdentity, LINEAR_BACKENDS.SPARSE_PCG_V1);
assert.equal(sparseT3.iterativeSolverEvidence.terminationStatus, 'RESIDUAL_TARGET_SATISFIED');
assert.equal(sparseT3.sparseMatrixEvidence.storageIdentity, SPARSE_STORAGE_ID);
assert.equal(validateContinuumResult(sparseT3).ok, true);
assert.ok(Object.isFrozen(sparseT3)); assert.ok(Object.isFrozen(sparseT3.sparseMatrixEvidence)); assert.ok(Object.isFrozen(sparseT3.iterativeSolverEvidence));

const studyInput=sparseConvergenceStudy(); const study=createConvergenceStudy(studyInput); const interpretation=interpretConvergenceStudy(studyInput);
assert.ok(study.levels.every((row)=>row.result.schema===CONTINUUM_RESULT_SCHEMA_V3));
assert.equal(interpretation.status,'QUALIFIED_INTERPRETATION_EVIDENCE');

console.log('LFEA-004 profile-v2, CSR, backend, result-v3 and convergence-consumer contracts passed.');
