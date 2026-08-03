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
  { id: 'MANDATORY_BENCHMARK_LADDER', script: 'scripts/lafea-bucket-01-benchmark-ladder-check.mjs' },
  { id: 'GOVERNED_4096_PRODUCTION_T6_MESH_QUALIFICATION', script: 'scripts/lafea-bucket-01-mesh-qualification-check.mjs' },
  { id: 'GOVERNED_4096_PRODUCTION_RESPONSE_CONVERGENCE_CONTRACT', script: 'scripts/lafea-bucket-01-production-response-check.mjs' },
  { id: 'SCALABLE_SPARSE_CONTINUUM_SOLVER', script: 'scripts/lafea-bucket-01-scalable-solver-check.mjs' },
  { id: 'SPARSE_SOLVER_POLICY_ANTI_DRIFT', script: 'scripts/lafea-bucket-01-solver-policy-contract-check.mjs' },
  { id: 'GOVERNED_T6_KIRSCH_FIXED_PROBES', script: 'scripts/lafea-bucket-01-kirsch-fixed-probes-check.mjs' },
  { id: 'GOVERNED_4096_DIRECT_POINT_LOCATION_CONTRACT', script: 'scripts/lafea-bucket-01-production-lug-probe-contract-check.mjs' },
  { id: 'GOVERNED_PROBE_TOPOLOGY_OBSERVABILITY', script: 'scripts/lafea-bucket-01-probe-topology-check.mjs' },
  { id: 'PROBE_STABLE_POLAR_MESH_DESIGN', script: 'scripts/lafea-bucket-01-probe-stable-mesh-design-check.mjs' },
  { id: 'PROBE_STABLE_CANDIDATE_INTAKE_CONTRACT', script: 'scripts/lafea-bucket-01-probe-stable-candidate-intake-contract-check.mjs' },
  { id: 'CONTROLLED_CANDIDATE_REPLAY_PROPOSAL_CONTRACT', script: 'scripts/lafea-bucket-01-controlled-candidate-replay-proposal-check.mjs' },
  { id: 'EXPECTED_VALUE_DEFINITION_SET', script: 'scripts/lafea-bucket-01-expected-value-registry-check.mjs' },
  { id: 'CODE_BASIS_INTAKE_CONTRACT', script: 'scripts/lafea-bucket-01-code-basis-check.mjs' },
  { id: 'THREE_REPLAY_CUSTODY_CONTRACT', script: 'scripts/lafea-bucket-01-replay-custody-check.mjs' },
  { id: 'FINAL_ADJUDICATION_CONTRACT', script: 'scripts/lafea-bucket-01-final-adjudication-contract-check.mjs' },
  { id: 'PATCH_V2_REGRESSION', script: 'scripts/lafea-bucket-01-patch-v2-regression-check.mjs' },
  { id: 'GOVERNED_T3_PATCH_RECEIPT', script: 'scripts/lafea-bucket-01-t3-patch-check.mjs' },
  { id: 'GOVERNED_PURE_SHEAR_RECEIPT', script: 'scripts/lafea-bucket-01-pure-shear-check.mjs' },
  { id: 'GOVERNED_PLANE_STRESS_CANTILEVER', script: 'scripts/lafea-bucket-01-cantilever-check.mjs' },
  { id: 'MANUFACTURED_PURE_BENDING_PANEL', script: 'scripts/lafea-bucket-01-pure-bending-panel-check.mjs' },
  { id: 'THREE_LEVEL_GCI_EVALUATOR', script: 'scripts/lafea-bucket-01-convergence-check.mjs' },
  { id: 'DIRECT_T6_FIXED_PHYSICAL_PROBE_RECOVERY', script: 'scripts/lafea-bucket-01-fixed-probe-check.mjs' },
  { id: 'DIRECT_FIXED_PROBE_STRESS_CONVERGENCE', script: 'scripts/lafea-bucket-01-stress-convergence-check.mjs' },
];

const checks = checkDefinitions.map((definition) => runNodeCheck(definition));
const failed = checks.filter((check) => check.status !== 'PASS');
const repairChecksPass = failed.length === 0;
const report = {
  schema: 'lafea-bucket-01-repair-check-report/v20',
  status: repairChecksPass ? 'REPAIR_CHECKS_PASS' : 'REPAIR_CHECKS_FAIL',
  bucketId: 'LAFEA-BENCH-B01-CONTINUUM-LUG-PINHOLE',
  target: 'C2D-LUG-PINHOLE -> LAFEA.3',
  checks,
  blockingCheckIds: failed.map((check) => check.id),
  evidenceState: {
    mandatoryBenchmarkLadderVerified: repairChecksPass,
    governed4096ProductionMeshContractVerified: repairChecksPass,
    governed4096ProductionResponseSpecFrozen: true,
    finestThreeResponseConvergenceContractVerified: repairChecksPass,
    scalableSparseSolverRouteVerified: repairChecksPass,
    sparseSolverPolicyBoundToSource: repairChecksPass,
    productionResponseExecutionEvidenceGenerated: false,
    kirschFixedProbeOracleFrozen: true,
    kirschFixedProbeEvidenceGenerated: repairChecksPass,
    governed4096ProductionLugProbeSpecFrozen: true,
    directPointRecoveryContractVerified: repairChecksPass,
    probeTopologyObservabilityVerified: repairChecksPass,
    probeStablePolarMeshDesignVerified: repairChecksPass,
    probeStableCandidateIntakeContractVerified: repairChecksPass,
    controlledCandidateReplayProposalContractVerified: repairChecksPass,
    probeStableCandidateMeshGenerated: false,
    productionLugProbeEvidenceGenerated: false,
    expectedValueDefinitionSetVerified: repairChecksPass,
    codeBasisIntakeContractVerified: repairChecksPass,
    codeBasisAuthoritySupplied: false,
    threeReplayCustodyContractVerified: repairChecksPass,
    finalAdjudicationContractVerified: repairChecksPass,
    patchV2RegressionVerified: repairChecksPass,
    governedFourLevelReplayContractVerified: repairChecksPass,
    externalReplayBundlesSupplied: false,
    governedT3PatchOracleFrozen: true,
    governedT3PatchEvidenceGenerated: repairChecksPass,
    governedPureShearOracleFrozen: true,
    governedPureShearEvidenceGenerated: repairChecksPass,
    governedCantileverExpectedValuesFrozen: true,
    governedCantileverEvidenceGenerated: repairChecksPass,
    manufacturedPanelOracleFrozen: true,
    manufacturedPanelEvidenceGenerated: repairChecksPass,
    exactHeadRepositoryExecutionProven: false,
  },
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
    benchmarkLadderContractImplemented: repairChecksPass,
    governed4096MeshQualificationInfrastructureImplemented: repairChecksPass,
    governed4096ResponseConvergenceInfrastructureImplemented: repairChecksPass,
    scalableSparseSolverInfrastructureImplemented: repairChecksPass,
    sparseSolverPolicyAntiDriftImplemented: repairChecksPass,
    governedKirschFixedProbeBenchmarkImplemented: repairChecksPass,
    governedDirectPointLugProbeContractImplemented: repairChecksPass,
    governedProbeTopologyObservabilityImplemented: repairChecksPass,
    probeStablePolarMeshDesignImplemented: repairChecksPass,
    probeStableCandidateIntakeContractImplemented: repairChecksPass,
    controlledCandidateReplayProposalContractImplemented: repairChecksPass,
    probeStablePolarMeshProductionAuthority: false,
    probeStableCandidateProductionSwitchAuthorized: false,
    expectedValueDefinitionSetImplemented: repairChecksPass,
    codeBasisIntakeContractImplemented: repairChecksPass,
    threeReplayCustodyContractImplemented: repairChecksPass,
    finalAdjudicationContractImplemented: repairChecksPass,
    governedFourLevelReplayContractImplemented: repairChecksPass,
    governingCodeSelected: false,
    replayPassClaimedForRepositoryCandidate: false,
    governedT3PatchBenchmarkImplemented: repairChecksPass,
    governedPureShearBenchmarkImplemented: repairChecksPass,
    governedCantileverBenchmarkImplemented: repairChecksPass,
    manufacturedPanelBenchmarkImplemented: repairChecksPass,
    directFixedPhysicalProbeInfrastructureImplemented: repairChecksPass,
    asymptoticGciInfrastructureImplemented: repairChecksPass,
    movingMaximumAcceptanceAuthorized: false,
    nodalProjectionAcceptanceAuthorized: false,
    integrationPointExtrapolationAcceptanceAuthorized: false,
    arbitraryGeometryAuthorized: false,
    shellAuthorized: false,
    codeAssessmentAuthorized: false,
    reportAuthority: false,
    releaseQualified: false,
  },
  disposition: repairChecksPass
    ? 'REPAIR_INFRASTRUCTURE_ACCEPTED_BUCKET_NOT_QUALIFIED'
    : 'REPAIR_INFRASTRUCTURE_FAILED_BUCKET_NOT_QUALIFIED',
};

fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report));
if (!repairChecksPass) process.exit(1);

function runNodeCheck(definition) {
  const result = spawnSync(process.execPath, [definition.script], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  return {
    id: definition.id,
    command: `${process.execPath} ${definition.script}`,
    status: result.status === 0 && !result.error ? 'PASS' : 'FAIL',
    exitCode: Number.isInteger(result.status) ? result.status : null,
    stdout: result.stdout?.trim() || null,
    stderr: result.stderr?.trim() || null,
    error: result.error?.message ?? null,
  };
}
