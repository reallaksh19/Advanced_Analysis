import { deepFreeze, semanticHash } from '../../core/shared-piping-model/index.js';

export const TOPOLOGY_EDIT_SEARCH_INDEX_SCHEMA = 'TopologyEditCanonicalSearchIndex.v1';
export const TOPOLOGY_EDIT_SEARCH_RESULT_SCHEMA = 'TopologyEditCanonicalSearchResult.v1';

const COLLECTIONS = Object.freeze([
  ['nodes', 'node'],
  ['edges', 'edge'],
  ['junctions', 'junction'],
  ['supports', 'support'],
  ['boundaries', 'boundary'],
  ['rigids', 'rigid'],
  ['bends', 'bend'],
]);

const EXPLICIT_TEXT_FIELDS = Object.freeze([
  'id', 'componentKey', 'entityId', 'entityType', 'type', 'kind', 'family',
  'nodeId', 'fromNodeId', 'toNodeId', 'lineId', 'branchId',
  'inputXmlElementId', 'inputXmlNodeId', 'resolutionStatus', 'status',
]);

const EXPLICIT_ARRAY_FIELDS = Object.freeze([
  'sourceEntityIds', 'sourcePaths', 'branchIds', 'lineIds', 'nodeIds', 'edgeIds',
  'participatingEdgeIds', 'inputXmlElementIds', 'inputXmlNodeIds', 'portKeys',
]);

export function buildTopologyEditSearchIndex({
  canonicalTopology,
  diagnostics = [],
} = {}) {
  assertCanonical(canonicalTopology);
  const nodeWorkspaceIds = deriveNodeWorkspaceIds(canonicalTopology);
  const diagnosticMap = mapDiagnostics(diagnostics);
  const documents = COLLECTIONS.flatMap(([collection, objectKind]) => (
    (canonicalTopology[collection] ?? []).map((record) => createDocument({
      record,
      objectKind,
      nodeWorkspaceIds,
      diagnostics: diagnosticMap.get(record.id) ?? [],
    }))
  )).sort(compareDocuments);
  const material = {
    schema: TOPOLOGY_EDIT_SEARCH_INDEX_SCHEMA,
    canonicalTopologyHash: requiredText(
      canonicalTopology.canonicalTopologyHash,
      'canonicalTopologyHash',
    ),
    documentCount: documents.length,
    documents,
  };
  return deepFreeze({ ...material, searchIndexHash: semanticHash(material) });
}

export function queryTopologyEditSearch(indexInput, queryInput, options = {}) {
  const index = assertTopologyEditSearchIndex(indexInput);
  const query = normalizeQuery(queryInput);
  if (!query.tokens.length) return Object.freeze([]);
  const limit = normalizeLimit(options.limit);
  return Object.freeze(index.documents
    .map((document) => scoreDocument(document, query))
    .filter(Boolean)
    .sort(compareMatches)
    .slice(0, limit)
    .map(({ score, exactField, document }) => deepFreeze({
      schema: TOPOLOGY_EDIT_SEARCH_RESULT_SCHEMA,
      searchIndexHash: index.searchIndexHash,
      score,
      exactField,
      canonicalId: document.canonicalId,
      objectKind: document.objectKind,
      label: document.label,
      workspaceEntityIds: document.workspaceEntityIds,
      sourcePaths: document.sourcePaths,
      diagnosticCodes: document.diagnosticCodes,
    })));
}

export function assertTopologyEditSearchIndex(value) {
  if (value?.schema !== TOPOLOGY_EDIT_SEARCH_INDEX_SCHEMA
      || !Array.isArray(value.documents)) {
    throw new TypeError(`Search index must use ${TOPOLOGY_EDIT_SEARCH_INDEX_SCHEMA}.`);
  }
  const material = { ...value };
  delete material.searchIndexHash;
  if (value.searchIndexHash !== semanticHash(material)) {
    throw new Error('TopologyEditSearchIndex: index hash mismatch.');
  }
  return value;
}

function createDocument({ record, objectKind, nodeWorkspaceIds, diagnostics }) {
  const canonicalId = requiredText(record?.id, `${objectKind}.id`);
  const explicit = [
    ...EXPLICIT_TEXT_FIELDS.map((field) => record?.[field]),
    ...EXPLICIT_ARRAY_FIELDS.flatMap((field) => arrayValues(record?.[field])),
    ...supportRestraintValues(record, objectKind),
  ];
  const workspaceEntityIds = workspaceIds(record, objectKind, nodeWorkspaceIds);
  const sourcePaths = sortedText([
    record?.sourcePath,
    ...arrayValues(record?.sourcePaths),
  ]);
  const diagnosticCodes = sortedText(diagnostics.map(diagnosticCode));
  const fields = sortedText([
    canonicalId,
    objectKind,
    ...explicit,
    ...workspaceEntityIds,
    ...sourcePaths,
    ...diagnosticCodes,
  ]);
  const material = {
    canonicalId,
    objectKind,
    label: displayLabel(record, objectKind),
    workspaceEntityIds,
    sourcePaths,
    diagnosticCodes,
    normalizedFields: Object.freeze(fields.map(normalizedText)),
    tokens: Object.freeze(sortedText(fields.flatMap(tokenize))),
  };
  return deepFreeze({ ...material, documentHash: semanticHash(material) });
}

function deriveNodeWorkspaceIds(topology) {
  const result = new Map((topology.nodes ?? []).map((node) => [node.id, new Set()]));
  for (const edge of topology.edges ?? []) {
    const ids = sortedText([edge.componentKey, ...arrayValues(edge.sourceEntityIds)]);
    for (const nodeId of [edge.fromNodeId, edge.toNodeId]) {
      ids.forEach((id) => result.get(nodeId)?.add(id));
    }
  }
  for (const support of topology.supports ?? []) {
    const ids = sortedText([support.entityId, ...arrayValues(support.sourceEntityIds)]);
    ids.forEach((id) => result.get(support.nodeId)?.add(id));
  }
  return new Map([...result].map(([id, values]) => [id, sortedText(values)]));
}

function mapDiagnostics(diagnostics) {
  const result = new Map();
  for (const diagnostic of diagnostics ?? []) {
    for (const id of diagnosticTargetIds(diagnostic)) {
      if (!result.has(id)) result.set(id, []);
      result.get(id).push(diagnostic);
    }
  }
  return result;
}

function diagnosticTargetIds(row) {
  return sortedText([
    row?.canonicalId, row?.objectId, row?.nodeId, row?.edgeId,
    row?.junctionId, row?.supportId, row?.rigidId,
    ...arrayValues(row?.targetIds),
    ...arrayValues(row?.canonicalIds),
  ]);
}

function diagnosticCode(row) {
  return row?.code ?? row?.diagnosticCode ?? row?.kind ?? '';
}

function supportRestraintValues(record, objectKind) {
  if (objectKind !== 'support') return [];
  const source = Array.isArray(record?.restraints)
    ? record.restraints
    : Array.isArray(record?.restraint?.restraints)
      ? record.restraint.restraints
      : Array.isArray(record?.restraint)
        ? record.restraint
        : record?.restraint && typeof record.restraint === 'object'
          ? [record.restraint] : [];
  return source.flatMap((row) => [
    row?.id, row?.restraintId, row?.family, row?.type,
    row?.direction, row?.directionToken, row?.axis,
  ]);
}

function workspaceIds(record, objectKind, nodeWorkspaceIds) {
  if (objectKind === 'node') return nodeWorkspaceIds.get(record.id) ?? Object.freeze([]);
  return sortedText([
    record?.componentKey,
    record?.entityId,
    ...arrayValues(record?.sourceEntityIds),
  ]);
}

function scoreDocument(document, query) {
  const exact = exactMatch(document, query.normalized);
  if (exact) return { score: exact.score, exactField: exact.field, document };
  const prefix = query.tokens.every((queryToken) => (
    document.tokens.some((token) => token.startsWith(queryToken))
  ));
  if (prefix) return { score: 20, exactField: null, document };
  const contains = query.tokens.every((queryToken) => (
    document.normalizedFields.some((field) => field.includes(queryToken))
  ));
  return contains ? { score: 30, exactField: null, document } : null;
}

function exactMatch(document, query) {
  if (normalizedText(document.canonicalId) === query) return { score: 0, field: 'CANONICAL_ID' };
  if (document.workspaceEntityIds.some((id) => normalizedText(id) === query)) {
    return { score: 5, field: 'WORKSPACE_ENTITY_ID' };
  }
  if (document.sourcePaths.some((path) => normalizedText(path) === query)) {
    return { score: 10, field: 'SOURCE_PATH' };
  }
  if (document.diagnosticCodes.some((code) => normalizedText(code) === query)) {
    return { score: 15, field: 'DIAGNOSTIC_CODE' };
  }
  return null;
}

function displayLabel(record, objectKind) {
  const family = record?.entityType ?? record?.type ?? record?.kind ?? record?.family;
  return family ? `${record.id} · ${family}` : `${record.id} · ${objectKind}`;
}

function normalizeQuery(value) {
  const normalized = normalizedText(value);
  return { normalized, tokens: tokenize(normalized) };
}

function tokenize(value) {
  return normalizedText(value).split(/[^a-z0-9_.:$[\]-]+/).filter(Boolean);
}

function normalizedText(value) {
  return String(value ?? '').trim().toLocaleLowerCase('en-US');
}

function arrayValues(value) {
  return Array.isArray(value) ? value : value instanceof Set ? [...value] : [];
}

function sortedText(values) {
  return Object.freeze([...new Set([...values]
    .map((value) => String(value ?? '').trim())
    .filter(Boolean))]
    .sort((left, right) => left.localeCompare(right)));
}

function compareDocuments(left, right) {
  return left.objectKind.localeCompare(right.objectKind)
    || left.canonicalId.localeCompare(right.canonicalId);
}

function compareMatches(left, right) {
  return left.score - right.score || compareDocuments(left.document, right.document);
}

function normalizeLimit(value) {
  const limit = value === undefined ? 50 : Number(value);
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
    throw new RangeError('Search result limit must be an integer from 1 to 200.');
  }
  return limit;
}

function requiredText(value, label) {
  const text = String(value ?? '').trim();
  if (!text) throw new TypeError(`${label} is required.`);
  return text;
}

function assertCanonical(value) {
  if (!value || typeof value !== 'object' || !Array.isArray(value.nodes)
      || !Array.isArray(value.edges)) {
    throw new TypeError('Canonical topology with node and edge arrays is required.');
  }
}
