import {
  deepFreeze,
  isPlainRecord,
  semanticHash,
  stringValue,
} from '../../../core/shared-piping-model/index.js';
import { assertTopologyEditChangedScope } from './topology-edit-change-scope.js';

export const TOPOLOGY_EDIT_VALIDATION_SCOPE_SCHEMA =
  'TopologyEditValidationScopeProjection.v1';

const COLLECTIONS = Object.freeze([
  'nodes', 'edges', 'junctions', 'supports', 'boundaries', 'rigids', 'bends',
]);

export function projectTopologyEditValidationScope(canonical, changedScopeInput) {
  const changedScope = assertTopologyEditChangedScope(changedScopeInput);
  const topology = assertCanonicalCollections(canonical);
  const selected = selectionSets(changedScope);
  selectEdges(topology.edges, selected);
  selectDependentRecords(topology, selected);
  selectReferencedRecords(topology, selected);

  const scopedCanonical = Object.fromEntries(COLLECTIONS.map((collection) => [
    collection,
    topology[collection].filter((row) => selected[collection].has(row.id)),
  ]));
  const material = {
    schema: TOPOLOGY_EDIT_VALIDATION_SCOPE_SCHEMA,
    sourceTopologyHash: requiredText(
      canonical.canonicalTopologyHash,
      'canonical.canonicalTopologyHash',
    ),
    changedScopeHash: changedScope.changedScopeHash,
    ids: Object.fromEntries(COLLECTIONS.map((collection) => [
      collection,
      [...selected[collection]].sort((left, right) => left.localeCompare(right)),
    ])),
    canonical: {
      schema: canonical.schema ?? null,
      datasetId: canonical.datasetId ?? null,
      sourceHash: canonical.sourceHash ?? null,
      ...scopedCanonical,
    },
  };
  return deepFreeze({ ...material, projectionHash: semanticHash(material) });
}

export function assertTopologyEditValidationScope(value) {
  if (!isPlainRecord(value)) fail('projection must be an object.');
  if (value.schema !== TOPOLOGY_EDIT_VALIDATION_SCOPE_SCHEMA) {
    fail(`projection must use ${TOPOLOGY_EDIT_VALIDATION_SCOPE_SCHEMA}.`);
  }
  const material = { ...value };
  delete material.projectionHash;
  if (value.projectionHash !== semanticHash(material)) {
    fail('projection hash does not match normalized authority.', RangeError);
  }
  assertCanonicalCollections(value.canonical);
  return value;
}

export function topologyEditValidationScopeIds(projectionInput) {
  const projection = assertTopologyEditValidationScope(projectionInput);
  return deepFreeze(COLLECTIONS.flatMap((collection) => projection.ids[collection] ?? [])
    .sort((left, right) => left.localeCompare(right)));
}

function selectionSets(changedScope) {
  const all = new Set([
    ...changedScope.nodeIds,
    ...changedScope.edgeIds,
    ...changedScope.junctionIds,
    ...changedScope.supportIds,
    ...changedScope.boundaryIds,
    ...changedScope.validationNeighbourhoodIds,
  ]);
  return {
    nodes: byPrefix(all, 'node:'),
    edges: byPrefix(all, 'edge:'),
    junctions: byPrefix(all, 'junction:'),
    supports: byPrefix(all, 'support:'),
    boundaries: byPrefix(all, 'boundary:'),
    rigids: byPrefix(all, 'rigid:'),
    bends: byPrefix(all, 'bend:'),
  };
}

function selectEdges(edges, selected) {
  edges.forEach((edge) => {
    if (!selected.edges.has(edge.id)) return;
    add(selected.nodes, edge.fromNodeId);
    add(selected.nodes, edge.toNodeId);
  });
}

function selectDependentRecords(topology, selected) {
  for (const collection of ['junctions', 'supports', 'boundaries', 'rigids', 'bends']) {
    topology[collection].forEach((record) => {
      if (selected[collection].has(record.id)
        || referencesAny(record, selected.nodes, selected.edges)) {
        selected[collection].add(record.id);
      }
    });
  }
}

function selectReferencedRecords(topology, selected) {
  for (const collection of ['junctions', 'supports', 'boundaries', 'rigids', 'bends']) {
    topology[collection].forEach((record) => {
      if (!selected[collection].has(record.id)) return;
      referencedNodeIds(record).forEach((id) => add(selected.nodes, id));
      referencedEdgeIds(record).forEach((id) => add(selected.edges, id));
    });
  }
  topology.edges.forEach((edge) => {
    if (!selected.edges.has(edge.id)) return;
    add(selected.nodes, edge.fromNodeId);
    add(selected.nodes, edge.toNodeId);
  });
}

function referencesAny(record, nodeIds, edgeIds) {
  return referencedNodeIds(record).some((id) => nodeIds.has(id))
    || referencedEdgeIds(record).some((id) => edgeIds.has(id));
}

function referencedNodeIds(record) {
  return uniqueText([
    record.nodeId,
    record.fromNodeId,
    record.toNodeId,
    ...(Array.isArray(record.nodeIds) ? record.nodeIds : []),
    ...(Array.isArray(record.fromNodeIds) ? record.fromNodeIds : []),
    ...(Array.isArray(record.toNodeIds) ? record.toNodeIds : []),
  ]).filter((id) => id.startsWith('node:'));
}

function referencedEdgeIds(record) {
  return uniqueText([
    record.edgeId,
    ...(Array.isArray(record.edgeIds) ? record.edgeIds : []),
    ...(Array.isArray(record.participatingEdgeIds)
      ? record.participatingEdgeIds
      : []),
  ]).filter((id) => id.startsWith('edge:'));
}

function assertCanonicalCollections(value) {
  if (!isPlainRecord(value)) fail('canonical topology must be an object.');
  const result = {};
  COLLECTIONS.forEach((collection) => {
    const rows = value[collection] ?? [];
    if (!Array.isArray(rows)) fail(`canonical.${collection} must be an array.`);
    const ids = new Set();
    result[collection] = rows.map((row, index) => {
      if (!isPlainRecord(row)) {
        fail(`canonical.${collection}[${index}] must be an object.`);
      }
      const id = requiredText(row.id, `canonical.${collection}[${index}].id`);
      if (ids.has(id)) fail(`canonical.${collection} contains duplicate ID ${id}.`, RangeError);
      ids.add(id);
      return row;
    });
  });
  return result;
}

function byPrefix(values, prefix) {
  return new Set([...values].filter((id) => id.startsWith(prefix)));
}
function add(set, value) {
  const id = stringValue(value);
  if (id) set.add(id);
}
function uniqueText(values) {
  return [...new Set(values.map((value) => stringValue(value)).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right));
}
function requiredText(value, label) {
  const text = stringValue(value);
  if (!text) fail(`${label} is required.`);
  return text;
}
function fail(message, Constructor = TypeError) {
  throw new Constructor(`TopologyEditValidationScope: ${message}`);
}
