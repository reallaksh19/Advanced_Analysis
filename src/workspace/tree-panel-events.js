/**
 * Event lifecycle and keyboard behavior for the Workspace virtual tree.
 */
import { EVENT_TOPICS } from './event-topics.js';
import {
  filterTree,
  focusTreeIndex,
  renderVisibleItems,
  scrollToTreeIndex,
  TREE_ROW_HEIGHT,
  updateFlattenedNodes,
} from './tree-panel-tree.js';

export function initializeTreePanel(panel) {
  if (panel.initialized) return;
  panel.listElement = panel.requireElement('[data-role="tree-list"]');
  panel.fileElement = panel.requireElement('[data-role="dataset-file"]');
  panel.statusElement = panel.requireElement('[data-role="tree-status"]');
  panel.errorElement = panel.requireElement('[data-role="tree-error"]');
  panel.clearButton = panel.requireElement('[data-action="clear-dataset"]');
  panel.searchElement = panel.requireElement('[data-role="tree-search"]');
  panel.pipesElement = panel.requireElement('[data-role="summary-pipes"]');
  panel.supportsElement = panel.requireElement('[data-role="summary-supports"]');
  panel.listElement.replaceChildren();
  panel.listElement.role = 'tree';
  panel.listElement.tabIndex = 0;
  panel.listElement.style.position = 'relative';
  panel.contentElement =
    panel.rootElement.ownerDocument.createElement('div');
  panel.contentElement.className = 'tree-list-content';
  panel.listElement.append(panel.contentElement);
  panel.unsubscribeCallbacks = subscriptions(panel);
  panel.rootElement.addEventListener('click', panel.handleClick);
  panel.rootElement.addEventListener('change', panel.handleChange);
  panel.listElement.addEventListener('scroll', panel.handleScroll, {
    passive: true,
  });
  panel.listElement.addEventListener('keydown', panel.handleKeyDown);
  panel.searchElement.addEventListener('input', panel.handleSearchInput);
  panel.initialized = true;
}

export async function handleTreeClick(panel, event) {
  const trigger = event.target?.closest?.(
    '[data-action], [data-entity-id], [data-branch-id]',
  );
  if (!trigger || !panel.rootElement.contains(trigger)) return;
  if (trigger.dataset.action === 'import-dataset') {
    panel.fileElement.click();
    return;
  }
  if (trigger.dataset.action === 'load-mock-dataset') {
    const { createWorkspaceMockPackage } =
      await import('./advanced-mock-data.js');
    panel.clearError();
    panel.statusElement.textContent =
      'Loading [SIMULATED] workspace data…';
    panel.eventBus.publish(EVENT_TOPICS.DATASET_LOAD_REQUESTED, {
      rawPackage: createWorkspaceMockPackage(),
      sourceName: '[SIMULATED]-advanced-workspace.json',
    });
    return;
  }
  if (trigger.dataset.action === 'load-staggered-mock') {
    const { createStaggeredMockPackage } =
      await import('./advanced-mock-data.js');
    panel.clearError();
    panel.statusElement.textContent =
      'Loading Staggered Mock data…';
    panel.eventBus.publish(EVENT_TOPICS.DATASET_LOAD_REQUESTED, {
      rawPackage: createStaggeredMockPackage(),
      sourceName: 'staggered-mock.json',
    });
    return;
  }
  if (trigger.dataset.action === 'clear-dataset') {
    panel.eventBus.publish(EVENT_TOPICS.DATASET_CLEAR_REQUESTED);
    return;
  }
  selectTreeTrigger(panel, trigger);
}

export async function handleTreeChange(panel, event) {
  if (event.target !== panel.fileElement) return;
  const file = panel.fileElement.files?.[0];
  if (!file) return;
  try {
    const rawPackage = JSON.parse(await file.text());
    panel.clearError();
    panel.statusElement.textContent = `Loading ${file.name}…`;
    panel.eventBus.publish(EVENT_TOPICS.DATASET_LOAD_REQUESTED, {
      rawPackage,
      sourceName: file.name,
    });
  } catch (error) {
    panel.eventBus.publish(EVENT_TOPICS.DATASET_LOAD_FAILED, {
      message: error instanceof Error ? error.message : String(error),
      sourceName: file.name,
    });
  } finally {
    panel.fileElement.value = '';
  }
}

export function handleTreeKeyDown(panel, event) {
  if (!panel.flattenedNodes.length) return;
  const active = panel.rootElement.ownerDocument.activeElement;
  if (!panel.listElement.contains(active) && active !== panel.listElement) {
    return;
  }
  if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Enter']
    .includes(event.key)) return;
  event.preventDefault();
  if (panel.focusedIndex < 0) panel.focusedIndex = 0;
  const item = panel.flattenedNodes[panel.focusedIndex];
  applyKey(panel, item, event.key);
  scrollToTreeIndex(panel, panel.focusedIndex);
  renderVisibleItems(panel);
  focusTreeIndex(panel);
}

export function destroyTreePanel(panel) {
  if (!panel.initialized) return;
  panel.rootElement.removeEventListener('click', panel.handleClick);
  panel.rootElement.removeEventListener('change', panel.handleChange);
  panel.listElement.removeEventListener('scroll', panel.handleScroll);
  panel.listElement.removeEventListener('keydown', panel.handleKeyDown);
  panel.searchElement.removeEventListener('input', panel.handleSearchInput);
  panel.unsubscribeCallbacks.forEach((unsubscribe) => unsubscribe());
  panel.unsubscribeCallbacks = [];
  panel.dataset = null;
  panel.initialized = false;
}

function subscriptions(panel) {
  return [
    panel.eventBus.subscribe(
      EVENT_TOPICS.WORKSPACE_SNAPSHOT_CHANGED,
      ({ snapshot }) => panel.renderSnapshot(snapshot),
    ),
    panel.eventBus.subscribe(
      EVENT_TOPICS.DATASET_LOAD_FAILED,
      ({ message }) => panel.renderError(message),
    ),
    panel.eventBus.subscribe(
      EVENT_TOPICS.DATASET_CLEARED,
      () => panel.renderEmpty(),
    ),
  ];
}

function selectTreeTrigger(panel, trigger) {
  const index = Number.parseInt(trigger.dataset.index, 10);
  if (!Number.isInteger(index)
    || index < 0
    || index >= panel.flattenedNodes.length) return;
  panel.focusedIndex = index;
  const item = panel.flattenedNodes[index];
  if (trigger.dataset.action === 'toggle-branch'
    || item.type === 'branch') {
    toggleBranch(panel, item);
  } else if (trigger.dataset.action === 'select-entity'
    || item.type === 'entity') {
    publishSelection(panel, item.id);
  }
  focusTreeIndex(panel);
}

function applyKey(panel, item, key) {
  if (key === 'ArrowDown') {
    panel.focusedIndex = Math.min(
      panel.flattenedNodes.length - 1,
      panel.focusedIndex + 1,
    );
  } else if (key === 'ArrowUp') {
    panel.focusedIndex = Math.max(0, panel.focusedIndex - 1);
  } else if (key === 'ArrowRight') {
    moveRight(panel, item);
  } else if (key === 'ArrowLeft') {
    moveLeft(panel, item);
  } else if (item.type === 'branch') {
    toggleBranch(panel, item);
  } else {
    publishSelection(panel, item.id);
  }
}

function moveRight(panel, item) {
  if (item.type !== 'branch') return;
  if (!item.isExpanded) {
    panel.expandedBranches.add(item.id);
    updateFlattenedNodes(panel);
  } else {
    panel.focusedIndex = Math.min(
      panel.flattenedNodes.length - 1,
      panel.focusedIndex + 1,
    );
  }
}

function moveLeft(panel, item) {
  if (item.type === 'branch' && item.isExpanded) {
    panel.expandedBranches.delete(item.id);
    updateFlattenedNodes(panel);
    return;
  }
  if (item.depth <= 0) return;
  for (let index = panel.focusedIndex - 1; index >= 0; index -= 1) {
    const candidate = panel.flattenedNodes[index];
    if (candidate.type === 'branch'
      && candidate.depth === item.depth - 1) {
      panel.focusedIndex = index;
      return;
    }
  }
}

function toggleBranch(panel, item) {
  if (item.isExpanded) panel.expandedBranches.delete(item.id);
  else panel.expandedBranches.add(item.id);
  updateFlattenedNodes(panel);
}

function publishSelection(panel, entityId) {
  panel.eventBus.publish(EVENT_TOPICS.VIEWPORT_SELECTION_REQUESTED, {
    entityId,
    source: 'tree',
  });
}
