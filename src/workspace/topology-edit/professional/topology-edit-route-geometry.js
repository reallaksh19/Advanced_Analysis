import {
  deepFreeze,
  isPlainRecord,
  semanticHash,
  stringValue,
} from '../../../core/shared-piping-model/index.js';

export const TOPOLOGY_EDIT_EDGE_GEOMETRY_SCHEMA = 'TopologyEditEdgeGeometry.v1';

const ENDPOINTS = new Set(['FROM', 'TO']);
const MODES = new Set(['EXTEND', 'SHORTEN']);

export function inspectTopologyEditEdgeGeometry(topology, input = {}) {
  if (!isPlainRecord(topology)) fail('topology must be an object.');
  const basisHash = requiredText(
    input.basisHash ?? topology.canonicalTopologyHash,
    'basisHash',
  );
  const currentBasisHash = requiredText(
    topology.canonicalTopologyHash,
    'topology.canonicalTopologyHash',
  );
  if (basisHash !== currentBasisHash) {
    fail(`stale basis ${basisHash}; current topology is ${currentBasisHash}.`, RangeError);
  }
  const edgeId = exactId(input.edgeId, 'edge:', 'edgeId');
  const edge = exactRecord(topology.edges, edgeId, 'edge');
  const fromNodeId = exactId(edge.fromNodeId, 'node:', `${edgeId}.fromNodeId`);
  const toNodeId = exactId(edge.toNodeId, 'node:', `${edgeId}.toNodeId`);
  if (fromNodeId === toNodeId) fail(`${edgeId} has identical endpoints.`, RangeError);
  const fromNode = exactRecord(topology.nodes, fromNodeId, 'FROM node');
  const toNode = exactRecord(topology.nodes, toNodeId, 'TO node');
  const fromPosition = finitePoint(fromNode.position, `${fromNodeId}.position`);
  const toPosition = finitePoint(toNode.position, `${toNodeId}.position`);
  const delta = subtract(toPosition, fromPosition);
  const lengthMm = vectorLength(delta);
  if (!(lengthMm > 0)) fail(`${edgeId} has zero length.`, RangeError);
  const directionFromTo = scale(delta, 1 / lengthMm);
  const edgeRevisionHash = semanticHash({
    edge: normalizeJson(edge, `${edgeId}.record`),
    fromNode: normalizeRevisionNode(fromNode, fromPosition),
    toNode: normalizeRevisionNode(toNode, toPosition),
  });
  const expected = optionalText(input.expectedEdgeRevisionHash);
  if (expected && expected !== edgeRevisionHash) {
    fail(`stale edge revision ${expected}; current revision is ${edgeRevisionHash}.`, RangeError);
  }
  const material = {
    schema: TOPOLOGY_EDIT_EDGE_GEOMETRY_SCHEMA,
    basisHash,
    edgeId,
    edgeRevisionHash,
    fromNodeId,
    toNodeId,
    fromPosition,
    toPosition,
    lengthMm,
    directionFromTo,
    endpointDegree: {
      FROM: incidentEdgeCount(topology.edges, fromNodeId),
      TO: incidentEdgeCount(topology.edges, toNodeId),
    },
    endpointJunctionCount: {
      FROM: referencedRecordCount(topology.junctions, fromNodeId),
      TO: referencedRecordCount(topology.junctions, toNodeId),
    },
  };
  return deepFreeze({ ...material, geometryHash: semanticHash(material) });
}

export function assertTopologyEditEdgeGeometry(value) {
  if (!isPlainRecord(value)) fail('geometry must be an object.');
  if (value.schema !== TOPOLOGY_EDIT_EDGE_GEOMETRY_SCHEMA) {
    fail(`geometry must use ${TOPOLOGY_EDIT_EDGE_GEOMETRY_SCHEMA}.`);
  }
  const supplied = { ...value };
  delete supplied.geometryHash;
  if (value.geometryHash !== semanticHash(supplied)) {
    fail('geometry hash does not match normalized authority.', RangeError);
  }
  const directionLength = vectorLength(finitePoint(value.directionFromTo, 'directionFromTo'));
  if (Math.abs(directionLength - 1) > 1e-12) {
    fail('directionFromTo must be a normalized unit vector.', RangeError);
  }
  positiveFinite(value.lengthMm, 'lengthMm');
  normalizeEndpointCounts(value.endpointDegree, 'endpointDegree');
  normalizeEndpointCounts(value.endpointJunctionCount, 'endpointJunctionCount');
  return value;
}

export function topologyEditEdgePointAtDistance(
  geometryInput,
  referenceEndpointInput,
  distanceMmInput,
) {
  const geometry = assertTopologyEditEdgeGeometry(geometryInput);
  const referenceEndpoint = endpoint(referenceEndpointInput, 'referenceEndpoint');
  const distanceMm = nonNegativeFinite(distanceMmInput, 'distanceMm');
  if (distanceMm > geometry.lengthMm) {
    fail(`distanceMm ${distanceMm} exceeds edge length ${geometry.lengthMm}.`, RangeError);
  }
  const fractionFromFrom = referenceEndpoint === 'FROM'
    ? distanceMm / geometry.lengthMm
    : 1 - (distanceMm / geometry.lengthMm);
  const position = add(
    geometry.fromPosition,
    scale(geometry.directionFromTo, geometry.lengthMm * fractionFromFrom),
  );
  return deepFreeze({
    referenceEndpoint,
    distanceMm,
    fractionFromFrom: normalizedNumber(fractionFromFrom),
    position,
  });
}

export function topologyEditMovedEndpointPosition(
  geometryInput,
  endpointInput,
  distanceMmInput,
  modeInput,
) {
  const geometry = assertTopologyEditEdgeGeometry(geometryInput);
  const selectedEndpoint = endpoint(endpointInput, 'endpoint');
  const distanceMm = positiveFinite(distanceMmInput, 'distanceMm');
  const mode = requiredText(modeInput, 'mode').toUpperCase();
  if (!MODES.has(mode)) fail(`unsupported movement mode ${mode}.`, RangeError);
  if (mode === 'SHORTEN' && distanceMm >= geometry.lengthMm) {
    fail('shorten distance must remain strictly below the current edge length.', RangeError);
  }
  const basePosition = selectedEndpoint === 'FROM'
    ? geometry.fromPosition
    : geometry.toPosition;
  const outward = selectedEndpoint === 'FROM'
    ? scale(geometry.directionFromTo, -1)
    : geometry.directionFromTo;
  const signedDistance = mode === 'EXTEND' ? distanceMm : -distanceMm;
  return deepFreeze(add(basePosition, scale(outward, signedDistance)));
}

export function topologyEditEndpointNodeId(geometryInput, endpointInput) {
  const geometry = assertTopologyEditEdgeGeometry(geometryInput);
  return endpoint(endpointInput, 'endpoint') === 'FROM'
    ? geometry.fromNodeId
    : geometry.toNodeId;
}

function normalizeRevisionNode(node, position) {
  return {
    id: node.id,
    position,
    portKeys: [...new Set((node.portKeys ?? []).map(String))].sort(),
    sourcePath: optionalText(node.sourcePath),
    componentKey: optionalText(node.componentKey),
    entityId: optionalText(node.entityId),
  };
}
function exactRecord(rows, id, label) {
  if (!Array.isArray(rows)) fail(`topology ${label} collection must be an array.`);
  const matches = rows.filter((row) => isPlainRecord(row) && row.id === id);
  if (matches.length !== 1) fail(`${label} ${id} resolved ${matches.length} records.`, RangeError);
  return matches[0];
}
function incidentEdgeCount(rows, nodeId) {
  if (!Array.isArray(rows)) fail('topology edges must be an array.');
  return rows.filter((edge) => edge?.fromNodeId === nodeId || edge?.toNodeId === nodeId).length;
}
function referencedRecordCount(rows = [], nodeId) {
  if (!Array.isArray(rows)) fail('topology junctions must be an array.');
  return rows.filter((row) => row?.nodeId === nodeId
    || (Array.isArray(row?.nodeIds) && row.nodeIds.includes(nodeId))).length;
}
function normalizeEndpointCounts(value, label) {
  if (!isPlainRecord(value)) fail(`${label} must be an object.`);
  for (const key of ENDPOINTS) {
    const number = Number(value[key]);
    if (!Number.isInteger(number) || number < 0) fail(`${label}.${key} must be non-negative.`, RangeError);
  }
}
function normalizeJson(value, label) {
  try {
    const clone = JSON.parse(JSON.stringify(value));
    if (!isPlainRecord(clone)) fail(`${label} must be a JSON object.`);
    return clone;
  } catch (error) {
    if (error instanceof TypeError || error instanceof RangeError) throw error;
    fail(`${label} must be JSON serializable.`);
  }
}
function finitePoint(value, label) {
  const point = isPlainRecord(value)
    ? { x: Number(value.x), y: Number(value.y), z: Number(value.z) }
    : {};
  if (!['x', 'y', 'z'].every((key) => Number.isFinite(point[key]))) {
    fail(`${label} must contain finite x, y and z coordinates.`, RangeError);
  }
  return Object.fromEntries(Object.entries(point).map(([key, number]) => [key, normalizedNumber(number)]));
}
function endpoint(value, label) {
  const result = requiredText(value, label).toUpperCase();
  if (!ENDPOINTS.has(result)) fail(`${label} must be FROM or TO.`, RangeError);
  return result;
}
function exactId(value, prefix, label) {
  const id = requiredText(value, label);
  if (!id.startsWith(prefix)) fail(`${label} must use exact ${prefix.slice(0, -1)} identity.`, RangeError);
  return id;
}
function positiveFinite(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) fail(`${label} must be positive and finite.`, RangeError);
  return normalizedNumber(number);
}
function nonNegativeFinite(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) fail(`${label} must be non-negative and finite.`, RangeError);
  return normalizedNumber(number);
}
function normalizedNumber(value) { return Object.is(value, -0) ? 0 : value; }
function vectorLength(value) { return Math.hypot(value.x, value.y, value.z); }
function subtract(left, right) { return { x: left.x - right.x, y: left.y - right.y, z: left.z - right.z }; }
function add(left, right) {
  return {
    x: normalizedNumber(left.x + right.x),
    y: normalizedNumber(left.y + right.y),
    z: normalizedNumber(left.z + right.z),
  };
}
function scale(value, factor) {
  return {
    x: normalizedNumber(value.x * factor),
    y: normalizedNumber(value.y * factor),
    z: normalizedNumber(value.z * factor),
  };
}
function optionalText(value) { return stringValue(value) || null; }
function requiredText(value, label) {
  const text = stringValue(value);
  if (!text) fail(`${label} is required.`);
  return text;
}
function fail(message, Constructor = TypeError) {
  throw new Constructor(`TopologyEditRouteGeometry: ${message}`);
}
