import {
  createLafeaPreparationRequest,
  validateLafeaPreparationApproval,
  validateLafeaPreparationEvidence,
} from './lafea-preparation-contract.js';
import { requireLafeaPreparationProfile } from './lafea-preparation-profile.js';
import { requireLafeaStageAnalysisAdapter } from './lafea-stage-analysis-adapter.js';

export const LAFEA_PREPARATION_PROJECTION_SCHEMA = 'lafea-preparation-projection/v1';
export const LAFEA_PREPARATION_PROJECTION_STATES = Object.freeze([
  'NOT_APPLICABLE', 'ABSENT', 'STALE', 'CURRENT_PASS', 'CURRENT_WARNING',
  'CURRENT_BLOCK', 'INVALID',
]);

export function buildLafeaPreparationRequestFromStage(stageValue, requestedCaseIds = []) {
  const stage = requireStage(stageValue);
  const adapter = requireLafeaStageAnalysisAdapter(stage.stageId);
  const profile = requireLafeaPreparationProfile(stage.stageId);
  const reasons = currentParentReasons(stage, profile);
  if (reasons.length) fail('LAFEA_PREPARATION_REQUEST_STAGE_NOT_CURRENT', { reasons });
  const model = stage.lifecycle.artifacts.CANONICAL_MODEL;
  const geometry = stage.lifecycle.artifacts.ANALYSIS_GEOMETRY;
  return createLafeaPreparationRequest({
    stageId: stage.stageId,
    sourceHash: stage.lifecycle.source.sourceHash,
    canonicalModelHash: model.artifactHash,
    analysisGeometryHash: profile.analysisGeometryRequired ? geometry.artifactHash : null,
    preparationProfileId: profile.profileId,
    preparationProfileHash: profile.semanticHash,
    requestedCaseIds,
    stageAdapterId: adapter.adapterId,
  });
}

export function buildLafeaPreparationProjection(stageValue, retainedEvidence, retainedApproval = null) {
  const stage = requireStage(stageValue);
  const adapter = requireLafeaStageAnalysisAdapter(stage.stageId);
  const profile = requireLafeaPreparationProfile(stage.stageId);
  if (adapter.engineState !== 'QUALIFIED_ROUTE_REGISTERED') {
    return projection(stage.stageId, 'NOT_APPLICABLE', false, [
      'STAGE_ENGINE_NOT_IMPLEMENTED',
    ], null, null, [], []);
  }
  if (!retainedEvidence) return projection(stage.stageId, 'ABSENT', false, [
    profile.missingProducerReason,
    'LAFEA_PREPARATION_EVIDENCE_ABSENT',
  ], null, null, [], []);

  let evidence;
  try { evidence = validateLafeaPreparationEvidence(retainedEvidence); } catch (error) {
    return projection(stage.stageId, 'INVALID', false, [
      error.code ?? 'LAFEA_PREPARATION_EVIDENCE_INVALID',
    ], null, null, [], []);
  }
  const currentReasons = currentEvidenceReasons(stage, adapter, profile, evidence);
  if (currentReasons.length) return projection(stage.stageId, 'STALE', false,
    currentReasons, evidence, null, warningIds(evidence), blockingIds(evidence));

  const policyReasons = [];
  if (!profile.producerQualified || evidence.producerRef !== profile.qualifiedProducerRef) {
    policyReasons.push(profile.missingProducerReason);
  }
  for (const capabilityId of profile.requiredCapabilityIds) {
    if (!evidence.capabilityIds.includes(capabilityId)) {
      policyReasons.push(`LAFEA_PREPARATION_CAPABILITY_MISSING:${capabilityId}`);
    }
  }
  if (evidence.status === 'BLOCK') policyReasons.push('LAFEA_PREPARATION_FINDINGS_BLOCK');
  if (policyReasons.length) return projection(stage.stageId, 'CURRENT_BLOCK', false,
    policyReasons, evidence, null, warningIds(evidence), blockingIds(evidence));

  if (evidence.status === 'PASS') return projection(stage.stageId, 'CURRENT_PASS', true,
    [], evidence, null, [], []);

  const conditional = evidence.findings.filter((row) => row.disposition === 'CONDITIONAL');
  if (!conditional.length) return projection(stage.stageId, 'CURRENT_WARNING', true,
    ['LAFEA_PREPARATION_ADVISORY_FINDINGS'], evidence, null, warningIds(evidence), []);

  const approvalResult = evaluateApproval(stage.stageId, evidence, retainedApproval, profile, conditional);
  return projection(stage.stageId, approvalResult.usable ? 'CURRENT_WARNING' : 'CURRENT_BLOCK',
    approvalResult.usable, approvalResult.reasons, evidence, approvalResult.approval,
    warningIds(evidence), []);
}

function evaluateApproval(stageId, evidence, retainedApproval, profile, conditional) {
  if (!retainedApproval) return { usable: false, reasons: ['LAFEA_PREPARATION_APPROVAL_REQUIRED'], approval: null };
  let approval;
  try { approval = validateLafeaPreparationApproval(retainedApproval); } catch (error) {
    return { usable: false, reasons: [error.code ?? 'LAFEA_PREPARATION_APPROVAL_INVALID'], approval: null };
  }
  const reasons = [];
  if (approval.stageId !== stageId) reasons.push('LAFEA_PREPARATION_APPROVAL_STAGE_MISMATCH');
  if (approval.preparationEvidenceHash !== evidence.semanticHash) reasons.push('LAFEA_PREPARATION_APPROVAL_STALE');
  const ids = conditional.map((row) => row.findingId).sort(compare);
  if (JSON.stringify(approval.warningFindingIds) !== JSON.stringify(ids)) reasons.push('LAFEA_PREPARATION_APPROVAL_WARNING_SET_MISMATCH');
  for (const row of conditional) {
    if (!row.authorizationRequired) continue;
    if (!profile.allowedConditionalFindingCodes.includes(row.code)) {
      reasons.push(`LAFEA_PREPARATION_APPROVAL_CODE_NOT_ALLOWED:${row.code}`);
    }
  }
  return { usable: reasons.length === 0, reasons, approval };
}

function currentEvidenceReasons(stage, adapter, profile, evidence) {
  const reasons = currentParentReasons(stage, profile);
  const request = evidence.request;
  const model = stage.lifecycle?.artifacts?.CANONICAL_MODEL;
  const geometry = stage.lifecycle?.artifacts?.ANALYSIS_GEOMETRY;
  if (request.stageId !== stage.stageId) reasons.push('LAFEA_PREPARATION_STAGE_MISMATCH');
  if (request.stageAdapterId !== adapter.adapterId) reasons.push('LAFEA_PREPARATION_STAGE_ADAPTER_STALE');
  if (request.preparationProfileId !== profile.profileId
    || request.preparationProfileHash !== profile.semanticHash) reasons.push('LAFEA_PREPARATION_PROFILE_STALE');
  if (request.sourceHash !== stage.lifecycle?.source?.sourceHash) reasons.push('LAFEA_PREPARATION_SOURCE_STALE');
  if (request.canonicalModelHash !== model?.artifactHash) reasons.push('LAFEA_PREPARATION_MODEL_STALE');
  if (request.analysisGeometryHash !== (profile.analysisGeometryRequired ? geometry?.artifactHash : null)) {
    reasons.push('LAFEA_PREPARATION_GEOMETRY_STALE');
  }
  return unique(reasons);
}

function currentParentReasons(stage, profile) {
  const reasons = [];
  const lifecycle = stage.lifecycle;
  const model = lifecycle?.artifacts?.CANONICAL_MODEL;
  const geometry = lifecycle?.artifacts?.ANALYSIS_GEOMETRY;
  if (stage.lifecycleBinding?.status !== 'CURRENT') reasons.push(`LIFECYCLE_SOURCE_BINDING_${stage.lifecycleBinding?.status ?? 'UNKNOWN'}`);
  if (lifecycle?.source?.status !== 'CURRENT') reasons.push(`LIFECYCLE_SOURCE_${lifecycle?.source?.status ?? 'ABSENT'}`);
  if (model?.status !== 'CURRENT' || model?.qualification !== 'PASS') reasons.push('CANONICAL_MODEL_NOT_CURRENT');
  if (model?.parentHashes?.sourceHash !== lifecycle?.source?.sourceHash) reasons.push('CANONICAL_MODEL_SOURCE_PARENT_MISMATCH');
  if (profile.analysisGeometryRequired) {
    if (geometry?.status !== 'CURRENT' || geometry?.qualification !== 'PASS') reasons.push('ANALYSIS_GEOMETRY_NOT_CURRENT');
    if (geometry?.parentHashes?.sourceHash !== lifecycle?.source?.sourceHash
      || geometry?.parentHashes?.canonicalModelHash !== model?.artifactHash) reasons.push('ANALYSIS_GEOMETRY_PARENT_MISMATCH');
  }
  return unique(reasons);
}

function projection(stageId, state, usable, reasons, evidence, approval, warningFindingIds, blockingFindingIds) {
  return freeze({
    schema: LAFEA_PREPARATION_PROJECTION_SCHEMA,
    stageId,
    state,
    usableForAuthorization: usable,
    reasons: unique(reasons),
    evidenceHash: evidence?.semanticHash ?? null,
    approvalHash: approval?.semanticHash ?? null,
    producerRef: evidence?.producerRef ?? null,
    preparationProfileHash: evidence?.request?.preparationProfileHash ?? null,
    warningFindingIds: [...warningFindingIds],
    blockingFindingIds: [...blockingFindingIds],
  });
}
function warningIds(evidence) { return evidence.findings.filter((row) => ['ADVISORY', 'CONDITIONAL'].includes(row.disposition)).map((row) => row.findingId); }
function blockingIds(evidence) { return evidence.findings.filter((row) => row.disposition === 'BLOCK').map((row) => row.findingId); }
function requireStage(value) { if (!value || typeof value !== 'object' || typeof value.stageId !== 'string') fail('LAFEA_PREPARATION_STAGE_REQUIRED'); return value; }
function unique(values) { return [...new Set(values.filter(Boolean))]; }
function compare(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
function fail(code, data = {}) { const error = new TypeError(code); error.code = code; error.data = data; throw error; }
function freeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.values(value).forEach(freeze); return Object.freeze(value); }
