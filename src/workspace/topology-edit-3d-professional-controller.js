import './topology-edit-clean.css';
import {
  TopologyEdit3DViewController as InteractionController,
} from './topology-edit-3d-interaction-controller.js';
import {
  TopologyEditProfessionalOperationRuntime,
} from './viewport-productivity/topology-edit-professional-operation-runtime.js';
import {
  ensureTopologyEditProfessionalOperationStyles,
} from './viewport-productivity/topology-edit-professional-operation-styles.js';
import {
  topologyEditSelectionDescription,
} from './topology-edit/topology-edit-command-ui.js';
import { WorkspaceState } from './workspace-state.js';
import {
  createTopologyEditEditorStore,
} from './topology-edit/editor-state/topology-edit-editor-store.js';
import {
  TopologyEditSelectionCoordinator,
} from './topology-edit/editor-state/topology-edit-selection-coordinator.js';

const PRIMARY_NAVIGATION_SELECTORS = Object.freeze([
  '[data-navigation-mode="select"]',
  '[data-navigation-mode="orbit"]',
  '[data-navigation-mode="pan"]',
  '[data-navigation-action="fit"]',
]);

const PANEL_LABELS = Object.freeze({
  'topology-edit-canonical-search': 'Find object',
  'topology-edit-comparison': 'Changes',
  'topology-edit-review': 'Review & provenance',
  'topology-edit-inspection': 'Selection & measure',
  'topology-edit-professional-interaction': 'Move & nudge',
  'topology-edit-professional-operation': 'Professional operation',
  'topology-edit-checker': 'Issues & suggestions',
});

export class TopologyEdit3DViewController extends InteractionController {
  constructor(eventBus, lifecycleOptions = {}) {
    super(eventBus, lifecycleOptions);
    this.professionalElement = null;
    this.professionalRuntime = new TopologyEditProfessionalOperationRuntime(this);
    this.editorDatasetObject = null;
    this.editorDatasetEpoch = 0;
    const initialLegacySelection = this.selection;
    this.editorStore = createTopologyEditEditorStore();
    this.selectionCoordinator = new TopologyEditSelectionCoordinator({
      store: this.editorStore,
      eventBus: this.eventBus,
      getTopology: () => this.session?.currentTopology?.() ?? null,
      onSelectionChanged: (payload) => this.handleUnifiedSelectionChanged(payload),
    });
    delete this.selection;
    Object.defineProperty(this, 'selection', {
      configurable: true,
      enumerable: true,
      get: () => this.selectionCoordinator.legacySelection(),
      set: (value) => this.selectionCoordinator.applyLegacySelection(value, 'command'),
    });
    this.selection = initialLegacySelection;
    const getBaseViewState = this.lifecycle.getViewState;
    this.lifecycle.getViewState = () => ({
      ...getBaseViewState(),
      professionalOperation: this.professionalRuntime.viewState(),
    });
  }

  async activate() {
    this.selectionCoordinator.connect();
    try {
      await super.activate();
      await this.professionalRuntime.loadCatalogue();
    } catch (error) {
      this.selectionCoordinator.disconnect();
      throw error;
    }
  }

  buildShell() {
    super.buildShell();
    ensureTopologyEditProfessionalOperationStyles(this.hostElement?.ownerDocument);
    const section = this.hostElement?.ownerDocument.createElement('section');
    if (!section || !this.checkerElement) {
      throw new Error('TopologyEditProfessionalController: panel host is unavailable.');
    }
    section.dataset.role = 'topology-edit-professional-operation';
    section.className = 'topology-edit-professional-operation';
    section.setAttribute('aria-label', 'Professional engineering operation');
    this.checkerElement.before(section);
    this.professionalElement = section;
    this.professionalRuntime.mount(section);
    organizeCleanTopologyEditShell(this.hostElement);
  }

  deactivate() {
    this.selectionCoordinator.disconnect();
    this.professionalRuntime.destroy();
    this.professionalElement = null;
    this.editorDatasetObject = null;
    this.editorDatasetEpoch = 0;
    super.deactivate();
  }

  refreshFromWorkspace() {
    const snapshot = WorkspaceState.getSnapshot();
    this.editorDatasetObject = snapshot?.dataset ?? null;
    this.editorDatasetEpoch = Number(snapshot?.version ?? 0);
    return super.refreshFromWorkspace();
  }

  refreshView(canonical) {
    this.syncEditorDatasetIdentity(canonical);
    this.editorStore.getState().actions.updateCanonicalIdentity(
      canonical.canonicalTopologyHash,
      canonicalSelectionIds(canonical),
    );
    super.refreshView(canonical);
    this.professionalRuntime.canonicalChanged(canonical);
  }

  handleViewportSelection(pick, event) {
    if (!this.session) return;
    this.selectionCoordinator.selectPick(pick, event);
    this.presentationToolbar?.update(this.presentationState);
    this.setStatus(topologyEditSelectionDescription(this.selection));
    this.updateActionButtons();
  }

  handleHostClick(event) {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (this.professionalRuntime.handleAction(action)) return;
    return super.handleHostClick(event);
  }

  undo() {
    const receipt = this.professionalRuntime.transaction;
    if (receipt?.resultingCanonicalHash
      === this.session?.currentTopology()?.canonicalTopologyHash) {
      return this.professionalRuntime.undoOperation();
    }
    this.professionalRuntime.transaction = null;
    this.professionalRuntime.redoTransaction = null;
    return super.undo();
  }

  redo() {
    const receipt = this.professionalRuntime.redoTransaction;
    if (receipt?.priorCanonicalHash
      === this.session?.currentTopology()?.canonicalTopologyHash) {
      return this.professionalRuntime.redoOperation();
    }
    this.professionalRuntime.transaction = null;
    this.professionalRuntime.redoTransaction = null;
    return super.redo();
  }

  runCommandAction(actionId) {
    this.professionalRuntime.clear(false, true);
    return super.runCommandAction(actionId);
  }

  applyInteractionPreview() {
    this.professionalRuntime.clear(false, true);
    return super.applyInteractionPreview();
  }

  acceptAutofix() {
    this.professionalRuntime.clear(false, true);
    return super.acceptAutofix();
  }

  restoreDisplayState(viewState = {}) {
    super.restoreDisplayState(viewState);
    this.professionalRuntime.restoreViewState(viewState.professionalOperation);
  }

  reconcileCanonicalSelection(transactionReceipt) {
    return this.editorStore.getState().actions.reconcileSelection(
      transactionReceipt,
      'command',
    );
  }

  syncEditorDatasetIdentity(canonical) {
    const identity = {
      sourceHash: canonical.sourceHash,
      canonicalHash: canonical.canonicalTopologyHash,
      sessionVersion: this.editorDatasetEpoch,
    };
    this.editorStore.getState().actions.replaceDatasetIdentity(identity);
    if (this.hostElement) {
      this.hostElement.dataset.topologyEditDatasetSourceHash =
        identity.sourceHash ?? '';
      this.hostElement.dataset.topologyEditDatasetCanonicalHash =
        identity.canonicalHash ?? '';
      this.hostElement.dataset.topologyEditDatasetSessionVersion =
        String(identity.sessionVersion);
    }
  }

  handleUnifiedSelectionChanged(payload) {
    if (this.hostElement) {
      this.hostElement.dataset.topologyEditSelectionIds =
        payload.selection.canonicalIds.join(',');
      this.hostElement.dataset.topologyEditSelectionPrimaryId =
        payload.selection.primaryId ?? '';
      this.hostElement.dataset.topologyEditSelectionAnchorId =
        payload.selection.anchorId ?? '';
      this.hostElement.dataset.topologyEditSelectionSource =
        payload.selection.source;
      this.hostElement.dataset.topologyEditSelectionRevision =
        String(payload.selection.revision);
      this.hostElement.dataset.topologyEditSelectionHash =
        payload.selection.selectionHash;
    }
    if (this.professionalElement) this.professionalRuntime.selectionChanged();
    if (this.interactionPreview) this.clearInteractionState(false, true);
    this.interactionControllerRuntime?.sync();
    this.presentationToolbar?.update(this.presentationState);
    this.updateActionButtons?.();
  }
}

export function organizeCleanTopologyEditShell(host) {
  if (!host || host.dataset.topologyEditCleanShell === 'true') return;
  const documentRef = host.ownerDocument;
  const toolbar = directChild(host, '.topology-edit-3d-toolbar');
  const canvas = directChild(host, '.topology-edit-3d-canvas');
  const checker = host.querySelector('[data-role="topology-edit-checker"]');
  const tools = toolbar?.querySelector('[data-role="topology-edit-tools"]');
  const presentation = toolbar?.querySelector('[data-role="topology-edit-presentation-toolbar"]');
  const status = toolbar?.querySelector('[data-role="topology-edit-status"]');
  const actions = toolbar?.querySelector('.topology-edit-3d-toolbar__actions');
  const navigation = tools?.querySelector('[aria-label="Topology edit navigation"]');
  if (!documentRef || !toolbar || !canvas || !checker || !tools
    || !presentation || !status || !actions || !navigation) {
    throw new Error('TOPOLOGY_EDIT_CLEAN_SHELL_PREREQUISITE_MISSING');
  }

  host.dataset.topologyEditCleanShell = 'true';
  host.classList.add('topology-edit-clean-shell');

  const workspace = element(documentRef, 'div', 'topology-edit-clean-shell__workspace');
  workspace.dataset.role = 'topology-edit-workspace';
  const sidecar = element(documentRef, 'aside', 'topology-edit-clean-shell__sidecar');
  sidecar.dataset.role = 'topology-edit-sidecar';
  sidecar.setAttribute('aria-label', '3D edit inspector');
  workspace.append(canvas, sidecar);

  const footer = element(documentRef, 'footer', 'topology-edit-clean-shell__footer');
  footer.dataset.role = 'topology-edit-statusbar';

  const brand = element(documentRef, 'div', 'topology-edit-clean-shell__brand');
  brand.innerHTML = '<strong>3D Edit</strong><span>Certified topology</span>';
  const navigationRegion = buildNavigationRegion(documentRef, navigation);
  const history = element(documentRef, 'div', 'topology-edit-clean-shell__history');
  history.setAttribute('role', 'group');
  history.setAttribute('aria-label', 'Edit history');
  moveMatching(tools, history, ['[data-action="undo"]', '[data-action="redo"]']);

  const primaryActions = element(documentRef, 'div', 'topology-edit-clean-shell__primary-actions');
  primaryActions.setAttribute('role', 'group');
  primaryActions.setAttribute('aria-label', 'Draft actions');
  moveMatching(actions, primaryActions, [
    '[data-action="save-draft"]',
    '[data-action="commit-draft"]',
  ]);
  toolbar.replaceChildren(brand, navigationRegion, history, primaryActions);

  const commandPanel = detailsPanel(documentRef, 'Edit', 'commands');
  tools.classList.add('topology-edit-clean-shell__command-grid');
  commandPanel.body.append(tools);
  sidecar.append(commandPanel.details);

  const displayPanel = detailsPanel(documentRef, 'Display', 'display');
  displayPanel.body.append(presentation);
  sidecar.append(displayPanel.details);

  const panels = [...host.children].filter((child) => (
    child !== toolbar
    && child !== canvas
    && child !== workspace
    && child !== footer
    && child.dataset.role !== 'topology-edit-issue-callout-layer'
  ));
  panels.forEach((panel) => wrapExistingPanel(documentRef, sidecar, panel));

  const draftPanel = detailsPanel(documentRef, 'Draft & audit', 'draft');
  moveMatching(actions, draftPanel.body, [
    '[data-action="reload-draft"]',
    '[data-action="export-draft"]',
  ]);
  if (draftPanel.body.childElementCount) sidecar.append(draftPanel.details);

  const previewActions = element(documentRef, 'div', 'topology-edit-clean-shell__preview-actions');
  previewActions.setAttribute('role', 'group');
  previewActions.setAttribute('aria-label', 'Preview actions');
  while (actions.firstChild) previewActions.append(actions.firstChild);
  actions.remove();
  footer.append(status, previewActions);

  const overlay = host.querySelector(':scope > [data-role="topology-edit-issue-callout-layer"]');
  if (overlay) host.insertBefore(workspace, overlay);
  else host.append(workspace);
  host.append(footer);
}

function buildNavigationRegion(documentRef, legacyNavigation) {
  const region = element(documentRef, 'nav', 'topology-edit-clean-shell__navigation');
  region.setAttribute('aria-label', 'Topology edit navigation');
  const primary = element(documentRef, 'div', 'topology-edit-clean-shell__navigation-primary');
  PRIMARY_NAVIGATION_SELECTORS.forEach((selector) => {
    const button = legacyNavigation.querySelector(selector);
    if (button) primary.append(button);
  });
  const views = detailsPanel(documentRef, 'Views', 'views');
  while (legacyNavigation.firstChild) views.body.append(legacyNavigation.firstChild);
  region.append(primary);
  if (views.body.childElementCount) region.append(views.details);
  legacyNavigation.remove();
  return region;
}

function wrapExistingPanel(documentRef, sidecar, panel) {
  if (panel.closest('[data-role="topology-edit-sidecar"]')) return;
  const role = panel.dataset.role || '';
  const label = PANEL_LABELS[role]
    || panel.getAttribute('aria-label')
    || humanize(role || panel.className || 'Details');
  const wrapper = detailsPanel(documentRef, label, role || 'details');
  wrapper.body.append(panel);
  sidecar.append(wrapper.details);
}

function detailsPanel(documentRef, label, kind) {
  const details = element(documentRef, 'details', 'topology-edit-clean-shell__panel');
  details.dataset.panelKind = kind;
  const summary = documentRef.createElement('summary');
  summary.textContent = label;
  const body = element(documentRef, 'div', 'topology-edit-clean-shell__panel-body');
  details.append(summary, body);
  return { details, body };
}

function moveMatching(source, destination, selectors) {
  selectors.forEach((selector) => {
    const elementToMove = source.querySelector(selector);
    if (elementToMove) destination.append(elementToMove);
  });
}

function directChild(host, selector) {
  return [...host.children].find((child) => child.matches(selector)) || null;
}

function element(documentRef, tagName, className) {
  const value = documentRef.createElement(tagName);
  value.className = className;
  return value;
}

function humanize(value) {
  return String(value || 'Details')
    .replace(/^topology-edit-/, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function canonicalSelectionIds(canonical) {
  return [
    ...(canonical.nodes ?? []).map((row) => row.id),
    ...(canonical.edges ?? []).map((row) => row.id),
    ...(canonical.junctions ?? []).map((row) => row.id),
    ...(canonical.supports ?? []).map((row) => row.id),
    ...(canonical.boundaries ?? []).map((row) => row.id),
    ...(canonical.rigids ?? []).map((row) => row.id),
    ...(canonical.bends ?? []).map((row) => row.id),
  ];
}
