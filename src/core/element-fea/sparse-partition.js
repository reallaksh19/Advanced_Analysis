import { csrMultiply, createCsrFromRows } from './sparse-csr.js';
import { equationLookup } from './dof-map.js';

export function partitionSparseSystem(system, model) {
  const lookup = equationLookup(system.dofMap);
  const constraints = constraintRows(model, lookup);
  const constrainedDofIndices = constraints.map((row) => row.equation);
  const constrainedSet = new Set(constrainedDofIndices);
  const freeDofIndices = system.dofMap.map((row) => row.equation).filter((equation) => !constrainedSet.has(equation));
  const prescribedValues = constraints.map((row) => row.value);
  const freeAppliedLoad = freeDofIndices.map((equation) => system.appliedLoad[equation]);
  const imposedDisplacementLoad = imposedLoad(system.sparseStiffness, freeDofIndices, constrainedDofIndices, prescribedValues);
  const effectiveFreeLoad = freeAppliedLoad.map((value, index) => value - imposedDisplacementLoad[index]);
  const Kff = extractFreeMatrix(system.sparseStiffness, freeDofIndices, model.solverProfile.tolerances.matrixSymmetryAbsolute);
  return Object.freeze({ constraints, freeEquations: freeDofIndices, constrainedEquations: constrainedDofIndices, freeDofIndices, constrainedDofIndices, prescribedValues, Kff, freeAppliedLoad, imposedDisplacementLoad, effectiveFreeLoad });
}

export function multiplySparseSystem(system, displacement) { return Array.from(csrMultiply(system.sparseStiffness, displacement)); }

function imposedLoad(matrix, free, constrained, prescribed) {
  const constrainedValues = new Map(constrained.map((equation, index) => [equation, prescribed[index]]));
  return free.map((globalRow) => {
    let value = 0;
    for (let index = matrix.rowPointers[globalRow]; index < matrix.rowPointers[globalRow + 1]; index += 1) {
      const prescribedValue = constrainedValues.get(matrix.columnIndices[index]);
      if (prescribedValue !== undefined) value += matrix.values[index] * prescribedValue;
    }
    return value;
  });
}

function extractFreeMatrix(matrix, free, tolerance) {
  const localIndex = new Map(free.map((equation, index) => [equation, index]));
  const rows = free.map((globalRow) => {
    const row = [];
    for (let index = matrix.rowPointers[globalRow]; index < matrix.rowPointers[globalRow + 1]; index += 1) {
      const localColumn = localIndex.get(matrix.columnIndices[index]);
      if (localColumn !== undefined) row.push({ column: localColumn, value: matrix.values[index] });
    }
    return row;
  });
  return createCsrFromRows(rows, free.length, tolerance);
}

function constraintRows(model, lookup) {
  const fixed = model.restraints.map((row) => ({ ...row, constraintType: 'FIXED_ZERO', equation: lookup.get(`${row.nodeId}:${row.component}`) }));
  const prescribed = model.prescribedDisplacements.map((row) => ({ ...row, constraintType: 'PRESCRIBED', equation: lookup.get(`${row.nodeId}:${row.component}`) }));
  return [...fixed, ...prescribed].sort((left, right) => left.equation - right.equation);
}
