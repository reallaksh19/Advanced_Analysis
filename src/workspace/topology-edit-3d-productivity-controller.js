import {
  TopologyEdit3DViewController as AuthoringController,
} from './topology-edit-3d-authoring-controller.js';
import {
  TopologyEditCleanShellRuntime,
} from './viewport-productivity/topology-edit-clean-shell-runtime.js';
import './topology-edit-productivity.css';

/** Adds presentation-only productivity behavior without acquiring topology authority. */
export class TopologyEdit3DViewController extends AuthoringController {
  constructor(eventBus, lifecycleOptions = {}) {
    super(eventBus, lifecycleOptions);
    this.cleanShellRuntime = new TopologyEditCleanShellRuntime(this);
    this.tableAdapter = null;
    this.tableAdapterPromise = null;
    this.sourceVisualCache = null;
    this.sourceVisualCacheDataset = null;
    this.sourceVisualCacheKey = '';
    const getProfessionalViewState = this.lifecycle.getViewState;
    this.lifecycle.getViewState = () => ({
      ...getProfessionalViewState(),
      cleanShell: this.cleanShellRuntime.viewState(),
    });
  }

  async activate() {
    await super.activate();
    if (!this.hostElement) return;
    await this.mountTableAdapter();
  }

  async mountTableAdapter() {
    if (this.tableAdapter || this.tableAdapterPromise || !this.hostElement) return this.tableAdapter;
    const activationHost = this.hostElement;
    this.tableAdapterPromise = import(
      './viewport-productivity/topology-edit-table-productivity-adapter.js'
    ).then(({ createTopologyEditTableProductivityAdapter }) => {
      if (!this.hostElement || this.hostElement !== activationHost) return null;
      const adapter = createTopologyEditTableProductivityAdapter(this).mount();
      this.tableAdapter = adapter;
      return adapter;
    }).finally(() => { this.tableAdapterPromise = null; });
    return this.tableAdapterPromise;
  }

  buildShell() {
    super.buildShell();
    const primaryNavigation = this.hostElement?.querySelector(
      '.topology-edit-clean-shell__navigation-primary',
    );
    const fitSelection = this.hostElement?.querySelector(
      '[data-navigation-action="fit-selection"]',
    );
    if (primaryNavigation && fitSelection) primaryNavigation.append(fitSelection);
    const sidecar = this.hostElement?.querySelector('[data-role="topology-edit-sidecar"]');
    if (!sidecar) throw new Error('TopologyEditProductivityController: sidecar is unavailable.');
    sidecar.tabIndex = -1;
    this.cleanShellRuntime.mount(this.hostElement);
  }

  deriveVisual(canonical, modelRole) {
    const role = String(modelRole || 'DRAFT').toUpperCase();
    if (role !== 'SOURCE') return super.deriveVisual(canonical, modelRole);
    const key = sourceVisualKey(canonical);
    if (
      this.sourceVisualCache
      && this.sourceVisualCacheDataset === this.workspaceDataset
      && this.sourceVisualCacheKey === key
    ) {
      if (this.hostElement) this.hostElement.dataset.topologyEditSourceVisualCache = 'HIT';
      return this.sourceVisualCache;
    }
    const result = super.deriveVisual(canonical, modelRole);
    this.sourceVisualCache = result;
    this.sourceVisualCacheDataset = this.workspaceDataset;
    this.sourceVisualCacheKey = key;
    if (this.hostElement) this.hostElement.dataset.topologyEditSourceVisualCache = 'MISS';
    return result;
  }

  refreshView(canonical) {
    super.refreshView(canonical);
    this.tableAdapter?.canonicalChanged(canonical);
  }

  deactivate() {
    this.tableAdapter?.destroy();
    this.tableAdapter = null;
    this.tableAdapterPromise = null;
    this.cleanShellRuntime.destroy();
    this.sourceVisualCache = null;
    this.sourceVisualCacheDataset = null;
    this.sourceVisualCacheKey = '';
    super.deactivate();
  }

  handleHostClick(event) {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (this.cleanShellRuntime.handleAction(action)) {
      if (action === 'open-engineering-table') this.tableAdapter?.runtime.render();
      return;
    }
    return super.handleHostClick(event);
  }

  restoreDisplayState(viewState = {}) {
    super.restoreDisplayState(viewState);
    this.cleanShellRuntime.restoreViewState(viewState.cleanShell);
  }

  reloadDraft() {
    const draftPanelWasOpen = Boolean(
      this.hostElement?.querySelector('details[data-panel-kind="draft"]')?.open,
    );
    const result = super.reloadDraft();
    if (draftPanelWasOpen) this.cleanShellRuntime.openPanel('draft');
    return result;
  }

  handleUnifiedSelectionChanged(payload) {
    super.handleUnifiedSelectionChanged(payload);
    this.tableAdapter?.selectionChanged(payload);
    this.cleanShellRuntime.selectionChanged(payload);
  }

  undo() {
    if (this.tableAdapter?.undoIfCurrent()) return true;
    return super.undo();
  }

  redo() {
    if (this.tableAdapter?.redoIfCurrent()) return true;
    return super.redo();
  }

  runCommandAction(actionId) {
    this.tableAdapter?.clearCandidate();
    return super.runCommandAction(actionId);
  }

  applyInteractionPreview() {
    this.tableAdapter?.clearCandidate();
    return super.applyInteractionPreview();
  }

  acceptAutofix() {
    this.tableAdapter?.clearCandidate();
    return super.acceptAutofix();
  }

  renderCheckerPanel() {
    super.renderCheckerPanel();
    this.cleanShellRuntime.issuesChanged({
      issueCount: (this.issues?.length ?? 0) + (this.visualDiagnostics?.length ?? 0),
      suggestionCount: this.autofixSuggestions?.length ?? 0,
    });
  }

  updateLifecycleEvidence() {
    super.updateLifecycleEvidence();
    this.cleanShellRuntime?.updateDraftStatus();
  }

  updateActionButtons() {
    super.updateActionButtons();
    this.cleanShellRuntime?.updateAvailability();
  }
}

function sourceVisualKey(canonical) {
  return `${String(canonical?.sourceHash || '')}:${String(canonical?.canonicalTopologyHash || '')}`;
}
