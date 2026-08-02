import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createTopologyEditSnapCandidate,
} from '../src/workspace/viewport-interaction/topology-edit-snap-candidates.js';
import {
  resolveTopologyEditSnap,
  TOPOLOGY_EDIT_SNAP_STATUSES,
} from '../src/workspace/viewport-interaction/topology-edit-snap-resolver.js';

const BASIS = 'fnv1a64:basis000000000000';

function candidate({
  evidenceType = 'ENDPOINT',
  x = 0,
  targetCanonicalId = 'node:target',
  basisHash = BASIS,
} = {}) {
  return createTopologyEditSnapCandidate({
    basisHash,
    evidenceType,
    position: { x, y: 0, z: 0 },
    targetCanonicalId,
  });
}

test('snap ranking is stable under candidate reordering', () => {
  const endpoint = candidate({ evidenceType: 'ENDPOINT', x: 20 });
  const grid = candidate({
    evidenceType: 'GRID',
    x: 1,
    targetCanonicalId: null,
  });
  const left = resolveTopologyEditSnap({
    basisHash: BASIS,
    pointerPoint: { x: 0, y: 0, z: 0 },
    toleranceMm: 25,
    candidates: [grid, endpoint],
  });
  const right = resolveTopologyEditSnap({
    basisHash: BASIS,
    pointerPoint: { x: 0, y: 0, z: 0 },
    toleranceMm: 25,
    candidates: [endpoint, grid],
  });
  assert.equal(left.status, TOPOLOGY_EDIT_SNAP_STATUSES.RESOLVED);
  assert.equal(left.candidate.candidateHash, endpoint.candidateHash);
  assert.equal(left.resolutionHash, right.resolutionHash);
});

test('equal evidence and distance fail closed as ambiguous', () => {
  const result = resolveTopologyEditSnap({
    basisHash: BASIS,
    pointerPoint: { x: 0, y: 0, z: 0 },
    toleranceMm: 3,
    candidates: [
      candidate({ x: 3, targetCanonicalId: 'node:left' }),
      candidate({ x: -3, targetCanonicalId: 'node:right' }),
    ],
  });
  assert.equal(result.status, TOPOLOGY_EDIT_SNAP_STATUSES.AMBIGUOUS);
  assert.equal(result.candidate, null);
  assert.equal(result.candidates.length, 2);
});

test('stale candidate basis is rejected explicitly', () => {
  const result = resolveTopologyEditSnap({
    basisHash: BASIS,
    pointerPoint: { x: 0, y: 0, z: 0 },
    toleranceMm: 25,
    candidates: [candidate({ basisHash: 'fnv1a64:stale00000000000' })],
  });
  assert.equal(result.status, TOPOLOGY_EDIT_SNAP_STATUSES.STALE_BASIS);
  assert.equal(result.staleCandidateCount, 1);
});

test('tolerance boundaries are exact and deterministic', () => {
  for (const distanceMm of [0, 0.001, 3, 20, 25, 25.001, 250]) {
    const exact = resolveTopologyEditSnap({
      basisHash: BASIS,
      pointerPoint: { x: 0, y: 0, z: 0 },
      toleranceMm: distanceMm,
      candidates: [candidate({ x: distanceMm })],
    });
    assert.equal(
      exact.status,
      TOPOLOGY_EDIT_SNAP_STATUSES.RESOLVED,
      `distance ${distanceMm}`,
    );
    if (distanceMm > 0) {
      const below = resolveTopologyEditSnap({
        basisHash: BASIS,
        pointerPoint: { x: 0, y: 0, z: 0 },
        toleranceMm: distanceMm - Math.min(distanceMm, 0.0001),
        candidates: [candidate({ x: distanceMm })],
      });
      assert.equal(
        below.status,
        TOPOLOGY_EDIT_SNAP_STATUSES.UNAVAILABLE,
        `below ${distanceMm}`,
      );
    }
  }
});
