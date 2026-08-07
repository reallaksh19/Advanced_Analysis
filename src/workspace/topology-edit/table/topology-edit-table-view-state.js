import { deepFreeze, semanticHash, stringValue } from '../../../core/shared-piping-model/index.js';
import { assertTopologyEditTableProjection } from './topology-edit-table-projection.js';

export const TOPOLOGY_EDIT_TABLE_VIEW_STATE_SCHEMA = 'TopologyEditTableViewState.v1';

const DIRECTIONS = new Set(['ASC', 'DESC']);

export function createTopologyEditTableViewState(input = {}) {
  const selectedRowIds = uniqueSorted(input.selectedRowIds ?? []);
  const primaryRowId = nullableText(input.primaryRowId);
  const anchorRowId = nullableText(input.anchorRowId);
  if (primaryRowId && !selectedRowIds.includes(primaryRowId)) {
    throw new RangeError('TopologyEditTableViewState: primaryRowId must be selected.');
  }
  if (anchorRowId && !selectedRowIds.includes(anchorRowId)) {
    throw new RangeError('TopologyEditTableViewState: anchorRowId must be selected.');
  }
  const material = {
    schema: TOPOLOGY_EDIT_TABLE_VIEW_STATE_SCHEMA,
    open: input.open !== false,
    query: String(input.query ?? ''),
    sortKey: stringValue(input.sortKey) || 'tag',
    sortDirection: direction(input.sortDirection ?? 'ASC'),
    selectedRowIds,
    primaryRowId,
    anchorRowId,
  };
  return deepFreeze({ ...material, viewStateHash: semanticHash(material) });
}

export function reduceTopologyEditTableViewState(stateInput, action = {}) {
  const state = assertTopologyEditTableViewState(stateInput);
  const type = String(action.type ?? '').trim().toUpperCase();
  if (type === 'OPEN') return createTopologyEditTableViewState({ ...state, open: true });
  if (type === 'CLOSE') return createTopologyEditTableViewState({ ...state, open: false });
  if (type === 'QUERY') return createTopologyEditTableViewState({ ...state, query: action.query ?? '' });
  if (type === 'SORT') return createTopologyEditTableViewState({
    ...state,
    sortKey: action.sortKey,
    sortDirection: action.sortDirection ?? state.sortDirection,
  });
  if (type === 'SELECTION') return selectionState(state, action);
  throw new RangeError(`TopologyEditTableViewState: unsupported action ${type || '<empty>'}.`);
}

export function assertTopologyEditTableViewState(value) {
  if (value?.schema !== TOPOLOGY_EDIT_TABLE_VIEW_STATE_SCHEMA) {
    throw new TypeError(`Table view state must use ${TOPOLOGY_EDIT_TABLE_VIEW_STATE_SCHEMA}.`);
  }
  const material = { ...value };
  delete material.viewStateHash;
  if (semanticHash(material) !== value.viewStateHash) {
    throw new Error('TopologyEditTableViewState: view state hash mismatch.');
  }
  return value;
}

export function topologyEditTableVisibleRows(projectionInput, stateInput) {
  const projection = assertTopologyEditTableProjection(projectionInput);
  const state = assertTopologyEditTableViewState(stateInput);
  const query = state.query.trim().toLowerCase();
  const rows = projection.rows.filter((row) => !query || searchText(row).includes(query));
  const factor = state.sortDirection === 'DESC' ? -1 : 1;
  return deepFreeze([...rows].sort((left, right) => {
    const comparison = compareValues(fieldValue(left, state.sortKey), fieldValue(right, state.sortKey));
    return comparison ? comparison * factor : left.rowId.localeCompare(right.rowId);
  }));
}

export function topologyEditTableSelectionCanonicalIds(projectionInput, stateInput) {
  const projection = assertTopologyEditTableProjection(projectionInput);
  const state = assertTopologyEditTableViewState(stateInput);
  const selected = new Set(state.selectedRowIds);
  return deepFreeze(projection.rows
    .filter((row) => selected.has(row.rowId))
    .map((row) => row.identity.canonicalId)
    .sort());
}

export function topologyEditTableRowIdsForCanonicalSelection(projectionInput, canonicalIds = []) {
  const projection = assertTopologyEditTableProjection(projectionInput);
  const selected = new Set((canonicalIds ?? []).map(String));
  return deepFreeze(projection.rows
    .filter((row) => selected.has(row.identity.canonicalId))
    .map((row) => row.rowId)
    .sort());
}

function selectionState(state, action) {
  const selectedRowIds = uniqueSorted(action.selectedRowIds ?? []);
  return createTopologyEditTableViewState({
    ...state,
    selectedRowIds,
    primaryRowId: nullableText(action.primaryRowId)
      ?? (selectedRowIds.length === 1 ? selectedRowIds[0] : null),
    anchorRowId: nullableText(action.anchorRowId)
      ?? (selectedRowIds.length === 1 ? selectedRowIds[0] : null),
  });
}
function fieldValue(row, key) {
  if (key === 'elementType') return row.elementType;
  if (key === 'canonicalId') return row.identity.canonicalId;
  return row.fields?.[key] ?? null;
}
function searchText(row) {
  return [
    row.identity.canonicalId,
    row.identity.componentKey,
    row.identity.entityId,
    row.identity.sourceEntityId,
    row.elementType,
    ...Object.values(row.fields ?? {}),
  ].filter((value) => value !== null && value !== undefined)
    .map((value) => typeof value === 'object' ? JSON.stringify(value) : String(value))
    .join('\n')
    .toLowerCase();
}
function compareValues(left, right) {
  if (left === right) return 0;
  if (left === null || left === undefined) return 1;
  if (right === null || right === undefined) return -1;
  if (typeof left === 'number' && typeof right === 'number') return left - right;
  return String(left).localeCompare(String(right), undefined, { numeric: true, sensitivity: 'base' });
}
function direction(value) {
  const token = String(value ?? '').trim().toUpperCase();
  if (!DIRECTIONS.has(token)) throw new RangeError(`TopologyEditTableViewState: unsupported sort direction ${token}.`);
  return token;
}
function nullableText(value) { const text = stringValue(value); return text || null; }
function uniqueSorted(values) {
  return [...new Set((values ?? []).map((value) => stringValue(value)).filter(Boolean))].sort();
}
