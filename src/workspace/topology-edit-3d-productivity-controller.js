import {
  TopologyEdit3DViewController as AuthoringController,
} from './topology-edit-3d-authoring-controller.js';
import {
  TopologyEditCleanShellRuntime,
} from './viewport-productivity/topology-edit-clean-shell-runtime.js';
import {
  TopologyEditTableRuntime,
} from './viewport-productivity/topology-edit-table-runtime.js';
import {
  TopologyEditTableCanvasCoordinator,
} from './viewport-productivity/topology-edit-table-canvas-coordinator.js';
import './topology-edit-productivity.css';

/** Adds presentation-only productivity behavior without acquiring topology authority. */
export class TopologyEdit3DViewController extends AuthoringController {
  constructor(eventBus, lifecycleOptions = {}) {
    super(eventBus, lifecycleOptions);
    this.cleanShellRuntime = new TopologyEditCleanShellRuntime(this);
    this.tableRuntime = new TopologyEditTableRuntime(this);
    this.tableCoordinator = new TopologyEditTableCanvasCoordinator(this, this.tableRuntime);
    this.tableRuntime.setCoordinator(this.tableCoordinator);
    this.tableElement = null;
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
    if (!sidecar) throw new Error('TopologyEditProductivityController: sidecar is unavailable.');
    sidecar.tabIndex = -1;
    const tablePanel = createTablePanel(sidecar.ownerDocument);
    sidecar.prepend(tablePanel.details);
    this.tableElement = tablePanel.section;
    this.tableRuntime.mount(this.tableElement);
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
    this.tableCoordinator.canonicalChanged(canonical);
    this.tableCoordinator.selectionChanged({
      selection: this.editorStore.getState().selection,
    });
  }

  deactivate() {
    this.tableRuntime.destroy();
    this.tableCoordinator.reset();
    this.tableElement = null;
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
    this.tableCoordinator.selectionChanged(payload);
    this.cleanShellRuntime.selectionChanged(payload);
  }

  undo() {
    const receipt = this.tableRuntime.transaction;
    if (receipt?.resultingCanonicalHash
      === this.session?.currentTopology()?.canonicalTopologyHash) {
      return this.tableRuntime.undoOperation();
    }
    if (receipt) {
      this.tableRuntime.transaction = null;
      this.tableRuntime.redoTransaction = null;
    }
    return super.undo();
  }

  redo() {
    const receipt = this.tableRuntime.redoTransaction;
    if (receipt?.priorCanonicalHash
      === this.session?.currentTopology()?.canonicalTopologyHash) {
      return this.tableRuntime.redoOperation();
    }
    if (receipt) {
      this.tableRuntime.transaction = null;
      this.tableRuntime.redoTransaction = null;
    }
    return super.redo();
  }

  runCommandAction(actionId) {
    this.tableRuntime.clearCandidate();
    return super.runCommandAction(actionId);
  }

  applyInteractionPreview() {
    this.tableRuntime.clearCandidate();
    return super.applyInteractionPreview();
  }

  acceptAutofix() {
    this.tableRuntime.clearCandidate();
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

function createTablePanel(documentRef) {
  const details = documentRef.createElement('details');
  details.className = 'topology-edit-clean-shell__panel';
  details.dataset.panelKind = 'table';
  details.open = true;
  const summary = documentRef.createElement('summary');
  summary.textContent = 'Engineering table — exact canonical projection';
  const body = documentRef.createElement('div');
  body.className = 'topology-edit-clean-shell__panel-body';
  const section = documentRef.createElement('section');
  section.dataset.role = 'topology-edit-table';
  section.setAttribute('aria-label', 'Engineering table editor');
  body.append(section);
  details.append(summary, body);
  return { details, section };
}

function sourceVisualKey(canonical) {
  return `${String(canonical?.sourceHash || '')}:${String(canonical?.canonicalTopologyHash || '')}`;
}
