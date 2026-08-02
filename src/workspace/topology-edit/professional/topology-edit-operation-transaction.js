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
  assertTopologyEditOperationPlan,
} from './topology-edit-operation-plan.js';

export const TOPOLOGY_EDIT_OPERATION_TRANSACTION_PREVIEW_SCHEMA =
  'TopologyEditOperationTransactionPreview.v1';
export const TOPOLOGY_EDIT_OPERATION_TRANSACTION_RECEIPT_SCHEMA =
  'TopologyEditOperationTransactionReceipt.v1';

export function previewTopologyEditOperationTransaction(input = {}) {
  const session = assertSession(input.session);
  const plan = readyPlan(input.operationPlan);
  const validation = readyValidation(
    input.validationReceipt,
    plan,
    session.currentTopology(),
    input.blockingSeverities,
  );
  const sandbox = sandboxFromSession(session);
  const transitions = executePlanInSandbox(sandbox, plan);
  const appendedCommandIds = appendedIds(
    session.journal.activeCommandIds,
    sandbox.journal.activeCommandIds,
  );
  const authority = {
    schema: TOPOLOGY_EDIT_OPERATION_TRANSACTION_PREVIEW_SCHEMA,
    planHash: plan.planHash,
    validationHash: validation.validationHash,
    priorSessionVersion: session.journal.sessionVersion,
    priorJournalHash: session.journal.journalHash,
    priorCanonicalHash: session.currentTopology().canonicalTopologyHash,
    commandCount: transitions.length,
    commandIds: appendedCommandIds,
    certificationHashes: transitions.map((row) => row.certification.certificationHash),
    candidateDraftHashes: transitions.map((row) => row.certification.candidateDraftHash),
    resultingSessionVersion: sandbox.journal.sessionVersion,
    resultingJournalHash: sandbox.journal.journalHash,
    resultingCanonicalHash: sandbox.currentTopology().canonicalTopologyHash,
  };
  return deepFreeze({
    ...authority,
    previewHash: semanticHash(authority),
  });
}

export function executeTopologyEditOperationTransaction(input = {}) {
  const session = assertSession(input.session);
  const preview = assertCurrentPreview(
    input.preview ?? previewTopologyEditOperationTransaction(input),
    session,
  );
  const plan = readyPlan(input.operationPlan);
  if (preview.planHash !== plan.planHash) {
    fail('preview planHash differs from the supplied operation plan.', RangeError);
  }
  const validation = readyValidation(
    input.validationReceipt,
    plan,
    session.currentTopology(),
    input.blockingSeverities,
  );
  if (preview.validationHash !== validation.validationHash) {
    fail('preview validationHash differs from the supplied receipt.', RangeError);
  }
  const sandbox = sandboxFromSession(session);
  const transitions = executePlanInSandbox(sandbox, plan);
  assertSandboxMatchesPreview(sandbox, transitions, preview);

  session.journal = sandbox.journal;
  session.replay = sandbox.replay;

  const authority = {
    schema: TOPOLOGY_EDIT_OPERATION_TRANSACTION_RECEIPT_SCHEMA,
    previewHash: preview.previewHash,
    planHash: plan.planHash,
    validationHash: validation.validationHash,
    priorSessionVersion: preview.priorSessionVersion,
    priorJournalHash: preview.priorJournalHash,
    priorCanonicalHash: preview.priorCanonicalHash,
    commandCount: preview.commandCount,
    commandIds: preview.commandIds,
    certificationHashes: preview.certificationHashes,
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

function readyValidation(value, plan, topology, blockingInput) {
  const receipt = assertTopologyEditIncrementalValidationReceipt(value);
  const mismatches = [];
  if (receipt.planHash !== plan.planHash) mismatches.push('planHash');
  if (receipt.changedScopeHash !== plan.changedScope.changedScopeHash) mismatches.push('changedScopeHash');
  if (receipt.priorBasisHash !== plan.basisHash) mismatches.push('priorBasisHash');
  if (receipt.validatedTopologyHash !== topology.canonicalTopologyHash) mismatches.push('validatedTopologyHash');
  if (mismatches.length) fail(`validation differs from current operation authority: ${mismatches.join(', ')}.`, RangeError);
  const blocking = new Set(normalizeSeverities(blockingInput ?? ['HIGH']));
  const issue = receipt.finalDiagnostics.find((row) => blocking.has(
    stringValue(row?.severity).toUpperCase() || 'UNKNOWN',
  ));
  if (issue) fail(`validation contains blocking issue ${issue.id || semanticHash(issue)}.`, RangeError);
  return receipt;
}

function sandboxFromSession(session) {
  const sandbox = new TopologyEditCertifiedSession(
    session.baseCanonicalTopology,
    { checkerPolicy: session.checkerPolicy },
  );
  sandbox.reloadJournal(session.serializeJournal());
  return sandbox;
}

function executePlanInSandbox(sandbox, plan) {
  return plan.commandIntents.map((intent) => {
    const transition = sandbox.execute(intent.commandType, intent.payload);
    if (transition.disposition !== 'ACCEPTED') {
      fail(
        `${intent.commandType} rejected during atomic certification: ${transition.reason || transition.disposition}.`,
        RangeError,
      );
    }
    return transition;
  });
}

function assertCurrentPreview(value, session) {
  const preview = assertTopologyEditOperationTransactionPreview(value);
  const mismatches = [];
  if (preview.priorSessionVersion !== session.journal.sessionVersion) mismatches.push('sessionVersion');
  if (preview.priorJournalHash !== session.journal.journalHash) mismatches.push('journalHash');
  if (preview.priorCanonicalHash !== session.currentTopology().canonicalTopologyHash) mismatches.push('canonicalHash');
  if (mismatches.length) fail(`transaction preview is stale: ${mismatches.join(', ')}.`, RangeError);
  return preview;
}

function assertSandboxMatchesPreview(sandbox, transitions, preview) {
  const actual = {
    commandCount: transitions.length,
    commandIds: appendedIds([], sandbox.journal.activeCommandIds).slice(-transitions.length),
    certificationHashes: transitions.map((row) => row.certification.certificationHash),
    resultingSessionVersion: sandbox.journal.sessionVersion,
    resultingJournalHash: sandbox.journal.journalHash,
    resultingCanonicalHash: sandbox.currentTopology().canonicalTopologyHash,
  };
  for (const field of Object.keys(actual)) {
    if (Array.isArray(actual[field]) ? !sameList(actual[field], preview[field]) : actual[field] !== preview[field]) {
      fail(`transaction re-certification differs at ${field}.`, RangeError);
    }
  }
}

function appendedIds(priorIds, nextIds) {
  if (!Array.isArray(priorIds) || !Array.isArray(nextIds)) fail('journal command IDs must be arrays.');
  if (!sameList(priorIds, nextIds.slice(0, priorIds.length))) {
    fail('sandbox command history does not preserve the prior journal prefix.', RangeError);
  }
  return nextIds.slice(priorIds.length);
}

function assertCommandSuffix(activeIds, commandIds) {
  if (!sameList(activeIds.slice(-commandIds.length), commandIds)) {
    fail('transaction command IDs are not the exact active journal suffix.', RangeError);
  }
}

function assertReceiptShape(value, label) {
  requiredText(value.planHash, `${label}.planHash`);
  requiredText(value.validationHash, `${label}.validationHash`);
  requiredText(value.priorJournalHash, `${label}.priorJournalHash`);
  requiredText(value.priorCanonicalHash, `${label}.priorCanonicalHash`);
  requiredText(value.resultingJournalHash, `${label}.resultingJournalHash`);
  requiredText(value.resultingCanonicalHash, `${label}.resultingCanonicalHash`);
  const count = Number(value.commandCount);
  if (!Number.isInteger(count) || count <= 0) fail(`${label}.commandCount must be a positive integer.`, RangeError);
  if (!Array.isArray(value.commandIds) || value.commandIds.length !== count) {
    fail(`${label}.commandIds must match commandCount.`, RangeError);
  }
}

function assertSession(value) {
  if (!(value instanceof TopologyEditCertifiedSession)) {
    fail('session must be a TopologyEditCertifiedSession.');
  }
  value.assertUsable();
  return value;
}
function normalizeSeverities(value) {
  if (!Array.isArray(value) || !value.length) fail('blockingSeverities must be a non-empty array.');
  return [...new Set(value.map((row, index) => requiredText(
    row,
    `blockingSeverities[${index}]`,
  ).toUpperCase()))].sort(compareText);
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
function compareText(left, right) { return left.localeCompare(right); }
function fail(message, Constructor = TypeError) {
  throw new Constructor(`TopologyEditOperationTransaction: ${message}`);
}
