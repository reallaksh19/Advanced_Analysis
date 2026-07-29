import { semanticHash } from '../shared-piping-model/index.js';
import { FORMULA_IDS } from './constants.js';
import { edgeKey } from './assembly.js';
import { consistentBodyForceVector } from './body-force-loads.js';
import { integrateEdgeLoad } from './edge-traction-loads.js';
import { canonicalNumber } from './numeric.js';
import { pressureConsistentForces } from './pressure-loads.js';
import { thermalEquivalentNodalForces } from './temperature-strain-loads.js';

export function assembleLoadCase(model, mesh, elementEvidence, loadCase) {
  const index = new Map(mesh.dofOrdering.map((id, i) => [id, i]));
  const forceVector = Array(mesh.dofOrdering.length).fill(0);
  const contributions = [];
  const nodes = new Map(model.nodes.map((row) => [row.nodeId, row]));
  const elements = new Map(model.elements.map((row) => [row.elementId, row]));
  const evidenceById = new Map(elementEvidence.map((row) => [row.elementId, row]));
  const boundaryByKey = new Map(mesh.boundaryEdges.map((row) => [row.edgeKey, row]));

  loadCase.nodalForces.forEach((load) => addNodalForce(forceVector, index, load, contributions));
  loadCase.edgeTractions.forEach((traction) => (
    addTraction(forceVector, index, traction, nodes, elements.get(traction.elementId), boundaryByKey, contributions)
  ));
  loadCase.pressureLoads.forEach((pressureLoad) => (
    addPressureLoad(forceVector, index, pressureLoad, nodes, elements.get(pressureLoad.elementId), boundaryByKey, contributions)
  ));
  loadCase.bodyForces.forEach((bodyForce) => (
    addBodyForce(forceVector, index, bodyForce, nodes, elements.get(bodyForce.elementId), contributions)
  ));
  loadCase.temperatureLoads.forEach((temperatureLoad) => (
    addTemperatureLoad(forceVector, index, temperatureLoad, evidenceById.get(temperatureLoad.elementId), contributions)
  ));

  const formulaIds = [];
  if (loadCase.nodalForces.length) formulaIds.push(FORMULA_IDS.NODAL_FORCE);
  if (loadCase.edgeTractions.length) formulaIds.push(FORMULA_IDS.EDGE_TRACTION);
  if (loadCase.pressureLoads.length) formulaIds.push(FORMULA_IDS.PRESSURE_LOAD);
  if (loadCase.bodyForces.length) formulaIds.push(FORMULA_IDS.BODY_FORCE_LOAD);
  if (loadCase.temperatureLoads.length) formulaIds.push(FORMULA_IDS.THERMAL_STRAIN_LOAD);
  if (loadCase.imposedDisplacements.length) formulaIds.push(FORMULA_IDS.IMPOSED_DISPLACEMENT_LOAD);

  return {
    loadCaseId: loadCase.loadCaseId,
    loadCaseInputSemanticHash: semanticHash(loadCase),
    forceVector: forceVector.map((value) => canonicalNumber(value, 'assembled force')),
    contributions: contributions.sort((a, b) => (a.identity < b.identity ? -1 : a.identity > b.identity ? 1 : 0)),
    imposedDisplacements: loadCase.imposedDisplacements,
    temperatureLoads: loadCase.temperatureLoads,
    sourceReference: loadCase.sourceReference,
    formulaIds,
  };
}

function addNodalForce(vector, index, load, contributions) {
  vector[index.get(`${load.nodeId}:UX`)] += load.fx;
  vector[index.get(`${load.nodeId}:UY`)] += load.fy;
  contributions.push({
    type: 'NODAL_FORCE', identity: load.loadId, nodeIds: [load.nodeId], forcePerNode: [[load.fx, load.fy]],
    sourceReference: load.sourceReference, formulaId: FORMULA_IDS.NODAL_FORCE,
  });
}

function addTraction(vector, index, traction, nodes, element, boundaryByKey, contributions) {
  const sequence = boundaryByKey.get(edgeKey(traction.edgeNodeIds)).edgeNodeSequence;
  const physicalNodes = sequence.map((id) => nodes.get(id));
  const { length, forces } = integrateEdgeLoad(physicalNodes, element.thickness, () => [traction.tx, traction.ty]);
  applyEdgeForces(vector, index, sequence, forces);
  contributions.push({
    type: 'BOUNDARY_EDGE_TRACTION', identity: traction.tractionId, elementId: traction.elementId,
    edgeKey: edgeKey(traction.edgeNodeIds), nodeIds: sequence, edgeLength: length, thickness: element.thickness,
    traction: [traction.tx, traction.ty], forcePerNode: forces, sourceReference: traction.sourceReference,
    formulaId: FORMULA_IDS.EDGE_TRACTION,
  });
}

function addPressureLoad(vector, index, pressureLoad, nodes, element, boundaryByKey, contributions) {
  const sequence = boundaryByKey.get(edgeKey(pressureLoad.edgeNodeIds)).edgeNodeSequence;
  const physicalNodes = sequence.map((id) => nodes.get(id));
  const { length, forces } = pressureConsistentForces(physicalNodes, pressureLoad.pressure, element.thickness);
  applyEdgeForces(vector, index, sequence, forces);
  contributions.push({
    type: 'BOUNDARY_EDGE_PRESSURE', identity: pressureLoad.pressureLoadId, elementId: pressureLoad.elementId,
    edgeKey: edgeKey(pressureLoad.edgeNodeIds), nodeIds: sequence, edgeLength: length, thickness: element.thickness,
    pressure: pressureLoad.pressure, forcePerNode: forces, sourceReference: pressureLoad.sourceReference,
    formulaId: FORMULA_IDS.PRESSURE_LOAD,
  });
}

function addBodyForce(vector, index, bodyForce, nodes, element, contributions) {
  const physicalNodes = element.nodeIds.map((id) => nodes.get(id));
  const forces = consistentBodyForceVector(element.elementType, physicalNodes, element.thickness, bodyForce.bx, bodyForce.by);
  applyEdgeForces(vector, index, element.nodeIds, forces);
  contributions.push({
    type: 'ELEMENT_BODY_FORCE', identity: bodyForce.bodyForceId, elementId: bodyForce.elementId,
    nodeIds: element.nodeIds, bodyForce: [bodyForce.bx, bodyForce.by], forcePerNode: forces,
    sourceReference: bodyForce.sourceReference, formulaId: FORMULA_IDS.BODY_FORCE_LOAD,
  });
}

function addTemperatureLoad(vector, index, temperatureLoad, evidence, contributions) {
  const forces = thermalEquivalentNodalForces(evidence, temperatureLoad.thermalStrain);
  applyEdgeForces(vector, index, evidence.nodeIds, forces);
  contributions.push({
    type: 'ELEMENT_THERMAL_STRAIN', identity: temperatureLoad.temperatureLoadId, elementId: temperatureLoad.elementId,
    nodeIds: evidence.nodeIds, thermalStrain: temperatureLoad.thermalStrain, forcePerNode: forces,
    sourceReference: temperatureLoad.sourceReference, formulaId: FORMULA_IDS.THERMAL_STRAIN_LOAD,
  });
}

function applyEdgeForces(vector, index, nodeIds, forces) {
  nodeIds.forEach((nodeId, i) => {
    vector[index.get(`${nodeId}:UX`)] += forces[i][0];
    vector[index.get(`${nodeId}:UY`)] += forces[i][1];
  });
}
