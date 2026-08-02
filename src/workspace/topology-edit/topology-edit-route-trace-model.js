/** Deterministic read-only route and connected-component evidence. */
import { deepFreeze, semanticHash } from '../../core/shared-piping-model/index.js';
import {
  buildTopologyEditRouteGraph,
  connectedComponentForEdge,
  proveUniqueMinimumRoute,
} from './topology-edit-route-graph.js';

export const TOPOLOGY_EDIT_ROUTE_TRACE_SCHEMA = 'TopologyEditRouteTraceModel.v1';

export function buildTopologyEditRouteTrace({ canonicalTopology, selection } = {}) {
  if (!Array.isArray(canonicalTopology?.nodes) || !Array.isArray(canonicalTopology?.edges)) {
    throw new TypeError('Canonical topology nodes and edges are required.');
  }
  const graph = buildTopologyEditRouteGraph(canonicalTopology);
  if (graph.invalidEdgeIds.length) {
    return freezeModel({
      canonicalTopology,
      selection,
      status: 'INVALID_GRAPH',
      mode: null,
      invalidEdgeIds: graph.invalidEdgeIds,
      message: `Canonical graph contains ${graph.invalidEdgeIds.length} invalid or zero-length edge(s).`,
    });
  }
  const nodeIds = normalizedIds(selection?.nodeIds);
  const edgeId = token(selection?.edgeId);
  if (nodeIds.length === 2) {
    return pointToPointTrace(canonicalTopology, graph, nodeIds, selection);
  }
  if (edgeId) {
    return componentTrace(canonicalTopology, graph, edgeId, selection);
  }
  return freezeModel({
    canonicalTopology,
    selection,
    status: nodeIds.length ? 'INSUFFICIENT_SELECTION' : 'EMPTY_SELECTION',
    mode: null,
    message: nodeIds.length
      ? 'Select exactly two canonical nodes, or select one canonical edge.'
      : 'Select two canonical nodes for a route, or one edge for a connected component.',
  });
}

function pointToPointTrace(canonicalTopology, graph, nodeIds, selection) {
  const [startNodeId, endNodeId] = nodeIds;
  if (!graph.nodes.has(startNodeId) || !graph.nodes.has(endNodeId)) {
    return freezeModel({
      canonicalTopology,
      selection,
      status: 'STALE_SELECTION',
      mode: 'POINT_TO_POINT',
      requestedNodeIds: nodeIds,
      message: 'One or more selected canonical nodes no longer exist.',
    });
  }
  const proof = proveUniqueMinimumRoute(graph, startNodeId, endNodeId);
  if (proof.status !== 'READY') {
    return freezeModel({
      canonicalTopology,
      selection,
      status: proof.status,
      mode: 'POINT_TO_POINT',
      requestedNodeIds: nodeIds,
      totalLengthMm: proof.totalLengthMm,
      message: routeFailureMessage(proof.status, startNodeId, endNodeId),
    });
  }
  return readyModel({
    canonicalTopology,
    selection,
    graph,
    mode: 'POINT_TO_POINT',
    orderedNodeIds: proof.nodeIds,
    orderedEdgeIds: proof.edgeIds,
    selectedEdgeId: null,
  });
}

function componentTrace(canonicalTopology, graph, edgeId, selection) {
  const component = connectedComponentForEdge(graph, edgeId);
  if (!component) {
    return freezeModel({
      canonicalTopology,
      selection,
      status: 'STALE_SELECTION',
      mode: 'CONNECTED_COMPONENT',
      selectedEdgeId: edgeId,
      message: `Selected canonical edge ${edgeId} no longer exists.`,
    });
  }
  return readyModel({
    canonicalTopology,
    selection,
    graph,
    mode: 'CONNECTED_COMPONENT',
    orderedNodeIds: component.nodeIds,
    orderedEdgeIds: component.edgeIds,
    selectedEdgeId: edgeId,
  });
}

function readyModel({
  canonicalTopology,
  selection,
  graph,
  mode,
  orderedNodeIds,
  orderedEdgeIds,
  selectedEdgeId,
}) {
  const edgeEvidence = orderedEdgeIds.map((edgeId) => {
    const edge = graph.edges.get(edgeId);
    return {
      edgeId,
      fromNodeId: edge.fromNodeId,
      toNodeId: edge.toNodeId,
      componentKey: token(edge.componentKey),
      entityType: token(edge.entityType),
      lengthMm: graph.edgeLengths.get(edgeId),
    };
  });
  const openEndpointIds = orderedNodeIds.filter((nodeId) =>
    (graph.adjacency.get(nodeId)?.length ?? 0) === 1);
  const branchNodeIds = orderedNodeIds.filter((nodeId) =>
    (graph.adjacency.get(nodeId)?.length ?? 0) >= 3);
  const segments = edgeEvidence.map((edge) => ({
    edgeId: edge.edgeId,
    start: clonePoint(graph.nodes.get(edge.fromNodeId).position),
    end: clonePoint(graph.nodes.get(edge.toNodeId).position),
  }));
  const componentKeys = [...new Set(edgeEvidence
    .map((edge) => edge.componentKey).filter(Boolean))].sort();
  return freezeModel({
    canonicalTopology,
    selection,
    status: 'READY',
    mode,
    selectedEdgeId,
    orderedNodeIds,
    orderedEdgeIds,
    canonicalIds: [...new Set([...orderedNodeIds, ...orderedEdgeIds])],
    componentKeys,
    edgeEvidence,
    totalLengthMm: sum(edgeEvidence.map((edge) => edge.lengthMm)),
    openEndpointIds,
    branchNodeIds,
    segments,
    traceNodeCount: orderedNodeIds.length,
    traceEdgeCount: orderedEdgeIds.length,
    message: mode === 'POINT_TO_POINT'
      ? `Unique minimum-length route contains ${orderedEdgeIds.length} edge(s).`
      : `Connected component contains ${orderedEdgeIds.length} edge(s).`,
  });
}

function routeFailureMessage(status, startNodeId, endNodeId) {
  if (status === 'DISCONNECTED') {
    return `No canonical route connects ${startNodeId} to ${endNodeId}.`;
  }
  if (status === 'AMBIGUOUS_PATH') {
    return 'Multiple equal minimum-length canonical routes exist; no arbitrary route was selected.';
  }
  return 'The minimum-length route could not be reconstructed from canonical graph evidence.';
}

function freezeModel(material) {
  const base = {
    schema: TOPOLOGY_EDIT_ROUTE_TRACE_SCHEMA,
    canonicalTopologyHash: token(material.canonicalTopology?.canonicalTopologyHash),
    selection: {
      nodeIds: normalizedIds(material.selection?.nodeIds),
      edgeId: token(material.selection?.edgeId),
    },
    status: material.status,
    mode: material.mode,
    selectedEdgeId: material.selectedEdgeId ?? null,
    requestedNodeIds: material.requestedNodeIds ?? [],
    invalidEdgeIds: material.invalidEdgeIds ?? [],
    orderedNodeIds: material.orderedNodeIds ?? [],
    orderedEdgeIds: material.orderedEdgeIds ?? [],
    canonicalIds: material.canonicalIds ?? [],
    componentKeys: material.componentKeys ?? [],
    edgeEvidence: material.edgeEvidence ?? [],
    totalLengthMm: Number.isFinite(material.totalLengthMm)
      ? material.totalLengthMm
      : null,
    openEndpointIds: material.openEndpointIds ?? [],
    branchNodeIds: material.branchNodeIds ?? [],
    segments: material.segments ?? [],
    traceNodeCount: material.traceNodeCount ?? 0,
    traceEdgeCount: material.traceEdgeCount ?? 0,
    message: material.message ?? '',
  };
  return deepFreeze({ ...base, routeTraceHash: semanticHash(base) });
}

function normalizedIds(values) {
  return Array.isArray(values)
    ? [...new Set(values.map(token).filter(Boolean))].slice(0, 2)
    : [];
}
function token(value) {
  const result = String(value ?? '').trim();
  return result || null;
}
function clonePoint(point) {
  return { x: Number(point.x), y: Number(point.y), z: Number(point.z) };
}
function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}
