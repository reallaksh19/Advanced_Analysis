import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { seal } from './evidence.mjs';

const artifactRoot = process.argv[2];
const outPath = process.argv[3];
if (!artifactRoot || !outPath) throw new Error('usage: artifactRoot outPath');
const readJson = async (path) => JSON.parse(await readFile(resolve(artifactRoot, path), 'utf8'));
const reportABytes = await readFile(resolve(artifactRoot, 'nc03-a/nc03-report.canonical.json'));
const reportBBytes = await readFile(resolve(artifactRoot, 'nc03-b/nc03-report.canonical.json'));
const runABytes = await readFile(resolve(artifactRoot, 'nc03-real-a/real-denting-summary.canonical.json'));
const runBBytes = await readFile(resolve(artifactRoot, 'nc03-real-b/real-denting-summary.canonical.json'));
if (!reportABytes.equals(reportBBytes) || !runABytes.equals(runBBytes)) throw new Error('NC-03 replay artifacts differ');
const report = await readJson('nc03-a/nc03-report.json');
const run = await readJson('nc03-real-a/real-denting-summary.json');
const expected = {
  exactHeadSha: process.env.NC03_HEAD_SHA,
  workflowRunId: process.env.NC03_RUN_ID,
  artifactId: process.env.NC03_ARTIFACT_ID,
  artifactDigest: process.env.NC03_ARTIFACT_DIGEST,
  mergeCommitSha: process.env.NC03_MERGE_SHA,
};
for (const [key, value] of Object.entries(expected)) if (!value) throw new Error(`missing ${key}`);
if (report.status !== 'NC03_QUALIFIED'
  || report.candidateExactHeadSha !== expected.exactHeadSha
  || report.authority?.elasticDentingProcedureQualified !== true
  || report.authority?.nc04Authorized !== true
  || run.exactHeadSha !== expected.exactHeadSha
  || run.status !== 'EVIDENCE_COMPLETE') throw new Error('NC-03 receipt is not qualified or exact-head bound');
const binding = seal({
  schema: 'nonlinear-shell-contact-nc03-upstream-binding/v1',
  phase: 'NC-03',
  exactHeadSha: expected.exactHeadSha,
  mergeCommitSha: expected.mergeCommitSha,
  workflowRunId: expected.workflowRunId,
  artifactId: expected.artifactId,
  artifactDigest: expected.artifactDigest,
  reportSemanticHash: report.reportSemanticHash,
  runSemanticHash: run.semanticHash,
  elasticDentingProcedureHash: report.elasticDentingProcedureHash,
  implementationHash: run.implementationHash,
  shellFormulationQualified: report.authority.shellFormulationQualified === true,
  contactProcedureQualified: report.authority.contactProcedureQualified === true,
  elasticDentingProcedureQualified: true,
  nc04Authorized: true,
}, 'semanticHash');
await writeFile(outPath, JSON.stringify(binding, null, 2));
