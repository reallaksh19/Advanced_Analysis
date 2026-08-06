import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { sealWithHash } from '../../src/core/nonlinear-shell-contact/contracts.js';
const [root,out] = process.argv.slice(2);
const a = JSON.parse(await readFile(resolve(root,'nc05-a/nc05-report.json')));
const b = JSON.parse(await readFile(resolve(root,'nc05-b/nc05-report.json')));
const runA = JSON.parse(await readFile(resolve(root,'nc05-real-a/real-plastic-denting-summary.json')));
const runB = JSON.parse(await readFile(resolve(root,'nc05-real-b/real-plastic-denting-summary.json')));
const contract = JSON.parse(await readFile(resolve(root,'nc05-a/nc05-contract.json')));
if (JSON.stringify(a)!==JSON.stringify(b) || JSON.stringify(runA)!==JSON.stringify(runB)) throw new Error('NC05_REPLAY_MISMATCH');
if (a.status!=='NC05_QUALIFIED' || a.authority?.plasticDentingProcedureQualified!==true || a.authority?.nc06Authorized!==true) throw new Error('NC05_AUTHORITY_ABSENT');
const binding = sealWithHash({
  schema:'nonlinear-shell-contact-nc05-upstream-binding/v1',
  qualifiedHeadSha:a.candidateExactHeadSha,
  qualificationReportHash:a.reportSemanticHash,
  plasticDentingProcedureHash:a.plasticDentingProcedureHash,
  implementationHash:a.implementationHash,
  runSemanticHash:runA.semanticHash,
  qualifiedCellIds:['NC05-CELL-DT40-LD2-PER0.04'],
  qualifiedCell:contract.cell,
  shellFormulationQualified:a.authority.shellFormulationQualified,
  contactProcedureQualified:a.authority.contactProcedureQualified,
  elasticDentingProcedureQualified:a.authority.elasticDentingProcedureQualified,
  plasticMaterialQualified:a.authority.plasticMaterialQualified,
  plasticDentingProcedureQualified:a.authority.plasticDentingProcedureQualified,
  nc06Authorized:a.authority.nc06Authorized,
},'semanticHash');
await writeFile(out,JSON.stringify(binding,null,2));
