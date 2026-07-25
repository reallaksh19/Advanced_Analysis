export function add(a, b) { return a.map((value, index) => clean(value + b[index])); }
export function subtract(a, b) { return a.map((value, index) => clean(value - b[index])); }
export function scale(a, factor) { return a.map((value) => clean(value * factor)); }
export function dot(a, b) { return clean(a.reduce((sum, value, index) => sum + value * b[index], 0)); }
export function cross(a, b) {
  return [clean(a[1] * b[2] - a[2] * b[1]), clean(a[2] * b[0] - a[0] * b[2]), clean(a[0] * b[1] - a[1] * b[0])];
}
export function norm(a) { return clean(Math.hypot(...a)); }
export function maxAbs(a) { return Math.max(0, ...a.map((value) => Math.abs(value))); }
export function clean(value) { return Object.is(value, -0) || Math.abs(value) < Number.MIN_VALUE ? 0 : value; }
export function matrixVector(matrix, vector) { return matrix.map((row) => clean(row.reduce((sum, value, index) => sum + value * vector[index], 0))); }
export function transpose(matrix) { return matrix[0].map((_, column) => matrix.map((row) => row[column])); }
export function multiply(left, right) {
  const result = Array.from({ length: left.length }, () => Array(right[0].length).fill(0));
  for (let i = 0; i < left.length; i += 1) for (let k = 0; k < right.length; k += 1) for (let j = 0; j < right[0].length; j += 1) result[i][j] += left[i][k] * right[k][j];
  return result.map((row) => row.map(clean));
}