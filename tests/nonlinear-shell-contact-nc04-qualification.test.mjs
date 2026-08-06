import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluatePlasticMaterialQualification } from '../src/core/nonlinear-shell-contact/plastic-material-qualification-evaluator.js';
import { qualifiedNc04Input } from '../src/core/nonlinear-shell-contact/nc04-fixtures.js';
import { nc04NegativeControls } from '../src/core/nonlinear-shell-contact/nc04-negative-controls.js';

test('NC-04 qualified fixture grants only material and NC-05 authority', () => {
  const report = evaluatePlasticMaterialQualification(qualifiedNc04Input());
  assert.equal(report.status, 'NC04_QUALIFIED');
  assert.equal(report.authority.plasticMaterialQualified, true);
  assert.equal(report.authority.nc05Authorized, true);
  for (const field of ['plasticDentingProcedureQualified','codeAssessmentQualified','moduleQualified','productionExecutionAuthorized','automaticAssetAcceptanceAuthorized','autonomousCaseDispositionAuthorized','fitnessForServiceQualified','remainingStrengthQualified']) assert.equal(report.authority[field], false);
});

for (const [name, mutate] of nc04NegativeControls) {
  test(`NC-04 fails closed: ${name}`, () => {
    const input = mutate(qualifiedNc04Input());
    let report;
    try { report = evaluatePlasticMaterialQualification(input); } catch { return; }
    assert.equal(report.status, name === 'caller-pass' ? 'NC04_QUALIFIED' : 'NC04_BLOCKED');
  });
}
