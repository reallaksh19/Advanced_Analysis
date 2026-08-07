/**
 * One canonical orchestration projection for workbench action/readiness policy.
 *
 * This module is pure. It consumes stage evidence and never mutates lifecycle,
 * mesh custody, source authority, execution state, or DOM state.
 */
import { requireLafeaStageAnalysisAdapter } from './lafea-stage-analysis-adapter.js';

export const LAFEA_WORKBENCH_ORCHESTRATION_SCHEMA =
  'lafea-workbench-orchestration/v1';
export const LAFEA_WORKBENCH_ORCHESTRATION_SECTION_SCHEMA =
  'lafea-workbench-orchestration-section/v1';
export const LAFEA_WORKBENCH_ORCHESTRATION_STATES = Object.freeze([
  'NOT_STARTED', 'READY', 'WARNING', 'BLOCKED', 'COMPLETE',
]);
export const LAFEA_WORKBENCH_ORCHESTRATION_ORDER = Object.freeze([
  'SOURCE', 'MODEL', 'PREPARATION', 'DISCRETIZATION',
  'AUTHORIZATION', 'EXECUTION', 'RESULTS', 'RELEASE',
]);

export function buildLafeaWorkbenchOrchestrationProjection(stageValue) {
  const stage = requireStage(stageValue);
  const adapter = requireLafeaStageAnalysisAdapter(stage.stageId);
  const lifecycle = stage.lifecycle;
  const readiness = stage.lifecycleReadiness;
  const custody = stage.analysisMeshCustodyProjection;

  const sections = {
    SOURCE: sourceSection(stage),
    MODEL: modelSection(stage, readiness),
    PREPARATION: preparationSection(adapter, readiness),
    DISCRETIZATION: discretizationSection(adapter, custody),
    AUTHORIZATION: authorizationSection(adapter, readiness, custody),
    EXECUTION: executionSection(stage),
    RESULTS: resultsSection(stage, readiness),
    RELEASE: section('BLOCKED', ['RELEASE_NOT_QUALIFIED'], [], []),
  };
  return freeze({
    schema: LAFEA_WORKBENCH_ORCHESTRATION_SCHEMA,
    stageId: stage.stageId,
    stageAdapterId: adapter.adapterId,
    order: [...LAFEA_WORKBENCH_ORCHESTRATION_ORDER],
    sections,
    lifecycleInitialized: Boolean(lifecycle),
  });
}

function sourceSection(stage) {
  if (!stage.document) return section('NOT_STARTED', ['SOURCE_DOCUMENT_ABSENT'], [], [
    'IMPORT_SOURCE',
  ]);
  if (!stage.lifecycle) return section('BLOCKED', ['LIFECYCLE_NOT_INITIALIZED'], [
    ref('DOCUMENT', documentRef(stage)),
  ], ['EDIT_SOURCE', 'INITIALIZE_SOURCE_AUTHORITY']);
  const reasons = [];
  if (stage.lifecycleBinding?.status !== 'CURRENT') {
    reasons.push(`LIFECYCLE_SOURCE_BINDING_${stage.lifecycleBinding?.status ?? 'UNKNOWN'}`);
  }
  if (stage.lifecycle.source?.status !== 'CURRENT') {
    reasons.push(`LIFECYCLE_SOURCE_${stage.lifecycle.source?.status ?? 'UNKNOWN'}`);
  }
  if (reasons.length) return section('BLOCKED', reasons, sourceRefs(stage), ['EDIT_SOURCE']);
  return section('COMPLETE', [], sourceRefs(stage), ['EDIT_SOURCE', 'VIEW_SOURCE']);
}

function modelSection(stage, readiness) {
  if (!stage.lifecycle) return section('NOT_STARTED', ['SOURCE_AUTHORITY_REQUIRED'], [], []);
  const record = stage.lifecycle.artifacts?.CANONICAL_MODEL;
  if (readiness?.modelCurrent === true && record?.status === 'CURRENT') {
    return section('COMPLETE', [], [artifactRef(record)], ['VIEW_MODEL']);
  }
  return section(record?.status === 'ABSENT' ? 'NOT_STARTED' : 'BLOCKED',
    modelReasons(stage, readiness, record),
    record && record.status !== 'ABSENT' ? [artifactRef(record)] : [],
    []);
}

function preparationSection(adapter, readiness) {
  if (!readiness?.modelCurrent) {
    return section('NOT_STARTED', ['CANONICAL_MODEL_NOT_CURRENT'], [], []);
  }
  if (!adapter.preparation.qualified) {
    return section('BLOCKED', [adapter.preparation.reason], [], []);
  }
  return section('READY', [], [ref('PREPARATION_ADAPTER', adapter.preparation.adapterId)], [
    'PREPARE',
  ]);
}

function discretizationSection(adapter, custody) {
  if (!adapter.discretization.applicable) {
    return section('COMPLETE', ['ANALYSIS_MESH_NOT_APPLICABLE'], [], ['VIEW']);
  }
  if (!custody) return section('NOT_STARTED', ['ANALYSIS_MESH_CUSTODY_ABSENT'], [], []);
  const refs = custody.meshHash ? [
    ref('ANALYSIS_MESH', custody.meshHash),
    ref('ANALYSIS_MESH_PROFILE', custody.meshProfileHash),
  ] : [];
  if (custody.state === 'CURRENT_PASS') return section('COMPLETE', [], refs, [
    'VIEW', 'EXPORT_EVIDENCE',
  ]);
  if (custody.state === 'CURRENT_WARNING') return section('WARNING', [
    'ANALYSIS_MESH_WARNING_REVIEW_REQUIRED',
  ], refs, ['VIEW', 'FOCUS_FINDINGS', 'EXPORT_EVIDENCE']);
  if (custody.state === 'ABSENT') return section('NOT_STARTED',
    custody.absenceReasons?.length
      ? custody.absenceReasons : ['ANALYSIS_MESH_EVIDENCE_ABSENT'],
    refs, ['IMPORT_AUTHORIZED_MESH']);
  return section('BLOCKED', [
    ...(custody.staleReasons ?? []),
    ...(custody.invalidReasons ?? []),
    ...(custody.state === 'CURRENT_BLOCK' ? ['ANALYSIS_MESH_QUALITY_BLOCK'] : []),
  ], refs, custody.canView ? ['VIEW', 'EXPORT_EVIDENCE'] : []);
}

function authorizationSection(adapter, readiness, custody) {
  const reasons = [];
  if (!readiness?.modelCurrent) reasons.push('CANONICAL_MODEL_NOT_CURRENT');
  if (!adapter.preparation.qualified) reasons.push(adapter.preparation.reason);
  if (adapter.discretization.applicable && custody?.usableForAuthorization !== true) {
    reasons.push(`ANALYSIS_MESH_${custody?.state ?? 'ABSENT'}`);
  }
  if (reasons.length) return section('BLOCKED', reasons, [], []);
  return section('READY', [], [], ['AUTHORIZE']);
}

function executionSection(stage) {
  const execution = stage.execution;
  if (!execution) return section('NOT_STARTED', ['EXECUTION_NOT_RUN'], [], []);
  if (execution.status === 'QUALIFIED') {
    return section('COMPLETE', [], [ref('EXECUTION', executionHash(execution))], ['VIEW']);
  }
  return section('BLOCKED', [`EXECUTION_${execution.status ?? 'UNKNOWN'}`], [], []);
}

function resultsSection(stage, readiness) {
  if (readiness?.resultReady) {
    const refs = resultRefs(stage.lifecycle);
    return section('COMPLETE', [], refs, ['VIEW_RESULTS', 'EXPORT_RESULTS']);
  }
  const executed = stage.execution?.status === 'QUALIFIED';
  return section(executed ? 'BLOCKED' : 'NOT_STARTED',
    [executed ? 'RESULT_EVIDENCE_NOT_CURRENT' : 'EXECUTION_REQUIRED'], [], []);
}

function modelReasons(stage, readiness, record) {
  const reasons = [...(readiness?.blockingReasons ?? [])];
  if (record?.status && record.status !== 'CURRENT') reasons.push(`CANONICAL_MODEL_${record.status}`);
  if (!reasons.length) reasons.push('CANONICAL_MODEL_NOT_CURRENT');
  return unique(reasons);
}

function sourceRefs(stage) {
  const refs = [ref('DOCUMENT', documentRef(stage))];
  if (stage.lifecycle?.source?.sourceHash) {
    refs.push(ref('SOURCE', stage.lifecycle.source.sourceHash));
  }
  if (stage.sourceAuthority?.sourceHash) {
    refs.push(ref('SOURCE_AUTHORITY', stage.sourceAuthority.sourceHash));
  }
  return refs;
}

function resultRefs(lifecycle) {
  if (!lifecycle?.artifacts) return [];
  return Object.entries(lifecycle.artifacts)
    .filter(([, record]) => ['CURRENT', 'BLOCKED'].includes(record.status)
      && ['RESULT_EVIDENCE', 'RECOVERY', 'CONVERGENCE'].includes(record.kind))
    .map(([, record]) => artifactRef(record));
}

function artifactRef(record) {
  return ref(record.kind, record.artifactHash);
}

function ref(kind, identity) {
  return freeze({ kind, identity: identity ?? null });
}

function section(state, reasons, evidenceRefs, allowedActions) {
  if (!LAFEA_WORKBENCH_ORCHESTRATION_STATES.includes(state)) {
    throw new TypeError('LAFEA_WORKBENCH_ORCHESTRATION_STATE_INVALID');
  }
  return freeze({
    schema: LAFEA_WORKBENCH_ORCHESTRATION_SECTION_SCHEMA,
    state,
    reasons: unique(reasons),
    evidenceRefs: [...evidenceRefs],
    allowedActions: unique(allowedActions),
  });
}

function executionHash(execution) {
  return execution.result?.semanticHash
    ?? execution.result?.artifactHash
    ?? execution.canonicalInput?.semanticHash
    ?? null;
}

function documentRef(stage) {
  return stage.lifecycleBinding?.currentDocumentDigest
    ?? stage.lifecycleBinding?.boundDocumentDigest
    ?? null;
}

function requireStage(value) {
  if (!value || typeof value !== 'object' || typeof value.stageId !== 'string') {
    throw new TypeError('LAFEA_WORKBENCH_ORCHESTRATION_STAGE_REQUIRED');
  }
  return value;
}

function unique(values) {
  return [...new Set(values.filter((value) => value !== null && value !== undefined))];
}

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freeze);
  return Object.freeze(value);
}
