import { LafeaMeshingError } from './errors.js';
import { arcSweepAngle, curveLength, curvePointAt } from '../lafea-geometry/vertex-curve.js';

/**
 * Curvature/chord-error-controlled boundary discretization (spec §10.2/§10.3)
 * with feature-point preservation: every declared topology vertex remains a
 * mesh node, and boundary edges are quadratic (3 nodes: corner, true
 * midside, corner) since T6/Q8 are the default elements.
 */

/**
 * The number of quadratic boundary edges a curve must be split into, driven
 * by size, curvature chord error, and a caller-declared floor (e.g. hole
 * circumference or weld-edge minimums from §10.3).
 *
 * @param {Readonly<object>} curve LINE or ARC curve.
 * @param {Map<string,object>} vertexById
 * @param {{targetSize:number, chordErrorLimit:number, minimumSegments?:number}} options
 * @returns {number} Segment (quadratic edge) count, >= 1.
 */
export function curveSegmentCount(curve, vertexById, options) {
  const { targetSize, chordErrorLimit, minimumSegments = 1 } = options;
  if (!(targetSize > 0)) throw new LafeaMeshingError('targetSize must be positive', 'INVALID_TARGET_SIZE');
  if (!(minimumSegments >= 1)) throw new LafeaMeshingError('minimumSegments must be at least 1', 'INVALID_MINIMUM_SEGMENTS');
  const length = curveLength(curve, vertexById);
  const sizeBased = Math.max(1, Math.ceil(length / targetSize));
  if (curve.type === 'LINE') return Math.max(sizeBased, minimumSegments);
  if (!(chordErrorLimit > 0)) throw new LafeaMeshingError('chordErrorLimit must be positive for an ARC', 'INVALID_CHORD_ERROR');
  const sweep = Math.abs(arcSweepAngle(curve, vertexById));
  const radius = curve.arc.radius;
  const ratio = Math.min(chordErrorLimit / radius, 1);
  const maxAnglePerSegment = 2 * Math.acos(1 - ratio);
  const chordBased = Math.max(1, Math.ceil(sweep / maxAnglePerSegment));
  return Math.max(sizeBased, chordBased, minimumSegments);
}

/**
 * Split one curve into `segmentCount` quadratic edges: `segmentCount + 1`
 * corner points (parameter-ordered, feature endpoints at t=0 and t=1) and
 * `segmentCount` true analytic midside points, one per edge.
 */
export function discretizeCurveIntoQuadraticEdges(curve, vertexById, segmentCount) {
  if (!Number.isInteger(segmentCount) || segmentCount < 1) {
    throw new LafeaMeshingError('segmentCount must be a positive integer', 'INVALID_SEGMENT_COUNT');
  }
  const cornerPoints = [];
  for (let i = 0; i <= segmentCount; i += 1) {
    const t = i / segmentCount;
    cornerPoints.push(Object.freeze({ curveId: curve.curveId, t, point: curvePointAt(curve, vertexById, t) }));
  }
  const midPoints = [];
  for (let i = 0; i < segmentCount; i += 1) {
    const t = (i + 0.5) / segmentCount;
    midPoints.push(Object.freeze({ curveId: curve.curveId, t, point: curvePointAt(curve, vertexById, t) }));
  }
  return Object.freeze({ cornerPoints: Object.freeze(cornerPoints), midPoints: Object.freeze(midPoints) });
}

/**
 * Discretize a full closed loop into an ordered ring of quadratic boundary
 * edges. Shared corner points between consecutive curves are deduplicated
 * (they are the same topology vertex, never regenerated).
 *
 * @param {Readonly<object>} loop Canonical loop (`topology.js`).
 * @param {Map<string,object>} curveById
 * @param {Map<string,object>} vertexById
 * @param {{targetSize:number, chordErrorLimit:number, minimumSegmentsByCurveId?: Map<string,number>}} options
 * @returns {Readonly<{ringCorners: readonly object[], edges: readonly object[]}>}
 *          `ringCorners` is the ordered polygon corner sequence (for
 *          triangulation); `edges` pairs each consecutive corner pair with
 *          its true midside point and parent curve.
 */
export function discretizeLoop(loop, curveById, vertexById, options) {
  const minimumSegmentsByCurveId = options.minimumSegmentsByCurveId ?? new Map();
  const ringCorners = [];
  const edges = [];
  for (const curveId of loop.curveIds) {
    const curve = curveById.get(curveId);
    const minimumSegments = minimumSegmentsByCurveId.get(curveId) ?? 1;
    const segmentCount = curveSegmentCount(curve, vertexById, { ...options, minimumSegments });
    const { cornerPoints, midPoints } = discretizeCurveIntoQuadraticEdges(curve, vertexById, segmentCount);
    const startIndex = ringCorners.length > 0 ? 1 : 0; // skip the first corner: it's the previous curve's last corner
    for (let i = startIndex; i < cornerPoints.length; i += 1) ringCorners.push(cornerPoints[i]);
    for (let i = 0; i < midPoints.length; i += 1) {
      edges.push(Object.freeze({ startCorner: cornerPoints[i], endCorner: cornerPoints[i + 1], midPoint: midPoints[i], curveId }));
    }
  }
  // The ring is closed: drop the duplicated final corner (equal to the first).
  if (ringCorners.length > 1) ringCorners.pop();
  return Object.freeze({ ringCorners: Object.freeze(ringCorners), edges: Object.freeze(edges) });
}
