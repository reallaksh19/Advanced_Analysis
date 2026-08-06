import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createRealModuleQualificationContract,
  validateRealModuleQualificationContract,
} from '../src/core/nonlinear-shell-contact/real-module-qualification-contract.js';
import {
  QUALIFIED_NC08_SYNTHETIC_REFERENCE_CUSTODY,
  evaluateRealModuleQualification,
} from '../src/core/nonlinear-shell-contact/real-module-qualification-evaluator.js';
import { createValidRealModuleQualificationFixture } from '../src/core/nonlinear-shell-contact/nc08r-fixtures.js';
import { createNc08rNegativeControls } from '../src/core/nonlinear-shell-contact/nc08r-negative-controls.js';

test('NC-08R qualifies only a complete source-tree-bound real-module fixture', () => {
  const fixture = createValidRealModuleQualificationFixture();
  const report = evaluateRealModuleQualification(fixture);
  assert.equal(report.status, 'NC08R_REAL_MODULE_QUALIFIED');
  assert.equal(report.candidateSourceTreeSha, fixture.candidateSourceTreeSha);
  assert.equal(report.authority.syntheticReferenceModuleQualified, true);
  assert.equal(report.authority.realModuleQualificationQualified, true);
  assert.equal(report.authority.moduleQualified, true);
  assert.equal(report.authority.nc09ProductionAuthorizationAuthorized, true);
  assert.equal(report.authority.productionExecutionAuthorized, false);
  assert.equal(report.authority.nc10Authorized, false);
  assert.deepEqual(report.blockers, []);
});

test('NC-08R pins the immutable qualified NC-08 synthetic receipt', () => {
  const fixture = createValidRealModuleQualificationFixture();
  for (const [key, value] of Object.entries(QUALIFIED_NC08_SYNTHETIC_REFERENCE_CUSTODY)) {
    assert.equal(fixture.upstreamBinding[key], value);
  }
});

test('NC-08R report replay is deterministic', () => {
  const fixture = createValidRealModuleQualificationFixture();
  assert.deepEqual(evaluateRealModuleQualification(fixture), evaluateRealModuleQualification(fixture));
});

test('NC-08R negative controls fail closed without production authority', () => {
  const fixture = createValidRealModuleQualificationFixture();
  const controls = createNc08rNegativeControls(fixture);
  assert.ok(controls.length >= 29);
  for (const control of controls) {
    const report = evaluateRealModuleQualification(control.input);
    assert.equal(report.status, 'NC08R_BLOCKED', control.name);
    assert.equal(report.authority.moduleQualified, false, control.name);
    assert.equal(report.authority.productionExecutionAuthorized, false, control.name);
    assert.equal(report.authority.nc10Authorized, false, control.name);
    assert.ok(report.blockers.length > 0, control.name);
  }
});

test('NC-08R contract cannot authorize production execution', () => {
  assert.throws(
    () => createRealModuleQualificationContract({ productionExecutionAuthorized: true }),
    /outside NC-08R authority/u,
  );
  assert.equal(validateRealModuleQualificationContract(createRealModuleQualificationContract()), true);
});

test('missing external release evidence remains blocked', () => {
  const fixture = createValidRealModuleQualificationFixture();
  const report = evaluateRealModuleQualification({
    ...fixture,
    upstreamBinding: null,
    releaseRecord: null,
    domainEvidence: [],
  });
  assert.equal(report.status, 'NC08R_BLOCKED');
  assert.equal(report.authority.moduleQualified, false);
  assert.equal(report.authority.productionExecutionAuthorized, false);
  assert.equal(report.authority.nc09ProductionAuthorizationAuthorized, false);
  assert.equal(report.authority.nc10Authorized, false);
});
