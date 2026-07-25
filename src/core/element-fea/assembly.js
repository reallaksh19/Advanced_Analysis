import { deepFreeze } from '../shared-piping-model/immutable.js';
import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { addSubmatrix, multiplyMatrixVector, subtractVectors, zeros } from './matrix.js';
import { createDofMap, elementEquationIndices, equationLookup } from './dof-map.js';
import { createElementOperator, equivalentElementEdgeLoad } from './element-dispatch.js';

export function assembleContinuumSystem(model, loadCase) {
  const dofMap = createDofMap(model.nodes);
  if (dofMap.length > model.solverProfile.referenceBackendMaxDofs) throw new RangeError('Model exceeds the qualified dense reference backend DOF limit.');
  const lookup = equationLookup(dofMap); const nodeMap = new Map(model.nodes.map((row) => [row.nodeId, row])); const materialMap = new Map(model.materials.map((row) => [row.materialId, row]));
  const stiffness = zeros(dofMap.length);
  const operators = model.elements.map((element) => { const operator = createElementOperator(element, nodeMap, materialMap.get(element.materialId), model.solverProfile); const indices = elementEquationIndices(element, lookup); addSubmatrix(stiffness, indices, operator.stiffness); return { element, operator, indices }; });
  const loadEvidence = assembleLoads(model, loadCase, lookup, nodeMap); const assembledSystemHash = semanticHash({ dofMap, stiffness, appliedLoad: loadEvidence.appliedLoad });
  return deepFreeze({ dofMap, stiffness, operators, assembledSystemHash, ...loadEvidence });
}

export function partitionSystem(system, model) {
  const lookup = equationLookup(system.dofMap); const constraints = constraintRows(model, lookup); const constrainedEquations = constraints.map((row) => row.equation); const constrainedSet = new Set(constrainedEquations);
  const freeEquations = system.dofMap.map((row) => row.equation).filter((equation) => !constrainedSet.has(equation)); const prescribedValues = constraints.map((row) => row.value);
  const Kff = submatrix(system.stiffness, freeEquations, freeEquations); const Kfc = submatrix(system.stiffness, freeEquations, constrainedEquations); const freeAppliedLoad = freeEquations.map((index) => system.appliedLoad[index]);
  const imposedDisplacementLoad = multiplyMatrixVector(Kfc, prescribedValues); const effectiveFreeLoad = subtractVectors(freeAppliedLoad, imposedDisplacementLoad);
  return deepFreeze({ constraints, freeEquations, constrainedEquations, prescribedValues, Kff, Kfc, freeAppliedLoad, imposedDisplacementLoad, effectiveFreeLoad });
}

export function reconstructDisplacement(size, partition, freeValues) {
  const displacement = Array(size).fill(0); partition.freeEquations.forEach((equation, index) => { displacement[equation] = freeValues[index]; }); partition.constrainedEquations.forEach((equation, index) => { displacement[equation] = partition.prescribedValues[index]; }); return displacement;
}

function assembleLoads(model, loadCase, lookup, nodeMap) {
  const directNodalLoads = Array(model.nodes.length * 2).fill(0); const equivalentEdgeLoads = Array(model.nodes.length * 2).fill(0);
  const directNodalLoadEvidence = loadCase.nodalForces.map((load) => { const uxEquation = lookup.get(`${load.nodeId}:UX`); const uyEquation = lookup.get(`${load.nodeId}:UY`); directNodalLoads[uxEquation] += load.fx; directNodalLoads[uyEquation] += load.fy; return { loadId: load.loadId, nodeId: load.nodeId, uxEquation, uyEquation, fx: load.fx, fy: load.fy }; });
  const edgeLoadEvidence = loadCase.edgeLoads.map((load) => applyEdgeLoad(model, load, lookup, nodeMap, equivalentEdgeLoads)); const appliedLoad = directNodalLoads.map((value, index) => value + equivalentEdgeLoads[index]);
  return { directNodalLoads, directNodalLoadEvidence, equivalentEdgeLoads, edgeLoadEvidence, appliedLoad };
}
function applyEdgeLoad(model, load, lookup, nodeMap, target) {
  const element = model.elements.find((row) => row.elementId === load.elementId); const evidence = equivalentElementEdgeLoad(element, load, nodeMap, model.solverProfile); const indices = elementEquationIndices(element, lookup);
  evidence.vector.forEach((value, index) => { target[indices[index]] += value; }); return element.type === 'Q4' ? { loadId: load.loadId, elementId: element.elementId, elementType: element.type, type: load.type, ...evidence } : { loadId: load.loadId, elementId: element.elementId, type: load.type, ...evidence };
}
function constraintRows(model, lookup) {
  const rows = [...model.restraints.map((row) => ({ ...row, constraintType: 'FIXED_ZERO', equation: lookup.get(`${row.nodeId}:${row.component}`) })), ...model.prescribedDisplacements.map((row) => ({ ...row, constraintType: 'PRESCRIBED', equation: lookup.get(`${row.nodeId}:${row.component}`) }))];
  return rows.sort((left, right) => left.equation - right.equation);
}
function submatrix(matrix, rows, columns) { return rows.map((row) => columns.map((column) => matrix[row][column])); }
