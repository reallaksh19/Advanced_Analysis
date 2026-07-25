import { deepFreeze } from '../shared-piping-model/immutable.js';
import { ELEMENT_TYPES } from './constants.js';
import { createQ4Operator, equivalentQ4EdgeLoad, recoverQ4Result } from './q4-element.js';
import { createT3Operator, equivalentEdgeLoad, recoverT3Result } from './t3-element.js';

export function createElementOperator(element, nodeMap, material, profile) {
  if (element.type === ELEMENT_TYPES.Q4) return createQ4Operator(element, nodeMap, material, profile);
  if (element.type === ELEMENT_TYPES.T3) return t3Operator(element, nodeMap, material, profile);
  throw new TypeError(`Unsupported element type: ${element.type}.`);
}
export function equivalentElementEdgeLoad(element, load, nodeMap, profile) {
  if (element.type === ELEMENT_TYPES.T3) return equivalentEdgeLoad(element, load, nodeMap, profile);
  if (element.type === ELEMENT_TYPES.Q4) return equivalentQ4EdgeLoad(element, load, nodeMap, profile);
  throw new TypeError(`Unsupported element type: ${element.type}.`);
}
export function recoverElementResult(element, operator, displacement, material, formulation) {
  if (element.type === ELEMENT_TYPES.Q4) return recoverQ4Result(operator, displacement, material, formulation);
  const result = recoverT3Result(operator, displacement, material, formulation);
  return deepFreeze({ integrationPointResults: [{ integrationPointId: 'T3_CONSTANT', naturalCoordinates: null, globalCoordinates: operator.centroid, strain: result.strain, stress: result.stress, sigmaZ: result.sigmaZ, principal: result.principal, vonMises: result.vonMises, recoveryLocation: 'T3_CONSTANT_ELEMENT_DOMAIN', strainEnergyContribution: result.strainEnergy }], internalForce: result.internalForce, strainEnergy: result.strainEnergy, integratedPointEnergy: result.strainEnergy });
}
function t3Operator(element, nodeMap, material, profile) {
  const operator = createT3Operator(element, nodeMap, material, profile); const nodes = element.nodeIds.map((id)=>nodeMap.get(id));
  const centroid = { x: nodes.reduce((sum,row)=>sum+row.x,0)/3, y: nodes.reduce((sum,row)=>sum+row.y,0)/3 };
  return deepFreeze({ ...operator, elementType: ELEMENT_TYPES.T3, centroid });
}
