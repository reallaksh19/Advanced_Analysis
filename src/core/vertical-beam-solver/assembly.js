import { deepFreeze } from '../shared-piping-model/index.js';
import { FORMULA_IDS } from './constants.js';
import {
  eulerBernoulliElementStiffness, eulerBernoulliNodePointLoad,
  eulerBernoulliUniformLoadVector,
} from './element-formulas.js';
import { isFiniteMatrix, isFiniteVector, zeros } from './numeric.js';

export function assembleVerticalBeamSystem(pathCase) {
  const size = pathCase.dofMap.length;
  const matrix = zeros(size), vector = Array(size).fill(0);
  const indexByDof = new Map(pathCase.dofMap.map((row) => [row.dofId, row.index]));
  const nodeById = new Map(pathCase.nodes.map((row) => [row.nodeId, row]));
  const elementAssemblies = pathCase.elements.map((element) => assembleElement(
    element, pathCase.loadVectorRecords, nodeById, indexByDof, matrix, vector,
  ));
  const pointAssemblies = pathCase.loadVectorRecords.filter((row) => row.nodeId)
    .map((row) => assemblePoint(row, nodeById, indexByDof, vector));
  const constrainedDofIndices = pathCase.constraints.map((row) => indexByDof.get(row.constrainedDofId)).sort((a, b) => a - b);
  const constrainedSet = new Set(constrainedDofIndices);
  const freeDofIndices = Array.from({ length: size }, (_, index) => index).filter((index) => !constrainedSet.has(index));
  return deepFreeze({
    formulaId: FORMULA_IDS.GLOBAL_ASSEMBLY, formulaVersion: '1.0.0',
    matrix, vector, matrixDimensions: { rows: size, columns: size },
    freeDofIndices, constrainedDofIndices,
    freeDofCount: freeDofIndices.length, constrainedDofCount: constrainedDofIndices.length,
    elementAssemblies, pointAssemblies,
    finite: isFiniteMatrix(matrix) && isFiniteVector(vector),
  });
}

export function partitionFreeSystem(assembly) {
  const free = assembly.freeDofIndices;
  return {
    matrix: free.map((row) => free.map((column) => assembly.matrix[row][column])),
    vector: free.map((row) => assembly.vector[row]),
  };
}

function assembleElement(element, loadRecords, nodeById, indexByDof, globalMatrix, globalVector) {
  const start = nodeById.get(element.startNodeId), end = nodeById.get(element.endNodeId);
  const indices = [start.verticalDofId, start.rotationDofId, end.verticalDofId, end.rotationDofId].map((id) => indexByDof.get(id));
  const stiffness = eulerBernoulliElementStiffness(element.lengthM, element.flexuralRigidityNm2);
  const rows = loadRecords.filter((row) => row.elementId === element.elementId);
  const loadVectors = rows.map((row) => eulerBernoulliUniformLoadVector(row.forcePerLengthNM, element.lengthM));
  const localLoadVector = loadVectors.reduce((sum, row) => sum.map((value, index) => value + row.vector[index]), [0, 0, 0, 0]);
  addMatrix(globalMatrix, stiffness.matrix, indices);
  addVector(globalVector, localLoadVector, indices);
  return deepFreeze({
    elementId: element.elementId, dofIndices: indices, stiffness,
    loadRecordIds: rows.map((row) => row.loadRecordId), localLoadVector,
    loadFormulaTraces: loadVectors,
  });
}

function assemblePoint(record, nodeById, indexByDof, globalVector) {
  const node = nodeById.get(record.nodeId), index = indexByDof.get(node.verticalDofId);
  const trace = eulerBernoulliNodePointLoad(record.pointForceN, node.nodeId);
  globalVector[index] += record.pointForceN;
  return deepFreeze({ loadRecordId: record.loadRecordId, primitiveId: record.primitiveId, dofIndex: index, trace });
}
function addMatrix(target, local, indices) {
  indices.forEach((row, localRow) => indices.forEach((column, localColumn) => {
    target[row][column] += local[localRow][localColumn];
  }));
}
function addVector(target, local, indices) { indices.forEach((index, localIndex) => { target[index] += local[localIndex]; }); }
