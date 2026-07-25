export function zeros(rows, columns = rows) {
  return Array.from({ length: rows }, () => Array(columns).fill(0));
}
export function transpose(matrix) {
  return matrix[0].map((_, column) => matrix.map((row) => row[column]));
}
export function multiplyMatrices(left, right) {
  const output = zeros(left.length, right[0].length);
  for (let row = 0; row < left.length; row += 1) {
    for (let column = 0; column < right[0].length; column += 1) {
      let sum = 0;
      for (let index = 0; index < right.length; index += 1) sum += left[row][index] * right[index][column];
      output[row][column] = sum;
    }
  }
  return output;
}
export function multiplyMatrixVector(matrix, vector) {
  return matrix.map((row) => row.reduce((sum, value, index) => sum + value * vector[index], 0));
}
export function scaleMatrix(matrix, factor) {
  return matrix.map((row) => row.map((value) => value * factor));
}
export function addSubmatrix(target, indices, source) {
  indices.forEach((globalRow, localRow) => indices.forEach((globalColumn, localColumn) => {
    target[globalRow][globalColumn] += source[localRow][localColumn];
  }));
}
export function dot(left, right) {
  return left.reduce((sum, value, index) => sum + value * right[index], 0);
}
export function subtractVectors(left, right) {
  return left.map((value, index) => value - right[index]);
}
export function vectorNormInfinity(vector) {
  return vector.reduce((maximum, value) => Math.max(maximum, Math.abs(value)), 0);
}
export function isFiniteMatrix(matrix) {
  return Array.isArray(matrix) && matrix.every((row) => Array.isArray(row) && row.every(Number.isFinite));
}
