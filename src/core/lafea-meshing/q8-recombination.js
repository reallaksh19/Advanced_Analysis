import { edgeKey, upgradeToT6 } from './constrained-delaunay-t6.js';
import { minimumScaledJacobianOf } from './quality-gates.js';

/**
 * Optional T6-pair recombination into Q8, in caller-declared structured
 * regions only (spec §10.2: "optional recombination to Q8 in structured
 * regions"). "Structured" is a declared input flag, never auto-detected —
 * consistent with the "no hidden values" principle.
 *
 * Deterministic greedy pairing: interior (non-boundary) triangle-pair edges
 * are visited in canonical sorted order; a pair recombines into a Q8 only
 * if the merged quad is convex and its minimum scaled Jacobian is positive.
 * Triangles left unpaired remain T6 — recombination is disclosed as partial
 * per element, never forced.
 */
export function recombineToQ8(indexTriples, ringCorners, edgesByCornerPair, structured) {
  const { points, triangleTriples, boundaryEdgeKeys } = indexTriples;
  if (!structured) return upgradeToT6(points, ringCorners, triangleTriples, edgesByCornerPair);

  const triangles = triangleTriples.map((t) => [...t]);
  const edgeToTriangles = new Map();
  triangles.forEach((triangle, triangleIndex) => {
    for (let i = 0; i < 3; i += 1) {
      const key = edgeKey(triangle[i], triangle[(i + 1) % 3]);
      if (!edgeToTriangles.has(key)) edgeToTriangles.set(key, []);
      edgeToTriangles.get(key).push(triangleIndex);
    }
  });

  const paired = new Set();
  const quads = [];
  const interiorEdgeKeys = [...edgeToTriangles.keys()].filter((key) => !boundaryEdgeKeys.has(key)).sort();
  for (const key of interiorEdgeKeys) {
    const owners = edgeToTriangles.get(key);
    if (owners.length !== 2) continue;
    const [tA, tB] = owners;
    if (paired.has(tA) || paired.has(tB)) continue;
    const quadCorners = mergedQuadCornerIndices(triangles[tA], triangles[tB], key);
    if (!quadCorners) continue;
    const cornerPoints = quadCorners.map((index) => points[index]);
    if (!isConvexCcw(cornerPoints)) continue;
    const q8Nodes = buildQ8PhysicalNodes(quadCorners, points, edgesByCornerPair);
    const jacobian = minimumScaledJacobianOf('Q8', q8Nodes);
    if (!(jacobian > 0)) continue;
    paired.add(tA); paired.add(tB);
    quads.push({ quadCorners, q8Nodes });
  }

  const unpairedTriples = triangles.filter((_, index) => !paired.has(index));
  const t6Elements = upgradeToT6(points, ringCorners, unpairedTriples, edgesByCornerPair);
  const q8Elements = quads.map((quad, index) => Object.freeze({
    elementIndex: t6Elements.length + index,
    elementType: 'Q8',
    nodes: Object.freeze(quad.q8Nodes),
  }));
  return Object.freeze([...t6Elements, ...q8Elements]);
}

/**
 * The 4 corner indices of the quad formed by two triangles sharing `key`,
 * in CCW order, or `null` if the two triangles don't actually form a
 * (non-self-intersecting) quad sharing exactly that one edge.
 */
function mergedQuadCornerIndices(triangleA, triangleB, key) {
  const shared = key.split(':').map(Number);
  const apexA = triangleA.find((v) => !shared.includes(v));
  const apexB = triangleB.find((v) => !shared.includes(v));
  if (apexA === undefined || apexB === undefined) return null;
  const [s0, s1] = orderSharedForTriangle(triangleA, shared);
  // Quad boundary CCW order (see constrained-delaunay-t6.js flip derivation): s0 -> apexB -> s1 -> apexA.
  return [s0, apexB, s1, apexA];
}

function orderSharedForTriangle(triangle, shared) {
  const [a, b] = shared;
  const ia = triangle.indexOf(a); const ib = triangle.indexOf(b);
  return (ib - ia + 3) % 3 === 1 ? [a, b] : [b, a];
}

function isConvexCcw(cornerPoints) {
  const turns = cornerPoints.map((point, index) => {
    const prev = cornerPoints[(index - 1 + 4) % 4];
    const next = cornerPoints[(index + 1) % 4];
    return (point.x - prev.x) * (next.y - point.y) - (point.y - prev.y) * (next.x - point.x);
  });
  return turns.every((t) => t > 0);
}

function buildQ8PhysicalNodes(quadCorners, points, edgesByCornerPair) {
  const corners = quadCorners.map((index) => ({ x: points[index].x, y: points[index].y, sourceCornerIndex: index }));
  const midsides = [0, 1, 2, 3].map((edge) => {
    const a = quadCorners[edge]; const b = quadCorners[(edge + 1) % 4];
    const analytic = edgesByCornerPair.get(edgeKey(a, b));
    if (analytic) return { x: analytic.midPoint.point.x, y: analytic.midPoint.point.y, boundaryCurveId: analytic.curveId };
    return { x: (points[a].x + points[b].x) / 2, y: (points[a].y + points[b].y) / 2, boundaryCurveId: null };
  });
  return [...corners, ...midsides];
}
