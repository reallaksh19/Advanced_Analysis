import assert from 'node:assert/strict';
import { clonePlain } from './contracts.js';
import { createContactProcedureContract, validateContactProcedureContract } from './contact-procedure-contract.js';
import { evaluateContactQualification } from './contact-qualification-evaluator.js';
import { PASSING_SHELL_RECEIPT, PASSING_SOLVER_CUSTODY, createPassingContactEvidence } from './nc02-fixtures.js';

export function runNc02NegativeControls() {
  const results = [];
  const rejects = (id, mutate) => {
    const record = clonePlain(createContactProcedureContract());
    mutate(record);
    delete record.contactProcedureHash;
    assert.throws(() => validateContactProcedureContract(record));
    results.push({ id, passed: true });
  };
  rejects('REJECT_NODE_TO_SURFACE_SUBSTITUTION', (r) => { r.formulation = 'NODE_TO_SURFACE'; });
  rejects('REJECT_NEGATIVE_OPEN_GAP', (r) => { r.normalConvention.positiveGapMeaning = 'PENETRATION'; });
  rejects('REJECT_TENSION_POSITIVE_PRESSURE', (r) => { r.normalConvention.positivePressureMeaning = 'TENSION'; });
  rejects('REJECT_REFERENCE_SURFACE_CONTACT', (r) => { r.physicalContactSurface = 'MIDSURFACE_ONLY'; });
  rejects('REJECT_ARBITRARY_PENALTY', (r) => { r.penaltyBasis = 'ARBITRARY_CONSTANT'; });
  rejects('REJECT_NO_NOMINAL_PENALTY', (r) => { r.penaltySensitivityScales = [0.25, 0.5, 2]; });
  rejects('REJECT_LARGE_PENETRATION_LIMIT', (r) => { r.penetrationLimitRatio = 0.2; });
  rejects('REJECT_NO_REVERSAL', (r) => { r.masterSlaveReversalRequired = false; });
  rejects('REJECT_SELF_CONTACT', (r) => { r.selfContactAuthorized = true; });
  rejects('REJECT_FRICTION', (r) => { r.frictionAuthorized = true; });
  rejects('REJECT_GROSS_SLIDING', (r) => { r.grossSlidingAuthorized = true; });
  rejects('REJECT_MAX_PRESSURE_AUTHORITY', (r) => { r.rawMaximumPressureAuthority = 'ENGINEERING'; });
  const noShell = evaluateContactQualification({ contract: createContactProcedureContract(), solverCustody: PASSING_SOLVER_CUSTODY, benchmarkEvidence: createPassingContactEvidence() });
  assert.equal(noShell.authority.contactProcedureQualified, false);
  results.push({ id: 'BLOCK_UNQUALIFIED_SHELL', passed: true });
  const noCustody = evaluateContactQualification({ contract: createContactProcedureContract(), shellQualificationReceipt: PASSING_SHELL_RECEIPT, benchmarkEvidence: createPassingContactEvidence() });
  assert.equal(noCustody.authority.contactProcedureQualified, false);
  results.push({ id: 'BLOCK_MISSING_SOLVER_CUSTODY', passed: true });
  const missing = evaluateContactQualification({ contract: createContactProcedureContract(), shellQualificationReceipt: PASSING_SHELL_RECEIPT, solverCustody: PASSING_SOLVER_CUSTODY, benchmarkEvidence: createPassingContactEvidence().slice(1) });
  assert.equal(missing.authority.contactProcedureQualified, false);
  results.push({ id: 'BLOCK_MISSING_BENCHMARK', passed: true });
  const penetration = createPassingContactEvidence();
  penetration[1].penetrationRatio = 0.5;
  const penetrationReport = evaluateContactQualification({ contract: createContactProcedureContract(), shellQualificationReceipt: PASSING_SHELL_RECEIPT, solverCustody: PASSING_SOLVER_CUSTODY, benchmarkEvidence: penetration });
  assert.equal(penetrationReport.authority.contactProcedureQualified, false);
  results.push({ id: 'BLOCK_PENETRATION_EXCESS', passed: true });
  const reversal = createPassingContactEvidence();
  reversal.find((e) => e.id === 'MASTER_SLAVE_REVERSAL').reversalDifference = 0.5;
  const reversalReport = evaluateContactQualification({ contract: createContactProcedureContract(), shellQualificationReceipt: PASSING_SHELL_RECEIPT, solverCustody: PASSING_SOLVER_CUSTODY, benchmarkEvidence: reversal });
  assert.equal(reversalReport.authority.contactProcedureQualified, false);
  results.push({ id: 'BLOCK_REVERSAL_SENSITIVITY', passed: true });
  return results;
}
