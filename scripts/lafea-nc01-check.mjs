import assert from 'node:assert/strict';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { canonicalJson, semanticHash } from '../src/core/nonlinear-shell-contact/contracts.js';
import { DEFAULT_SHELL_FORMULATION } from '../src/core/nonlinear-shell-contact/shell-formulation-contract.js';
import { SHELL_BENCHMARK_CATALOG, SHELL_BENCHMARK_CATALOG_HASH } from '../src/core/nonlinear-shell-contact/shell-benchmark-catalog.js';
import { runNc01NegativeControls } from '../src/core/nonlinear-shell-contact/nc01-negative-controls.js';
import { evaluateShellQualification, validateSolverBridgeBinding } from '../src/core/nonlinear-shell-contact/shell-qualification-evaluator.js';

const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const match = /^--([^=]+)=(.*)$/u.exec(arg);
  if (!match) throw new TypeError(`Invalid argument ${arg}.`);
  return [match[1], match[2]];
}));
const outputDir = resolve(args['output-dir'] ?? 'artifacts/lafea-nc01');
const headSha = args['head-sha'];
if (!/^[0-9a-f]{40}$/u.test(headSha ?? '')) throw new TypeError('--head-sha must be an exact Git SHA.');
if (!args['upstream-binding']) throw new TypeError('--upstream-binding is required.');
await mkdir(outputDir, { recursive: true });
const upstreamReceipt = JSON.parse(await readFile(resolve(args['upstream-binding']), 'utf8'));
validateSolverBridgeBinding(upstreamReceipt);
let benchmarkEvidence = [];
if (args['evidence-root']) {
  const root = resolve(args['evidence-root']);
  const names = (await readdir(root)).filter((name) => name.endsWith('.json')).sort();
  benchmarkEvidence = await Promise.all(names.map(async (name) => JSON.parse(await readFile(resolve(root, name), 'utf8'))));
}
const negatives = runNc01NegativeControls();
assert.ok(negatives.length >= 16 && negatives.every((entry) => entry.passed));
const qualification = evaluateShellQualification({
  contract: DEFAULT_SHELL_FORMULATION,
  upstreamReceipt,
  candidateExactHeadSha: headSha,
  benchmarkEvidence,
});
const report = {
  schema: 'lafea-nc01-exact-head-run/v2',
  exactHeadSha: headSha,
  status: qualification.status,
  shellFormulationHash: DEFAULT_SHELL_FORMULATION.shellFormulationHash,
  benchmarkCatalogHash: SHELL_BENCHMARK_CATALOG_HASH,
  benchmarkCount: SHELL_BENCHMARK_CATALOG.length,
  suppliedBenchmarkEvidenceCount: benchmarkEvidence.length,
  negativeControls: negatives,
  upstreamReceiptSemanticHash: upstreamReceipt.semanticHash,
  qualification,
};
const sealed = { ...report, runSemanticHash: semanticHash(report) };
await writeFile(resolve(outputDir, 'nc01-report.json'), `${JSON.stringify(sealed, null, 2)}\n`, 'utf8');
await writeFile(resolve(outputDir, 'nc01-report.canonical.json'), `${canonicalJson(sealed)}\n`, 'utf8');
await writeFile(resolve(outputDir, 'nc01-contract.json'), `${JSON.stringify(DEFAULT_SHELL_FORMULATION, null, 2)}\n`, 'utf8');
await writeFile(resolve(outputDir, 'nc01-upstream-binding.json'), `${JSON.stringify(upstreamReceipt, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify(sealed)}\n`);
if (qualification.status !== 'NC01_QUALIFIED') process.exitCode = 2;
