/**
 * Consistent body-force (per-unit-volume) equivalent nodal load (spec §7.1
 * new load type). T3 uses the closed-form linear-shape-function result
 * (`Area*thickness/3` per corner, exact for a constant body force on a
 * linear triangle); T6/Q8 are Gauss-integrated with the same
 * `weight * jacobianDeterminant * thickness` scaling their own stiffness
 * formulations already use, so this stays consistent with those verified
 * quadratures rather than introducing a second, independently-tuned rule.
 *
 * Disclosed unit convention: `bx`/`by` are declared and converted through a
 * derived `bodyForceIntensity` dimension (`stress / length`, i.e.
 * force/volume) computed in `units.js` from the model's already-declared
 * stress and length units — no new top-level unit key is introduced.
 */
import { ELEMENT_TYPES } from './constants.js';
import { canonicalNumber } from './numeric.js';
import { q8ShapeFunctionsAndDerivatives, q8BMatrixAt, Q8_GAUSS_POINTS } from './q8-element.js';
import { t6ShapeFunctionsAndDerivatives, t6BMatrixAt, T6_GAUSS_POINTS } from './t6-element.js';

export function consistentBodyForceVector(elementType, nodes, thickness, bx, by) {
  if (elementType === ELEMENT_TYPES.T3) return t3BodyForce(nodes, thickness, bx, by);
  if (elementType === ELEMENT_TYPES.T6) {
    return gaussBodyForce(nodes, thickness, bx, by, T6_GAUSS_POINTS, t6ShapeFunctionsAndDerivatives, t6BMatrixAt);
  }
  return gaussBodyForce(nodes, thickness, bx, by, Q8_GAUSS_POINTS, q8ShapeFunctionsAndDerivatives, q8BMatrixAt);
}

function gaussBodyForce(nodes, thickness, bx, by, gaussPoints, shapeFn, jacobianFn) {
  const forces = nodes.map(() => [0, 0]);
  gaussPoints.forEach((gp) => {
    const { N } = shapeFn(gp.xi, gp.eta);
    const { jacobianDeterminant } = jacobianFn(nodes, gp.xi, gp.eta);
    N.forEach((value, i) => {
      forces[i][0] += gp.weight * value * bx * jacobianDeterminant * thickness;
      forces[i][1] += gp.weight * value * by * jacobianDeterminant * thickness;
    });
  });
  return forces.map((row) => row.map((value) => canonicalNumber(value, 'body force consistent nodal force')));
}

function t3BodyForce(nodes, thickness, bx, by) {
  const [a, b, c] = nodes;
  const area = Math.abs((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y)) / 2;
  const share = area * thickness / 3;
  return nodes.map(() => [
    canonicalNumber(bx * share, 'T3 body force'),
    canonicalNumber(by * share, 'T3 body force'),
  ]);
}
