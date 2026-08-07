import {
  applyTopologyEditTableTransaction,
  prepareTopologyEditTablePreview,
  redoTopologyEditTableTransaction,
  undoTopologyEditTableTransaction,
  validateTopologyEditTablePreview,
} from '../topology-edit/table/topology-edit-table-transaction.js';

export async function previewTopologyEditTableRuntime(runtime) {
  if (runtime.pending || !runtime.batchPlan || runtime.staleResult) return true;
  try {
    runtime.pending = true;
    runtime.error = null;
    runtime.preview = await prepareTopologyEditTablePreview({
      session: runtime.controller.session,
      batchPlan: runtime.batchPlan,
    });
    runtime.validation = null;
    renderTopologyEditTablePreviewGhost(runtime);
    runtime.message = `${runtime.preview.candidate.commandCount} governed command(s) ready in non-mutating Preview.`;
  } catch (error) {
    runtime.error = errorMessage(error);
  } finally {
    runtime.pending = false;
    runtime.render();
  }
  return true;
}

export async function validateTopologyEditTableRuntime(runtime) {
  if (runtime.pending || !runtime.preview || !runtime.batchPlan) return true;
  const preview = runtime.preview;
  try {
    runtime.pending = true;
    runtime.error = null;
    const result = await runtime.validationClient.validate({
      operationPlan: runtime.batchPlan.operationPlan,
      canonicalTopology: preview.candidate.canonicalTopology,
      previousDiagnostics: runtime.controller.issues ?? [],
      performancePolicy: { fastPathBudgetMs: 16, warningBudgetMs: 100, hysteresisMs: 4 },
      blockingSeverities: ['HIGH'],
    });
    if (runtime.preview?.previewHash !== preview.previewHash
      || runtime.controller.session.currentTopology().canonicalTopologyHash !== preview.priorCanonicalHash) {
      throw new RangeError('TopologyEditTableWorkflow: validation completed against a stale Preview.');
    }
    runtime.validation = validateTopologyEditTablePreview({
      preview,
      workerReceipt: result.receipt,
    });
    runtime.message = runtime.validation.status === 'READY_TO_APPLY'
      ? 'Final-state validation passed; Apply is enabled.'
      : `${runtime.validation.blockingIssueCount} blocking validation issue(s).`;
  } catch (error) {
    if (error?.name !== 'AbortError') runtime.error = errorMessage(error);
  } finally {
    runtime.pending = false;
    runtime.render();
  }
  return true;
}

export async function applyTopologyEditTableRuntime(runtime) {
  if (runtime.pending || !runtime.validation || !runtime.preview || !runtime.batchPlan) return true;
  const priorVersion = runtime.controller.session.journal.sessionVersion;
  try {
    runtime.pending = true;
    const transaction = await applyTopologyEditTableTransaction({
      session: runtime.controller.session,
      batchPlan: runtime.batchPlan,
      preview: runtime.preview,
      tableValidation: runtime.validation,
    });
    runtime.transaction = transaction;
    runtime.redoTransaction = null;
    runtime.resetStaged(false);
    runtime.controller.refreshView(runtime.controller.session.currentTopology());
    runtime.controller.autosaveAfterTransition?.(priorVersion);
    runtime.message = `Atomic ${transaction.commandCount}-command Table transaction accepted.`;
    runtime.error = null;
  } catch (error) {
    runtime.error = errorMessage(error);
  } finally {
    runtime.pending = false;
    runtime.render();
  }
  return true;
}

export function undoTopologyEditTableRuntime(runtime) {
  if (!runtime.transaction) return false;
  const priorVersion = runtime.controller.session.journal.sessionVersion;
  undoTopologyEditTableTransaction(runtime.controller.session, runtime.transaction);
  runtime.redoTransaction = runtime.transaction;
  runtime.transaction = null;
  runtime.controller.refreshView(runtime.controller.session.currentTopology());
  runtime.controller.autosaveAfterTransition?.(priorVersion);
  runtime.message = 'Table transaction undone as one exact command group.';
  runtime.render();
  return true;
}

export function redoTopologyEditTableRuntime(runtime) {
  if (!runtime.redoTransaction) return false;
  const priorVersion = runtime.controller.session.journal.sessionVersion;
  redoTopologyEditTableTransaction(runtime.controller.session, runtime.redoTransaction);
  runtime.transaction = runtime.redoTransaction;
  runtime.redoTransaction = null;
  runtime.controller.refreshView(runtime.controller.session.currentTopology());
  runtime.controller.autosaveAfterTransition?.(priorVersion);
  runtime.message = 'Table transaction redone exactly.';
  runtime.render();
  return true;
}

export function renderTopologyEditTablePreviewGhost(runtime) {
  const candidate = runtime.preview?.candidate;
  if (!candidate) return;
  const projection = runtime.controller.deriveVisual(
    candidate.canonicalTopology,
    'DRAFT',
  ).projection;
  const changed = new Set(candidate.changedCanonicalIds ?? []);
  const accepted = (row) => changed.has(
    row.pickTarget?.objectId ?? row.entityId ?? row.id,
  );
  runtime.controller.viewportBackend?.renderGhost({
    elements: (projection.compactElements ?? projection.elements ?? []).filter(accepted),
    segments: (projection.compactSegments ?? projection.segments ?? []).filter(accepted),
  });
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
