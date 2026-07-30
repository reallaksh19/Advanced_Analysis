/**
 * Isotropic thermal-strain equivalent nodal load (spec §7.1 new load type):
 * `F_thermal = integral( B^T D epsilon0 ) dV`, the standard initial-strain
 * weak-form term, moved to the force-vector side of `K u = F`. Declared
 * directly as a dimensionless free strain (`thermalStrain`, i.e. the
 * already-multiplied `alpha * deltaT`) rather than separate expansion-
 * coefficient and temperature-change fields — this sidesteps introducing a
 * temperature unit dimension the model's unit system does not otherwise
 * carry, and is a common FEA input convention when a free thermal strain is
 * already available from an upstream thermal analysis.
 *
 * Reuses each element's own already-qualified `dMatrix`/`bMatrix`/
 * `gaussEvidence` from `buildElementEvidence` — never re-derives the
 * constitutive matrix independently, so the thermal load stays numerically
 * consistent with the stiffness matrix used in the same solve.
 */
import { ELEMENT_TYPES } from './constants.js';
import { matrixVector, transpose } from './matrix.js';
import { canonicalNumber } from './numeric.js';

export function thermalEquivalentNodalForces(elementEvidence, thermalStrain) {
  const epsilonTheta = [thermalStrain, thermalStrain, 0];
  const thermalStress = matrixVector(elementEvidence.dMatrix, epsilonTheta);
  if (elementEvidence.elementType === ELEMENT_TYPES.T3) {
    const nodal = matrixVector(transpose(elementEvidence.bMatrix), thermalStress);
    const scale = elementEvidence.canonicalArea * elementEvidence.thickness;
    return groupByNode(nodal.map((value) => canonicalNumber(value * scale, 'thermal equivalent nodal force')));
  }
  const dofCount = elementEvidence.gaussEvidence[0].B[0].length;
  const totals = Array(dofCount).fill(0);
  elementEvidence.gaussEvidence.forEach((gp) => {
    const nodal = matrixVector(transpose(gp.B), thermalStress);
    nodal.forEach((value, i) => {
      totals[i] += value * gp.weight * gp.jacobianDeterminant * elementEvidence.thickness;
    });
  });
  return groupByNode(totals.map((value) => canonicalNumber(value, 'thermal equivalent nodal force')));
}

function groupByNode(dofVector) {
  const forces = [];
  for (let i = 0; i < dofVector.length; i += 2) forces.push([dofVector[i], dofVector[i + 1]]);
  return forces;
}
