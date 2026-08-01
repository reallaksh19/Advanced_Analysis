/**
 * NB-T4A stage-authorized analysis-mesh lifecycle evidence producer.
 *
 * The producer consumes an explicit, separately authorized mesh and retained
 * mesh profile. It does not generate topology, execute an engine or promote
 * recovery, convergence, assessment, report or release authority.
 */
import {
  LAFEA_ANALYSIS_MESH_AUTHORITY_SCHEMA,
  LAFEA_ANALYSIS_MESH_EVIDENCE_SCHEMA,
  LAFEA_ANALYSIS_MESH_FEA_STAGES,
  LAFEA_ANALYSIS_MESH_INTAKE_SCHEMA,
  LAFEA_ANALYSIS_MESH_PRODUCER_REVISION,
  canonicalLafeaAnalysisMesh,
  canonicalLafeaAnalysisMeshProfile,
  lafeaAnalysisMeshContentHash,
  qualifyLafeaAnalysisMesh,
  requireAnalysisMeshSha256,
  requireExactMeshRecord,
  requireLafeaAnalysisMeshAuthority,
  requireLafeaAnalysisMeshElementFamily,
} from './lafea-analysis-mesh-contract.js';
import { canonicalLafeaSha256 } from './lafea-canonical-sha256.js';
import {
  createLafeaArtifactRecord,
  registerLafeaArtifact,
} from './lafea-lifecycle.js';
import { requireLafeaLifecycleProfileForStage } from './lafea-lifecycle-profiles.js';
import { requireLafeaStageRegistryEntry } from './lafea-stage-registry.js';

export {
  LAFEA_ANALYSIS_MESH_AUTHORITY_ROLE,
  LAFEA_ANALYSIS_MESH_AUTHORITY_SCHEMA,
  LAFEA_ANALYSIS_MESH_AUTHORITY_STATUS,
  LAFEA_ANALYSIS_MESH_EVIDENCE_SCHEMA,
  LAFEA_ANALYSIS_MESH_FEA_STAGES,
  LAFEA_ANALYSIS_MESH_INTAKE_SCHEMA,
  LAFEA_ANALYSIS_MESH_PRODUCER_REVISION,
  LAFEA_ANALYSIS_MESH_QUALITY_SCHEMA,
  LAFEA_ANALYSIS_MESH_SCHEMA,
  lafeaAnalysisMeshContentHash,
} from './lafea-analysis-mesh-contract.js';

const RELEASE_STATE = 'RELEASE_NOT_QUALIFIED';
const INTAKE_KEYS = Object.freeze([
  'schema', 'stageId', 'sourceHash', 'canonicalModelHash',
  'analysisGeometryHash', 'meshProfile', 'mesh', 'authority',
]);
const EVIDENCE_KEYS = Object.freeze([
  'schema', 'producerRevision', 'stageId', 'profileId', 'sourceHash',
  'canonicalModelHash', 'analysisGeometryHash', 'meshProfile', 'mesh',
  'authority', 'meshHash', 'meshProfileHash', 'quality', 'artifactHash',
  'status', 'qualification', 'artifactRecord', 'registrationId',
  'releaseState', 'convergenceProduced', 'codeAssessmentProduced',
  'reportProduced', 'releaseQualified',
]);

export function createLafeaAnalysisMeshEvidence(intakeValue) {
  const intake = requireExactMeshRecord(
    intakeValue, INTAKE_KEYS, 'analysis mesh intake',
  );
  if (intake.schema !== LAFEA_ANALYSIS_MESH_INTAKE_SCHEMA) {
    throw meshEvidenceError('LAFEA_ANALYSIS_MESH_INTAKE_SCHEMA_INVALID');
  }
  const stageId = requireFeaStage(intake.stageId);
  const stage = requireLafeaStageRegistryEntry(stageId);
  const lifecycleProfile = requireLafeaLifecycleProfileForStage(stageId);
  if (stage.engineState !== 'QUALIFIED_ROUTE_REGISTERED'
    || !lifecycleProfile.meshApplicable) {
    throw meshEvidenceError('LAFEA_ANALYSIS_MESH_STAGE_NOT_AUTHORIZED');
  }

  const sourceHash = requireAnalysisMeshSha256(intake.sourceHash, 'sourceHash');
  const canonicalModelHash = requireAnalysisMeshSha256(
    intake.canonicalModelHash, 'canonicalModelHash',
  );
  const analysisGeometryHash = requireAnalysisMeshSha256(
    intake.analysisGeometryHash, 'analysisGeometryHash',
  );
  const meshProfile = canonicalLafeaAnalysisMeshProfile(intake.meshProfile);
  const mesh = canonicalLafeaAnalysisMesh(intake.mesh);
  requireLafeaAnalysisMeshElementFamily(stageId, meshProfile, mesh.elements);
  const meshHash = lafeaAnalysisMeshContentHash(mesh);
  const authority = requireLafeaAnalysisMeshAuthority(intake.authority, {
    stageId,
    sourceHash,
    canonicalModelHash,
    analysisGeometryHash,
    meshProfileHash: meshProfile.semanticHash,
    meshHash,
  });
  const quality = qualifyLafeaAnalysisMesh(stageId, mesh, meshProfile);
  const blocked = quality.worstStatus === 'BLOCK';
  const status = blocked ? 'BLOCKED' : 'CURRENT';
  const qualification = blocked ? 'BLOCK' : 'PASS';
  const artifactHash = canonicalLafeaSha256({
    schema: 'lafea-analysis-mesh-artifact-hash-input/v1',
    stageId,
    profileId: lifecycleProfile.profileId,
    sourceHash,
    canonicalModelHash,
    analysisGeometryHash,
    meshProfileHash: meshProfile.semanticHash,
    meshHash,
    authority,
    quality,
  });
  const artifactRecord = createLafeaArtifactRecord({
    stageId,
    kind: 'ANALYSIS_MESH',
    status,
    artifactHash,
    parentHashes: {
      analysisGeometryHash,
      meshProfileHash: meshProfile.semanticHash,
    },
    qualification,
    producerRef: authority.producerRef,
    diagnostics: blocked ? [blockingDiagnostic(quality.blockingElementIds)] : [],
  });
  const registrationId = registrationIdentity(stageId, artifactHash);

  return deepFreeze({
    schema: LAFEA_ANALYSIS_MESH_EVIDENCE_SCHEMA,
    producerRevision: LAFEA_ANALYSIS_MESH_PRODUCER_REVISION,
    stageId,
    profileId: lifecycleProfile.profileId,
    sourceHash,
    canonicalModelHash,
    analysisGeometryHash,
    meshProfile,
    mesh,
    authority,
    meshHash,
    meshProfileHash: meshProfile.semanticHash,
    quality,
    artifactHash,
    status,
    qualification,
    artifactRecord,
    registrationId,
    releaseState: RELEASE_STATE,
    convergenceProduced: false,
    codeAssessmentProduced: false,
    reportProduced: false,
    releaseQualified: false,
  });
}

export function registerLafeaAnalysisMeshEvidence(lifecycleValue, evidenceValue) {
  const evidence = validateEvidence(evidenceValue);
  if (!lifecycleValue || lifecycleValue.stageId !== evidence.stageId
    || lifecycleValue.profileId !== evidence.profileId) {
    throw meshEvidenceError('LAFEA_ANALYSIS_MESH_LIFECYCLE_MISMATCH');
  }
  if (lifecycleValue.source?.status !== 'CURRENT'
    || lifecycleValue.source?.sourceHash !== evidence.sourceHash) {
    throw meshEvidenceError('LAFEA_ANALYSIS_MESH_SOURCE_PARENT_STALE');
  }
  requireCurrentPassArtifact(
    lifecycleValue, 'CANONICAL_MODEL', evidence.canonicalModelHash,
    'LAFEA_ANALYSIS_MESH_MODEL_PARENT_STALE',
  );
  requireCurrentPassArtifact(
    lifecycleValue, 'ANALYSIS_GEOMETRY', evidence.analysisGeometryHash,
    'LAFEA_ANALYSIS_MESH_GEOMETRY_PARENT_STALE',
  );
  return registerLafeaArtifact(
    lifecycleValue, evidence.artifactRecord, evidence.registrationId,
  );
}

function validateEvidence(value) {
  requireExactMeshRecord(value, EVIDENCE_KEYS, 'analysis mesh evidence');
  if (value.schema !== LAFEA_ANALYSIS_MESH_EVIDENCE_SCHEMA
    || value.producerRevision !== LAFEA_ANALYSIS_MESH_PRODUCER_REVISION) {
    throw meshEvidenceError('LAFEA_ANALYSIS_MESH_EVIDENCE_SCHEMA_INVALID');
  }
  const rebuilt = createLafeaAnalysisMeshEvidence({
    schema: LAFEA_ANALYSIS_MESH_INTAKE_SCHEMA,
    stageId: value.stageId,
    sourceHash: value.sourceHash,
    canonicalModelHash: value.canonicalModelHash,
    analysisGeometryHash: value.analysisGeometryHash,
    meshProfile: value.meshProfile,
    mesh: value.mesh,
    authority: value.authority,
  });
  if (JSON.stringify(rebuilt) !== JSON.stringify(value)) {
    throw meshEvidenceError('LAFEA_ANALYSIS_MESH_EVIDENCE_TAMPERED');
  }
  return rebuilt;
}

function requireFeaStage(stageId) {
  if (!LAFEA_ANALYSIS_MESH_FEA_STAGES.includes(stageId)) {
    throw meshEvidenceError('LAFEA_ANALYSIS_MESH_STAGE_NOT_FEA');
  }
  return stageId;
}

function requireCurrentPassArtifact(lifecycle, kind, artifactHash, code) {
  const record = lifecycle.artifacts?.[kind];
  if (!record || record.status !== 'CURRENT' || record.qualification !== 'PASS'
    || record.artifactHash !== artifactHash) {
    throw meshEvidenceError(code);
  }
}

function blockingDiagnostic(elementIds) {
  return Object.freeze({
    severity: 'BLOCK',
    code: 'LAFEA_ANALYSIS_MESH_QUALITY_BLOCK',
    path: 'quality.elementResults',
    message: `Blocking mesh-quality evidence: ${elementIds.join(', ')}`,
  });
}

function registrationIdentity(stageId, artifactHash) {
  return `NB-T4A-${stageId.replace('.', '-')}-ANALYSIS-MESH-${artifactHash.slice(7, 23).toUpperCase()}`;
}

function meshEvidenceError(code) {
  const error = new TypeError(code);
  error.code = code;
  return error;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}
