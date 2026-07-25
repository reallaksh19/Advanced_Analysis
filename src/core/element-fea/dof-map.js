import { deepFreeze } from '../shared-piping-model/immutable.js';
import { DOF_ORDER } from './constants.js';

export function createDofMap(nodes) {
  const entries = [];
  nodes.forEach((node) => DOF_ORDER.forEach((component) => {
    entries.push({
      equation: entries.length,
      equationIdentity: `${node.nodeId}:${component}`,
      nodeId: node.nodeId,
      component,
    });
  }));
  return deepFreeze(entries);
}
export function equationLookup(dofMap) {
  return new Map(dofMap.map((row) => [row.equationIdentity, row.equation]));
}
export function elementEquationIndices(element, lookup) {
  return element.nodeIds.flatMap((nodeId) => DOF_ORDER.map((component) => lookup.get(`${nodeId}:${component}`)));
}
