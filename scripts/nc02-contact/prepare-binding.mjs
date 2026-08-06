import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createNc01QualificationBinding } from '../../src/core/nonlinear-shell-contact/contact-qualification-evaluator.js';
import { sha256Bytes } from '../../src/core/nonlinear-shell-contact/contracts.js';

const [root, output] = process.argv.slice(2);
if (!root || !output) throw new TypeError('Usage: prepare-binding.mjs NC01_ARTIFACT_ROOT OUTPUT');
const aPath = resolve(root, 'nc01-a/nc01-report.json');
const bPath = resolve(root, 'nc01-b/nc01-report.json');
const aBytes = await readFile(aPath);
const bBytes = await readFile(bPath);
const a = JSON.parse(aBytes);
const b = JSON.parse(bBytes);
if (JSON.stringify(a) !== JSON.stringify(b)
  || a.status !== 'NC01_QUALIFIED'
  || a.exactHeadSha !== process.env.NC01_HEAD_SHA
  || a.qualification?.reportSemanticHash !== process.env.NC01_REPORT_HASH
  || a.runSemanticHash !== process.env.NC01_RUN_HASH
  || a.qualification?.authority?.shellFormulationQualified !== true
  || a.qualification?.authority?.nc02Authorized !== true) throw new Error('Retained NC-01 receipt is invalid.');
const binding = createNc01QualificationBinding({
  exactHeadSha: process.env.NC01_HEAD_SHA,
  mergeCommitSha: process.env.NC01_MERGE_SHA,
  workflowRunId: process.env.NC01_RUN_ID,
  artifactId: process.env.NC01_ARTIFACT_ID,
  artifactDigest: process.env.NC01_ARTIFACT_DIGEST,
  reportSemanticHash: process.env.NC01_REPORT_HASH,
  runSemanticHash: process.env.NC01_RUN_HASH,
  rawArtifactHash: sha256Bytes(Buffer.concat([aBytes,bBytes])),
  validatorIdentity: 'LAFEA_NC01_EXACT_HEAD_SHELL_QUALIFICATION_V2',
  validatorRevision: process.env.NC01_HEAD_SHA,
  shellFormulationQualified: true,
  nc02Authorized: true,
});
await writeFile(output, `${JSON.stringify(binding, null, 2)}\n`, 'utf8');
