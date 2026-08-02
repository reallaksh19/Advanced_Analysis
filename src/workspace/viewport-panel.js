import { ENGINEERING_MODEL_EVENTS } from './engineering-model-controller.js';
import { engineeringModelStore } from './engineering-model-store.js';
import { EventBus } from './event-bus.js';
import { EVENT_TOPICS } from './event-topics.js';
import { masterDataController } from './master-data-controller.js';
import {
  MODEL_ZONE_EVENTS,
  projectDatasetForModelZone,
} from './model-zone-selector.js';
import {
  filterResolvedGeometryForModelZone,
  projectSupportSiteModelForModelZone,
} from './model-zone-viewport-projection.js';
import { projectDataStore } from './project-data/project-data-store.js';
import { buildResolvedEngineeringGeometry } from './resolved-engineering-geometry.js';
import { SequentialCommandGateway } from './sequential-sketcher/sequential-command-gateway.js';
import { SequentialEditPanel } from './sequential-sketcher/sequential-edit-panel.js';
import { SequentialTableStore } from './sequential-sketcher/sequential-table-store.js';
import { SequentialTopologyTableView } from './sequential-sketcher/sequential-topology-table-view.js';
import { buildViewportRenderModel } from './viewport-render-model.js';
import { ViewportRenderer } from './viewport-renderer.js';
import { WorkspaceState } from './workspace-state.js';

/** Owns one mounted renderer, governed edit preview, and cross-view selection. */
export class ViewportPanel {
  constructor(rootElement, eventBus, renderer) {
    if (!rootElement) throw new TypeError('ViewportPanel requires a root element.');
    this.rootElement = rootElement;
    this.eventBus = eventBus || EventBus;
    this.renderer = renderer || new ViewportRenderer();
    this.gateway = new SequentialCommandGateway(WorkspaceState, this.eventBus);
    this.tableStore = new SequentialTableStore(WorkspaceState, this.gateway, this.eventBus);
    this.unsubscribers = [];
    this.datasetReference = null;
    this.zoneSelection = null;
    this.handleClick = (event) => this.click(event);
    this.handleSelectionRequest = (entityId) => this.selectionRequested(entityId);
    this.handleToolSelected = (event) => this.toolSelected(event);
  }

  init() {
    if (this.unsubscribers.length) return;
    this.statusElement = this.requireElement('[data-role="viewport-status"]');
    this.selectionElement = this.requireElement('[data-role="viewport-selection"]');
    this.hostElement = this.requireElement('[data-role="viewport-render-host"]');
    const editHost = this.rootElement.querySelector('[data-role="viewport-edit-bar"]');
    this.editPanel = new SequentialEditPanel(editHost, this.gateway);
    this.editPanel.onActionRequested = (request) => this.editAction(request);
    this.editPanel.render(null);
    const tableHost = this.rootElement.querySelector('[data-role="viewport-table-dock"]');
    this.tableView = new SequentialTopologyTableView(tableHost, this.tableStore);
    this.tableView.mount();
    this.renderer.setSelectionRequestHandler(this.handleSelectionRequest);
    this.renderer.mount(this.hostElement);
    this.unsubscribers = [
      this.eventBus.subscribe(MODEL_ZONE_EVENTS.CHANGED, ({ selection, dataset }) => this.zoneChanged(selection, dataset)),
      this.eventBus.subscribe(EVENT_TOPICS.WORKSPACE_SNAPSHOT_CHANGED, ({ snapshot }) => this.renderSnapshot(snapshot)),
      this.eventBus.subscribe(EVENT_TOPICS.DATASET_LOAD_FAILED, ({ message }) => this.importFailure(message)),
      this.eventBus.subscribe(EVENT_TOPICS.DATASET_CLEARED, () => this.clear()),
      this.eventBus.subscribe(EVENT_TOPICS.VIEWPORT_ENTITY_SELECTED, ({ entityId }) => this.renderSelection(entityId)),
      this.eventBus.subscribe(ENGINEERING_MODEL_EVENTS.CHANGED, () => this.rerenderActiveDataset()),
    ];
    this.rootElement.addEventListener('click', this.handleClick);
    globalThis.addEventListener?.('topology-edit-tool-selected', this.handleToolSelected);
    this.updateCapabilities();
  }

  renderSnapshot(snapshot) {
    if (snapshot.status !== 'ready' || !snapshot.dataset) return;
    if (snapshot.dataset !== this.datasetReference) {
      this.datasetReference = snapshot.dataset;
      this.renderDataset(snapshot.dataset, false);
    }
    this.renderSelection(snapshot.selectedEntityId);
  }

  renderDataset(dataset, preview) {
    try {
      const projection = projectDatasetForModelZone(dataset, this.zoneSelection);
      const supportSites = projectSupportSiteModelForModelZone(
        engineeringModelStore.getSupportSiteModel(),
        projection,
      );
      const resolved = buildResolvedEngineeringGeometry(
        dataset,
        projectDataStore.getProfile(),
        supportSites,
      );
      const scoped = filterResolvedGeometryForModelZone(
        resolved,
        projection,
        supportSites,
      );
      const renderModel = buildViewportRenderModel(scoped);
      this.renderer.renderModel(renderModel);
      this.renderModel = renderModel;
      this.statusElement.textContent = viewportStatus(dataset, projection, renderModel, preview);
    } catch (error) {
      this.statusElement.textContent = error instanceof Error ? error.message : String(error);
    }
  }

  zoneChanged(selection, dataset) {
    this.zoneSelection = selection;
    if (this.datasetReference === dataset) this.renderDataset(dataset, false);
  }

  editAction({ action, selectedEntityId }) {
    if (action === 'preview-replacement') {
      const result = this.gateway.previewInlineReplacement(selectedEntityId, projectDataStore.getProfile(), masterDataController.getMasterData());
      if (result.status === 'preview') this.renderDataset(result.dataset, true);
      this.editPanel.setStatus(result.status === 'preview' ? `Preview ready: ${result.command.commandId}` : result.reason);
      return;
    }
    if (action === 'commit-replacement') {
      const result = this.gateway.commitPreview();
      this.editPanel.setStatus(result.status === 'applied' ? `Committed ${result.command.commandId}; loads are stale.` : result.reason);
      return;
    }
    if (action === 'cancel-replacement') {
      this.gateway.cancelPreview();
      const dataset = WorkspaceState.getSnapshot()?.dataset;
      if (dataset) this.renderDataset(dataset, false);
      this.editPanel.setStatus('Preview cancelled.');
      return;
    }
    if (action === 'undo') { this.editPanel.setStatus(this.gateway.undo() ? 'Undo applied; loads are stale.' : 'Nothing to undo.'); return; }
    if (action === 'redo') this.editPanel.setStatus(this.gateway.redo() ? 'Redo applied; loads are stale.' : 'Nothing to redo.');
  }

  renderSelection(entityId) {
    const selectedId = String(entityId || '');
    this.renderer.setSelection(selectedId);
    this.selectionElement.textContent = selectedId ? `Selection: ${selectedId}` : 'Selection: none';
    this.editPanel.render(selectedId || null);
  }

  selectionRequested(entityId) {
    if (typeof entityId !== 'string' || !entityId) return;
    this.eventBus.publish(EVENT_TOPICS.VIEWPORT_SELECTION_REQUESTED, { entityId, source: 'viewport' });
  }

  rerenderActiveDataset() { const dataset = WorkspaceState.getSnapshot()?.dataset; if (dataset) this.renderDataset(dataset, false); }
  toolSelected(event) { const toolId = event.detail?.toolId; if (toolId) this.renderer.setInteractionContext(toolId); }

  click(event) {
    const trigger = event.target?.closest?.('[data-viewport-action]');
    if (!trigger || !this.rootElement.contains(trigger) || trigger.disabled) return;
    const actions = {
      fit: () => this.renderer.fitView(), 'fit-selection': () => this.renderer.fitSelection(), home: () => this.renderer.home(), reset: () => this.renderer.resetView(),
      'pivot-selection': () => this.renderer.pivotSelection(),
      'previous-view': () => this.renderer.previousView(), 'toggle-projection': () => this.renderer.toggleProjection(),
      'view-iso': () => this.renderer.setStandardView('iso'), 'view-top': () => this.renderer.setStandardView('top'), 'view-bottom': () => this.renderer.setStandardView('bottom'),
      'view-front': () => this.renderer.setStandardView('front'), 'view-back': () => this.renderer.setStandardView('back'), 'view-left': () => this.renderer.setStandardView('left'), 'view-right': () => this.renderer.setStandardView('right'),
      'mode-select': () => this.renderer.setInteractionContext('select'), 'mode-orbit': () => this.renderer.setInteractionContext('orbit'), 'mode-pan': () => this.renderer.setInteractionContext('pan'),
    };
    actions[trigger.dataset.viewportAction]?.();
  }

  updateCapabilities() {
    const capabilities = this.renderer.getCapabilities();
    this.rootElement.querySelectorAll('[data-viewport-action]').forEach((button) => { button.disabled = capabilityFor(button.dataset.viewportAction, capabilities) === false; });
  }

  importFailure(message) { this.statusElement.textContent = `Import failed: ${message}`; }
  requireElement(selector) { const element = this.rootElement.querySelector(selector); if (!element) throw new Error(`ViewportPanel element is missing: ${selector}`); return element; }
  clear() { this.datasetReference = null; this.zoneSelection = null; this.renderModel = null; this.gateway.cancelPreview(); this.renderer.clear(); this.statusElement.textContent = 'No dataset loaded'; this.selectionElement.textContent = 'Selection: none'; this.editPanel.render(null); }
  destroy() { this.rootElement.removeEventListener('click', this.handleClick); globalThis.removeEventListener?.('topology-edit-tool-selected', this.handleToolSelected); this.unsubscribers.forEach((unsubscribe) => unsubscribe()); this.unsubscribers = []; this.renderer.setSelectionRequestHandler(null); this.renderer.destroy(); this.datasetReference = null; }
}

function viewportStatus(dataset, projection, renderModel, preview) {
  const prefix = preview ? 'PREVIEW · ' : '';
  const zone = projection.zoneId ? ` · Zone ${projection.label}` : '';
  return `${prefix}${dataset.datasetId}${zone} · ${renderModel.summary.renderableCount} source-backed items rendered`;
}

function capabilityFor(action, capabilities) {
  const map = { 'mode-select': 'select', 'mode-orbit': 'orbit', 'mode-pan': 'pan', fit: 'fitAll', 'fit-selection': 'fitSelection', 'pivot-selection': 'pivot', home: 'home', reset: 'home', 'toggle-projection': 'orthographic' };
  if (action.startsWith('view-')) return capabilities.standardViews;
  return map[action] ? capabilities[map[action]] : true;
}
