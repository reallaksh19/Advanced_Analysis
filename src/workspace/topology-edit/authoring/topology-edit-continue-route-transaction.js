import { deepFreeze, semanticHash } from '../../../core/shared-piping-model/index.js';
import { TopologyEditCertifiedSession } from '../topology-edit-certified-session.js';
import {
  assertContinueRouteCandidate,
  recreateContinueRouteCandidate,
} from './topology-edit-continue-route-candidate.js';
import { assertContinueRoutePlan, CONTINUE_ROUTE_PLAN_SCHEMA } from './topology-edit-continue-route-plan.js';
import {
  assertContinueRouteFittedPlan,
  CONTINUE_ROUTE_FITTED_PLAN_SCHEMA,
} from './topology-edit-continue-route-fitted-plan.js';

export const CONTINUE_ROUTE_PREVIEW_SCHEMA = 'TopologyEditContinueRoutePreview.v2';
export const CONTINUE_ROUTE_VALIDATION_SCHEMA = 'TopologyEditContinueRouteValidation.v2';
export const CONTINUE_ROUTE_TRANSACTION_SCHEMA = 'TopologyEditContinueRouteTransaction.v2';
export const CONTINUE_ROUTE_CANCEL_SCHEMA = 'TopologyEditContinueRouteCancel.v2';

function fail(message, Constructor = RangeError) {
  throw new Constructor(`TopologyEditContinueRouteTransaction: ${message}`);
}
function executablePlan(value) {
  if (value?.schema === CONTINUE_ROUTE_FITTED_PLAN_SCHEMA) return assertContinueRouteFittedPlan(value);
  if (value?.schema === CONTINUE_ROUTE_PLAN_SCHEMA) return assertContinueRoutePlan(value);
  fail('plan is not a Continue Route raw or fitted plan.', TypeError);
}
function assertSession(value) {
  if (!(value instanceof TopologyEditCertifiedSession)) fail('session must be a TopologyEditCertifiedSession.', TypeError);
  value.assertUsable();
  return value;
}
function sortedDiagnostics(value = []) {
  if (!Array.isArray(value)) fail('diagnostics must be an array.', TypeError);
  return value.map((row, index) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) fail(`diagnostics[${index}] must be an object.`, TypeError);
    return {
      code: String(row.code ?? '').trim().toUpperCase(),
      severity: String(row.severity ?? '').trim().toUpperCase(),
      message: String(row.message ?? '').trim(),
      targetIds: [...(row.targetIds ?? [])].map(String).sort(),
    };
  }).sort((left, right) => semanticHash(left).localeCompare(semanticHash(right)));
}
function assertCurrentPreview(session, preview) {
  if (session.journal.sessionVersion !== preview.priorSessionVersion
    || session.journal.journalHash !== preview.priorJournalHash
    || session.currentTopology().canonicalTopologyHash !== preview.priorCanonicalHash) {
    fail('Continue Route preview is stale for current certified session.');
  }
}

export function createContinueRoutePreview({ plan: input, candidate: candidateInput } = {}) {
  const plan = executablePlan(input);
  const candidate = assertContinueRouteCandidate(candidateInput);
  if (candidate.planHash !== plan.planHash) fail('candidate differs from plan.');
  const material = {
    schema: CONTINUE_ROUTE_PREVIEW_SCHEMA,
    planHash: plan.planHash,
    candidateHash: candidate.candidateHash,
    segmentCount: candidate.segmentCount,
    nodeCount: candidate.nodeCount,
    bendCount: candidate.bendCount,
    commandCount: candidate.commandCount,
    priorSessionVersion: candidate.priorSessionVersion,
    priorJournalHash: candidate.priorJournalHash,
    priorCanonicalHash: candidate.priorCanonicalHash,
    resultingJournalHash: candidate.resultingJournalHash,
    resultingCanonicalHash: candidate.resultingCanonicalHash,
    graphExecutionHash: candidate.graphExecutionHash,
    ghostAuthority: 'DISPLAY_ONLY_CANDIDATE_TOPOLOGY',
  };
  return deepFreeze({ ...material, previewHash: semanticHash(material) });
}
export function assertContinueRoutePreview(value) {
  if (value?.schema !== CONTINUE_ROUTE_PREVIEW_SCHEMA) fail(`preview must use ${CONTINUE_ROUTE_PREVIEW_SCHEMA}.`, TypeError);
  const material = { ...value }; delete material.previewHash;
  if (semanticHash(material) !== value.previewHash) fail('preview hash mismatch.');
  return value;
}

export function createContinueRouteValidation({ candidate: input, diagnostics = [] } = {}) {
  const candidate = assertContinueRouteCandidate(input);
  const normalized = sortedDiagnostics(diagnostics);
  const blocking = normalized.filter((row) => row.severity === 'HIGH');
  const material = {
    schema: CONTINUE_ROUTE_VALIDATION_SCHEMA,
    candidateHash: candidate.candidateHash,
    validatedTopologyHash: candidate.resultingCanonicalHash,
    diagnosticHash: semanticHash(normalized),
    diagnosticCount: normalized.length,
    blockingIssueCount: blocking.length,
    status: blocking.length ? 'BLOCKED' : 'READY_TO_APPLY',
  };
  return deepFreeze({ ...material, validationHash: semanticHash(material), diagnostics: normalized });
}
export function assertContinueRouteValidation(value) {
  if (value?.schema !== CONTINUE_ROUTE_VALIDATION_SCHEMA) fail(`validation must use ${CONTINUE_ROUTE_VALIDATION_SCHEMA}.`, TypeError);
  const material = { ...value }; delete material.validationHash; delete material.diagnostics;
  if (semanticHash(material) !== value.validationHash || semanticHash(value.diagnostics) !== value.diagnosticHash) {
    fail('validation hash mismatch.');
  }
  return value;
}

export async function executeContinueRouteTransaction({
  session: sessionInput, plan: input, candidate: candidateInput,
  preview: previewInput, validation: validationInput, catalogue,
} = {}) {
  const session = assertSession(sessionInput);
  const plan = executablePlan(input);
  const candidate = assertContinueRouteCandidate(candidateInput);
  const preview = assertContinueRoutePreview(previewInput);
  const validation = assertContinueRouteValidation(validationInput);
  assertCurrentPreview(session, preview);
  if (preview.planHash !== plan.planHash || preview.candidateHash !== candidate.candidateHash
    || validation.candidateHash !== candidate.candidateHash
    || validation.validatedTopologyHash !== candidate.resultingCanonicalHash) {
    fail('preview, validation, plan, and candidate authority differ.');
  }
  if (validation.status !== 'READY_TO_APPLY' || validation.blockingIssueCount !== 0) {
    fail('Continue Route validation is blocking.');
  }
  const recreated = await recreateContinueRouteCandidate({ plan, candidate, session, catalogue });
  const prior = session.snapshot();
  session.reloadJournal(recreated.serializedJournal);
  if (session.journal.journalHash !== recreated.resultingJournalHash
    || session.currentTopology().canonicalTopologyHash !== recreated.resultingCanonicalHash) {
    fail('applied journal differs from certified candidate.');
  }
  const material = {
    schema: CONTINUE_ROUTE_TRANSACTION_SCHEMA,
    planHash: plan.planHash,
    previewHash: preview.previewHash,
    validationHash: validation.validationHash,
    candidateHash: recreated.candidateHash,
    segmentCount: recreated.segmentCount,
    nodeCount: recreated.nodeCount,
    bendCount: recreated.bendCount,
    commandCount: recreated.commandCount,
    priorSessionVersion: prior.sessionVersion,
    priorJournalHash: prior.journalHash,
    priorCanonicalHash: prior.activeCanonicalTopologyHash,
    resultingSessionVersion: session.journal.sessionVersion,
    resultingJournalHash: session.journal.journalHash,
    resultingCanonicalHash: session.currentTopology().canonicalTopologyHash,
    commandIds: recreated.commandIds,
  };
  return deepFreeze({ ...material, transactionHash: semanticHash(material) });
}
export function assertContinueRouteTransaction(value) {
  if (value?.schema !== CONTINUE_ROUTE_TRANSACTION_SCHEMA) fail(`transaction must use ${CONTINUE_ROUTE_TRANSACTION_SCHEMA}.`, TypeError);
  const material = { ...value }; delete material.transactionHash;
  if (semanticHash(material) !== value.transactionHash
    || value.commandCount !== value.segmentCount * 2 + value.bendCount
    || value.nodeCount !== value.segmentCount || value.commandIds?.length !== value.commandCount) {
    fail('transaction payload differs from immutable authority.');
  }
  return value;
}

export function cancelContinueRoutePreview({ preview: input, session: sessionInput } = {}) {
  const preview = assertContinueRoutePreview(input);
  const session = assertSession(sessionInput);
  assertCurrentPreview(session, preview);
  const material = {
    schema: CONTINUE_ROUTE_CANCEL_SCHEMA,
    previewHash: preview.previewHash,
    priorJournalHash: preview.priorJournalHash,
    resultingJournalHash: session.journal.journalHash,
    priorCanonicalHash: preview.priorCanonicalHash,
    resultingCanonicalHash: session.currentTopology().canonicalTopologyHash,
    disposition: 'CANCELLED_NO_AUTHORITY_CHANGE',
  };
  return deepFreeze({ ...material, cancelHash: semanticHash(material) });
}

export function undoContinueRouteTransaction(sessionInput, transactionInput) {
  const session = assertSession(sessionInput);
  const transaction = assertContinueRouteTransaction(transactionInput);
  if (session.currentTopology().canonicalTopologyHash !== transaction.resultingCanonicalHash) {
    fail('transaction is not the current canonical suffix.');
  }
  if (semanticHash(session.journal.activeCommandIds.slice(-transaction.commandCount)) !== semanticHash(transaction.commandIds)) {
    fail('transaction commands are not the exact active journal suffix.');
  }
  for (let index = 0; index < transaction.commandCount; index += 1) session.undo();
  if (session.currentTopology().canonicalTopologyHash !== transaction.priorCanonicalHash) {
    fail('undo did not restore the exact prior canonical hash.');
  }
  return session.snapshot();
}
export function redoContinueRouteTransaction(sessionInput, transactionInput) {
  const session = assertSession(sessionInput);
  const transaction = assertContinueRouteTransaction(transactionInput);
  if (session.currentTopology().canonicalTopologyHash !== transaction.priorCanonicalHash) {
    fail('transaction prior canonical hash is not current.');
  }
  const redoIds = session.journal.redoCommandIds.slice(-transaction.commandCount).reverse();
  if (semanticHash(redoIds) !== semanticHash(transaction.commandIds)) {
    fail('transaction commands are not the exact redo journal suffix.');
  }
  for (let index = 0; index < transaction.commandCount; index += 1) session.redo();
  if (session.currentTopology().canonicalTopologyHash !== transaction.resultingCanonicalHash) {
    fail('redo did not reproduce the exact resulting canonical hash.');
  }
  return session.snapshot();
}
