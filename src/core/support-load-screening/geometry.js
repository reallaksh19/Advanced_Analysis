import { deepFreeze, finiteNumber } from '../shared-piping-model/index.js';

export function distanceM(left, right) {
  if (!left || !right) return null;
  const lx = finiteNumber(left.x), ly = finiteNumber(left.y), lz = finiteNumber(left.z);
  const rx = finiteNumber(right.x), ry = finiteNumber(right.y), rz = finiteNumber(right.z);
  if ([lx, ly, lz, rx, ry, rz].some((value) => value === null)) return null;
  return Math.hypot(rx - lx, ry - ly, rz - lz);
}

export function canonicalPointToMeters(point) {
  if (!point) return null;
  const x = finiteNumber(point.x), y = finiteNumber(point.y), z = finiteNumber(point.z);
  return x === null || y === null || z === null ? null : deepFreeze({ x: x / 1000, y: y / 1000, z: z / 1000 });
}

export function projectPointToSegment(point, start, end) {
  if (!point || !start || !end) return null;
  const vector = subtract(end, start);
  const lengthSquared = dot(vector, vector);
  if (!(lengthSquared > 0)) return null;
  const raw = dot(subtract(point, start), vector) / lengthSquared;
  const parameter = Math.min(1, Math.max(0, raw));
  const projectedPoint = add(start, scale(vector, parameter));
  return deepFreeze({
    parameter,
    rawParameter: raw,
    projectedPoint,
    distanceM: distanceM(point, projectedPoint),
  });
}

export function nearlyEqual(left, right, policy) {
  if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
  const scaleValue = Math.max(1, Math.abs(left), Math.abs(right));
  return Math.abs(left - right) <= policy.absoluteToleranceM + policy.relativeTolerance * scaleValue;
}

export function pointOnSegment(point, start, end, policy) {
  const projection = projectPointToSegment(point, start, end);
  if (!projection) return null;
  const scaleValue = Math.max(1, distanceM(start, end) || 0);
  const tolerance = policy.absoluteToleranceM + policy.relativeTolerance * scaleValue;
  return projection.distanceM <= tolerance ? projection : null;
}

function subtract(left, right) { return { x: left.x - right.x, y: left.y - right.y, z: left.z - right.z }; }
function add(left, right) { return { x: left.x + right.x, y: left.y + right.y, z: left.z + right.z }; }
function scale(value, factor) { return { x: value.x * factor, y: value.y * factor, z: value.z * factor }; }
function dot(left, right) { return left.x * right.x + left.y * right.y + left.z * right.z; }
