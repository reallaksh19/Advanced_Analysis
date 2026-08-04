export const LAFEA_BUCKET_01_REPLAY_ARTIFACT_REGISTRY_ID =
  'B01-CONTROLLED-REPLAY-ARTIFACT-REGISTRY';
export const LAFEA_BUCKET_01_REPLAY_ARTIFACT_REGISTRY_REVISION = '3';
export const LAFEA_BUCKET_01_REPLAY_ARTIFACT_RECEIPT_SCHEMA =
  'lafea-bucket-01-replay-artifact-validation-receipt/v2';
export const LAFEA_BUCKET_01_REPLAY_ARTIFACT_VALIDATION_SCHEMA =
  'lafea-bucket-01-replay-artifact-validation-evidence/v1';

export const LAFEA_BUCKET_01_REPLAY_CHECK_KEYS = Object.freeze([
  'meshQuality',
  'solverAndEquilibrium',
  'globalResponseConvergence',
  'kirschFixedProbes',
  'productionLugStress',
  'probeTopologyAudit',
  'repositoryGate',
]);

export const LAFEA_BUCKET_01_REPLAY_SCOPES = Object.freeze(new Set([
  'CANDIDATE_MESH_BOUND',
  'REFERENCE_MESH_BOUND',
  'REPOSITORY_REGRESSION',
  'EXECUTION_ENVIRONMENT',
]));

export const LAFEA_BUCKET_01_REPLAY_PER_LEVEL_KINDS = Object.freeze(new Set([
  'ANALYSIS_MESH_EVIDENCE',
  'STAGE_DOCUMENT',
  'LOAD_MAPPING',
  'BOUNDARY_MAPPING',
  'MAPPING_PACKAGE',
  'EXECUTION_RECEIPT',
]));

export const LAFEA_BUCKET_01_REPLAY_COMMON_COUNTS = Object.freeze({
  ANALYSIS_MESH_EVIDENCE: 4,
  STAGE_DOCUMENT: 4,
  LOAD_MAPPING: 4,
  BOUNDARY_MAPPING: 4,
  MAPPING_PACKAGE: 4,
  EXECUTION_RECEIPT: 4,
  RESPONSE_EVIDENCE: 1,
  KIRSCH_EVIDENCE: 1,
  PRODUCTION_STRESS_EVIDENCE: 1,
  TOPOLOGY_AUDIT_EVIDENCE: 1,
  CONVERGENCE_EVIDENCE: 1,
  REPOSITORY_GATE_REPORT: 1,
  STDOUT_LOG: 1,
  STDERR_LOG: 1,
  PACKAGE_LOCK: 1,
  EXECUTION_ENVIRONMENT: 1,
});

export const LAFEA_BUCKET_01_REPLAY_CANDIDATE_COUNTS = Object.freeze({
  CANDIDATE_PACKAGE: 1,
  CANDIDATE_INTAKE: 1,
  INDEPENDENT_CHECKER_EVIDENCE: 1,
});

export const LAFEA_BUCKET_01_REPLAY_REFERENCE_COUNTS = Object.freeze({
  REFERENCE_MESH_LADDER: 1,
});

export const LAFEA_BUCKET_01_REPLAY_ARTIFACT_POLICY = Object.freeze({
  CANDIDATE_PACKAGE: entry('CANDIDATE_PACKAGE',
    'CANDIDATE_MESH_BOUND',
    'meshQuality',
    ['lafea-bucket-01-probe-stable-candidate-mesh-package/v1'],
  ),
  CANDIDATE_INTAKE: entry('CANDIDATE_INTAKE',
    'CANDIDATE_MESH_BOUND',
    'meshQuality',
    ['lafea-bucket-01-probe-stable-candidate-intake-evidence/v2'],
  ),
  INDEPENDENT_CHECKER_EVIDENCE: entry('INDEPENDENT_CHECKER_EVIDENCE',
    'CANDIDATE_MESH_BOUND',
    'probeTopologyAudit',
    ['lafea-bucket-01-independent-candidate-verification-evidence/v1'],
  ),
  REFERENCE_MESH_LADDER: entry('REFERENCE_MESH_LADDER',
    'REFERENCE_MESH_BOUND',
    'meshQuality',
    ['lafea-bucket-01-controlled-replay-reference-mesh-ladder/v1'],
  ),
  ANALYSIS_MESH_EVIDENCE: entry('ANALYSIS_MESH_EVIDENCE',
    null,
    'meshQuality',
    ['lafea-bucket-01-controlled-replay-analysis-mesh/v1'],
  ),
  STAGE_DOCUMENT: entry('STAGE_DOCUMENT',
    null,
    'repositoryGate',
    ['lafea-bucket-01-controlled-replay-stage-document/v1'],
  ),
  LOAD_MAPPING: entry('LOAD_MAPPING',
    null,
    'solverAndEquilibrium',
    ['lafea-bucket-01-controlled-replay-load-mapping/v1'],
  ),
  BOUNDARY_MAPPING: entry('BOUNDARY_MAPPING',
    null,
    'solverAndEquilibrium',
    ['lafea-bucket-01-controlled-replay-boundary-mapping/v1'],
  ),
  MAPPING_PACKAGE: entry('MAPPING_PACKAGE',
    null,
    'solverAndEquilibrium',
    ['lafea-bucket-01-controlled-replay-mapping-package/v1'],
  ),
  EXECUTION_RECEIPT: entry('EXECUTION_RECEIPT',
    null,
    'solverAndEquilibrium',
    ['lafea-bucket-01-controlled-replay-execution-receipt/v1'],
  ),
  RESPONSE_EVIDENCE: entry('RESPONSE_EVIDENCE',
    null,
    'globalResponseConvergence',
    [
      'lafea-bucket-01-candidate-response-evidence/v1',
      'lafea-bucket-01-production-response-evidence/v2',
    ],
  ),
  KIRSCH_EVIDENCE: entry('KIRSCH_EVIDENCE',
    'REPOSITORY_REGRESSION',
    'kirschFixedProbes',
    ['lafea-bucket-01-kirsch-fixed-probe-evidence/v2'],
  ),
  PRODUCTION_STRESS_EVIDENCE: entry('PRODUCTION_STRESS_EVIDENCE',
    null,
    'productionLugStress',
    [
      'lafea-bucket-01-candidate-stress-evidence/v1',
      'lafea-bucket-01-probe-stable-v3-direct-point-receipt/v1',
      'lafea-bucket-01-production-lug-fixed-probe-evidence/v2',
    ],
  ),
  TOPOLOGY_AUDIT_EVIDENCE: entry('TOPOLOGY_AUDIT_EVIDENCE',
    null,
    'probeTopologyAudit',
    [
      'lafea-bucket-01-controlled-replay-topology-audit/v1',
      'lafea-bucket-01-independent-candidate-verification-evidence/v1',
      'lafea-bucket-01-probe-topology-audit-evidence/v1',
    ],
  ),
  CONVERGENCE_EVIDENCE: entry('CONVERGENCE_EVIDENCE',
    null,
    'productionLugStress',
    ['lafea-bucket-01-controlled-replay-convergence/v1'],
  ),
  REPOSITORY_GATE_REPORT: entry('REPOSITORY_GATE_REPORT',
    'REPOSITORY_REGRESSION',
    'repositoryGate',
    [
      'lafea-bucket-01-exact-head-report/v17',
      'lafea-bucket-01-exact-head-report/v18',
    ],
  ),
  STDOUT_LOG: entry('STDOUT_LOG',
    'EXECUTION_ENVIRONMENT',
    'repositoryGate',
    ['text/plain; charset=utf-8'],
  ),
  STDERR_LOG: entry('STDERR_LOG',
    'EXECUTION_ENVIRONMENT',
    'repositoryGate',
    ['text/plain; charset=utf-8'],
  ),
  PACKAGE_LOCK: entry('PACKAGE_LOCK',
    'EXECUTION_ENVIRONMENT',
    'repositoryGate',
    ['application/vnd.npm.package-lock+json'],
  ),
  EXECUTION_ENVIRONMENT: entry('EXECUTION_ENVIRONMENT',
    'EXECUTION_ENVIRONMENT',
    'repositoryGate',
    ['lafea-bucket-01-controlled-replay-execution-environment/v1'],
  ),
});

export function lafeaBucket01ReplayArtifactPolicy(kind) {
  return LAFEA_BUCKET_01_REPLAY_ARTIFACT_POLICY[kind] ?? null;
}

function entry(kind, scope, check, schemas) {
  return Object.freeze({
    scope,
    check,
    schemas: Object.freeze([...schemas]),
    validatorId: `B01-REPLAY-${kind}-PAYLOAD-VALIDATOR`,
    validatorRevision: '1',
  });
}
