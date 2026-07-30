/**
 * Isoparametric geometry mapping for T6/Q8 mesh-quality assessment only —
 * not a stiffness formulation. This mirrors the separation `element-fea`
 * already draws between `q4-geometry.js` (mapping) and `q4-element.js`
 * (stiffness): quality gates need Jacobian/shape data, never a constitutive
 * matrix, so this file creates no duplicate numerical authority with the
 * actual T6/Q8 stiffness elements a later phase adds to `local-continuum`.
 *
 * Node order:
 *  T6: corners 1,2,3 (CCW), midsides 4(1-2), 5(2-3), 6(3-1).
 *  Q8: corners 1(-1,-1),2(1,-1),3(1,1),4(-1,1) (CCW), midsides 5(1-2),
 *      6(2-3), 7(3-4), 8(4-1).
 */

/**
 * Node 1 at natural (0,0), node 2 at (1,0), node 3 at (0,1) — area
 * coordinates `l1=1-xi-eta, l2=xi, l3=eta` so that `l_i=1` exactly at node i.
 * @returns {{N: number[], dNdXi: number[], dNdEta: number[]}}
 */
export function t6ShapeFunctions(xi, eta) {
  const l1 = 1 - xi - eta;
  const l2 = xi;
  const l3 = eta;
  const N = [
    l1 * (2 * l1 - 1),
    l2 * (2 * l2 - 1),
    l3 * (2 * l3 - 1),
    4 * l1 * l2,
    4 * l2 * l3,
    4 * l3 * l1,
  ];
  const dNdXi = [4 * xi + 4 * eta - 3, 4 * xi - 1, 0, 4 * (1 - 2 * xi - eta), 4 * eta, -4 * eta];
  const dNdEta = [4 * xi + 4 * eta - 3, 0, 4 * eta - 1, -4 * xi, 4 * xi, 4 * (1 - xi - 2 * eta)];
  return { N, dNdXi, dNdEta };
}

/** @returns {{N: number[], dNdXi: number[], dNdEta: number[]}} */
export function q8ShapeFunctions(xi, eta) {
  const N = [
    -(1 - xi) * (1 - eta) * (1 + xi + eta) / 4,
    -(1 + xi) * (1 - eta) * (1 - xi + eta) / 4,
    -(1 + xi) * (1 + eta) * (1 - xi - eta) / 4,
    -(1 - xi) * (1 + eta) * (1 + xi - eta) / 4,
    (1 - xi * xi) * (1 - eta) / 2,
    (1 + xi) * (1 - eta * eta) / 2,
    (1 - xi * xi) * (1 + eta) / 2,
    (1 - xi) * (1 - eta * eta) / 2,
  ];
  const dNdXi = [
    (1 - eta) * (2 * xi + eta) / 4,
    (1 - eta) * (2 * xi - eta) / 4,
    (1 + eta) * (2 * xi + eta) / 4,
    (1 + eta) * (2 * xi - eta) / 4,
    -xi * (1 - eta),
    (1 - eta * eta) / 2,
    -xi * (1 + eta),
    -(1 - eta * eta) / 2,
  ];
  const dNdEta = [
    (1 - xi) * (xi + 2 * eta) / 4,
    -(1 + xi) * (xi - 2 * eta) / 4,
    (1 + xi) * (xi + 2 * eta) / 4,
    -(1 - xi) * (xi - 2 * eta) / 4,
    -(1 - xi * xi) / 2,
    -eta * (1 + xi),
    (1 - xi * xi) / 2,
    -eta * (1 - xi),
  ];
  return { N, dNdXi, dNdEta };
}

export const T6_CORNER_NATURAL_POINTS = Object.freeze([
  Object.freeze({ xi: 0, eta: 0 }), Object.freeze({ xi: 1, eta: 0 }), Object.freeze({ xi: 0, eta: 1 }),
]);

export const Q8_CORNER_NATURAL_POINTS = Object.freeze([
  Object.freeze({ xi: -1, eta: -1 }), Object.freeze({ xi: 1, eta: -1 }),
  Object.freeze({ xi: 1, eta: 1 }), Object.freeze({ xi: -1, eta: 1 }),
]);

/**
 * The 2x2 physical Jacobian `d(x,y)/d(xi,eta)` at a natural point, from
 * the element's node coordinates (each `{x,y}`, node order per element type).
 */
export function jacobianAt(shapeFunctions, nodes) {
  let dxDxi = 0; let dyDxi = 0; let dxDeta = 0; let dyDeta = 0;
  for (let i = 0; i < nodes.length; i += 1) {
    dxDxi += shapeFunctions.dNdXi[i] * nodes[i].x;
    dyDxi += shapeFunctions.dNdXi[i] * nodes[i].y;
    dxDeta += shapeFunctions.dNdEta[i] * nodes[i].x;
    dyDeta += shapeFunctions.dNdEta[i] * nodes[i].y;
  }
  const determinant = dxDxi * dyDeta - dxDeta * dyDxi;
  return { dxDxi, dyDxi, dxDeta, dyDeta, determinant };
}

/**
 * Scaled Jacobian at a natural point: `det(J) / (|col1| * |col2|)`, the
 * standard normalized mesh-quality Jacobian metric (1 for a perfectly
 * shaped, orthogonal, equally scaled element; <=0 for an inverted one).
 */
export function scaledJacobianAt(shapeFunctions, nodes) {
  const jacobian = jacobianAt(shapeFunctions, nodes);
  const col1Norm = Math.hypot(jacobian.dxDxi, jacobian.dyDxi);
  const col2Norm = Math.hypot(jacobian.dxDeta, jacobian.dyDeta);
  if (col1Norm === 0 || col2Norm === 0) return 0;
  return jacobian.determinant / (col1Norm * col2Norm);
}
