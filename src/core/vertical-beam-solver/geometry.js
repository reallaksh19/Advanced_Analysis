import { nearlyEqual } from './numeric.js';
export function distance(left, right) {
  if (!left || !right) return null;
  const values = [left.x, left.y, left.z, right.x, right.y, right.z].map(Number);
  return values.every(Number.isFinite)
    ? Math.hypot(values[0] - values[3], values[1] - values[4], values[2] - values[5])
    : null;
}
export function pointOnSegment(point, start, end, policy) {
  if (!point || !start || !end) return null;
  const vector = subtract(end, start), denominator = dot(vector, vector);
  if (!(denominator > 0)) return null;
  const parameter = dot(subtract(point, start), vector) / denominator;
  const clamped = Math.max(0, Math.min(1, parameter));
  const projected = add(start, scale(vector, clamped));
  const error = distance(point, projected);
  const size = Math.max(1, ...Object.values(point).map(Math.abs), ...Object.values(start).map(Math.abs), ...Object.values(end).map(Math.abs));
  const tolerance = policy.absoluteTolerance + policy.relativeTolerance * size;
  return error !== null && error <= tolerance ? { parameter: clamped, projectedPoint: projected, errorM: error } : null;
}
export function pointsAgree(left, right, policy) {
  const delta = distance(left, right);
  if (delta === null) return false;
  const scale = Math.max(1, ...Object.values(left).map(Math.abs), ...Object.values(right).map(Math.abs));
  return delta <= policy.absoluteTolerance + policy.relativeTolerance * scale;
}
export function stationIndex(stations, value, policy) {
  return stations.findIndex((station) => nearlyEqual(station, value, policy));
}
function subtract(left, right) { return { x: left.x - right.x, y: left.y - right.y, z: left.z - right.z }; }
function add(left, right) { return { x: left.x + right.x, y: left.y + right.y, z: left.z + right.z }; }
function scale(value, factor) { return { x: value.x * factor, y: value.y * factor, z: value.z * factor }; }
function dot(left, right) { return left.x * right.x + left.y * right.y + left.z * right.z; }
