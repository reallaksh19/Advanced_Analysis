/** Production Topology Edit controller with governed Wave 4 lifecycle actions. */
import {
  TopologyEdit3DViewController as TopologyEdit3DViewControllerCore,
} from './topology-edit-3d-view-controller-core.js';
import { EVENT_TOPICS } from './event-topics.js';
import { deepFreeze } from '../core/shared-piping-model/index.js';
import {
  canRunTopologyEditAction,
  createTopologyEditSelection,
  topologyEditSelectionDescription,
  updateTopologyEditSelection,
} from './topology-edit/topology-edit-command-ui.js';
import { TopologyEditLifecycleController } from './topology-edit/topology-edit-lifecycle-controller.js';
import { topologyEditEntityIdsForObject } from './topology-edit/topology-edit-render-packet.js';
import { retainTypedTopologyEditPrimitives } from './topology-edit/topology-edit-typed-viewport-backend.js';
import { TopologyEditSupportViewportBackend } from './topology-edit/topology-edit-support-viewport-backend.js';

export { buildAutofixPolicy } from './topology-edit-3d-view-controller-core.js';

const CANONICAL_NODE_ID_PATTERN = /^node:[^\s]+$/;
const CANONICAL_EDGE_ID_PATTERN = /^edge:[^\s]+$/;
const EMPTY_TOPOLOGY_EDIT_VIEW_SELECTION = Object.freeze({
  nodeIds: Object.freeze([]),
  edgeId: null,
});
const NAVIGATION_MODES = new Set(['select', 'orbit', 'pan']);

export class TopologyEdit3DViewController extends TopologyEdit3DViewControllerCore {
  constructor(eventBus, lifecycleOptions = {}) {
    super(eventBus);
    this.lastPersistenceError = null;
    this.lastDraftPackageHash = null;
    this.lastExportSealedHash = null;
    this.lastCommitReceiptHash = null;
    this.lastCommitDisposition = null;
    this.viewportSelectionHandler = (pick, event) => this.handleViewportSelection(pick, event);
    this.sharedNavigationHandler = (event) => this.handleSharedNavigation(event);
    this.lifecycle = new TopologyEditLifecycleController({
      getSession: () => this.session,
      getViewState: () => ({
        presentationState: this.presentationState,
        selection: this.selection,
      }),
      ...lifecycleOptions,
    });
  }

  createViewportBackend() {
    return new TopologyEditSupportViewportBackend();
  }

  async activate() {
    await super.activate();
    this.installTypedViewportBackend();
    this.canvasMount?.removeEventListener('pointerdown', this.pointerHandler);
    this.viewportBackend?.setSelectionRequestHandler(this.viewportSelectionHandler);
    this.hostElement?.ownerDocument?.addEventListener(
      'click',
      this.sharedNavigationHandler,
      true,
    );
    this.setNavigationMode('select', true);
  }

  installTypedViewportBackend() {
    if (!(this.viewportBackend instanceof TopologyEditSupportViewportBackend)) {
      throw new Error(
        'TOPOLOGY_EDIT_SUPPORT_BACKEND_FACTORY_MISMATCH: Activation must mount the support-glyph backend directly.',
      );
    }
  }

  deriveVisual(canonical, modelRole) {
    const result = super.deriveVisual(canonical, modelRole);
    return deepFreeze({
      model: result.model,
      projection: retainTypedTopologyEditPrimitives(result.model, result.projection),
    });
  }

  buildShell() {
    super.buildShell();
    const tools = this.hostElement?.querySelector('[data-role="topology-edit-tools"]');
    if (!tools) throw new Error('TopologyEdit3DViewController: navigation tool host is missing.');
    tools.insertAdjacentHTML('beforeend', navigationMarkup());
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
    this.hostElement?.ownerDocument?.removeEventListener(
      'click',
      this.sharedNavigationHandler,
      true,
    );
    this.viewportBackend?.setSelectionRequestHandler(null);
    super.deactivate();
    this.lastPersistenceError = null;
    this.lastDraftPackageHash = null;
    this.lastExportSealedHash = null;
    this.lastCommitReceiptHash = null;
    this.lastCommitDisposition = null;
  }

  handleHostClick(event) {
    const navigationMode = event.target.closest('[data-navigation-mode]');
    if (navigationMode) return this.setNavigationMode(navigationMode.dataset.navigationMode);
    const navigationAction = event.target.closest('[data-navigation-action]');
    if (navigationAction) return this.runNavigationAction(navigationAction.dataset.navigationAction);
    const standardView = event.target.closest('[data-standard-view]');
    if (standardView) return this.runStandardView(standardView.dataset.standardView);
    if (event.target.closest('[data-action="save-draft"]')) return this.saveDraft();
    if (event.target.closest('[data-action="reload-draft"]')) return this.reloadDraft();
    if (event.target.closest('[data-action="export-draft"]')) return this.exportDraft();
    if (event.target.closest('[data-action="commit-draft"]')) return this.commitDraft();
    return super.handleHostClick(event);
  }

  handleSharedNavigation(event) {
    const trigger = event.target?.closest?.('[data-viewport-action]');
    const workspaceShell = this.hostElement?.closest('.workspace-shell');
    if (!trigger || !workspaceShell?.contains(trigger) || trigger.disabled) return;
    const action = String(trigger.dataset.viewportAction || '');
    if (!action) return;
    event.preventDefault();
    event.stopPropagation();
    if (action.startsWith('mode-')) {
      this.setNavigationMode(action.slice('mode-'.length));
      return;
    }
    if (action.startsWith('view-')) {
      this.runStandardView(action.slice('view-'.length));
      return;
    }
    const aliases = {
      fit: 'fit',
      'fit-selection': 'fit-selection',
      'pivot-selection': 'pivot-selection',
      home: 'home',
      reset: 'home',
      'previous-view': 'previous',
      'toggle-projection': 'projection',
    };
    const localAction = aliases[action];
    if (!localAction) {
      throw new TypeError(`Unsupported shared topology edit navigation action: ${action}`);
    }
    this.runNavigationAction(localAction);
  }

  handleViewportSelection(pick, event) {
    if (!this.session) return;
    if (!pick?.objectId) {
      this.selection = createTopologyEditSelection();
      this.presentationToolbar?.update(this.presentationState);
      this.setStatus('Selection cleared.');
      this.updateActionButtons();
      return;
    }
    if (pick.objectKind === 'node' || pick.objectKind === 'component') {
      this.selection = updateTopologyEditSelection(
        this.selection,
        pick.objectId,
        event?.shiftKey === true,
      );
    }
    const entityIds = pick.workspaceEntityIds?.length
      ? pick.workspaceEntityIds
      : topologyEditEntityIdsForObject(this.session.currentTopology(), pick.objectId);
    if (entityIds.length) {
      this.eventBus.publish(EVENT_TOPICS.VIEWPORT_SELECTION_REQUESTED, {
        entityId: entityIds[0],
        source: 'topology-edit-3d',
      });
    }
    this.presentationToolbar?.update(this.presentationState);
    this.setStatus(selectionMessage(pick, this.selection));
    this.updateActionButtons();
  }

  setNavigationMode(mode, silent = false) {
    if (!NAVIGATION_MODES.has(mode)) {
      throw new TypeError(`Unsupported topology edit navigation mode: ${mode}`);
    }
    this.viewportBackend?.setInteractionContext(mode);
    this.hostElement?.querySelectorAll('[data-navigation-mode]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.navigationMode === mode));
    });
    if (this.hostElement) this.hostElement.dataset.topologyEditNavigationMode = mode;
    if (!silent) this.setStatus(`Navigation mode: ${mode}.`);
  }

  runNavigationAction(action) {
    const backend = this.viewportBackend;
    if (!backend) return;
    if (action === 'fit') backend.fitAll();
    else if (action === 'fit-selection') backend.fitSelection();
    else if (action === 'home') backend.home();
    else if (action === 'previous') backend.previousView();
    else if (action === 'pivot-selection') backend.pivotSelection();
    else if (action === 'projection') {
      const projection = backend.toggleProjection();
      if (this.hostElement) this.hostElement.dataset.topologyEditProjection = projection;
      this.setStatus(`Projection: ${projection}.`);
      return;
    } else throw new TypeError(`Unsupported topology edit navigation action: ${action}`);
    this.setStatus(`View command: ${action}.`);
  }

  runStandardView(view) {
    this.viewportBackend?.setStandardView(view);
    this.setStatus(`Standard view: ${String(view).toUpperCase()}.`);
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
    this.selection = restoreTopologyEditViewSelection(viewState.selection)
      ?? EMPTY_TOPOLOGY_EDIT_VIEW_SELECTION;
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
  if (!value.nodeIds.every((id) => (
    typeof id === 'string' && CANONICAL_NODE_ID_PATTERN.test(id)
  ))) return null;
  const nodeIds = [...value.nodeIds];
  if (new Set(nodeIds).size !== nodeIds.length) return null;
  const edgeId = value.edgeId === null || value.edgeId === undefined
    ? null
    : value.edgeId;
  if (edgeId !== null && (
    typeof edgeId !== 'string' || !CANONICAL_EDGE_ID_PATTERN.test(edgeId)
  )) return null;
  if (edgeId && nodeIds.length) return null;
  return Object.freeze({
    nodeIds: Object.freeze(nodeIds),
    edgeId,
  });
}

function navigationMarkup() {
  return `
    <span role="group" aria-label="Topology edit navigation">
      <button type="button" data-navigation-mode="select" aria-pressed="true">Select</button>
      <button type="button" data-navigation-mode="orbit" aria-pressed="false">Orbit</button>
      <button type="button" data-navigation-mode="pan" aria-pressed="false">Pan</button>
      <button type="button" data-navigation-action="fit">Fit</button>
      <button type="button" data-navigation-action="fit-selection">Fit selection</button>
      <button type="button" data-navigation-action="home">Home</button>
      <button type="button" data-navigation-action="previous">Previous</button>
      <button type="button" data-navigation-action="pivot-selection">Pivot selection</button>
      <button type="button" data-navigation-action="projection">Projection</button>
      <button type="button" data-standard-view="iso">Iso</button>
      <button type="button" data-standard-view="top">Top</button>
      <button type="button" data-standard-view="front">Front</button>
      <button type="button" data-standard-view="right">Right</button>
    </span>`;
}

function selectionMessage(pick, selection) {
  if (pick.objectKind === 'restraint') {
    return `Selected ${pick.restraintFamily || 'restraint'} ${pick.restraintId} on support ${pick.supportId}.`;
  }
  if (pick.objectKind === 'support') return `Selected support ${pick.supportId || pick.objectId}.`;
  return topologyEditSelectionDescription(selection);
}
