const EPSILON = 1e-30;

export function buildSegmentGeometry(segment, nodeById) {
  const start = nodeById.get(String(segment.startNodeId));
  const end = nodeById.get(String(segment.endNodeId));
  if (!start || !end || !finitePoint(start) || !finitePoint(end)) return null;
  const vector = subtract(end, start);
  const length = norm(vector);
  return Object.freeze({
    segmentId: String(segment.id),
    startNodeId: String(segment.startNodeId),
    endNodeId: String(segment.endNodeId),
    start: point(start),
    end: point(end),
    vector,
    length,
    aabb: Object.freeze({
      min: Object.freeze({ x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), z: Math.min(start.z, end.z) }),
      max: Object.freeze({ x: Math.max(start.x, end.x), y: Math.max(start.y, end.y), z: Math.max(start.z, end.z) }),
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
  const scale = Math.max(left.length, right.length, 1);
  const hitTolerance = absoluteTolerance + relativeTolerance * scale;
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
      overlapLength: collinear.overlapLength,
      projectedIntervals: collinear.projectedIntervals,
    });
  }

  const closest = closestPointsOnSegments(left.start, left.end, right.start, right.end);
  const endpointToleranceLeft = Math.min(1e-7, hitTolerance / Math.max(left.length, hitTolerance));
  const endpointToleranceRight = Math.min(1e-7, hitTolerance / Math.max(right.length, hitTolerance));
  const leftInterior = closest.leftParameter > endpointToleranceLeft
    && closest.leftParameter < 1 - endpointToleranceLeft;
  const rightInterior = closest.rightParameter > endpointToleranceRight
    && closest.rightParameter < 1 - endpointToleranceRight;

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
  if (angularResidual > angularTolerance) return { collinear: false };
  const axis = scale(left.vector, 1 / left.length);
  const q0 = subtract(right.start, left.start);
  const q1 = subtract(right.end, left.start);
  const lineDistance0 = norm(cross(q0, axis));
  const lineDistance1 = norm(cross(q1, axis));
  const lineDistance = Math.max(lineDistance0, lineDistance1);
  if (lineDistance > hitTolerance) return { collinear: false };
  const q0Projection = dot(q0, axis);
  const q1Projection = dot(q1, axis);
  const rightMin = Math.min(q0Projection, q1Projection);
  const rightMax = Math.max(q0Projection, q1Projection);
  const overlapMin = Math.max(0, rightMin);
  const overlapMax = Math.min(left.length, rightMax);
  return {
    collinear: true,
    lineDistance,
    overlapLength: Math.max(0, overlapMax - overlapMin),
    projectedIntervals: Object.freeze({
      left: Object.freeze([0, left.length]),
      right: Object.freeze([rightMin, rightMax]),
      overlap: Object.freeze([overlapMin, overlapMax]),
    }),
  };
}

function endpointsMatchWithinTolerance(left, right, tolerance) {
  const direct = distance(left.start, right.start) <= tolerance && distance(left.end, right.end) <= tolerance;
  const reverse = distance(left.start, right.end) <= tolerance && distance(left.end, right.start) <= tolerance;
  return direct || reverse;
}

function endpointsMatchExactly(left, right) {
  const direct = pointsEqual(left.start, right.start) && pointsEqual(left.end, right.end);
  const reverse = pointsEqual(left.start, right.end) && pointsEqual(left.end, right.start);
  return direct || reverse;
}

function pointsEqual(left, right) {
  return left.x === right.x && left.y === right.y && left.z === right.z;
}

function closestPointsOnSegments(p0, p1, q0, q1) {
  const u = subtract(p1, p0);
  const v = subtract(q1, q0);
  const w = subtract(p0, q0);
  const a = dot(u, u);
  const b = dot(u, v);
  const c = dot(v, v);
  const d = dot(u, w);
  const e = dot(v, w);
  const denominator = a * c - b * b;
  let sNumerator;
  let sDenominator = denominator;
  let tNumerator;
  let tDenominator = denominator;

  if (denominator < EPSILON) {
    sNumerator = 0;
    sDenominator = 1;
    tNumerator = e;
    tDenominator = c;
  } else {
    sNumerator = b * e - c * d;
    tNumerator = a * e - b * d;
    if (sNumerator < 0) {
      sNumerator = 0;
      tNumerator = e;
      tDenominator = c;
    } else if (sNumerator > sDenominator) {
      sNumerator = sDenominator;
      tNumerator = e + b;
      tDenominator = c;
    }
  }

  if (tNumerator < 0) {
    tNumerator = 0;
    if (-d < 0) sNumerator = 0;
    else if (-d > a) sNumerator = sDenominator;
    else {
      sNumerator = -d;
      sDenominator = a;
    }
  } else if (tNumerator > tDenominator) {
    tNumerator = tDenominator;
    if (-d + b < 0) sNumerator = 0;
    else if (-d + b > a) sNumerator = sDenominator;
    else {
      sNumerator = -d + b;
      sDenominator = a;
    }
  }

  const leftParameter = Math.abs(sNumerator) < EPSILON ? 0 : sNumerator / sDenominator;
  const rightParameter = Math.abs(tNumerator) < EPSILON ? 0 : tNumerator / tDenominator;
  const leftPoint = add(p0, scale(u, leftParameter));
  const rightPoint = add(q0, scale(v, rightParameter));
  return {
    leftParameter,
    rightParameter,
    leftPoint: point(leftPoint),
    rightPoint: point(rightPoint),
    distance: distance(leftPoint, rightPoint),
  };
}

function pairRecord(classification, left, right, sharedNodeIds, evidence) {
  return Object.freeze({
    classification,
    leftSegmentId: left.segmentId,
    rightSegmentId: right.segmentId,
    segmentIds: Object.freeze([left.segmentId, right.segmentId].sort()),
    sharedNodeIds: Object.freeze(sharedNodeIds),
    evidence: Object.freeze(evidence),
  });
}

function sharedIds(left, right) {
  const rightIds = new Set([right.startNodeId, right.endNodeId]);
  return [left.startNodeId, left.endNodeId].filter((nodeId) => rightIds.has(nodeId)).sort();
}

function finitePoint(value) {
  return ['x', 'y', 'z'].every((axis) => typeof value[axis] === 'number' && Number.isFinite(value[axis]));
}

function point(value) {
  return Object.freeze({ x: value.x, y: value.y, z: value.z });
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
