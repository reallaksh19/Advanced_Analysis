import {
  createTopologyEditObjectTree,
  filterTopologyEditObjectTree,
} from './topology-edit-object-tree-model.js';
import {
  ensureTopologyEditObjectTreeStyles,
} from './topology-edit-object-tree-styles.js';

export class TopologyEditObjectTreeRuntime {
  constructor(controller) {
    if (!controller) {
      throw new TypeError('TopologyEditObjectTreeRuntime: controller is required.');
    }
    this.controller = controller;
    this.element = null;
    this.filterInput = null;
    this.groupsElement = null;
    this.countOutput = null;
    this.statusOutput = null;
    this.tree = null;
    this.query = '';
    this.busy = false;
    this.openGroups = new Set(['nodes', 'edges']);
    this.handleClick = (event) => this.onClick(event);
    this.handleInput = (event) => this.onInput(event);
  }

  mount(element) {
    if (!element?.ownerDocument) {
      throw new TypeError('TopologyEditObjectTreeRuntime: mount element is required.');
    }
    this.destroy();
    this.element = element;
    ensureTopologyEditObjectTreeStyles(element.ownerDocument);
    element.classList.add('topology-edit-object-tree');
    element.dataset.role = 'topology-edit-object-tree';
    element.setAttribute('aria-label', 'Canonical object tree');
    element.addEventListener('click', this.handleClick);
    element.addEventListener('input', this.handleInput);
    this.buildShell();
    this.refresh();
  }

  destroy() {
    this.element?.removeEventListener('click', this.handleClick);
    this.element?.removeEventListener('input', this.handleInput);
    this.element?.replaceChildren();
    this.element = null;
    this.filterInput = null;
    this.groupsElement = null;
    this.countOutput = null;
    this.statusOutput = null;
    this.tree = null;
    this.busy = false;
  }

  refresh(topology = this.controller.session?.currentTopology?.()) {
    if (!this.element || !topology) return;
    this.tree = createTopologyEditObjectTree(topology);
    this.render();
  }

  selectionChanged() {
    if (!this.element || !this.tree) return;
    this.render();
  }

  viewState() {
    return {
      query: this.query,
      openGroups: [...this.openGroups].sort(),
    };
  }

  restoreViewState(value = {}) {
    this.query = typeof value.query === 'string' ? value.query : '';
    this.openGroups = new Set(Array.isArray(value.openGroups)
      ? value.openGroups
      : ['nodes', 'edges']);
    if (this.filterInput) this.filterInput.value = this.query;
    this.render();
  }

  buildShell() {
    const documentRef = this.element.ownerDocument;
    const header = documentRef.createElement('header');
    header.className = 'topology-edit-object-tree__header';
    const heading = documentRef.createElement('div');
    heading.className = 'topology-edit-object-tree__heading';
    const title = documentRef.createElement('strong');
    title.textContent = 'Canonical objects';
    const count = documentRef.createElement('output');
    count.dataset.role = 'topology-edit-object-tree-count';
    heading.append(title, count);
    const filter = documentRef.createElement('input');
    filter.type = 'search';
    filter.className = 'topology-edit-object-tree__filter';
    filter.dataset.role = 'topology-edit-object-tree-filter';
    filter.placeholder = 'Filter ID, type, component…';
    filter.setAttribute('aria-label', 'Filter canonical objects');
    filter.value = this.query;
    header.append(heading, filter);

    const groups = documentRef.createElement('div');
    groups.className = 'topology-edit-object-tree__groups';
    groups.dataset.role = 'topology-edit-object-tree-groups';
    const status = documentRef.createElement('output');
    status.className = 'topology-edit-object-tree__status';
    status.dataset.role = 'topology-edit-object-tree-status';
    status.setAttribute('aria-live', 'polite');

    this.element.replaceChildren(header, groups, status);
    this.filterInput = filter;
    this.groupsElement = groups;
    this.countOutput = count;
    this.statusOutput = status;
  }

  render() {
    if (!this.element || !this.tree || !this.groupsElement) return;
    this.captureOpenGroups();
    const documentRef = this.element.ownerDocument;
    const filtered = filterTopologyEditObjectTree(this.tree, this.query);
    const selected = new Set(
      this.controller.editorStore?.getState?.().selection?.canonicalIds ?? [],
    );
    const primaryId = this.controller.editorStore?.getState?.().selection?.primaryId ?? null;
    const fragment = documentRef.createDocumentFragment();
    filtered.groups.forEach((group) => {
      if (!group.count && this.query) return;
      fragment.append(this.renderGroup(documentRef, group, selected, primaryId));
    });
    if (!filtered.totalCount) {
      const empty = documentRef.createElement('p');
      empty.className = 'topology-edit-object-tree__empty';
      empty.textContent = this.query
        ? `No canonical objects match “${this.query}”.`
        : 'No canonical objects are available.';
      fragment.append(empty);
    }
    this.groupsElement.replaceChildren(fragment);
    this.countOutput.textContent = `${filtered.totalCount} / ${this.tree.totalCount}`;
    this.statusOutput.textContent = primaryId
      ? `Primary selection: ${primaryId}`
      : 'No canonical object selected.';
    this.element.dataset.busy = String(this.busy);
    this.element.dataset.topologyEditObjectTreeHash = this.tree.treeHash;
    this.element.dataset.topologyEditObjectTreeCanonicalHash =
      this.tree.canonicalTopologyHash;
    this.element.dataset.topologyEditObjectTreeCount = String(this.tree.totalCount);
    this.element.dataset.topologyEditObjectTreeFilteredCount = String(filtered.totalCount);
    this.element.dataset.topologyEditObjectTreeSelectedIds = [...selected].join(',');
  }

  renderGroup(documentRef, group, selected, primaryId) {
    const details = documentRef.createElement('details');
    details.className = 'topology-edit-object-tree__group';
    details.dataset.objectTreeGroup = group.key;
    details.open = this.openGroups.has(group.key)
      || group.items.some((item) => selected.has(item.canonicalId));
    const summary = documentRef.createElement('summary');
    const label = documentRef.createElement('span');
    label.textContent = group.label;
    const count = documentRef.createElement('span');
    count.textContent = String(group.count);
    summary.append(label, count);
    const list = documentRef.createElement('ul');
    list.className = 'topology-edit-object-tree__list';
    group.items.forEach((item) => list.append(
      this.renderItem(documentRef, item, selected, primaryId),
    ));
    if (!group.items.length) {
      const empty = documentRef.createElement('p');
      empty.className = 'topology-edit-object-tree__empty';
      empty.textContent = 'No objects.';
      details.append(summary, empty);
    } else {
      details.append(summary, list);
    }
    return details;
  }

  renderItem(documentRef, item, selected, primaryId) {
    const row = documentRef.createElement('li');
    row.className = 'topology-edit-object-tree__item';
    row.dataset.canonicalId = item.canonicalId;
    row.dataset.objectKind = item.kind;
    const select = documentRef.createElement('button');
    select.type = 'button';
    select.className = 'topology-edit-object-tree__select';
    select.dataset.objectTreeSelect = item.canonicalId;
    select.setAttribute('aria-pressed', String(selected.has(item.canonicalId)));
    select.setAttribute('aria-label', `Select ${item.kind.toLowerCase()} ${item.canonicalId}`);
    const label = documentRef.createElement('span');
    label.className = 'topology-edit-object-tree__label';
    label.textContent = item.label;
    const id = documentRef.createElement('span');
    id.className = 'topology-edit-object-tree__id';
    id.textContent = item.canonicalId;
    const description = documentRef.createElement('span');
    description.className = 'topology-edit-object-tree__description';
    description.textContent = item.description;
    select.append(label, id, description);
    row.append(select);

    if (item.actions.length) {
      const actions = documentRef.createElement('div');
      actions.className = 'topology-edit-object-tree__actions';
      actions.setAttribute('role', 'group');
      actions.setAttribute('aria-label', `Governed actions for ${item.canonicalId}`);
      item.actions.forEach((action) => {
        const button = documentRef.createElement('button');
        button.type = 'button';
        button.dataset.objectTreeAction = action.id;
        button.dataset.canonicalId = item.canonicalId;
        button.textContent = action.label;
        button.title = action.title;
        button.disabled = this.busy;
        if (primaryId === item.canonicalId) button.dataset.primarySelection = 'true';
        actions.append(button);
      });
      row.append(actions);
    }
    return row;
  }

  captureOpenGroups() {
    if (!this.groupsElement) return;
    this.groupsElement.querySelectorAll('details[data-object-tree-group]').forEach((details) => {
      if (details.open) this.openGroups.add(details.dataset.objectTreeGroup);
      else this.openGroups.delete(details.dataset.objectTreeGroup);
    });
  }

  onInput(event) {
    if (event.target !== this.filterInput) return;
    this.query = this.filterInput.value;
    this.render();
  }

  async onClick(event) {
    const actionButton = event.target.closest?.('[data-object-tree-action]');
    if (actionButton && this.element.contains(actionButton)) {
      event.preventDefault();
      event.stopPropagation();
      await this.executeAction(
        actionButton.dataset.canonicalId,
        actionButton.dataset.objectTreeAction,
      );
      return;
    }
    const selectButton = event.target.closest?.('[data-object-tree-select]');
    if (!selectButton || !this.element.contains(selectButton)) return;
    event.preventDefault();
    event.stopPropagation();
    const canonicalId = selectButton.dataset.objectTreeSelect;
    const action = event.ctrlKey || event.metaKey
      ? 'TOGGLE'
      : event.shiftKey
        ? 'ADD'
        : 'REPLACE';
    this.controller.selectionCoordinator.requestCanonical(
      action,
      [canonicalId],
      'object-tree',
      {
        primaryId: canonicalId,
        anchorId: action === 'REPLACE' ? canonicalId : undefined,
      },
    );
  }

  async executeAction(canonicalId, actionId) {
    if (this.busy) return;
    this.busy = true;
    this.render();
    try {
      this.controller.selectionCoordinator.requestCanonical(
        'REPLACE',
        [canonicalId],
        'object-tree',
        { primaryId: canonicalId, anchorId: canonicalId },
      );
      await this.controller.runCommandAction(actionId);
      this.controller.setStatus?.(`Governed tree action ${actionId} accepted for ${canonicalId}.`);
    } catch (error) {
      this.controller.setStatus?.(
        `Governed tree action ${actionId} rejected for ${canonicalId}: ${error.message}`,
      );
      throw error;
    } finally {
      this.busy = false;
      this.refresh();
    }
  }
}
