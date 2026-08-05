import test from 'node:test';
import assert from 'node:assert/strict';
import { clonePlain } from '../src/core/nonlinear-shell-contact/contracts.js';
import { DEFAULT_SHELL_FORMULATION, validateShellFormulationContract } from '../src/core/nonlinear-shell-contact/shell-formulation-contract.js';
import { createSyntheticQualifiedShellEvidence, createSyntheticSolverBridgeBinding } from '../src/core/nonlinear-shell-contact/nc01-fixtures.js';
import { runNc01NegativeControls } from '../src/core/nonlinear-shell-contact/nc01-negative-controls.js';
import { createShellBenchmarkEvidence, evaluateShellQualification, validateSolverBridgeBinding } from '../src/core/nonlinear-shell-contact/shell-qualification-evaluator.js';

test('NC-01 contract retains numerical-only drilling and fixed-coordinate section recovery', () => {
  assert.equal(validateShellFormulationContract(DEFAULT_SHELL_FORMULATION), true);
  assert.equal(DEFAULT_SHELL_FORMULATION.drillingDof.engineeringOutputAuthorized, false);
  assert.equal(DEFAULT_SHELL_FORMULATION.recoveryPolicy.nodalAveragingAuthorized, false);
  assert.equal(DEFAULT_SHELL_FORMULATION.recoveryPolicy.nearestNodeAuthorized, false);
});

test('synthetic evaluator-path fixture can derive qualification without caller PASS fields', () => {
  const head = '1111111111111111111111111111111111111111';
  const report = evaluateShellQualification({
    contract: DEFAULT_SHELL_FORMULATION,
    upstreamReceipt: createSyntheticSolverBridgeBinding(),
    candidateExactHeadSha: head,
    benchmarkEvidence: createSyntheticQualifiedShellEvidence(head),
  });
  assert.equal(report.status, 'NC01_QUALIFIED');
  assert.equal(report.authority.shellFormulationQualified, true);
  assert.equal(report.authority.nc02Authorized, true);
  assert.equal(report.authority.contactProcedureQualified, false);
  assert.equal(report.authority.productionExecutionAuthorized, false);
});

test('all registered negative controls fail closed', () => {
  const controls = runNc01NegativeControls();
  assert.ok(controls.length >= 16);
  assert.ok(controls.every((entry) => entry.passed), JSON.stringify(controls, null, 2));
});

test('caller-created PASS is rejected before evidence sealing', () => {
  const template = clonePlain(createSyntheticQualifiedShellEvidence()[0]);
  delete template.semanticHash;
  assert.throws(() => createShellBenchmarkEvidence({ ...template, passed: true }), /caller-controlled disposition/i);
});

test('upstream binding is semantically sealed', () => {
  const binding = createSyntheticSolverBridgeBinding();
  assert.equal(validateSolverBridgeBinding(binding), true);
  const tampered = clonePlain(binding);
  tampered.artifactId = '999';
  assert.throws(() => validateSolverBridgeBinding(tampered), /semanticHash/i);
});
