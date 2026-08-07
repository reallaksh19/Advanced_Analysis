import { deepFreeze, semanticHash, stringValue } from '../../../core/shared-piping-model/index.js';
import { assertTopologyEditTableProjection } from './topology-edit-table-projection.js';

export const TOPOLOGY_EDIT_TABLE_IDENTITY_INDEX_SCHEMA = 'TopologyEditTableIdentityIndex.v1';

export function buildTopologyEditTableIdentityIndex(projectionInput) {
  const projection = assertTopologyEditTableProjection(projectionInput);
  const rowById = {};
  const byCanonicalId = {};
  const byComponentKey = {};
  const byEntityId = {};
  const bySourceEntityId = {};
  const byNodeId = {};
  const byPortKey = {};
  for (const row of projection.rows) {
    if (rowById[row.rowId]) throw new Error(`Duplicate table rowId ${row.rowId}.`);
    rowById[row.rowId] = row;
    append(byCanonicalId, row.identity.canonicalId, row.rowId);
    append(byComponentKey, row.identity.componentKey, row.rowId);
    append(byEntityId, row.identity.entityId, row.rowId);
    append(bySourceEntityId, row.identity.sourceEntityId, row.rowId);
    for (const nodeId of row.identity.nodeIds ?? []) append(byNodeId, nodeId, row.rowId);
    for (const binding of row.identity.portBindings ?? []) append(byPortKey, binding.portKey, row.rowId);
  }
  const material = {
    schema: TOPOLOGY_EDIT_TABLE_IDENTITY_INDEX_SCHEMA,
    projectionHash: projection.projectionHash,
    rowById,
    byCanonicalId: sortedIndex(byCanonicalId),
    byComponentKey: sortedIndex(byComponentKey),
    byEntityId: sortedIndex(byEntityId),
    bySourceEntityId: sortedIndex(bySourceEntityId),
    byNodeId: sortedIndex(byNodeId),
    byPortKey: sortedIndex(byPortKey),
  };
  return deepFreeze({ ...material, indexHash: semanticHash(material) });
}

export function resolveTopologyEditTableRows(index, selector = {}) {
  assertIndex(index);
  const lookup = selectorLookup(index, selector);
  if (!lookup) return [];
  return lookup.map((rowId) => index.rowById[rowId]);
}

export function resolveExactTopologyEditTableRow(index, selector = {}) {
  const rows = resolveTopologyEditTableRows(index, selector);
  if (rows.length !== 1) {
    throw new RangeError(`TopologyEditTableIdentityIndex: selector resolved ${rows.length} rows; exactly one is required.`);
  }
  return rows[0];
}

export function assertTopologyEditTableIdentityIndex(index) {
  assertIndex(index);
  const material = { ...index };
  delete material.indexHash;
  if (semanticHash(material) !== index.indexHash) {
    throw new Error('TopologyEditTableIdentityIndex: index hash mismatch.');
  }
  return index;
}

function selectorLookup(index, selector) {
  const candidates = [
    ['rowId', index.rowById],
    ['canonicalId', index.byCanonicalId],
    ['componentKey', index.byComponentKey],
    ['entityId', index.byEntityId],
    ['sourceEntityId', index.bySourceEntityId],
    ['nodeId', index.byNodeId],
    ['portKey', index.byPortKey],
  ].filter(([key]) => stringValue(selector[key]));
  if (candidates.length !== 1) {
    throw new TypeError('TopologyEditTableIdentityIndex: selector must provide exactly one exact identity key.');
  }
  const [[key, source]] = candidates;
  const value = stringValue(selector[key]);
  if (key === 'rowId') return source[value] ? [value] : [];
  return source[value] ?? [];
}

function assertIndex(index) {
  if (index?.schema !== TOPOLOGY_EDIT_TABLE_IDENTITY_INDEX_SCHEMA || !index.rowById) {
    throw new TypeError(`Identity index must use ${TOPOLOGY_EDIT_TABLE_IDENTITY_INDEX_SCHEMA}.`);
  }
}
function append(index, key, rowId) {
  const normalized = stringValue(key);
  if (!normalized) return;
  const rows = index[normalized] ?? [];
  if (!rows.includes(rowId)) rows.push(rowId);
  index[normalized] = rows;
}
function sortedIndex(index) {
  return Object.fromEntries(Object.entries(index)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, rowIds]) => [key, [...rowIds].sort()]));
}
