export function buildSegmentGeometry(segment, nodeById) {
  const segmentId = normalizedIdentity(segment?.id);
  const startNodeId = normalizedIdentity(segment?.startNodeId);
  const endNodeId = normalizedIdentity(segment?.endNodeId);
  const start = startNodeId === null ? null : nodeById.get(startNodeId);
  const end = endNodeId === null ? null : nodeById.get(endNodeId);
  if (segmentId === null || startNodeId === null || endNodeId === null
    || !finitePoint(start) || !finitePoint(end)) return null;
  const startPoint = point(start);
  const endPoint = point(end);
  const vector = subtract(endPoint, startPoint);
  const length = norm(vector);
  return Object.freeze({
    segmentId,
    startNodeId,
    endNodeId,
    start: startPoint,
    end: endPoint,
    vector: Object.freeze(vector),
    length,
    aabb: Object.freeze({
      min: Object.freeze({
        x: Math.min(startPoint.x, endPoint.x),
        y: Math.min(startPoint.y, endPoint.y),
        z: Math.min(startPoint.z, endPoint.z),
      }),
      max: Object.freeze({
        x: Math.max(startPoint.x, endPoint.x),
        y: Math.max(startPoint.y, endPoint.y),
        z: Math.max(startPoint.z, endPoint.z),
      }),
    }),
  });
}

export function aabbDistanceSquared(left, right) {
  let total = 0;
  for (const axis of ['x', 'y', 'z']) {
    let delta = 0;
    if (left.max[axis] < right.min[axis]) delta = right.min[axis] - left.max[axis];
    else if (right.max[axis] < left.min[axis]) delta = left.min[axis] - right.max[axis];
    total += delta * delta;
  }
  return total;
}

export function classifySegmentPair(left, right, options = {}) {
  const absoluteTolerance = positiveFinite(options.absoluteTolerance, 'absoluteTolerance');
  const relativeTolerance = nonnegativeFinite(options.relativeTolerance, 'relativeTolerance');
  const nearTolerance = positiveFinite(options.nearTolerance, 'nearTolerance');
  const angularTolerance = positiveFinite(options.angularTolerance, 'angularTolerance');
  const scaleLength = Math.max(left.length, right.length, 1);
  const hitTolerance = absoluteTolerance + relativeTolerance * scaleLength;
  const effectiveNearTolerance = Math.max(nearTolerance, hitTolerance);
  const sharedNodeIds = sharedIds(left, right);

  if (left.length <= hitTolerance || right.length <= hitTolerance) {
    return pairRecord('DEGENERATE', left, right, sharedNodeIds, {
      distance: null,
      hitTolerance,
      nearTolerance: effectiveNearTolerance,
    });
  }

  const collinear = collinearEvidence(left, right, hitTolerance, angularTolerance);
  if (collinear.collinear && collinear.overlapLength > hitTolerance) {
    const exactDuplicate = endpointsMatchExactly(left, right);
    const numericDuplicate = !exactDuplicate
      && Math.abs(left.length - right.length) <= hitTolerance
      && endpointsMatchWithinTolerance(left, right, hitTolerance);
    const classification = exactDuplicate
      ? 'EXACT_DUPLICATE'
      : numericDuplicate
        ? 'NUMERIC_DUPLICATE'
        : 'COLLINEAR_OVERLAP';
    return pairRecord(classification, left, right, sharedNodeIds, {
      distance: collinear.lineDistance,
      hitTolerance,
      nearTolerance: effectiveNearTolerance,
      angularResidual: collinear.angularResidual,
      overlapLength: collinear.overlapLength,
      projectedIntervals: collinear.projectedIntervals,
    });
  }

  const closest = closestPointsOnSegments(left, right, angularTolerance);
  const leftEndpointParameterTolerance = Math.min(0.25, hitTolerance / left.length);
  const rightEndpointParameterTolerance = Math.min(0.25, hitTolerance / right.length);
  const leftInterior = closest.leftParameter > leftEndpointParameterTolerance
    && closest.leftParameter < 1 - leftEndpointParameterTolerance;
  const rightInterior = closest.rightParameter > rightEndpointParameterTolerance
    && closest.rightParameter < 1 - rightEndpointParameterTolerance;

  if (closest.distance <= hitTolerance) {
    let classification;
    if (sharedNodeIds.length > 0 && !leftInterior && !rightInterior) classification = 'SHARED_ENDPOINT';
    else if (leftInterior && rightInterior) classification = 'INTERIOR_INTERSECTION';
    else if (leftInterior || rightInterior) classification = 'ENDPOINT_ON_INTERIOR';
    else classification = 'COINCIDENT_ENDPOINT_CONTACT';
    return pairRecord(classification, left, right, sharedNodeIds, {
      distance: closest.distance,
      hitTolerance,
      nearTolerance: effectiveNearTolerance,
      closestPointLeft: closest.leftPoint,
      closestPointRight: closest.rightPoint,
      leftParameter: closest.leftParameter,
      rightParameter: closest.rightParameter,
      leftEndpointParameterTolerance,
      rightEndpointParameterTolerance,
    });
  }

  if (closest.distance <= effectiveNearTolerance) {
    return pairRecord('NEAR_MISS', left, right, sharedNodeIds, {
      distance: closest.distance,
      hitTolerance,
      nearTolerance: effectiveNearTolerance,
      closestPointLeft: closest.leftPoint,
      closestPointRight: closest.rightPoint,
      leftParameter: closest.leftParameter,
      rightParameter: closest.rightParameter,
    });
  }

  return pairRecord('DISJOINT', left, right, sharedNodeIds, {
    distance: closest.distance,
    hitTolerance,
    nearTolerance: effectiveNearTolerance,
  });
}

function collinearEvidence(left, right, hitTolerance, angularTolerance) {
  const crossMagnitude = norm(cross(left.vector, right.vector));
  const angularResidual = crossMagnitude / (left.length * right.length);
  if (angularResidual > angularTolerance) return { collinear: false, angularResidual };
  const axis = scale(left.vector, 1 / left.length);
  const q0 = subtract(right.start, left.start);
  const q1 = subtract(right.end, left.start);
  const lineDistance0 = norm(cross(q0, axis));
  const lineDistance1 = norm(cross(q1, axis));
  const lineDistance = Math.max(lineDistance0, lineDistance1);
  if (lineDistance > hitTolerance) return { collinear: false, angularResidual, lineDistance };
  const q0Projection = dot(q0, axis);
  const q1Projection = dot(q1, axis);
  const rightMin = Math.min(q0Projection, q1Projection);
  const rightMax = Math.max(q0Projection, q1Projection);
  const overlapMin = Math.max(0, rightMin);
  const overlapMax = Math.min(left.length, rightMax);
  return {
    collinear: true,
    angularResidual,
    lineDistance,
    overlapLength: Math.max(0, overlapMax - overlapMin),
    projectedIntervals: Object.freeze({
      left: Object.freeze([0, left.length]),
      right: Object.freeze([rightMin, rightMax]),
      overlap: Object.freeze([overlapMin, overlapMax]),
    }),
  };
}

function closestPointsOnSegments(left, right, angularTolerance) {
  const d1 = left.vector;
  const d2 = right.vector;
  const r = subtract(left.start, right.start);
  const a = dot(d1, d1);
  const e = dot(d2, d2);
  const b = dot(d1, d2);
  const c = dot(d1, r);
  const f = dot(d2, r);
  const denominator = a * e - b * b;
  const parallelThreshold = angularTolerance * angularTolerance * a * e;
  let leftParameter = denominator > parallelThreshold
    ? clamp((b * f - c * e) / denominator, 0, 1)
    : 0;
  let rightParameter = (b * leftParameter + f) / e;

  if (rightParameter < 0) {
    rightParameter = 0;
    leftParameter = clamp(-c / a, 0, 1);
  } else if (rightParameter > 1) {
    rightParameter = 1;
    leftParameter = clamp((b - c) / a, 0, 1);
  }

  const leftPoint = add(left.start, scale(d1, leftParameter));
  const rightPoint = add(right.start, scale(d2, rightParameter));
  return Object.freeze({
    leftParameter,
    rightParameter,
    leftPoint: point(leftPoint),
    rightPoint: point(rightPoint),
    distance: distance(leftPoint, rightPoint),
  });
}

function endpointsMatchWithinTolerance(left, right, tolerance) {
  const direct = distance(left.start, right.start) <= tolerance
    && distance(left.end, right.end) <= tolerance;
  const reverse = distance(left.start, right.end) <= tolerance
    && distance(left.end, right.start) <= tolerance;
  return direct || reverse;
}

function endpointsMatchExactly(left, right) {
  const direct = pointsEqual(left.start, right.start) && pointsEqual(left.end, right.end);
  const reverse = pointsEqual(left.start, right.end) && pointsEqual(left.end, right.start);
  return direct || reverse;
}

function pairRecord(classification, left, right, sharedNodeIds, evidence) {
  const segmentIds = [left.segmentId, right.segmentId].sort(compareAscii);
  return Object.freeze({
    classification,
    segmentIds: Object.freeze(segmentIds),
    leftSegmentId: left.segmentId,
    rightSegmentId: right.segmentId,
    sharedNodeIds: Object.freeze(sharedNodeIds),
    evidence: Object.freeze(evidence),
  });
}

function sharedIds(left, right) {
  const rightIds = new Set([right.startNodeId, right.endNodeId]);
  return [left.startNodeId, left.endNodeId]
    .filter((nodeId) => rightIds.has(nodeId))
    .sort(compareAscii);
}

function normalizedIdentity(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function finitePoint(value) {
  return value && ['x', 'y', 'z'].every((axis) => typeof value[axis] === 'number' && Number.isFinite(value[axis]));
}

function point(value) {
  return Object.freeze({ x: value.x, y: value.y, z: value.z });
}

function pointsEqual(left, right) {
  return left.x === right.x && left.y === right.y && left.z === right.z;
}

function add(left, right) {
  return { x: left.x + right.x, y: left.y + right.y, z: left.z + right.z };
}

function subtract(left, right) {
  return { x: left.x - right.x, y: left.y - right.y, z: left.z - right.z };
}

function scale(value, factor) {
  return { x: value.x * factor, y: value.y * factor, z: value.z * factor };
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

function norm(value) {
  return Math.sqrt(dot(value, value));
}

function distance(left, right) {
  return norm(subtract(left, right));
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function positiveFinite(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new TypeError(`${name} must be a finite positive number.`);
  }
  return value;
}

function nonnegativeFinite(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new TypeError(`${name} must be a finite nonnegative number.`);
  }
  return value;
}

function compareAscii(left, right) {
  const leftText = String(left);
  const rightText = String(right);
  return leftText < rightText ? -1 : leftText > rightText ? 1 : 0;
}
