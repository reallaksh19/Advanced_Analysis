#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE_SHA = 'eaac7e0532c114ef306d2d928f1d9f74348193cd';
const REPORT_PATH = path.resolve(
  ROOT,
  process.env.LAFEA_BUCKET_01_EXACT_HEAD_REPORT_PATH
    ?? 'reports/qualification/lafea-bucket-01-exact-head.json',
);
const exactHead = git(['rev-parse', 'HEAD']);
const expectedHead = process.env.EXPECTED_HEAD_SHA?.trim()
  || process.env.GITHUB_SHA?.trim()
  || exactHead;
const checks = [];
recordAssertion(
  'EXACT_HEAD',
  exactHead === expectedHead,
  `Expected ${expectedHead}; checked out ${exactHead}.`,
);
recordAssertion(
  'BASELINE_IN_ANCESTRY',
  isAncestor(BASELINE_SHA, exactHead),
  `Baseline ${BASELINE_SHA} is not in current ancestry.`,
);
for (const check of [
  nodeCheck('BUCKET_01_REPAIR', 'scripts/lafea-bucket-01-repair-check.mjs'),
  nodeCheck('REGISTERED_REPLAY_ARTIFACT_CUSTODY', 'scripts/lafea-bucket-01-replay-artifact-registry-contract-check.mjs'),
  nodeCheck('CONTROLLED_REPLAY_ENTRYPOINT_ANTI_DRIFT', 'scripts/lafea-bucket-01-controlled-replay-entrypoint-check.mjs'),
  nodeCheck('INDEPENDENT_CANDIDATE_RECOMPUTATION_CONTRACT', 'scripts/lafea-bucket-01-independent-candidate-verification-contract-check.mjs'),
  nodeCheck('INDEPENDENT_CHECKER_RECEIPT_CONTRACT', 'scripts/lafea-bucket-01-independent-checker-receipt-contract-check.mjs'),
  nodeCheck('CANDIDATE_REPLAY_ADJUDICATION_CONTRACT', 'scripts/lafea-bucket-01-candidate-replay-adjudication-check.mjs'),
  npmCheck('STRICT_SYNTAX', 'syntax:strict'),
  npmCheck('IMPORT_BOUNDARIES', 'check:imports'),
  npmCheck('PRODUCTION_BUILD', 'build'),
]) runCheck(check);
runCheck({
  id: 'PATCH_HYGIENE',
  command: 'git',
  args: ['diff', '--check', `${BASELINE_SHA}...${exactHead}`],
});
const trackedStatus = git([
  'status', '--porcelain=v1', '--untracked-files=no',
]);
recordAssertion(
  'TRACKED_WORKTREE_CLEAN',
  trackedStatus === '',
  trackedStatus || 'Tracked worktree is clean.',
);
const failures = checks.filter((check) => check.status !== 'PASS');
const executableEvidencePass = failures.length === 0;
const report = {
  schema: 'lafea-bucket-01-exact-head-report/v18',
  status: executableEvidencePass
    ? 'EXACT_HEAD_REPAIR_EVIDENCE_PASS'
    : 'EXACT_HEAD_REPAIR_EVIDENCE_BLOCKED',
  exactHead,
  expectedHead,
  baselineSha: BASELINE_SHA,
  bucketId: 'LAFEA-BENCH-B01-CONTINUUM-LUG-PINHOLE',
  target: 'C2D-LUG-PINHOLE -> LAFEA.3',
  manifestGitBlobSha: git([
    'hash-object', 'validation/bucket-01/01-benchmark-manifest.json',
  ]),
  gapMatrixGitBlobSha: git([
    'hash-object', 'validation/bucket-01/02-requirement-to-code-gap-matrix.json',
  ]),
  checks,
  blockingCheckIds: failures.map((check) => check.id),
  unresolvedQualificationGates: [
    'REFERENCE_CONTROLLED_REPLAY_NOT_RETAINED_AT_FINAL_EXACT_HEAD',
    'CANDIDATE_CONTROLLED_REPLAY_NOT_RETAINED_AT_FINAL_EXACT_HEAD',
    'TRIPLICATE_REFERENCE_AND_CANDIDATE_REPLAY_NOT_SUPPLIED',
    'APPROVED_CODE_BASIS_AUTHORITY_NOT_SUPPLIED',
    'PRODUCTION_SWITCH_REVIEW_NOT_COMPLETED',
    'BUCKET_01_QUALIFICATION_NOT_GRANTED',
  ],
  qualificationStates: {
    implemented: true,
    contractVerified: executableEvidencePass,
    meshVerified: false,
    solverVerified: false,
    stressVerified: false,
    codeVerified: false,
    integrationVerified: false,
    bucketQualified: false,
  },
  authority: {
    exactHeadRepairExecutableEvidence: executableEvidencePass,
    registeredReplayArtifactValidatorsImplemented: true,
    runtimeReplaySourceRevalidationImplemented: true,
    referenceControlledReplayEntrypointImplemented: true,
    candidateControlledReplayEntrypointImplemented: true,
    independentCandidateCheckerImplemented: true,
    candidateReplayAdjudicationImplemented: true,
    candidateSolverExecuted: false,
    referenceControlledReplayRetained: false,
    candidateControlledReplayRetained: false,
    governingCodeSelected: false,
    externalReplayBundlesSupplied: false,
    productionSwitchAuthorized: false,
    productionSwitchApplied: false,
    productionMeshAuthority: false,
    stressAcceptanceAuthority: false,
    codeAssessmentAuthorized: false,
    qualificationAuthority: false,
    bucketQualified: false,
    reportAuthority: false,
    releaseQualified: false,
  },
  disposition: executableEvidencePass
    ? 'EXACT_HEAD_TECHNICAL_INFRASTRUCTURE_PASS_QUALIFICATION_GATES_OPEN'
    : 'EXACT_HEAD_TECHNICAL_INFRASTRUCTURE_BLOCKED',
};
fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report));
if (!executableEvidencePass) process.exit(1);

function nodeCheck(id, script) {
  return { id, command: process.execPath, args: [script] };
}
function npmCheck(id, script) {
  return { id, command: 'npm', args: ['run', script] };
}
function runCheck(check) {
  const result = spawnSync(check.command, check.args, {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env },
    maxBuffer: 64 * 1024 * 1024,
  });
  checks.push({
    id: check.id,
    command: [check.command, ...check.args].join(' '),
    status: result.status === 0 && !result.error ? 'PASS' : 'FAIL',
    exitCode: Number.isInteger(result.status) ? result.status : null,
    stdout: normalize(result.stdout),
    stderr: normalize(result.stderr),
    error: result.error?.message ?? null,
  });
}
function normalize(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  return value
    .replace(/\u001b\[[0-9;]*m/gu, '')
    .replace(/\bbuilt in \d+(?:\.\d+)?(?:ms|s)\b/giu, 'built in <duration>')
    .replace(/\r\n/gu, '\n')
    .trim();
}
function recordAssertion(id, accepted, message) {
  checks.push({
    id,
    command: null,
    status: accepted ? 'PASS' : 'FAIL',
    exitCode: accepted ? 0 : 1,
    stdout: null,
    stderr: null,
    error: accepted ? null : message,
  });
}
function isAncestor(ancestor, descendant) {
  return spawnSync(
    'git',
    ['merge-base', '--is-ancestor', ancestor, descendant],
    { cwd: ROOT, encoding: 'utf8' },
  ).status === 0;
}
function git(args) {
  const result = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });
  if (result.status !== 0 || result.error) {
    throw new Error(
      result.stderr?.trim() || result.error?.message || `git ${args.join(' ')} failed.`,
    );
  }
  return result.stdout.trim();
}
