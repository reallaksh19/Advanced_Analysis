import {
  deepFreeze,
  isPlainRecord,
  semanticHash,
  stringValue,
} from '../../../core/shared-piping-model/index.js';
import { TopologyEditCertifiedSession } from '../topology-edit-certified-session.js';
import {
  assertTopologyEditIncrementalValidationReceipt,
} from './topology-edit-incremental-validation.js';
import {
  assertCurrentTopologyEditOperationCandidate,
  prepareTopologyEditOperationCandidate,
  recreateTopologyEditOperationCandidate,
} from './topology-edit-operation-candidate.js';
import {
  assertTopologyEditOperationPlan,
} from './topology-edit-operation-plan.js';
import {
  assertNoTopologyEditBlockingDiagnostics,
} from './topology-edit-validation-blocking.js';

export const TOPOLOGY_EDIT_OPERATION_TRANSACTION_PREVIEW_SCHEMA =
  'TopologyEditOperationTransactionPreview.v2';
export const TOPOLOGY_EDIT_OPERATION_TRANSACTION_RECEIPT_SCHEMA =
  'TopologyEditOperationTransactionReceipt.v2';

export function previewTopologyEditOperationTransaction(input = {}) {
  const session = assertSession(input.session);
  const plan = readyPlan(input.operationPlan);
  const candidate = assertCurrentTopologyEditOperationCandidate(
    input.candidate ?? prepareTopologyEditOperationCandidate({
      session,
      operationPlan: plan,
    }),
    session,
    plan,
  );
  const validation = readyValidation(
    input.validationReceipt,
    plan,
    candidate,
    input.blockingSeverities,
  );
  const authority = {
    schema: TOPOLOGY_EDIT_OPERATION_TRANSACTION_PREVIEW_SCHEMA,
    candidateHash: candidate.candidateHash,
    planHash: plan.planHash,
    validationHash: validation.validationHash,
    priorSessionVersion: candidate.priorSessionVersion,
    priorJournalHash: candidate.priorJournalHash,
    priorCanonicalHash: candidate.priorCanonicalHash,
    commandCount: candidate.commandCount,
    commandIds: candidate.commandIds,
    certificationHashes: candidate.certificationHashes,
    candidateDraftHashes: candidate.candidateDraftHashes,
    resultingSessionVersion: candidate.resultingSessionVersion,
    resultingJournalHash: candidate.resultingJournalHash,
    resultingCanonicalHash: candidate.resultingCanonicalHash,
  };
  return deepFreeze({
    ...authority,
    previewHash: semanticHash(authority),
  });
}

export function executeTopologyEditOperationTransaction(input = {}) {
  const session = assertSession(input.session);
  const plan = readyPlan(input.operationPlan);
  const preview = assertCurrentPreview(
    input.preview ?? previewTopologyEditOperationTransaction(input),
    session,
    plan,
  );
  const candidate = recreateTopologyEditOperationCandidate(
    session,
    plan,
    input.candidate ?? prepareTopologyEditOperationCandidate({
      session,
      operationPlan: plan,
    }),
  );
  if (preview.candidateHash !== candidate.candidateHash) {
    fail('preview candidateHash differs from re-certified candidate.', RangeError);
  }
  const validation = readyValidation(
    input.validationReceipt,
    plan,
    candidate,
    input.blockingSeverities,
  );
  if (preview.validationHash !== validation.validationHash) {
    fail('preview validationHash differs from the supplied receipt.', RangeError);
  }

  const sandbox = new TopologyEditCertifiedSession(
    session.baseCanonicalTopology,
    { checkerPolicy: session.checkerPolicy },
  );
  sandbox.reloadJournal(session.serializeJournal());
  for (const intent of plan.commandIntents) {
    const transition = sandbox.execute(intent.commandType, intent.payload);
    if (transition.disposition !== 'ACCEPTED') {
      fail(`${intent.commandType} failed during final transaction commit.`, RangeError);
    }
  }
  if (sandbox.journal.journalHash !== candidate.resultingJournalHash
    || sandbox.currentTopology().canonicalTopologyHash !== candidate.resultingCanonicalHash) {
    fail('final transaction sandbox differs from certified candidate.', RangeError);
  }
  session.journal = sandbox.journal;
  session.replay = sandbox.replay;

  const authority = {
    schema: TOPOLOGY_EDIT_OPERATION_TRANSACTION_RECEIPT_SCHEMA,
    previewHash: preview.previewHash,
    candidateHash: candidate.candidateHash,
    planHash: plan.planHash,
    validationHash: validation.validationHash,
    priorSessionVersion: preview.priorSessionVersion,
    priorJournalHash: preview.priorJournalHash,
    priorCanonicalHash: preview.priorCanonicalHash,
    commandCount: preview.commandCount,
    commandIds: preview.commandIds,
    certificationHashes: preview.certificationHashes,
    candidateDraftHashes: preview.candidateDraftHashes,
    resultingSessionVersion: session.journal.sessionVersion,
    resultingJournalHash: session.journal.journalHash,
    resultingCanonicalHash: session.currentTopology().canonicalTopologyHash,
  };
  return deepFreeze({
    ...authority,
    transactionHash: semanticHash(authority),
  });
}

export function undoTopologyEditOperationTransaction(sessionInput, receiptInput) {
  const session = assertSession(sessionInput);
  const receipt = assertTopologyEditOperationTransactionReceipt(receiptInput);
  if (session.currentTopology().canonicalTopologyHash !== receipt.resultingCanonicalHash) {
    fail('transaction is not the current canonical suffix.', RangeError);
  }
  assertCommandSuffix(session.journal.activeCommandIds, receipt.commandIds);
  for (let index = 0; index < receipt.commandCount; index += 1) session.undo();
  if (session.currentTopology().canonicalTopologyHash !== receipt.priorCanonicalHash) {
    fail('transaction undo did not restore the exact prior canonical hash.', RangeError);
  }
  return session.snapshot();
}

export function redoTopologyEditOperationTransaction(sessionInput, receiptInput) {
  const session = assertSession(sessionInput);
  const receipt = assertTopologyEditOperationTransactionReceipt(receiptInput);
  if (session.currentTopology().canonicalTopologyHash !== receipt.priorCanonicalHash) {
    fail('transaction prior canonical hash is not current.', RangeError);
  }
  const redoIds = session.journal.redoCommandIds.slice(-receipt.commandCount).reverse();
  if (!sameList(redoIds, receipt.commandIds)) {
    fail('transaction commands are not the exact redo suffix.', RangeError);
  }
  for (let index = 0; index < receipt.commandCount; index += 1) session.redo();
  if (session.currentTopology().canonicalTopologyHash !== receipt.resultingCanonicalHash) {
    fail('transaction redo did not reproduce the exact resulting canonical hash.', RangeError);
  }
  return session.snapshot();
}

export function assertTopologyEditOperationTransactionPreview(value) {
  if (!isPlainRecord(value)) fail('preview must be an object.');
  if (value.schema !== TOPOLOGY_EDIT_OPERATION_TRANSACTION_PREVIEW_SCHEMA) {
    fail(`preview must use ${TOPOLOGY_EDIT_OPERATION_TRANSACTION_PREVIEW_SCHEMA}.`);
  }
  const material = { ...value };
  delete material.previewHash;
  if (value.previewHash !== semanticHash(material)) {
    fail('previewHash does not match preview authority.', RangeError);
  }
  assertReceiptShape(value, 'preview');
  return value;
}

export function assertTopologyEditOperationTransactionReceipt(value) {
  if (!isPlainRecord(value)) fail('receipt must be an object.');
  if (value.schema !== TOPOLOGY_EDIT_OPERATION_TRANSACTION_RECEIPT_SCHEMA) {
    fail(`receipt must use ${TOPOLOGY_EDIT_OPERATION_TRANSACTION_RECEIPT_SCHEMA}.`);
  }
  const material = { ...value };
  delete material.transactionHash;
  if (value.transactionHash !== semanticHash(material)) {
    fail('transactionHash does not match transaction authority.', RangeError);
  }
  assertReceiptShape(value, 'receipt');
  requiredText(value.previewHash, 'receipt.previewHash');
  return value;
}

function readyPlan(value) {
  const plan = assertTopologyEditOperationPlan(value);
  if (plan.unresolvedEvidence.length) {
    fail(`operation plan remains blocked by ${plan.unresolvedEvidence[0].code}.`, RangeError);
  }
  return plan;
}

function readyValidation(value, plan, candidate, blockingInput) {
  const receipt = assertTopologyEditIncrementalValidationReceipt(value);
  const mismatches = [];
  if (receipt.planHash !== plan.planHash) mismatches.push('planHash');
  if (receipt.changedScopeHash !== plan.changedScope.changedScopeHash) {
    mismatches.push('changedScopeHash');
  }
  if (receipt.priorBasisHash !== plan.basisHash) mismatches.push('priorBasisHash');
  if (receipt.validatedTopologyHash !== candidate.resultingCanonicalHash) {
    mismatches.push('validatedTopologyHash');
  }
  if (mismatches.length) {
    fail(`validation differs from certified candidate: ${mismatches.join(', ')}.`, RangeError);
  }
  assertNoTopologyEditBlockingDiagnostics(
    receipt,
    blockingInput ?? ['HIGH'],
  );
  return receipt;
}

function assertCurrentPreview(value, session, plan) {
  const preview = assertTopologyEditOperationTransactionPreview(value);
  const mismatches = [];
  if (preview.planHash !== plan.planHash) mismatches.push('planHash');
  if (preview.priorSessionVersion !== session.journal.sessionVersion) mismatches.push('sessionVersion');
  if (preview.priorJournalHash !== session.journal.journalHash) mismatches.push('journalHash');
  if (preview.priorCanonicalHash !== session.currentTopology().canonicalTopologyHash) {
    mismatches.push('canonicalHash');
  }
  if (mismatches.length) {
    fail(`transaction preview is stale: ${mismatches.join(', ')}.`, RangeError);
  }
  return preview;
}

function assertCommandSuffix(activeIds, commandIds) {
  if (!sameList(activeIds.slice(-commandIds.length), commandIds)) {
    fail('transaction command IDs are not the exact active journal suffix.', RangeError);
  }
}

function assertReceiptShape(value, label) {
  for (const field of [
    'candidateHash', 'planHash', 'validationHash', 'priorJournalHash',
    'priorCanonicalHash', 'resultingJournalHash', 'resultingCanonicalHash',
  ]) requiredText(value[field], `${label}.${field}`);
  const count = Number(value.commandCount);
  if (!Number.isInteger(count) || count <= 0) {
    fail(`${label}.commandCount must be a positive integer.`, RangeError);
  }
  for (const field of ['commandIds', 'certificationHashes', 'candidateDraftHashes']) {
    if (!Array.isArray(value[field]) || value[field].length !== count) {
      fail(`${label}.${field} must match commandCount.`, RangeError);
    }
  }
}

function assertSession(value) {
  if (!(value instanceof TopologyEditCertifiedSession)) {
    fail('session must be a TopologyEditCertifiedSession.');
  }
  value.assertUsable();
  return value;
}
function sameList(left, right) {
  return Array.isArray(left)
    && Array.isArray(right)
    && left.length === right.length
    && left.every((row, index) => row === right[index]);
}
function requiredText(value, label) {
  const text = stringValue(value);
  if (!text) fail(`${label} is required.`);
  return text;
}
function fail(message, Constructor = TypeError) {
  throw new Constructor(`TopologyEditOperationTransaction: ${message}`);
}
