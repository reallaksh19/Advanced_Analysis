/**
 * Normal pressure on a boundary edge (spec §7.1 new load type). Positive
 * pressure acts along the inward normal (compresses the material at that
 * face) — the standard structural-FEA sign convention. Reuses the shared
 * quadratic-aware edge integration from `edge-traction-loads.js` so a
 * curved T6/Q8 edge's normal direction is evaluated locally at each Gauss
 * point, not approximated by a single edge-average normal.
 */
import { integrateEdgeLoad } from './edge-traction-loads.js';

export function pressureConsistentForces(nodes, pressure, thickness) {
  return integrateEdgeLoad(nodes, thickness, (geometry) => [
    -pressure * geometry.outwardNormal[0],
    -pressure * geometry.outwardNormal[1],
  ]);
}
