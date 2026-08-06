import { deepFreeze, semanticHash } from '../../../core/shared-piping-model/index.js';
import { TopologyEditCertifiedSession } from '../topology-edit-certified-session.js';
import {
  assertStartRouteCandidate,
  recreateStartRouteCandidate,
} from './topology-edit-start-route-candidate.js';
import { assertStartRoutePlan } from './topology-edit-start-route-plan.js';

export const START_ROUTE_PREVIEW_SCHEMA = 'TopologyEditStartRoutePreview.v2';
export const START_ROUTE_VALIDATION_SCHEMA = 'TopologyEditStartRouteValidation.v2';
export const START_ROUTE_TRANSACTION_SCHEMA = 'TopologyEditStartRouteTransaction.v2';
export const START_ROUTE_CANCEL_SCHEMA = 'TopologyEditStartRouteCancel.v2';

function fail(message, Constructor = RangeError) {
  throw new Constructor(`TopologyEditStartRouteTransaction: ${message}`);
}
function assertSession(value) {
  if (!(value instanceof TopologyEditCertifiedSession)) {
    fail('session must be a TopologyEditCertifiedSession.', TypeError);
  }
  value.assertUsable();
  return value;
}
function sortedDiagnostics(value = []) {
  if (!Array.isArray(value)) fail('diagnostics must be an array.', TypeError);
  return value.map((row, index) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      fail(`diagnostics[${index}] must be an object.`, TypeError);
    }
    return {
      code: String(row.code ?? '').trim().toUpperCase(),
      severity: String(row.severity ?? '').trim().toUpperCase(),
      message: String(row.message ?? '').trim(),
      targetIds: [...(row.targetIds ?? [])].map(String).sort(),
    };
  }).sort((left, right) => semanticHash(left).localeCompare(semanticHash(right)));
}

export function createStartRoutePreview({ plan: input, candidate: candidateInput } = {}) {
  const plan = assertStartRoutePlan(input);
  const candidate = assertStartRouteCandidate(candidateInput);
  if (candidate.planHash !== plan.planHash) fail('candidate differs from plan.');
  const material = {
    schema: START_ROUTE_PREVIEW_SCHEMA,
    planHash: plan.planHash,
    candidateHash: candidate.candidateHash,
    priorSessionVersion: candidate.priorSessionVersion,
    priorJournalHash: candidate.priorJournalHash,
    priorCanonicalHash: candidate.priorCanonicalHash,
    resultingJournalHash: candidate.resultingJournalHash,
    resultingCanonicalHash: candidate.resultingCanonicalHash,
    catalogueHash: candidate.catalogueHash,
    graphExecutionHash: candidate.graphExecutionHash,
    materializedCommandHash: candidate.materializedCommandHash,
    operationBindingsHash: candidate.operationBindingsHash,
    ghostAuthority: 'DISPLAY_ONLY_CANDIDATE_TOPOLOGY',
  };
  return deepFreeze({ ...material, previewHash: semanticHash(material) });
}

export function assertStartRoutePreview(value) {
  if (value?.schema !== START_ROUTE_PREVIEW_SCHEMA) {
    fail(`preview must use ${START_ROUTE_PREVIEW_SCHEMA}.`, TypeError);
  }
  const material = { ...value };
  delete material.previewHash;
  if (semanticHash(material) !== value.previewHash) fail('preview hash mismatch.');
  return value;
}

export function createStartRouteValidation({ candidate: input, diagnostics = [] } = {}) {
  const candidate = assertStartRouteCandidate(input);
  const normalized = sortedDiagnostics(diagnostics);
  const blocking = normalized.filter((row) => row.severity === 'HIGH');
  const material = {
    schema: START_ROUTE_VALIDATION_SCHEMA,
    candidateHash: candidate.candidateHash,
    validatedTopologyHash: candidate.resultingCanonicalHash,
    diagnosticHash: semanticHash(normalized),
    diagnosticCount: normalized.length,
    blockingIssueCount: blocking.length,
    status: blocking.length ? 'BLOCKED' : 'READY_TO_APPLY',
  };
  return deepFreeze({
    ...material,
    validationHash: semanticHash(material),
    diagnostics: normalized,
  });
}

export function assertStartRouteValidation(value) {
  if (value?.schema !== START_ROUTE_VALIDATION_SCHEMA) {
    fail(`validation must use ${START_ROUTE_VALIDATION_SCHEMA}.`, TypeError);
  }
  const material = { ...value };
  delete material.validationHash;
  delete material.diagnostics;
  if (semanticHash(material) !== value.validationHash
    || semanticHash(value.diagnostics) !== value.diagnosticHash) {
    fail('validation hash mismatch.');
  }
  return value;
}

export async function executeStartRouteTransaction({
  session: sessionInput,
  plan: input,
  candidate: candidateInput,
  preview: previewInput,
  validation: validationInput,
  catalogue,
} = {}) {
  const session = assertSession(sessionInput);
  const plan = assertStartRoutePlan(input);
  const candidate = assertStartRouteCandidate(candidateInput);
  const preview = assertStartRoutePreview(previewInput);
  const validation = assertStartRouteValidation(validationInput);
  if (session.journal.sessionVersion !== preview.priorSessionVersion
    || session.journal.journalHash !== preview.priorJournalHash
    || session.currentTopology().canonicalTopologyHash !== preview.priorCanonicalHash) {
    fail('Start Route preview is stale for current certified session.');
  }
  if (preview.planHash !== plan.planHash
    || preview.candidateHash !== candidate.candidateHash
    || validation.candidateHash !== candidate.candidateHash
    || validation.validatedTopologyHash !== candidate.resultingCanonicalHash) {
    fail('preview, validation, plan, and candidate authority differ.');
  }
  if (validation.status !== 'READY_TO_APPLY' || validation.blockingIssueCount !== 0) {
    fail('Start Route validation is blocking.');
  }
  const recreated = await recreateStartRouteCandidate({
    plan,
    candidate,
    session,
    catalogue,
  });
  const prior = session.snapshot();
  session.reloadJournal(recreated.serializedJournal);
  if (session.journal.journalHash !== recreated.resultingJournalHash
    || session.currentTopology().canonicalTopologyHash !== recreated.resultingCanonicalHash) {
    fail('applied journal differs from certified candidate.');
  }
  const material = {
    schema: START_ROUTE_TRANSACTION_SCHEMA,
    planHash: plan.planHash,
    previewHash: preview.previewHash,
    validationHash: validation.validationHash,
    candidateHash: recreated.candidateHash,
    priorSessionVersion: prior.sessionVersion,
    priorJournalHash: prior.journalHash,
    priorCanonicalHash: prior.activeCanonicalTopologyHash,
    resultingSessionVersion: session.journal.sessionVersion,
    resultingJournalHash: session.journal.journalHash,
    resultingCanonicalHash: session.currentTopology().canonicalTopologyHash,
    commandIds: recreated.commandIds,
    requestHashes: recreated.requestHashes,
    resolutionHashes: recreated.resolutionHashes,
    certificationHashes: recreated.certificationHashes,
    candidateDraftHashes: recreated.candidateDraftHashes,
    commandCount: recreated.commandIds.length,
  };
  return deepFreeze({ ...material, transactionHash: semanticHash(material) });
}

export function assertStartRouteTransaction(value) {
  if (value?.schema !== START_ROUTE_TRANSACTION_SCHEMA) {
    fail(`transaction must use ${START_ROUTE_TRANSACTION_SCHEMA}.`, TypeError);
  }
  const material = { ...value };
  delete material.transactionHash;
  if (semanticHash(material) !== value.transactionHash) fail('transaction hash mismatch.');
  const arrays = [
    value.commandIds,
    value.requestHashes,
    value.resolutionHashes,
    value.certificationHashes,
    value.candidateDraftHashes,
  ];
  if (value.commandCount !== 3 || arrays.some((rows) => rows?.length !== 3)) {
    fail('Start Route transaction must contain exactly three certified commands.');
  }
  return value;
}

export function cancelStartRoutePreview({ preview: input, session: sessionInput } = {}) {
  const preview = assertStartRoutePreview(input);
  const session = assertSession(sessionInput);
  if (session.journal.sessionVersion !== preview.priorSessionVersion
    || session.journal.journalHash !== preview.priorJournalHash
    || session.currentTopology().canonicalTopologyHash !== preview.priorCanonicalHash) {
    fail('cannot cancel a stale preview.');
  }
  const material = {
    schema: START_ROUTE_CANCEL_SCHEMA,
    previewHash: preview.previewHash,
    priorJournalHash: preview.priorJournalHash,
    resultingJournalHash: session.journal.journalHash,
    priorCanonicalHash: preview.priorCanonicalHash,
    resultingCanonicalHash: session.currentTopology().canonicalTopologyHash,
    disposition: 'CANCELLED_NO_AUTHORITY_CHANGE',
  };
  return deepFreeze({ ...material, cancelHash: semanticHash(material) });
}

export function undoStartRouteTransaction(sessionInput, transactionInput) {
  const session = assertSession(sessionInput);
  const transaction = assertStartRouteTransaction(transactionInput);
  if (session.currentTopology().canonicalTopologyHash !== transaction.resultingCanonicalHash) {
    fail('transaction is not the current canonical suffix.');
  }
  if (semanticHash(session.journal.activeCommandIds.slice(-3))
    !== semanticHash(transaction.commandIds)) {
    fail('transaction commands are not the exact active journal suffix.');
  }
  for (let index = 0; index < 3; index += 1) session.undo();
  if (session.currentTopology().canonicalTopologyHash !== transaction.priorCanonicalHash) {
    fail('undo did not restore the exact prior canonical hash.');
  }
  return session.snapshot();
}

export function redoStartRouteTransaction(sessionInput, transactionInput) {
  const session = assertSession(sessionInput);
  const transaction = assertStartRouteTransaction(transactionInput);
  if (session.currentTopology().canonicalTopologyHash !== transaction.priorCanonicalHash) {
    fail('transaction prior canonical hash is not current.');
  }
  const redoIds = session.journal.redoCommandIds.slice(-3).reverse();
  if (semanticHash(redoIds) !== semanticHash(transaction.commandIds)) {
    fail('transaction commands are not the exact redo journal suffix.');
  }
  for (let index = 0; index < 3; index += 1) session.redo();
  if (session.currentTopology().canonicalTopologyHash !== transaction.resultingCanonicalHash) {
    fail('redo did not reproduce the exact resulting canonical hash.');
  }
  return session.snapshot();
}
