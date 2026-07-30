import { EventBus } from './event-bus.js';
import { EVENT_TOPICS } from './event-topics.js';
import { buildResolvedEngineeringGeometry } from './resolved-engineering-geometry.js';
import { buildViewportRenderModel } from './viewport-render-model.js';
import { ViewportRenderer } from './viewport-renderer.js';
import { SequentialEditPanel } from './sequential-sketcher/sequential-edit-panel.js';
import { SequentialCommandGateway } from './sequential-sketcher/sequential-command-gateway.js';
import { WorkspaceState } from './workspace-state.js';

import { SequentialTableStore } from './sequential-sketcher/sequential-table-store.js';
import { SequentialTopologyTableView } from './sequential-sketcher/sequential-topology-table-view.js';

export class ViewportPanel {
  constructor(rootElement, eventBus = EventBus, renderer = new ViewportRenderer()) {
    if (!rootElement) throw new TypeError('ViewportPanel requires a root element.');
    this.rootElement = rootElement;
    this.eventBus = eventBus;
    this.renderer = renderer;
    this.unsubscribers = [];
    this.datasetReference = null;
    this.resolvedGeometry = null;
    this.renderModel = null;
    this.gateway = new SequentialCommandGateway(WorkspaceState, eventBus);
    this.tableStore = new SequentialTableStore(WorkspaceState, this.gateway);
    this.tableView = null;
    this.editPanel = null;
    this.handleClick = this.handleClick.bind(this);
    this.handleSelectionRequest = this.handleSelectionRequest.bind(this);
  }

  init() {
    if (this.unsubscribers.length > 0) return;
    this.statusElement = this.requireElement('[data-role="viewport-status"]');
    this.selectionElement = this.requireElement('[data-role="viewport-selection"]');
    this.hostElement = this.requireElement('[data-role="viewport-render-host"]');

    const editBarHost = this.rootElement.querySelector('[data-role="viewport-edit-bar"]');
    if (editBarHost) {
      this.editPanel = new SequentialEditPanel(editBarHost, this.gateway);
      this.editPanel.render(null);
    }

    const tableDockHost = this.rootElement.querySelector('[data-role="viewport-table-dock"]');
    if (tableDockHost) {
      this.tableView = new SequentialTopologyTableView(tableDockHost, this.tableStore);
      this.tableView.mount();
    }

    this.renderer.setSelectionRequestHandler(this.handleSelectionRequest);
    this.renderer.mount(this.hostElement);
    this.updateCapabilities();

    this.unsubscribers = [
      this.eventBus.subscribe(
        EVENT_TOPICS.WORKSPACE_SNAPSHOT_CHANGED,
        ({ snapshot }) => this.renderSnapshot(snapshot),
      ),
      this.eventBus.subscribe(
        EVENT_TOPICS.DATASET_LOAD_FAILED,
        (payload) => this.renderImportFailure(payload.message),
      ),
      this.eventBus.subscribe(EVENT_TOPICS.DATASET_CLEARED, () => this.clear()),
      this.eventBus.subscribe(
        EVENT_TOPICS.VIEWPORT_ENTITY_SELECTED,
        (payload) => this.renderSelection(payload.entityId),
      ),
    ];
    this.rootElement.addEventListener('click', this.handleClick);
  }

  requireElement(selector) {
    const element = this.rootElement.querySelector(selector);
    if (!element) throw new Error(`ViewportPanel element is missing: ${selector}`);
    return element;
  }

  renderSnapshot(snapshot) {
    if (snapshot.status !== 'ready' || !snapshot.dataset) return;

    if (snapshot.dataset !== this.datasetReference) {
      this.datasetReference = snapshot.dataset;
      this.resolvedGeometry = buildResolvedEngineeringGeometry(snapshot.dataset);
      this.renderModel = buildViewportRenderModel(this.resolvedGeometry);
      this.renderer.renderModel(this.renderModel);
      this.updateCapabilities(); // In case fallback triggered during mount/render
      this.statusElement.textContent = statusText(
        snapshot.dataset.datasetId,
        this.renderer.backendName,
        this.renderModel.summary,
      );
    }
    this.renderSelection(snapshot.selectedEntityId);
  }

  renderSelection(entityId) {
    const selectedId = String(entityId || '');
    this.renderer.setSelection(selectedId);
    this.selectionElement.textContent = selectedId
      ? `Selection: ${selectedId}`
      : 'Selection: none';
    if (this.editPanel) {
      this.editPanel.render(selectedId || null);
    }
  }

  renderImportFailure(message) {
    const retained = this.renderModel?.summary.renderableCount || 0;
    this.statusElement.textContent = retained
      ? `Import failed · retained ${retained} rendered · ${message}`
      : `Import failed: ${message}`;
  }

  handleSelectionRequest(entityId) {
    this.eventBus.publish(EVENT_TOPICS.VIEWPORT_SELECTION_REQUESTED, {
      entityId,
      source: 'viewport',
    });
  }

  handleClick(event) {
    const trigger = event.target?.closest?.('[data-viewport-action]');
    if (!trigger || !this.rootElement.contains(trigger) || trigger.disabled) return;
    const action = trigger.dataset.viewportAction;

    if (action === 'fit') this.renderer.fitView();
    if (action === 'fit-selection') this.renderer.fitSelection();
    if (action === 'home' || action === 'reset') this.renderer.home ? this.renderer.home() : this.renderer.resetView();
    
    if (action === 'view-iso') this.renderer.setStandardView('iso');
    if (action === 'view-top') this.renderer.setStandardView('top');
    if (action === 'view-front') this.renderer.setStandardView('front');
    if (action === 'view-right') this.renderer.setStandardView('right');

    if (action === 'mode-select') this.renderer.setInteractionContext('select');
    if (action === 'mode-orbit') this.renderer.setInteractionContext('orbit');
    if (action === 'mode-pan') this.renderer.setInteractionContext('pan');
  }

  updateCapabilities() {
    const caps = this.renderer.getCapabilities();
    const actionButtons = this.rootElement.querySelectorAll('[data-viewport-action]');
    actionButtons.forEach(btn => {
      const action = btn.dataset.viewportAction;
      if (action === 'mode-select' && !caps.select) btn.disabled = true;
      else if (action === 'mode-orbit' && !caps.orbit) btn.disabled = true;
      else if (action === 'mode-pan' && !caps.pan) btn.disabled = true;
      else if (action === 'fit' && !caps.fitAll) btn.disabled = true;
      else if (action === 'fit-selection' && !caps.fitSelection) btn.disabled = true;
      else if ((action === 'home' || action === 'reset') && !caps.home) btn.disabled = true;
      else if (action.startsWith('view-') && !caps.standardViews) btn.disabled = true;
      else btn.disabled = false;
    });
  }

  clear() {
    this.datasetReference = null;
    this.resolvedGeometry = null;
    this.renderModel = null;
    this.renderer.clear();
    this.statusElement.textContent = 'No dataset loaded';
    this.selectionElement.textContent = 'Selection: none';
  }

  destroy() {
    this.rootElement.removeEventListener('click', this.handleClick);
    this.unsubscribers.forEach((unsubscribe) => unsubscribe());
    this.unsubscribers = [];
    this.datasetReference = null;
    this.resolvedGeometry = null;
    this.renderModel = null;
    this.renderer.setSelectionRequestHandler(null);
    this.renderer.destroy();
  }
}

function statusText(datasetId, backend, summary) {
  return [
    datasetId,
    backend,
    `${summary.renderableCount} rendered`,
    `${summary.resolvedCount || 0} resolved`,
    `${summary.fallbackCount || 0} fallback`,
    `${summary.skippedCount} skipped`,
  ].join(' · ');
}
