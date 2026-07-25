import { EventBus } from './event-bus.js';
import { EVENT_TOPICS } from './event-topics.js';
import { createWorkspaceMockPackage } from './advanced-mock-data.js';

export class TreePanel {
  constructor(rootElement, eventBus = EventBus) {
    if (!rootElement) throw new TypeError('TreePanel requires a root element.');
    this.rootElement = rootElement;
    this.eventBus = eventBus;
    this.dataset = null;
    this.entities = new Map();
    this.unsubscribeCallbacks = [];
    this.handleClick = this.handleClick.bind(this);
    this.handleChange = this.handleChange.bind(this);
    this.initialized = false;
  }

  init() {
    if (this.initialized) return;
    this.listElement = this.requireElement('[data-role="tree-list"]');
    this.fileElement = this.requireElement('[data-role="dataset-file"]');
    this.statusElement = this.requireElement('[data-role="tree-status"]');
    this.errorElement = this.requireElement('[data-role="tree-error"]');
    this.clearButton = this.requireElement('[data-action="clear-dataset"]');
    this.pipesElement = this.requireElement('[data-role="summary-pipes"]');
    this.supportsElement = this.requireElement('[data-role="summary-supports"]');

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
    this.initialized = true;
  }

  requireElement(selector) {
    const element = this.rootElement.querySelector(selector);
    if (!element) throw new Error(`TreePanel element is missing: ${selector}`);
    return element;
  }

  handleClick(event) {
    const trigger = event.target?.closest?.('[data-action], [data-entity-id]');
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

    const entity = this.entities.get(trigger.dataset.entityId);
    if (!entity) return;
    this.eventBus.publish(EVENT_TOPICS.VIEWPORT_SELECTION_REQUESTED, {
      entityId: entity.entityId,
      source: 'tree',
    });
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

  renderSnapshot(snapshot) {
    if (snapshot.status !== 'ready' || !snapshot.dataset) {
      this.renderEmpty();
      return;
    }

    if (this.dataset !== snapshot.dataset) this.renderDataset(snapshot.dataset);
    this.renderSelection(snapshot.selectedEntityId);
  }

  renderDataset(dataset) {
    this.dataset = dataset;
    this.entities = new Map(dataset.entities.map((entity) => [entity.entityId, entity]));
    this.statusElement.textContent = `${dataset.datasetId} · ${dataset.summary.nodeCount} entities`;
    this.pipesElement.textContent = `Pipes ${dataset.summary.pipes}`;
    this.supportsElement.textContent = `Supports ${dataset.summary.supports}`;
    this.clearButton.disabled = false;
    this.clearError();

    const fragment = this.rootElement.ownerDocument.createDocumentFragment();
    dataset.hierarchy.forEach((node) => fragment.append(this.renderBranch(node, 0)));
    this.listElement.replaceChildren(fragment);
  }

  renderSelection(entityId) {
    const selectedId = String(entityId || '');
    this.listElement.querySelectorAll('[data-entity-id]').forEach((button) => {
      const selected = button.dataset.entityId === selectedId;
      button.classList.toggle('tree-entity--selected', selected);
      if (selected) {
        button.setAttribute('aria-current', 'true');
        this.revealSelection(button);
      } else {
        button.removeAttribute('aria-current');
      }
    });
  }

  revealSelection(button) {
    let ancestor = button.parentElement;
    while (ancestor && this.rootElement.contains(ancestor)) {
      if (ancestor.tagName === 'DETAILS') ancestor.open = true;
      ancestor = ancestor.parentElement;
    }
  }

  renderBranch(node, level) {
    const documentRef = this.rootElement.ownerDocument;
    const details = documentRef.createElement('details');
    details.className = 'tree-branch';
    details.open = level < 2;

    const summary = documentRef.createElement('summary');
    summary.textContent = `${node.label} (${node.entityCount})`;
    details.append(summary);

    const children = documentRef.createElement('div');
    children.className = 'tree-branch__children';
    node.children.forEach((child) => children.append(this.renderBranch(child, level + 1)));
    node.directEntityIds.forEach((entityId) => {
      const entity = this.entities.get(entityId);
      if (entity) children.append(this.renderEntity(entity));
    });
    details.append(children);
    return details;
  }

  renderEntity(entity) {
    const documentRef = this.rootElement.ownerDocument;
    const button = documentRef.createElement('button');
    button.type = 'button';
    button.className = 'tree-entity';
    button.dataset.entityId = entity.entityId;
    button.setAttribute('aria-label', `Select ${entity.name}`);

    const identity = documentRef.createElement('span');
    identity.className = 'tree-entity__identity';
    identity.textContent = entity.name;
    const type = documentRef.createElement('span');
    type.className = 'tree-entity__type';
    type.textContent = entity.entityType;
    button.append(identity, type);
    return button;
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
    this.entities = new Map();
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
    this.unsubscribeCallbacks.forEach((unsubscribe) => unsubscribe());
    this.unsubscribeCallbacks = [];
    this.dataset = null;
    this.initialized = false;
  }
}
