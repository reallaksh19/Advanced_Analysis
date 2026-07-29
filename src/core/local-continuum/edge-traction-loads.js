/**
 * Consistent boundary-edge load integration (spec §7.1 new load types:
 * edge traction, plus the shared primitive `pressure-loads.js` reuses).
 * A boundary edge is 2-node (straight, T3) or 3-node (quadratic,
 * corner-midside-corner, T6/Q8) — both are integrated by the same 1D
 * isoparametric Gauss rule so a curved T6/Q8 edge is never silently
 * reduced to its 2-node corner chord (spec §10.4 midside-geometry).
 */
import { canonicalNumber } from './numeric.js';

const EDGE_GAUSS = Object.freeze([
  Object.freeze({ s: -Math.sqrt(3 / 5), w: 5 / 9 }),
  Object.freeze({ s: 0, w: 8 / 9 }),
  Object.freeze({ s: Math.sqrt(3 / 5), w: 5 / 9 }),
]);

/** Shape functions/derivatives for a 2-node (linear) or 3-node (quadratic) edge in natural coordinate s in [-1,1]. */
export function edgeShapeFunctionsAt(s, nodeCount) {
  if (nodeCount === 2) return { N: [(1 - s) / 2, (1 + s) / 2], dNds: [-0.5, 0.5] };
  return { N: [s * (s - 1) / 2, 1 - s * s, s * (s + 1) / 2], dNds: [s - 0.5, -2 * s, s + 0.5] };
}

/** Jacobian |dX/ds| and unit tangent/outward-normal at one natural point, given physical edge nodes in traversal order. */
export function edgeGeometryAt(nodes, dNds) {
  let dxds = 0; let dyds = 0;
  nodes.forEach((node, i) => { dxds += dNds[i] * node.x; dyds += dNds[i] * node.y; });
  const jacobian = Math.hypot(dxds, dyds);
  return {
    jacobian,
    tangent: [dxds / jacobian, dyds / jacobian],
    // CCW element interior lies to the left of increasing s; outward normal is the tangent rotated -90 degrees.
    outwardNormal: [dyds / jacobian, -dxds / jacobian],
  };
}

/**
 * Integrates a per-Gauss-point traction vector `tractionAt(geometry) => [tx, ty]`
 * over the edge, returning the consistent nodal forces and the edge's true
 * (possibly curved) arc length.
 */
export function integrateEdgeLoad(nodes, thickness, tractionAt) {
  const nodeCount = nodes.length;
  const forces = nodes.map(() => [0, 0]);
  let length = 0;
  EDGE_GAUSS.forEach((gp) => {
    const { N, dNds } = edgeShapeFunctionsAt(gp.s, nodeCount);
    const geometry = edgeGeometryAt(nodes, dNds);
    const [tx, ty] = tractionAt(geometry);
    length += gp.w * geometry.jacobian;
    N.forEach((value, i) => {
      forces[i][0] += gp.w * value * tx * geometry.jacobian * thickness;
      forces[i][1] += gp.w * value * ty * geometry.jacobian * thickness;
    });
  });
  return {
    length: canonicalNumber(length, 'edge arc length'),
    forces: forces.map((row) => row.map((value) => canonicalNumber(value, 'edge consistent nodal force'))),
  };
}
