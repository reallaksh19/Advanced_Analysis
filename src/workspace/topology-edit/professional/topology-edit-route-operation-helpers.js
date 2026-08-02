import {
  isPlainRecord,
  stringValue,
} from '../../../core/shared-piping-model/index.js';
import {
  normalizeTopologyEditCanonicalId,
  normalizeTopologyEditCanonicalIds,
} from './topology-edit-canonical-id.js';

const EPSILON_MM = 1e-9;

export function routeContext(topology, basisHash) {
  if (!isPlainRecord(topology)) fail('topology must be an object.');
  const currentBasisHash = requiredText(
    topology.canonicalTopologyHash,
    'topology.canonicalTopologyHash',
  );
  const requestedBasisHash = requiredText(basisHash ?? currentBasisHash, 'basisHash');
  if (requestedBasisHash !== currentBasisHash) {
    fail(`stale basis ${requestedBasisHash}; current topology is ${currentBasisHash}.`, RangeError);
  }
  return {
    topology,
    basisHash: currentBasisHash,
    nodes: indexRows(topology.nodes, 'nodes'),
    edges: indexRows(topology.edges, 'edges'),
  };
}

export function exactNode(context, nodeId) {
  return exactRecord(context.nodes, nodeId, 'node');
}

export function exactEdge(context, edgeId) {
  return exactRecord(context.edges, edgeId, 'edge');
}

export function endpointContext(context, edgeId, endpointInput) {
  const edge = exactEdge(context, edgeId);
  const endpoint = normalizeEndpoint(endpointInput);
  const nodeId = endpoint === 'FROM' ? edge.fromNodeId : edge.toNodeId;
  const otherNodeId = endpoint === 'FROM' ? edge.toNodeId : edge.fromNodeId;
  const node = exactNode(context, nodeId);
  const otherNode = exactNode(context, otherNodeId);
  const vector = subtract(node.position, otherNode.position);
  const lengthMm = magnitude(vector);
  if (!(lengthMm > EPSILON_MM)) fail(`edge ${edge.id} has zero length.`, RangeError);
  return {
    edge,
    endpoint,
    node,
    otherNode,
    lengthMm,
    outwardDirection: scale(vector, 1 / lengthMm),
  };
}

export function assertGraphOpenEndpoint(context, nodeId, edgeId) {
  const incident = incidentEdges(context, nodeId);
  if (incident.length !== 1 || incident[0].id !== edgeId) {
    fail(`endpoint ${nodeId} must be graph-open on exactly edge ${edgeId}.`, RangeError);
  }
  for (const collection of ['junctions', 'supports', 'boundaries', 'rigids', 'bends']) {
    const dependent = (context.topology[collection] ?? []).find((record) => referencesNode(record, nodeId));
    if (dependent) {
      fail(`endpoint ${nodeId} is constrained by ${collection} record ${dependent.id}.`, RangeError);
    }
  }
}

export function incidentEdges(context, nodeId) {
  const exactNodeId = normalizeTopologyEditCanonicalId(nodeId, 'nodeId', 'node');
  return [...context.edges.values()].filter((edge) => (
    edge.fromNodeId === exactNodeId || edge.toNodeId === exactNodeId
  )).sort((left, right) => left.id.localeCompare(right.id));
}

export function assertNoEdgePair(context, leftNodeId, rightNodeId) {
  const leftId = normalizeTopologyEditCanonicalId(leftNodeId, 'leftNodeId', 'node');
  const rightId = normalizeTopologyEditCanonicalId(rightNodeId, 'rightNodeId', 'node');
  if (leftId === rightId) fail('edge endpoints must be different.', RangeError);
  const pair = pairKey(leftId, rightId);
  const existing = [...context.edges.values()].find((edge) => (
    pairKey(edge.fromNodeId, edge.toNodeId) === pair
  ));
  if (existing) fail(`operation would duplicate existing edge ${existing.id}.`, RangeError);
}

export function connectedSelectedNodes(context, nodeIdsInput) {
  const nodeIds = normalizeCanonicalIds(nodeIdsInput, 'nodeIds', 'node:');
  if (nodeIds.length === 0) fail('nodeIds must not be empty.', RangeError);
  nodeIds.forEach((id) => exactNode(context, id));
  const selected = new Set(nodeIds);
  const visited = new Set([nodeIds[0]]);
  const queue = [nodeIds[0]];
  while (queue.length) {
    const current = queue.shift();
    incidentEdges(context, current).forEach((edge) => {
      const peer = edge.fromNodeId === current ? edge.toNodeId : edge.fromNodeId;
      if (selected.has(peer) && !visited.has(peer)) {
        visited.add(peer);
        queue.push(peer);
      }
    });
  }
  if (visited.size !== selected.size) fail('selected run nodes must form one connected set.', RangeError);
  return nodeIds;
}

export function exactExternalBoundaryNodes(context, selectedNodeIds) {
  const selected = new Set(normalizeTopologyEditCanonicalIds(
    selectedNodeIds,
    'selectedNodeIds',
    'node',
  ));
  const boundaries = new Set();
  selected.forEach((nodeId) => {
    incidentEdges(context, nodeId).forEach((edge) => {
      const peer = edge.fromNodeId === nodeId ? edge.toNodeId : edge.fromNodeId;
      if (!selected.has(peer)) boundaries.add(peer);
    });
  });
  return [...boundaries].sort((left, right) => left.localeCompare(right));
}

export function assertExactBoundarySet(actual, suppliedInput) {
  const supplied = normalizeCanonicalIds(suppliedInput, 'boundaryNodeIds', 'node:');
  if (!sameIds(actual, supplied)) {
    fail(`boundaryNodeIds must exactly equal ${actual.join(', ') || '(none)'}.`, RangeError);
  }
  return supplied;
}

export function assertMovedGeometry(context, movedPositions) {
  context.edges.forEach((edge) => {
    const from = movedPositions.get(edge.fromNodeId) ?? exactNode(context, edge.fromNodeId).position;
    const to = movedPositions.get(edge.toNodeId) ?? exactNode(context, edge.toNodeId).position;
    if (!(distance(from, to) > EPSILON_MM)) {
      fail(`operation would collapse edge ${edge.id}.`, RangeError);
    }
  });
}

export function simpleOrderedPath(context, orderedNodeIdsInput) {
  if (!Array.isArray(orderedNodeIdsInput) || orderedNodeIdsInput.length < 2) {
    fail('orderedNodeIds must contain at least two nodes.', RangeError);
  }
  const orderedNodeIds = orderedNodeIdsInput.map((value, index) => (
    requiredCanonicalId(value, `orderedNodeIds[${index}]`, 'node:')
  ));
  if (new Set(orderedNodeIds).size !== orderedNodeIds.length) {
    fail('orderedNodeIds must be distinct.', RangeError);
  }
  orderedNodeIds.forEach((id) => exactNode(context, id));
  const pathEdgeIds = [];
  for (let index = 0; index < orderedNodeIds.length - 1; index += 1) {
    const left = orderedNodeIds[index];
    const right = orderedNodeIds[index + 1];
    const matches = [...context.edges.values()].filter((edge) => (
      pairKey(edge.fromNodeId, edge.toNodeId) === pairKey(left, right)
    ));
    if (matches.length !== 1) fail(`path segment ${left} → ${right} resolved ${matches.length} edges.`, RangeError);
    pathEdgeIds.push(matches[0].id);
  }
  const pathEdges = new Set(pathEdgeIds);
  orderedNodeIds.forEach((nodeId) => {
    const outside = incidentEdges(context, nodeId).filter((edge) => !pathEdges.has(edge.id));
    if (outside.length) fail(`path node ${nodeId} has undeclared incident edge ${outside[0].id}.`, RangeError);
  });
  return { orderedNodeIds, pathEdgeIds };
}

export function finitePoint(value, label) {
  if (!isPlainRecord(value)) fail(`${label} must be an object.`);
  const point = { x: Number(value.x), y: Number(value.y), z: Number(value.z) };
  if (!Object.values(point).every(Number.isFinite)) fail(`${label} must contain finite x, y and z.`, RangeError);
  return point;
}

export function positiveMm(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) fail(`${label} must be a positive finite millimetre value.`, RangeError);
  return number;
}

export function nonZeroDeltaMm(value) {
  const point = finitePoint(value, 'deltaMm');
  if (!(magnitude(point) > EPSILON_MM)) fail('deltaMm must be non-zero.', RangeError);
  return point;
}

export function addScaled(point, direction, scaleMm) {
  return {
    x: point.x + direction.x * scaleMm,
    y: point.y + direction.y * scaleMm,
    z: point.z + direction.z * scaleMm,
  };
}

export function addPoints(left, right) {
  return { x: left.x + right.x, y: left.y + right.y, z: left.z + right.z };
}

export function distance(left, right) { return magnitude(subtract(left, right)); }
export function dot(left, right) { return left.x * right.x + left.y * right.y + left.z * right.z; }
export function subtract(left, right) { return { x: left.x - right.x, y: left.y - right.y, z: left.z - right.z }; }
export function magnitude(value) { return Math.hypot(value.x, value.y, value.z); }
export function scale(value, factor) { return { x: value.x * factor, y: value.y * factor, z: value.z * factor }; }
export function pairKey(left, right) { return [left, right].sort().join('\u0000'); }
export function sameIds(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
export function normalizeEndpoint(value) {
  const endpoint = requiredText(value, 'endpoint').toUpperCase();
  if (!['FROM', 'TO'].includes(endpoint)) fail('endpoint must be FROM or TO.', RangeError);
  return endpoint;
}
export function normalizeCanonicalIds(value, label, prefix) {
  return normalizeTopologyEditCanonicalIds(
    value,
    label,
    canonicalKindFromPrefix(prefix),
  );
}
export function requiredText(value, label) {
  const text = stringValue(value);
  if (!text) fail(`${label} is required.`);
  return text;
}

function indexRows(rows, label) {
  if (!Array.isArray(rows)) fail(`topology.${label} must be an array.`);
  const result = new Map();
  rows.forEach((row, index) => {
    if (!isPlainRecord(row)) fail(`topology.${label}[${index}] must be an object.`);
    const kind = label.slice(0, -1);
    const id = normalizeTopologyEditCanonicalId(
      row.id,
      `topology.${label}[${index}].id`,
      kind,
    );
    if (result.has(id)) fail(`topology.${label} contains duplicate ID ${id}.`, RangeError);
    result.set(id, row);
  });
  return result;
}
function exactRecord(index, idInput, label) {
  const id = normalizeTopologyEditCanonicalId(idInput, `${label}Id`, label);
  const record = index.get(id);
  if (!record) fail(`${label} ${id} was not found.`, RangeError);
  return record;
}
function requiredCanonicalId(value, label, prefix) {
  return normalizeTopologyEditCanonicalId(value, label, canonicalKindFromPrefix(prefix));
}
function canonicalKindFromPrefix(prefix) {
  if (typeof prefix !== 'string' || !prefix.endsWith(':')) {
    fail('canonical prefix must end with a colon.');
  }
  return prefix.slice(0, -1);
}
function referencesNode(record, nodeId) {
  return ['nodeId', 'fromNodeId', 'toNodeId'].some((key) => record?.[key] === nodeId)
    || ['nodeIds', 'fromNodeIds', 'toNodeIds'].some((key) => record?.[key]?.includes?.(nodeId));
}
function fail(message, Constructor = TypeError) {
  throw new Constructor(`TopologyEditRouteOperations: ${message}`);
}
