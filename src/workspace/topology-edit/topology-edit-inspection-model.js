/** Exact, read-only canonical selection inspection and engineering measurement. */
import {
  deepFreeze,
  semanticHash,
} from '../../core/shared-piping-model/index.js';

export const TOPOLOGY_EDIT_INSPECTION_SCHEMA = 'TopologyEditInspectionModel.v1';
export const TOPOLOGY_EDIT_MEASUREMENT_SCHEMA = 'TopologyEditMeasurement.v1';

export function buildTopologyEditInspectionModel({
  canonicalTopology,
  selection,
} = {}) {
  assertTopology(canonicalTopology);
  const normalized = normalizeSelection(selection);
  if (!normalized.nodeIds.length && !normalized.edgeId) {
    return sealInspection({
      status: 'EMPTY',
      canonicalTopologyHash: topologyHash(canonicalTopology),
      selection: normalized,
      staleIds: [],
      canonicalIds: [],
      nodes: [],
      edge: null,
      measurement: null,
      overlay: emptyOverlay(),
    });
  }

  const nodesById = new Map(
    canonicalTopology.nodes.map((node) => [node.id, node]),
  );
  const edgesById = new Map(
    canonicalTopology.edges.map((edge) => [edge.id, edge]),
  );
  const staleIds = selectedIds(normalized).filter((id) => (
    id.startsWith('node:') ? !nodesById.has(id) : !edgesById.has(id)
  ));
  if (staleIds.length) {
    return sealInspection({
      status: 'STALE_SELECTION',
      canonicalTopologyHash: topologyHash(canonicalTopology),
      selection: normalized,
      staleIds,
      canonicalIds: [],
      nodes: [],
      edge: null,
      measurement: null,
      overlay: emptyOverlay(),
    });
  }

  const nodeRows = normalized.nodeIds.map((nodeId) => nodeInspection(
    nodesById.get(nodeId),
    canonicalTopology.edges,
  ));
  const edgeRow = normalized.edgeId
    ? edgeInspection(edgesById.get(normalized.edgeId), nodesById)
    : null;
  if (edgeRow?.status === 'STALE_ENDPOINT') {
    return sealInspection({
      status: 'STALE_SELECTION',
      canonicalTopologyHash: topologyHash(canonicalTopology),
      selection: normalized,
      staleIds: edgeRow.missingNodeIds,
      canonicalIds: [],
      nodes: [],
      edge: null,
      measurement: null,
      overlay: emptyOverlay(),
    });
  }

  const measurement = nodeRows.length === 2
    ? measurementBetween(
      'NODE_DISTANCE',
      nodeRows[0].nodeId,
      nodeRows[1].nodeId,
      nodeRows[0].position,
      nodeRows[1].position,
    )
    : edgeRow?.measurement ?? null;
  const canonicalIds = selectedIds(normalized);
  return sealInspection({
    status: 'READY',
    canonicalTopologyHash: topologyHash(canonicalTopology),
    selection: normalized,
    staleIds: [],
    canonicalIds,
    nodes: nodeRows,
    edge: edgeRow,
    measurement,
    overlay: buildOverlay(nodeRows, edgeRow, measurement),
  });
}

function nodeInspection(node, edges) {
  const incidentEdgeIds = edges
    .filter((edge) => edge.fromNodeId === node.id || edge.toNodeId === node.id)
    .map((edge) => edge.id)
    .sort();
  return deepFreeze({
    nodeId: node.id,
    position: point(node.position),
    incidentEdgeIds,
    degree: incidentEdgeIds.length,
  });
}

function edgeInspection(edge, nodesById) {
  const startNode = nodesById.get(edge.fromNodeId);
  const endNode = nodesById.get(edge.toNodeId);
  const missingNodeIds = [
    !startNode ? edge.fromNodeId : null,
    !endNode ? edge.toNodeId : null,
  ].filter(Boolean).sort();
  if (missingNodeIds.length) {
    return deepFreeze({ status: 'STALE_ENDPOINT', missingNodeIds });
  }
  const measurement = measurementBetween(
    'EDGE_LENGTH',
    edge.fromNodeId,
    edge.toNodeId,
    startNode.position,
    endNode.position,
  );
  return deepFreeze({
    status: 'READY',
    edgeId: edge.id,
    fromNodeId: edge.fromNodeId,
    toNodeId: edge.toNodeId,
    componentKey: token(edge.componentKey),
    componentType: token(edge.componentType ?? edge.type ?? edge.kind),
    boreMm: finite(edge.boreMm ?? edge.bore),
    outsideDiameterMm: finite(
      edge.outsideDiameterMm ?? edge.diameterMm ?? edge.outsideDiameter,
    ),
    measurement,
  });
}

function measurementBetween(kind, fromId, toId, startValue, endValue) {
  const start = point(startValue);
  const end = point(endValue);
  const delta = deepFreeze({
    x: end.x - start.x,
    y: end.y - start.y,
    z: end.z - start.z,
  });
  const distanceMm = Math.hypot(delta.x, delta.y, delta.z);
  const unitDirection = distanceMm > 0
    ? deepFreeze({
      x: delta.x / distanceMm,
      y: delta.y / distanceMm,
      z: delta.z / distanceMm,
    })
    : null;
  return deepFreeze({
    schema: TOPOLOGY_EDIT_MEASUREMENT_SCHEMA,
    kind,
    fromId,
    toId,
    start,
    end,
    delta,
    distanceMm,
    unitDirection,
  });
}

function buildOverlay(nodes, edge, measurement) {
  const points = nodes.map((row, index) => deepFreeze({
    canonicalId: row.nodeId,
    point: row.position,
    order: index + 1,
  }));
  const segments = edge?.status === 'READY'
    ? [deepFreeze({
      canonicalId: edge.edgeId,
      start: edge.measurement.start,
      end: edge.measurement.end,
      role: 'SELECTED_EDGE',
    })]
    : [];
  return deepFreeze({
    points,
    segments,
    measurement: measurement
      ? deepFreeze({
        start: measurement.start,
        end: measurement.end,
        kind: measurement.kind,
      })
      : null,
  });
}

function sealInspection(value) {
  const payload = deepFreeze({
    schema: TOPOLOGY_EDIT_INSPECTION_SCHEMA,
    ...value,
  });
  return deepFreeze({
    ...payload,
    inspectionHash: semanticHash(payload),
  });
}

function emptyOverlay() {
  return deepFreeze({ points: [], segments: [], measurement: null });
}

function normalizeSelection(selection) {
  const nodeIds = Array.isArray(selection?.nodeIds)
    ? selection.nodeIds.map(token).filter(Boolean).slice(0, 2)
    : [];
  const edgeId = token(selection?.edgeId);
  if (nodeIds.length && edgeId) {
    throw new TypeError('Topology edit selection cannot contain nodes and an edge together.');
  }
  if (nodeIds.some((id) => !id.startsWith('node:'))) {
    throw new TypeError('Inspection node selections require canonical node IDs.');
  }
  if (edgeId && !edgeId.startsWith('edge:')) {
    throw new TypeError('Inspection edge selection requires a canonical edge ID.');
  }
  return deepFreeze({ nodeIds, edgeId: edgeId || null });
}

function selectedIds(selection) {
  return selection.edgeId ? [selection.edgeId] : [...selection.nodeIds];
}

function assertTopology(topology) {
  if (!Array.isArray(topology?.nodes) || !Array.isArray(topology?.edges)) {
    throw new TypeError('Canonical topology nodes and edges are required.');
  }
  for (const node of topology.nodes) {
    if (!token(node?.id) || !finitePoint(node?.position)) {
      throw new TypeError('Every canonical node requires an ID and finite position.');
    }
  }
  for (const edge of topology.edges) {
    if (!token(edge?.id) || !token(edge?.fromNodeId) || !token(edge?.toNodeId)) {
      throw new TypeError('Every canonical edge requires exact endpoint IDs.');
    }
  }
}

function topologyHash(topology) {
  return token(topology.canonicalTopologyHash ?? topology.topologyHash)
    || semanticHash({
      nodes: [...topology.nodes].sort(byId),
      edges: [...topology.edges].sort(byId),
    });
}

function point(value) {
  if (!finitePoint(value)) throw new TypeError('A finite canonical point is required.');
  return deepFreeze({
    x: Number(value.x),
    y: Number(value.y),
    z: Number(value.z),
  });
}

function finitePoint(value) {
  return value && [value.x, value.y, value.z]
    .every((item) => Number.isFinite(Number(item)));
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function token(value) {
  return String(value ?? '').trim();
}

function byId(left, right) {
  return String(left.id).localeCompare(String(right.id));
}
