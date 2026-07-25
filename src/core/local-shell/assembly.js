import { DOFS } from './constants.js';
import { matrixScale, symmetryResidual, zeros } from './matrix.js';
import { qualification } from './numeric.js';

export function assembleGlobalSystem(model, elements) {
  const dofOrdering = model.nodes.flatMap((node) => DOFS.map((dof) => `${node.nodeId}:${dof}`));
  const dofIndex = new Map(dofOrdering.map((identity, index) => [identity, index]));
  const stiffness = zeros(dofOrdering.length, dofOrdering.length);
  const elementAssembly = [];
  for (const element of elements) {
    const indices = element.globalDofOrdering.map((identity) => dofIndex.get(identity));
    assembleElement(stiffness, element.globalStiffness, indices);
    elementAssembly.push({ elementId: element.elementId, globalDofIndices: indices });
  }
  const symmetry = qualification(
    symmetryResidual(stiffness),
    matrixScale(stiffness),
    model.qualificationProfile.globalStiffnessSymmetry,
  );
  return { stiffness, dofOrdering, dofIndex, elementAssembly, symmetry };
}

function assembleElement(global, local, indices) {
  for (let row = 0; row < indices.length; row += 1) {
    for (let column = 0; column < indices.length; column += 1) {
      global[indices[row]][indices[column]] += local[row][column];
    }
  }
}
