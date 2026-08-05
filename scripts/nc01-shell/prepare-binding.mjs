import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createSolverBridgeBinding } from '../../src/core/nonlinear-shell-contact/shell-qualification-evaluator.js';

const [root, output] = process.argv.slice(2);
if (!root || !output) throw new TypeError('Usage: prepare-binding.mjs BRIDGE_ROOT OUTPUT');
const summary = JSON.parse(await readFile(resolve(root, 'solver-bridge-summary.json'), 'utf8'));
const authority = JSON.parse(await readFile(resolve(root, 'solver-bridge-authority.json'), 'utf8'));
if (summary.status !== 'SOLVER_BRIDGE_QUALIFIED'
  || summary.exactHeadSha !== process.env.BRIDGE_HEAD_SHA
  || summary.authority.solverCustodyQualified !== true
  || summary.authority.solverBridgeQualified !== true
  || summary.authority.nc01Authorized !== true
  || authority.semanticHash !== summary.authorityRecordHash) {
  throw new Error('Retained NC-00 bridge receipt is invalid.');
}
const bridgeMergeSha = process.env.BRIDGE_MERGE_SHA ?? '18e259f8a18e9011482d3ca4d1b8bd51dbe986f4';
if (!/^[0-9a-f]{40}$/u.test(bridgeMergeSha)) throw new TypeError('Invalid NC-00 bridge merge SHA.');
const binding = createSolverBridgeBinding({
  exactHeadSha: summary.exactHeadSha,
  mergeCommitSha: bridgeMergeSha,
  workflowRunId: process.env.BRIDGE_RUN_ID,
  artifactId: process.env.BRIDGE_ARTIFACT_ID,
  artifactDigest: process.env.BRIDGE_ARTIFACT_DIGEST,
  summaryHash: summary.nc00ReportHash,
  authorityRecordHash: summary.authorityRecordHash,
  deterministicExecutionHash: summary.deterministicExecutionHash,
  validatorIdentity: 'LAFEA_NC_SOLVER_BRIDGE_EVIDENCE_V1',
  validatorRevision: summary.exactHeadSha,
  solverCustodyQualified: true,
  solverBridgeQualified: true,
  nc01Authorized: true,
});
await writeFile(output, `${JSON.stringify(binding, null, 2)}\n`, 'utf8');
