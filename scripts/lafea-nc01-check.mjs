import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { semanticHash } from '../src/core/nonlinear-shell-contact/contracts.js';
import { DEFAULT_SHELL_FORMULATION, validateShellFormulationContract } from '../src/core/nonlinear-shell-contact/shell-formulation-contract.js';
import { SHELL_BENCHMARK_CATALOG, SHELL_BENCHMARK_CATALOG_HASH } from '../src/core/nonlinear-shell-contact/shell-benchmark-catalog.js';
import { evaluateShellQualification } from '../src/core/nonlinear-shell-contact/shell-qualification-evaluator.js';
import { NC01_CONTRACT_FIXTURES } from '../src/core/nonlinear-shell-contact/nc01-fixtures.js';
import { runNc01NegativeControls } from '../src/core/nonlinear-shell-contact/nc01-negative-controls.js';

const arg = process.argv.find((entry) => entry.startsWith('--output-dir='));
const outputDir = resolve(arg?.slice('--output-dir='.length) || 'artifacts/lafea-nc01');
await mkdir(outputDir, { recursive: true });
for (const fixture of NC01_CONTRACT_FIXTURES) validateShellFormulationContract(fixture.contract);
const negatives = runNc01NegativeControls();
assert.ok(negatives.length >= 14);
assert.ok(negatives.every((entry) => entry.passed));
const qualification = evaluateShellQualification({ contract: DEFAULT_SHELL_FORMULATION });
assert.equal(qualification.status, 'NC01_BLOCKED');
assert.equal(qualification.authority.nc01ContractQualified, true);
assert.equal(qualification.authority.shellFormulationQualified, false);
assert.equal(qualification.authority.nc02Authorized, false);
const report = {
  schema: 'nonlinear-shell-contact-nc01-contract-run/v1',
  status: qualification.status,
  shellFormulationHash: DEFAULT_SHELL_FORMULATION.shellFormulationHash,
  benchmarkCatalogHash: SHELL_BENCHMARK_CATALOG_HASH,
  benchmarkCount: SHELL_BENCHMARK_CATALOG.length,
  fixtureCount: NC01_CONTRACT_FIXTURES.length,
  negativeControlCount: negatives.length,
  qualification,
};
const sealed = { ...report, runSemanticHash: semanticHash(report) };
await writeFile(resolve(outputDir, 'nc01-report.json'), `${JSON.stringify(sealed, null, 2)}\n`, 'utf8');
await writeFile(resolve(outputDir, 'nc01-contract.json'), `${JSON.stringify(DEFAULT_SHELL_FORMULATION, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(sealed));
