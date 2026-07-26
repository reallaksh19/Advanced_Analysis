/**
 * Workspace dataset tree controller.
 *
 * Lifecycle/event handling and virtual-tree rendering live in focused helper
 * modules so this controller remains an explicit state and coordination owner.
 */
import { EventBus } from './event-bus.js';
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
    this.entities = new Map();
    this.expandedBranches = new Set();
    this.flattenedNodes = [];
    this.searchQuery = '';
    this.focusedIndex = -1;
    this.selectedEntityId = '';
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
    if (this.dataset !== snapshot.dataset) {
      this.renderDataset(snapshot.dataset);
    }
    if (this.selectedEntityId === snapshot.selectedEntityId) return;
    this.selectedEntityId = String(snapshot.selectedEntityId || '');
    revealSelectionId(this, this.selectedEntityId);
    renderVisibleItems(this);
  }

  renderDataset(dataset) {
    this.dataset = dataset;
    this.entities = new Map(
      dataset.entities.map((entity) => [entity.entityId, entity]),
    );
    this.expandedBranches.clear();
    dataset.hierarchy.forEach((node) => {
      this.expandedBranches.add(node.id);
      node.children.forEach((child) =>
        this.expandedBranches.add(child.id));
    });
    this.statusElement.textContent =
      `${dataset.datasetId} · ${dataset.summary.nodeCount} entities`;
    this.pipesElement.textContent = `Pipes ${dataset.summary.pipes}`;
    this.supportsElement.textContent =
      `Supports ${dataset.summary.supports}`;
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
    this.entities.clear();
    this.expandedBranches.clear();
    this.flattenedNodes = [];
    this.focusedIndex = -1;
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
  }
}
