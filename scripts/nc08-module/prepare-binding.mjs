import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { semanticHash } from '../../src/core/nonlinear-shell-contact/contracts.js';
const [root, out] = process.argv.slice(2);
if (!out) throw new Error('usage: prepare-binding <nc07-root> <out>');
const report = JSON.parse(await readFile(resolve(root, 'nc07-a/nc07-report.json'), 'utf8'));
const reportB = JSON.parse(await readFile(resolve(root, 'nc07-b/nc07-report.json'), 'utf8'));
const caseRecord = JSON.parse(await readFile(resolve(root, 'nc07-real-a/caseRecord.json'), 'utf8'));
const caseRecordB = JSON.parse(await readFile(resolve(root, 'nc07-real-b/caseRecord.json'), 'utf8'));
if (JSON.stringify(report) !== JSON.stringify(reportB)) throw new Error('NC07 report replay mismatch');
if (JSON.stringify(caseRecord) !== JSON.stringify(caseRecordB)) throw new Error('NC07 case replay mismatch');
if (report.status !== 'NC07_SYNTHETIC_CASE_QUALIFIED' || report.blockers.length || report.authority.syntheticCaseAssessmentQualified !== true || report.authority.nc08Authorized !== true) throw new Error('NC07 synthetic receipt is not qualified');
for (const key of ['codeAssessmentQualified','realAssetAssessmentQualified','moduleQualified','productionExecutionAuthorized']) if (report.authority[key] !== false) throw new Error(`NC07 authority boundary violated: ${key}`);
const payload = {
  schema: 'nonlinear-shell-contact-nc08-upstream-binding/v1',
  nc07ExactHeadSha: report.candidateExactHeadSha,
  nc07ReportHash: report.reportSemanticHash,
  nc07ArtifactDigest: process.env.NC07_ARTIFACT_DIGEST,
  syntheticCaseAssessmentQualified: true,
  nc08Authorized: true,
  qualifiedSyntheticCaseIds: [...report.qualifiedSyntheticCaseIds],
  realAssetQualifiedCaseIds: [...report.realAssetQualifiedCaseIds],
  caseRecordHash: caseRecord.caseRecordHash,
  nc07UpstreamBindingHash: report.upstreamBindingHash,
  nc05ReportHash: process.env.NC05_REPORT_HASH,
  nc06ReportHash: process.env.NC06_REPORT_HASH,
};
await writeFile(out, `${JSON.stringify({ ...payload, semanticHash: semanticHash(payload) }, null, 2)}\n`, 'utf8');
