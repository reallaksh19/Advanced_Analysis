import { deepFreeze, semanticHash } from '../../core/shared-piping-model/index.js';

export const TOPOLOGY_EDIT_PROVENANCE_SCHEMA = 'TopologyEditProvenanceModel.v1';

export function buildTopologyEditProvenanceModel({
  canonicalTopology,
  selection,
  diagnostics = [],
} = {}) {
  assertTopology(canonicalTopology);
  const canonicalIds = selectedCanonicalIds(selection);
  const maps = topologyMaps(canonicalTopology);
  const entries = canonicalIds.map((canonicalId) => provenanceEntry(canonicalId, maps, diagnostics));
  const staleIds = entries.filter((entry) => entry.status === 'STALE_ID').map((entry) => entry.canonicalId);
  const payload = deepFreeze({
    schema: TOPOLOGY_EDIT_PROVENANCE_SCHEMA,
    status: staleIds.length ? 'STALE_SELECTION' : (entries.length ? 'READY' : 'EMPTY'),
    canonicalTopologyHash: topologyHash(canonicalTopology),
    canonicalIds,
    staleIds,
    entries,
    authority: 'EVIDENCE_ONLY',
    missingEvidencePolicy: 'EXPLICIT_STATUS_NO_FALLBACK',
  });
  return deepFreeze({ ...payload, provenanceHash: semanticHash(payload) });
}

export function assertTopologyEditProvenanceModel(value) {
  if (value?.schema !== TOPOLOGY_EDIT_PROVENANCE_SCHEMA) {
    throw new TypeError(`Provenance model must use ${TOPOLOGY_EDIT_PROVENANCE_SCHEMA}.`);
  }
  const payload = { ...value };
  delete payload.provenanceHash;
  if (value.provenanceHash !== semanticHash(payload)) {
    throw new Error('TopologyEditProvenanceModel: provenance hash mismatch.');
  }
  return value;
}

function provenanceEntry(canonicalId, maps, diagnostics) {
  if (maps.nodes.has(canonicalId)) return nodeEntry(maps.nodes.get(canonicalId), maps, diagnostics);
  if (maps.edges.has(canonicalId)) return edgeEntry(maps.edges.get(canonicalId), maps, diagnostics);
  return deepFreeze({ canonicalId, objectKind: 'unknown', status: 'STALE_ID', evidence: [] });
}

function nodeEntry(node, maps, diagnostics) {
  const incidentEdges = [...maps.edges.values()]
    .filter((edge) => edge.fromNodeId === node.id || edge.toNodeId === node.id)
    .sort(byId);
  const supports = [...maps.supports.values()].filter((support) => support.nodeId === node.id).sort(byId);
  const junctions = [...maps.junctions.values()].filter((junction) => junction.nodeId === node.id).sort(byId);
  return deepFreeze({
    canonicalId: node.id,
    objectKind: 'node',
    status: 'AVAILABLE',
    position: finitePoint(node.position) ? point(node.position) : unavailable('POSITION_UNAVAILABLE'),
    sourcePaths: strings(node.sourcePaths ?? node.sourcePath),
    workspaceEntityIds: strings(node.workspaceEntityIds ?? node.entityIds ?? node.entityId),
    incidentEdgeIds: incidentEdges.map((edge) => edge.id),
    componentKeys: strings(incidentEdges.map((edge) => edge.componentKey)),
    supportIds: supports.map((support) => support.id),
    junctionIds: junctions.map((junction) => junction.id),
    restraintEvidence: supports.flatMap((support) => restraintRows(support)),
    diagnostics: diagnosticRows(node.id, diagnostics),
  });
}

function edgeEntry(edge, maps, diagnostics) {
  const start = maps.nodes.get(edge.fromNodeId)?.position;
  const end = maps.nodes.get(edge.toNodeId)?.position;
  return deepFreeze({
    canonicalId: edge.id,
    objectKind: 'edge',
    status: 'AVAILABLE',
    endpointIds: [edge.fromNodeId, edge.toNodeId],
    endpoints: finitePoint(start) && finitePoint(end)
      ? deepFreeze({ start: point(start), end: point(end) })
      : unavailable('ENDPOINT_EVIDENCE_UNAVAILABLE'),
    componentKey: evidenceText(edge.componentKey, 'COMPONENT_KEY_UNAVAILABLE'),
    componentType: evidenceText(edge.componentType ?? edge.type ?? edge.kind, 'COMPONENT_TYPE_UNAVAILABLE'),
    branchId: evidenceText(edge.branchId ?? edge.branchKey, 'BRANCH_ID_UNAVAILABLE'),
    lineId: evidenceText(edge.lineId ?? edge.lineKey, 'LINE_ID_UNAVAILABLE'),
    sourcePaths: strings(edge.sourcePaths ?? edge.sourcePath),
    workspaceEntityIds: strings(edge.workspaceEntityIds ?? edge.entityIds ?? edge.entityId ?? edge.componentKey),
    dimensions: deepFreeze({
      boreMm: evidenceNumber(edge.boreMm ?? edge.bore, 'BORE_UNAVAILABLE'),
      outsideDiameterMm: evidenceNumber(edge.outsideDiameterMm ?? edge.diameterMm ?? edge.outsideDiameter, 'OUTSIDE_DIAMETER_UNAVAILABLE'),
    }),
    diagnostics: diagnosticRows(edge.id, diagnostics),
  });
}

function restraintRows(support) {
  const rows = support.restraints ?? support.restraintCapabilities ?? support.capabilities ?? [];
  if (!Array.isArray(rows)) return [];
  return rows.map((restraint, index) => deepFreeze({
    restraintId: String(restraint.id ?? `${support.id}:restraint:${index + 1}`),
    family: String(restraint.family ?? restraint.type ?? 'UNAVAILABLE'),
    direction: restraint.direction ?? restraint.axis ?? null,
    status: restraint.family || restraint.type ? 'AVAILABLE' : 'UNAVAILABLE',
  }));
}

function diagnosticRows(canonicalId, diagnostics) {
  return (diagnostics ?? []).filter((row) => strings(row.canonicalIds ?? row.objectIds ?? row.canonicalId).includes(canonicalId))
    .map((row) => deepFreeze({ code: String(row.code ?? 'UNAVAILABLE'), message: String(row.message ?? ''), status: 'AVAILABLE' }))
    .sort((left, right) => left.code.localeCompare(right.code));
}

function topologyMaps(topology) {
  return {
    nodes: new Map(topology.nodes.map((row) => [row.id, row])),
    edges: new Map(topology.edges.map((row) => [row.id, row])),
    supports: new Map((topology.supports ?? []).map((row) => [row.id, row])),
    junctions: new Map((topology.junctions ?? []).map((row) => [row.id, row])),
  };
}

function selectedCanonicalIds(selection = {}) {
  const nodeIds = Array.isArray(selection.nodeIds) ? selection.nodeIds : [];
  const values = selection.edgeId ? [selection.edgeId] : nodeIds;
  return deepFreeze([...new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean))]);
}

function evidenceText(value, unavailableCode) {
  const text = String(value ?? '').trim();
  return text ? deepFreeze({ status: 'AVAILABLE', value: text }) : unavailable(unavailableCode);
}
function evidenceNumber(value, unavailableCode) {
  const number = Number(value);
  return Number.isFinite(number) ? deepFreeze({ status: 'AVAILABLE', value: number }) : unavailable(unavailableCode);
}
function unavailable(code) { return deepFreeze({ status: 'UNAVAILABLE', code }); }
function strings(value) {
  const values = Array.isArray(value) ? value : (value == null ? [] : [value]);
  return deepFreeze([...new Set(values.map((item) => String(item ?? '').trim()).filter(Boolean))].sort());
}
function finitePoint(value) { return value && [value.x, value.y, value.z].every((item) => Number.isFinite(Number(item))); }
function point(value) { return deepFreeze({ x: Number(value.x), y: Number(value.y), z: Number(value.z) }); }
function topologyHash(topology) { return String(topology.canonicalTopologyHash ?? topology.topologyHash ?? semanticHash({ nodes: [...topology.nodes].sort(byId), edges: [...topology.edges].sort(byId) })); }
function byId(left, right) { return String(left.id).localeCompare(String(right.id)); }
function assertTopology(topology) {
  if (!Array.isArray(topology?.nodes) || !Array.isArray(topology?.edges)) throw new TypeError('Canonical topology nodes and edges are required.');
}
