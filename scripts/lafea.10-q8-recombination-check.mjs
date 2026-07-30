#!/usr/bin/env node

/**
 * LAFEA upgrade spec §10.2 Q8 recombination check.
 *
 * Covers `src/core/lafea-meshing/q8-recombination.js`: Q8 recombination
 * happens only when the caller explicitly declares a region `structured`
 * (never auto-detected), total meshed area is preserved exactly across
 * recombination, every resulting element (T6 and Q8) has a positive scaled
 * Jacobian, and recombination is deterministic.
 */

import assert from 'node:assert/strict';
import { canonicalTopology } from '../src/core/lafea-geometry/index.js';
import {
  boundaryEdgeLookup,
  discretizeLoop,
  minimumScaledJacobianOf,
  recombineToQ8,
  triangulateRegionAsIndexTriples,
} from '../src/core/lafea-meshing/index.js';

console.log('\n--- LAFEA §10.2 Q8 recombination check ---');
checkUnstructuredLeavesAllT6();
checkStructuredProducesMixedQ8T6WithExactArea();
checkAllElementsHavePositiveJacobianAfterRecombination();
checkRecombinationIsDeterministic();
console.log('\n✅ LAFEA §10.2 Q8 recombination check passed.\n');

function squareContext(targetSize) {
  const topology = canonicalTopology({
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
  const curveById = new Map(topology.curves.map((c) => [c.curveId, c]));
  const vertexById = new Map(topology.vertices.map((v) => [v.vertexId, v]));
  const outerLoop = topology.loops.find((l) => l.loopId === 'OUTER');
  const discretized = discretizeLoop(outerLoop, curveById, vertexById, { targetSize, chordErrorLimit: 0.02 });
  const lookup = boundaryEdgeLookup(discretized.edges, discretized.ringCorners);
  const triples = triangulateRegionAsIndexTriples(discretized.ringCorners);
  return { triples, ringCorners: discretized.ringCorners, lookup };
}

function signedAreaOf(elements) {
  let total = 0;
  for (const element of elements) {
    const cornerCount = element.elementType === 'Q8' ? 4 : 3;
    const corners = element.nodes.slice(0, cornerCount);
    let area = 0;
    for (let i = 0; i < cornerCount; i += 1) {
      const p = corners[i]; const q = corners[(i + 1) % cornerCount];
      area += p.x * q.y - q.x * p.y;
    }
    total += area / 2;
  }
  return total;
}

function checkUnstructuredLeavesAllT6() {
  const { triples, ringCorners, lookup } = squareContext(2.5);
  const elements = recombineToQ8(triples, ringCorners, lookup, false);
  assert.ok(elements.every((e) => e.elementType === 'T6'), 'structured=false must never recombine (declared, not auto-detected)');
  console.log('✅ Recombination never happens unless the region is explicitly declared structured.');
}

function checkStructuredProducesMixedQ8T6WithExactArea() {
  const { triples, ringCorners, lookup } = squareContext(2.5);
  const elements = recombineToQ8(triples, ringCorners, lookup, true);
  const types = new Set(elements.map((e) => e.elementType));
  assert.ok(types.has('Q8'), 'Expected at least one recombined Q8 element');
  assert.ok(Math.abs(signedAreaOf(elements) - 100) < 1e-9, 'Recombination must not change total meshed area');
  for (const element of elements) assert.equal(element.nodes.length, element.elementType === 'Q8' ? 8 : 6);
  console.log('✅ A structured region recombines into a mix of Q8/T6 elements with exactly preserved total area.');
}

function checkAllElementsHavePositiveJacobianAfterRecombination() {
  const { triples, ringCorners, lookup } = squareContext(2.5);
  const elements = recombineToQ8(triples, ringCorners, lookup, true);
  for (const element of elements) {
    const jacobian = minimumScaledJacobianOf(element.elementType, element.nodes);
    assert.ok(jacobian > 0, `${element.elementType} element ${element.elementIndex} has non-positive Jacobian: ${jacobian}`);
  }
  console.log('✅ Every element (T6 and recombined Q8) has a positive scaled Jacobian.');
}

function checkRecombinationIsDeterministic() {
  const contextA = squareContext(2.5);
  const contextB = squareContext(2.5);
  const elementsA = recombineToQ8(contextA.triples, contextA.ringCorners, contextA.lookup, true);
  const elementsB = recombineToQ8(contextB.triples, contextB.ringCorners, contextB.lookup, true);
  assert.equal(JSON.stringify(elementsA), JSON.stringify(elementsB));
  console.log('✅ Q8 recombination is deterministic (byte-identical across repeated runs).');
}
