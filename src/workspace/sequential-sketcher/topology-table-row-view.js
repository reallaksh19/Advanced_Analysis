/**
 * Topology Table Row and Header builder for Sequential Sketcher.
 * Preserves hierarchy in the table view with collapsible group headers.
 * STRICT MODULE LIMIT: Maximum 300 lines.
 */

import { SupportLoadPresenter } from './support-load-presenter.js';
import { buildDatasetHierarchy } from '../dataset-hierarchy.js';

const defaultSupportPresenter = new SupportLoadPresenter();

export function buildTableHeader(doc) {
  const thead = doc.createElement('thead');
  const headerRow = doc.createElement('tr');
  headerRow.style.background = '#020617';
  headerRow.style.position = 'sticky';
  headerRow.style.top = '0';
  headerRow.style.zIndex = '2';
  headerRow.style.borderBottom = '2px solid #334155';

  const columns = ['SEL', 'ENTITY ID', 'TYPE', 'START (X,Y,Z)', 'END (X,Y,Z)', 'LENGTH (mm)', 'LINE NO', 'SUPPORT LOADS', 'ACTIONS'];
  columns.forEach((col) => {
    const th = doc.createElement('th');
    th.style.padding = '6px';
    th.style.textAlign = col === 'SEL' ? 'center' : 'left';
    th.style.color = '#94a3b8';
    th.style.fontWeight = 'bold';
    th.textContent = col;
    headerRow.append(th);
  });

  thead.append(headerRow);
  return thead;
}

export function buildTableBody(doc, dataset, state, store, supportPresenter = defaultSupportPresenter) {
  const tbody = doc.createElement('tbody');
  const query = (state.searchQuery || '').toLowerCase();
  const selectedId = state.selectedEntityId;

  const entities = dataset.entities || [];
  const entityMap = new Map(entities.map((e) => [e.entityId, e]));
  const hierarchy = dataset.hierarchy || buildDatasetHierarchy(entities);

  if (!state.collapsedGroups) {
    state.collapsedGroups = new Set();
  }

  const renderedIds = new Set();
  appendHierarchyNodes(doc, hierarchy, 0, tbody, entityMap, state, store, supportPresenter, renderedIds, query, selectedId);

  entities.forEach((entity) => {
    if (!renderedIds.has(entity.entityId)) {
      const tr = renderEntityRow(doc, entity, 0, state, store, supportPresenter, selectedId, query);
      if (tr) {
        tbody.append(tr);
        renderedIds.add(entity.entityId);
      }
    }
  });

  return tbody;
}

function appendHierarchyNodes(doc, nodes, depth, tbody, entityMap, state, store, supportPresenter, renderedIds, query, selectedId) {
  nodes.forEach((node) => {
    if (query && !branchMatchesQuery(node, query, entityMap)) return;

    const isExpanded = query ? true : !state.collapsedGroups.has(node.id);
    if (node.entityCount > 0) {
      const headerTr = renderHierarchyHeaderRow(doc, node, depth, isExpanded, () => {
        if (state.collapsedGroups.has(node.id)) {
          state.collapsedGroups.delete(node.id);
        } else {
          state.collapsedGroups.add(node.id);
        }
        store.setState({ collapsedGroups: state.collapsedGroups });
      });
      tbody.append(headerTr);
    }

    if (isExpanded) {
      if (node.children && node.children.length) {
        appendHierarchyNodes(doc, node.children, depth + 1, tbody, entityMap, state, store, supportPresenter, renderedIds, query, selectedId);
      }
      (node.directEntityIds || []).forEach((entityId) => {
        const entity = entityMap.get(entityId);
        if (!entity || renderedIds.has(entityId)) return;
        const tr = renderEntityRow(doc, entity, depth + 1, state, store, supportPresenter, selectedId, query);
        if (tr) {
          tbody.append(tr);
          renderedIds.add(entityId);
        }
      });
    }
  });
}

function branchMatchesQuery(node, query, entityMap) {
  if (node.label && node.label.toLowerCase().includes(query)) return true;
  for (const id of node.entityIds || []) {
    const entity = entityMap.get(id);
    if (entity) {
      const name = entity.name || entity.entityId || '';
      const type = entity.entityType || '';
      if (name.toLowerCase().includes(query) || type.toLowerCase().includes(query)) return true;
    }
  }
  return false;
}

function renderHierarchyHeaderRow(doc, node, depth, isExpanded, onToggle) {
  const trGroup = doc.createElement('tr');
  trGroup.className = 'topology-table-group-header';
  trGroup.style.background = '#0f172a';
  trGroup.style.borderTop = '1px solid #334155';
  trGroup.style.borderBottom = '1px solid #1e293b';
  trGroup.style.cursor = 'pointer';
  trGroup.style.userSelect = 'none';

  const tdGroup = doc.createElement('td');
  tdGroup.colSpan = 9;
  tdGroup.style.padding = '6px 8px';
  tdGroup.style.paddingLeft = `${12 + depth * 18}px`;
  tdGroup.style.color = '#38bdf8';
  tdGroup.style.fontWeight = 'bold';
  tdGroup.style.fontSize = '12px';

  const iconSpan = doc.createElement('span');
  iconSpan.style.marginRight = '6px';
  const isUnassigned = node.label === 'Unassigned';
  iconSpan.textContent = (isExpanded ? '▼ ' : '▶ ') + (isUnassigned ? '📦 ' : '📂 ');

  const textSpan = doc.createElement('span');
  textSpan.textContent = isUnassigned ? 'General Piping & Supports' : node.label;

  const badge = doc.createElement('span');
  badge.style.marginLeft = '8px';
  badge.style.fontSize = '10px';
  badge.style.background = '#1e293b';
  badge.style.color = '#94a3b8';
  badge.style.padding = '1px 6px';
  badge.style.borderRadius = '10px';
  badge.textContent = `${node.entityCount}`;

  tdGroup.append(iconSpan, textSpan, badge);
  trGroup.append(tdGroup);
  trGroup.addEventListener('click', onToggle);
  return trGroup;
}

function renderEntityRow(doc, entity, depth, state, store, supportPresenter, selectedId, query) {
  const id = entity.entityId;
  const name = entity.name || id;
  const type = entity.entityType || 'OBJECT';
  const geom = entity.properties?.geometry || {};
  const attrs = entity.properties?.attributes || {};
  const sourceAttrs = entity.properties?.sourceAttributes || {};

  const lineNo = attrs.LINE_NO || attrs.LINENO || attrs.LINE_ID || sourceAttrs.LINE_ID || 'LINE-001';
  const startPt = geom.start || geom.position || geom.center || attrs.POS || sourceAttrs.POS || { x: 0, y: 0, z: 0 };
  const endPt = geom.end || geom.center || startPt;

  const dx = (endPt.x || 0) - (startPt.x || 0);
  const dy = (endPt.y || 0) - (startPt.y || 0);
  const dz = (endPt.z || 0) - (startPt.z || 0);
  const lengthMm = type === 'PIPE' ? Math.sqrt(dx * dx + dy * dy + dz * dz) : 0;

  if (query && !id.toLowerCase().includes(query) && !name.toLowerCase().includes(query) && !type.toLowerCase().includes(query)) {
    return null;
  }

  const tr = doc.createElement('tr');
  tr.className = 'topology-table-row';
  tr.setAttribute('data-entity-id', id);
  const isSelected = id === selectedId;
  tr.style.background = isSelected ? '#1e293b' : 'transparent';
  tr.style.borderBottom = '1px solid #1e293b';
  tr.style.cursor = 'pointer';

  tr.addEventListener('click', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON') return;
    store.selectEntity(id);
  });

  const tdSel = doc.createElement('td');
  tdSel.style.textAlign = 'center';
  tdSel.style.padding = '4px';
  const radio = doc.createElement('input');
  radio.type = 'radio';
  radio.name = 'table-row-select';
  radio.checked = isSelected;
  radio.addEventListener('change', () => store.selectEntity(id));
  tdSel.append(radio);
  tr.append(tdSel);

  const tdId = doc.createElement('td');
  tdId.style.padding = '4px';
  tdId.style.paddingLeft = `${12 + depth * 16}px`;
  tdId.style.color = '#38bdf8';
  tdId.textContent = (depth > 0 ? '└─ ' : '') + name;
  tr.append(tdId);

  const tdType = doc.createElement('td');
  tdType.style.padding = '4px';
  const typeBadge = doc.createElement('span');
  typeBadge.style.padding = '2px 6px';
  typeBadge.style.borderRadius = '3px';
  typeBadge.style.fontSize = '10px';
  typeBadge.style.background = type === 'PIPE' ? '#0284c7' : type === 'TEE' ? '#a855f7' : type === 'ELBO' ? '#ec4899' : '#10b981';
  typeBadge.style.color = '#ffffff';
  typeBadge.textContent = type;
  tdType.append(typeBadge);
  tr.append(tdType);

  tr.append(
    tdCell(doc, `(${startPt.x?.toFixed(0)}, ${startPt.y?.toFixed(0)}, ${startPt.z?.toFixed(0)})`),
    tdCell(doc, `(${endPt.x?.toFixed(0)}, ${endPt.y?.toFixed(0)}, ${endPt.z?.toFixed(0)})`)
  );

  const tdLen = doc.createElement('td');
  tdLen.style.padding = '4px';
  if (type === 'PIPE') {
    const lenInput = doc.createElement('input');
    lenInput.type = 'number';
    lenInput.value = Math.round(lengthMm);
    lenInput.style.cssText = 'width:60px;background:#020617;border:1px solid #334155;color:#f8fafc;border-radius:3px;padding:2px 4px;';
    lenInput.addEventListener('change', (e) => {
      const newLen = Number(e.target.value);
      if (newLen > 0) {
        const ratio = newLen / (lengthMm || 1);
        const newEnd = { x: startPt.x + dx * ratio, y: startPt.y + dy * ratio, z: startPt.z + dz * ratio };
        store.updateEntityGeometry(id, { end: newEnd });
      }
    });
    tdLen.append(lenInput);
  } else {
    tdLen.textContent = '-';
  }
  tr.append(tdLen, tdCell(doc, lineNo));

  const isSupp = type === 'SUPPORT' || entity.category === 'support';
  const loadStr = isSupp ? supportPresenter.getTableSummary(entity) : '-';
  tr.append(tdCell(doc, loadStr, isSupp ? '#38bdf8' : '#64748b'));

  const tdActions = doc.createElement('td');
  tdActions.style.cssText = 'padding:4px;display:flex;gap:4px;';
  if (type === 'PIPE') {
    tdActions.append(
      createActionBtn(doc, '✂️', 'Split Pipe', '#1e293b', () => store.executeQuickAction('SPLIT_PIPE', id)),
      createActionBtn(doc, '⚙️', 'Add Flange Set', '#1e293b', () => store.executeQuickAction('ADD_FLANGE_SET', id)),
      createActionBtn(doc, '🚰', 'Add Valve', '#1e293b', () => store.executeQuickAction('ADD_VALVE', id))
    );
  }
  tdActions.append(createActionBtn(doc, '🗑️', 'Delete Component', '#991b1b', () => store.executeQuickAction('RETIRE_COMPONENT', id)));
  tr.append(tdActions);

  return tr;
}

function tdCell(doc, text, color = null) {
  const cell = doc.createElement('td');
  cell.style.padding = '4px';
  if (color) cell.style.color = color;
  cell.textContent = text;
  return cell;
}

function createActionBtn(doc, icon, title, bg, onClick) {
  const btn = doc.createElement('button');
  btn.type = 'button';
  btn.textContent = icon;
  btn.title = title;
  btn.style.cssText = `padding:2px 5px;background:${bg};border:1px solid #334155;border-radius:3px;cursor:pointer;color:#fff;`;
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
  });
  return btn;
}
