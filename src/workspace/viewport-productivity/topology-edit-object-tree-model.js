import {
  deepFreeze,
  isPlainRecord,
  semanticHash,
  stringValue,
} from '../../core/shared-piping-model/index.js';

export const TOPOLOGY_EDIT_OBJECT_TREE_SCHEMA = 'TopologyEditObjectTree.v1';

const GROUPS = Object.freeze([
  { key: 'nodes', kind: 'NODE', label: 'Nodes', prefix: 'node:' },
  { key: 'edges', kind: 'EDGE', label: 'Edges', prefix: 'edge:' },
  { key: 'junctions', kind: 'JUNCTION', label: 'Junctions', prefix: 'junction:' },
  { key: 'supports', kind: 'SUPPORT', label: 'Supports', prefix: 'support:' },
  { key: 'boundaries', kind: 'BOUNDARY', label: 'Boundaries', prefix: 'boundary:' },
  { key: 'rigids', kind: 'RIGID', label: 'Rigids', prefix: 'rigid:' },
  { key: 'bends', kind: 'BEND', label: 'Bends', prefix: 'bend:' },
]);

const ACTIONS = Object.freeze({
  NODE: Object.freeze([
    Object.freeze({
      id: 'move-positive-z',
      label: 'Move +Z',
      title: 'Move this canonical node exactly +100 mm on Z through the governed command journal.',
    }),
  ]),
  EDGE: Object.freeze([
    Object.freeze({
      id: 'split-edge-half',
      label: 'Split 50%',
      title: 'Split this canonical edge at exactly 50% of centerline length.',
    }),
    Object.freeze({
      id: 'disconnect-from',
      label: 'Disconnect FROM',
      title: 'Disconnect the FROM endpoint through the governed command journal.',
    }),
    Object.freeze({
      id: 'disconnect-to',
      label: 'Disconnect TO',
      title: 'Disconnect the TO endpoint through the governed command journal.',
    }),
    Object.freeze({
      id: 'delete-edge',
      label: 'Delete',
      title: 'Delete this canonical edge through the governed command journal.',
    }),
  ]),
});

export function createTopologyEditObjectTree(topology) {
  if (!isPlainRecord(topology)) fail('topology must be an object.');
  const canonicalTopologyHash = requiredText(
    topology.canonicalTopologyHash,
    'topology.canonicalTopologyHash',
  );
  const seen = new Set();
  const groups = GROUPS.map((definition) => {
    const rows = topology[definition.key] ?? [];
    if (!Array.isArray(rows)) fail(`topology.${definition.key} must be an array.`);
    const items = rows.map((row, index) => objectTreeItem(
      row,
      index,
      definition,
      seen,
    )).sort((left, right) => compareText(left.canonicalId, right.canonicalId));
    return deepFreeze({
      key: definition.key,
      kind: definition.kind,
      label: definition.label,
      count: items.length,
      items,
    });
  });
  const material = {
    schema: TOPOLOGY_EDIT_OBJECT_TREE_SCHEMA,
    canonicalTopologyHash,
    totalCount: groups.reduce((sum, group) => sum + group.count, 0),
    groups,
  };
  return deepFreeze({ ...material, treeHash: semanticHash(material) });
}

export function assertTopologyEditObjectTree(value) {
  if (!isPlainRecord(value)) fail('tree must be an object.');
  if (value.schema !== TOPOLOGY_EDIT_OBJECT_TREE_SCHEMA) {
    fail(`tree must use ${TOPOLOGY_EDIT_OBJECT_TREE_SCHEMA}.`);
  }
  if (!Array.isArray(value.groups)) fail('tree.groups must be an array.');
  const material = { ...value };
  delete material.treeHash;
  if (value.treeHash !== semanticHash(material)) {
    fail('tree hash does not match normalized authority.', RangeError);
  }
  return value;
}

export function filterTopologyEditObjectTree(tree, queryInput = '') {
  const normalized = assertTopologyEditObjectTree(tree);
  const query = stringValue(queryInput).toLowerCase();
  if (!query) return normalized;
  const groups = normalized.groups.map((group) => {
    const items = group.items.filter((item) => item.searchText.includes(query));
    return deepFreeze({ ...group, count: items.length, items });
  });
  const material = {
    schema: normalized.schema,
    canonicalTopologyHash: normalized.canonicalTopologyHash,
    totalCount: groups.reduce((sum, group) => sum + group.count, 0),
    groups,
  };
  return deepFreeze({ ...material, treeHash: semanticHash(material) });
}

function objectTreeItem(row, index, definition, seen) {
  if (!isPlainRecord(row)) {
    fail(`topology.${definition.key}[${index}] must be an object.`);
  }
  const canonicalId = requiredText(
    row.id,
    `topology.${definition.key}[${index}].id`,
  );
  if (!canonicalId.startsWith(definition.prefix)) {
    fail(`${canonicalId} is not a canonical ${definition.kind.toLowerCase()} ID.`, RangeError);
  }
  if (seen.has(canonicalId)) {
    fail(`canonical ID ${canonicalId} appears more than once.`, RangeError);
  }
  seen.add(canonicalId);
  const label = primaryLabel(row, canonicalId);
  const description = itemDescription(row, definition.kind);
  const actionRows = ACTIONS[definition.kind] ?? [];
  return deepFreeze({
    canonicalId,
    kind: definition.kind,
    label,
    description,
    actions: actionRows,
    searchText: [
      canonicalId,
      definition.kind,
      label,
      description,
      stringValue(row.componentKey),
      stringValue(row.entityId),
      stringValue(row.entityType),
    ].join(' ').toLowerCase(),
  });
}

function primaryLabel(row, canonicalId) {
  return stringValue(row.componentKey)
    || stringValue(row.entityId)
    || stringValue(row.entityType)
    || canonicalId;
}

function itemDescription(row, kind) {
  switch (kind) {
    case 'NODE': return pointDescription(row.position);
    case 'EDGE': return compact([
      stringValue(row.entityType) || 'EDGE',
      `${stringValue(row.fromNodeId)} → ${stringValue(row.toNodeId)}`,
      finiteNumber(row.diameterMm) ? `DN ${formatNumber(row.diameterMm)}` : '',
    ]);
    case 'JUNCTION': return compact([
      stringValue(row.entityType) || 'JUNCTION',
      Array.isArray(row.nodeIds) ? `${row.nodeIds.length} nodes` : '',
    ]);
    case 'SUPPORT': return compact([
      stringValue(row.supportType) || stringValue(row.restraintType) || 'SUPPORT',
      stringValue(row.nodeId),
    ]);
    case 'BOUNDARY': return compact([
      stringValue(row.boundaryType) || 'BOUNDARY',
      stringValue(row.nodeId),
    ]);
    case 'RIGID': return compact([
      stringValue(row.entityType) || 'RIGID',
      stringValue(row.fromNodeId) && stringValue(row.toNodeId)
        ? `${row.fromNodeId} → ${row.toNodeId}`
        : '',
    ]);
    case 'BEND': return compact([
      stringValue(row.entityType) || 'BEND',
      finiteNumber(row.radiusMm) ? `R ${formatNumber(row.radiusMm)} mm` : '',
    ]);
    default: return '';
  }
}

function pointDescription(point) {
  if (!isPlainRecord(point)) return 'Position unavailable';
  const values = ['x', 'y', 'z'].map((axis) => Number(point[axis]));
  if (!values.every(Number.isFinite)) return 'Position unavailable';
  return `(${values.map(formatNumber).join(', ')}) mm`;
}

function compact(values) {
  return values.map((value) => stringValue(value)).filter(Boolean).join(' · ');
}
function finiteNumber(value) { return Number.isFinite(Number(value)); }
function formatNumber(value) { return Number(value).toLocaleString('en-US', { maximumFractionDigits: 3 }); }
function compareText(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
function requiredText(value, label) {
  const text = stringValue(value);
  if (!text) fail(`${label} is required.`);
  return text;
}
function fail(message, Constructor = TypeError) {
  throw new Constructor(`TopologyEditObjectTree: ${message}`);
}
