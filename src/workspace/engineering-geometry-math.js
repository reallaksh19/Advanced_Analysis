import { freezeDeep } from './dataset-utils.js';

export function distance3(a, b) {
  if (!isPoint(a) || !isPoint(b)) return 0;
  return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
}

export function midpoint3(a, b) {
  if (!isPoint(a) || !isPoint(b)) return null;
  return freezeDeep({
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    z: (a.z + b.z) / 2,
  });
}

export function centroid3(points) {
  const valid = uniquePoints(points);
  if (!valid.length) return null;
  const total = valid.reduce((sum, point) => ({
    x: sum.x + point.x,
    y: sum.y + point.y,
    z: sum.z + point.z,
  }), { x: 0, y: 0, z: 0 });
  return freezeDeep({
    x: total.x / valid.length,
    y: total.y / valid.length,
    z: total.z / valid.length,
  });
}

export function uniquePoints(points, tolerance = 1e-6) {
  const valid = [];
  (Array.isArray(points) ? points : []).forEach((point) => {
    if (!isPoint(point)) return;
    const duplicate = valid.some((existing) => distance3(existing, point) <= tolerance);
    if (!duplicate) valid.push(freezeDeep({ x: point.x, y: point.y, z: point.z }));
  });
  return valid;
}

export function buildCircularArcPath(start, end, center, segments = 18) {
  if (![start, end, center].every(isPoint)) return null;
  const startVector = subtract(start, center);
  const endVector = subtract(end, center);
  const startRadius = magnitude(startVector);
  const endRadius = magnitude(endVector);
  if (startRadius <= 1e-9 || endRadius <= 1e-9) return null;
  const mismatch = Math.abs(startRadius - endRadius) / Math.max(startRadius, endRadius);
  if (mismatch > 0.08) return null;

  const normal = normalize(cross(startVector, endVector));
  if (!normal) return null;
  const cosine = clamp(dot(startVector, endVector) / (startRadius * endRadius), -1, 1);
  const angle = Math.acos(cosine);
  if (!Number.isFinite(angle) || angle <= 1e-5) return null;

  const radius = (startRadius + endRadius) / 2;
  const count = Math.max(4, Math.min(64, Math.round(segments)));
  const path = [];
  for (let index = 0; index <= count; index += 1) {
    const rotated = rotateAroundAxis(startVector, normal, angle * (index / count));
    const normalized = normalize(rotated);
    if (!normalized) return null;
    path.push(freezeDeep({
      x: center.x + normalized.x * radius,
      y: center.y + normalized.y * radius,
      z: center.z + normalized.z * radius,
    }));
  }
  path[0] = freezeDeep({ ...start });
  path[path.length - 1] = freezeDeep({ ...end });
  return freezeDeep(path);
}

export function symbolicDiameter(length, preferred) {
  if (Number.isFinite(preferred) && preferred > 0) return preferred;
  const safeLength = Number.isFinite(length) && length > 0 ? length : 100;
  return clamp(safeLength * 0.06, 2, 250);
}

export function calculatePrimitiveBounds(items) {
  const samples = [];
  let maxRadius = 0;
  (Array.isArray(items) ? items : []).forEach((item) => {
    collectPrimitivePoints(item?.primitive, samples);
    maxRadius = Math.max(maxRadius, primitiveRadius(item?.primitive));
  });
  if (!samples.length) return defaultBounds();

  const min = { x: Infinity, y: Infinity, z: Infinity };
  const max = { x: -Infinity, y: -Infinity, z: -Infinity };
  samples.forEach((point) => {
    min.x = Math.min(min.x, point.x - maxRadius);
    min.y = Math.min(min.y, point.y - maxRadius);
    min.z = Math.min(min.z, point.z - maxRadius);
    max.x = Math.max(max.x, point.x + maxRadius);
    max.y = Math.max(max.y, point.y + maxRadius);
    max.z = Math.max(max.z, point.z + maxRadius);
  });
  const size = {
    x: Math.max(max.x - min.x, 1),
    y: Math.max(max.y - min.y, 1),
    z: Math.max(max.z - min.z, 1),
  };
  const center = {
    x: (min.x + max.x) / 2,
    y: (min.y + max.y) / 2,
    z: (min.z + max.z) / 2,
  };
  return freezeDeep({
    min,
    max,
    size,
    center,
    radius: Math.max(Math.hypot(size.x, size.y, size.z) / 2, 1),
  });
}

export function isPoint(value) {
  return Boolean(
    value
    && Number.isFinite(value.x)
    && Number.isFinite(value.y)
    && Number.isFinite(value.z),
  );
}

function collectPrimitivePoints(primitive, output) {
  if (!primitive) return;
  [primitive.start, primitive.end, primitive.center, primitive.axisStart, primitive.axisEnd]
    .filter(isPoint)
    .forEach((point) => output.push(point));
  (primitive.path || []).filter(isPoint).forEach((point) => output.push(point));
  (primitive.legs || []).forEach((leg) => {
    if (isPoint(leg?.start)) output.push(leg.start);
    if (isPoint(leg?.end)) output.push(leg.end);
  });
}

function primitiveRadius(primitive) {
  const values = [
    primitive?.visualDiameterMm,
    primitive?.visualStartDiameterMm,
    primitive?.visualEndDiameterMm,
    primitive?.visualOutsideDiameterMm,
    primitive?.visualBodyDiameterMm,
    primitive?.visualSizeMm,
  ].filter((value) => Number.isFinite(value) && value > 0);
  return values.length ? Math.max(...values) / 2 : 0;
}

function defaultBounds() {
  return freezeDeep({
    min: { x: -0.5, y: -0.5, z: -0.5 },
    max: { x: 0.5, y: 0.5, z: 0.5 },
    size: { x: 1, y: 1, z: 1 },
    center: { x: 0, y: 0, z: 0 },
    radius: 1,
  });
}

function subtract(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function magnitude(vector) {
  return Math.hypot(vector.x, vector.y, vector.z);
}

function normalize(vector) {
  const length = magnitude(vector);
  if (!Number.isFinite(length) || length <= 1e-12) return null;
  return { x: vector.x / length, y: vector.y / length, z: vector.z / length };
}

function dot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function rotateAroundAxis(vector, axis, angle) {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const axisDot = dot(axis, vector);
  const axisCross = cross(axis, vector);
  return {
    x: vector.x * cosine + axisCross.x * sine + axis.x * axisDot * (1 - cosine),
    y: vector.y * cosine + axisCross.y * sine + axis.y * axisDot * (1 - cosine),
    z: vector.z * cosine + axisCross.z * sine + axis.z * axisDot * (1 - cosine),
  };
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}
