/**
 * Sequential Sketcher Contracts & Types
 */
export const SEQUENTIAL_BRANCH_SKETCH_SCHEMA = 'SequentialBranchSketch.v1';
export const DEFAULT_TOLERANCE_MM = 1;

const TYPE_ALIASES = Object.freeze({
  PIPE: 'PIPE', TUBE: 'PIPE',
  ELBO: 'ELBOW', BEND: 'ELBOW', ELBOW: 'ELBOW',
  TEE: 'TEE', OLET: 'OLET',
  REDU: 'REDUCER', REDUCER: 'REDUCER',
  VALV: 'VALVE', VALVE: 'VALVE',
  FLAN: 'FLANGE', FLANGE: 'FLANGE',
  GASK: 'GASKET', GASKET: 'GASKET',
  INST: 'INSTRUMENT', INSTRUMENT: 'INSTRUMENT',
  CAP: 'CAP', BLIND: 'BLIND', COUP: 'COUPLING', UNION: 'UNION',
});

export const ROUTE_TYPES = Object.freeze(new Set(Object.values(TYPE_ALIASES)));
export const JUNCTION_TYPES = Object.freeze(new Set(['TEE', 'OLET']));

export function asciiCompare(a, b) {
  const sa = String(a || '');
  const sb = String(b || '');
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

export function asciiSort(arr) {
  if (!Array.isArray(arr)) throw new TypeError('asciiSort expects an array.');
  return [...arr].sort(asciiCompare);
}

export function canonicalComponentType(value) {
  return TYPE_ALIASES[String(value || '').trim().toUpperCase()] || '';
}

export function isRouteComponent(value) {
  return ROUTE_TYPES.has(canonicalComponentType(value));
}

export function pointFrom(value) {
  if (!value || typeof value !== 'object') return null;
  const x = Number(value.x); const y = Number(value.y); const z = Number(value.z);
  return [x, y, z].every(Number.isFinite) ? Object.freeze({ x, y, z }) : null;
}

export function distance3d(left, right) {
  if (!left || !right) return Number.POSITIVE_INFINITY;
  return Math.hypot(left.x - right.x, left.y - right.y, left.z - right.z);
}

export function samePoint(left, right, toleranceMm = DEFAULT_TOLERANCE_MM) {
  return distance3d(left, right) <= Math.max(0, Number(toleranceMm) || 0);
}

export function stableToken(value) {
  let hash = 2166136261;
  const text = String(value || '');
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).padStart(7, '0');
}
