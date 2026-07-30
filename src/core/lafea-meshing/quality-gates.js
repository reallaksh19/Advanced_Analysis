import { LafeaMeshingError } from './errors.js';
import {
  Q8_CORNER_NATURAL_POINTS,
  T6_CORNER_NATURAL_POINTS,
  q8ShapeFunctions,
  scaledJacobianAt,
  t6ShapeFunctions,
} from './element-geometry.js';

/**
 * The full §10.3 default mesh-control gate table. Every threshold is a
 * caller-declared `meshProfile` value (from `lafea-profile-contract`) —
 * nothing here hard-codes a number; each function only classifies a computed
 * quantity against thresholds the caller supplies.
 */

export const GATE_STATUSES = Object.freeze(['OK', 'WARNING', 'BLOCK']);

function classify(value, { warnAt, blockAt, worseIsHigher }) {
  const worse = worseIsHigher ? (a, b) => a > b : (a, b) => a < b;
  if (worse(value, blockAt) || value === blockAt) return 'BLOCK';
  if (worse(value, warnAt) || value === warnAt) return 'WARNING';
  return 'OK';
}

/** Aspect ratio: longest edge / shortest edge of the element's corner polygon. */
export function aspectRatioOf(cornerPoints) {
  const edgeLengths = edgeLengthsOf(cornerPoints);
  const longest = Math.max(...edgeLengths);
  const shortest = Math.min(...edgeLengths);
  if (!(shortest > 0)) throw new LafeaMeshingError('Degenerate element: zero-length edge', 'DEGENERATE_ELEMENT');
  return longest / shortest;
}

export function qualifyAspectRatio(cornerPoints, { warn, block }) {
  const value = aspectRatioOf(cornerPoints);
  return Object.freeze({ metric: 'ASPECT_RATIO', value, status: classify(value, { warnAt: warn, blockAt: block, worseIsHigher: true }) });
}

function edgeLengthsOf(cornerPoints) {
  return cornerPoints.map((point, index) => {
    const next = cornerPoints[(index + 1) % cornerPoints.length];
    return Math.hypot(next.x - point.x, next.y - point.y);
  });
}

/** Minimum interior angle of a triangle's corner points, in degrees (spec §10.3: triangles only). */
export function minimumAngleDegreesOf(triangleCorners) {
  if (triangleCorners.length !== 3) throw new LafeaMeshingError('minimumAngleDegreesOf requires exactly 3 corner points', 'NOT_A_TRIANGLE');
  const angles = [0, 1, 2].map((i) => {
    const a = triangleCorners[i];
    const b = triangleCorners[(i + 1) % 3];
    const c = triangleCorners[(i + 2) % 3];
    const ab = { x: b.x - a.x, y: b.y - a.y };
    const ac = { x: c.x - a.x, y: c.y - a.y };
    const dot = ab.x * ac.x + ab.y * ac.y;
    const cross = ab.x * ac.y - ab.y * ac.x;
    return Math.atan2(Math.abs(cross), dot) * (180 / Math.PI);
  });
  return Math.min(...angles);
}

export function qualifyMinimumAngle(triangleCorners, { warn, block }) {
  const value = minimumAngleDegreesOf(triangleCorners);
  return Object.freeze({ metric: 'MINIMUM_ANGLE_DEGREES', value, status: classify(value, { warnAt: warn, blockAt: block, worseIsHigher: false }) });
}

/**
 * The element's minimum scaled Jacobian, sampled at every corner natural
 * point (spec: "Positive at every integration point"). `nodeType` selects
 * T6 (6 nodes) or Q8 (8 nodes) shape functions.
 */
export function minimumScaledJacobianOf(nodeType, physicalNodes) {
  const { shapeFn, cornerPoints } = nodeType === 'T6'
    ? { shapeFn: t6ShapeFunctions, cornerPoints: T6_CORNER_NATURAL_POINTS }
    : { shapeFn: q8ShapeFunctions, cornerPoints: Q8_CORNER_NATURAL_POINTS };
  const values = cornerPoints.map(({ xi, eta }) => scaledJacobianAt(shapeFn(xi, eta), physicalNodes));
  return Math.min(...values);
}

export function qualifyScaledJacobian(nodeType, physicalNodes, { warn, block }) {
  const value = minimumScaledJacobianOf(nodeType, physicalNodes);
  return Object.freeze({
    metric: 'SCALED_JACOBIAN',
    value,
    status: value <= 0 ? 'BLOCK' : classify(value, { warnAt: warn, blockAt: block, worseIsHigher: false }),
  });
}

/**
 * Shell warpage: the dihedral angle in degrees between the two triangular
 * subfaces of a quad split along one diagonal (spec §10.3). For a planar 2D
 * continuum mesh (z always 0) this is always exactly 0 — the metric is
 * shared, ready for the shell mesher a later phase adds.
 *
 * @param {readonly {x:number,y:number,z:number}[]} quadCorners Exactly 4, CCW.
 */
export function shellWarpageDegreesOf(quadCorners) {
  if (quadCorners.length !== 4) throw new LafeaMeshingError('shellWarpageDegreesOf requires exactly 4 corner points', 'NOT_A_QUAD');
  const [a, b, c, d] = quadCorners;
  const normal1 = crossProduct(subtract(b, a), subtract(c, a));
  const normal2 = crossProduct(subtract(c, a), subtract(d, a));
  const cosTheta = dotProduct(normal1, normal2) / (normOf(normal1) * normOf(normal2));
  const clamped = Math.max(-1, Math.min(1, cosTheta));
  return Math.acos(clamped) * (180 / Math.PI);
}

export function qualifyShellWarpage(quadCorners, { warn, block }) {
  const value = shellWarpageDegreesOf(quadCorners);
  return Object.freeze({ metric: 'SHELL_WARPAGE_DEGREES', value, status: classify(value, { warnAt: warn, blockAt: block, worseIsHigher: true }) });
}

function subtract(p, q) { return { x: p.x - q.x, y: p.y - q.y, z: (p.z ?? 0) - (q.z ?? 0) }; }
function crossProduct(u, v) { return { x: u.y * v.z - u.z * v.y, y: u.z * v.x - u.x * v.z, z: u.x * v.y - u.y * v.x }; }
function dotProduct(u, v) { return u.x * v.x + u.y * v.y + u.z * v.z; }
function normOf(v) { return Math.hypot(v.x, v.y, v.z); }

/** Circumferential quadratic-edge count around a discretized boundary loop (holes, weld/attachment footprints). */
export function qualifyBoundarySegmentCount(segmentCount, minimum) {
  return Object.freeze({ metric: 'BOUNDARY_SEGMENT_COUNT', value: segmentCount, status: segmentCount >= minimum ? 'OK' : 'BLOCK', minimum });
}

/** Shell element size relative to declared thickness: spec §10.3 default band is 0.5t-2t near local attachments. */
export function qualifyShellSizeToThicknessRatio(elementSize, thickness, { minimumMultiple, maximumMultiple }) {
  const ratio = elementSize / thickness;
  const status = ratio < minimumMultiple || ratio > maximumMultiple ? 'WARNING' : 'OK';
  return Object.freeze({ metric: 'SHELL_SIZE_TO_THICKNESS_RATIO', value: ratio, status, minimumMultiple, maximumMultiple });
}

/** Worst (highest-severity) status among a list of gate results — BLOCK > WARNING > OK. */
export function worstStatus(results) {
  const severity = { OK: 0, WARNING: 1, BLOCK: 2 };
  return results.reduce((worst, result) => (severity[result.status] > severity[worst] ? result.status : worst), 'OK');
}
