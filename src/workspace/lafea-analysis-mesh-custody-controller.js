/** Atomic retained-evidence custody commands. */
import { registerLafeaAnalysisMeshEvidence } from './lafea-analysis-mesh-evidence.js';
import {
  buildAnalysisMeshCustodyProjection,
} from './lafea-analysis-mesh-custody-projection.js';
import { validateLafeaAnalysisMeshEvidence } from './lafea-analysis-mesh-evidence-validator.js';

const CURRENT_STATES = new Set([
  'CURRENT_PASS', 'CURRENT_WARNING', 'CURRENT_BLOCK',
]);
const RECOVERABLE_STALE_CODES = new Set([
  'LAFEA_ANALYSIS_MESH_LIFECYCLE_MISMATCH',
  'LAFEA_ANALYSIS_MESH_SOURCE_PARENT_STALE',
  'LAFEA_ANALYSIS_MESH_MODEL_PARENT_STALE',
  'LAFEA_ANALYSIS_MESH_GEOMETRY_PARENT_STALE',
  'LAFEA_ARTIFACT_PARENT_NOT_CURRENT',
  'LAFEA_ARTIFACT_PREREQUISITE_NOT_CURRENT',
]);

export function createLafeaAnalysisMeshCustodyController(hostValue) {
  const host = requireHost(hostValue);

  function registerAnalysisMeshEvidence(evidenceValue) {
    const evidence = validateLafeaAnalysisMeshEvidence(evidenceValue);
    const stageId = requireActiveStage(host, evidence.stageId);
    const stage = requireStage(host.readStageState(stageId), stageId, true);
    requireCurrentBinding(stage);
    requireProfileBinding(stage, evidence);
    requireSourceAuthority(stage, evidence);
    const retained = stage.retainedAnalysisMeshEvidence ?? null;
    if (exactReplay(stage, retained, evidence)) {
      return buildResult(stage, retained, false);
    }
    rejectCurrentConflict(stage, retained, evidence);

    const lifecycle = registerLafeaAnalysisMeshEvidence(stage.lifecycle, evidence);
    const next = nextStage(
      stage,
      lifecycle,
      evidence,
      stage.analysisMeshProfileHash,
      'REGISTER_ANALYSIS_MESH_EVIDENCE',
    );
    requireCurrentProjection(next, evidence);
    commitAndPublish(host, stageId, stage, next);
    return buildResult(next, evidence, true);
  }

  function recoverAnalysisMeshEvidence(evidenceValue) {
    const evidence = validateLafeaAnalysisMeshEvidence(evidenceValue);
    const stageId = requireActiveStage(host, evidence.stageId);
    const stage = requireStage(host.readStageState(stageId), stageId, false);
    const retained = stage.retainedAnalysisMeshEvidence ?? null;
    if (retained && !sameEvidence(retained, evidence)) {
      throw custodyError('LAFEA_ANALYSIS_MESH_RECOVERY_CONFLICTING_REPLAY');
    }

    const before = buildAnalysisMeshCustodyProjection(stage, retained);
    if (retained && CURRENT_STATES.has(before.state)) {
      return buildResult(stage, retained, false);
    }

    const canPromote = stage.lifecycle
      && stage.lifecycleBinding?.status === 'CURRENT'
      && stage.analysisMeshProfileHash === evidence.meshProfileHash
      && sourceAuthorityMatches(stage.sourceAuthority, evidence);
    if (canPromote) {
      try {
        const lifecycle = registerLafeaAnalysisMeshEvidence(stage.lifecycle, evidence);
        const next = nextStage(
          stage,
          lifecycle,
          evidence,
          stage.analysisMeshProfileHash,
          'RECOVER_ANALYSIS_MESH_EVIDENCE_CURRENT',
        );
        requireCurrentProjection(next, evidence);
        commitAndPublish(host, stageId, stage, next);
        return buildResult(next, evidence, true);
      } catch (error) {
        if (!RECOVERABLE_STALE_CODES.has(error?.code)) throw error;
        if (retained) return buildResult(stage, retained, false);
      }
    } else if (retained) {
      return buildResult(stage, retained, false);
    }

    const next = nextStage(
      stage,
      stage.lifecycle ?? null,
      evidence,
      stage.analysisMeshProfileHash ?? null,
      'RECOVER_ANALYSIS_MESH_EVIDENCE_AUDIT_ONLY',
    );
    commitAndPublish(host, stageId, stage, next);
    return buildResult(next, evidence, true);
  }

  function selectRetainedAnalysisMeshEvidence(stageId) {
    const stage = requireStage(host.readStageState(stageId), stageId, false);
    return stage.retainedAnalysisMeshEvidence ?? null;
  }

  function exportAnalysisMeshEvidence(stageId) {
    return selectRetainedAnalysisMeshEvidence(stageId);
  }

  return Object.freeze({
    registerAnalysisMeshEvidence,
    selectRetainedAnalysisMeshEvidence,
    exportAnalysisMeshEvidence,
    recoverAnalysisMeshEvidence,
  });
}

function nextStage(stage, lifecycle, evidence, profileHash, action) {
  return freeze({
    ...stage,
    lifecycle,
    analysisMeshProfileHash: profileHash,
    retainedAnalysisMeshEvidence: evidence,
    lastAnalysisMeshCustodyAction: action,
  });
}

function sameEvidence(retained, evidence) {
  return Boolean(retained)
    && retained.artifactHash === evidence.artifactHash
    && JSON.stringify(retained) === JSON.stringify(evidence);
}

function exactReplay(stage, retained, evidence) {
  if (!sameEvidence(retained, evidence)) return false;
  const record = stage.lifecycle?.artifacts?.ANALYSIS_MESH;
  return record?.artifactHash === evidence.artifactHash
    && record?.producerRef === evidence.authority.producerRef
    && record?.status === evidence.artifactRecord.status
    && record?.qualification === evidence.artifactRecord.qualification
    && stage.analysisMeshProfileHash === evidence.meshProfileHash
    && stage.lifecycleBinding?.status === 'CURRENT';
}

function rejectCurrentConflict(stage, retained, evidence) {
  const record = stage.lifecycle?.artifacts?.ANALYSIS_MESH;
  if (record && ['CURRENT', 'BLOCKED'].includes(record.status)
    && record.artifactHash !== evidence.artifactHash) {
    throw custodyError('LAFEA_ANALYSIS_MESH_CONFLICTING_REPLAY');
  }
  if (!retained || retained.artifactHash === evidence.artifactHash) return;
  const projection = buildAnalysisMeshCustodyProjection(stage, retained);
  if (CURRENT_STATES.has(projection.state)) {
    throw custodyError('LAFEA_ANALYSIS_MESH_CONFLICTING_REPLAY');
  }
}

function requireCurrentProjection(stage, evidence) {
  const projection = buildAnalysisMeshCustodyProjection(stage, evidence);
  if (!CURRENT_STATES.has(projection.state)) {
    throw custodyError('LAFEA_ANALYSIS_MESH_REGISTRATION_NOT_CURRENT');
  }
  return projection;
}

function buildResult(stage, evidence, changed) {
  return freeze({
    changed,
    evidence,
    projection: buildAnalysisMeshCustodyProjection(stage, evidence),
  });
}

function commitAndPublish(host, stageId, previous, next) {
  requireActiveStage(host, stageId);
  host.commitStageState(
    stageId,
    next,
    previous.analysisMeshCustodyVersion ?? 0,
  );
  try { host.publish?.(); } catch { /* committed state remains authoritative */ }
}

function requireHost(value) {
  if (!value || typeof value !== 'object'
    || typeof value.getActiveStageId !== 'function'
    || typeof value.readStageState !== 'function'
    || typeof value.commitStageState !== 'function') {
    throw custodyError('LAFEA_ANALYSIS_MESH_CUSTODY_HOST_INVALID');
  }
  return value;
}

function requireActiveStage(host, stageId) {
  if (host.getActiveStageId() !== stageId) {
    throw custodyError('LAFEA_ANALYSIS_MESH_ACTIVE_STAGE_MISMATCH');
  }
  return stageId;
}

function requireStage(value, stageId, lifecycleRequired) {
  if (!value || typeof value !== 'object'
    || (value.stageId && value.stageId !== stageId)
    || (value.lifecycle && value.lifecycle.stageId !== stageId)
    || (lifecycleRequired && !value.lifecycle)) {
    throw custodyError('LAFEA_ANALYSIS_MESH_STAGE_STATE_INVALID');
  }
  return value;
}

function requireCurrentBinding(stage) {
  if (stage.lifecycleBinding?.status !== 'CURRENT') {
    throw custodyError('LAFEA_ANALYSIS_MESH_LIFECYCLE_BINDING_NOT_CURRENT');
  }
}

function requireProfileBinding(stage, evidence) {
  if (!stage.analysisMeshProfileHash) {
    throw custodyError('LAFEA_ANALYSIS_MESH_PROFILE_BINDING_REQUIRED');
  }
  if (stage.analysisMeshProfileHash !== evidence.meshProfileHash) {
    throw custodyError('LAFEA_ANALYSIS_MESH_PROFILE_BINDING_MISMATCH');
  }
}

function requireSourceAuthority(stage, evidence) {
  if (!sourceAuthorityMatches(stage.sourceAuthority, evidence)) {
    throw custodyError('LAFEA_ANALYSIS_MESH_SOURCE_AUTHORITY_MISMATCH');
  }
}

function sourceAuthorityMatches(authority, evidence) {
  if (!authority) return true;
  return authority.stageId === evidence.stageId
    && authority.sourceHash === evidence.sourceHash;
}

function custodyError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freeze);
  return Object.freeze(value);
}
