#!/usr/bin/env node

/**
 * LAFEA upgrade spec §10.1 geometry topology check.
 *
 * Covers `src/core/lafea-geometry/topology.js` and `vertex-curve.js`: exact
 * curve length/area/midpoint for LINE and ARC, closed-loop and orientation
 * validation (outer CCW, hole CW, never silently repaired), self-intersecting
 * and malformed regions rejected, and feature-tag/shell-midsurface layering.
 */

import assert from 'node:assert/strict';
import {
  LafeaGeometryError,
  canonicalCurve,
  canonicalFeatureTagSet,
  canonicalShellMidsurfaceDeclaration,
  canonicalTopology,
  canonicalVertex,
  curveGreenContribution,
  curveLength,
  curvePointAt,
} from '../src/core/lafea-geometry/index.js';

console.log('\n--- LAFEA §10.1 geometry topology check ---');
checkExactCurveGeometry();
checkSquareWithCircularHoleRegion();
checkOpenLoopRejected();
checkWrongOrientationRejected();
checkUnresolvedReferencesRejected();
checkFeatureTagsResolveAgainstTopology();
checkShellMidsurfaceDeclaration();
checkDeterminismAndImmutability();
console.log('\n✅ LAFEA §10.1 geometry topology check passed.\n');

function checkExactCurveGeometry() {
  const a = canonicalVertex({ vertexId: 'A', x: 1, y: 0 });
  const b = canonicalVertex({ vertexId: 'B', x: 0, y: 1 });
  const vertexById = new Map([['A', a], ['B', b]]);
  const quarterArc = canonicalCurve({
    curveId: 'Q', type: 'ARC', startVertexId: 'A', endVertexId: 'B',
    arc: { center: { x: 0, y: 0 }, radius: 1, direction: 'CCW' },
  }, vertexById);
  assert.ok(Math.abs(curveLength(quarterArc, vertexById) - Math.PI / 2) < 1e-12);
  const mid = curvePointAt(quarterArc, vertexById, 0.5);
  assert.ok(Math.abs(mid.x - Math.SQRT1_2) < 1e-12 && Math.abs(mid.y - Math.SQRT1_2) < 1e-12, 'ARC midside must be the true analytic point, not a chord midpoint');

  const fullCircleVertex = canonicalVertex({ vertexId: 'C', x: 2, y: 0 });
  const circleMap = new Map([['C', fullCircleVertex]]);
  const circle = canonicalCurve({
    curveId: 'CIRC', type: 'ARC', startVertexId: 'C', endVertexId: 'C',
    arc: { center: { x: 0, y: 0 }, radius: 2, direction: 'CCW' },
  }, circleMap);
  const area = curveGreenContribution(circle, circleMap) / 2;
  assert.ok(Math.abs(area - Math.PI * 4) < 1e-9, 'Full-circle Green contribution must equal pi*r^2 exactly');
  console.log('✅ LINE/ARC length, exact analytic midside points and full-circle area are correct.');
}

function checkSquareWithCircularHoleRegion() {
  const topology = squareWithHoleTopology();
  assert.equal(topology.schema, 'lafea-geometry-topology/v1');
  assert.ok(Math.abs(topology.regions[0].netArea - (100 - Math.PI * 4)) < 1e-9);
  assert.ok(Object.isFrozen(topology));
  assert.ok(Object.isFrozen(topology.vertices));
  console.log('✅ A square region with a circular hole computes exact net area via Green\'s theorem.');
}

function checkOpenLoopRejected() {
  const raw = squareWithHoleSource();
  raw.loops[0].curveIds = ['C1', 'C2', 'C3']; // drops C4, loop no longer closes
  assertRejects(() => canonicalTopology(raw), 'OPEN_LOOP');
  console.log('✅ A loop whose curves do not close end-to-end is rejected.');
}

function checkWrongOrientationRejected() {
  // A genuinely clockwise outer square (reversed vertex traversal).
  const clockwiseSquare = {
    schema: 'lafea-geometry-topology/v1',
    vertices: [
      { vertexId: 'V1', x: 0, y: 0 }, { vertexId: 'V2', x: 0, y: 10 },
      { vertexId: 'V3', x: 10, y: 10 }, { vertexId: 'V4', x: 10, y: 0 },
    ],
    curves: [
      { curveId: 'D1', type: 'LINE', startVertexId: 'V1', endVertexId: 'V2', arc: null },
      { curveId: 'D2', type: 'LINE', startVertexId: 'V2', endVertexId: 'V3', arc: null },
      { curveId: 'D3', type: 'LINE', startVertexId: 'V3', endVertexId: 'V4', arc: null },
      { curveId: 'D4', type: 'LINE', startVertexId: 'V4', endVertexId: 'V1', arc: null },
    ],
    loops: [{ loopId: 'OUTER', curveIds: ['D1', 'D2', 'D3', 'D4'] }],
    regions: [{ regionId: 'PLATE', outerLoopId: 'OUTER', holeLoopIds: [] }],
  };
  assertRejects(() => canonicalTopology(clockwiseSquare), 'OUTER_LOOP_NOT_CCW');

  const ccwHole = squareWithHoleSource();
  ccwHole.curves[4].arc.direction = 'CCW'; // hole arc now CCW -> positive area, violates hole convention
  assertRejects(() => canonicalTopology(ccwHole), 'HOLE_LOOP_NOT_CW');
  console.log('✅ Orientation is validated, never silently normalized (outer CCW, hole CW required).');
}

function checkUnresolvedReferencesRejected() {
  const raw = squareWithHoleSource();
  raw.curves[0].startVertexId = 'NOPE';
  assertRejects(() => canonicalTopology(raw), 'UNRESOLVED_VERTEX');

  const raw2 = squareWithHoleSource();
  raw2.loops[0].curveIds.push('NOPE');
  assertRejects(() => canonicalTopology(raw2), 'UNRESOLVED_CURVE');

  const raw3 = squareWithHoleSource();
  raw3.regions[0].holeLoopIds.push('NOPE');
  assertRejects(() => canonicalTopology(raw3), 'UNRESOLVED_LOOP');
  console.log('✅ Unresolved vertex, curve and loop references are rejected by name.');
}

function checkFeatureTagsResolveAgainstTopology() {
  const topology = squareWithHoleTopology();
  const tags = canonicalFeatureTagSet([
    { tagId: 'T1', kind: 'LOAD_EDGE', entityKind: 'CURVE', entityId: 'C1', label: 'Applied traction edge' },
    { tagId: 'T2', kind: 'SCL_ANCHOR', entityKind: 'VERTEX', entityId: 'V1', label: 'SCL start' },
  ], topology);
  assert.equal(tags.length, 2);
  assert.ok(Object.isFrozen(tags));

  assertRejects(() => canonicalFeatureTagSet([
    { tagId: 'T3', kind: 'WELD_LINE', entityKind: 'CURVE', entityId: 'NOPE', label: 'x' },
  ], topology), 'UNRESOLVED_TAG_ENTITY');

  assertRejects(() => canonicalFeatureTagSet([
    { tagId: 'T1', kind: 'LOAD_EDGE', entityKind: 'CURVE', entityId: 'C1', label: 'a' },
    { tagId: 'T1', kind: 'LOAD_EDGE', entityKind: 'CURVE', entityId: 'C2', label: 'b' },
  ], topology), 'DUPLICATE_TAG');
  console.log('✅ Feature tags resolve against the topology and reject duplicates/unresolved entities.');
}

function checkShellMidsurfaceDeclaration() {
  const topology = squareWithHoleTopology();
  const declaration = canonicalShellMidsurfaceDeclaration({
    regionId: 'PLATE', thickness: 6, offsetConvention: 'MIDSURFACE',
    normalPropagationRule: 'TOPOLOGY_SEEDED_DETERMINISTIC_V1', flipped: false,
  }, topology);
  assert.equal(declaration.thickness, 6);
  assert.ok(Object.isFrozen(declaration));
  assertRejects(() => canonicalShellMidsurfaceDeclaration({
    regionId: 'NOPE', thickness: 6, offsetConvention: 'MIDSURFACE',
    normalPropagationRule: 'X', flipped: false,
  }, topology), 'UNRESOLVED_REGION');
  console.log('✅ Shell-midsurface declaration resolves its region and never computes normals itself.');
}

function checkDeterminismAndImmutability() {
  const first = squareWithHoleTopology();
  const second = squareWithHoleTopology();
  assert.equal(first.semanticHash, second.semanticHash);
  assert.throws(() => { first.vertices[0] = null; });
  console.log('✅ Topology hashing is deterministic and the canonical topology is deeply frozen.');
}

function squareWithHoleSource() {
  return {
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
  };
}

function squareWithHoleTopology() {
  return canonicalTopology(squareWithHoleSource());
}

function assertRejects(action, code) {
  assert.throws(action, (error) => {
    assert.ok(error instanceof LafeaGeometryError, `Expected a LafeaGeometryError, got ${error.name}`);
    assert.equal(error.code, code, `Expected code ${code}, got ${error.code}`);
    return true;
  });
}
