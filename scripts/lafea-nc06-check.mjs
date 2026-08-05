import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { semanticHash } from '../src/core/nonlinear-shell-contact/contracts.js';
import {
  DEFAULT_CODE_ASSESSMENT_PACKAGE,
  REQUIRED_CODE_ASSESSMENT_DOMAINS,
  validateCodeAssessmentPackageContract,
} from '../src/core/nonlinear-shell-contact/code-assessment-package-contract.js';
import {
  evaluateCodeAssessmentPackageQualification,
} from '../src/core/nonlinear-shell-contact/code-assessment-qualification-evaluator.js';
import { NC06_CONTRACT_FIXTURES } from '../src/core/nonlinear-shell-contact/nc06-fixtures.js';
import { runNc06NegativeControls } from '../src/core/nonlinear-shell-contact/nc06-negative-controls.js';

const arg = process.argv.find((entry) => entry.startsWith('--output-dir='));
const outputDir = resolve(arg?.slice('--output-dir='.length) || 'artifacts/lafea-nc06');
await mkdir(outputDir, { recursive: true });
for (const fixture of NC06_CONTRACT_FIXTURES) validateCodeAssessmentPackageContract(fixture.contract);
const negatives = runNc06NegativeControls();
assert.ok(negatives.length >= 36);
assert.ok(negatives.every((entry) => entry.passed));
const qualification = evaluateCodeAssessmentPackageQualification({ contract: DEFAULT_CODE_ASSESSMENT_PACKAGE });
assert.equal(qualification.status, 'NC06_BLOCKED');
assert.equal(qualification.authority.nc06ContractQualified, true);
assert.equal(qualification.authority.codeAssessmentPackageQualified, false);
assert.equal(qualification.authority.codeAssessmentQualified, false);
assert.equal(qualification.authority.productionExecutionAuthorized, false);
const report = {
  schema: 'nonlinear-shell-contact-nc06-contract-run/v1',
  status: qualification.status,
  codeAssessmentPackageHash: DEFAULT_CODE_ASSESSMENT_PACKAGE.codeAssessmentPackageHash,
  domainCount: REQUIRED_CODE_ASSESSMENT_DOMAINS.length,
  fixtureCount: NC06_CONTRACT_FIXTURES.length,
  negativeControlCount: negatives.length,
  qualification,
};
const sealed = { ...report, runSemanticHash: semanticHash(report) };
await writeFile(resolve(outputDir, 'nc06-report.json'), `${JSON.stringify(sealed, null, 2)}\n`, 'utf8');
await writeFile(resolve(outputDir, 'nc06-contract.json'), `${JSON.stringify(DEFAULT_CODE_ASSESSMENT_PACKAGE, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(sealed));
