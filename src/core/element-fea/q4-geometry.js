import { deepFreeze } from '../shared-piping-model/immutable.js';
import { Q4_GAUSS_POINTS } from './integration-points.js';
export function q4ShapeFunctions(xi, eta) {
  return [0.25 * (1 - xi) * (1 - eta), 0.25 * (1 + xi) * (1 - eta), 0.25 * (1 + xi) * (1 + eta), 0.25 * (1 - xi) * (1 + eta)];
}
export function q4NaturalDerivatives(xi, eta) {
  return [
    { dNdxi: -0.25 * (1 - eta), dNdeta: -0.25 * (1 - xi) },
    { dNdxi: 0.25 * (1 - eta), dNdeta: -0.25 * (1 + xi) },
    { dNdxi: 0.25 * (1 + eta), dNdeta: 0.25 * (1 + xi) },
    { dNdxi: -0.25 * (1 + eta), dNdeta: 0.25 * (1 - xi) },
  ];
}
export function q4Jacobian(nodes, naturalDerivatives) {
  const rowXi = naturalDerivatives.reduce((sum, row, index) => [sum[0] + row.dNdxi * nodes[index].x, sum[1] + row.dNdxi * nodes[index].y], [0, 0]);
  const rowEta = naturalDerivatives.reduce((sum, row, index) => [sum[0] + row.dNdeta * nodes[index].x, sum[1] + row.dNdeta * nodes[index].y], [0, 0]);
  return [rowXi, rowEta];
}
export function determinant2(matrix) { return matrix[0][0] * matrix[1][1] - matrix[0][1] * matrix[1][0]; }
export function inverse2(matrix, determinant = determinant2(matrix)) {
  if (!Number.isFinite(determinant) || determinant === 0) throw new TypeError('Q4 Jacobian is singular or non-finite.');
  return [[matrix[1][1] / determinant, -matrix[0][1] / determinant], [-matrix[1][0] / determinant, matrix[0][0] / determinant]];
}
export function q4GlobalDerivatives(naturalDerivatives, inverseJacobian) {
  return naturalDerivatives.map((row) => ({
    dNdx: inverseJacobian[0][0] * row.dNdxi + inverseJacobian[0][1] * row.dNdeta,
    dNdy: inverseJacobian[1][0] * row.dNdxi + inverseJacobian[1][1] * row.dNdeta,
  }));
}
export function q4StrainDisplacementMatrix(derivatives) {
  const B = [Array(8).fill(0), Array(8).fill(0), Array(8).fill(0)];
  derivatives.forEach((row, index) => { const column = 2 * index; B[0][column] = row.dNdx; B[1][column + 1] = row.dNdy; B[2][column] = row.dNdy; B[2][column + 1] = row.dNdx; });
  return B;
}
export function q4GlobalCoordinates(nodes, shapeFunctions) {
  return shapeFunctions.reduce((point, value, index) => ({ x: point.x + value * nodes[index].x, y: point.y + value * nodes[index].y }), { x: 0, y: 0 });
}
export function createQ4PointGeometry(nodes, point) {
  const shapeFunctions = q4ShapeFunctions(point.xi, point.eta); const naturalDerivatives = q4NaturalDerivatives(point.xi, point.eta);
  const jacobian = q4Jacobian(nodes, naturalDerivatives); const determinant = determinant2(jacobian); const inverseJacobian = inverse2(jacobian, determinant);
  const globalDerivatives = q4GlobalDerivatives(naturalDerivatives, inverseJacobian); const B = q4StrainDisplacementMatrix(globalDerivatives);
  return deepFreeze({ ...point, shapeFunctions, naturalDerivatives, jacobian, determinant, inverseJacobian, globalDerivatives, B, globalCoordinates: q4GlobalCoordinates(nodes, shapeFunctions) });
}
export function createQ4IntegrationGeometry(nodes) { return deepFreeze(Q4_GAUSS_POINTS.map((point) => createQ4PointGeometry(nodes, point))); }
