/** Pure canonical orchestration projection for workbench action/readiness policy. */
import { requireLafeaStageAnalysisAdapter } from './lafea-stage-analysis-adapter.js';

export const LAFEA_WORKBENCH_ORCHESTRATION_SCHEMA = 'lafea-workbench-orchestration/v1';
export const LAFEA_WORKBENCH_ORCHESTRATION_SECTION_SCHEMA = 'lafea-workbench-orchestration-section/v1';
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
  const readiness = stage.lifecycleReadiness;
  const custody = stage.analysisMeshCustodyProjection;
  const preparation = stage.preparationProjection;
  const sections = {
    SOURCE: sourceSection(stage),
    MODEL: modelSection(stage, readiness),
    PREPARATION: preparationSection(stage, adapter, readiness, preparation),
    DISCRETIZATION: discretizationSection(stage, adapter, custody),
    AUTHORIZATION: authorizationSection(stage, adapter, readiness, preparation, custody),
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
    lifecycleInitialized: Boolean(stage.lifecycle),
  });
}

function sourceSection(stage) {
  if (!stage.document) return section('NOT_STARTED', ['SOURCE_DOCUMENT_ABSENT'], [], ['IMPORT_SOURCE']);
  if (!stage.lifecycle) return section('BLOCKED', ['LIFECYCLE_NOT_INITIALIZED'], [ref('DOCUMENT', documentRef(stage))], ['EDIT_SOURCE', 'INITIALIZE_SOURCE_AUTHORITY']);
  const reasons = [];
  if (stage.lifecycleBinding?.status !== 'CURRENT') reasons.push(`LIFECYCLE_SOURCE_BINDING_${stage.lifecycleBinding?.status ?? 'UNKNOWN'}`);
  if (stage.lifecycle.source?.status !== 'CURRENT') reasons.push(`LIFECYCLE_SOURCE_${stage.lifecycle.source?.status ?? 'UNKNOWN'}`);
  if (reasons.length) return section('BLOCKED', reasons, sourceRefs(stage), ['EDIT_SOURCE']);
  return section('COMPLETE', [], sourceRefs(stage), ['EDIT_SOURCE', 'VIEW_SOURCE']);
}

function modelSection(stage, readiness) {
  if (stage.domainFirstProfileActive) {
    const projection = stage.analysisDomainProjection;
    const refs = projection?.analysisDomainHash ? [ref('ANALYSIS_DOMAIN', projection.analysisDomainHash)] : [];
    if (projection?.state === 'CURRENT_PASS' && readiness?.domainCurrent) {
      return section('COMPLETE', [], refs, ['VIEW_MODEL']);
    }
    const state = projection?.state === 'ABSENT' ? 'NOT_STARTED' : 'BLOCKED';
    return section(state, projection?.reasons ?? ['ANALYSIS_DOMAIN_NOT_CURRENT'], refs, []);
  }
  if (!stage.lifecycle) return section('NOT_STARTED', ['SOURCE_AUTHORITY_REQUIRED'], [], []);
  const record = stage.lifecycle.artifacts?.CANONICAL_MODEL;
  if (readiness?.modelCurrent === true && record?.status === 'CURRENT') {
    return section('COMPLETE', [], [artifactRef(record)], ['VIEW_MODEL']);
  }
  return section(record?.status === 'ABSENT' ? 'NOT_STARTED' : 'BLOCKED',
    modelReasons(readiness, record),
    record && record.status !== 'ABSENT' ? [artifactRef(record)] : [], []);
}

function preparationSection(stage, adapter, readiness, projection) {
  if (!readiness?.preMeshModelCurrent) {
    return section('NOT_STARTED', [
      stage.domainFirstProfileActive ? 'ANALYSIS_DOMAIN_NOT_CURRENT' : 'CANONICAL_MODEL_NOT_CURRENT',
    ], [], []);
  }
  if (!adapter.preparation.qualified) return section('BLOCKED', [adapter.preparation.reason], [], []);
  if (!projection) return section('BLOCKED', ['LAFEA_PREPARATION_PROJECTION_ABSENT'], [], []);
  const refs = preparationRefs(projection);
  if (projection.state === 'CURRENT_PASS') return section('COMPLETE', [], refs, ['VIEW_PREPARATION']);
  if (projection.state === 'CURRENT_WARNING' && projection.usableForAuthorization) {
    return section('WARNING', projection.reasons, refs, ['VIEW_PREPARATION', 'VIEW_APPROVAL']);
  }
  if (projection.state === 'ABSENT') {
    return section('BLOCKED', projection.reasons, refs,
      stage.domainFirstProfileActive ? [] : ['REGISTER_PREPARATION_EVIDENCE']);
  }
  return section('BLOCKED', projection.reasons, refs, projection.evidenceHash ? ['VIEW_PREPARATION'] : []);
}

function discretizationSection(stage, adapter, custody) {
  if (!adapter.discretization.applicable) return section('COMPLETE', ['ANALYSIS_MESH_NOT_APPLICABLE'], [], ['VIEW']);
  if (!custody) return section('NOT_STARTED', ['ANALYSIS_MESH_CUSTODY_ABSENT'], [], []);
  const refs = custody.meshHash
    ? [ref('ANALYSIS_MESH', custody.meshHash), ref('ANALYSIS_MESH_PROFILE', custody.meshProfileHash)]
    : [];
  if (custody.state === 'CURRENT_PASS') return section('COMPLETE', [], refs, ['VIEW', 'EXPORT_EVIDENCE']);
  if (custody.state === 'CURRENT_WARNING') {
    return section('WARNING', ['ANALYSIS_MESH_WARNING_REVIEW_REQUIRED'], refs, ['VIEW', 'FOCUS_FINDINGS', 'EXPORT_EVIDENCE']);
  }
  if (custody.state === 'ABSENT') {
    const reasons = custody.absenceReasons?.length ? custody.absenceReasons : ['ANALYSIS_MESH_EVIDENCE_ABSENT'];
    return section('NOT_STARTED', reasons, refs,
      stage.domainFirstProfileActive ? [] : ['IMPORT_AUTHORIZED_MESH']);
  }
  return section('BLOCKED', [
    ...(custody.staleReasons ?? []), ...(custody.invalidReasons ?? []),
    ...(custody.state === 'CURRENT_BLOCK' ? ['ANALYSIS_MESH_QUALITY_BLOCK'] : []),
  ], refs, custody.canView ? ['VIEW', 'EXPORT_EVIDENCE'] : []);
}

function authorizationSection(stage, adapter, readiness, preparation, custody) {
  const reasons = []; const refs = [];
  if (!readiness?.preMeshModelCurrent) {
    reasons.push(stage.domainFirstProfileActive ? 'ANALYSIS_DOMAIN_NOT_CURRENT' : 'CANONICAL_MODEL_NOT_CURRENT');
  }
  if (stage.domainFirstProfileActive && !readiness?.solverModelCurrent) {
    reasons.push('CANONICAL_SOLVER_MODEL_NOT_CURRENT');
  }
  if (!adapter.preparation.qualified) reasons.push(adapter.preparation.reason);
  if (preparation?.usableForAuthorization !== true) {
    reasons.push(...(preparation?.reasons ?? ['LAFEA_PREPARATION_NOT_AUTHORIZED']));
  }
  if (preparation?.evidenceHash) refs.push(ref('PREPARATION_EVIDENCE', preparation.evidenceHash));
  if (preparation?.approvalHash) refs.push(ref('PREPARATION_APPROVAL', preparation.approvalHash));
  if (adapter.discretization.applicable && custody?.usableForAuthorization !== true) {
    reasons.push(`ANALYSIS_MESH_${custody?.state ?? 'ABSENT'}`);
  }
  if (custody?.meshHash) refs.push(ref('ANALYSIS_MESH', custody.meshHash));
  if (reasons.length) return section('BLOCKED', reasons, refs, []);
  return section('READY', [], refs, ['AUTHORIZE_SOLVE']);
}

function executionSection(stage) {
  if (stage.domainFirstProfileActive) return section('NOT_STARTED', ['CANONICAL_SOLVER_MODEL_NOT_COMPILED'], [], []);
  const execution = stage.execution;
  if (!execution) return section('NOT_STARTED', ['EXECUTION_NOT_RUN'], [], []);
  if (execution.status === 'QUALIFIED') return section('COMPLETE', [], [ref('EXECUTION', executionHash(execution))], ['VIEW']);
  return section('BLOCKED', [`EXECUTION_${execution.status ?? 'UNKNOWN'}`], [], []);
}

function resultsSection(stage, readiness) {
  if (stage.domainFirstProfileActive) return section('NOT_STARTED', ['EXECUTION_REQUIRED'], [], []);
  if (readiness?.resultReady) return section('COMPLETE', [], resultRefs(stage.lifecycle), ['VIEW_RESULTS', 'EXPORT_RESULTS']);
  const executed = stage.execution?.status === 'QUALIFIED';
  return section(executed ? 'BLOCKED' : 'NOT_STARTED',
    [executed ? 'RESULT_EVIDENCE_NOT_CURRENT' : 'EXECUTION_REQUIRED'], [], []);
}

function preparationRefs(projection) {
  const refs = [];
  if (projection?.evidenceHash) refs.push(ref('PREPARATION_EVIDENCE', projection.evidenceHash));
  if (projection?.approvalHash) refs.push(ref('PREPARATION_APPROVAL', projection.approvalHash));
  return refs;
}
function modelReasons(readiness, record) {
  const reasons = [...(readiness?.blockingReasons ?? [])];
  if (record?.status && record.status !== 'CURRENT') reasons.push(`CANONICAL_MODEL_${record.status}`);
  if (!reasons.length) reasons.push('CANONICAL_MODEL_NOT_CURRENT');
  return unique(reasons);
}
function sourceRefs(stage) {
  const refs = [ref('DOCUMENT', documentRef(stage))];
  if (stage.lifecycle?.source?.sourceHash) refs.push(ref('SOURCE', stage.lifecycle.source.sourceHash));
  if (stage.sourceAuthority?.sourceHash) refs.push(ref('SOURCE_AUTHORITY', stage.sourceAuthority.sourceHash));
  return refs;
}
function resultRefs(lifecycle) {
  if (!lifecycle?.artifacts) return [];
  return Object.values(lifecycle.artifacts)
    .filter((record) => ['CURRENT', 'BLOCKED'].includes(record.status)
      && ['RESULT_EVIDENCE', 'RECOVERY', 'CONVERGENCE'].includes(record.kind))
    .map((record) => artifactRef(record));
}
function artifactRef(record) { return ref(record.kind, record.artifactHash); }
function ref(kind, identity) { return freeze({ kind, identity: identity ?? null }); }
function section(state, reasons, evidenceRefs, allowedActions) {
  if (!LAFEA_WORKBENCH_ORCHESTRATION_STATES.includes(state)) {
    throw new TypeError('LAFEA_WORKBENCH_ORCHESTRATION_STATE_INVALID');
  }
  return freeze({
    schema: LAFEA_WORKBENCH_ORCHESTRATION_SECTION_SCHEMA,
    state, reasons: unique(reasons), evidenceRefs: [...evidenceRefs],
    allowedActions: unique(allowedActions),
  });
}
function executionHash(execution) { return execution.result?.semanticHash ?? execution.result?.artifactHash ?? execution.canonicalInput?.semanticHash ?? null; }
function documentRef(stage) { return stage.lifecycleBinding?.currentDocumentDigest ?? stage.lifecycleBinding?.boundDocumentDigest ?? null; }
function requireStage(value) { if (!value || typeof value !== 'object' || typeof value.stageId !== 'string') throw new TypeError('LAFEA_WORKBENCH_ORCHESTRATION_STAGE_REQUIRED'); return value; }
function unique(values) { return [...new Set(values.filter((value) => value !== null && value !== undefined))]; }
function freeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.values(value).forEach(freeze); return Object.freeze(value); }
