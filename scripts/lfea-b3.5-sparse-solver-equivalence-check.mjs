#!/usr/bin/env node

/**
 * M002 permanent dense-vs-sparse production-solver equivalence proof.
 *
 * The same FRAME-3D-01 and PRESCRIBED-01 model/load fixtures are solved by
 * both declared backends. Displacements and reactions use the existing B3.3
 * 1e-8 relative tolerance. Qualification values use 1e-8 relative with a
 * fixed 1e-12 absolute floor because several accepted diagnostics are
 * intentionally at floating-point zero. Condition estimates are not compared
 * numerically because the dense backend reports a pivot-ratio proxy while the
 * sparse backend reports deterministic power/inverse-power iteration; both
 * must remain finite and in the same qualification band.
 */

import assert from 'node:assert/strict';
import {
  DENSE_DIRECT_BACKEND_ID,
  SPARSE_DIRECT_BACKEND_ID,
  compileSolverExecution,
  createFactorizationCache,
} from '../src/core/linear-fea-solver/index.js';
import {
  cantileverCompilation,
  cantileverWithSettlementSlotCompilation,
  elementContributions,
  settlementLoadCase,
  solverProfile,
  tipLoadCase,
  underRestrainedCompilation,
} from './lfea-b3.3-solver-fixtures.mjs';

const OUTPUT_RELATIVE_TOLERANCE = 1e-8;
const DIAGNOSTIC_RELATIVE_TOLERANCE = 1e-8;
const DIAGNOSTIC_ABSOLUTE_FLOOR = 1e-12;
const measurements = {
  outputRelativeTolerance: OUTPUT_RELATIVE_TOLERANCE,
  diagnosticRelativeTolerance: DIAGNOSTIC_RELATIVE_TOLERANCE,
  diagnosticAbsoluteFloor: DIAGNOSTIC_ABSOLUTE_FLOOR,
  cases: {},
};

console.log('\n--- LFEA B-3.5 dense-vs-sparse solver equivalence check ---');

const defaultProfile = solverProfile();
assert.equal(defaultProfile.backend, SPARSE_DIRECT_BACKEND_ID, 'the shared production-path fixture profile must select sparse by default');

const cantilever = cantileverCompilation();
const contributions = elementContributions();
compareCase({ caseId: 'FRAME-3D-01', compilation: cantilever, loadCase: tipLoadCase(cantilever), elementContributions: contributions });

const settled = cantileverWithSettlementSlotCompilation();
compareCase({ caseId: 'PRESCRIBED-01', compilation: settled, loadCase: settlementLoadCase(settled), elementContributions: contributions });

checkBackendSeparatedReuse();
checkNearSingularClassification();
checkSparseDeterminism();

console.log(JSON.stringify(measurements, null, 2));
console.log('\nLFEA B-3.5 dense-vs-sparse solver equivalence check PASS\n');

function compareCase({ caseId, compilation, loadCase, elementContributions }) {
  const dense = solveWithBackend({ compilation, loadCase, elementContributions, backend: DENSE_DIRECT_BACKEND_ID });
  const sparse = solveWithBackend({ compilation, loadCase, elementContributions, backend: SPARSE_DIRECT_BACKEND_ID });

  assert.equal(dense.factorization.backend, DENSE_DIRECT_BACKEND_ID);
  assert.equal(sparse.factorization.backend, SPARSE_DIRECT_BACKEND_ID);
  assert.equal(dense.status, sparse.status, `${caseId} qualification status`);
  assert.equal(dense.assembly.tripletCount, sparse.assembly.tripletCount);
  assert.equal(dense.assembly.lowerTriangleNonzeroCount, sparse.assembly.lowerTriangleNonzeroCount);
  assert.equal(dense.assembly.symmetryResidual, sparse.assembly.symmetryResidual);

  const displacement = compareNamedVectors(`${caseId} displacement`, dense.displacement, sparse.displacement);
  const reactions = compareNamedVectors(`${caseId} reactions`, dense.reactions, sparse.reactions);

  let maximumDiagnosticAbsoluteDifference = 0;
  for (const name of ['residual', 'forceEquilibrium', 'momentEquilibrium', 'energyBalance']) {
    const denseDiagnostic = dense.diagnostics[name];
    const sparseDiagnostic = sparse.diagnostics[name];
    assert.equal(denseDiagnostic.status, sparseDiagnostic.status, `${caseId} ${name} status`);
    assertDiagnosticClose(sparseDiagnostic.value, denseDiagnostic.value, `${caseId} ${name}.value`);
    maximumDiagnosticAbsoluteDifference = Math.max(maximumDiagnosticAbsoluteDifference, Math.abs(sparseDiagnostic.value - denseDiagnostic.value));
  }

  assert.equal(dense.diagnostics.conditioning.status, sparse.diagnostics.conditioning.status, `${caseId} conditioning qualification band`);
  assert.ok(Number.isFinite(dense.factorization.conditionEstimate));
  assert.ok(Number.isFinite(sparse.factorization.conditionEstimate));
  assert.equal(dense.factorization.conditionEstimateMethod, 'PIVOT_MAGNITUDE_RATIO_V1');
  assert.equal(sparse.factorization.conditionEstimateMethod, 'POWER_INVERSE_POWER_ITERATION_V1');
  assertPivotStatistics(dense, `${caseId} dense`);
  assertPivotStatistics(sparse, `${caseId} sparse`);

  measurements.cases[caseId] = {
    maximumDisplacementRelativeDifference: displacement.maximumRelativeDifference,
    maximumReactionRelativeDifference: reactions.maximumRelativeDifference,
    maximumDiagnosticAbsoluteDifference,
    denseConditionEstimate: dense.factorization.conditionEstimate,
    sparseConditionEstimate: sparse.factorization.conditionEstimate,
    tripletCountBothTriangles: dense.assembly.tripletCount,
    sparseLowerTriangleNonzeroCount: sparse.assembly.lowerTriangleNonzeroCount,
    symmetryResidual: dense.assembly.symmetryResidual,
  };
}

function solveWithBackend({ compilation, loadCase, elementContributions, backend, cache }) {
  return compileSolverExecution({ compilation, elementContributions, loadCase, solverProfile: solverProfile({ backend }), cache });
}

function compareNamedVectors(label, denseEntries, sparseEntries) {
  assert.equal(denseEntries.length, sparseEntries.length, `${label} length`);
  const sparseByIdentity = new Map(sparseEntries.map((entry) => [`${entry.nodeId}:${entry.dof}`, entry.value]));
  let maximumRelativeDifference = 0;
  denseEntries.forEach((entry) => {
    const identity = `${entry.nodeId}:${entry.dof}`;
    assert.equal(sparseByIdentity.has(identity), true, `${label} missing ${identity}`);
    const sparseValue = sparseByIdentity.get(identity);
    const scale = Math.max(Math.abs(entry.value), 1e-300);
    const relativeDifference = Math.abs(sparseValue - entry.value) / scale;
    maximumRelativeDifference = Math.max(maximumRelativeDifference, relativeDifference);
    assert.ok(
      Math.abs(sparseValue - entry.value) <= OUTPUT_RELATIVE_TOLERANCE * scale,
      `${label} ${identity}: sparse ${sparseValue} differs from dense ${entry.value} beyond ${OUTPUT_RELATIVE_TOLERANCE} relative`,
    );
  });
  return { maximumRelativeDifference };
}

function assertDiagnosticClose(actual, expected, label) {
  const tolerance = Math.max(DIAGNOSTIC_ABSOLUTE_FLOOR, DIAGNOSTIC_RELATIVE_TOLERANCE * Math.abs(expected));
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: sparse ${actual} differs from dense ${expected} beyond ${tolerance} combined tolerance`);
}

function assertPivotStatistics(execution, label) {
  const statistics = execution.factorization.pivotStatistics;
  assert.ok(Number.isFinite(statistics.minAbsPivot), `${label} minAbsPivot`);
  assert.ok(Number.isFinite(statistics.maxAbsPivot), `${label} maxAbsPivot`);
  assert.ok(statistics.minAbsPivot > 0, `${label} minAbsPivot must be positive`);
  assert.ok(statistics.maxAbsPivot >= statistics.minAbsPivot, `${label} pivot range`);
  assert.equal(statistics.negativePivotCount, 0, `${label} negative pivot count`);
}

function checkBackendSeparatedReuse() {
  const cache = createFactorizationCache();
  const loadCase = tipLoadCase(cantilever);
  const denseFirst = solveWithBackend({ compilation: cantilever, loadCase, elementContributions: contributions, backend: DENSE_DIRECT_BACKEND_ID, cache });
  const sparseFirst = solveWithBackend({ compilation: cantilever, loadCase, elementContributions: contributions, backend: SPARSE_DIRECT_BACKEND_ID, cache });
  const denseSecond = solveWithBackend({ compilation: cantilever, loadCase, elementContributions: contributions, backend: DENSE_DIRECT_BACKEND_ID, cache });
  const sparseSecond = solveWithBackend({ compilation: cantilever, loadCase, elementContributions: contributions, backend: SPARSE_DIRECT_BACKEND_ID, cache });

  assert.equal(denseFirst.factorization.reused, false);
  assert.equal(sparseFirst.factorization.reused, false);
  assert.equal(denseSecond.factorization.reused, true);
  assert.equal(sparseSecond.factorization.reused, true);
  assert.equal(denseFirst.factorizationHandle, denseSecond.factorizationHandle);
  assert.equal(sparseFirst.factorizationHandle, sparseSecond.factorizationHandle);
  assert.notEqual(denseFirst.factorizationHandle, sparseFirst.factorizationHandle);
  assert.equal(denseFirst.factorization.cacheKey, sparseFirst.factorization.cacheKey);
}

function checkNearSingularClassification() {
  const underRestrained = underRestrainedCompilation();
  const loadCase = tipLoadCase(underRestrained);
  for (const backend of [DENSE_DIRECT_BACKEND_ID, SPARSE_DIRECT_BACKEND_ID]) {
    assert.throws(
      () => solveWithBackend({ compilation: underRestrained, loadCase, elementContributions: contributions, backend }),
      (error) => {
        assert.equal(error?.code, 'SOLVER_NEAR_ZERO_PIVOT', `${backend} diagnostic code`);
        assert.match(error.message, /Free DOF/u);
        assert.match(error.message, /connected component/u);
        return true;
      },
    );
  }
}

function checkSparseDeterminism() {
  const loadCase = tipLoadCase(cantilever);
  const first = solveWithBackend({ compilation: cantilever, loadCase, elementContributions: contributions, backend: SPARSE_DIRECT_BACKEND_ID });
  const second = solveWithBackend({ compilation: cantilever, loadCase, elementContributions: contributions, backend: SPARSE_DIRECT_BACKEND_ID });
  const publicRecord = (execution) => {
    const { factorizationHandle: _factorizationHandle, prescribedValueDiagnostics: _prescribedValueDiagnostics, nodalForceDiagnostics: _nodalForceDiagnostics, ...record } = execution;
    return record;
  };
  assert.equal(JSON.stringify(publicRecord(first)), JSON.stringify(publicRecord(second)));
  assert.equal(first.semanticHash, second.semanticHash);
}
