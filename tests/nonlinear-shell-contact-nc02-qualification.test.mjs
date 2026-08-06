import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONTACT_PROCEDURE, REQUIRED_CONTACT_BENCHMARKS } from '../src/core/nonlinear-shell-contact/contact-procedure-contract.js';
import { evaluateContactQualification } from '../src/core/nonlinear-shell-contact/contact-qualification-evaluator.js';
import { FIXTURE_HEAD, createQualifiedContactEvidenceSet, createQualifiedNc01BindingFixture } from '../src/core/nonlinear-shell-contact/nc02-fixtures.js';
import { runNc02NegativeControls } from '../src/core/nonlinear-shell-contact/nc02-negative-controls.js';

test('NC-02 contract registers all ten contact domains and no production authority', () => {
  assert.equal(REQUIRED_CONTACT_BENCHMARKS.length, 10);
  assert.equal(DEFAULT_CONTACT_PROCEDURE.frictionAuthorized, false);
  assert.equal(DEFAULT_CONTACT_PROCEDURE.productionExecutionAuthorized, false);
});

test('NC-02 evaluator derives qualification from sealed raw metrics', () => {
  const report = evaluateContactQualification({
    contract: DEFAULT_CONTACT_PROCEDURE,
    upstreamBinding: createQualifiedNc01BindingFixture(),
    candidateExactHeadSha: FIXTURE_HEAD,
    benchmarkEvidence: createQualifiedContactEvidenceSet(),
  });
  assert.equal(report.status, 'NC02_QUALIFIED');
  assert.equal(report.authority.contactProcedureQualified, true);
  assert.equal(report.authority.nc03Authorized, true);
  assert.equal(report.authority.productionExecutionAuthorized, false);
  assert.equal(report.authority.automaticAssetAcceptanceAuthorized, false);
});

test('NC-02 negative controls fail closed', () => {
  const controls = runNc02NegativeControls();
  assert.ok(controls.length >= 14);
  assert.ok(controls.every((entry) => entry.passed), JSON.stringify(controls.filter((entry) => !entry.passed), null, 2));
});
