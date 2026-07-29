import { LafeaLinearSolveError } from './errors.js';

/**
 * Elimination/partitioning for fixed and prescribed DOFs (spec §11:
 * "Elimination/partitioning for fixed and prescribed DOFs; linear springs
 * added consistently."). A prescribed DOF is removed from the solved
 * system; its coupling terms move to the free-DOF right-hand side. A
 * linear spring is not special-cased here — it is an ordinary diagonal
 * contribution added during `assembleSparseSymmetric` (see
 * `springContribution`), so there is exactly one path by which a stiffness
 * term enters the matrix.
 */
export function partitionSparseSystem(matrix, forceVector, prescribedMap) {
  const { size, rows } = matrix;
  const freeIndices = [];
  for (let i = 0; i < size; i += 1) if (!prescribedMap.has(i)) freeIndices.push(i);
  const globalToFree = new Map(freeIndices.map((globalIndex, freeIndex) => [globalIndex, freeIndex]));
  const freeRows = freeIndices.map(() => new Map());
  const rhs = freeIndices.map((globalIndex) => forceVector[globalIndex]);

  for (let row = 0; row < size; row += 1) {
    for (const [column, value] of rows[row]) {
      const rowFree = globalToFree.get(row);
      const columnFree = globalToFree.get(column);
      if (rowFree !== undefined && columnFree !== undefined) {
        freeRows[rowFree].set(columnFree, (freeRows[rowFree].get(columnFree) ?? 0) + value);
      } else if (rowFree !== undefined && columnFree === undefined) {
        rhs[rowFree] -= value * (prescribedMap.get(column) ?? 0);
      } else if (columnFree !== undefined && rowFree === undefined && row !== column) {
        rhs[columnFree] -= value * (prescribedMap.get(row) ?? 0);
      }
    }
  }
  const freeMatrix = Object.freeze({ size: freeIndices.length, rows: Object.freeze(freeRows.map((row) => Object.freeze(row))) });
  return Object.freeze({ freeMatrix, freeIndices: Object.freeze(freeIndices), rightHandSide: Object.freeze(rhs) });
}

/** Reassemble a full-size displacement vector from a free-DOF solution and the prescribed values. */
export function reconstructFullDisplacement(size, freeIndices, freeSolution, prescribedMap) {
  if (freeIndices.length !== freeSolution.length) throw new LafeaLinearSolveError('freeIndices and freeSolution length mismatch', 'INVALID_RECONSTRUCTION');
  const full = new Array(size).fill(0);
  freeIndices.forEach((globalIndex, freeIndex) => { full[globalIndex] = freeSolution[freeIndex]; });
  for (const [globalIndex, value] of prescribedMap) full[globalIndex] = value;
  return full;
}

/** A linear spring's diagonal-only stiffness contribution, in `assembleSparseSymmetric` contribution form. */
export function springContribution(dofIndex, stiffness) {
  if (!(stiffness >= 0)) throw new LafeaLinearSolveError('Spring stiffness must be non-negative', 'INVALID_SPRING_STIFFNESS');
  return Object.freeze({ indices: Object.freeze([dofIndex]), localMatrix: Object.freeze([Object.freeze([stiffness])]) });
}
