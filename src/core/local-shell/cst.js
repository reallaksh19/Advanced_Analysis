import { scaleMatrix } from './matrix.js';

export function triangleDerivatives(coordinates) {
  const [[x1, y1], [x2, y2], [x3, y3]] = coordinates;
  const determinant = (x2 - x1) * (y3 - y1) - (x3 - x1) * (y2 - y1);
  const derivatives = [
    [(y2 - y3) / determinant, (x3 - x2) / determinant],
    [(y3 - y1) / determinant, (x1 - x3) / determinant],
    [(y1 - y2) / determinant, (x2 - x1) / determinant],
  ];
  return { determinant, area: determinant / 2, derivatives };
}

export function membraneBMatrix(coordinates) {
  const { derivatives } = triangleDerivatives(coordinates);
  const matrix = [Array(6).fill(0), Array(6).fill(0), Array(6).fill(0)];
  for (let node = 0; node < 3; node += 1) {
    const [dx, dy] = derivatives[node];
    matrix[0][2 * node] = dx;
    matrix[1][2 * node + 1] = dy;
    matrix[2][2 * node] = dy;
    matrix[2][2 * node + 1] = dx;
  }
  return matrix;
}

export function membraneStiffness(coordinates, constitutive, area) {
  const b = membraneBMatrix(coordinates);
  const bt = b[0].map((_, column) => b.map((row) => row[column]));
  const db = multiplySmall(constitutive, b);
  return { b, stiffness: scaleMatrix(multiplySmall(bt, db), area) };
}

function multiplySmall(left, right) {
  return left.map((row) => right[0].map((_, column) => (
    row.reduce((total, value, index) => total + value * right[index][column], 0)
  )));
}
