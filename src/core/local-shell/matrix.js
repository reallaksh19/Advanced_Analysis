import { cleanNumber, maxAbs } from './numeric.js';

export function zeros(rows, columns) {
  return Array.from({ length: rows }, () => Array(columns).fill(0));
}

export function identity(size) {
  const result = zeros(size, size);
  for (let index = 0; index < size; index += 1) result[index][index] = 1;
  return result;
}

export function transpose(matrix) {
  return matrix[0].map((_, column) => matrix.map((row) => row[column]));
}

export function multiply(left, right) {
  const result = zeros(left.length, right[0].length);
  for (let row = 0; row < left.length; row += 1) {
    for (let column = 0; column < right[0].length; column += 1) {
      let value = 0;
      for (let inner = 0; inner < right.length; inner += 1) value += left[row][inner] * right[inner][column];
      result[row][column] = cleanNumber(value);
    }
  }
  return result;
}

export function matrixVector(matrix, vector) {
  return matrix.map((row) => cleanNumber(row.reduce((total, value, index) => total + value * vector[index], 0)));
}

export function addMatrices(left, right) {
  return left.map((row, i) => row.map((value, j) => cleanNumber(value + right[i][j])));
}

export function scaleMatrix(matrix, factor) {
  return matrix.map((row) => row.map((value) => cleanNumber(value * factor)));
}

export function quadratic(vector, matrix) {
  const product = matrixVector(matrix, vector);
  return cleanNumber(vector.reduce((total, value, index) => total + value * product[index], 0));
}

export function symmetryResidual(matrix) {
  let residual = 0;
  for (let row = 0; row < matrix.length; row += 1) {
    for (let column = row + 1; column < matrix.length; column += 1) {
      residual = Math.max(residual, Math.abs(matrix[row][column] - matrix[column][row]));
    }
  }
  return cleanNumber(residual);
}

export function matrixScale(matrix) {
  return Math.max(1, maxAbs(matrix));
}
