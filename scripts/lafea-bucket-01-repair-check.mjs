#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPORT_PATH = path.resolve(
  ROOT,
  process.env.LAFEA_BUCKET_01_REPAIR_REPORT_PATH
    ?? 'reports/qualification/lafea-bucket-01-repair-check.json',
);
const checkDefinitions = [
  ['MANDATORY_BENCHMARK_LADDER', 'scripts/lafea-bucket-01-benchmark-ladder-check.mjs'],
  ['GOVERNED_4096_PRODUCTION_T6_MESH_QUALIFICATION', 'scripts/lafea-bucket-01-mesh-qualification-check.mjs'],
  ['GOVERNED_4096_PRODUCTION_RESPONSE_CONVERGENCE_CONTRACT', 'scripts/lafea-bucket-01-production-response-check.mjs'],
  ['SCALABLE_SPARSE_CONTINUUM_SOLVER', 'scripts/lafea-bucket-01-scalable-solver-check.mjs'],
  ['SPARSE_SOLVER_POLICY_ANTI_DRIFT', 'scripts/lafea-bucket-01-solver-policy-contract-check.mjs'],
  ['GOVERNED_T6_KIRSCH_FIXED_PROBES', 'scripts/lafea-bucket-01-kirsch-fixed-probes-check.mjs'],
  ['GOVERNED_4096_DIRECT_POINT_LOCATION_CONTRACT', 'scripts/lafea-bucket-01-production-lug-probe-contract-check.mjs'],
  ['GOVERNED_PROBE_TOPOLOGY_OBSERVABILITY', 'scripts/lafea-bucket-01-probe-topology-check.mjs'],
  ['PROBE_STABLE_POLAR_MESH_DESIGN_V3', 'scripts/lafea-bucket-01-probe-stable-mesh-design-check.mjs'],
  ['PROBE_STABLE_CANDIDATE_INTAKE_CONTRACT_V3', 'scripts/lafea-bucket-01-probe-stable-candidate-intake-contract-check.mjs'],
  ['PATH_MAPPING_EVIDENCE_COMPATIBILITY', 'scripts/lafea-bucket-01-path-mapping-evidence-check.mjs'],
  ['CANDIDATE_PROJECTION_CONTRACT_V3', 'scripts/lafea-bucket-01-candidate-projection-contract-check.mjs'],
  ['CANDIDATE_RESPONSE_UNEQUAL_H_CONTRACT', 'scripts/lafea-bucket-01-unequal-h-convergence-check.mjs'],
  ['CANDIDATE_DIRECT_POINT_STRESS_CONTRACT', 'scripts/lafea-bucket-01-candidate-stress-check.mjs'],
  ['INDEPENDENT_CANDIDATE_RECOMPUTATION_CONTRACT', 'scripts/lafea-bucket-01-independent-candidate-verification-contract-check.mjs'],
  ['INDEPENDENT_CHECKER_RECEIPT_CONTRACT', 'scripts/lafea-bucket-01-independent-checker-receipt-contract-check.mjs'],
  ['REGISTERED_REPLAY_ARTIFACT_CUSTODY', 'scripts/lafea-bucket-01-replay-artifact-registry-contract-check.mjs'],
  ['CONTROLLED_REPLAY_ENTRYPOINT_ANTI_DRIFT', 'scripts/lafea-bucket-01-controlled-replay-entrypoint-check.mjs'],
  ['CONTROLLED_CANDIDATE_REPLAY_PROPOSAL_CONTRACT', 'scripts/lafea-bucket-01-controlled-candidate-replay-proposal-check.mjs'],
  ['CANDIDATE_REPLAY_ADJUDICATION_CONTRACT', 'scripts/lafea-bucket-01-candidate-replay-adjudication-check.mjs'],
  ['OSCILLATORY_BOUND_ELIGIBILITY_CONTRACT', 'scripts/lafea-bucket-01-oscillatory-bound-eligibility-check.mjs'],
  ['EXPECTED_VALUE_DEFINITION_SET', 'scripts/lafea-bucket-01-expected-value-registry-check.mjs'],
  ['CODE_BASIS_INTAKE_CONTRACT', 'scripts/lafea-bucket-01-code-basis-check.mjs'],
  ['THREE_REPLAY_CUSTODY_CONTRACT', 'scripts/lafea-bucket-01-replay-custody-check.mjs'],
  ['FINAL_ADJUDICATION_CONTRACT', 'scripts/lafea-bucket-01-final-adjudication-contract-check.mjs'],
  ['PATCH_V2_REGRESSION', 'scripts/lafea-bucket-01-patch-v2-regression-check.mjs'],
  ['GOVERNED_T3_PATCH_RECEIPT', 'scripts/lafea-bucket-01-t3-patch-check.mjs'],
  ['GOVERNED_PURE_SHEAR_RECEIPT', 'scripts/lafea-bucket-01-pure-shear-check.mjs'],
  ['GOVERNED_PLANE_STRESS_CANTILEVER', 'scripts/lafea-bucket-01-cantilever-check.mjs'],
  ['MANUFACTURED_PURE_BENDING_PANEL', 'scripts/lafea-bucket-01-pure-bending-panel-check.mjs'],
  ['THREE_LEVEL_GCI_EVALUATOR', 'scripts/lafea-bucket-01-convergence-check.mjs'],
  ['DIRECT_T6_FIXED_PHYSICAL_PROBE_RECOVERY', 'scripts/lafea-bucket-01-fixed-probe-check.mjs'],
  ['DIRECT_FIXED_PROBE_STRESS_CONVERGENCE', 'scripts/lafea-bucket-01-stress-convergence-check.mjs'],
].map(([id, script]) => ({ id, script }));

const checks = checkDefinitions.map(runNodeCheck);
const failed = checks.filter((check) => check.status !== 'PASS');
const pass = failed.length === 0;
const report = {
  schema: 'lafea-bucket-01-repair-check-report/v23',
  status: pass ? 'REPAIR_CHECKS_PASS' : 'REPAIR_CHECKS_FAIL',
  bucketId: 'LAFEA-BENCH-B01-CONTINUUM-LUG-PINHOLE',
  target: 'C2D-LUG-PINHOLE -> LAFEA.3',
  checks,
  blockingCheckIds: failed.map((check) => check.id),
  evidenceState: {
    technicalContractSetVerified: pass,
    registeredReplayArtifactValidatorsVerified: pass,
    runtimeReplayRevalidationVerified: pass,
    referenceControlledReplayEntrypointImplemented: pass,
    candidateControlledReplayEntrypointImplemented: pass,
    candidateReplayAdjudicationContractVerified: pass,
    independentCandidateCheckerContractVerified: pass,
    exactHeadRepositoryExecutionProven: false,
    candidateControlledReplayRetained: false,
    referenceControlledReplayRetained: false,
    externalCodeBasisAuthoritySupplied: false,
    triplicateReplayBundlesSupplied: false,
    productionSwitchAuthorized: false,
    bucketQualified: false,
  },
  authority: {
    technicalInfrastructureImplemented: pass,
    registeredArtifactValidationRequired: true,
    serializedReplayRequiresSourceFileRevalidation: true,
    syntheticReceiptEligibilityProhibited: true,
    candidateReplayExecutionAuthorized: true,
    productionSwitchAuthorized: false,
    productionSwitchApplied: false,
    productionMeshAuthority: false,
    stressAcceptanceAuthority: false,
    codeAssessmentAuthorized: false,
    qualificationAuthority: false,
    bucketQualified: false,
  },
  disposition: pass
    ? 'TECHNICAL_REPAIR_CONTRACTS_PASS_EXTERNAL_EXECUTION_AND_AUTHORITY_GATES_OPEN'
    : 'TECHNICAL_REPAIR_CONTRACTS_BLOCKED',
};
fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report));
if (!pass) process.exit(1);

function runNodeCheck(definition) {
  const result = spawnSync(process.execPath, [definition.script], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env },
    maxBuffer: 64 * 1024 * 1024,
  });
  return {
    id: definition.id,
    command: `${process.execPath} ${definition.script}`,
    status: result.status === 0 && !result.error ? 'PASS' : 'FAIL',
    exitCode: Number.isInteger(result.status) ? result.status : null,
    stdout: normalize(result.stdout),
    stderr: normalize(result.stderr),
    error: result.error?.message ?? null,
  };
}
function normalize(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  return value.replace(/\u001b\[[0-9;]*m/gu, '').trim();
}
