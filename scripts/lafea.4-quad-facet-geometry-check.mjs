import assert from 'node:assert/strict';
import {
  canonicalQuadFacet, quadPlanarityResidual, rawQuadFacetFrame,
} from '../src/core/local-shell/geometry.js';

/**
 * LAFEA.4 / spec §8: the planar-quad facet frame MITC4 needs. Standalone
 * unit tests, not yet wired into any dispatch — matching the "build and
 * qualify standalone, wire later" discipline already used for MITC4/MITC3
 * themselves.
 */

const profile = {
  minimumFacetArea: { absolute: 1e-12, relative: 1e-12 },
  elementNormalDirectorAlignment: { minimum: 0.8 },
  quadPlanarity: { absolute: 1e-9, relative: 1e-6 },
};

function node(nodeId, position, director = [0, 0, 1]) {
  return { nodeId, position, director };
}
const nodeMap = (nodes) => new Map(nodes.map((n) => [n.nodeId, n]));

// --- A flat unit square, declared CCW: area exact, frame orthonormal. ---
{
  const nodes = [node('A', [0, 0, 0]), node('B', [1, 0, 0]), node('C', [1, 1, 0]), node('D', [0, 1, 0])];
  const frame = rawQuadFacetFrame(nodes);
  close(frame.area, 1);
  close(dotSelf(frame.ex), 1); close(dotSelf(frame.ey), 1); close(dotSelf(frame.ez), 1);
  close(dot3(frame.ex, frame.ey), 0); close(dot3(frame.ex, frame.ez), 0); close(dot3(frame.ey, frame.ez), 0);
  close(frame.ez[2], 1); // outward +z for a CCW-declared, XY-plane, +z-director square
  console.log('✅ Flat CCW square: exact unit area, orthonormal frame, correct outward normal.');
}

// --- A general (non-rectangular) simple planar quadrilateral: the
// diagonal-cross-product area formula is exact for ANY simple planar quad,
// not just special cases. Cross-checked against the shoelace formula
// (an independent, standard area formula) computed by hand in this script,
// not by calling back into the module under test. ---
{
  const positions = [[0, 0, 0], [4, -1, 0], [5, 3, 0], [1, 2, 0]];
  const nodes = positions.map((p, i) => node(String.fromCharCode(65 + i), p));
  const frame = rawQuadFacetFrame(nodes);
  const shoelace = 0.5 * Math.abs(
    positions.reduce((sum, [x, y], i) => {
      const [nx, ny] = positions[(i + 1) % positions.length];
      return sum + (x * ny - nx * y);
    }, 0),
  );
  close(frame.area, shoelace);
  console.log(`✅ Diagonal-formula area (${frame.area.toFixed(6)}) matches an independent shoelace computation (${shoelace.toFixed(6)}).`);
}

// --- canonicalQuadFacet: declared CCW order is accepted as-is. ---
{
  const nodes = [node('A', [0, 0, 0]), node('B', [1, 0, 0]), node('C', [1, 1, 0]), node('D', [0, 1, 0])];
  const canonical = canonicalQuadFacet(['A', 'B', 'C', 'D'], nodeMap(nodes), profile, 'E1');
  assert.deepEqual(canonical.nodeIds, ['A', 'B', 'C', 'D']);
  assert.equal(canonical.areaQualification.accepted, true);
  assert.equal(canonical.planarityQualification.accepted, true);
  console.log('✅ A CCW-declared quad with matching directors is accepted with its declared node order preserved.');
}

// --- canonicalQuadFacet: a CW-declared quad is flipped to the reversed
// candidate (the only other candidate), never left as declared, since the
// director alignment check is what disambiguates. ---
{
  const nodes = [node('A', [0, 0, 0]), node('B', [0, 1, 0]), node('C', [1, 1, 0]), node('D', [1, 0, 0])];
  const canonical = canonicalQuadFacet(['A', 'B', 'C', 'D'], nodeMap(nodes), profile, 'E1');
  assert.deepEqual(canonical.nodeIds, ['A', 'D', 'C', 'B'], 'the reversed candidate must be selected');
  console.log(`✅ A CW-declared quad is resolved to its reversed candidate (${canonical.nodeIds.join(',')}), never left inconsistent with the declared directors.`);
}

// --- Incoherent directors (half point +z, half -z): neither candidate can
// satisfy alignment for every node, so this must be REJECTED, not guessed. ---
{
  const nodes = [
    node('A', [0, 0, 0], [0, 0, 1]), node('B', [1, 0, 0], [0, 0, -1]),
    node('C', [1, 1, 0], [0, 0, 1]), node('D', [0, 1, 0], [0, 0, -1]),
  ];
  assert.throws(
    () => canonicalQuadFacet(['A', 'B', 'C', 'D'], nodeMap(nodes), profile, 'E1'),
    /incoherent director alignment/,
  );
  console.log('✅ Incoherent nodal directors are rejected rather than resolved by guessing.');
}

// --- Planarity: a warped quad (one corner lifted out of plane) is
// rejected, not silently averaged into a flat facet. ---
{
  const flat = [node('A', [0, 0, 0]), node('B', [1, 0, 0]), node('C', [1, 1, 0]), node('D', [0, 1, 0])];
  const warped = [node('A', [0, 0, 0]), node('B', [1, 0, 0]), node('C', [1, 1, 0.5]), node('D', [0, 1, 0])];
  const flatFrame = rawQuadFacetFrame(flat);
  const warpedFrame = rawQuadFacetFrame(warped);
  const flatResidual = quadPlanarityResidual(flat, flatFrame);
  const warpedResidual = quadPlanarityResidual(warped, warpedFrame);
  close(flatResidual, 0);
  assert.ok(warpedResidual > 0.1, `a lifted corner must produce a real planarity residual; got ${warpedResidual}`);
  assert.throws(
    () => canonicalQuadFacet(['A', 'B', 'C', 'D'], nodeMap(warped), profile, 'E1'),
    /not sufficiently planar/,
  );
  console.log(`✅ A flat quad has zero planarity residual; a warped one (${warpedResidual.toFixed(4)}) is rejected rather than silently flattened.`);
}

// --- ex is orthogonal to ez even when the first edge is not exactly
// perpendicular to the diagonal-derived normal (a near-planar quad). ---
{
  const nodes = [node('A', [0, 0, 0]), node('B', [1, 0, 0.02]), node('C', [1, 1, 0]), node('D', [0, 1, 0])];
  const frame = rawQuadFacetFrame(nodes);
  close(dot3(frame.ex, frame.ez), 0);
  close(dotSelf(frame.ex), 1);
  console.log('✅ ex is exactly orthogonal to ez (Gram-Schmidt), even for a first edge not exactly perpendicular to the diagonal normal.');
}

console.log('\n✅ LAFEA.4 quad-facet geometry check passed.');

function dot3(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function dotSelf(v) { return dot3(v, v); }
function close(actual, expected) {
  assert.ok(Math.abs(actual - expected) <= 1e-9 * Math.max(1, Math.abs(expected)), `${actual} != ${expected}`);
}
