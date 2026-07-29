import { LafeaGeometryError } from './errors.js';
import { exactKeys, member, nonEmptyString } from '../shared-analysis-contract/validation.js';
import { finiteNumber, positiveNumber } from '../shared-analysis-contract/numeric.js';

/**
 * Curves are retained analytically until discretization (spec §10.1): a
 * `LINE` is exact by construction, an `ARC` carries its true center, radius
 * and traversal direction rather than a chord approximation. Splines are
 * `OUTSIDE_SCOPE` for this release — not silently approximated as arcs or
 * polylines — and are rejected by `canonicalCurve` if declared.
 */
export const CURVE_TYPES = Object.freeze(['LINE', 'ARC']);
export const ARC_DIRECTIONS = Object.freeze(['CW', 'CCW']);

const VERTEX_FIELDS = Object.freeze(['vertexId', 'x', 'y']);
const CURVE_FIELDS = Object.freeze(['curveId', 'type', 'startVertexId', 'endVertexId', 'arc']);
const ARC_FIELDS = Object.freeze(['center', 'radius', 'direction']);

export function canonicalVertex(source) {
  exactKeys(source, VERTEX_FIELDS, 'vertex');
  return Object.freeze({
    vertexId: nonEmptyString(source.vertexId, 'vertex.vertexId'),
    x: finiteNumber(source.x, 'vertex.x'),
    y: finiteNumber(source.y, 'vertex.y'),
  });
}

export function canonicalCurve(source, vertexById) {
  exactKeys(source, CURVE_FIELDS, 'curve');
  const type = member(source.type, CURVE_TYPES, 'curve.type');
  const curveId = nonEmptyString(source.curveId, 'curve.curveId');
  const startVertexId = requireVertexReference(source.startVertexId, vertexById, `curve.${curveId}.startVertexId`);
  const endVertexId = requireVertexReference(source.endVertexId, vertexById, `curve.${curveId}.endVertexId`);
  if (type === 'LINE') {
    if (source.arc !== null) throw new LafeaGeometryError(`curve.${curveId}.arc must be null for a LINE`, 'UNEXPECTED_FIELD');
    if (startVertexId === endVertexId) throw new LafeaGeometryError(`curve.${curveId} is a degenerate LINE`, 'DEGENERATE_CURVE');
    return Object.freeze({ curveId, type, startVertexId, endVertexId, arc: null });
  }
  const arc = canonicalArc(source.arc, `curve.${curveId}.arc`);
  return Object.freeze({ curveId, type, startVertexId, endVertexId, arc });
}

function canonicalArc(source, label) {
  if (!source || typeof source !== 'object') throw new LafeaGeometryError(`${label} is required for an ARC`, 'MISSING_ARC');
  exactKeys(source, ARC_FIELDS, label);
  exactKeys(source.center, ['x', 'y'], `${label}.center`);
  return Object.freeze({
    center: Object.freeze({ x: finiteNumber(source.center.x, `${label}.center.x`), y: finiteNumber(source.center.y, `${label}.center.y`) }),
    radius: positiveNumber(source.radius, `${label}.radius`),
    direction: member(source.direction, ARC_DIRECTIONS, `${label}.direction`),
  });
}

function requireVertexReference(vertexId, vertexById, label) {
  if (!vertexById.has(vertexId)) throw new LafeaGeometryError(`${label} references an unresolved vertex: ${vertexId}`, 'UNRESOLVED_VERTEX');
  return vertexId;
}

/**
 * The signed swept angle in radians from `startVertexId` to `endVertexId`
 * along `curve.arc`, consistent with the declared traversal direction. A
 * coincident start/end vertex is a full circle: +-2*pi by direction.
 */
export function arcSweepAngle(curve, vertexById) {
  const { center, radius, direction } = curve.arc;
  const start = vertexById.get(curve.startVertexId);
  const end = vertexById.get(curve.endVertexId);
  assertOnCircle(start, center, radius, `curve.${curve.curveId}.startVertexId`);
  assertOnCircle(end, center, radius, `curve.${curve.curveId}.endVertexId`);
  if (curve.startVertexId === curve.endVertexId) return direction === 'CCW' ? 2 * Math.PI : -2 * Math.PI;
  const phi0 = Math.atan2(start.y - center.y, start.x - center.x);
  const phi1 = Math.atan2(end.y - center.y, end.x - center.x);
  const twoPi = 2 * Math.PI;
  if (direction === 'CCW') {
    const raw = ((phi1 - phi0) % twoPi + twoPi) % twoPi;
    return raw === 0 ? twoPi : raw;
  }
  const raw = ((phi0 - phi1) % twoPi + twoPi) % twoPi;
  return raw === 0 ? -twoPi : -raw;
}

function assertOnCircle(point, center, radius, label) {
  const deviation = Math.hypot(point.x - center.x, point.y - center.y) - radius;
  if (Math.abs(deviation) > 1e-6 * Math.max(1, radius)) {
    throw new LafeaGeometryError(`${label} does not lie on its declared arc circle (deviation ${deviation})`, 'VERTEX_OFF_ARC');
  }
}

/**
 * Exact curve length: chord length for a LINE, `radius * |sweep|` for an ARC.
 */
export function curveLength(curve, vertexById) {
  const start = vertexById.get(curve.startVertexId);
  const end = vertexById.get(curve.endVertexId);
  if (curve.type === 'LINE') return Math.hypot(end.x - start.x, end.y - start.y);
  return curve.arc.radius * Math.abs(arcSweepAngle(curve, vertexById));
}

/**
 * The true analytic point at parameter `t` in [0,1] along the curve — the
 * midside node source of truth (`t = 0.5`), never a linear interpolation of
 * endpoints for an ARC.
 */
export function curvePointAt(curve, vertexById, t) {
  if (!(t >= 0 && t <= 1)) throw new LafeaGeometryError(`curvePointAt requires t in [0,1], got ${t}`, 'INVALID_PARAMETER');
  const start = vertexById.get(curve.startVertexId);
  const end = vertexById.get(curve.endVertexId);
  if (curve.type === 'LINE') return Object.freeze({ x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t });
  const { center, radius } = curve.arc;
  const phi0 = Math.atan2(start.y - center.y, start.x - center.x);
  const sweep = arcSweepAngle(curve, vertexById);
  const phi = phi0 + sweep * t;
  return Object.freeze({ x: center.x + radius * Math.cos(phi), y: center.y + radius * Math.sin(phi) });
}

/**
 * Raw (not yet divided by two) Green's-theorem contribution `x dy - y dx`
 * of one curve, exact for both LINE and ARC. Summing this over a closed
 * loop and dividing by two yields the loop's exact signed area — see
 * `topology.js`.
 */
export function curveGreenContribution(curve, vertexById) {
  const start = vertexById.get(curve.startVertexId);
  const end = vertexById.get(curve.endVertexId);
  if (curve.type === 'LINE') return start.x * end.y - end.x * start.y;
  const { center, radius } = curve.arc;
  const sweep = arcSweepAngle(curve, vertexById);
  const phi0 = Math.atan2(start.y - center.y, start.x - center.x);
  const phi1 = phi0 + sweep;
  return radius * radius * sweep
    + radius * center.x * (Math.sin(phi1) - Math.sin(phi0))
    + radius * center.y * (Math.cos(phi0) - Math.cos(phi1));
}
