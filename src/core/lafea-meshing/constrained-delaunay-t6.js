import { LafeaMeshingError } from './errors.js';
import { discretizeLoop } from './boundary-discretization.js';

/**
 * Constrained Delaunay triangulation, T6 default (spec §10.2:
 * "Continuum default: Constrained Delaunay T6 with optional recombination to
 * Q8 in structured regions.").
 *
 * Scope, disclosed rather than silently approximated: this pass triangulates
 * a **simple polygon boundary** (no interior holes) — the boundary ring
 * `discretizeLoop` produces for a region with `holeLoopIds.length === 0`.
 * A region with holes is rejected with `HOLES_NOT_YET_SUPPORTED` rather than
 * triangulated incorrectly; hole-bridging is explicit follow-up scope, not a
 * hidden gap (spec §2.3: approximations are disclosed, never hidden).
 *
 * Algorithm: deterministic ear-clipping (always the first valid ear found in
 * canonical scan order — no `Math.random()`) for a topologically valid
 * triangulation of the exact boundary, then Lawson edge-flipping restricted
 * to interior edges (boundary edges are constrained and never flipped) to
 * recover the Delaunay property. Corner triangles (T3) are then upgraded to
 * T6 by inserting the true analytic midside point on every boundary edge
 * (from `discretizeLoop`) and the straight chord midpoint on every interior
 * (Delaunay-generated) edge.
 */

/**
 * The ear-clip + Lawson-flip stage only, stopping before the T6 upgrade —
 * the corner-index triangle list `q8-recombination.js` needs to find
 * edge-adjacent triangle pairs before physical midside nodes are attached.
 */
export function triangulateRegionAsIndexTriples(ringCorners) {
  if (ringCorners.length < 3) throw new LafeaMeshingError('A region boundary needs at least 3 corners', 'INSUFFICIENT_BOUNDARY_CORNERS');
  const points = ringCorners.map((corner) => corner.point);
  const triangleIndexTriples = earClipTriangulate(points);
  const boundaryEdgeKeys = boundaryEdgeKeySet(ringCorners.length);
  const flippedTriples = lawsonFlip(points, triangleIndexTriples, boundaryEdgeKeys);
  return Object.freeze({ points: Object.freeze(points), triangleTriples: Object.freeze(flippedTriples.map((t) => Object.freeze([...t]))), boundaryEdgeKeys });
}

export function triangulateRegionBoundary(ringCorners, edgesByCornerPair) {
  const { points, triangleTriples } = triangulateRegionAsIndexTriples(ringCorners);
  return upgradeToT6(points, ringCorners, triangleTriples, edgesByCornerPair);
}

/**
 * Entry point: mesh a topology region's outer loop as T6 elements. Rejects
 * a region with holes explicitly — `HOLES_NOT_YET_SUPPORTED`, not a silent
 * or incorrect triangulation.
 *
 * @param {Readonly<object>} topology Accepted `canonicalTopology` output.
 * @param {string} regionId Region to mesh.
 * @param {{targetSize:number, chordErrorLimit:number, minimumSegmentsByCurveId?: Map<string,number>}} discretizationOptions
 * @returns {readonly object[]} T6 elements.
 */
export function triangulateRegion(topology, regionId, discretizationOptions) {
  const region = topology.regions.find((candidate) => candidate.regionId === regionId);
  if (!region) throw new LafeaMeshingError(`Unresolved region: ${regionId}`, 'UNRESOLVED_REGION');
  if (region.holeLoopIds.length > 0) {
    throw new LafeaMeshingError(`Region ${regionId} has holes; hole-bridging is not yet supported`, 'HOLES_NOT_YET_SUPPORTED');
  }
  const curveById = new Map(topology.curves.map((curve) => [curve.curveId, curve]));
  const vertexById = new Map(topology.vertices.map((vertex) => [vertex.vertexId, vertex]));
  const outerLoop = topology.loops.find((loop) => loop.loopId === region.outerLoopId);
  const discretized = discretizeLoop(outerLoop, curveById, vertexById, discretizationOptions);
  const lookup = boundaryEdgeLookup(discretized.edges, discretized.ringCorners);
  return triangulateRegionBoundary(discretized.ringCorners, lookup);
}

export function earClipTriangulate(points) {
  let remaining = points.map((_, index) => index);
  const triangles = [];
  while (remaining.length > 3) {
    let clipped = false;
    for (let k = 0; k < remaining.length; k += 1) {
      const iPrev = remaining[(k - 1 + remaining.length) % remaining.length];
      const iCurr = remaining[k];
      const iNext = remaining[(k + 1) % remaining.length];
      const prev = points[iPrev]; const curr = points[iCurr]; const next = points[iNext];
      if (signedTurn(prev, curr, next) <= 0) continue;
      let containsOther = false;
      for (const idx of remaining) {
        if (idx === iPrev || idx === iCurr || idx === iNext) continue;
        if (pointInTriangleStrict(points[idx], prev, curr, next)) { containsOther = true; break; }
      }
      if (containsOther) continue;
      triangles.push([iPrev, iCurr, iNext]);
      remaining = remaining.filter((_, index) => index !== k);
      clipped = true;
      break;
    }
    if (!clipped) throw new LafeaMeshingError('Ear-clipping found no valid ear; boundary may not be simple', 'EAR_CLIP_FAILED');
  }
  triangles.push([remaining[0], remaining[1], remaining[2]]);
  return triangles;
}

function signedTurn(a, b, c) { return (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x); }

function pointInTriangleStrict(p, a, b, c) {
  const d1 = signedTurn(a, b, p);
  const d2 = signedTurn(b, c, p);
  const d3 = signedTurn(c, a, p);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

function boundaryEdgeKeySet(cornerCount) {
  const keys = new Set();
  for (let i = 0; i < cornerCount; i += 1) keys.add(edgeKey(i, (i + 1) % cornerCount));
  return keys;
}

export function edgeKey(a, b) { return a < b ? `${a}:${b}` : `${b}:${a}`; }

function inCircle(a, b, c, d) {
  const ax = a.x - d.x; const ay = a.y - d.y; const a2 = ax * ax + ay * ay;
  const bx = b.x - d.x; const by = b.y - d.y; const b2 = bx * bx + by * by;
  const cx = c.x - d.x; const cy = c.y - d.y; const c2 = cx * cx + cy * cy;
  return ax * (by * c2 - b2 * cy) - ay * (bx * c2 - b2 * cx) + a2 * (bx * cy - by * cx) > 1e-12;
}

/**
 * Lawson edge-flip refinement, restricted to non-boundary edges. Terminates
 * either when no edge violates the Delaunay in-circle condition, or after a
 * bounded number of passes (finite by construction: a flip strictly
 * decreases a discrete potential in the classical proof; the cap here is a
 * defensive, generously-sized guard, not load-bearing for termination).
 */
export function lawsonFlip(points, triangleTriples, boundaryEdgeKeys) {
  const triangles = triangleTriples.map((t) => [...t]);
  // One flip per pass: a flip mutates two triangle-array slots, which would
  // invalidate the edge->triangle index for any other edge in the same pass
  // that touches either slot. Rebuilding the index after every single flip
  // is the safe, simple fix (a stale-index bug here previously produced
  // overlapping, invalid triangles that inflated total meshed area).
  const maxPasses = Math.max(200, triangles.length * triangles.length);
  for (let pass = 0; pass < maxPasses; pass += 1) {
    const edgeToTriangles = buildEdgeToTriangleIndex(triangles);
    const edgeKeysInOrder = [...edgeToTriangles.keys()].sort();
    let flipped = false;
    for (const key of edgeKeysInOrder) {
      if (boundaryEdgeKeys.has(key)) continue;
      const owners = edgeToTriangles.get(key);
      if (owners.length !== 2) continue;
      const [tA, tB] = owners;
      const shared = key.split(':').map(Number);
      const apexA = triangles[tA].find((v) => !shared.includes(v));
      const apexB = triangles[tB].find((v) => !shared.includes(v));
      const [s0, s1] = orderSharedForTriangle(triangles[tA], shared);
      if (!inCircle(points[s0], points[s1], points[apexA], points[apexB])) continue;
      if (!isConvexQuad(points[s0], points[apexA], points[s1], points[apexB])) continue;
      triangles[tA] = [s0, apexA, apexB];
      triangles[tB] = [apexB, apexA, s1];
      normalizeOrientation(triangles[tA], points);
      normalizeOrientation(triangles[tB], points);
      flipped = true;
      break;
    }
    if (!flipped) break;
  }
  return triangles;
}

function orderSharedForTriangle(triangle, shared) {
  const [a, b] = shared;
  const ia = triangle.indexOf(a); const ib = triangle.indexOf(b);
  return (ib - ia + 3) % 3 === 1 ? [a, b] : [b, a];
}

function isConvexQuad(a, apexA, b, apexB) {
  const turns = [signedTurn(a, apexA, b), signedTurn(apexA, b, apexB), signedTurn(b, apexB, a), signedTurn(apexB, a, apexA)];
  return turns.every((t) => t > 0) || turns.every((t) => t < 0);
}

function normalizeOrientation(triangle, points) {
  const [ia, ib, ic] = triangle;
  if (signedTurn(points[ia], points[ib], points[ic]) < 0) { triangle[1] = ic; triangle[2] = ib; }
}

function buildEdgeToTriangleIndex(triangles) {
  const map = new Map();
  triangles.forEach((triangle, triangleIndex) => {
    for (let i = 0; i < 3; i += 1) {
      const key = edgeKey(triangle[i], triangle[(i + 1) % 3]);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(triangleIndex);
    }
  });
  return map;
}

/**
 * Upgrade corner-index triangles to T6 physical elements: 6 node positions
 * per element (3 corners, 3 midsides), boundary midsides from the exact
 * analytic curve, interior midsides as the straight chord midpoint.
 */
export function upgradeToT6(points, ringCorners, triangleTriples, edgesByCornerPair) {
  return triangleTriples.map((triple, elementIndex) => {
    const cornerIndices = triple;
    const cornerNodes = cornerIndices.map((index) => ({ x: points[index].x, y: points[index].y, sourceCornerIndex: index }));
    const midsideNodes = [0, 1, 2].map((edge) => {
      const a = cornerIndices[edge]; const b = cornerIndices[(edge + 1) % 3];
      const key = edgeKey(a, b);
      const analytic = edgesByCornerPair.get(key);
      if (analytic) return { x: analytic.midPoint.point.x, y: analytic.midPoint.point.y, boundaryCurveId: analytic.curveId };
      return { x: (points[a].x + points[b].x) / 2, y: (points[a].y + points[b].y) / 2, boundaryCurveId: null };
    });
    return Object.freeze({ elementIndex, elementType: 'T6', nodes: Object.freeze([...cornerNodes, ...midsideNodes]) });
  });
}

/**
 * Build the corner-pair -> boundary edge lookup `triangulateRegionBoundary`
 * needs, from `discretizeLoop`'s `edges` output. For a closed loop, edge `i`
 * always connects ring corner `i` to ring corner `(i+1) mod n` — both arrays
 * are produced by the same traversal in `discretizeLoop`, in the same order,
 * one edge per ring corner — so this is a direct positional correspondence,
 * never a coordinate- or parameter-based re-match.
 */
export function boundaryEdgeLookup(edges, ringCorners) {
  if (edges.length !== ringCorners.length) {
    throw new LafeaMeshingError('edges and ringCorners must correspond one-to-one for a closed loop', 'MISALIGNED_BOUNDARY_ARRAYS');
  }
  const lookup = new Map();
  edges.forEach((edge, index) => {
    lookup.set(edgeKey(index, (index + 1) % ringCorners.length), edge);
  });
  return lookup;
}
