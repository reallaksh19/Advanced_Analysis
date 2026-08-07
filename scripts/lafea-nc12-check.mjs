import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { semanticHash } from '../src/core/nonlinear-shell-contact/contracts.js';
import {
  DEFAULT_RETIREMENT_PRESERVATION_CONTRACT, REQUIRED_RETIREMENT_PRESERVATION_DOMAINS,
  validateRetirementPreservationContract,
} from '../src/core/nonlinear-shell-contact/retirement-preservation-contract.js';
import { evaluateRetirementPreservationQualification } from '../src/core/nonlinear-shell-contact/retirement-preservation-evaluator.js';
import { NC12_CONTRACT_FIXTURES } from '../src/core/nonlinear-shell-contact/nc12-fixtures.js';
import { runNc12NegativeControls } from '../src/core/nonlinear-shell-contact/nc12-negative-controls.js';
const arg = process.argv.find((entry) => entry.startsWith('--output-dir='));
const outputDir = resolve(arg?.slice('--output-dir='.length) || 'artifacts/lafea-nc12');
await mkdir(outputDir, { recursive: true });
for (const fixture of NC12_CONTRACT_FIXTURES) validateRetirementPreservationContract(fixture.contract);
const negatives = runNc12NegativeControls();
assert.equal(negatives.length, 52);
assert.ok(negatives.every((entry) => entry.passed));
const qualification = evaluateRetirementPreservationQualification({ contract: DEFAULT_RETIREMENT_PRESERVATION_CONTRACT });
assert.equal(qualification.status, 'NC12_BLOCKED');
assert.equal(qualification.authority.nc12ContractQualified, true);
assert.equal(qualification.authority.retirementPreservationQualified, false);
assert.equal(qualification.authority.productionExecutionAuthorized, false);
const report = {
  schema: 'nonlinear-shell-contact-nc12-contract-run/v1',
  status: qualification.status,
  retirementPreservationContractHash: DEFAULT_RETIREMENT_PRESERVATION_CONTRACT.retirementPreservationContractHash,
  evidenceDomainCount: REQUIRED_RETIREMENT_PRESERVATION_DOMAINS.length,
  fixtureCount: NC12_CONTRACT_FIXTURES.length,
  negativeControlCount: negatives.length,
  qualification,
};
const sealed = { ...report, runSemanticHash: semanticHash(report) };
await writeFile(resolve(outputDir, 'nc12-report.json'), `${JSON.stringify(sealed, null, 2)}\n`, 'utf8');
await writeFile(resolve(outputDir, 'nc12-contract.json'), `${JSON.stringify(DEFAULT_RETIREMENT_PRESERVATION_CONTRACT, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(sealed));
