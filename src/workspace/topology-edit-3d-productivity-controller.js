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
    this.sourceVisualCache = null;
    this.sourceVisualCacheDataset = null;
    this.sourceVisualCacheKey = '';
    const getProfessionalViewState = this.lifecycle.getViewState;
    this.lifecycle.getViewState = () => ({
      ...getProfessionalViewState(),
      cleanShell: this.cleanShellRuntime.viewState(),
    });
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
    if (sidecar) sidecar.tabIndex = -1;
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

  deactivate() {
    this.cleanShellRuntime.destroy();
    this.sourceVisualCache = null;
    this.sourceVisualCacheDataset = null;
    this.sourceVisualCacheKey = '';
    super.deactivate();
  }

  handleHostClick(event) {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (this.cleanShellRuntime.handleAction(action)) return;
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
    this.cleanShellRuntime.selectionChanged(payload);
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
