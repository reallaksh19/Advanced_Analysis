export function zeros(rows, cols = rows) {
  return Array.from({ length: rows }, () => Array(cols).fill(0));
}

export function transpose(matrix) {
  return matrix[0].map((_, column) => matrix.map(row => row[column]));
}

export function multiplyMatrices(a, b) {
  const result = zeros(a.length, b[0].length);
  for (let i = 0; i < a.length; i += 1) {
    for (let k = 0; k < b.length; k += 1) {
      const aik = a[i][k];
      if (aik === 0) continue;
      for (let j = 0; j < b[0].length; j += 1) result[i][j] += aik * b[k][j];
    }
  }
  return result;
}

export function multiplyMatrixVector(matrix, vector) {
  return matrix.map(row => row.reduce((sum, value, index) => sum + (value * vector[index]), 0));
}

export function addVectors(a, b) {
  return a.map((value, index) => value + b[index]);
}

export function subtractVectors(a, b) {
  return a.map((value, index) => value - b[index]);
}

export function scaleVector(vector, scalar) {
  return vector.map(value => value * scalar);
}

export function transformStiffness(localStiffness, transformGlobalToLocal) {
  const tt = transpose(transformGlobalToLocal);
  return multiplyMatrices(multiplyMatrices(tt, localStiffness), transformGlobalToLocal);
}

export function transformLocalLoadToGlobal(localLoad, transformGlobalToLocal) {
  return multiplyMatrixVector(transpose(transformGlobalToLocal), localLoad);
}
