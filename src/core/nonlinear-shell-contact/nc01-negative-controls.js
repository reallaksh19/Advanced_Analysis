import assert from 'node:assert/strict';
import { clonePlain } from './contracts.js';
import { createShellFormulationContract, validateShellFormulationContract } from './shell-formulation-contract.js';
import { evaluateShellQualification } from './shell-qualification-evaluator.js';
import { PASSING_SOLVER_CUSTODY, createPassingShellEvidence } from './nc01-fixtures.js';

export function runNc01NegativeControls() {
  const results = [];
  const rejects = (id, mutate) => {
    const record = clonePlain(createShellFormulationContract());
    mutate(record);
    delete record.shellFormulationHash;
    assert.throws(() => validateShellFormulationContract(record));
    results.push({ id, passed: true });
  };
  rejects('REJECT_KIRCHHOFF_SUBSTITUTION', (r) => { r.theory = 'KIRCHHOFF_LOVE'; });
  rejects('REJECT_SIX_PHYSICAL_DOF', (r) => { r.physicalDofsPerNode = 6; });
  rejects('REJECT_DRILLING_AUTHORITY', (r) => { r.drillingDof.engineeringOutputAuthorized = true; });
  rejects('REJECT_NONOBJECTIVE_DIRECTOR', (r) => { r.directorUpdate = 'ADDITIVE_EULER'; });
  rejects('REJECT_NONMIDSURFACE', (r) => { r.referenceSurface = 'TOP'; });
  rejects('REJECT_MISSING_OFFSET_SUPPORT', (r) => { r.shellOffsetsSupported = false; });
  rejects('REJECT_NO_TOP_BOTTOM_RECOVERY', (r) => { r.topBottomRecoveryRequired = false; });
  rejects('REJECT_DEAD_PRESSURE', (r) => { r.pressureRole = 'DEAD_REFERENCE_SURFACE'; });
  rejects('REJECT_EXCESS_HOURGLASS_LIMIT', (r) => { r.integrationControls.hourglassEnergyRatioLimit = 0.5; });
  rejects('REJECT_MISSING_BENCHMARK', (r) => { r.requiredBenchmarks.pop(); });
  const missingCustody = evaluateShellQualification({ contract: createShellFormulationContract(), benchmarkEvidence: createPassingShellEvidence() });
  assert.equal(missingCustody.authority.shellFormulationQualified, false);
  results.push({ id: 'BLOCK_MISSING_SOLVER_CUSTODY', passed: true });
  const missingBenchmark = evaluateShellQualification({ contract: createShellFormulationContract(), solverCustody: PASSING_SOLVER_CUSTODY, benchmarkEvidence: createPassingShellEvidence().slice(1) });
  assert.equal(missingBenchmark.authority.shellFormulationQualified, false);
  results.push({ id: 'BLOCK_MISSING_BENCHMARK', passed: true });
  const looseEvidence = createPassingShellEvidence();
  looseEvidence[0].observedError = 0.5;
  const failedEvidence = evaluateShellQualification({ contract: createShellFormulationContract(), solverCustody: PASSING_SOLVER_CUSTODY, benchmarkEvidence: looseEvidence });
  assert.equal(failedEvidence.authority.shellFormulationQualified, false);
  results.push({ id: 'BLOCK_ERROR_OVER_TOLERANCE', passed: true });
  const duplicate = createPassingShellEvidence();
  duplicate.push(clonePlain(duplicate[0]));
  const duplicateReport = evaluateShellQualification({ contract: createShellFormulationContract(), solverCustody: PASSING_SOLVER_CUSTODY, benchmarkEvidence: duplicate });
  assert.equal(duplicateReport.authority.shellFormulationQualified, false);
  results.push({ id: 'BLOCK_DUPLICATE_BENCHMARK', passed: true });
  return results;
}
