/** Pure deterministic geometry helpers for topology-edit visual derivation. */

export function finitePoint(value) {
  if (!value || ![value.x, value.y, value.z].every((row) => Number.isFinite(Number(row)))) {
    return null;
  }
  return Object.freeze({ x: Number(value.x), y: Number(value.y), z: Number(value.z) });
}

export function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

export function integerAtLeast(value, minimum) {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) && number >= minimum ? number : minimum;
}

export function vector(from, to) {
  return { x: to.x - from.x, y: to.y - from.y, z: to.z - from.z };
}

export function addPoint(point, offset) {
  return { x: point.x + offset.x, y: point.y + offset.y, z: point.z + offset.z };
}

export function scaleVector(value, scalar) {
  return cleanVector({ x: value.x * scalar, y: value.y * scalar, z: value.z * scalar });
}

export function midpoint(left, right) {
  return {
    x: (left.x + right.x) / 2,
    y: (left.y + right.y) / 2,
    z: (left.z + right.z) / 2,
  };
}

export function averagePoints(rows) {
  if (!rows.length) return null;
  return rows.reduce((sum, row) => ({
    x: sum.x + row.x / rows.length,
    y: sum.y + row.y / rows.length,
    z: sum.z + row.z / rows.length,
  }), { x: 0, y: 0, z: 0 });
}

export function distance(left, right) {
  return Math.hypot(right.x - left.x, right.y - left.y, right.z - left.z);
}

export function unitVector(value) {
  if (!value) return null;
  const length = Math.hypot(value.x, value.y, value.z);
  return length > 1e-12
    ? cleanVector({ x: value.x / length, y: value.y / length, z: value.z / length })
    : null;
}

export function canonicalDirection(value) {
  const normalized = unitVector(value);
  if (!normalized) return null;
  const first = [normalized.x, normalized.y, normalized.z]
    .find((row) => Math.abs(row) > 1e-12);
  return first < 0 ? scaleVector(normalized, -1) : normalized;
}

export function dotProduct(left, right) {
  return left && right
    ? (left.x * right.x) + (left.y * right.y) + (left.z * right.z)
    : 0;
}

export function crossProduct(left, right) {
  if (!left || !right) return null;
  return cleanVector({
    x: (left.y * right.z) - (left.z * right.y),
    y: (left.z * right.x) - (left.x * right.z),
    z: (left.x * right.y) - (left.y * right.x),
  });
}

export function clampNumber(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

export function nearlyEqual(left, right, tolerance) {
  return Math.abs(left - right) <= Math.max(tolerance, 1e-9);
}

export function globalVertical(verticalAxis = 'Z') {
  return String(verticalAxis).toUpperCase() === 'Y'
    ? Object.freeze({ x: 0, y: 1, z: 0 })
    : Object.freeze({ x: 0, y: 0, z: 1 });
}

export function sampleCircularArc(center, startVector, normal, radius, angle, count) {
  if (!normal) return [];
  return Array.from({ length: count + 1 }, (_, index) => {
    const theta = angle * (index / count);
    return addPoint(center, scaleVector(rodrigues(startVector, normal, theta), radius));
  });
}

function rodrigues(value, axis, angle) {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const radial = scaleVector(value, cosine);
  const tangential = scaleVector(crossProduct(axis, value), sine);
  const axial = scaleVector(axis, dotProduct(axis, value) * (1 - cosine));
  return addPoint(addPoint(radial, tangential), axial);
}

function cleanVector(value) {
  return {
    x: Object.is(value.x, -0) ? 0 : value.x,
    y: Object.is(value.y, -0) ? 0 : value.y,
    z: Object.is(value.z, -0) ? 0 : value.z,
  };
}
