import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { semanticHash } from '../src/core/nonlinear-shell-contact/contracts.js';
import {
  DEFAULT_PRODUCTION_RUN_RECEIPT_CONTRACT, REQUIRED_PRODUCTION_RUN_DOMAINS,
  validateProductionRunReceiptContract,
} from '../src/core/nonlinear-shell-contact/production-run-receipt-contract.js';
import { evaluateProductionRunReceiptQualification } from '../src/core/nonlinear-shell-contact/production-run-receipt-evaluator.js';
import { NC10_CONTRACT_FIXTURES } from '../src/core/nonlinear-shell-contact/nc10-fixtures.js';
import { runNc10NegativeControls } from '../src/core/nonlinear-shell-contact/nc10-negative-controls.js';
const arg = process.argv.find((entry) => entry.startsWith('--output-dir='));
const outputDir = resolve(arg?.slice('--output-dir='.length) || 'artifacts/lafea-nc10');
await mkdir(outputDir, { recursive: true });
for (const fixture of NC10_CONTRACT_FIXTURES) validateProductionRunReceiptContract(fixture.contract);
const negatives = runNc10NegativeControls();
assert.equal(negatives.length, 44);
assert.ok(negatives.every((entry) => entry.passed));
const qualification = evaluateProductionRunReceiptQualification({ contract: DEFAULT_PRODUCTION_RUN_RECEIPT_CONTRACT });
assert.equal(qualification.status, 'NC10_BLOCKED');
assert.equal(qualification.authority.nc10ContractQualified, true);
assert.equal(qualification.authority.governedRunReceiptQualified, false);
const report = {
  schema: 'nonlinear-shell-contact-nc10-contract-run/v1',
  status: qualification.status,
  productionRunReceiptContractHash: DEFAULT_PRODUCTION_RUN_RECEIPT_CONTRACT.productionRunReceiptContractHash,
  evidenceDomainCount: REQUIRED_PRODUCTION_RUN_DOMAINS.length,
  fixtureCount: NC10_CONTRACT_FIXTURES.length,
  negativeControlCount: negatives.length,
  qualification,
};
const sealed = { ...report, runSemanticHash: semanticHash(report) };
await writeFile(resolve(outputDir, 'nc10-report.json'), `${JSON.stringify(sealed, null, 2)}\n`, 'utf8');
await writeFile(resolve(outputDir, 'nc10-contract.json'), `${JSON.stringify(DEFAULT_PRODUCTION_RUN_RECEIPT_CONTRACT, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(sealed));
