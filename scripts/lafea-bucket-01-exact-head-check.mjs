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
  nodeCheck('MANDATORY_BENCHMARK_LADDER', 'scripts/lafea-bucket-01-benchmark-ladder-check.mjs'),
  nodeCheck('BUCKET_01_REPAIR', 'scripts/lafea-bucket-01-repair-check.mjs'),
  nodeCheck('GOVERNED_4096_PRODUCTION_RESPONSE_CONVERGENCE_CONTRACT', 'scripts/lafea-bucket-01-production-response-check.mjs'),
  nodeCheck('SCALABLE_SPARSE_CONTINUUM_SOLVER', 'scripts/lafea-bucket-01-scalable-solver-check.mjs'),
  nodeCheck('GOVERNED_T6_KIRSCH_FIXED_PROBES', 'scripts/lafea-bucket-01-kirsch-fixed-probes-check.mjs'),
  nodeCheck('GOVERNED_4096_DIRECT_POINT_LOCATION_CONTRACT', 'scripts/lafea-bucket-01-production-lug-probe-contract-check.mjs'),
  nodeCheck('GOVERNED_PROBE_TOPOLOGY_OBSERVABILITY', 'scripts/lafea-bucket-01-probe-topology-check.mjs'),
  nodeCheck('PROBE_STABLE_POLAR_MESH_DESIGN', 'scripts/lafea-bucket-01-probe-stable-mesh-design-check.mjs'),
  nodeCheck('PROBE_STABLE_CANDIDATE_INTAKE_CONTRACT', 'scripts/lafea-bucket-01-probe-stable-candidate-intake-contract-check.mjs'),
  nodeCheck('EXPECTED_VALUE_DEFINITION_SET', 'scripts/lafea-bucket-01-expected-value-registry-check.mjs'),
  nodeCheck('CODE_BASIS_INTAKE_CONTRACT', 'scripts/lafea-bucket-01-code-basis-check.mjs'),
  nodeCheck('THREE_REPLAY_CUSTODY_CONTRACT', 'scripts/lafea-bucket-01-replay-custody-check.mjs'),
  nodeCheck('GOVERNED_T3_PATCH', 'scripts/lafea-bucket-01-t3-patch-check.mjs'),
  nodeCheck('GOVERNED_PURE_SHEAR', 'scripts/lafea-bucket-01-pure-shear-check.mjs'),
  nodeCheck('GOVERNED_PLANE_STRESS_CANTILEVER', 'scripts/lafea-bucket-01-cantilever-check.mjs'),
  nodeCheck('T6_PATCH', 'scripts/lafea.3-t6-patch-check.mjs'),
  nodeCheck('PRODUCTION_T6_MESH_LADDER', 'scripts/lafea-nb-t6b-lug-pinhole-mesh-ladder-check.mjs'),
  nodeCheck('LOAD_DRIVEN_FREE_DOF_PILOT', 'scripts/lafea-nb-t6d-load-driven-qualification-check.mjs'),
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
  schema: 'lafea-bucket-01-exact-head-report/v15',
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
    'GOVERNED_4096_PRODUCTION_RESPONSE_EXECUTION_NOT_RETAINED',
    'GOVERNED_4096_DIRECT_POINT_STRESS_RECEIPT_NOT_PRODUCED',
    'PROBE_STABLE_CANDIDATE_MESH_NOT_GENERATED_OR_EXECUTED',
    'APPROVED_CODE_BASIS_AUTHORITY_NOT_SUPPLIED',
    'THREE_EXTERNAL_REPLAY_BUNDLES_NOT_SUPPLIED',
  ],
  qualificationStates: {
    implemented: true,
    contractVerified: false,
    meshVerified: false,
    solverVerified: false,
    stressVerified: false,
    codeVerified: false,
    integrationVerified: false,
    bucketQualified: false,
  },
  authority: {
    exactHeadRepairExecutableEvidence: executableEvidencePass,
    selectedRepairInfrastructureReady: executableEvidencePass,
    mandatoryBenchmarkLadderImplemented: true,
    governedCantileverRouteImplemented: true,
    scalableSparseSolverRouteImplemented: true,
    governed4096ProductionResponseRouteImplemented: true,
    governedDirectPointStressRouteImplemented: true,
    governedProbeTopologyObservabilityImplemented: true,
    probeStablePolarMeshDesignImplemented: true,
    probeStableCandidateIntakeContractImplemented: true,
    probeStablePolarMeshProductionAuthority: false,
    probeStableCandidateProductionSwitchAuthorized: false,
    productionLugFixedProbeContractImplemented: true,
    expectedValueDefinitionSetImplemented: true,
    codeBasisIntakeContractImplemented: true,
    threeReplayCustodyContractImplemented: true,
    governingCodeSelected: false,
    externalReplayBundlesSupplied: false,
    replayPassClaimedForRepositoryCandidate: false,
    productionResponseExecutionRetained: false,
    productionLugFixedProbeExecutionRetained: false,
    movingMaximumAcceptanceAuthorized: false,
    nodalProjectionAcceptanceAuthorized: false,
    integrationPointExtrapolationAcceptanceAuthorized: false,
    arbitraryGeometryAuthorized: false,
    shellAuthorized: false,
    codeAssessmentAuthorized: false,
    reportAuthority: false,
    releaseQualified: false,
  },
  disposition: executableEvidencePass
    ? 'EXACT_HEAD_REPAIR_EVIDENCE_PASS_BUCKET_NOT_QUALIFIED'
    : 'EXACT_HEAD_REPAIR_EVIDENCE_BLOCKED_BUCKET_NOT_QUALIFIED',
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
    shell: process.platform === 'win32' && check.command === 'npm',
  });
  checks.push({
    id: check.id,
    command: [check.command, ...check.args].join(' '),
    status: result.status === 0 && !result.error ? 'PASS' : 'FAIL',
    exitCode: Number.isInteger(result.status) ? result.status : null,
    stdout: normalizeCapturedOutput(result.stdout),
    stderr: normalizeCapturedOutput(result.stderr),
    error: normalizeCapturedOutput(result.error?.message),
  });
}
function normalizeCapturedOutput(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const normalized = value
    .replace(/\u001b\[[0-9;]*m/gu, '')
    .replace(
      /\bbuilt in \d+(?:\.\d+)?(?:ms|s)\b/giu,
      'built in <duration>',
    )
    .replace(
      /\bcompleted in \d+(?:\.\d+)?(?:ms|s)\b/giu,
      'completed in <duration>',
    )
    .replace(/\r\n/gu, '\n')
    .trim();
  return normalized || null;
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
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `git ${args.join(' ')} failed.`);
  }
  return result.stdout.trim();
}
