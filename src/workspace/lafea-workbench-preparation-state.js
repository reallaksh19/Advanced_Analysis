import {
  validateLafeaPreparationApproval,
  validateLafeaPreparationEvidence,
} from './lafea-preparation-contract.js';
import {
  buildLafeaPreparationProjection,
  buildLafeaPreparationRequestFromStage,
} from './lafea-preparation-projection.js';

export function createLafeaWorkbenchPreparationState(stageIds) {
  const evidenceByStage = new Map(stageIds.map((stageId) => [stageId, null]));
  const approvalByStage = new Map(stageIds.map((stageId) => [stageId, null]));

  function fields(stageId) {
    requireStage(stageId);
    return freeze({
      retainedPreparationEvidence: evidenceByStage.get(stageId),
      retainedPreparationApproval: approvalByStage.get(stageId),
    });
  }

  function buildRequest(stageState, requestedCaseIds = []) {
    return buildLafeaPreparationRequestFromStage(stageState, requestedCaseIds);
  }

  function registerEvidence(value) {
    const evidence = validateLafeaPreparationEvidence(value);
    const stageId = evidence.request.stageId;
    requireStage(stageId);
    const current = evidenceByStage.get(stageId);
    if (current?.semanticHash === evidence.semanticHash) return freeze({ changed: false, evidence: current });
    if (current?.request?.semanticHash === evidence.request.semanticHash) {
      throw stateError('LAFEA_PREPARATION_CONFLICTING_REPLAY');
    }
    evidenceByStage.set(stageId, evidence);
    approvalByStage.set(stageId, null);
    return freeze({ changed: true, evidence });
  }

  function registerApproval(value) {
    const approval = validateLafeaPreparationApproval(value);
    requireStage(approval.stageId);
    const evidence = evidenceByStage.get(approval.stageId);
    if (!evidence || evidence.semanticHash !== approval.preparationEvidenceHash) {
      throw stateError('LAFEA_PREPARATION_APPROVAL_EVIDENCE_NOT_RETAINED');
    }
    const conditionalIds = evidence.findings.filter((row) => row.disposition === 'CONDITIONAL')
      .map((row) => row.findingId);
    const blockingIds = evidence.findings.filter((row) => row.disposition === 'BLOCK')
      .map((row) => row.findingId);
    if (approval.warningFindingIds.some((id) => blockingIds.includes(id))) {
      throw stateError('LAFEA_PREPARATION_APPROVAL_BLOCKING_FINDING');
    }
    if (approval.warningFindingIds.some((id) => !conditionalIds.includes(id))) {
      throw stateError('LAFEA_PREPARATION_APPROVAL_UNKNOWN_WARNING_ID');
    }
    const current = approvalByStage.get(approval.stageId);
    if (current?.semanticHash === approval.semanticHash) return freeze({ changed: false, approval: current });
    if (current?.preparationEvidenceHash === approval.preparationEvidenceHash) {
      throw stateError('LAFEA_PREPARATION_APPROVAL_CONFLICTING_REPLAY');
    }
    approvalByStage.set(approval.stageId, approval);
    return freeze({ changed: true, approval });
  }

  function selectEvidence(stageId) { requireStage(stageId); return evidenceByStage.get(stageId); }
  function selectApproval(stageId) { requireStage(stageId); return approvalByStage.get(stageId); }
  function buildProjection(stageState) {
    return buildLafeaPreparationProjection(
      stageState,
      evidenceByStage.get(stageState.stageId),
      approvalByStage.get(stageState.stageId),
    );
  }
  function requireStage(stageId) { if (!evidenceByStage.has(stageId)) throw stateError('LAFEA_PREPARATION_STAGE_NOT_FOUND'); }
  return Object.freeze({ fields, buildRequest, registerEvidence, registerApproval, selectEvidence, selectApproval, buildProjection });
}

function stateError(code) { const error = new TypeError(code); error.code = code; return error; }
function freeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.values(value).forEach(freeze); return Object.freeze(value); }
