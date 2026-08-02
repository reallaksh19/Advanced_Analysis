import { canonicalNumber } from './numeric.js';

export const DENSE_STIFFNESS_DOF_LIMIT = 1536;
export const SPARSE_STIFFNESS_SCHEMA = 'local-continuum-symmetric-csr/v1';
export const SPARSE_STIFFNESS_STORAGE = 'CSR_FULL_SYMMETRIC';

export function assembleSymmetricCsr(size, elementEvidence, dofIndex) {
  if (!Number.isInteger(size) || size < 1) {
    throw new TypeError('Sparse stiffness size must be a positive integer.');
  }
  const rows = Array.from({ length: size }, () => new Map());
  for (const element of elementEvidence) {
    const indices = element.localDofOrdering.map((identity) => dofIndex.get(identity));
    if (indices.some((index) => !Number.isInteger(index))) {
      throw new TypeError('Sparse stiffness element references an unknown DOF.');
    }
    for (let localRow = 0; localRow < indices.length; localRow += 1) {
      for (let localColumn = 0; localColumn < indices.length; localColumn += 1) {
        const row = rows[indices[localRow]];
        const column = indices[localColumn];
        const value = element.localStiffnessMatrix[localRow][localColumn];
        row.set(column, (row.get(column) ?? 0) + value);
      }
    }
  }
  return finalizeRows(rows);
}

export function restrictSymmetricCsr(matrix, retainedIndices) {
  requireCsr(matrix);
  if (!Array.isArray(retainedIndices) || retainedIndices.length < 1) {
    throw new TypeError('Sparse restriction requires retained indices.');
  }
  const local = new Int32Array(matrix.size);
  local.fill(-1);
  retainedIndices.forEach((globalIndex, index) => {
    if (!Number.isInteger(globalIndex) || globalIndex < 0 || globalIndex >= matrix.size
      || local[globalIndex] !== -1) {
      throw new TypeError('Sparse restriction indices are invalid or duplicated.');
    }
    local[globalIndex] = index;
  });
  const rows = Array.from({ length: retainedIndices.length }, () => new Map());
  retainedIndices.forEach((globalRow, localRow) => {
    for (let offset = matrix.rowPointers[globalRow];
      offset < matrix.rowPointers[globalRow + 1]; offset += 1) {
      const localColumn = local[matrix.columnIndices[offset]];
      if (localColumn >= 0) rows[localRow].set(localColumn, matrix.values[offset]);
    }
  });
  return finalizeRows(rows);
}

export function sparseMatrixVector(matrix, vector) {
  return sparseMatrixVectorRaw(matrix, vector).map((value) =>
    canonicalNumber(value, 'sparse matrix-vector product'));
}

export function sparseMatrixVectorRaw(matrix, vector) {
  requireCsr(matrix);
  if (!Array.isArray(vector) || vector.length !== matrix.size) {
    throw new TypeError('Sparse matrix-vector dimensions differ.');
  }
  const output = Array(matrix.size).fill(0);
  for (let row = 0; row < matrix.size; row += 1) {
    let value = 0;
    for (let offset = matrix.rowPointers[row];
      offset < matrix.rowPointers[row + 1]; offset += 1) {
      value += matrix.values[offset] * vector[matrix.columnIndices[offset]];
    }
    output[row] = value;
  }
  return output;
}

export function sparseMatrixScale(matrix) {
  requireCsr(matrix);
  let scale = 0;
  for (const value of matrix.values) scale = Math.max(scale, Math.abs(value));
  return canonicalNumber(scale, 'sparse matrix scale');
}

export function sparseSymmetryResidual(matrix) {
  requireCsr(matrix);
  let residual = 0;
  for (let row = 0; row < matrix.size; row += 1) {
    for (let offset = matrix.rowPointers[row];
      offset < matrix.rowPointers[row + 1]; offset += 1) {
      const column = matrix.columnIndices[offset];
      if (column <= row) continue;
      residual = Math.max(
        residual,
        Math.abs(matrix.values[offset] - sparseValueAt(matrix, column, row)),
      );
    }
  }
  return canonicalNumber(residual, 'sparse symmetry residual');
}

function finalizeRows(rows) {
  const rowPointers = [0];
  const columnIndices = [];
  const values = [];
  const diagonal = Array(rows.length).fill(0);
  rows.forEach((row, rowIndex) => {
    const entries = [...row.entries()]
      .filter(([, value]) => value !== 0)
      .sort((left, right) => left[0] - right[0]);
    for (const [column, inputValue] of entries) {
      if (!Number.isInteger(column) || column < 0 || column >= rows.length) {
        throw new TypeError('Sparse stiffness column is outside the matrix.');
      }
      const value = canonicalNumber(inputValue, 'sparse stiffness value');
      columnIndices.push(column);
      values.push(value);
      if (column === rowIndex) diagonal[rowIndex] = value;
    }
    rowPointers.push(values.length);
  });
  return Object.freeze({
    schema: SPARSE_STIFFNESS_SCHEMA,
    storage: SPARSE_STIFFNESS_STORAGE,
    size: rows.length,
    rowPointers: Object.freeze(rowPointers),
    columnIndices: Object.freeze(columnIndices),
    values: Object.freeze(values),
    diagonal: Object.freeze(diagonal.map((value) =>
      canonicalNumber(value, 'sparse stiffness diagonal'))),
    nonzeroCount: values.length,
  });
}

function sparseValueAt(matrix, row, column) {
  let low = matrix.rowPointers[row];
  let high = matrix.rowPointers[row + 1] - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const actual = matrix.columnIndices[middle];
    if (actual === column) return matrix.values[middle];
    if (actual < column) low = middle + 1;
    else high = middle - 1;
  }
  return 0;
}

function requireCsr(matrix) {
  if (!matrix || matrix.schema !== SPARSE_STIFFNESS_SCHEMA
    || matrix.storage !== SPARSE_STIFFNESS_STORAGE
    || !Number.isInteger(matrix.size) || matrix.size < 1
    || !Array.isArray(matrix.rowPointers)
    || matrix.rowPointers.length !== matrix.size + 1
    || !Array.isArray(matrix.columnIndices)
    || !Array.isArray(matrix.values)
    || matrix.columnIndices.length !== matrix.values.length
    || matrix.nonzeroCount !== matrix.values.length
    || !Array.isArray(matrix.diagonal)
    || matrix.diagonal.length !== matrix.size) {
    throw new TypeError('Sparse stiffness contract is invalid.');
  }
}
