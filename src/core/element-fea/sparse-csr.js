import { semanticHash } from '../shared-piping-model/canonical-json.js';

export const CSR_STORAGE_ID = 'CSR_FULL_V1';

export function buildCsrMatrix(size, contributions, limits, symmetryTolerance) {
  assertSize(size);
  const rows = structuralRows(size, contributions);
  const predictedNonzeros = rows.reduce((sum, row) => sum + row.length, 0);
  const predictedStorageBytes = estimateCsrStorageBytes(size, predictedNonzeros);
  const capacityEvidence = qualifyCapacity(size, predictedNonzeros, predictedStorageBytes, limits);
  const pattern = allocatePattern(rows, predictedNonzeros);
  const values = assembleValues(pattern, orderedContributions(contributions));
  const compact = compactZeroEntries(pattern.rowPointers, pattern.columnIndices, values, symmetryTolerance);
  const evidence = createCsrEvidence(size, compact, symmetryTolerance, capacityEvidence);
  return Object.freeze({ storageIdentity: CSR_STORAGE_ID, rowCount: size, columnCount: size, ...compact, evidence, capacityEvidence });
}

export function csrMultiply(matrix, vector) {
  if (!Array.isArray(vector) && !(vector instanceof Float64Array)) throw new TypeError('CSR vector is required.');
  if (vector.length !== matrix.columnCount) throw new TypeError('CSR vector length mismatch.');
  const output = new Float64Array(matrix.rowCount);
  for (let row = 0; row < matrix.rowCount; row += 1) {
    let value = 0;
    for (let index = matrix.rowPointers[row]; index < matrix.rowPointers[row + 1]; index += 1) value += matrix.values[index] * vector[matrix.columnIndices[index]];
    output[row] = value;
  }
  return output;
}

export function csrDiagonal(matrix) {
  const diagonal = new Float64Array(matrix.rowCount);
  for (let row = 0; row < matrix.rowCount; row += 1) {
    const index = findColumn(matrix, row, row);
    if (index < 0) throw new TypeError(`CSR row ${row} is missing its diagonal.`);
    diagonal[row] = matrix.values[index];
  }
  return diagonal;
}

export function createCsrFromRows(rows, columnCount = rows.length, symmetryTolerance = 0) {
  const rowPointers = new Int32Array(rows.length + 1);
  const columns = []; const values = [];
  rows.forEach((row, rowIndex) => {
    const ordered = [...row].sort((a, b) => a.column - b.column);
    ordered.forEach((entry) => { columns.push(entry.column); values.push(entry.value); });
    rowPointers[rowIndex + 1] = columns.length;
  });
  const compact = { rowPointers, columnIndices: Int32Array.from(columns), values: Float64Array.from(values) };
  const capacityEvidence = { status: 'ACCEPTED', requestedDofs: rows.length, predictedNonzeroCount: columns.length, predictedStorageBytes: estimateCsrStorageBytes(rows.length, columns.length), approvedLimits: null };
  const evidence = createCsrEvidence(rows.length, compact, symmetryTolerance, capacityEvidence, columnCount);
  return Object.freeze({ storageIdentity: CSR_STORAGE_ID, rowCount: rows.length, columnCount, ...compact, evidence, capacityEvidence });
}

export function estimateCsrStorageBytes(rowCount, nonzeroCount) { return 4 * (rowCount + 1) + 4 * nonzeroCount + 8 * nonzeroCount; }

function structuralRows(size, contributions) {
  const sets = Array.from({ length: size }, (_, row) => new Set([row]));
  orderedContributions(contributions).forEach(({ indices, stiffness }) => {
    assertContribution(indices, stiffness, size);
    for (let localRow = 0; localRow < indices.length; localRow += 1) for (let localColumn = 0; localColumn < indices.length; localColumn += 1) sets[indices[localRow]].add(indices[localColumn]);
  });
  return sets.map((set) => [...set].sort((a, b) => a - b));
}

function allocatePattern(rows, nonzeroCount) {
  const rowPointers = new Int32Array(rows.length + 1); const columnIndices = new Int32Array(nonzeroCount);
  let cursor = 0;
  rows.forEach((row, rowIndex) => { row.forEach((column) => { columnIndices[cursor] = column; cursor += 1; }); rowPointers[rowIndex + 1] = cursor; });
  return { rowPointers, columnIndices };
}

function assembleValues(pattern, contributions) {
  const values = new Float64Array(pattern.columnIndices.length);
  contributions.forEach(({ indices, stiffness }) => {
    for (let localRow = 0; localRow < indices.length; localRow += 1) for (let localColumn = 0; localColumn < indices.length; localColumn += 1) {
      const position = findPatternPosition(pattern, indices[localRow], indices[localColumn]);
      const value = stiffness[localRow][localColumn];
      if (!Number.isFinite(value)) throw new TypeError('Sparse contribution contains a non-finite coefficient.');
      values[position] += value;
    }
  });
  return values;
}

function compactZeroEntries(rowPointers, columnIndices, values, tolerance) {
  const pattern = { rowPointers, columnIndices }; const compactRows = []; const compactColumns = []; const compactValues = [];
  for (let row = 0; row < rowPointers.length - 1; row += 1) {
    compactRows.push(compactColumns.length);
    for (let index = rowPointers[row]; index < rowPointers[row + 1]; index += 1) {
      const value = values[index]; const column = columnIndices[index];
      if (!Number.isFinite(value)) throw new TypeError('Assembled CSR coefficient is non-finite.');
      if (column !== row && removableSymmetricPair(pattern, values, row, column, value, tolerance)) continue;
      if (column !== row && value === 0) throw new TypeError(`CSR off-diagonal (${row},${column}) cannot retain an explicit zero.`);
      compactColumns.push(column); compactValues.push(value);
    }
  }
  compactRows.push(compactColumns.length);
  return { rowPointers: Int32Array.from(compactRows), columnIndices: Int32Array.from(compactColumns), values: Float64Array.from(compactValues) };
}

function removableSymmetricPair(pattern, values, row, column, value, tolerance) {
  const paired = binarySearch(pattern.columnIndices, pattern.rowPointers[column], pattern.rowPointers[column + 1], row);
  if (paired < 0) throw new TypeError(`CSR transpose pattern is missing for (${row},${column}).`);
  const pairedValue = values[paired];
  if (!Number.isFinite(pairedValue)) throw new TypeError('Assembled CSR transpose coefficient is non-finite.');
  return Math.max(Math.abs(value), Math.abs(pairedValue)) <= tolerance;
}

function createCsrEvidence(size, matrix, tolerance, capacityEvidence, columnCount = size) {
  validateFiniteValues(matrix.values);
  const symmetryEvidence = validateSymmetry(size, matrix, tolerance, columnCount);
  const diagonalEvidence = validateDiagonal(size, matrix);
  const identity = {
    storageIdentity: CSR_STORAGE_ID, rowCount: size, columnCount, nonzeroCount: matrix.values.length,
    rowPointersHash: semanticHash(Array.from(matrix.rowPointers)), columnIndicesHash: semanticHash(Array.from(matrix.columnIndices)), valuesHash: semanticHash(Array.from(matrix.values)),
  };
  return Object.freeze({ ...identity, matrixIdentity: semanticHash(identity), symmetryEvidence, diagonalEvidence, estimatedStorageBytes: estimateCsrStorageBytes(size, matrix.values.length), capacityEvidence });
}

function validateFiniteValues(values) {
  for (let index = 0; index < values.length; index += 1) if (!Number.isFinite(values[index])) throw new TypeError(`CSR coefficient ${index} is non-finite.`);
}

function validateSymmetry(size, matrix, tolerance, columnCount) {
  if (size !== columnCount) return Object.freeze({ status: 'NOT_APPLICABLE_RECTANGULAR', maximumAbsoluteDifference: null });
  let maximumAbsoluteDifference = 0;
  for (let row = 0; row < size; row += 1) for (let index = matrix.rowPointers[row]; index < matrix.rowPointers[row + 1]; index += 1) {
    const column = matrix.columnIndices[index]; const paired = findRaw(matrix, column, row);
    if (paired < 0) throw new TypeError(`CSR transpose entry is missing for (${row},${column}).`);
    const difference = Math.abs(matrix.values[index] - matrix.values[paired]);
    if (difference > tolerance) throw new TypeError(`CSR symmetry tolerance exceeded at (${row},${column}).`);
    maximumAbsoluteDifference = Math.max(maximumAbsoluteDifference, difference);
  }
  return Object.freeze({ status: 'QUALIFIED_SYMMETRIC', tolerance, maximumAbsoluteDifference });
}

function validateDiagonal(size, matrix) {
  if (size === 0) return Object.freeze({ status: 'EMPTY_MATRIX', minimum: null, maximum: null });
  let minimum = Infinity; let maximum = -Infinity;
  for (let row = 0; row < size; row += 1) {
    const index = findRaw(matrix, row, row);
    if (index < 0) throw new TypeError(`CSR row ${row} is missing its diagonal.`);
    const value = matrix.values[index];
    if (!Number.isFinite(value)) throw new TypeError(`CSR diagonal ${row} is non-finite.`);
    if (value === 0) throw new TypeError(`CSR diagonal ${row} cannot be an explicit zero.`);
    minimum = Math.min(minimum, value); maximum = Math.max(maximum, value);
  }
  return Object.freeze({ status: 'DIAGONAL_PRESENT_FINITE_NONZERO', minimum, maximum });
}

function qualifyCapacity(dofs, nonzeros, bytes, limits) {
  if (!limits) throw new TypeError('Sparse capacity limits are required.');
  const approvedLimits = { maximumDofs: limits.maximumDofs, maximumNonzeros: limits.maximumNonzeros, maximumEstimatedStorageBytes: limits.maximumEstimatedStorageBytes };
  const status = dofs <= approvedLimits.maximumDofs && nonzeros <= approvedLimits.maximumNonzeros && bytes <= approvedLimits.maximumEstimatedStorageBytes ? 'ACCEPTED' : 'REJECTED';
  const evidence = Object.freeze({ status, requestedDofs: dofs, predictedNonzeroCount: nonzeros, predictedStorageBytes: bytes, approvedLimits });
  if (status !== 'ACCEPTED') { const error = new RangeError('Sparse capacity qualification failed before matrix allocation.'); error.capacityEvidence = evidence; throw error; }
  return evidence;
}

function orderedContributions(value) { const rows=[...value]; if(rows.some((row)=>typeof row.contributionIdentity!=='string'||!row.contributionIdentity))throw new TypeError('Sparse contribution identity is required.'); rows.sort((a,b)=>compare(a.contributionIdentity,b.contributionIdentity)); if(rows.some((row,index)=>index>0&&row.contributionIdentity===rows[index-1].contributionIdentity))throw new TypeError('Sparse contribution identities must be unique.'); return rows; }
function assertSize(size) { if (!Number.isInteger(size) || size < 0) throw new TypeError('CSR size must be a nonnegative integer.'); }
function assertContribution(indices, stiffness, size) { if (!Array.isArray(indices) || !indices.length || indices.some((value) => !Number.isInteger(value) || value < 0 || value >= size)) throw new TypeError('Sparse contribution indices are invalid.'); if (!Array.isArray(stiffness) || stiffness.length !== indices.length || stiffness.some((row) => !Array.isArray(row) || row.length !== indices.length)) throw new TypeError('Sparse contribution matrix dimensions are invalid.'); }
function findPatternPosition(pattern, row, column) { const index = binarySearch(pattern.columnIndices, pattern.rowPointers[row], pattern.rowPointers[row + 1], column); if (index < 0) throw new TypeError('Sparse contribution is outside the frozen structural pattern.'); return index; }
function findColumn(matrix, row, column) { return binarySearch(matrix.columnIndices, matrix.rowPointers[row], matrix.rowPointers[row + 1], column); }
function findRaw(matrix, row, column) { if (row < 0 || row >= matrix.rowPointers.length - 1) return -1; return binarySearch(matrix.columnIndices, matrix.rowPointers[row], matrix.rowPointers[row + 1], column); }
function binarySearch(values, start, end, target) { let low = start; let high = end - 1; while (low <= high) { const middle = (low + high) >> 1; if (values[middle] === target) return middle; if (values[middle] < target) low = middle + 1; else high = middle - 1; } return -1; }
function compare(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
