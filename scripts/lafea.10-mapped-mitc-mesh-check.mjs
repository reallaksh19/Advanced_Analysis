#!/usr/bin/env node

/**
 * LAFEA upgrade spec §10.2 mapped mesh check.
 *
 * Covers `src/core/lafea-meshing/mapped-mitc-mesh.js`: an axis-aligned
 * rectangle reproduces an exact structured Q8 grid with unit scaled
 * Jacobian and exact area; a curved boundary blends smoothly with positive
 * Jacobian everywhere; mismatched opposite-side topology is rejected
 * (the caller's declared triangular-transition fallback, never a silently
 * degraded mapped mesh).
 */

import assert from 'node:assert/strict';
import { LafeaMeshingError, mappedTransfiniteMesh, minimumScaledJacobianOf } from '../src/core/lafea-meshing/index.js';

console.log('\n--- LAFEA §10.2 mapped mesh check ---');
checkAxisAlignedRectangleExactGrid();
checkCurvedBoundarySmoothPositiveJacobian();
checkMismatchedOppositeSidesRejected();
checkNonCoincidentCornersRejected();
console.log('\n✅ LAFEA §10.2 mapped mesh check passed.\n');

function linspacePoints(x0, y0, x1, y1, n) {
  const points = [];
  for (let i = 0; i <= n; i += 1) {
    const t = i / n;
    points.push({ x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t });
  }
  return points;
}

function rectangleChains() {
  return {
    bottom: linspacePoints(0, 0, 10, 0, 8),
    top: linspacePoints(0, 4, 10, 4, 8),
    left: linspacePoints(0, 0, 0, 4, 4),
    right: linspacePoints(10, 0, 10, 4, 4),
  };
}

function quadArea(nodes) {
  const corners = nodes.slice(0, 4);
  let area = 0;
  for (let i = 0; i < 4; i += 1) {
    const p = corners[i]; const q = corners[(i + 1) % 4];
    area += p.x * q.y - q.x * p.y;
  }
  return area / 2;
}

function checkAxisAlignedRectangleExactGrid() {
  const { bottom, top, left, right } = rectangleChains();
  const mesh = mappedTransfiniteMesh(bottom, top, left, right);
  assert.equal(mesh.columns, 4);
  assert.equal(mesh.rows, 2);
  assert.equal(mesh.elements.length, 8);
  let totalArea = 0;
  for (const element of mesh.elements) {
    assert.equal(element.elementType, 'Q8');
    assert.equal(element.nodes.length, 8);
    const jacobian = minimumScaledJacobianOf('Q8', element.nodes);
    assert.ok(Math.abs(jacobian - 1) < 1e-9, `Expected unit scaled Jacobian for an axis-aligned rectangle element, got ${jacobian}`);
    totalArea += quadArea(element.nodes);
  }
  assert.ok(Math.abs(totalArea - 40) < 1e-9, 'Total meshed area must exactly equal the 10x4 rectangle area');
  console.log('✅ An axis-aligned rectangle produces an exact structured Q8 grid, unit Jacobian, exact area.');
}

function checkCurvedBoundarySmoothPositiveJacobian() {
  const bottom = linspacePoints(0, 0, 10, 0, 8);
  const top = bottom.map((point) => ({ x: point.x, y: 4 + Math.sin((point.x / 10) * Math.PI) * 1.5 }));
  const left = linspacePoints(0, 0, top[0].x, top[0].y, 4);
  const right = linspacePoints(10, 0, top[top.length - 1].x, top[top.length - 1].y, 4);
  const mesh = mappedTransfiniteMesh(bottom, top, left, right);
  for (const element of mesh.elements) {
    const jacobian = minimumScaledJacobianOf('Q8', element.nodes);
    assert.ok(jacobian > 0, `Curved-boundary mesh must have positive Jacobian everywhere, got ${jacobian}`);
  }
  // Interior grid nodes must lie strictly inside the y-range spanned by bottom/top at that column (smooth blend, not a degenerate flat interpolation).
  const midRow = mesh.grid[1];
  assert.ok(midRow.every((node, i) => node.y > 0 && node.y < top[Math.round(i)].y + 1e-6));
  console.log('✅ A curved boundary blends smoothly to a positive-Jacobian mesh everywhere.');
}

function checkMismatchedOppositeSidesRejected() {
  const { bottom, left, right } = rectangleChains();
  const shortTop = linspacePoints(0, 4, 10, 4, 6);
  assert.throws(() => mappedTransfiniteMesh(bottom, shortTop, left, right), (error) => {
    assert.ok(error instanceof LafeaMeshingError);
    assert.equal(error.code, 'MAPPED_MESH_TOPOLOGY_MISMATCH');
    return true;
  });
  console.log('✅ Mismatched opposite-side point counts are rejected — the caller falls back to triangular meshing, never a silently degraded map.');
}

function checkNonCoincidentCornersRejected() {
  const { bottom, top, right } = rectangleChains();
  const shiftedLeft = linspacePoints(0.5, 0, 0.5, 4, 4); // does not meet bottom[0]=(0,0)
  assert.throws(() => mappedTransfiniteMesh(bottom, top, shiftedLeft, right), (error) => {
    assert.equal(error.code, 'MAPPED_MESH_TOPOLOGY_MISMATCH');
    return true;
  });
  console.log('✅ Non-coincident declared corners between adjacent boundary chains are rejected.');
}
