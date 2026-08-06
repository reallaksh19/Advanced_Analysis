/**
 * Pure classification for retained analysis-mesh evidence.
 *
 * This module never mutates a store, generates a mesh, executes a solver, or
 * grants release authority.
 */
import { validateLafeaAnalysisMeshEvidence } from './lafea-analysis-mesh-evidence-validator.js';
import { requireLafeaLifecycleProfileForStage } from './lafea-lifecycle-profiles.js';

export const LAFEA_ANALYSIS_MESH_CUSTODY_SCHEMA =
  'lafea-analysis-mesh-custody/v1';
export const LAFEA_ANALYSIS_MESH_CUSTODY_STATES = Object.freeze([
  'NOT_APPLICABLE',
  'ABSENT',
  'STALE',
  'CURRENT_PASS',
  'CURRENT_WARNING',
  'CURRENT_BLOCK',
  'INVALID',
]);

const INPUT_KEYS = Object.freeze([
  'stageId', 'lifecycle', 'evidence', 'meshProfileHash',
]);

export function selectLafeaAnalysisMeshCustody(inputValue) {
  const input = requireExactRecord(inputValue, INPUT_KEYS);
  const profile = requireLafeaLifecycleProfileForStage(input.stageId);
  const lifecycle = requireLifecycle(input.lifecycle, input.stageId, profile.profileId);

  if (!profile.meshApplicable) {
    return custodyResult({
      stageId: input.stageId,
      profileId: profile.profileId,
      meshApplicable: false,
      state: input.evidence ? 'INVALID' : 'NOT_APPLICABLE',
      reasons: [input.evidence
        ? 'ANALYSIS_MESH_EVIDENCE_NOT_APPLICABLE'
        : 'MESH_NOT_APPLICABLE_TO_STAGE'],
    });
  }

  const meshProfileHash = requireText(input.meshProfileHash, 'meshProfileHash');
  const meshRecord = lifecycle.artifacts?.ANALYSIS_MESH;
  if (!input.evidence) {
    return custodyResult({
      stageId: input.stageId,
      profileId: profile.profileId,
      meshApplicable: true,
      state: 'ABSENT',
      reasons: [isRegisteredCurrent(meshRecord)
        ? 'LIFECYCLE_MESH_HAS_NO_RETAINED_EVIDENCE'
        : 'ANALYSIS_MESH_EVIDENCE_ABSENT'],
      recoverableAbsence: isRegisteredCurrent(meshRecord),
    });
  }

  let evidence;
  try {
    evidence = validateLafeaAnalysisMeshEvidence(input.evidence);
  } catch (error) {
    return custodyResult({
      stageId: input.stageId,
      profileId: profile.profileId,
      meshApplicable: true,
      state: 'INVALID',
      reasons: [error?.code ?? 'LAFEA_ANALYSIS_MESH_EVIDENCE_INVALID'],
    });
  }

  if (evidence.stageId !== input.stageId || evidence.profileId !== profile.profileId) {
    return custodyFromEvidence(evidence, {
      state: 'INVALID',
      reasons: ['ANALYSIS_MESH_STAGE_OR_PROFILE_MISMATCH'],
    });
  }
  if (isRegisteredCurrent(meshRecord)
    && meshRecord.artifactHash !== evidence.artifactHash) {
    return custodyFromEvidence(evidence, {
      state: 'INVALID',
      reasons: ['CONFLICTING_REGISTERED_ANALYSIS_MESH'],
    });
  }

  const staleReasons = currentnessFailures({
    lifecycle, evidence, meshProfileHash, meshRecord,
  });
  if (staleReasons.length) {
    return custodyFromEvidence(evidence, {
      state: 'STALE',
      reasons: staleReasons,
    });
  }

  const state = evidence.quality.worstStatus === 'BLOCK'
    ? 'CURRENT_BLOCK'
    : evidence.quality.worstStatus === 'WARNING'
      ? 'CURRENT_WARNING'
      : 'CURRENT_PASS';
  return custodyFromEvidence(evidence, { state, reasons: [] });
}

function currentnessFailures({ lifecycle, evidence, meshProfileHash, meshRecord }) {
  const reasons = [];
  const model = lifecycle.artifacts?.CANONICAL_MODEL;
  const geometry = lifecycle.artifacts?.ANALYSIS_GEOMETRY;
  if (lifecycle.source?.status !== 'CURRENT'
    || lifecycle.source?.sourceHash !== evidence.sourceHash) {
    reasons.push('SOURCE_BINDING_STALE');
  }
  if (!currentPass(model) || model.artifactHash !== evidence.canonicalModelHash) {
    reasons.push('CANONICAL_MODEL_BINDING_STALE');
  }
  if (!currentPass(geometry)
    || geometry.artifactHash !== evidence.analysisGeometryHash) {
    reasons.push('ANALYSIS_GEOMETRY_BINDING_STALE');
  }
  if (meshProfileHash !== evidence.meshProfileHash) {
    reasons.push('MESH_PROFILE_BINDING_STALE');
  }
  if (!meshRecord || !isRegisteredCurrent(meshRecord)) {
    reasons.push('ANALYSIS_MESH_NOT_CURRENTLY_REGISTERED');
  } else {
    if (meshRecord.artifactHash !== evidence.artifactHash) {
      reasons.push('ANALYSIS_MESH_ARTIFACT_BINDING_STALE');
    }
    if (meshRecord.parentHashes?.analysisGeometryHash
      !== evidence.analysisGeometryHash) {
      reasons.push('ANALYSIS_MESH_GEOMETRY_PARENT_STALE');
    }
    if (meshRecord.parentHashes?.meshProfileHash !== evidence.meshProfileHash) {
      reasons.push('ANALYSIS_MESH_PROFILE_PARENT_STALE');
    }
    if (meshRecord.status !== evidence.artifactRecord.status
      || meshRecord.qualification !== evidence.artifactRecord.qualification) {
      reasons.push('ANALYSIS_MESH_QUALIFICATION_STALE');
    }
    if (meshRecord.producerRef !== evidence.authority.producerRef) {
      reasons.push('ANALYSIS_MESH_PRODUCER_BINDING_STALE');
    }
  }
  return [...new Set(reasons)];
}

function custodyFromEvidence(evidence, classification) {
  return custodyResult({
    stageId: evidence.stageId,
    profileId: evidence.profileId,
    meshApplicable: true,
    state: classification.state,
    reasons: classification.reasons,
    evidenceStatus: evidence.status,
    qualification: evidence.qualification,
    qualityStatus: evidence.quality.worstStatus,
    meshHash: evidence.meshHash,
    artifactHash: evidence.artifactHash,
  });
}

function custodyResult(options) {
  const state = options.state;
  const current = [
    'CURRENT_PASS', 'CURRENT_WARNING', 'CURRENT_BLOCK',
  ].includes(state);
  const stale = state === 'STALE';
  const validEvidence = current || stale;
  const findings = ['CURRENT_WARNING', 'CURRENT_BLOCK'].includes(state);
  return deepFreeze({
    schema: LAFEA_ANALYSIS_MESH_CUSTODY_SCHEMA,
    stageId: options.stageId,
    profileId: options.profileId,
    meshApplicable: options.meshApplicable,
    state,
    evidenceStatus: options.evidenceStatus ?? null,
    qualification: options.qualification ?? null,
    qualityStatus: options.qualityStatus ?? null,
    meshHash: options.meshHash ?? null,
    artifactHash: options.artifactHash ?? null,
    reasons: [...options.reasons],
    actions: {
      auditOnly: stale,
      canView: validEvidence,
      canFocus: findings,
      canExport: validEvidence,
      canRecover: stale || Boolean(options.recoverableAbsence),
      allowsStageAdvance: state === 'NOT_APPLICABLE' || state === 'CURRENT_PASS',
      allowsRunAuthorization: state === 'NOT_APPLICABLE' || state === 'CURRENT_PASS',
    },
  });
}

function requireLifecycle(value, stageId, profileId) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw custodyError('LAFEA_ANALYSIS_MESH_CUSTODY_LIFECYCLE_INVALID');
  }
  if (value.stageId !== stageId || value.profileId !== profileId) {
    throw custodyError('LAFEA_ANALYSIS_MESH_CUSTODY_LIFECYCLE_MISMATCH');
  }
  return value;
}

function currentPass(record) {
  return record?.status === 'CURRENT' && record?.qualification === 'PASS';
}

function isRegisteredCurrent(record) {
  return record && ['CURRENT', 'BLOCKED'].includes(record.status);
}

function requireExactRecord(value, expectedKeys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) {
    throw custodyError('LAFEA_ANALYSIS_MESH_CUSTODY_INPUT_INVALID');
  }
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (actual.length !== expected.length
    || actual.some((key, index) => key !== expected[index])) {
    throw custodyError('LAFEA_ANALYSIS_MESH_CUSTODY_INPUT_KEYS_INVALID');
  }
  return value;
}

function requireText(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw custodyError(
      'LAFEA_ANALYSIS_MESH_CUSTODY_TEXT_INVALID',
      `${label} is required.`,
    );
  }
  return value;
}

function custodyError(code, message = code) {
  const error = new TypeError(message);
  error.code = code;
  return error;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}
