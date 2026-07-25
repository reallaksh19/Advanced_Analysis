import { EventBus } from './event-bus.js';
import { EVENT_TOPICS } from './event-topics.js';
import { createWorkspaceMockPackage } from './advanced-mock-data.js';

const ROW_HEIGHT = 28;
const OVERSCAN = 10;

export class TreePanel {
  constructor(rootElement, eventBus = EventBus) {
    if (!rootElement) throw new TypeError('TreePanel requires a root element.');
    this.rootElement = rootElement;
    this.eventBus = eventBus;
    this.dataset = null;
    this.entities = new Map();
    
    // Virtual Scroller State
    this.expandedBranches = new Set();
    this.flattenedNodes = [];
    this.searchQuery = '';
    this.focusedIndex = -1;
    this.selectedEntityId = '';

    this.unsubscribeCallbacks = [];
    this.handleClick = this.handleClick.bind(this);
    this.handleChange = this.handleChange.bind(this);
    this.handleScroll = this.handleScroll.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.initialized = false;
  }

  init() {
    if (this.initialized) return;
    this.listElement = this.requireElement('[data-role="tree-list"]');
    this.fileElement = this.requireElement('[data-role="dataset-file"]');
    this.statusElement = this.requireElement('[data-role="tree-status"]');
    this.errorElement = this.requireElement('[data-role="tree-error"]');
    this.clearButton = this.requireElement('[data-action="clear-dataset"]');
    this.searchElement = this.requireElement('[data-role="tree-search"]');
    this.pipesElement = this.requireElement('[data-role="summary-pipes"]');
    this.supportsElement = this.requireElement('[data-role="summary-supports"]');

    // Virtual list setup
    this.listElement.innerHTML = '';
    this.listElement.role = 'tree';
    this.listElement.tabIndex = 0;
    this.listElement.style.position = 'relative';

    this.contentElement = this.rootElement.ownerDocument.createElement('div');
    this.contentElement.className = 'tree-list-content';
    this.listElement.append(this.contentElement);

    this.unsubscribeCallbacks = [
      this.eventBus.subscribe(
        EVENT_TOPICS.WORKSPACE_SNAPSHOT_CHANGED,
        ({ snapshot }) => this.renderSnapshot(snapshot),
      ),
      this.eventBus.subscribe(
        EVENT_TOPICS.DATASET_LOAD_FAILED,
        ({ message }) => this.renderError(message),
      ),
      this.eventBus.subscribe(EVENT_TOPICS.DATASET_CLEARED, () => this.renderEmpty()),
    ];

    this.rootElement.addEventListener('click', this.handleClick);
    this.rootElement.addEventListener('change', this.handleChange);
    this.listElement.addEventListener('scroll', this.handleScroll, { passive: true });
    this.listElement.addEventListener('keydown', this.handleKeyDown);
    this.searchElement.addEventListener('input', (e) => this.filterTree(e.target.value));
    
    this.initialized = true;
  }

  requireElement(selector) {
    const element = this.rootElement.querySelector(selector);
    if (!element) throw new Error(`TreePanel element is missing: ${selector}`);
    return element;
  }

  handleClick(event) {
    const trigger = event.target?.closest?.('[data-action], [data-entity-id], [data-branch-id]');
    if (!trigger || !this.rootElement.contains(trigger)) return;

    if (trigger.dataset.action === 'import-dataset') {
      this.fileElement.click();
      return;
    }
    if (trigger.dataset.action === 'load-mock-dataset') {
      this.clearError();
      this.statusElement.textContent = 'Loading [SIMULATED] workspace data…';
      this.eventBus.publish(EVENT_TOPICS.DATASET_LOAD_REQUESTED, {
        rawPackage: createWorkspaceMockPackage(),
        sourceName: '[SIMULATED]-advanced-workspace.json',
      });
      return;
    }
    if (trigger.dataset.action === 'clear-dataset') {
      this.eventBus.publish(EVENT_TOPICS.DATASET_CLEAR_REQUESTED);
      return;
    }

    const index = parseInt(trigger.dataset.index, 10);
    if (!isNaN(index) && index >= 0 && index < this.flattenedNodes.length) {
      this.focusedIndex = index;
      const item = this.flattenedNodes[index];
      
      if (trigger.dataset.action === 'toggle-branch' || item.type === 'branch') {
        if (item.isExpanded) this.expandedBranches.delete(item.id);
        else this.expandedBranches.add(item.id);
        this.updateFlattenedNodes();
      } else if (trigger.dataset.action === 'select-entity' || item.type === 'entity') {
        this.eventBus.publish(EVENT_TOPICS.VIEWPORT_SELECTION_REQUESTED, {
          entityId: item.id,
          source: 'tree',
        });
      }
      
      requestAnimationFrame(() => {
        const activeItem = this.listElement.querySelector(`[data-index="${this.focusedIndex}"]`);
        if (activeItem) activeItem.focus();
      });
    }
  }

  async handleChange(event) {
    if (event.target !== this.fileElement) return;
    const file = this.fileElement.files?.[0];
    if (!file) return;

    try {
      const rawPackage = JSON.parse(await file.text());
      this.clearError();
      this.statusElement.textContent = `Loading ${file.name}…`;
      this.eventBus.publish(EVENT_TOPICS.DATASET_LOAD_REQUESTED, {
        rawPackage,
        sourceName: file.name,
      });
    } catch (error) {
      this.eventBus.publish(EVENT_TOPICS.DATASET_LOAD_FAILED, {
        message: error instanceof Error ? error.message : String(error),
        sourceName: file.name,
      });
    } finally {
      this.fileElement.value = '';
    }
  }

  handleScroll() {
    this.renderVisibleItems();
  }

  handleKeyDown(event) {
    if (!this.flattenedNodes.length) return;
    const isFocusInList = this.listElement.contains(this.rootElement.ownerDocument.activeElement);
    if (!isFocusInList && this.rootElement.ownerDocument.activeElement !== this.listElement) return;

    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Enter'].includes(event.key)) {
      event.preventDefault();
    } else {
      return;
    }

    if (this.focusedIndex < 0) this.focusedIndex = 0;
    const item = this.flattenedNodes[this.focusedIndex];

    switch (event.key) {
      case 'ArrowDown':
        this.focusedIndex = Math.min(this.flattenedNodes.length - 1, this.focusedIndex + 1);
        break;
      case 'ArrowUp':
        this.focusedIndex = Math.max(0, this.focusedIndex - 1);
        break;
      case 'ArrowRight':
        if (item.type === 'branch') {
          if (!item.isExpanded) {
            this.expandedBranches.add(item.id);
            this.updateFlattenedNodes();
          } else {
            this.focusedIndex = Math.min(this.flattenedNodes.length - 1, this.focusedIndex + 1);
          }
        }
        break;
      case 'ArrowLeft':
        if (item.type === 'branch' && item.isExpanded) {
          this.expandedBranches.delete(item.id);
          this.updateFlattenedNodes();
        } else if (item.depth > 0) {
          for (let i = this.focusedIndex - 1; i >= 0; i--) {
            if (this.flattenedNodes[i].type === 'branch' && this.flattenedNodes[i].depth === item.depth - 1) {
              this.focusedIndex = i;
              break;
            }
          }
        }
        break;
      case 'Enter':
      case ' ':
        if (item.type === 'branch') {
          if (item.isExpanded) this.expandedBranches.delete(item.id);
          else this.expandedBranches.add(item.id);
          this.updateFlattenedNodes();
        } else if (item.type === 'entity') {
          this.eventBus.publish(EVENT_TOPICS.VIEWPORT_SELECTION_REQUESTED, {
            entityId: item.id,
            source: 'tree',
          });
        }
        break;
    }

    this.scrollToIndex(this.focusedIndex);
    this.renderVisibleItems();
    
    requestAnimationFrame(() => {
      const activeItem = this.listElement.querySelector(`[data-index="${this.focusedIndex}"]`);
      if (activeItem) activeItem.focus();
    });
  }

  scrollToIndex(index) {
    const itemTop = index * ROW_HEIGHT;
    const itemBottom = itemTop + ROW_HEIGHT;
    const scrollTop = this.listElement.scrollTop;
    const viewportHeight = this.listElement.clientHeight;
    
    if (itemTop < scrollTop) {
      this.listElement.scrollTop = itemTop;
    } else if (itemBottom > scrollTop + viewportHeight) {
      this.listElement.scrollTop = itemBottom - viewportHeight;
    }
  }

  renderSnapshot(snapshot) {
    if (snapshot.status !== 'ready' || !snapshot.dataset) {
      this.renderEmpty();
      return;
    }

    if (this.dataset !== snapshot.dataset) this.renderDataset(snapshot.dataset);
    
    if (this.selectedEntityId !== snapshot.selectedEntityId) {
      this.selectedEntityId = String(snapshot.selectedEntityId || '');
      this.revealSelectionId(this.selectedEntityId);
      this.renderVisibleItems();
    }
  }

  renderDataset(dataset) {
    this.dataset = dataset;
    this.entities = new Map(dataset.entities.map((entity) => [entity.entityId, entity]));
    this.expandedBranches.clear();
    
    // Auto-expand depth 0 and 1
    dataset.hierarchy.forEach((node) => {
      this.expandedBranches.add(node.id);
      node.children.forEach(child => this.expandedBranches.add(child.id));
    });

    this.statusElement.textContent = `${dataset.datasetId} · ${dataset.summary.nodeCount} entities`;
    this.pipesElement.textContent = `Pipes ${dataset.summary.pipes}`;
    this.supportsElement.textContent = `Supports ${dataset.summary.supports}`;
    this.clearButton.disabled = false;
    this.clearError();

    this.updateFlattenedNodes();
  }

  filterTree(query) {
    this.searchQuery = query.trim().toLowerCase();
    this.updateFlattenedNodes();
  }

  updateFlattenedNodes() {
    if (!this.dataset) return;
    this.flattenedNodes = [];
    this.buildFlattenedTree(this.dataset.hierarchy, 0, this.flattenedNodes);
    
    this.contentElement.style.height = `${this.flattenedNodes.length * ROW_HEIGHT}px`;
    
    if (this.focusedIndex >= this.flattenedNodes.length) {
      this.focusedIndex = Math.max(0, this.flattenedNodes.length - 1);
    }
    
    this.renderVisibleItems();
  }

  buildFlattenedTree(nodes, depth, result) {
    nodes.forEach((node) => {
      const branchMatches = !this.searchQuery || this.branchMatchesSearch(node);
      if (this.searchQuery && !branchMatches) return;
      
      const isExpanded = this.searchQuery ? true : this.expandedBranches.has(node.id);
      
      result.push({
        type: 'branch',
        id: node.id,
        label: node.label,
        entityCount: node.entityCount,
        depth,
        isExpanded,
      });
      
      if (isExpanded) {
        if (node.children.length) this.buildFlattenedTree(node.children, depth + 1, result);
        if (node.directEntityIds.length) {
          node.directEntityIds.forEach((entityId) => {
            const entity = this.entities.get(entityId);
            if (entity) {
              const entityMatches = !this.searchQuery || 
                entity.name.toLowerCase().includes(this.searchQuery) || 
                entity.entityType.toLowerCase().includes(this.searchQuery);
              
              if (entityMatches) {
                result.push({
                  type: 'entity',
                  id: entityId,
                  label: entity.name,
                  entityType: entity.entityType,
                  depth: depth + 1,
                });
              }
            }
          });
        }
      }
    });
  }

  branchMatchesSearch(node) {
    if (node.label.toLowerCase().includes(this.searchQuery)) return true;
    for (const entityId of node.directEntityIds) {
      const entity = this.entities.get(entityId);
      if (entity && (entity.name.toLowerCase().includes(this.searchQuery) || entity.entityType.toLowerCase().includes(this.searchQuery))) {
        return true;
      }
    }
    for (const child of node.children) {
      if (this.branchMatchesSearch(child)) return true;
    }
    return false;
  }

  renderVisibleItems() {
    if (!this.dataset || !this.flattenedNodes.length) return;
    
    const scrollTop = this.listElement.scrollTop;
    const viewportHeight = this.listElement.clientHeight || 500;
    
    let startIndex = Math.floor(scrollTop / ROW_HEIGHT);
    let endIndex = Math.ceil((scrollTop + viewportHeight) / ROW_HEIGHT);
    
    startIndex = Math.max(0, startIndex - OVERSCAN);
    endIndex = Math.min(this.flattenedNodes.length - 1, endIndex + OVERSCAN);
    
    const fragment = this.rootElement.ownerDocument.createDocumentFragment();
    
    for (let i = startIndex; i <= endIndex; i++) {
      const item = this.flattenedNodes[i];
      if (!item) continue;
      
      if (item.type === 'branch') {
        fragment.append(this.renderVirtualBranch(item, i));
      } else {
        fragment.append(this.renderVirtualEntity(item, i));
      }
    }
    
    this.contentElement.replaceChildren(fragment);
  }

  renderVirtualBranch(item, index) {
    const documentRef = this.rootElement.ownerDocument;
    const div = documentRef.createElement('div');
    div.className = 'tree-branch-virtual';
    div.dataset.index = index;
    div.dataset.branchId = item.id;
    div.dataset.action = 'toggle-branch';
    div.style.position = 'absolute';
    div.style.top = `${index * ROW_HEIGHT}px`;
    div.style.left = '0';
    div.style.right = '0';
    div.style.height = `${ROW_HEIGHT}px`;
    div.style.paddingLeft = `${item.depth * 16 + 12}px`;
    
    div.role = 'treeitem';
    div.setAttribute('aria-expanded', String(item.isExpanded));
    div.setAttribute('aria-level', String(item.depth + 1));
    div.tabIndex = index === this.focusedIndex ? 0 : -1;
    
    const chevron = documentRef.createElement('span');
    chevron.className = `tree-branch-chevron ${item.isExpanded ? 'tree-branch-chevron--open' : ''}`;
    
    const label = documentRef.createElement('span');
    label.className = 'tree-branch-label';
    label.textContent = `${item.label} (${item.entityCount})`;
    
    div.append(chevron, label);
    return div;
  }

  renderVirtualEntity(item, index) {
    const documentRef = this.rootElement.ownerDocument;
    const button = documentRef.createElement('button');
    button.type = 'button';
    button.className = 'tree-entity tree-entity-virtual';
    button.dataset.index = index;
    button.dataset.entityId = item.id;
    button.dataset.action = 'select-entity';
    button.style.position = 'absolute';
    button.style.top = `${index * ROW_HEIGHT}px`;
    button.style.left = `${item.depth * 16 + 12}px`;
    button.style.right = '12px';
    button.style.width = `calc(100% - ${item.depth * 16 + 24}px)`;
    button.style.height = `${ROW_HEIGHT - 4}px`;
    button.style.marginTop = '2px';
    
    const isSelected = item.id === this.selectedEntityId;
    button.classList.toggle('tree-entity--selected', isSelected);
    button.role = 'treeitem';
    button.setAttribute('aria-level', String(item.depth + 1));
    button.tabIndex = index === this.focusedIndex ? 0 : -1;
    if (isSelected) button.setAttribute('aria-selected', 'true');
    
    const identity = documentRef.createElement('span');
    identity.className = 'tree-entity__identity';
    identity.textContent = item.label;
    const type = documentRef.createElement('span');
    type.className = 'tree-entity__type';
    type.textContent = item.entityType;
    
    button.append(identity, type);
    return button;
  }

  revealSelectionId(entityId) {
    if (!entityId || !this.dataset) return;
    
    if (this.expandPathToEntity(this.dataset.hierarchy, entityId)) {
       this.updateFlattenedNodes();
    }
    
    const index = this.flattenedNodes.findIndex(n => n.type === 'entity' && n.id === entityId);
    if (index !== -1) {
      this.focusedIndex = index;
      this.scrollToIndex(index);
    }
  }

  expandPathToEntity(nodes, entityId) {
    for (const node of nodes) {
      if (node.directEntityIds.includes(entityId)) {
        this.expandedBranches.add(node.id);
        return true;
      }
      if (this.expandPathToEntity(node.children, entityId)) {
        this.expandedBranches.add(node.id);
        return true;
      }
    }
    return false;
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
    if (!this.initialized) return;
    this.rootElement.removeEventListener('click', this.handleClick);
    this.rootElement.removeEventListener('change', this.handleChange);
    this.listElement.removeEventListener('scroll', this.handleScroll);
    this.listElement.removeEventListener('keydown', this.handleKeyDown);
    this.unsubscribeCallbacks.forEach((unsubscribe) => unsubscribe());
    this.unsubscribeCallbacks = [];
    this.dataset = null;
    this.initialized = false;
  }
}
