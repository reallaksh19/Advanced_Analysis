import { FORMULA_IDS } from './constants.js';
import { cleanNumber } from './numeric.js';
import { add, cross, scale } from './vector.js';

export function assembleLoadCase(model, loadCase, assembly, elements) {
  const vector = Array(assembly.dofOrdering.length).fill(0);
  const contributions = [];
  const elementMap = new Map(elements.map((element) => [element.elementId, element]));
  for (const load of loadCase.nodalLoads) addNodalLoad(vector, contributions, load, assembly.dofIndex);
  for (const load of loadCase.pressureLoads) addPressureLoad(vector, contributions, load, assembly.dofIndex, elementMap.get(load.elementId));
  const totals = generalizedTotals(model.nodes, vector);
  return {
    loadCaseId: loadCase.loadCaseId,
    forceVector: vector.map(cleanNumber),
    contributions,
    appliedForce: totals.force,
    appliedMomentAboutOrigin: totals.moment,
    formulaIds: formulaIds(loadCase),
  };
}

export function generalizedTotals(nodes, vector) {
  let force = [0, 0, 0];
  let moment = [0, 0, 0];
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    const offset = 5 * index;
    const nodalForce = vector.slice(offset, offset + 3);
    const nodalMoment = add(
      scale(node.rotationBasis1, vector[offset + 3]),
      scale(node.rotationBasis2, vector[offset + 4]),
    );
    force = add(force, nodalForce);
    moment = add(moment, add(cross(node.position, nodalForce), nodalMoment));
  }
  return { force, moment };
}

function addNodalLoad(vector, contributions, load, dofIndex) {
  const values = [load.fx, load.fy, load.fz, load.m1, load.m2];
  const dofs = ['UX', 'UY', 'UZ', 'R1', 'R2'];
  for (let index = 0; index < dofs.length; index += 1) vector[dofIndex.get(`${load.nodeId}:${dofs[index]}`)] += values[index];
  contributions.push({
    type: 'NODAL_FORCE_AND_TANGENT_MOMENT',
    identity: load.loadId,
    nodeId: load.nodeId,
    generalizedValues: values,
    sourceReference: load.sourceReference,
    formulaId: FORMULA_IDS.NODAL_LOAD,
  });
}

function addPressureLoad(vector, contributions, load, dofIndex, element) {
  const sign = load.sense === 'ALONG_ELEMENT_NORMAL' ? 1 : -1;
  const nodalForce = scale(element.localFrame.ez, sign * load.pressure * element.area / 3);
  for (const nodeId of element.nodeIds) {
    for (let axis = 0; axis < 3; axis += 1) vector[dofIndex.get(`${nodeId}:${['UX', 'UY', 'UZ'][axis]}`)] += nodalForce[axis];
  }
  contributions.push({
    type: 'UNIFORM_ELEMENT_NORMAL_PRESSURE',
    identity: load.pressureLoadId,
    elementId: load.elementId,
    pressure: load.pressure,
    sense: load.sense,
    signedNormal: scale(element.localFrame.ez, sign),
    representedArea: element.area,
    nodalForce,
    totalForce: scale(nodalForce, 3),
    sourceReference: load.sourceReference,
    formulaId: FORMULA_IDS.PRESSURE_LOAD,
  });
}

function formulaIds(loadCase) {
  const ids = [];
  if (loadCase.nodalLoads.length > 0) ids.push(FORMULA_IDS.NODAL_LOAD);
  if (loadCase.pressureLoads.length > 0) ids.push(FORMULA_IDS.PRESSURE_LOAD);
  return ids;
}
