/**
 * Workspace dataset tree controller.
 *
 * Lifecycle/event handling and virtual-tree rendering live in focused helper
 * modules so this controller remains an explicit state and coordination owner.
 */
import { EventBus } from './event-bus.js';
import {
  ModelZoneSelectorController,
  projectDatasetForModelZone,
} from './model-zone-selector.js';
import {
  destroyTreePanel,
  handleTreeChange,
  handleTreeClick,
  handleTreeKeyDown,
  initializeTreePanel,
} from './tree-panel-events.js';
import {
  filterTree,
  renderVisibleItems,
  revealSelectionId,
  updateFlattenedNodes,
} from './tree-panel-tree.js';

export class TreePanel {
  constructor(rootElement, eventBus = EventBus) {
    if (!rootElement) {
      throw new TypeError('TreePanel requires a root element.');
    }
    this.rootElement = rootElement;
    this.eventBus = eventBus;
    this.dataset = null;
    this.sourceDataset = null;
    this.zoneSelection = null;
    this.zoneSelector = new ModelZoneSelectorController(rootElement, eventBus);
    this.entities = new Map();
    this.expandedBranches = new Set();
    this.flattenedNodes = [];
    this.searchQuery = '';
    this.focusedIndex = -1;
    this.selectedEntityId = '';
    this.selectedEntityIds = new Set();
    this.selectionAnchorEntityId = '';
    this.topologyEditSelectionActive = false;
    this.unsubscribeCallbacks = [];
    this.initialized = false;
    this.handleClick = (event) => handleTreeClick(this, event);
    this.handleChange = (event) => handleTreeChange(this, event);
    this.handleScroll = () => renderVisibleItems(this);
    this.handleKeyDown = (event) => handleTreeKeyDown(this, event);
    this.handleSearchInput = (event) =>
      filterTree(this, event.target.value);
  }

  init() {
    this.zoneSelector.init();
    initializeTreePanel(this);
  }

  requireElement(selector) {
    const value = this.rootElement.querySelector(selector);
    if (!value) {
      throw new Error(`TreePanel element is missing: ${selector}`);
    }
    return value;
  }

  renderSnapshot(snapshot) {
    if (snapshot.status !== 'ready' || !snapshot.dataset) {
      this.renderEmpty();
      return;
    }
    if (this.sourceDataset !== snapshot.dataset) {
      this.renderDataset(snapshot.dataset);
    }
    if (this.topologyEditSelectionActive) return;
    if (this.selectedEntityId === snapshot.selectedEntityId) return;
    this.selectedEntityId = String(snapshot.selectedEntityId || '');
    this.selectedEntityIds = new Set(
      this.selectedEntityId ? [this.selectedEntityId] : [],
    );
    this.selectionAnchorEntityId = this.selectedEntityId;
    revealSelectionId(this, this.selectedEntityId);
    renderVisibleItems(this);
  }

  applyTopologyEditSelection(payload) {
    if (!this.topologyEditSelectionActive) return;
    this.selectedEntityIds = new Set(payload.workspaceEntityIds ?? []);
    this.selectedEntityId = String(payload.primaryWorkspaceEntityId || '');
    this.selectionAnchorEntityId = String(
      payload.anchorWorkspaceEntityId || this.selectedEntityId || '',
    );
    revealSelectionId(this, this.selectedEntityId);
    renderVisibleItems(this);
  }

  setTopologyEditSelectionActive(active) {
    this.topologyEditSelectionActive = Boolean(active);
    this.listElement?.setAttribute(
      'aria-multiselectable',
      String(this.topologyEditSelectionActive),
    );
    if (!this.topologyEditSelectionActive) {
      this.selectedEntityIds = new Set(
        this.selectedEntityId ? [this.selectedEntityId] : [],
      );
      this.selectionAnchorEntityId = this.selectedEntityId;
      renderVisibleItems(this);
    }
  }

  applyZoneSelection(selection, dataset) {
    this.zoneSelection = selection;
    if (this.sourceDataset === dataset) this.renderDataset(dataset);
  }

  renderDataset(dataset) {
    this.sourceDataset = dataset;
    const view = projectDatasetForModelZone(dataset, this.zoneSelection);
    this.dataset = view;
    this.entities = new Map(
      view.entities.map((entity) => [entity.entityId, entity]),
    );
    this.expandedBranches.clear();
    view.hierarchy.forEach((node) => {
      this.expandedBranches.add(node.id);
      node.children.forEach((child) =>
        this.expandedBranches.add(child.id));
    });
    if (this.topologyEditSelectionActive) {
      this.selectedEntityIds = new Set(
        [...this.selectedEntityIds].filter((entityId) => this.entities.has(entityId)),
      );
      if (!this.selectedEntityIds.has(this.selectedEntityId)) {
        this.selectedEntityId = [...this.selectedEntityIds][0] ?? '';
      }
      if (!this.selectedEntityIds.has(this.selectionAnchorEntityId)) {
        this.selectionAnchorEntityId = this.selectedEntityId;
      }
    } else {
      this.selectedEntityId = '';
      this.selectedEntityIds.clear();
      this.selectionAnchorEntityId = '';
    }
    this.statusElement.textContent = datasetStatus(dataset, view);
    this.pipesElement.textContent = `Pipes ${view.summary.pipes}`;
    this.supportsElement.textContent =
      `Supports ${view.summary.supports}`;
    this.clearButton.disabled = false;
    this.clearError();
    updateFlattenedNodes(this);
  }

  renderError(message) {
    this.errorElement.hidden = false;
    this.errorElement.textContent = message;
    this.statusElement.textContent = this.entities.size
      ? `Import failed · retained ${this.entities.size} entities`
      : 'Import failed';
  }

  clearError() {
    this.errorElement.hidden = true;
    this.errorElement.textContent = '';
  }

  renderEmpty() {
    this.dataset = null;
    this.sourceDataset = null;
    this.zoneSelection = null;
    this.entities.clear();
    this.expandedBranches.clear();
    this.flattenedNodes = [];
    this.focusedIndex = -1;
    this.selectedEntityId = '';
    this.selectedEntityIds.clear();
    this.selectionAnchorEntityId = '';
    this.statusElement.textContent = 'No dataset loaded';
    this.pipesElement.textContent = 'Pipes 0';
    this.supportsElement.textContent = 'Supports 0';
    this.clearButton.disabled = true;
    this.clearError();
    const empty = this.rootElement.ownerDocument.createElement('p');
    empty.className = 'panel-empty';
    empty.textContent = 'Import a supported workspace JSON package.';
    this.listElement.replaceChildren(empty);
  }

  destroy() {
    destroyTreePanel(this);
    this.zoneSelector.destroy();
  }
}

function datasetStatus(dataset, view) {
  if (!view.zoneId) {
    return `${dataset.datasetId} · ${view.summary.nodeCount} entities`;
  }
  return `${dataset.datasetId} · Zone ${view.label} · ${view.summary.nodeCount} of ${view.totalEntityCount} entities`;
}
