import { canonicalLafeaSha256 } from './lafea-canonical-sha256.js';
import {
  LAFEA_BUCKET_01_ARTIFACT_MANIFEST_SCHEMA,
  LAFEA_BUCKET_01_INDEPENDENT_CANDIDATE_EVIDENCE_SCHEMA,
} from './lafea-bucket-01-independent-candidate-verification.js';

export const LAFEA_BUCKET_01_REPLAY_ARTIFACT_CUSTODY_INPUT_SCHEMA =
  'lafea-bucket-01-replay-artifact-custody-input/v1';
export const LAFEA_BUCKET_01_REPLAY_ARTIFACT_CUSTODY_EVIDENCE_SCHEMA =
  'lafea-bucket-01-replay-artifact-custody-evidence/v1';
export const LAFEA_BUCKET_01_REPLAY_ARTIFACT_CUSTODY_REVISION =
  'B01-REPLAY-ARTIFACT-CUSTODY.1';
export const LAFEA_BUCKET_01_CONTROLLED_REPLAY_RESULT_SCHEMA =
  'lafea-bucket-01-controlled-replay-result/v1';

export const INPUT_KEYS = Object.freeze([
  'schema', 'routeId', 'exactHeadSha', 'designId', 'designHash',
  'candidateArtifactHeadSha', 'mergeBaseSha',
  'candidateArtifactHeadIsAncestor', 'artifacts',
]);
export const ARTIFACT_KEYS = Object.freeze([
  'artifactId', 'artifactScope', 'role', 'relativePath',
  'routeId', 'levelOrdinal', 'exactHeadSha', 'designHash',
  'parentArtifactHashes', 'declaredRawFileHash', 'computedRawFileHash', 'payload',
]);
export const ALLOWED_ARTIFACT_SCOPES = Object.freeze(new Set([
  'CANDIDATE_MESH_BOUND',
  'REFERENCE_MESH_BOUND',
  'REPOSITORY_REGRESSION',
  'EXECUTION_ENVIRONMENT',
]));
export const REQUIRED_ROLES = Object.freeze([
  'FROZEN_INPUT_DEFINITION',
  'STAGE_DOCUMENT_AND_MAPPING_ANCESTRY',
  'MESH_QUALITY_EVIDENCE',
  'SOLVER_AND_EQUILIBRIUM_EVIDENCE',
  'GLOBAL_RESPONSE_CONVERGENCE',
  'KIRSCH_FIXED_PROBE_EVIDENCE',
  'PRODUCTION_LUG_FIXED_LOCATION_AND_PATH_EVIDENCE',
  'PROBE_TOPOLOGY_AUDIT_EVIDENCE',
  'BUILD_IMPORT_PATCH_AND_WORKTREE_CHECKS',
]);
export const CHECK_ROLE_MAP = Object.freeze({
  meshQuality: 'MESH_QUALITY_EVIDENCE',
  solverAndEquilibrium: 'SOLVER_AND_EQUILIBRIUM_EVIDENCE',
  globalResponseConvergence: 'GLOBAL_RESPONSE_CONVERGENCE',
  kirschFixedProbes: 'KIRSCH_FIXED_PROBE_EVIDENCE',
  productionLugStress: 'PRODUCTION_LUG_FIXED_LOCATION_AND_PATH_EVIDENCE',
  probeTopologyAudit: 'PROBE_TOPOLOGY_AUDIT_EVIDENCE',
  repositoryGate: 'BUILD_IMPORT_PATCH_AND_WORKTREE_CHECKS',
});
export const FROZEN_KEYS = Object.freeze([
  'coordinates', 'stressTolerances', 'loads', 'supports', 'material',
  'solverPolicy', 'codeBasisBoundary',
]);

export function validateArtifact(value) {
  exactKeys(value, ARTIFACT_KEYS, 'replay artifact');
  const artifact = {
    artifactId: text(value.artifactId, 'artifactId'),
    artifactScope: text(value.artifactScope, 'artifactScope'),
    role: text(value.role, 'role'),
    relativePath: safeRelativePath(value.relativePath),
    routeId: text(value.routeId, 'routeId'),
    levelOrdinal: nullableOrdinal(value.levelOrdinal),
    exactHeadSha: gitSha(value.exactHeadSha, 'artifact.exactHeadSha'),
    designHash: sha256(value.designHash, 'artifact.designHash'),
    parentArtifactHashes: hashArray(value.parentArtifactHashes),
    declaredRawFileHash: sha256(value.declaredRawFileHash, 'declaredRawFileHash'),
    computedRawFileHash: sha256(value.computedRawFileHash, 'computedRawFileHash'),
    payload: plainRecord(value.payload, 'payload'),
  };
  if (!ALLOWED_ARTIFACT_SCOPES.has(artifact.artifactScope)) {
    throw custodyError('LAFEA_B01_REPLAY_ARTIFACT_SCOPE_INVALID');
  }
  if (artifact.declaredRawFileHash !== artifact.computedRawFileHash) {
    throw custodyError('LAFEA_B01_REPLAY_ARTIFACT_RAW_HASH_MISMATCH');
  }
  return deepFreeze(artifact);
}

export function validateStageMappingAncestry(ancestryArtifact, solverArtifact, exactHeadSha, designHash) {
  const payload = ancestryArtifact?.payload;
  if (!payload
    || payload.schema !== 'lafea-bucket-01-stage-document-mapping-ancestry/v1'
    || payload.exactHeadSha !== exactHeadSha
    || payload.designHash !== designHash
    || !isSha(payload.stageDocumentHash)
    || !isSha(payload.mappingPackageHash)
    || !isSha(payload.projectionHash)
    || payload.authority?.productionSwitchAuthorized !== false
    || payload.authority?.qualificationAuthority !== false
    || payload.authority?.bucketQualified !== false) {
    throw custodyError('LAFEA_B01_REPLAY_STAGE_MAPPING_ANCESTRY_INVALID');
  }
  const ancestrySemanticHash = canonicalLafeaSha256(payload);
  if (!solverArtifact.parentArtifactHashes.includes(ancestrySemanticHash)
    || solverArtifact.payload?.projectionHash !== payload.projectionHash) {
    throw custodyError('LAFEA_B01_REPLAY_STAGE_MAPPING_ANCESTRY_DETACHED');
  }
}

export function deriveFrozenInputHashes(payload, exactHeadSha, designHash) {
  if (payload.schema !== 'lafea-bucket-01-frozen-replay-input-definition/v1'
    || payload.exactHeadSha !== exactHeadSha
    || payload.designHash !== designHash
    || !payload.inputs
    || typeof payload.inputs !== 'object'
    || Array.isArray(payload.inputs)
    || JSON.stringify(Object.keys(payload.inputs).sort())
      !== JSON.stringify([...FROZEN_KEYS].sort())
    || !payload.componentHashes
    || typeof payload.componentHashes !== 'object'
    || Array.isArray(payload.componentHashes)
    || JSON.stringify(Object.keys(payload.componentHashes).sort())
      !== JSON.stringify([...FROZEN_KEYS].sort())) {
    throw custodyError('LAFEA_B01_REPLAY_FROZEN_INPUT_DEFINITION_INVALID');
  }
  const computed = Object.fromEntries(FROZEN_KEYS.map((key) => [
    key,
    canonicalLafeaSha256({
      schema: 'lafea-bucket-01-frozen-replay-input-component/v1',
      role: key,
      value: payload.inputs[key],
    }),
  ]));
  for (const key of FROZEN_KEYS) {
    if (payload.componentHashes[key] !== computed[key]) {
      throw custodyError('LAFEA_B01_REPLAY_FROZEN_INPUT_HASH_TAMPERED');
    }
  }
  return deepFreeze(computed);
}

export function classifyArtifact(role, payload) {
  switch (role) {
    case 'MESH_QUALITY_EVIDENCE':
      return payload.schema === LAFEA_BUCKET_01_INDEPENDENT_CANDIDATE_EVIDENCE_SCHEMA
        && payload.status === 'PASS'
        && payload.authority?.executedRecomputation === true
        && payload.authority?.independentCheckerExecution === true
        ? 'PASS' : 'BLOCKED';
    case 'SOLVER_AND_EQUILIBRIUM_EVIDENCE':
      return solverArtifactPass(payload) ? 'PASS' : 'BLOCKED';
    case 'GLOBAL_RESPONSE_CONVERGENCE':
      return payload.status === 'PASS'
        && typeof payload.schema === 'string'
        && payload.schema.startsWith('lafea-bucket-01-production-response-')
        ? 'PASS' : 'BLOCKED';
    case 'KIRSCH_FIXED_PROBE_EVIDENCE':
      return payload.status === 'PASS'
        && typeof payload.schema === 'string'
        && payload.schema.startsWith('lafea-bucket-01-kirsch-fixed-probe-')
        ? 'PASS' : 'BLOCKED';
    case 'PRODUCTION_LUG_FIXED_LOCATION_AND_PATH_EVIDENCE':
      return payload.status === 'PASS'
        && payload.schema === 'lafea-bucket-01-production-lug-fixed-probe-evidence/v2'
        ? 'PASS' : 'BLOCKED';
    case 'PROBE_TOPOLOGY_AUDIT_EVIDENCE':
      return topologyArtifactPass(payload) ? 'PASS' : 'BLOCKED';
    case 'BUILD_IMPORT_PATCH_AND_WORKTREE_CHECKS':
      return repositoryArtifactPass(payload) ? 'PASS' : 'BLOCKED';
    default:
      throw custodyError('LAFEA_B01_REPLAY_ARTIFACT_ROLE_UNSUPPORTED', role);
  }
}

export function solverArtifactPass(payload) {
  if (payload.schema !== 'lafea-lug-pinhole-physical-problem-execution/v1'
    || payload.status !== 'ACCEPTED'
    || payload.accepted !== true
    || payload.controllerResult?.status !== 'ACCEPTED'
    || payload.controllerResult?.accepted !== true
    || !Array.isArray(payload.controllerResult?.levelResults)
    || payload.controllerResult.levelResults.length === 0) return false;
  return payload.controllerResult.levelResults.every((level) => {
    if (level.levelEvidence?.status !== 'ACCEPTED') return false;
    const result = level.execution?.result;
    if (result?.qualification?.state !== 'ACCEPTED'
      || !Array.isArray(result.loadCaseResults)
      || result.loadCaseResults.length === 0) return false;
    return result.loadCaseResults.every((row) =>
      row.equilibrium?.accepted === true
        && row.energyQualification?.accepted === true);
  });
}

export function topologyArtifactPass(payload) {
  if (payload.schema === LAFEA_BUCKET_01_INDEPENDENT_CANDIDATE_EVIDENCE_SCHEMA) {
    return payload.status === 'PASS'
      && payload.authority?.executedRecomputation === true
      && payload.authority?.independentCheckerExecution === true;
  }
  return typeof payload.schema === 'string'
    && payload.schema.includes('probe-topology')
    && payload.status === 'PASS';
}

export function repositoryArtifactPass(payload) {
  return typeof payload.schema === 'string'
    && payload.schema.startsWith('lafea-bucket-01-exact-head-report/')
    && payload.status === 'EXACT_HEAD_REPAIR_EVIDENCE_PASS'
    && Array.isArray(payload.blockingCheckIds)
    && payload.blockingCheckIds.length === 0
    && Array.isArray(payload.checks)
    && payload.checks.some((row) =>
      row.id === 'TRACKED_WORKTREE_CLEAN' && row.status === 'PASS');
}

export function validateTypedManifestEntries(entries) {
  const required = [
    'artifactId', 'artifactScope', 'schema', 'producerRevision', 'routeId',
    'levelOrdinal', 'exactHeadSha', 'designHash', 'parentArtifactHashes',
    'semanticHash', 'rawFileHash', 'relativePath', 'validationStatus',
  ];
  if (!Array.isArray(entries) || entries.length !== REQUIRED_ROLES.length) {
    throw custodyError('LAFEA_B01_REPLAY_TYPED_MANIFEST_INVALID');
  }
  for (const entry of entries) {
    if (JSON.stringify(Object.keys(entry).sort())
        !== JSON.stringify([...required].sort())
      || !ALLOWED_ARTIFACT_SCOPES.has(entry.artifactScope)
      || !['PASS', 'BLOCKED'].includes(entry.validationStatus)
      || !isSha(entry.designHash)
      || !isSha(entry.semanticHash)
      || !isSha(entry.rawFileHash)) {
      throw custodyError('LAFEA_B01_REPLAY_TYPED_MANIFEST_INVALID');
    }
  }
}

export function custodyAuthority() {
  return deepFreeze({
    executedRecomputation: true,
    independentCheckerExecution: true,
    replayStatusDerivedFromValidatedArtifacts: true,
    suppliedCheckMapTrusted: false,
    productionSwitchAuthorized: false,
    productionMeshAuthority: false,
    stressAcceptanceAuthority: false,
    qualificationAuthority: false,
    bucketQualified: false,
  });
}

export function assertCustodyAuthority(value) {
  if (!value
    || value.executedRecomputation !== true
    || value.independentCheckerExecution !== true
    || value.replayStatusDerivedFromValidatedArtifacts !== true
    || value.suppliedCheckMapTrusted !== false
    || value.productionSwitchAuthorized !== false
    || value.productionMeshAuthority !== false
    || value.stressAcceptanceAuthority !== false
    || value.qualificationAuthority !== false
    || value.bucketQualified !== false) {
    throw custodyError('LAFEA_B01_REPLAY_ARTIFACT_AUTHORITY_INVALID');
  }
}

export function verifyFullHash(value, code) {
  const base = { ...value };
  delete base.semanticHash;
  if (canonicalLafeaSha256(base) !== value.semanticHash) throw custodyError(code);
}

export function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
    || JSON.stringify(Object.keys(value).sort())
      !== JSON.stringify([...expected].sort())) {
    throw custodyError('LAFEA_B01_REPLAY_ARTIFACT_EXACT_KEYS_INVALID', label);
  }
}

export function plainRecord(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) {
    throw custodyError('LAFEA_B01_REPLAY_ARTIFACT_RECORD_INVALID', label);
  }
  return value;
}

export function text(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw custodyError('LAFEA_B01_REPLAY_ARTIFACT_TEXT_REQUIRED', label);
  }
  return value;
}

export function nullableOrdinal(value) {
  if (value === null) return null;
  if (!Number.isInteger(value) || value < 1) {
    throw custodyError('LAFEA_B01_REPLAY_ARTIFACT_LEVEL_ORDINAL_INVALID');
  }
  return value;
}
export function hashArray(value) {
  if (!Array.isArray(value)) {
    throw custodyError('LAFEA_B01_REPLAY_ARTIFACT_PARENT_HASHES_INVALID');
  }
  return deepFreeze(value.map((row) => sha256(row, 'parentArtifactHash')));
}
export function isSha(value) {
  return typeof value === 'string' && /^sha256:[0-9a-f]{64}$/u.test(value);
}

export function safeRelativePath(value) {
  const result = text(value, 'relativePath');
  if (result.startsWith('/') || result.includes('..')) {
    throw custodyError('LAFEA_B01_REPLAY_ARTIFACT_PATH_INVALID');
  }
  return result;
}

export function gitSha(value, label) {
  if (typeof value !== 'string' || !/^[0-9a-f]{40}$/u.test(value)) {
    throw custodyError('LAFEA_B01_REPLAY_ARTIFACT_HEAD_INVALID', label);
  }
  return value;
}

export function sha256(value, label) {
  if (typeof value !== 'string' || !/^sha256:[0-9a-f]{64}$/u.test(value)) {
    throw custodyError('LAFEA_B01_REPLAY_ARTIFACT_SHA256_INVALID', label);
  }
  return value;
}

export function custodyError(code, message = code) {
  const error = new TypeError(message);
  error.code = code;
  return error;
}

export function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

export function isDeepFrozen(value) {
  if (!value || typeof value !== 'object') return true;
  return Object.isFrozen(value) && Object.values(value).every(isDeepFrozen);
}
