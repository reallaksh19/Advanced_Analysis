import { deepFreeze, semanticHash } from '../../../core/shared-piping-model/index.js';
import {
  assertCurrentTopologyEditAuthoringCandidate,
  assertTopologyEditAuthoringCandidate,
  assertTopologyEditAuthoringTransactionReceipt,
  assertTopologyEditAuthoringValidationReceipt,
  createTopologyEditAuthoringValidationReceipt,
  executeTopologyEditAuthoringTransaction,
  prepareTopologyEditAuthoringCandidate,
  redoTopologyEditAuthoringTransaction,
  undoTopologyEditAuthoringTransaction,
} from '../authoring/topology-edit-authoring-composite-operation.js';
import { assertTopologyEditTableBatchPlan } from './topology-edit-table-batch-planner.js';

export const TOPOLOGY_EDIT_TABLE_PREVIEW_SCHEMA = 'TopologyEditTablePreview.v1';
export const TOPOLOGY_EDIT_TABLE_VALIDATION_SCHEMA = 'TopologyEditTableValidation.v1';
export const TOPOLOGY_EDIT_TABLE_TRANSACTION_SCHEMA = 'TopologyEditTableTransaction.v1';

export async function prepareTopologyEditTablePreview({ session, batchPlan: planInput } = {}) {
  const batchPlan = assertTopologyEditTableBatchPlan(planInput);
  const candidate = await prepareTopologyEditAuthoringCandidate({
    session,
    operationPlan: batchPlan.operationPlan,
  });
  const material = {
    schema: TOPOLOGY_EDIT_TABLE_PREVIEW_SCHEMA,
    batchHash: batchPlan.batchHash,
    batchPlanHash: batchPlan.planHash,
    operationPlanHash: batchPlan.operationPlanHash,
    candidateHash: candidate.candidateHash,
    priorCanonicalHash: candidate.priorCanonicalHash,
    resultingCanonicalHash: candidate.resultingCanonicalHash,
  };
  return deepFreeze({ ...material, previewHash: semanticHash(material), candidate });
}

export function validateTopologyEditTablePreview({ preview: previewInput, workerReceipt } = {}) {
  const preview = assertTopologyEditTablePreview(previewInput);
  const validation = createTopologyEditAuthoringValidationReceipt({
    candidate: preview.candidate,
    workerReceipt,
  });
  const material = {
    schema: TOPOLOGY_EDIT_TABLE_VALIDATION_SCHEMA,
    previewHash: preview.previewHash,
    candidateHash: preview.candidateHash,
    validationHash: validation.validationHash,
    status: validation.status,
    blockingIssueCount: validation.blockingIssueCount,
  };
  return deepFreeze({ ...material, tableValidationHash: semanticHash(material), validation });
}

export async function applyTopologyEditTableTransaction({
  session,
  batchPlan: planInput,
  preview: previewInput,
  tableValidation: validationInput,
} = {}) {
  const batchPlan = assertTopologyEditTableBatchPlan(planInput);
  const preview = assertTopologyEditTablePreview(previewInput);
  const tableValidation = assertTopologyEditTableValidation(validationInput);
  if (preview.batchPlanHash !== batchPlan.planHash
    || tableValidation.previewHash !== preview.previewHash) {
    throw new Error('TopologyEditTableTransaction: preview/validation do not belong to the current batch plan.');
  }
  assertCurrentTopologyEditAuthoringCandidate(
    preview.candidate,
    session,
    batchPlan.operationPlan,
  );
  if (tableValidation.status !== 'READY_TO_APPLY' || tableValidation.blockingIssueCount !== 0) {
    throw new RangeError('TopologyEditTableTransaction: validated preview is not ready to apply.');
  }
  const transaction = await executeTopologyEditAuthoringTransaction({
    session,
    operationPlan: batchPlan.operationPlan,
    candidate: preview.candidate,
    validationReceipt: tableValidation.validation,
  });
  const material = {
    schema: TOPOLOGY_EDIT_TABLE_TRANSACTION_SCHEMA,
    batchHash: batchPlan.batchHash,
    batchPlanHash: batchPlan.planHash,
    previewHash: preview.previewHash,
    tableValidationHash: tableValidation.tableValidationHash,
    transactionHash: transaction.transactionHash,
    priorCanonicalHash: transaction.priorCanonicalHash,
    resultingCanonicalHash: transaction.resultingCanonicalHash,
    commandCount: transaction.commandCount,
    commandIds: transaction.commandIds,
  };
  return deepFreeze({ ...material, tableTransactionHash: semanticHash(material), transaction });
}

export function undoTopologyEditTableTransaction(session, value) {
  const tableTransaction = assertTopologyEditTableTransaction(value);
  return undoTopologyEditAuthoringTransaction(session, tableTransaction.transaction);
}

export function redoTopologyEditTableTransaction(session, value) {
  const tableTransaction = assertTopologyEditTableTransaction(value);
  return redoTopologyEditAuthoringTransaction(session, tableTransaction.transaction);
}

export function assertTopologyEditTablePreview(value) {
  if (value?.schema !== TOPOLOGY_EDIT_TABLE_PREVIEW_SCHEMA) {
    throw new TypeError(`Table preview must use ${TOPOLOGY_EDIT_TABLE_PREVIEW_SCHEMA}.`);
  }
  assertTopologyEditAuthoringCandidate(value.candidate);
  const material = { ...value };
  delete material.previewHash;
  delete material.candidate;
  if (semanticHash(material) !== value.previewHash || value.candidateHash !== value.candidate.candidateHash) {
    throw new Error('TopologyEditTableTransaction: preview hash mismatch.');
  }
  return value;
}

export function assertTopologyEditTableValidation(value) {
  if (value?.schema !== TOPOLOGY_EDIT_TABLE_VALIDATION_SCHEMA) {
    throw new TypeError(`Table validation must use ${TOPOLOGY_EDIT_TABLE_VALIDATION_SCHEMA}.`);
  }
  assertTopologyEditAuthoringValidationReceipt(value.validation);
  const material = { ...value };
  delete material.tableValidationHash;
  delete material.validation;
  if (semanticHash(material) !== value.tableValidationHash
    || value.validationHash !== value.validation.validationHash) {
    throw new Error('TopologyEditTableTransaction: validation hash mismatch.');
  }
  return value;
}

export function assertTopologyEditTableTransaction(value) {
  if (value?.schema !== TOPOLOGY_EDIT_TABLE_TRANSACTION_SCHEMA) {
    throw new TypeError(`Table transaction must use ${TOPOLOGY_EDIT_TABLE_TRANSACTION_SCHEMA}.`);
  }
  assertTopologyEditAuthoringTransactionReceipt(value.transaction);
  const material = { ...value };
  delete material.tableTransactionHash;
  delete material.transaction;
  if (semanticHash(material) !== value.tableTransactionHash
    || value.transactionHash !== value.transaction.transactionHash) {
    throw new Error('TopologyEditTableTransaction: transaction hash mismatch.');
  }
  return value;
}
