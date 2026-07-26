/**
 * Virtual tree projection and rendering for the Workspace tree panel.
 *
 * Functions receive the panel state explicitly and keep hierarchy traversal
 * separate from event/controller lifecycle behavior.
 */
export const TREE_ROW_HEIGHT = 28;
const OVERSCAN = 10;

export function filterTree(panel, query) {
  panel.searchQuery = query.trim().toLowerCase();
  updateFlattenedNodes(panel);
}

export function updateFlattenedNodes(panel) {
  if (!panel.dataset) return;
  panel.flattenedNodes = [];
  buildFlattenedTree(
    panel.dataset.hierarchy,
    0,
    panel.flattenedNodes,
    panel,
  );
  ensureTreeContent(panel);
  panel.contentElement.style.height =
    `${panel.flattenedNodes.length * TREE_ROW_HEIGHT}px`;
  if (panel.focusedIndex >= panel.flattenedNodes.length) {
    panel.focusedIndex = Math.max(0, panel.flattenedNodes.length - 1);
  }
  renderVisibleItems(panel);
}

export function renderVisibleItems(panel) {
  if (!panel.dataset || !panel.flattenedNodes.length) return;
  ensureTreeContent(panel);
  const scrollTop = panel.listElement.scrollTop;
  const viewportHeight = panel.listElement.clientHeight || 500;
  const startIndex = Math.max(
    0,
    Math.floor(scrollTop / TREE_ROW_HEIGHT) - OVERSCAN,
  );
  const endIndex = Math.min(
    panel.flattenedNodes.length - 1,
    Math.ceil((scrollTop + viewportHeight) / TREE_ROW_HEIGHT) + OVERSCAN,
  );
  const fragment =
    panel.rootElement.ownerDocument.createDocumentFragment();
  for (let index = startIndex; index <= endIndex; index += 1) {
    const item = panel.flattenedNodes[index];
    if (!item) continue;
    fragment.append(item.type === 'branch'
      ? renderVirtualBranch(panel, item, index)
      : renderVirtualEntity(panel, item, index));
  }
  panel.contentElement.replaceChildren(fragment);
}

export function scrollToTreeIndex(panel, index) {
  const itemTop = index * TREE_ROW_HEIGHT;
  const itemBottom = itemTop + TREE_ROW_HEIGHT;
  const scrollTop = panel.listElement.scrollTop;
  const viewportHeight = panel.listElement.clientHeight;
  if (itemTop < scrollTop) {
    panel.listElement.scrollTop = itemTop;
  } else if (itemBottom > scrollTop + viewportHeight) {
    panel.listElement.scrollTop = itemBottom - viewportHeight;
  }
}

export function focusTreeIndex(panel) {
  const focus = () => {
    const item = panel.listElement.querySelector(
      `[data-index="${panel.focusedIndex}"]`,
    );
    item?.focus();
  };
  const request = panel.rootElement.ownerDocument.defaultView
    ?.requestAnimationFrame ?? globalThis.requestAnimationFrame;
  if (typeof request === 'function') request(focus);
  else focus();
}

export function revealSelectionId(panel, entityId) {
  if (!entityId || !panel.dataset) return;
  if (expandPathToEntity(
    panel.dataset.hierarchy,
    entityId,
    panel.expandedBranches,
  )) {
    updateFlattenedNodes(panel);
  }
  const index = panel.flattenedNodes.findIndex(
    (node) => node.type === 'entity' && node.id === entityId,
  );
  if (index === -1) return;
  panel.focusedIndex = index;
  scrollToTreeIndex(panel, index);
}

function buildFlattenedTree(nodes, depth, result, panel) {
  nodes.forEach((node) => {
    if (panel.searchQuery && !branchMatchesSearch(
      node,
      panel.searchQuery,
      panel.entities,
    )) return;
    const isExpanded = panel.searchQuery
      ? true
      : panel.expandedBranches.has(node.id);
    result.push({
      type: 'branch',
      id: node.id,
      label: node.label,
      entityCount: node.entityCount,
      depth,
      isExpanded,
    });
    if (!isExpanded) return;
    if (node.children.length) {
      buildFlattenedTree(node.children, depth + 1, result, panel);
    }
    node.directEntityIds.forEach((entityId) => {
      const entity = panel.entities.get(entityId);
      if (!entity || !entityMatches(entity, panel.searchQuery)) return;
      result.push({
        type: 'entity',
        id: entityId,
        label: entity.name,
        entityType: entity.entityType,
        depth: depth + 1,
      });
    });
  });
}

function branchMatchesSearch(node, query, entities) {
  if (node.label.toLowerCase().includes(query)) return true;
  if (node.directEntityIds.some((entityId) =>
    entityMatches(entities.get(entityId), query))) return true;
  return node.children.some((child) =>
    branchMatchesSearch(child, query, entities));
}

function entityMatches(entity, query) {
  if (!entity) return false;
  return !query
    || entity.name.toLowerCase().includes(query)
    || entity.entityType.toLowerCase().includes(query);
}

function expandPathToEntity(nodes, entityId, expandedBranches) {
  for (const node of nodes) {
    if (node.directEntityIds.includes(entityId)
      || expandPathToEntity(node.children, entityId, expandedBranches)) {
      expandedBranches.add(node.id);
      return true;
    }
  }
  return false;
}

function renderVirtualBranch(panel, item, index) {
  const documentRef = panel.rootElement.ownerDocument;
  const value = documentRef.createElement('div');
  value.className = 'tree-branch-virtual';
  value.dataset.index = index;
  value.dataset.branchId = item.id;
  value.dataset.action = 'toggle-branch';
  positionRow(value, index, item.depth, true);
  value.role = 'treeitem';
  value.setAttribute('aria-expanded', String(item.isExpanded));
  value.setAttribute('aria-level', String(item.depth + 1));
  value.tabIndex = index === panel.focusedIndex ? 0 : -1;
  const chevron = documentRef.createElement('span');
  chevron.className =
    `tree-branch-chevron ${item.isExpanded ? 'tree-branch-chevron--open' : ''}`;
  const label = documentRef.createElement('span');
  label.className = 'tree-branch-label';
  label.textContent = `${item.label} (${item.entityCount})`;
  value.append(chevron, label);
  return value;
}

function renderVirtualEntity(panel, item, index) {
  const documentRef = panel.rootElement.ownerDocument;
  const value = documentRef.createElement('button');
  value.type = 'button';
  value.className = 'tree-entity tree-entity-virtual';
  value.dataset.index = index;
  value.dataset.entityId = item.id;
  value.dataset.action = 'select-entity';
  positionRow(value, index, item.depth, false);
  const isSelected = item.id === panel.selectedEntityId;
  value.classList.toggle('tree-entity--selected', isSelected);
  value.role = 'treeitem';
  value.setAttribute('aria-level', String(item.depth + 1));
  value.tabIndex = index === panel.focusedIndex ? 0 : -1;
  if (isSelected) value.setAttribute('aria-selected', 'true');
  const identity = documentRef.createElement('span');
  identity.className = 'tree-entity__identity';
  identity.textContent = item.label;
  const type = documentRef.createElement('span');
  type.className = 'tree-entity__type';
  type.textContent = item.entityType;
  value.append(identity, type);
  return value;
}

function positionRow(value, index, depth, branch) {
  value.style.position = 'absolute';
  value.style.top = `${index * TREE_ROW_HEIGHT}px`;
  value.style.right = branch ? '0' : '12px';
  value.style.height = `${branch ? TREE_ROW_HEIGHT : TREE_ROW_HEIGHT - 4}px`;
  if (branch) {
    value.style.left = '0';
    value.style.paddingLeft = `${depth * 16 + 12}px`;
    return;
  }
  value.style.left = `${depth * 16 + 12}px`;
  value.style.width = `calc(100% - ${depth * 16 + 24}px)`;
  value.style.marginTop = '2px';
}

function ensureTreeContent(panel) {
  if (!panel.listElement.contains(panel.contentElement)) {
    panel.listElement.replaceChildren(panel.contentElement);
  }
}
