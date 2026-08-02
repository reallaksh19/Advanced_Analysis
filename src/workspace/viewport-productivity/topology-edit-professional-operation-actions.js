import {
  createTopologyEditProfessionalOperationPlan,
} from '../topology-edit/professional/topology-edit-professional-operation-session.js';
import {
  prepareTopologyEditOperationCandidate,
} from '../topology-edit/professional/topology-edit-operation-candidate.js';
import {
  executeTopologyEditOperationTransaction,
  previewTopologyEditOperationTransaction,
  redoTopologyEditOperationTransaction,
  undoTopologyEditOperationTransaction,
} from '../topology-edit/professional/topology-edit-operation-transaction.js';
import {
  readTopologyEditProfessionalOperationValues,
} from './topology-edit-professional-operation-panel.js';

export function planTopologyEditProfessionalOperation(runtime) {
  const session = runtime.controller.session;
  if (!session) return true;
  try {
    runtime.values = readTopologyEditProfessionalOperationValues(runtime.element);
    runtime.plan = createTopologyEditProfessionalOperationPlan({
      topology: session.currentTopology(),
      selection: runtime.controller.selection,
      values: runtime.values,
      catalogue: runtime.catalogue,
    });
    runtime.candidate = runtime.plan.status === 'PLANNED'
      && runtime.plan.unresolvedEvidence.length === 0
      ? prepareTopologyEditOperationCandidate({
        session,
        operationPlan: runtime.plan,
      })
      : null;
    runtime.validation = null;
    runtime.transactionPreview = null;
    runtime.error = null;
    runtime.message = runtime.candidate
      ? `Plan ${runtime.plan.planHash.slice(0, 18)} certified candidate ${runtime.candidate.resultingCanonicalHash}.`
      : runtime.plan.reason ?? `Plan blocked by ${runtime.plan.unresolvedEvidence[0]?.code}.`;
    runtime.publishState();
  } catch (error) {
    runtime.reject(error);
  }
  return true;
}

export async function validateTopologyEditProfessionalOperation(runtime) {
  const session = runtime.controller.session;
  if (!session || !runtime.plan || !runtime.candidate) return true;
  const plan = runtime.plan;
  const candidate = runtime.candidate;
  runtime.validationPending = true;
  runtime.validation = null;
  runtime.transactionPreview = null;
  runtime.error = null;
  runtime.message = 'Validating the exact certified candidate in a cancellable module worker…';
  runtime.render();
  try {
    const result = await runtime.validationClient.validate({
      operationPlan: plan,
      canonicalTopology: candidate.canonicalTopology,
      previousDiagnostics: runtime.controller.issues ?? [],
      performancePolicy: {
        fastPathBudgetMs: 16,
        warningBudgetMs: 100,
        hysteresisMs: 4,
      },
      blockingSeverities: ['HIGH'],
    });
    if (!runtime.controller.session
      || runtime.plan?.planHash !== plan.planHash
      || runtime.candidate?.candidateHash !== candidate.candidateHash
      || runtime.controller.session.currentTopology().canonicalTopologyHash
        !== candidate.priorCanonicalHash) {
      throw new RangeError('Validation completed against a stale professional candidate.');
    }
    runtime.validation = result.receipt;
    runtime.transactionPreview = previewTopologyEditOperationTransaction({
      session: runtime.controller.session,
      operationPlan: plan,
      candidate,
      validationReceipt: result.receipt,
    });
    runtime.message = `Validation ${result.receipt.status}; atomic preview ${runtime.transactionPreview.previewHash.slice(0, 18)} ready.`;
  } catch (error) {
    if (error?.name !== 'AbortError') runtime.error = errorMessage(error);
    runtime.message = error?.name === 'AbortError'
      ? 'Professional validation cancelled.'
      : 'Professional validation blocked.';
  } finally {
    runtime.validationPending = false;
    runtime.publishState();
  }
  return true;
}

export function applyTopologyEditProfessionalOperation(runtime) {
  const session = runtime.controller.session;
  if (!session || !runtime.plan || !runtime.candidate
    || !runtime.validation || !runtime.transactionPreview) return true;
  const priorVersion = session.journal.sessionVersion;
  try {
    runtime.transaction = executeTopologyEditOperationTransaction({
      session,
      operationPlan: runtime.plan,
      candidate: runtime.candidate,
      validationReceipt: runtime.validation,
      preview: runtime.transactionPreview,
    });
    runtime.redoTransaction = null;
    runtime.plan = null;
    runtime.candidate = null;
    runtime.validation = null;
    runtime.transactionPreview = null;
    runtime.error = null;
    runtime.controller.refreshView(session.currentTopology());
    runtime.controller.autosaveAfterTransition?.(priorVersion);
    runtime.message = `Atomic operation accepted: ${runtime.transaction.commandCount} command(s), ${runtime.transaction.transactionHash.slice(0, 18)}.`;
    runtime.publishState();
  } catch (error) {
    runtime.reject(error);
  }
  return true;
}

export function undoTopologyEditProfessionalOperation(runtime) {
  const session = runtime.controller.session;
  if (!session || !runtime.transaction) return true;
  const priorVersion = session.journal.sessionVersion;
  try {
    undoTopologyEditOperationTransaction(session, runtime.transaction);
    runtime.redoTransaction = runtime.transaction;
    runtime.transaction = null;
    runtime.controller.refreshView(session.currentTopology());
    runtime.controller.autosaveAfterTransition?.(priorVersion);
    runtime.message = 'Professional operation undone as one exact command group.';
    runtime.publishState();
  } catch (error) {
    runtime.reject(error);
  }
  return true;
}

export function redoTopologyEditProfessionalOperation(runtime) {
  const session = runtime.controller.session;
  if (!session || !runtime.redoTransaction) return true;
  const priorVersion = session.journal.sessionVersion;
  try {
    redoTopologyEditOperationTransaction(session, runtime.redoTransaction);
    runtime.transaction = runtime.redoTransaction;
    runtime.redoTransaction = null;
    runtime.controller.refreshView(session.currentTopology());
    runtime.controller.autosaveAfterTransition?.(priorVersion);
    runtime.message = 'Professional operation redone as one exact command group.';
    runtime.publishState();
  } catch (error) {
    runtime.reject(error);
  }
  return true;
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
