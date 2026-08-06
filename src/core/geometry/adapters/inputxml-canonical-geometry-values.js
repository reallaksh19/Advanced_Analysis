import { INPUTXML_SENTINELS } from './inputxml-feature-registry.js';

const CAESAR_SENTINEL_VALUE = INPUTXML_SENTINELS.UNSET;
const CAESAR_SENTINEL_TOLERANCE = INPUTXML_SENTINELS.TOLERANCE;

export function translate(point, dx, dy, dz) {
  return { x: point.x + dx, y: point.y + dy, z: point.z + dz };
}

export function distance(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
}

export function cleanNodeId(value) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  const numeric = Number(text);
  return Number.isFinite(numeric) ? String(numeric) : text;
}

export function rawFiniteNumber(value) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const numeric = Number(text);
  return Number.isFinite(numeric) ? numeric : null;
}

export function caesarNumberOrNull(value) {
  const numeric = rawFiniteNumber(value);
  if (numeric == null) return null;
  if (Math.abs(numeric - CAESAR_SENTINEL_VALUE) < CAESAR_SENTINEL_TOLERANCE) return null;
  return numeric;
}

export function caesarNumberOrZero(value) {
  return caesarNumberOrNull(value) ?? 0;
}

export function addDiagnostic(diagnostics, severity, code, message, data = {}) {
  diagnostics.push({ severity, code, message, data });
}
