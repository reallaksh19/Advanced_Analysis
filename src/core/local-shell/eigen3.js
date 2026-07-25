import { identity } from './matrix.js';
import { cleanNumber } from './numeric.js';

export function symmetricEigen3(source) {
  const matrix = source.map((row) => [...row]);
  const vectors = identity(3);
  for (let sweep = 0; sweep < 32; sweep += 1) {
    const [p, q, magnitude] = largestOffDiagonal(matrix);
    if (magnitude === 0) break;
    rotate(matrix, vectors, p, q);
  }
  const pairs = [0, 1, 2].map((index) => ({
    value: cleanNumber(matrix[index][index]),
    vector: vectors.map((row) => cleanNumber(row[index])),
    index,
  }));
  pairs.sort((left, right) => right.value - left.value || left.index - right.index);
  return {
    values: pairs.map((pair) => pair.value),
    vectors: pairs.map((pair) => pair.vector),
  };
}

function largestOffDiagonal(matrix) {
  const candidates = [[0, 1], [0, 2], [1, 2]];
  let selected = [0, 1, Math.abs(matrix[0][1])];
  for (const [p, q] of candidates.slice(1)) {
    const magnitude = Math.abs(matrix[p][q]);
    if (magnitude > selected[2]) selected = [p, q, magnitude];
  }
  return selected;
}

function rotate(matrix, vectors, p, q) {
  const app = matrix[p][p];
  const aqq = matrix[q][q];
  const apq = matrix[p][q];
  if (apq === 0) return;
  const tau = (aqq - app) / (2 * apq);
  const tangent = Math.sign(tau || 1) / (Math.abs(tau) + Math.sqrt(1 + tau ** 2));
  const cosine = 1 / Math.sqrt(1 + tangent ** 2);
  const sine = tangent * cosine;
  updateMatrix(matrix, p, q, cosine, sine);
  updateVectors(vectors, p, q, cosine, sine);
}

function updateMatrix(matrix, p, q, cosine, sine) {
  const app = matrix[p][p];
  const aqq = matrix[q][q];
  const apq = matrix[p][q];
  matrix[p][p] = cosine ** 2 * app - 2 * sine * cosine * apq + sine ** 2 * aqq;
  matrix[q][q] = sine ** 2 * app + 2 * sine * cosine * apq + cosine ** 2 * aqq;
  matrix[p][q] = 0;
  matrix[q][p] = 0;
  for (let index = 0; index < 3; index += 1) {
    if (index === p || index === q) continue;
    const aip = matrix[index][p];
    const aiq = matrix[index][q];
    matrix[index][p] = matrix[p][index] = cosine * aip - sine * aiq;
    matrix[index][q] = matrix[q][index] = sine * aip + cosine * aiq;
  }
}

function updateVectors(vectors, p, q, cosine, sine) {
  for (let row = 0; row < 3; row += 1) {
    const vip = vectors[row][p];
    const viq = vectors[row][q];
    vectors[row][p] = cosine * vip - sine * viq;
    vectors[row][q] = sine * vip + cosine * viq;
  }
}
