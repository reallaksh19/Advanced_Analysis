import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { canonicalJson } from '../src/core/nonlinear-shell-contact/contracts.js';
import { DEFAULT_PLASTIC_MATERIAL } from '../src/core/nonlinear-shell-contact/plastic-material-contract.js';
import { evaluatePlasticMaterialQualification } from '../src/core/nonlinear-shell-contact/plastic-material-qualification-evaluator.js';

const [evidenceDir, bindingPath, custodyPath, summaryPath, exactHeadSha, outDir] = process.argv.slice(2);
if (!outDir) throw new Error('usage: evidenceDir binding custody summary exactHead outDir');
const json = async (path) => JSON.parse(await readFile(path, 'utf8'));
const evidence = [];
for (const name of (await readdir(evidenceDir)).filter((name) => name.startsWith('NC04-MAT-') && name.endsWith('.json')).sort()) evidence.push(await json(resolve(evidenceDir, name)));
const upstreamReceipt = await json(bindingPath);
const solverCustody = await json(custodyPath);
const summary = await json(summaryPath);
if (summary.exactHeadSha !== exactHeadSha || summary.status !== 'EVIDENCE_COMPLETE' || summary.producedEvidenceCount !== 9) throw new Error('real material summary invalid');
const report = evaluatePlasticMaterialQualification({
  contract: DEFAULT_PLASTIC_MATERIAL,
  candidateExactHeadSha: exactHeadSha,
  implementationHash: summary.implementationHash,
  upstreamReceipt,
  solverCustody,
  evidence,
});
await mkdir(outDir, { recursive: true });
await writeFile(resolve(outDir, 'nc04-contract.json'), JSON.stringify(DEFAULT_PLASTIC_MATERIAL, null, 2));
await writeFile(resolve(outDir, 'nc04-report.json'), JSON.stringify(report, null, 2));
await writeFile(resolve(outDir, 'nc04-report.canonical.json'), canonicalJson(report));
await writeFile(resolve(outDir, 'nc04-upstream-binding.json'), JSON.stringify(upstreamReceipt, null, 2));
if (report.status !== 'NC04_QUALIFIED') throw new Error(`NC-04 blocked: ${report.blockers.join('; ')}`);
