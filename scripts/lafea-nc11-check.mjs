import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { semanticHash } from '../src/core/nonlinear-shell-contact/contracts.js';
import {
  DEFAULT_OPERATIONAL_SURVEILLANCE_CONTRACT, REQUIRED_OPERATIONAL_SURVEILLANCE_DOMAINS,
  validateOperationalSurveillanceContract,
} from '../src/core/nonlinear-shell-contact/operational-surveillance-contract.js';
import { evaluateOperationalSurveillanceQualification } from '../src/core/nonlinear-shell-contact/operational-surveillance-evaluator.js';
import { NC11_CONTRACT_FIXTURES } from '../src/core/nonlinear-shell-contact/nc11-fixtures.js';
import { runNc11NegativeControls } from '../src/core/nonlinear-shell-contact/nc11-negative-controls.js';
const arg = process.argv.find((entry) => entry.startsWith('--output-dir='));
const outputDir = resolve(arg?.slice('--output-dir='.length) || 'artifacts/lafea-nc11');
await mkdir(outputDir, { recursive: true });
for (const fixture of NC11_CONTRACT_FIXTURES) validateOperationalSurveillanceContract(fixture.contract);
const negatives = runNc11NegativeControls();
assert.equal(negatives.length, 48);
assert.ok(negatives.every((entry) => entry.passed));
const qualification = evaluateOperationalSurveillanceQualification({ contract: DEFAULT_OPERATIONAL_SURVEILLANCE_CONTRACT });
assert.equal(qualification.status, 'NC11_BLOCKED');
assert.equal(qualification.authority.nc11ContractQualified, true);
assert.equal(qualification.authority.operationalSurveillanceQualified, false);
const report = {
  schema: 'nonlinear-shell-contact-nc11-contract-run/v1',
  status: qualification.status,
  operationalSurveillanceContractHash: DEFAULT_OPERATIONAL_SURVEILLANCE_CONTRACT.operationalSurveillanceContractHash,
  evidenceDomainCount: REQUIRED_OPERATIONAL_SURVEILLANCE_DOMAINS.length,
  fixtureCount: NC11_CONTRACT_FIXTURES.length,
  negativeControlCount: negatives.length,
  qualification,
};
const sealed = { ...report, runSemanticHash: semanticHash(report) };
await writeFile(resolve(outputDir, 'nc11-report.json'), `${JSON.stringify(sealed, null, 2)}\n`, 'utf8');
await writeFile(resolve(outputDir, 'nc11-contract.json'), `${JSON.stringify(DEFAULT_OPERATIONAL_SURVEILLANCE_CONTRACT, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(sealed));
