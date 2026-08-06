import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { sha256Bytes } from '../src/core/nonlinear-shell-contact/contracts.js';
import { DEFAULT_REAL_MODULE_QUALIFICATION_CONTRACT } from '../src/core/nonlinear-shell-contact/real-module-qualification-contract.js';
import { evaluateRealModuleQualification } from '../src/core/nonlinear-shell-contact/real-module-qualification-evaluator.js';

const root = resolve(import.meta.dirname, '..');
const testPath = resolve(root, 'tests/nonlinear-shell-contact-nc08r-real-module-qualification.test.mjs');
execFileSync(process.execPath, ['--test', testPath], { cwd: root, stdio: 'inherit' });

const governedSources = [
  'src/core/nonlinear-shell-contact/real-module-qualification-contract.js',
  'src/core/nonlinear-shell-contact/real-module-qualification-evaluator.js',
  'src/core/nonlinear-shell-contact/nc08r-fixtures.js',
  'src/core/nonlinear-shell-contact/nc08r-negative-controls.js',
].map((path) => readFileSync(resolve(root, path)));
const implementationHash = sha256Bytes(Buffer.concat(governedSources));
const candidateExactHeadSha = process.env.CANDIDATE_HEAD_SHA ?? '0'.repeat(40);
const candidateSourceTreeSha = process.env.CANDIDATE_SOURCE_TREE_SHA ?? '0'.repeat(40);

const report = evaluateRealModuleQualification({
  contract: DEFAULT_REAL_MODULE_QUALIFICATION_CONTRACT,
  candidateExactHeadSha,
  candidateSourceTreeSha,
  implementationHash,
  upstreamBinding: null,
  releaseRecord: null,
  domainEvidence: [],
});

if (report.status !== 'NC08R_BLOCKED') throw new Error('Contract-only check must remain blocked.');
for (const key of [
  'moduleQualified',
  'nc09ProductionAuthorizationAuthorized',
  'productionExecutionAuthorized',
  'nc10Authorized',
]) {
  if (report.authority[key] !== false) throw new Error(`Contract-only check escalated ${key}.`);
}

const artifactDirectory = resolve(root, 'artifacts/nc08r');
mkdirSync(artifactDirectory, { recursive: true });
writeFileSync(resolve(artifactDirectory, 'nc08r-contract-report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(report.status);
console.log(`candidateExactHeadSha=${report.candidateExactHeadSha}`);
console.log(`candidateSourceTreeSha=${report.candidateSourceTreeSha}`);
console.log(`moduleQualified=${report.authority.moduleQualified}`);
console.log(`productionExecutionAuthorized=${report.authority.productionExecutionAuthorized}`);
