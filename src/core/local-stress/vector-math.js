import { modelError, numericalError } from './errors.js';
import { canonicalNumber, finiteNumber } from './numeric.js';
export function vector3(value, path) {
  if (!Array.isArray(value) || value.length !== 3) {
    throw modelError('VECTOR3_REQUIRED', path, `${path} must contain exactly three components.`);
  }
  return value.map((component, index) => finiteNumber(component, `${path}[${index}]`));
}
export function add(left, right) { return vectorResult(left.map((value, index) => value + right[index])); }
export function subtract(left, right) { return vectorResult(left.map((value, index) => value - right[index])); }
export function scale(vector, factor) { return vectorResult(vector.map((value) => value * factor)); }
export function negate(vector) { return scale(vector, -1); }
export function dot(left, right) { return canonicalNumber(left.reduce((sum, value, index) => sum + value * right[index], 0), 'dot'); }
export function cross(left, right) {
  return vectorResult([
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ]);
}
export function norm(vector) { return canonicalNumber(Math.hypot(...vector), 'norm'); }
export function normalize(vector, path) {
  const componentScale = Math.max(...vector.map((value) => Math.abs(value)));
  if (!Number.isFinite(componentScale) || componentScale === 0) {
    throw numericalError('DEGENERATE_VECTOR', path, `${path} is zero or numerically degenerate.`);
  }
  const scaled = vectorResult(vector.map((value) => value / componentScale));
  return scale(scaled, 1 / norm(scaled));
}
export function transformRows(rows, vector) { return vectorResult(rows.map((row) => dot(row, vector))); }
export function transformColumns(rows, vector) {
  return add(add(scale(rows[0], vector[0]), scale(rows[1], vector[1])), scale(rows[2], vector[2]));
}
export function maxAbs(vector) { return Math.max(...vector.map((value) => Math.abs(value))); }
function vectorResult(value) { return value.map((component) => canonicalNumber(component, 'vector result')); }
