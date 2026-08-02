import assert from 'node:assert/strict';
import test from 'node:test';

import {
  collectTopologyEditSnapCandidates,
  resolveTopologyEditSceneSnap,
} from '../src/workspace/viewport-interaction/topology-edit-snap-collector.js';
import {
  createTopologyEditInteractionPreview,
} from '../src/workspace/viewport-interaction/topology-edit-interaction-preview.js';
import {
  createTopologyEditTransformIntent,
} from '../src/workspace/viewport-interaction/topology-edit-transform-intent.js';

function topology(overrides = {}) {
  return {
    canonicalTopologyHash: 'basis:1',
    nodes: [
      { id: 'node:a', position: { x: 0, y: 0, z: 0 } },
      { id: 'node:b', position: { x: 100, y: 0, z: 0 } },
      { id: 'node:c', position: { x: 50, y: 50, z: 0 } },
    ],
    edges: [
      { id: 'edge:ab', fromNodeId: 'node:a', toNodeId: 'node:b' },
    ],
    datums: [],
    ...overrides,
  };
}

function resolve(input = {}) {
  return resolveTopologyEditSceneSnap({
    topology: topology(),
    nodeId: 'node:a',
    anchorPosition: { x: 0, y: 0, z: 0 },
    pointerPoint: { x: 0, y: 0, z: 0 },
    transformMode: 'FREE',
    toleranceMm: 25,
    gridSizeMm: 25,
    ...input,
  });
}

test('collects deterministic endpoint, midpoint, centerline, datum and grid evidence', () => {
  const source = topology({
    datums: [
      { id: 'datum:origin-2', position: { x: 0, y: 25, z: 0 }, label: 'Survey datum' },
    ],
  });
  const left = collectTopologyEditSnapCandidates({
    topology: source,
    nodeId: 'node:a',
    anchorPosition: { x: 0, y: 0, z: 0 },
    pointerPoint: { x: 40, y: 0, z: 0 },
    transformMode: 'FREE',
    gridSizeMm: 25,
  });
  const right = collectTopologyEditSnapCandidates({
    topology: {
      ...source,
      nodes: [...source.nodes].reverse(),
      edges: [...source.edges].reverse(),
    },
    nodeId: 'node:a',
    anchorPosition: { x: 0, y: 0, z: 0 },
    pointerPoint: { x: 40, y: 0, z: 0 },
    transformMode: 'FREE',
    gridSizeMm: 25,
  });
  assert.deepEqual(left, right);
  assert.equal(Object.isFrozen(left), true);
  assert.deepEqual(
    [...new Set(left.map((row) => row.evidenceType))].sort(),
    ['CENTERLINE', 'ENDPOINT', 'GRID', 'MIDPOINT', 'SOURCE_DATUM'],
  );
  assert.equal(left.some((row) => row.targetCanonicalId === 'node:a'), false);
});

test('endpoint evidence outranks closer lower-authority evidence', () => {
  const result = resolve({ pointerPoint: { x: 98, y: 0, z: 0 } });
  assert.equal(result.status, 'RESOLVED');
  assert.equal(result.candidate.evidenceType, 'ENDPOINT');
  assert.equal(result.candidate.targetCanonicalId, 'node:b');
});

test('midpoint and centerline resolve without self-ambiguity', () => {
  const midpoint = resolve({ pointerPoint: { x: 50, y: 0, z: 0 } });
  assert.equal(midpoint.status, 'RESOLVED');
  assert.equal(midpoint.candidate.evidenceType, 'MIDPOINT');
  assert.equal(midpoint.candidate.targetCanonicalId, 'edge:ab');

  const centerline = resolve({ pointerPoint: { x: 40, y: 0, z: 0 } });
  assert.equal(centerline.status, 'RESOLVED');
  assert.equal(centerline.candidate.evidenceType, 'CENTERLINE');
  assert.deepEqual(centerline.candidate.position, { x: 40, y: 0, z: 0 });
});

test('axis projection and grid are deterministic fallbacks', () => {
  const axisTopology = topology({
    nodes: [
      { id: 'node:a', position: { x: 0, y: 0, z: 0 } },
      { id: 'node:b', position: { x: 100, y: 20, z: 0 } },
    ],
    edges: [],
  });
  const axis = resolve({
    topology: axisTopology,
    pointerPoint: { x: 100, y: 0, z: 0 },
    transformMode: 'AXIS_X',
    toleranceMm: 10,
  });
  assert.equal(axis.status, 'RESOLVED');
  assert.equal(axis.candidate.evidenceType, 'AXIS_PROJECTION');
  assert.deepEqual(axis.candidate.position, { x: 100, y: 0, z: 0 });

  const gridTopology = topology({
    nodes: [{ id: 'node:a', position: { x: 0, y: 0, z: 0 } }],
    edges: [],
  });
  const grid = resolve({
    topology: gridTopology,
    pointerPoint: { x: 24, y: 26, z: 0 },
    toleranceMm: 10,
  });
  assert.equal(grid.status, 'RESOLVED');
  assert.equal(grid.candidate.evidenceType, 'GRID');
  assert.deepEqual(grid.candidate.position, { x: 25, y: 25, z: 0 });
});

test('equal-priority equal-distance endpoints remain ambiguous and cannot apply', () => {
  const ambiguousTopology = topology({
    nodes: [
      { id: 'node:a', position: { x: 0, y: 20, z: 0 } },
      { id: 'node:b', position: { x: -10, y: 0, z: 0 } },
      { id: 'node:c', position: { x: 10, y: 0, z: 0 } },
    ],
    edges: [],
  });
  const resolution = resolve({
    topology: ambiguousTopology,
    anchorPosition: { x: 0, y: 20, z: 0 },
    pointerPoint: { x: 0, y: 0, z: 0 },
    toleranceMm: 10,
  });
  assert.equal(resolution.status, 'AMBIGUOUS');
  assert.equal(resolution.candidates.length, 2);
  const intent = createTopologyEditTransformIntent({
    nodeId: 'node:a',
    basisHash: ambiguousTopology.canonicalTopologyHash,
    source: 'DRAG',
    mode: 'FREE',
    anchorPosition: { x: 0, y: 20, z: 0 },
    targetPosition: { x: 0, y: 0, z: 0 },
    snapResolutionHash: resolution.resolutionHash,
    units: 'MM',
  });
  const preview = createTopologyEditInteractionPreview({ intent, snapResolution: resolution });
  assert.equal(preview.snapStatus, 'AMBIGUOUS');
  assert.equal(preview.canApply, false);
  assert.equal(preview.pickable, false);
});

test('resolved preview carries exact snap evidence and canonical target identity', () => {
  const resolution = resolve({ pointerPoint: { x: 98, y: 0, z: 0 } });
  const intent = createTopologyEditTransformIntent({
    nodeId: 'node:a',
    basisHash: 'basis:1',
    source: 'DRAG',
    mode: 'FREE',
    anchorPosition: { x: 0, y: 0, z: 0 },
    targetPosition: { x: 98, y: 0, z: 0 },
    snapResolutionHash: resolution.resolutionHash,
    units: 'MM',
  });
  const preview = createTopologyEditInteractionPreview({ intent, snapResolution: resolution });
  assert.equal(preview.snapStatus, 'RESOLVED');
  assert.equal(preview.snapEvidenceType, 'ENDPOINT');
  assert.equal(preview.snapTargetCanonicalId, 'node:b');
  assert.equal(preview.snapCandidateHash, resolution.candidate.candidateHash);
  assert.deepEqual(preview.targetPosition, { x: 100, y: 0, z: 0 });
  assert.equal(preview.canApply, true);
});
