import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { semanticHash } from '../src/core/nonlinear-shell-contact/contracts.js';
import { DEFAULT_CONTACT_PROCEDURE, REQUIRED_CONTACT_BENCHMARKS, validateContactProcedureContract } from '../src/core/nonlinear-shell-contact/contact-procedure-contract.js';
import { evaluateContactQualification } from '../src/core/nonlinear-shell-contact/contact-qualification-evaluator.js';
import { NC02_CONTRACT_FIXTURES } from '../src/core/nonlinear-shell-contact/nc02-fixtures.js';
import { runNc02NegativeControls } from '../src/core/nonlinear-shell-contact/nc02-negative-controls.js';

const arg = process.argv.find((entry) => entry.startsWith('--output-dir='));
const outputDir = resolve(arg?.slice('--output-dir='.length) || 'artifacts/lafea-nc02');
await mkdir(outputDir, { recursive: true });
for (const fixture of NC02_CONTRACT_FIXTURES) validateContactProcedureContract(fixture.contract);
const negatives = runNc02NegativeControls();
assert.ok(negatives.length >= 17);
assert.ok(negatives.every((entry) => entry.passed));
const qualification = evaluateContactQualification({ contract: DEFAULT_CONTACT_PROCEDURE });
assert.equal(qualification.status, 'NC02_BLOCKED');
assert.equal(qualification.authority.nc02ContractQualified, true);
assert.equal(qualification.authority.contactProcedureQualified, false);
assert.equal(qualification.authority.elasticDentingProcedureQualified, false);
const report = {
  schema: 'nonlinear-shell-contact-nc02-contract-run/v1',
  status: qualification.status,
  contactProcedureHash: DEFAULT_CONTACT_PROCEDURE.contactProcedureHash,
  benchmarkCount: REQUIRED_CONTACT_BENCHMARKS.length,
  fixtureCount: NC02_CONTRACT_FIXTURES.length,
  negativeControlCount: negatives.length,
  qualification,
};
const sealed = { ...report, runSemanticHash: semanticHash(report) };
await writeFile(resolve(outputDir, 'nc02-report.json'), `${JSON.stringify(sealed, null, 2)}\n`, 'utf8');
await writeFile(resolve(outputDir, 'nc02-contract.json'), `${JSON.stringify(DEFAULT_CONTACT_PROCEDURE, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(sealed));
