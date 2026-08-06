import assert from 'node:assert/strict';
import { context, derived, executions, packageResult, preflight, recovered, solve } from './inputxml-analysis-result-package-fixture.js';

const test = (id, name, body) => { body(); console.log(`${id} PASS ${name}`); };

test('MH-PR10-01', 'one sealed package retains every governed analysis layer', () => {
  assert.equal(packageResult.modelHealth.semanticHash, context.report.semanticHash);
  assert.equal(packageResult.physicalExecutions.length, solve.physicalCases.length);
  assert.equal(packageResult.recoveredResults.length, solve.physicalCases.length);
  assert.equal(packageResult.derivedCases.length, derived.length);
  assert.equal(packageResult.codeEvaluation.results.length, 4);
});

test('MH-PR10-02', 'source, preparation, preflight and stiffness ancestry are exact', () => {
  assert.equal(packageResult.sourceIdentity.sourceBundleSemanticHash, context.sourceBundle.semanticHash);
  assert.equal(packageResult.sourceIdentity.solvePreparationSemanticHash, solve.semanticHash);
  assert.equal(packageResult.sourceIdentity.preflightSemanticHash, preflight.semanticHash);
  assert.equal(packageResult.evidenceManifest.preparation.stiffnessStateHash, preflight.stiffnessStateHash);
});

test('MH-PR10-03', 'each prepared physical case has one execution and recovery', () => {
  assert.deepEqual(packageResult.physicalExecutions.map((row) => row.caseId).sort(),
    solve.physicalCases.map((row) => row.caseId).sort());
  for (const row of packageResult.recoveredResults) assert.ok(
    packageResult.physicalExecutions.some((execution) =>
      execution.semanticHash === row.executionIdentity.caseExecutionSemanticHash));
});

test('MH-PR10-04', 'derived and B31 results retain recovery and station custody', () => {
  for (const row of packageResult.derivedCases) for (const source of row.sourceCases) assert.ok(
    recovered.some((recovery) => recovery.recoveredCaseId === source.recoveredCaseId));
  for (const row of packageResult.codeEvaluation.results) {
    assert.ok(row.sourceRecoverySemanticHash);
    assert.ok(row.stationCustodyHash);
  }
});

export { executions, recovered };
