/** Production Topology Edit controller with governed Wave 4 lifecycle actions. */
import {
  TopologyEdit3DViewController as TopologyEdit3DViewControllerCore,
} from './topology-edit-3d-view-controller-core.js';
import { canRunTopologyEditAction } from './topology-edit/topology-edit-command-ui.js';
import { TopologyEditLifecycleController } from './topology-edit/topology-edit-lifecycle-controller.js';

export { buildAutofixPolicy } from './topology-edit-3d-view-controller-core.js';

export class TopologyEdit3DViewController extends TopologyEdit3DViewControllerCore {
  constructor(eventBus, lifecycleOptions = {}) {
    super(eventBus);
    this.lastPersistenceError = null;
    this.lastDraftPackageHash = null;
    this.lastExportSealedHash = null;
    this.lastCommitReceiptHash = null;
    this.lastCommitDisposition = null;
    this.lifecycle = new TopologyEditLifecycleController({
      getSession: () => this.session,
      getViewState: () => ({
        presentationState: this.presentationState,
        selection: this.selection,
      }),
      ...lifecycleOptions,
    });
  }

  buildShell() {
    super.buildShell();
    const actions = this.hostElement?.querySelector('.topology-edit-3d-toolbar__actions');
    if (!actions) throw new Error('TopologyEdit3DViewController: lifecycle action host is missing.');
    actions.insertAdjacentHTML('beforeend', `
      <button type="button" data-action="save-draft" disabled>Save draft</button>
      <button type="button" data-action="reload-draft" disabled>Reload draft</button>
      <button type="button" data-action="export-draft" disabled>Export audit</button>
      <button type="button" data-action="commit-draft" disabled>Commit draft</button>`);
    const deferred = actions.querySelector('button:not([data-action])');
    deferred?.remove();
    this.updateLifecycleEvidence();
  }

  deactivate() {
    super.deactivate();
    this.lastPersistenceError = null;
    this.lastDraftPackageHash = null;
    this.lastExportSealedHash = null;
    this.lastCommitReceiptHash = null;
    this.lastCommitDisposition = null;
  }

  handleHostClick(event) {
    if (event.target.closest('[data-action="save-draft"]')) return this.saveDraft();
    if (event.target.closest('[data-action="reload-draft"]')) return this.reloadDraft();
    if (event.target.closest('[data-action="export-draft"]')) return this.exportDraft();
    if (event.target.closest('[data-action="commit-draft"]')) return this.commitDraft();
    return super.handleHostClick(event);
  }

  runCommandAction(actionId) {
    const version = this.session?.journal.sessionVersion;
    super.runCommandAction(actionId);
    this.autosaveAfterTransition(version);
  }

  undo() {
    const version = this.session?.journal.sessionVersion;
    super.undo();
    this.autosaveAfterTransition(version);
  }

  redo() {
    const version = this.session?.journal.sessionVersion;
    super.redo();
    this.autosaveAfterTransition(version);
  }

  acceptAutofix() {
    const version = this.session?.journal.sessionVersion;
    super.acceptAutofix();
    this.autosaveAfterTransition(version);
  }

  autosaveAfterTransition(previousVersion) {
    if (!this.session || this.session.journal.sessionVersion === previousVersion) return;
    try {
      const saved = this.lifecycle.saveDraft();
      this.lastDraftPackageHash = saved.packageHash;
      this.lastPersistenceError = null;
    } catch (error) {
      this.lastPersistenceError = error instanceof Error ? error.message : String(error);
      this.setStatus(`${this.statusElement?.textContent ?? ''} Draft autosave failed: ${this.lastPersistenceError}`.trim());
    }
    this.updateLifecycleEvidence();
    this.updateActionButtons();
  }

  saveDraft() {
    try {
      const saved = this.lifecycle.saveDraft();
      this.lastDraftPackageHash = saved.packageHash;
      this.lastPersistenceError = null;
      this.setStatus(`Draft saved: ${saved.storageReceipt.byteLength} byte(s), journal ${this.session.journal.journalHash}.`);
    } catch (error) {
      this.lastPersistenceError = error instanceof Error ? error.message : String(error);
      this.setStatus(`Draft save failed: ${this.lastPersistenceError}`);
    }
    this.updateLifecycleEvidence();
    this.updateActionButtons();
  }

  reloadDraft() {
    try {
      this.cancelAutofix(true);
      const loaded = this.lifecycle.reloadDraft();
      if (loaded.disposition === 'EMPTY') {
        this.setStatus('No persisted topology edit draft is available.');
        return;
      }
      this.lastDraftPackageHash = loaded.packageHash;
      this.restoreDisplayState(loaded.restored.viewState);
      this.refreshView(this.session.currentTopology());
      this.lastPersistenceError = null;
      this.setStatus(`Draft restored at session version ${this.session.journal.sessionVersion}.`);
    } catch (error) {
      this.lastPersistenceError = error instanceof Error ? error.message : String(error);
      this.setStatus(`Draft reload failed: ${this.lastPersistenceError}`);
    }
    this.updateLifecycleEvidence();
    this.updateActionButtons();
  }

  restoreDisplayState(viewState = {}) {
    if (viewState.presentationState?.schema) {
      this.presentationState = viewState.presentationState;
      this.presentationToolbar?.update(this.presentationState);
      this.presentationRuntime?.apply(this.presentationState);
    }
    const restoredSelection = restoreTopologyEditViewSelection(viewState.selection);
    if (restoredSelection) this.selection = restoredSelection;
  }

  exportDraft() {
    try {
      const exported = this.lifecycle.exportDraft();
      this.lastExportSealedHash = exported.sealedHash;
      this.lastPersistenceError = null;
      this.setStatus(`Audit exported as ${exported.fileName}; sealed hash ${exported.sealedHash}.`);
    } catch (error) {
      this.lastPersistenceError = error instanceof Error ? error.message : String(error);
      this.setStatus(`Draft export failed: ${this.lastPersistenceError}`);
    }
    this.updateLifecycleEvidence();
    this.updateActionButtons();
  }

  commitDraft() {
    try {
      this.cancelAutofix(true);
      const committed = this.lifecycle.commitDraft();
      this.lastCommitReceiptHash = committed.commitReceipt.receiptHash;
      this.lastCommitDisposition = committed.disposition;
      if (committed.disposition !== 'COMMITTED') {
        this.setStatus(`Workspace commit rolled back: ${committed.commitReceipt.rollback?.reason ?? 'read-back verification failed'}.`);
        this.updateLifecycleEvidence();
        return;
      }
      this.lastPersistenceError = null;
      this.lastDraftPackageHash = null;
      this.session = null;
      this.refreshFromWorkspace();
      this.setStatus(`Workspace commit verified at dataset version ${committed.commitReceipt.datasetVersion}; persisted draft cleared.`);
    } catch (error) {
      this.lastPersistenceError = error instanceof Error ? error.message : String(error);
      this.setStatus(`Workspace commit failed: ${this.lastPersistenceError}`);
    }
    this.updateLifecycleEvidence();
    this.updateActionButtons();
  }

  updateLifecycleEvidence() {
    if (!this.hostElement) return;
    this.hostElement.dataset.topologyEditDraftPackageHash = this.lastDraftPackageHash ?? '';
    this.hostElement.dataset.topologyEditExportSealedHash = this.lastExportSealedHash ?? '';
    this.hostElement.dataset.topologyEditCommitReceiptHash = this.lastCommitReceiptHash ?? '';
    this.hostElement.dataset.topologyEditCommitDisposition = this.lastCommitDisposition ?? '';
  }

  updateActionButtons() {
    super.updateActionButtons();
    const blocked = !this.session || Boolean(this.session.staleReason);
    const topology = this.session?.currentTopology();
    for (const actionId of ['set-gap-3', 'set-gap-20']) {
      const button = this.hostElement?.querySelector(`[data-command-action="${actionId}"]`);
      if (button) {
        button.disabled = blocked || !canRunTopologyEditAction(
          actionId, this.selection, topology,
        );
      }
    }
    const hasCommands = Boolean(this.session?.journal.activeCommandIds.length);
    const buttons = {
      save: this.hostElement?.querySelector('[data-action="save-draft"]'),
      reload: this.hostElement?.querySelector('[data-action="reload-draft"]'),
      export: this.hostElement?.querySelector('[data-action="export-draft"]'),
      commit: this.hostElement?.querySelector('[data-action="commit-draft"]'),
    };
    if (buttons.save) buttons.save.disabled = blocked;
    if (buttons.reload) buttons.reload.disabled = blocked || !this.lifecycle.hasPersistedDraft();
    if (buttons.export) buttons.export.disabled = blocked || !hasCommands || Boolean(this.autofixPreview);
    if (buttons.commit) buttons.commit.disabled = blocked || !hasCommands || Boolean(this.autofixPreview);
    if (buttons.save && this.lastPersistenceError) buttons.save.title = this.lastPersistenceError;
  }
}

export function restoreTopologyEditViewSelection(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (!Array.isArray(value.nodeIds) || value.nodeIds.length > 2) return null;
  const nodeIds = value.nodeIds.map((id) => String(id ?? '').trim());
  if (nodeIds.some((id) => !id.startsWith('node:'))
      || new Set(nodeIds).size !== nodeIds.length) return null;
  const edgeId = value.edgeId === null || value.edgeId === undefined
    ? null : String(value.edgeId).trim();
  if (edgeId !== null && !edgeId.startsWith('edge:')) return null;
  if (edgeId && nodeIds.length) return null;
  return Object.freeze({
    nodeIds: Object.freeze(nodeIds),
    edgeId,
  });
}
