import {
  deepFreeze,
  isPlainRecord,
  semanticHash,
  stringValue,
} from '../../../core/shared-piping-model/index.js';

export const TOPOLOGY_EDIT_CHANGED_SCOPE_SCHEMA = 'TopologyEditChangedScope.v1';

const ID_FIELDS = Object.freeze({
  nodeIds: { prefix: 'node:', index: 'nodes' },
  edgeIds: { prefix: 'edge:', index: 'edges' },
  junctionIds: { prefix: 'junction:', index: 'junctions' },
  supportIds: { prefix: 'support:', index: 'supports' },
  boundaryIds: { prefix: 'boundary:', index: 'boundaries' },
});

export function createTopologyEditChangedScope(input = {}) {
  const material = {
    schema: TOPOLOGY_EDIT_CHANGED_SCOPE_SCHEMA,
    basisHash: requiredText(input.basisHash, 'basisHash'),
    ...Object.fromEntries(Object.entries(ID_FIELDS).map(([field, descriptor]) => [
      field,
      normalizeIds(input[field], field, descriptor.prefix),
    ])),
    sourceRecordIds: normalizeIds(input.sourceRecordIds, 'sourceRecordIds'),
    validationNeighbourhoodIds: normalizeIds(
      input.validationNeighbourhoodIds,
      'validationNeighbourhoodIds',
    ),
  };
  return deepFreeze({ ...material, changedScopeHash: semanticHash(material) });
}

export function assertTopologyEditChangedScope(value) {
  if (!isPlainRecord(value)) fail('scope must be an object.');
  const rebuilt = createTopologyEditChangedScope(value);
  const supplied = { ...value };
  delete supplied.changedScopeHash;
  if (
    value.schema !== TOPOLOGY_EDIT_CHANGED_SCOPE_SCHEMA
    || value.changedScopeHash !== semanticHash(supplied)
    || value.changedScopeHash !== rebuilt.changedScopeHash
  ) fail('scope differs from its immutable normalized authority.', RangeError);
  return rebuilt;
}

export function assertTopologyEditScopeBasis(topology, scope) {
  const normalized = assertTopologyEditChangedScope(scope);
  const current = topologyBasisHash(topology);
  if (normalized.basisHash !== current) {
    fail(`stale basis ${normalized.basisHash}; current topology is ${current}.`, RangeError);
  }
  return normalized;
}

export function deriveTopologyEditChangedScope(topology, input = {}) {
  const basisHash = requiredText(input.basisHash ?? topology?.canonicalTopologyHash, 'basisHash');
  const current = topologyBasisHash(topology);
  if (basisHash !== current) fail(`stale basis ${basisHash}; current topology is ${current}.`, RangeError);
  const indexes = buildIndexes(topology);
  const affected = seedSets(input);
  assertKnownSeeds(affected, indexes);

  affected.edgeIds.forEach((id) => addEdgeNodes(indexes.edges.get(id), affected.nodeIds));
  affected.junctionIds.forEach((id) => addIds(affected.nodeIds, indexes.junctions.get(id)?.nodeIds));
  affected.supportIds.forEach((id) => addOptional(affected.nodeIds, indexes.supports.get(id)?.nodeId));
  affected.boundaryIds.forEach((id) => addIds(affected.nodeIds, boundaryNodeIds(indexes.boundaries.get(id))));
  affected.nodeIds.forEach((nodeId) => addIncidentRecords(nodeId, indexes, affected));

  const neighbourhood = new Set([
    ...affected.nodeIds,
    ...affected.edgeIds,
    ...affected.junctionIds,
    ...affected.supportIds,
    ...affected.boundaryIds,
    ...normalizeIds(input.validationNeighbourhoodIds, 'validationNeighbourhoodIds'),
  ]);
  affected.nodeIds.forEach((nodeId) => addNodeNeighbourhood(nodeId, indexes, neighbourhood));
  affected.edgeIds.forEach((edgeId) => {
    const edge = indexes.edges.get(edgeId);
    addIds(neighbourhood, [edge?.fromNodeId, edge?.toNodeId]);
    [edge?.fromNodeId, edge?.toNodeId].filter(Boolean)
      .forEach((nodeId) => addNodeNeighbourhood(nodeId, indexes, neighbourhood));
  });

  const sourceRecordIds = new Set(normalizeIds(input.sourceRecordIds, 'sourceRecordIds'));
  collectSourceRecords(topology, affected, sourceRecordIds);
  return createTopologyEditChangedScope({
    basisHash,
    ...Object.fromEntries(Object.keys(ID_FIELDS).map((field) => [field, [...affected[field]]])),
    sourceRecordIds: [...sourceRecordIds],
    validationNeighbourhoodIds: [...neighbourhood],
  });
}

function buildIndexes(topology) {
  if (!isPlainRecord(topology)) fail('topology must be an object.');
  return {
    nodes: indexRows(topology.nodes, 'id', 'nodes'),
    edges: indexRows(topology.edges, 'id', 'edges'),
    junctions: indexRows(topology.junctions, 'id', 'junctions'),
    supports: indexRows(topology.supports, 'id', 'supports'),
    boundaries: indexRows(topology.boundaries ?? [], 'id', 'boundaries'),
  };
}

function indexRows(rows, key, label) {
  if (!Array.isArray(rows)) fail(`topology.${label} must be an array.`);
  const result = new Map();
  rows.forEach((row, index) => {
    if (!isPlainRecord(row)) fail(`topology.${label}[${index}] must be an object.`);
    const id = requiredText(row[key], `topology.${label}[${index}].${key}`);
    if (result.has(id)) fail(`topology.${label} contains duplicate ID ${id}.`, RangeError);
    result.set(id, row);
  });
  return result;
}

function seedSets(input) {
  return Object.fromEntries(Object.entries(ID_FIELDS).map(([field, descriptor]) => [
    field,
    new Set(normalizeIds(input[field], field, descriptor.prefix)),
  ]));
}

function assertKnownSeeds(affected, indexes) {
  Object.entries(ID_FIELDS).forEach(([field, descriptor]) => {
    const index = indexes[descriptor.index];
    affected[field].forEach((id) => {
      if (!index.has(id)) fail(`${field} contains unknown canonical ID ${id}.`, RangeError);
    });
  });
}

function addIncidentRecords(nodeId, indexes, affected) {
  indexes.edges.forEach((edge, id) => {
    if (edge.fromNodeId === nodeId || edge.toNodeId === nodeId) affected.edgeIds.add(id);
  });
  indexes.junctions.forEach((junction, id) => {
    if ((junction.nodeIds || []).includes(nodeId)) affected.junctionIds.add(id);
  });
  indexes.supports.forEach((support, id) => {
    if (support.nodeId === nodeId) affected.supportIds.add(id);
  });
  indexes.boundaries.forEach((boundary, id) => {
    if (boundaryNodeIds(boundary).includes(nodeId)) affected.boundaryIds.add(id);
  });
}

function addNodeNeighbourhood(nodeId, indexes, result) {
  addOptional(result, nodeId);
  indexes.edges.forEach((edge, id) => {
    if (edge.fromNodeId !== nodeId && edge.toNodeId !== nodeId) return;
    result.add(id);
    addOptional(result, edge.fromNodeId);
    addOptional(result, edge.toNodeId);
  });
  indexes.junctions.forEach((junction, id) => {
    if (!(junction.nodeIds || []).includes(nodeId)) return;
    result.add(id);
    addIds(result, junction.nodeIds);
  });
  indexes.supports.forEach((support, id) => { if (support.nodeId === nodeId) result.add(id); });
  indexes.boundaries.forEach((boundary, id) => {
    if (boundaryNodeIds(boundary).includes(nodeId)) result.add(id);
  });
}

function collectSourceRecords(topology, affected, result) {
  const crosswalk = isPlainRecord(topology.crosswalk) ? topology.crosswalk : {};
  affected.nodeIds.forEach((id) => addIds(result, crosswalk.nodeIdToPortKeys?.[id]));
  affected.edgeIds.forEach((id) => addOptional(result, crosswalk.edgeIdToComponentKey?.[id]));
  affected.junctionIds.forEach((id) => addOptional(result, crosswalk.junctionIdToComponentKey?.[id]));
  affected.supportIds.forEach((id) => addOptional(result, crosswalk.supportIdToEntityId?.[id]));
  const rows = [...(topology.edges || []), ...(topology.junctions || []), ...(topology.supports || [])];
  const affectedIds = new Set([...affected.edgeIds, ...affected.junctionIds, ...affected.supportIds]);
  rows.forEach((row) => {
    if (!affectedIds.has(row.id)) return;
    addOptional(result, row.componentKey);
    addOptional(result, row.entityId);
  });
}

function boundaryNodeIds(boundary) {
  if (!isPlainRecord(boundary)) return [];
  return normalizeIds([
    boundary.nodeId,
    ...(Array.isArray(boundary.nodeIds) ? boundary.nodeIds : []),
  ].filter(Boolean), 'boundary.nodeIds', 'node:');
}

function addEdgeNodes(edge, result) { addIds(result, [edge?.fromNodeId, edge?.toNodeId]); }
function addOptional(set, value) { const text = stringValue(value); if (text) set.add(text); }
function addIds(set, values) { (Array.isArray(values) ? values : []).forEach((value) => addOptional(set, value)); }

function normalizeIds(value, label, prefix = '') {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) fail(`${label} must be an array.`);
  const ids = value.map((row, index) => requiredText(row, `${label}[${index}]`));
  if (prefix && ids.some((id) => !id.startsWith(prefix))) {
    fail(`${label} must contain exact ${prefix.slice(0, -1)} canonical IDs.`, RangeError);
  }
  return [...new Set(ids)].sort((left, right) => left.localeCompare(right));
}

function topologyBasisHash(topology) {
  return requiredText(topology?.canonicalTopologyHash, 'topology.canonicalTopologyHash');
}
function requiredText(value, label) {
  const text = stringValue(value);
  if (!text) fail(`${label} is required.`);
  return text;
}
function fail(message, Constructor = TypeError) {
  throw new Constructor(`TopologyEditChangedScope: ${message}`);
}
