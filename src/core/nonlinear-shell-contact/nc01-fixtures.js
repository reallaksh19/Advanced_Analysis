import { semanticHash } from './contracts.js';
import { SHELL_BENCHMARK_CATALOG } from './shell-benchmark-catalog.js';
import { createShellBenchmarkEvidence, createSolverBridgeBinding } from './shell-qualification-evaluator.js';

const H = (label) => semanticHash({ fixture: label });

export function createSyntheticSolverBridgeBinding() {
  return createSolverBridgeBinding({
    exactHeadSha: '48c23d09a7291197dacefd99a2cf1b1caf8bca40',
    mergeCommitSha: '18e259f8a18e9011482d3ca4d1b8bd51dbe986f4',
    workflowRunId: '31021329297',
    artifactId: '8936729914',
    artifactDigest: 'sha256:2b1458c447724d15a2e9178af8302cba91b78593854f8741ffc57a9f0646d28d',
    summaryHash: 'sha256:44a927fe05b2506ca1fb89d6d859637d7e13bdd9ef0198464dc84ec1043acc84',
    authorityRecordHash: 'sha256:3185845e875666ce8c142a8b7c67b355a59e167b652a1200df4cf4ce24c1cc7e',
    deterministicExecutionHash: 'sha256:f581f365cf5482a5930ccbbf714f98a7770a33850d2637e7bf9e25b19cc6c724',
    validatorIdentity: 'LAFEA_NC_SOLVER_BRIDGE_EVIDENCE_V1',
    validatorRevision: '48c23d09a7291197dacefd99a2cf1b1caf8bca40',
    solverCustodyQualified: true,
    solverBridgeQualified: true,
    nc01Authorized: true,
  });
}

export function createSyntheticQualifiedShellEvidence(exactHeadSha = '1111111111111111111111111111111111111111') {
  return SHELL_BENCHMARK_CATALOG.map((entry, index) => createShellBenchmarkEvidence({
    id: entry.id,
    exactHeadSha,
    source: 'EXTERNAL_SOLVER_EXECUTION',
    recovery: 'FIXED_PHYSICAL_COORDINATE_SECTION_INTEGRATION_POINT',
    rawEvidenceHash: H(`${entry.id}:raw`),
    referenceHash: H(`${entry.id}:reference`),
    oracleHash: H(`${entry.id}:oracle`),
    meshHash: H(`${entry.id}:mesh`),
    referenceUncertainty: 0.001,
    acceptanceTolerance: 0.01,
    observedError: 0.005,
    equilibriumResidual: 1e-7,
    energyResidual: 1e-5,
    hourglassEnergyRatio: 0.01,
    transverseShearEnergyRatio: 0.02,
    meshLevels: [
      { globalH: 1, probeLocalH: 0.5, quantity: 1 + index * 0.01 },
      { globalH: 0.5, probeLocalH: 0.25, quantity: 1.001 + index * 0.01 },
      { globalH: 0.25, probeLocalH: 0.125, quantity: 1.0015 + index * 0.01 },
      { globalH: 0.125, probeLocalH: 0.0625, quantity: 1.00175 + index * 0.01 },
    ],
    mutation: { id: entry.requiredMutation, baselineError: 0.005, mutatedError: 0.05 },
  }));
}
