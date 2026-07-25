import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { createDofMap, elementEquationIndices, equationLookup } from './dof-map.js';
import { createElementOperator, equivalentElementEdgeLoad } from './element-dispatch.js';
import { buildCsrMatrix } from './sparse-csr.js';

export function assembleSparseContinuumSystem(model, loadCase) {
  const dofMap = createDofMap(model.nodes);
  assertDofCapacity(dofMap.length, model.solverProfile);
  const lookup = equationLookup(dofMap);
  const nodeMap = new Map(model.nodes.map((row) => [row.nodeId, row]));
  const materialMap = new Map(model.materials.map((row) => [row.materialId, row]));
  const operators = createOperators(model, lookup, nodeMap, materialMap);
  const contributions = operators.map((row) => ({ contributionIdentity: row.element.elementId, indices: row.indices, stiffness: row.operator.stiffness }));
  const sparseStiffness = buildCsrMatrix(dofMap.length, contributions, capacityLimits(model.solverProfile), model.solverProfile.tolerances.matrixSymmetryAbsolute);
  const loadEvidence = assembleLoads(model, loadCase, lookup, nodeMap);
  const assembledSystemHash = semanticHash({ dofMap, sparseMatrixEvidence: sparseStiffness.evidence, appliedLoad: loadEvidence.appliedLoad });
  return Object.freeze({ dofMap, sparseStiffness, operators, assembledSystemHash, capacityEvidence: sparseStiffness.capacityEvidence, ...loadEvidence });
}

function createOperators(model, lookup, nodeMap, materialMap) {
  return [...model.elements].sort((a, b) => compare(a.elementId, b.elementId)).map((element) => {
    const operator = createElementOperator(element, nodeMap, materialMap.get(element.materialId), model.solverProfile);
    const indices = elementEquationIndices(element, lookup);
    return Object.freeze({ element, operator, indices });
  });
}

function assembleLoads(model, loadCase, lookup, nodeMap) {
  const directNodalLoads = Array(model.nodes.length * 2).fill(0);
  const equivalentEdgeLoads = Array(model.nodes.length * 2).fill(0);
  const directNodalLoadEvidence = [...loadCase.nodalForces].sort((a, b) => compare(a.loadId, b.loadId)).map((load) => applyNodalLoad(load, lookup, directNodalLoads));
  const edgeLoadEvidence = [...loadCase.edgeLoads].sort((a, b) => compare(a.loadId, b.loadId)).map((load) => applyEdgeLoad(model, load, lookup, nodeMap, equivalentEdgeLoads));
  const appliedLoad = directNodalLoads.map((value, index) => value + equivalentEdgeLoads[index]);
  return { directNodalLoads, directNodalLoadEvidence, equivalentEdgeLoads, edgeLoadEvidence, appliedLoad };
}

function applyNodalLoad(load, lookup, target) {
  const uxEquation = lookup.get(`${load.nodeId}:UX`); const uyEquation = lookup.get(`${load.nodeId}:UY`);
  target[uxEquation] += load.fx; target[uyEquation] += load.fy;
  return { loadId: load.loadId, nodeId: load.nodeId, uxEquation, uyEquation, fx: load.fx, fy: load.fy };
}

function applyEdgeLoad(model, load, lookup, nodeMap, target) {
  const element = model.elements.find((row) => row.elementId === load.elementId);
  const evidence = equivalentElementEdgeLoad(element, load, nodeMap, model.solverProfile);
  const indices = elementEquationIndices(element, lookup);
  evidence.vector.forEach((value, index) => { target[indices[index]] += value; });
  const base = { loadId: load.loadId, elementId: element.elementId, type: load.type, ...evidence };
  return element.type === 'Q4' ? { ...base, elementType: element.type } : base;
}

function assertDofCapacity(dofs, profile) {
  if (dofs > profile.maximumDofs) {
    const evidence = Object.freeze({ status: 'REJECTED', requestedDofs: dofs, predictedNonzeroCount: null, predictedStorageBytes: null, approvedLimits: capacityLimits(profile) });
    const error = new RangeError('Sparse DOF capacity qualification failed before pattern construction.'); error.capacityEvidence = evidence; throw error;
  }
}
function capacityLimits(profile) { return { maximumDofs: profile.maximumDofs, maximumNonzeros: profile.maximumNonzeros, maximumEstimatedStorageBytes: profile.maximumEstimatedStorageBytes }; }
function compare(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
