export function finitePositive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}
export function nearlyEqual(left, right, policy) {
  const scale = Math.max(1, Math.abs(left), Math.abs(right));
  return Math.abs(left - right) <= policy.absoluteTolerance + policy.relativeTolerance * scale;
}
export function toleranceLimit(policy, scale) {
  return policy.absoluteTolerance + policy.relativeTolerance * Math.max(1, Math.abs(scale));
}
export function zeros(rows, columns = rows) {
  return Array.from({ length: rows }, () => Array(columns).fill(0));
}
export function isFiniteMatrix(matrix) { return matrix.every((row) => row.every(Number.isFinite)); }
export function isFiniteVector(vector) { return vector.every(Number.isFinite); }
export function maxAbs(values) { return values.reduce((value, item) => Math.max(value, Math.abs(item)), 0); }
export function matrixVector(matrix, vector) {
  return matrix.map((row) => row.reduce((sum, value, index) => sum + value * vector[index], 0));
}
export function subtractVectors(left, right) { return left.map((value, index) => value - right[index]); }
