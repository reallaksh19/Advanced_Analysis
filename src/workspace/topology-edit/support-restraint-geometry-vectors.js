export function globalVertical(axis) {
  return String(axis).toUpperCase() === 'Y'
    ? { x: 0, y: 1, z: 0 }
    : { x: 0, y: 0, z: 1 };
}

export function canonicalDirection(value) {
  const normalized = unit(value);
  if (!normalized) return null;
  const first = [normalized.x, normalized.y, normalized.z]
    .find((row) => Math.abs(row) > 1e-12);
  return first < 0 ? scale(normalized, -1) : normalized;
}

export function finitePoint(value) {
  return value && [value.x, value.y, value.z].every((row) => Number.isFinite(Number(row)))
    ? Object.freeze({ x: Number(value.x), y: Number(value.y), z: Number(value.z) })
    : null;
}

export function positive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

export function vector(a, b) {
  return { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
}

export function add(a, b) {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function scale(value, scalar) {
  return cleanVector({
    x: value.x * scalar,
    y: value.y * scalar,
    z: value.z * scalar,
  });
}

export function unit(value) {
  if (!value) return null;
  const length = Math.hypot(value.x, value.y, value.z);
  return length > 1e-12
    ? cleanVector({ x: value.x / length, y: value.y / length, z: value.z / length })
    : null;
}

export function cross(a, b) {
  return cleanVector({
    x: (a.y * b.z) - (a.z * b.y),
    y: (a.z * b.x) - (a.x * b.z),
    z: (a.x * b.y) - (a.y * b.x),
  });
}

function cleanVector(value) {
  return {
    x: Object.is(value.x, -0) ? 0 : value.x,
    y: Object.is(value.y, -0) ? 0 : value.y,
    z: Object.is(value.z, -0) ? 0 : value.z,
  };
}
