#!/usr/bin/env node

/**
 * LAFEA upgrade spec §10.1 healing preview/accept check.
 *
 * Covers `src/core/lafea-geometry/healing.js`: `previewHealing` never
 * mutates the source topology and proposes merges only within tolerance;
 * `acceptHealing` requires the exact preview it was given (stale-preview
 * rejection) and produces a re-hashed, re-canonicalized topology.
 */

import assert from 'node:assert/strict';
import { canonicalTopology, previewHealing, acceptHealing } from '../src/core/lafea-geometry/index.js';

console.log('\n--- LAFEA §10.1 healing preview/accept check ---');
checkPreviewFindsCloseVertexPairOnly();
checkPreviewNeverMutatesSource();
checkAcceptAppliesExactlyThePreview();
checkStalePreviewRejected();
checkNoCandidatesIsANoOp();
console.log('\n✅ LAFEA §10.1 healing preview/accept check passed.\n');

/**
 * A CCW square (V1..V4) plus a stray, curve-unreferenced vertex V5 sitting
 * ~7e-7 away from V3 — a deliberate near-duplicate for the healing preview
 * to find, distinct from the coincident-vertex rejection `topology.js`
 * itself enforces (that rejects only when two *curves* share exact endpoints
 * incorrectly; a stray nearby vertex is exactly what healing exists for).
 */
function squareWithStrayNearDuplicateSource() {
  return {
    schema: 'lafea-geometry-topology/v1',
    vertices: [
      { vertexId: 'V1', x: 0, y: 0 },
      { vertexId: 'V2', x: 10, y: 0 },
      { vertexId: 'V3', x: 10, y: 10 },
      { vertexId: 'V4', x: 0, y: 10 },
      { vertexId: 'V5', x: 10.0000005, y: 10.0000005 },
    ],
    curves: [
      { curveId: 'C1', type: 'LINE', startVertexId: 'V1', endVertexId: 'V2', arc: null },
      { curveId: 'C2', type: 'LINE', startVertexId: 'V2', endVertexId: 'V3', arc: null },
      { curveId: 'C3', type: 'LINE', startVertexId: 'V3', endVertexId: 'V4', arc: null },
      { curveId: 'C4', type: 'LINE', startVertexId: 'V4', endVertexId: 'V1', arc: null },
    ],
    loops: [{ loopId: 'OUTER', curveIds: ['C1', 'C2', 'C3', 'C4'] }],
    regions: [{ regionId: 'PLATE', outerLoopId: 'OUTER', holeLoopIds: [] }],
  };
}

function squareWithNoNearDuplicateSource() {
  const source = squareWithStrayNearDuplicateSource();
  source.vertices = source.vertices.filter((v) => v.vertexId !== 'V5');
  return source;
}

function checkPreviewFindsCloseVertexPairOnly() {
  const topology = canonicalTopology(squareWithStrayNearDuplicateSource());
  const preview = previewHealing(topology, 1e-3);
  assert.equal(preview.candidates.length, 1);
  assert.equal(preview.candidates[0].keepVertexId, 'V3');
  assert.equal(preview.candidates[0].mergeVertexId, 'V5');
  assert.ok(preview.candidates[0].distance < 1e-3 && preview.candidates[0].distance > 0);
  console.log('✅ previewHealing finds exactly the one near-duplicate vertex pair within tolerance.');
}

function checkPreviewNeverMutatesSource() {
  const topology = canonicalTopology(squareWithStrayNearDuplicateSource());
  const before = topology.semanticHash;
  previewHealing(topology, 1e-3);
  assert.equal(topology.semanticHash, before, 'previewHealing must not mutate or re-hash the source topology');
  assert.ok(Object.isFrozen(topology.vertices));
  console.log('✅ previewHealing proposes candidates without mutating or re-hashing the source topology.');
}

function checkAcceptAppliesExactlyThePreview() {
  const topology = canonicalTopology(squareWithStrayNearDuplicateSource());
  const preview = previewHealing(topology, 1e-3);
  const healed = acceptHealing(topology, preview);
  assert.notEqual(healed.semanticHash, topology.semanticHash);
  assert.equal(healed.vertices.length, topology.vertices.length - 1, 'Exactly one vertex should have been merged away');
  assert.equal(healed.vertices.some((v) => v.vertexId === 'V5'), false, 'The merged-away vertex must not survive');
  assert.ok(Math.abs(healed.regions[0].netArea - 100) < 1e-9, 'Merging a stray unreferenced vertex must not change the region area');
  console.log('✅ acceptHealing applies exactly the previewed merges and produces a re-hashed topology.');
}

function checkStalePreviewRejected() {
  const topology = canonicalTopology(squareWithStrayNearDuplicateSource());
  const preview = previewHealing(topology, 1e-3);
  const differentTopology = canonicalTopology(squareWithNoNearDuplicateSource());
  assert.throws(() => acceptHealing(differentTopology, preview), (error) => {
    assert.equal(error.code, 'STALE_HEALING_PREVIEW');
    return true;
  });
  console.log('✅ acceptHealing rejects a preview that does not match the topology\'s current hash.');
}

function checkNoCandidatesIsANoOp() {
  const topology = canonicalTopology(squareWithNoNearDuplicateSource());
  const preview = previewHealing(topology, 1e-9);
  assert.equal(preview.candidates.length, 0);
  const result = acceptHealing(topology, preview);
  assert.equal(result, topology, 'A no-candidate accept should return the same topology instance, not a rebuilt one');
  console.log('✅ Accepting an empty preview is a true no-op.');
}
