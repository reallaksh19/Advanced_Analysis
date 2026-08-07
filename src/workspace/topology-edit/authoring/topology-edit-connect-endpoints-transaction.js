import { deepFreeze, semanticHash } from '../../../core/shared-piping-model/index.js';
import { TopologyEditCertifiedSession } from '../topology-edit-certified-session.js';
import {
  assertConnectEndpointsCandidate,
  recreateConnectEndpointsCandidate,
} from './topology-edit-connect-endpoints-candidate.js';
import { assertConnectEndpointsOperation } from './topology-edit-connect-endpoints-operation.js';

export const CONNECT_ENDPOINTS_PREVIEW_SCHEMA = 'TopologyEditConnectEndpointsPreview.v1';
export const CONNECT_ENDPOINTS_VALIDATION_SCHEMA = 'TopologyEditConnectEndpointsValidation.v1';
export const CONNECT_ENDPOINTS_TRANSACTION_SCHEMA = 'TopologyEditConnectEndpointsTransaction.v1';
export const CONNECT_ENDPOINTS_CANCEL_SCHEMA = 'TopologyEditConnectEndpointsCancel.v1';

function fail(message, Constructor = RangeError) {
  throw new Constructor(`TopologyEditConnectEndpointsTransaction: ${message}`);
}
function assertSession(value) {
  if (!(value instanceof TopologyEditCertifiedSession)) fail('session must be a TopologyEditCertifiedSession.', TypeError);
  value.assertUsable(); return value;
}
function diagnostics(value = []) {
  if (!Array.isArray(value)) fail('diagnostics must be an array.', TypeError);
  return value.map((row, index) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) fail(`diagnostics[${index}] must be an object.`, TypeError);
    return {
      code: String(row.code ?? '').trim().toUpperCase(),
      severity: String(row.severity ?? '').trim().toUpperCase(),
      message: String(row.message ?? '').trim(),
      targetIds: [...(row.targetIds ?? [])].map(String).sort(),
    };
  }).sort((a, b) => semanticHash(a).localeCompare(semanticHash(b)));
}
function assertCurrent(session, candidate) {
  if (session.journal.sessionVersion !== candidate.priorSessionVersion
    || session.journal.journalHash !== candidate.priorJournalHash
    || session.currentTopology().canonicalTopologyHash !== candidate.priorCanonicalHash) {
    fail('connection candidate is stale for current certified session.');
  }
}

export function createConnectEndpointsPreview({ operation: operationInput, candidate: candidateInput } = {}) {
  const operation = assertConnectEndpointsOperation(operationInput);
  const candidate = assertConnectEndpointsCandidate(candidateInput);
  if (candidate.operationHash !== operation.operationHash) fail('candidate differs from operation.');
  const material = {
    schema: CONNECT_ENDPOINTS_PREVIEW_SCHEMA,
    operationHash: operation.operationHash,
    candidateHash: candidate.candidateHash,
    alternativeHash: operation.alternativeHash,
    segmentCount: candidate.segmentCount,
    newNodeCount: candidate.newNodeCount,
    bendCount: candidate.bendCount,
    commandCount: candidate.commandCount,
    priorSessionVersion: candidate.priorSessionVersion,
    priorJournalHash: candidate.priorJournalHash,
    priorCanonicalHash: candidate.priorCanonicalHash,
    resultingJournalHash: candidate.resultingJournalHash,
    resultingCanonicalHash: candidate.resultingCanonicalHash,
    ghostAuthority: 'DISPLAY_ONLY_CANDIDATE_TOPOLOGY',
  };
  return deepFreeze({ ...material, previewHash: semanticHash(material) });
}
export function assertConnectEndpointsPreview(value) {
  if (value?.schema !== CONNECT_ENDPOINTS_PREVIEW_SCHEMA) fail(`preview must use ${CONNECT_ENDPOINTS_PREVIEW_SCHEMA}.`, TypeError);
  const material = { ...value }; delete material.previewHash;
  if (semanticHash(material) !== value.previewHash) fail('preview hash mismatch.');
  return value;
}
export function createConnectEndpointsValidation({ candidate: input, diagnostics: inputDiagnostics = [] } = {}) {
  const candidate = assertConnectEndpointsCandidate(input);
  const normalized = diagnostics(inputDiagnostics);
  const blocking = normalized.filter((row) => row.severity === 'HIGH');
  const material = {
    schema: CONNECT_ENDPOINTS_VALIDATION_SCHEMA,
    candidateHash: candidate.candidateHash,
    validatedTopologyHash: candidate.resultingCanonicalHash,
    diagnosticHash: semanticHash(normalized),
    diagnosticCount: normalized.length,
    blockingIssueCount: blocking.length,
    status: blocking.length ? 'BLOCKED' : 'READY_TO_APPLY',
  };
  return deepFreeze({ ...material, validationHash: semanticHash(material), diagnostics: normalized });
}
export function assertConnectEndpointsValidation(value) {
  if (value?.schema !== CONNECT_ENDPOINTS_VALIDATION_SCHEMA) fail(`validation must use ${CONNECT_ENDPOINTS_VALIDATION_SCHEMA}.`, TypeError);
  const material = { ...value }; delete material.validationHash; delete material.diagnostics;
  if (semanticHash(material) !== value.validationHash || semanticHash(value.diagnostics) !== value.diagnosticHash) {
    fail('validation payload differs from immutable authority.');
  }
  return value;
}

export async function executeConnectEndpointsTransaction({ session: sessionInput, operation: operationInput,
  candidate: candidateInput, preview: previewInput, validation: validationInput, catalogue } = {}) {
  const session = assertSession(sessionInput);
  const operation = assertConnectEndpointsOperation(operationInput);
  const candidate = assertConnectEndpointsCandidate(candidateInput);
  const preview = assertConnectEndpointsPreview(previewInput);
  const validation = assertConnectEndpointsValidation(validationInput);
  assertCurrent(session, candidate);
  if (candidate.operationHash !== operation.operationHash || preview.candidateHash !== candidate.candidateHash
    || validation.candidateHash !== candidate.candidateHash
    || validation.validatedTopologyHash !== candidate.resultingCanonicalHash) {
    fail('operation, candidate, preview and validation authority differ.');
  }
  if (validation.status !== 'READY_TO_APPLY' || validation.blockingIssueCount !== 0) {
    fail('connection validation is blocking.');
  }
  const recreated = await recreateConnectEndpointsCandidate({ operation, candidate, session, catalogue });
  const prior = session.snapshot();
  session.reloadJournal(recreated.serializedJournal);
  if (session.journal.journalHash !== recreated.resultingJournalHash
    || session.currentTopology().canonicalTopologyHash !== recreated.resultingCanonicalHash) {
    fail('applied connection journal differs from certified candidate.');
  }
  const material = {
    schema: CONNECT_ENDPOINTS_TRANSACTION_SCHEMA,
    operationHash: operation.operationHash,
    candidateHash: recreated.candidateHash,
    previewHash: preview.previewHash,
    validationHash: validation.validationHash,
    segmentCount: recreated.segmentCount,
    newNodeCount: recreated.newNodeCount,
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
export function assertConnectEndpointsTransaction(value) {
  if (value?.schema !== CONNECT_ENDPOINTS_TRANSACTION_SCHEMA) fail(`transaction must use ${CONNECT_ENDPOINTS_TRANSACTION_SCHEMA}.`, TypeError);
  const material = { ...value }; delete material.transactionHash;
  if (semanticHash(material) !== value.transactionHash
    || value.commandCount !== value.segmentCount + value.newNodeCount + value.bendCount
    || value.commandIds?.length !== value.commandCount) fail('transaction differs from immutable authority.');
  return value;
}
export function cancelConnectEndpointsPreview({ session: sessionInput, preview: input } = {}) {
  const session = assertSession(sessionInput); const preview = assertConnectEndpointsPreview(input);
  if (session.currentTopology().canonicalTopologyHash !== preview.priorCanonicalHash
    || session.journal.journalHash !== preview.priorJournalHash) fail('preview is stale.');
  const material = { schema: CONNECT_ENDPOINTS_CANCEL_SCHEMA, previewHash: preview.previewHash,
    resultingCanonicalHash: session.currentTopology().canonicalTopologyHash,
    resultingJournalHash: session.journal.journalHash, disposition: 'CANCELLED_NO_AUTHORITY_CHANGE' };
  return deepFreeze({ ...material, cancelHash: semanticHash(material) });
}
export function undoConnectEndpointsTransaction(sessionInput, transactionInput) {
  const session = assertSession(sessionInput); const transaction = assertConnectEndpointsTransaction(transactionInput);
  if (session.currentTopology().canonicalTopologyHash !== transaction.resultingCanonicalHash) fail('transaction is not current.');
  if (semanticHash(session.journal.activeCommandIds.slice(-transaction.commandCount)) !== semanticHash(transaction.commandIds)) {
    fail('connection commands are not the exact active suffix.');
  }
  for (let index = 0; index < transaction.commandCount; index += 1) session.undo();
  if (session.currentTopology().canonicalTopologyHash !== transaction.priorCanonicalHash) fail('undo did not restore prior canonical hash.');
  return session.snapshot();
}
export function redoConnectEndpointsTransaction(sessionInput, transactionInput) {
  const session = assertSession(sessionInput); const transaction = assertConnectEndpointsTransaction(transactionInput);
  if (session.currentTopology().canonicalTopologyHash !== transaction.priorCanonicalHash) fail('transaction prior state is not current.');
  const redoIds = session.journal.redoCommandIds.slice(-transaction.commandCount).reverse();
  if (semanticHash(redoIds) !== semanticHash(transaction.commandIds)) fail('connection commands are not the exact redo suffix.');
  for (let index = 0; index < transaction.commandCount; index += 1) session.redo();
  if (session.currentTopology().canonicalTopologyHash !== transaction.resultingCanonicalHash) fail('redo did not restore resulting canonical hash.');
  return session.snapshot();
}
