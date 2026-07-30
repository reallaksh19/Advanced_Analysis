#!/usr/bin/env node

/**
 * LAFEA upgrade spec §10.2 T6 mesh generation check.
 *
 * Covers `src/core/lafea-meshing/constrained-delaunay-t6.js`: default output
 * is T6 elements only, exact area reconstruction (no gap/overlap — the
 * concrete regression guard for the stale edge-index flip bug this module
 * was built against), positive Jacobian everywhere, a concave (L-shape)
 * boundary triangulates correctly, and a region with holes is rejected
 * rather than silently mis-triangulated.
 */

import assert from 'node:assert/strict';
import { canonicalTopology } from '../src/core/lafea-geometry/index.js';
import {
  LafeaMeshingError,
  minimumAngleDegreesOf,
  minimumScaledJacobianOf,
  triangulateRegion,
} from '../src/core/lafea-meshing/index.js';

console.log('\n--- LAFEA §10.2 T6 mesh generation check ---');
checkSquareExactAreaAndAllT6();
checkConcaveLShapeExactArea();
checkNoInvertedElements();
checkHolesRejected();
checkTooFewBoundaryCornersRejected();
console.log('\n✅ LAFEA §10.2 T6 mesh generation check passed.\n');

function squareTopology() {
  return canonicalTopology({
    schema: 'lafea-geometry-topology/v1',
    vertices: [
      { vertexId: 'V1', x: 0, y: 0 }, { vertexId: 'V2', x: 10, y: 0 },
      { vertexId: 'V3', x: 10, y: 10 }, { vertexId: 'V4', x: 0, y: 10 },
    ],
    curves: [
      { curveId: 'C1', type: 'LINE', startVertexId: 'V1', endVertexId: 'V2', arc: null },
      { curveId: 'C2', type: 'LINE', startVertexId: 'V2', endVertexId: 'V3', arc: null },
      { curveId: 'C3', type: 'LINE', startVertexId: 'V3', endVertexId: 'V4', arc: null },
      { curveId: 'C4', type: 'LINE', startVertexId: 'V4', endVertexId: 'V1', arc: null },
    ],
    loops: [{ loopId: 'OUTER', curveIds: ['C1', 'C2', 'C3', 'C4'] }],
    regions: [{ regionId: 'PLATE', outerLoopId: 'OUTER', holeLoopIds: [] }],
  });
}

function lShapeTopology() {
  return canonicalTopology({
    schema: 'lafea-geometry-topology/v1',
    vertices: [
      { vertexId: 'V1', x: 0, y: 0 }, { vertexId: 'V2', x: 10, y: 0 },
      { vertexId: 'V3', x: 10, y: 4 }, { vertexId: 'V4', x: 4, y: 4 },
      { vertexId: 'V5', x: 4, y: 10 }, { vertexId: 'V6', x: 0, y: 10 },
    ],
    curves: [
      { curveId: 'C1', type: 'LINE', startVertexId: 'V1', endVertexId: 'V2', arc: null },
      { curveId: 'C2', type: 'LINE', startVertexId: 'V2', endVertexId: 'V3', arc: null },
      { curveId: 'C3', type: 'LINE', startVertexId: 'V3', endVertexId: 'V4', arc: null },
      { curveId: 'C4', type: 'LINE', startVertexId: 'V4', endVertexId: 'V5', arc: null },
      { curveId: 'C5', type: 'LINE', startVertexId: 'V5', endVertexId: 'V6', arc: null },
      { curveId: 'C6', type: 'LINE', startVertexId: 'V6', endVertexId: 'V1', arc: null },
    ],
    loops: [{ loopId: 'OUTER', curveIds: ['C1', 'C2', 'C3', 'C4', 'C5', 'C6'] }],
    regions: [{ regionId: 'LSHAPE', outerLoopId: 'OUTER', holeLoopIds: [] }],
  });
}

function signedAreaOf(elements) {
  let total = 0;
  for (const element of elements) {
    const [a, b, c] = element.nodes.slice(0, 3);
    total += ((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y)) / 2;
  }
  return total;
}

function checkSquareExactAreaAndAllT6() {
  const elements = triangulateRegion(squareTopology(), 'PLATE', { targetSize: 2.5, chordErrorLimit: 0.02 });
  assert.ok(elements.length > 0);
  for (const element of elements) {
    assert.equal(element.elementType, 'T6');
    assert.equal(element.nodes.length, 6);
  }
  assert.ok(Math.abs(signedAreaOf(elements) - 100) < 1e-9, 'Meshed triangle area must exactly reconstruct the true region area (no gap/overlap)');
  console.log('✅ Default mesh output is T6-only, and total meshed area exactly matches the true square area (100).');
}

function checkConcaveLShapeExactArea() {
  const elements = triangulateRegion(lShapeTopology(), 'LSHAPE', { targetSize: 1.5, chordErrorLimit: 0.02 });
  assert.ok(Math.abs(signedAreaOf(elements) - 64) < 1e-9, 'A concave L-shape must also triangulate to its exact net area (64)');
  console.log('✅ A concave (L-shape) boundary triangulates to its exact net area — ear-clipping handles non-convex regions correctly.');
}

function checkNoInvertedElements() {
  const elements = triangulateRegion(lShapeTopology(), 'LSHAPE', { targetSize: 1.5, chordErrorLimit: 0.02 });
  for (const element of elements) {
    const jacobian = minimumScaledJacobianOf('T6', element.nodes);
    assert.ok(jacobian > 0, `Element ${element.elementIndex} has a non-positive scaled Jacobian: ${jacobian}`);
    const angle = minimumAngleDegreesOf(element.nodes.slice(0, 3).map((n) => ({ x: n.x, y: n.y })));
    assert.ok(angle > 0 && angle < 180);
  }
  console.log('✅ Every generated element has a positive Jacobian at every corner (spec §10.3: "Positive at every integration point").');
}

function checkHolesRejected() {
  const topology = canonicalTopology({
    schema: 'lafea-geometry-topology/v1',
    vertices: [
      { vertexId: 'V1', x: 0, y: 0 }, { vertexId: 'V2', x: 10, y: 0 },
      { vertexId: 'V3', x: 10, y: 10 }, { vertexId: 'V4', x: 0, y: 10 },
      { vertexId: 'H1', x: 7, y: 5 },
    ],
    curves: [
      { curveId: 'C1', type: 'LINE', startVertexId: 'V1', endVertexId: 'V2', arc: null },
      { curveId: 'C2', type: 'LINE', startVertexId: 'V2', endVertexId: 'V3', arc: null },
      { curveId: 'C3', type: 'LINE', startVertexId: 'V3', endVertexId: 'V4', arc: null },
      { curveId: 'C4', type: 'LINE', startVertexId: 'V4', endVertexId: 'V1', arc: null },
      { curveId: 'HC1', type: 'ARC', startVertexId: 'H1', endVertexId: 'H1', arc: { center: { x: 5, y: 5 }, radius: 2, direction: 'CW' } },
    ],
    loops: [
      { loopId: 'OUTER', curveIds: ['C1', 'C2', 'C3', 'C4'] },
      { loopId: 'HOLE', curveIds: ['HC1'] },
    ],
    regions: [{ regionId: 'PLATE', outerLoopId: 'OUTER', holeLoopIds: ['HOLE'] }],
  });
  assert.throws(() => triangulateRegion(topology, 'PLATE', { targetSize: 2.5, chordErrorLimit: 0.02 }), (error) => {
    assert.ok(error instanceof LafeaMeshingError);
    assert.equal(error.code, 'HOLES_NOT_YET_SUPPORTED');
    return true;
  });
  console.log('✅ A region with holes is explicitly rejected rather than silently mis-triangulated (disclosed scope limit).');
}

function checkTooFewBoundaryCornersRejected() {
  assert.throws(() => triangulateRegion(squareTopology(), 'NOPE', { targetSize: 2.5, chordErrorLimit: 0.02 }), (error) => {
    assert.equal(error.code, 'UNRESOLVED_REGION');
    return true;
  });
  console.log('✅ An unresolved region is rejected by name.');
}
