import { deepFreeze, semanticHash } from '../../core/shared-piping-model/index.js';

function fail(message, Constructor = RangeError) {
  throw new Constructor(`TopologyEditPipeSegmentGeometry: ${message}`);
}
function finitePoint(value, label) {
  const point = {
    x: Number(value?.x),
    y: Number(value?.y),
    z: Number(value?.z),
  };
  if (!Object.values(point).every(Number.isFinite)) {
    fail(`${label} must contain finite x, y and z coordinates.`, TypeError);
  }
  return point;
}
function subtract(left, right) {
  return { x: left.x - right.x, y: left.y - right.y, z: left.z - right.z };
}
function dot(left, right) {
  return left.x * right.x + left.y * right.y + left.z * right.z;
}
function cross(left, right) {
  return {
    x: left.y * right.z - left.z * right.y,
    y: left.z * right.x - left.x * right.z,
    z: left.x * right.y - left.y * right.x,
  };
}
function magnitude(value) {
  return Math.hypot(value.x, value.y, value.z);
}
function scale(value, factor) {
  return { x: value.x * factor, y: value.y * factor, z: value.z * factor };
}
function pointAt(origin, direction, distance) {
  return {
    x: origin.x + direction.x * distance,
    y: origin.y + direction.y * distance,
    z: origin.z + direction.z * distance,
  };
}

export function createPipeSegmentGeometryEvidence(fromPosition, toPosition) {
  const startPointMm = finitePoint(fromPosition, 'fromPosition');
  const endPointMm = finitePoint(toPosition, 'toPosition');
  const delta = subtract(endPointMm, startPointMm);
  const lengthMm = magnitude(delta);
  if (!(lengthMm > 0)) fail('segment length must be positive.');
  const unitDirection = scale(delta, 1 / lengthMm);
  const material = { startPointMm, endPointMm, lengthMm, unitDirection };
  return deepFreeze({ ...material, geometryHash: semanticHash(material) });
}

export function assertPipeSegmentMinimumLength(evidence, minimumLengthMm) {
  const minimum = Number(minimumLengthMm);
  if (!Number.isFinite(minimum) || minimum <= 0) {
    fail('minimumLengthMm must be positive.');
  }
  if (evidence.lengthMm < minimum) {
    fail(`segment length ${evidence.lengthMm} is below minimum ${minimum}.`);
  }
  return evidence;
}

function exactNode(topology, id) {
  const matches = (topology.nodes ?? []).filter((node) => node.id === id);
  if (matches.length !== 1) fail(`node ${id} resolved ${matches.length} records.`);
  return matches[0];
}
function unorderedPair(left, right) {
  return [left, right].sort().join('\u0000');
}
function collinearOverlapLength(left, right, toleranceMm) {
  const leftVector = subtract(left.endPointMm, left.startPointMm);
  const rightVector = subtract(right.endPointMm, right.startPointMm);
  const leftLength = left.lengthMm;
  const rightLength = right.lengthMm;
  const directionCross = magnitude(cross(leftVector, rightVector));
  if (directionCross > toleranceMm * leftLength * rightLength) return 0;
  const offset = subtract(right.startPointMm, left.startPointMm);
  if (magnitude(cross(offset, leftVector)) > toleranceMm * leftLength) return 0;
  const axis = left.unitDirection;
  const rightStart = dot(offset, axis);
  const rightEnd = dot(subtract(right.endPointMm, left.startPointMm), axis);
  const low = Math.max(0, Math.min(rightStart, rightEnd));
  const high = Math.min(leftLength, Math.max(rightStart, rightEnd));
  return Math.max(0, high - low);
}

export function assertNoDuplicateOrOverlappingPipeSegment(
  topology,
  fromNodeId,
  toNodeId,
  evidence,
  toleranceMm,
) {
  const tolerance = Number(toleranceMm);
  if (!Number.isFinite(tolerance) || tolerance < 0) {
    fail('overlapToleranceMm must be a non-negative finite number.');
  }
  const requestedPair = unorderedPair(fromNodeId, toNodeId);
  for (const edge of topology.edges ?? []) {
    if (unorderedPair(edge.fromNodeId, edge.toNodeId) === requestedPair) {
      fail(`segment duplicates existing edge ${edge.id}.`);
    }
    const from = exactNode(topology, edge.fromNodeId);
    const to = exactNode(topology, edge.toNodeId);
    const existing = createPipeSegmentGeometryEvidence(from.position, to.position);
    if (collinearOverlapLength(evidence, existing, tolerance) > tolerance) {
      fail(`segment overlaps existing edge ${edge.id}.`);
    }
  }
  return evidence;
}

export function pipeSegmentEndpoint(evidence, endpoint) {
  if (endpoint === 'FROM') return evidence.startPointMm;
  if (endpoint === 'TO') return evidence.endPointMm;
  fail(`unsupported endpoint ${endpoint}.`, TypeError);
}

export function pipeSegmentMidpoint(evidence) {
  return deepFreeze(pointAt(
    evidence.startPointMm,
    evidence.unitDirection,
    evidence.lengthMm / 2,
  ));
}
