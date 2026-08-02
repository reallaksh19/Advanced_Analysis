import { deepFreeze, semanticHash } from '../../core/shared-piping-model/index.js';

export const TOPOLOGY_EDIT_COMPARISON_SCHEMA = 'TopologyEditSourceDraftComparison.v1';

export function buildTopologyEditComparisonModel({ sourceTopology, draftTopology } = {}) {
  assertTopology(sourceTopology, 'sourceTopology');
  assertTopology(draftTopology, 'draftTopology');
  const source = topologyMaps(sourceTopology);
  const draft = topologyMaps(draftTopology);
  const diagnostics = [];
  const entries = [
    ...compareKind('node', source.nodes, draft.nodes, (left, right) => nodeDetails(left, right)),
    ...compareKind('edge', source.edges, draft.edges, (left, right) => edgeDetails(left, right, source.nodes, draft.nodes, diagnostics)),
    ...compareKind('support', source.supports, draft.supports, genericDetails),
    ...compareKind('junction', source.junctions, draft.junctions, genericDetails),
  ].sort(compareEntries);
  const payload = deepFreeze({
    schema: TOPOLOGY_EDIT_COMPARISON_SCHEMA,
    status: entries.length ? 'CHANGED' : 'UNCHANGED',
    sourceCanonicalHash: topologyHash(sourceTopology),
    draftCanonicalHash: topologyHash(draftTopology),
    entries,
    changedCanonicalIds: deepFreeze(entries.map((entry) => entry.canonicalId).sort()),
    summary: comparisonSummary(entries),
    diagnostics: deepFreeze(diagnostics.sort((left, right) => left.code.localeCompare(right.code) || left.canonicalId.localeCompare(right.canonicalId))),
    authority: 'DISPLAY_ONLY_COMPARISON',
    identityAuthority: 'EXACT_CANONICAL_ID',
    measurementDisclosure: 'VISUAL REVIEW DELTA — NOT ENGINEERING AUTHORITY',
    proximityRetargetingAllowed: false,
  });
  return deepFreeze({ ...payload, comparisonHash: semanticHash(payload) });
}

export function assertTopologyEditComparisonModel(value) {
  if (value?.schema !== TOPOLOGY_EDIT_COMPARISON_SCHEMA) {
    throw new TypeError(`Comparison model must use ${TOPOLOGY_EDIT_COMPARISON_SCHEMA}.`);
  }
  const payload = { ...value };
  delete payload.comparisonHash;
  if (value.comparisonHash !== semanticHash(payload)) {
    throw new Error('TopologyEditSourceDraftComparison: comparison hash mismatch.');
  }
  return value;
}

function compareKind(objectKind, sourceMap, draftMap, detailsBuilder) {
  const ids = [...new Set([...sourceMap.keys(), ...draftMap.keys()])].sort();
  return ids.flatMap((canonicalId) => {
    const source = sourceMap.get(canonicalId) ?? null;
    const draft = draftMap.get(canonicalId) ?? null;
    const changeType = !source ? 'ADDED' : (!draft ? 'REMOVED' : (semanticHash(source) === semanticHash(draft) ? 'UNCHANGED' : 'MODIFIED'));
    if (changeType === 'UNCHANGED') return [];
    return [deepFreeze({
      canonicalId,
      objectKind,
      changeType,
      sourceHash: source ? semanticHash(source) : null,
      draftHash: draft ? semanticHash(draft) : null,
      details: detailsBuilder(source, draft),
    })];
  });
}

function nodeDetails(source, draft) {
  const sourcePoint = finitePoint(source?.position) ? point(source.position) : null;
  const draftPoint = finitePoint(draft?.position) ? point(draft.position) : null;
  const movement = sourcePoint && draftPoint ? delta(sourcePoint, draftPoint) : null;
  return deepFreeze({ sourcePosition: sourcePoint, draftPosition: draftPoint, movement });
}

function edgeDetails(source, draft, sourceNodes, draftNodes, diagnostics) {
  const sourceSegment = segment(source, sourceNodes);
  const draftSegment = segment(draft, draftNodes);
  if (source && !sourceSegment) diagnostics.push(diag('SOURCE_ENDPOINT_UNAVAILABLE', source.id));
  if (draft && !draftSegment) diagnostics.push(diag('DRAFT_ENDPOINT_UNAVAILABLE', draft.id));
  return deepFreeze({
    sourceEndpointIds: source ? [source.fromNodeId, source.toNodeId] : null,
    draftEndpointIds: draft ? [draft.fromNodeId, draft.toNodeId] : null,
    sourceSegment,
    draftSegment,
    componentKey: String(draft?.componentKey ?? source?.componentKey ?? '').trim() || null,
    sourceDimensions: dimensions(source),
    draftDimensions: dimensions(draft),
  });
}

function genericDetails(source, draft) {
  return deepFreeze({
    sourceRecord: source ? deepFreeze(structuredClone(source)) : null,
    draftRecord: draft ? deepFreeze(structuredClone(draft)) : null,
  });
}

function comparisonSummary(entries) {
  const summary = { totalChanged: entries.length, added: 0, removed: 0, modified: 0, nodes: 0, edges: 0, supports: 0, junctions: 0 };
  for (const entry of entries) {
    summary[entry.changeType.toLowerCase()] += 1;
    summary[`${entry.objectKind}s`] += 1;
  }
  return deepFreeze(summary);
}

function topologyMaps(topology) {
  return {
    nodes: map(topology.nodes),
    edges: map(topology.edges),
    supports: map(topology.supports ?? []),
    junctions: map(topology.junctions ?? []),
  };
}
function map(rows) { return new Map(rows.map((row) => [requiredId(row?.id), row])); }
function segment(edge, nodes) {
  if (!edge) return null;
  const start = nodes.get(edge.fromNodeId)?.position;
  const end = nodes.get(edge.toNodeId)?.position;
  return finitePoint(start) && finitePoint(end) ? deepFreeze({ start: point(start), end: point(end) }) : null;
}
function dimensions(edge) {
  if (!edge) return null;
  return deepFreeze({
    boreMm: finiteOrNull(edge.boreMm ?? edge.bore),
    outsideDiameterMm: finiteOrNull(edge.outsideDiameterMm ?? edge.diameterMm ?? edge.outsideDiameter),
  });
}
function delta(source, draft) {
  const vector = deepFreeze({ x: draft.x - source.x, y: draft.y - source.y, z: draft.z - source.z });
  return deepFreeze({ delta: vector, distanceMm: Math.hypot(vector.x, vector.y, vector.z) });
}
function diag(code, canonicalId) { return deepFreeze({ code, canonicalId, status: 'UNAVAILABLE' }); }
function compareEntries(left, right) { return left.objectKind.localeCompare(right.objectKind) || left.canonicalId.localeCompare(right.canonicalId); }
function topologyHash(topology) { return String(topology.canonicalTopologyHash ?? topology.topologyHash ?? semanticHash({ nodes: [...topology.nodes].sort(byId), edges: [...topology.edges].sort(byId) })); }
function byId(left, right) { return String(left.id).localeCompare(String(right.id)); }
function finitePoint(value) { return value && [value.x, value.y, value.z].every((item) => Number.isFinite(Number(item))); }
function point(value) { return deepFreeze({ x: Number(value.x), y: Number(value.y), z: Number(value.z) }); }
function finiteOrNull(value) { const number = Number(value); return Number.isFinite(number) ? number : null; }
function requiredId(value) { const id = String(value ?? '').trim(); if (!id) throw new TypeError('Canonical records require IDs.'); return id; }
function assertTopology(topology, name) { if (!Array.isArray(topology?.nodes) || !Array.isArray(topology?.edges)) throw new TypeError(`${name} requires canonical nodes and edges.`); }
