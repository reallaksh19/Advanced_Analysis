/** Exact, read-only canonical selection inspection and engineering measurement. */
import {
  deepFreeze,
  semanticHash,
} from '../../core/shared-piping-model/index.js';
import { supportRestraintRows } from './support-restraint-family.js';

export const TOPOLOGY_EDIT_INSPECTION_SCHEMA = 'TopologyEditInspectionModel.v1';
export const TOPOLOGY_EDIT_MEASUREMENT_SCHEMA = 'TopologyEditMeasurement.v1';

export function buildTopologyEditInspectionModel({
  canonicalTopology,
  selection,
} = {}) {
  assertTopology(canonicalTopology);
  const normalized = normalizeSelection(selection);
  if (!normalized.canonicalIds.length) {
    return sealInspection({
      status: 'EMPTY',
      canonicalTopologyHash: topologyHash(canonicalTopology),
      selection: normalized,
      staleIds: [],
      canonicalIds: [],
      nodes: [],
      edge: null,
      entities: [],
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
  const canonicalIndex = buildCanonicalIndex(canonicalTopology);
  const staleIds = selectedIds(normalized).filter((id) => !canonicalIndex.has(id));
  if (staleIds.length) {
    return sealInspection({
      status: 'STALE_SELECTION',
      canonicalTopologyHash: topologyHash(canonicalTopology),
      selection: normalized,
      staleIds,
      canonicalIds: [],
      nodes: [],
      edge: null,
      entities: [],
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
  const entityRows = normalized.canonicalIds
    .filter((id) => !id.startsWith('node:') && !id.startsWith('edge:'))
    .map((id) => entityInspection(canonicalIndex.get(id)));
  if (edgeRow?.status === 'STALE_ENDPOINT') {
    return sealInspection({
      status: 'STALE_SELECTION',
      canonicalTopologyHash: topologyHash(canonicalTopology),
      selection: normalized,
      staleIds: edgeRow.missingNodeIds,
      canonicalIds: [],
      nodes: [],
      edge: null,
      entities: [],
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
    entities: entityRows,
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
    componentType: token(edge.componentType ?? edge.entityType ?? edge.type ?? edge.kind),
    boreMm: finite(edge.boreMm ?? edge.nominalBoreMm ?? edge.nominalSizeMm ?? edge.bore),
    outsideDiameterMm: finite(
      edge.outsideDiameterMm ?? edge.diameterMm ?? edge.outsideDiameter,
    ),
    measurement,
  });
}

function entityInspection(entry) {
  const record = entry.record;
  const support = entry.support ?? null;
  const restraints = entry.kind === 'SUPPORT' ? supportRestraintRows(record) : [];
  return deepFreeze({
    canonicalId: entry.id,
    canonicalKind: entry.kind,
    entityType: token(
      record.entityType ?? record.componentType ?? record.supportType
      ?? record.type ?? record.kind ?? entry.kind,
    ).toUpperCase(),
    componentKey: token(record.componentKey ?? record.entityId),
    nodeId: token(record.nodeId),
    hostEdgeId: token(record.hostEdgeId ?? record.edgeId ?? record.hostId),
    supportId: token(support?.id ?? record.supportId),
    direction: token(record.direction ?? record.axis ?? record.directionToken),
    gapMm: finite(record.gapMm ?? record.gap),
    travelMm: finite(record.travelMm ?? record.travel),
    stiffness: finite(record.stiffness ?? record.stiffnessNPerMm),
    restraintCount: entry.kind === 'SUPPORT' ? restraints.length : null,
    restraintFamilies: [...new Set(restraints.map((row) => token(
      row.family ?? row.supportType ?? row.type ?? row.kind,
    ).toUpperCase()).filter(Boolean))].sort(),
    sourcePaths: sourcePaths(record),
  });
}

function buildCanonicalIndex(topology) {
  const index = new Map();
  for (const node of topology.nodes) index.set(node.id, { id: node.id, kind: 'NODE', record: node });
  for (const edge of topology.edges) index.set(edge.id, { id: edge.id, kind: 'EDGE', record: edge });
  for (const [collection, kind] of [
    ['junctions', 'JUNCTION'], ['supports', 'SUPPORT'], ['boundaries', 'BOUNDARY'],
    ['rigids', 'RIGID'], ['bends', 'BEND'],
  ]) {
    for (const record of topology[collection] ?? []) {
      index.set(record.id, { id: record.id, kind, record });
      if (kind !== 'SUPPORT') continue;
      for (const restraint of supportRestraintRows(record)) {
        const restraintId = token(restraint.id ?? restraint.restraintId);
        if (restraintId) {
          index.set(restraintId, {
            id: restraintId,
            kind: 'RESTRAINT',
            record: restraint,
            support: record,
          });
        }
      }
    }
  }
  return index;
}

function sourcePaths(record) {
  const values = [
    ...(Array.isArray(record.sourcePaths) ? record.sourcePaths : []),
    record.sourcePath,
  ].map(token).filter(Boolean);
  return [...new Set(values)].sort();
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
  if (Array.isArray(selection?.canonicalIds)) {
    const canonicalIds = [...new Set(selection.canonicalIds.map(token).filter(Boolean))];
    const nodeIds = canonicalIds.filter((id) => id.startsWith('node:')).slice(0, 2);
    const edgeIds = canonicalIds.filter((id) => id.startsWith('edge:'));
    const edgeId = canonicalIds.length === 1 && edgeIds.length === 1 ? edgeIds[0] : null;
    return deepFreeze({ canonicalIds, nodeIds, edgeId });
  }
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
  const canonicalIds = edgeId ? [edgeId] : [...nodeIds];
  return deepFreeze({ canonicalIds, nodeIds, edgeId: edgeId || null });
}

function selectedIds(selection) {
  return [...selection.canonicalIds];
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
