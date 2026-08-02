/** Pure exact-identity graph construction and route proof helpers. */
const EPSILON = 1e-9;

export function buildTopologyEditRouteGraph(canonicalTopology) {
  const nodes = new Map();
  for (const node of [...canonicalTopology.nodes].sort(compareId)) {
    if (token(node?.id) && finitePoint(node?.position)) nodes.set(node.id, node);
  }
  const edges = new Map();
  const edgeLengths = new Map();
  const invalidEdgeIds = [];
  const adjacency = new Map([...nodes.keys()].map((id) => [id, []]));
  for (const edge of [...canonicalTopology.edges].sort(compareId)) {
    const edgeId = token(edge?.id);
    const from = nodes.get(edge?.fromNodeId);
    const to = nodes.get(edge?.toNodeId);
    const length = from && to ? distance(from.position, to.position) : NaN;
    if (!edgeId || !from || !to || !Number.isFinite(length) || length <= EPSILON) {
      invalidEdgeIds.push(edgeId || '<missing-edge-id>');
      continue;
    }
    edges.set(edgeId, edge);
    edgeLengths.set(edgeId, length);
    adjacency.get(edge.fromNodeId).push({ nodeId: edge.toNodeId, edgeId, length });
    adjacency.get(edge.toNodeId).push({ nodeId: edge.fromNodeId, edgeId, length });
  }
  for (const links of adjacency.values()) {
    links.sort((left, right) => left.nodeId.localeCompare(right.nodeId)
      || left.edgeId.localeCompare(right.edgeId));
  }
  return {
    nodes,
    edges,
    edgeLengths,
    adjacency,
    invalidEdgeIds: invalidEdgeIds.sort(),
  };
}

export function proveUniqueMinimumRoute(graph, startNodeId, endNodeId) {
  const distances = shortestDistances(graph, startNodeId);
  const totalLengthMm = distances.get(endNodeId);
  if (!Number.isFinite(totalLengthMm)) {
    return { status: 'DISCONNECTED', totalLengthMm: null, nodeIds: [], edgeIds: [] };
  }
  const proof = shortestPathProof(graph, distances, startNodeId);
  if ((proof.pathCounts.get(endNodeId) ?? 0) > 1) {
    return { status: 'AMBIGUOUS_PATH', totalLengthMm, nodeIds: [], edgeIds: [] };
  }
  const route = reconstructPath(proof.parents, startNodeId, endNodeId);
  if (!route) {
    return { status: 'INVALID_GRAPH', totalLengthMm, nodeIds: [], edgeIds: [] };
  }
  return { status: 'READY', totalLengthMm, ...route };
}

export function connectedComponentForEdge(graph, edgeId) {
  const selected = graph.edges.get(edgeId);
  if (!selected) return null;
  const nodeIds = new Set([selected.fromNodeId, selected.toNodeId]);
  const edgeIds = new Set();
  const queue = [...nodeIds].sort();
  while (queue.length) {
    const nodeId = queue.shift();
    for (const link of graph.adjacency.get(nodeId) ?? []) {
      edgeIds.add(link.edgeId);
      if (!nodeIds.has(link.nodeId)) {
        nodeIds.add(link.nodeId);
        queue.push(link.nodeId);
        queue.sort();
      }
    }
  }
  return { nodeIds: [...nodeIds].sort(), edgeIds: [...edgeIds].sort() };
}

function shortestDistances(graph, startNodeId) {
  const distances = new Map([...graph.nodes.keys()].map((id) => [id, Infinity]));
  const unvisited = new Set(graph.nodes.keys());
  distances.set(startNodeId, 0);
  while (unvisited.size) {
    const current = [...unvisited].sort((left, right) => {
      const delta = distances.get(left) - distances.get(right);
      return Math.abs(delta) > EPSILON ? delta : left.localeCompare(right);
    })[0];
    if (!Number.isFinite(distances.get(current))) break;
    unvisited.delete(current);
    for (const link of graph.adjacency.get(current) ?? []) {
      if (!unvisited.has(link.nodeId)) continue;
      const candidate = distances.get(current) + link.length;
      if (candidate + tolerance(candidate) < distances.get(link.nodeId)) {
        distances.set(link.nodeId, candidate);
      }
    }
  }
  return distances;
}

function shortestPathProof(graph, distances, startNodeId) {
  const pathCounts = new Map([...graph.nodes.keys()].map((id) => [id, 0]));
  const parents = new Map();
  pathCounts.set(startNodeId, 1);
  const ordered = [...graph.nodes.keys()]
    .filter((id) => Number.isFinite(distances.get(id)))
    .sort((left, right) => distances.get(left) - distances.get(right)
      || left.localeCompare(right));
  for (const nodeId of ordered) {
    const count = pathCounts.get(nodeId);
    if (!count) continue;
    for (const link of graph.adjacency.get(nodeId) ?? []) {
      const expected = distances.get(nodeId) + link.length;
      if (!approximatelyEqual(expected, distances.get(link.nodeId))) continue;
      const priorCount = pathCounts.get(link.nodeId);
      pathCounts.set(link.nodeId, Math.min(2, priorCount + count));
      if (priorCount === 0 && count === 1) {
        parents.set(link.nodeId, { nodeId, edgeId: link.edgeId });
      } else {
        parents.delete(link.nodeId);
      }
    }
  }
  return { pathCounts, parents };
}

function reconstructPath(parents, startNodeId, endNodeId) {
  const nodeIds = [endNodeId];
  const edgeIds = [];
  const seen = new Set(nodeIds);
  let current = endNodeId;
  while (current !== startNodeId) {
    const parent = parents.get(current);
    if (!parent || seen.has(parent.nodeId)) return null;
    edgeIds.unshift(parent.edgeId);
    nodeIds.unshift(parent.nodeId);
    seen.add(parent.nodeId);
    current = parent.nodeId;
  }
  return { nodeIds, edgeIds };
}

function token(value) {
  const result = String(value ?? '').trim();
  return result || null;
}
function compareId(left, right) {
  return token(left?.id)?.localeCompare(token(right?.id)) ?? 0;
}
function finitePoint(point) {
  return point && [point.x, point.y, point.z]
    .every((value) => Number.isFinite(Number(value)));
}
function distance(left, right) {
  return Math.hypot(left.x - right.x, left.y - right.y, left.z - right.z);
}
function tolerance(value) {
  return EPSILON * Math.max(1, Math.abs(value));
}
function approximatelyEqual(left, right) {
  return Math.abs(left - right)
    <= tolerance(Math.max(Math.abs(left), Math.abs(right)));
}
