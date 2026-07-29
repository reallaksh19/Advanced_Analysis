#!/usr/bin/env node

/**
 * Ray-cast branch-tap topology check.
 *
 * Covers `src/core/piping-topology/ray-projection.js` — the "basic topology"
 * idea adopted from `reallaksh19/3D_Converters`'s ray-shooter: finding a
 * branch tap's connection to a run when the two endpoints are not
 * coincident, which no coordinate-tolerance stage can find.
 */

import assert from 'node:assert/strict';
import { SharedAnalysisContractError } from '../src/core/shared-analysis-contract/index.js';
import {
  projectPointOntoRay,
  resolveRayCandidates,
  resolveRayCandidatesWithAxisFallback,
} from '../src/core/piping-topology/ray-projection.js';

console.log('\n--- Ray-cast branch-tap topology check ---');
checkProjectionMath();
checkAcceptanceAndRejection();
checkRankingPicksShortestHit();
checkDirectedRayRejectsBehindOrigin();
checkNonUnitDirectionRejected();
checkDeclaredLimitsRequired();
checkAxisFallback();
checkBranchTapScenario();
console.log('\n✅ Ray-cast branch-tap topology check passed.\n');

function profile(overrides = {}) {
  return {
    maxRayLength: { value: 500, source: 'TEST-PROFILE' },
    tubeTolerance: { value: 50, source: 'TEST-PROFILE' },
    ...overrides,
  };
}

function checkProjectionMath() {
  const origin = { x: 0, y: 0, z: 0 };
  const direction = { x: 1, y: 0, z: 0 };
  const onAxis = projectPointOntoRay(origin, direction, { x: 100, y: 0, z: 0 });
  assert.equal(onAxis.distanceAlongRay, 100);
  assert.equal(onAxis.perpendicularMiss, 0);

  const offAxis = projectPointOntoRay(origin, direction, { x: 100, y: 5, z: 0 });
  assert.equal(offAxis.distanceAlongRay, 100);
  assert.equal(offAxis.perpendicularMiss, 5);
  assert.deepEqual({ ...offAxis.projectedPoint }, { x: 100, y: 0, z: 0 });
  console.log('✅ Point-onto-ray projection matches hand computation for on-axis and off-axis points.');
}

function checkAcceptanceAndRejection() {
  const originFace = { faceId: 'BRANCH-1', point: { x: 0, y: 0, z: 0 }, direction: { x: 1, y: 0, z: 0 } };
  const candidates = [
    { faceId: 'RUN-END-1', point: { x: 100, y: 5, z: 0 } }, // within tube, within length
    { faceId: 'RUN-END-2', point: { x: 100, y: 60, z: 0 } }, // outside tube (60 > 50)
    { faceId: 'RUN-END-3', point: { x: 1000, y: 0, z: 0 } }, // outside max length
  ];
  const result = resolveRayCandidates(originFace, candidates, profile());
  assert.deepEqual(result.accepted.map((row) => row.faceId), ['RUN-END-1']);
  assert.deepEqual(result.rejected.map((row) => row.faceId).sort(), ['RUN-END-2', 'RUN-END-3']);
  assert.equal(result.bestCandidate.faceId, 'RUN-END-1');
  console.log('✅ A candidate outside the tube or beyond the max ray length is rejected; one within both is accepted.');
}

function checkRankingPicksShortestHit() {
  const originFace = { faceId: 'BRANCH-1', point: { x: 0, y: 0, z: 0 }, direction: { x: 1, y: 0, z: 0 } };
  const candidates = [
    { faceId: 'FAR', point: { x: 300, y: 0, z: 0 } },
    { faceId: 'NEAR', point: { x: 80, y: 0, z: 0 } },
    { faceId: 'MID', point: { x: 150, y: 0, z: 0 } },
  ];
  const result = resolveRayCandidates(originFace, candidates, profile());
  assert.deepEqual(result.accepted.map((row) => row.faceId), ['NEAR', 'MID', 'FAR']);
  assert.equal(result.bestCandidate.faceId, 'NEAR');
  console.log('✅ Multiple valid hits rank by shortest distance along the ray; the nearest wins.');
}

function checkDirectedRayRejectsBehindOrigin() {
  const originFace = { faceId: 'BRANCH-1', point: { x: 0, y: 0, z: 0 }, direction: { x: 1, y: 0, z: 0 } };
  const behind = [{ faceId: 'BEHIND', point: { x: -100, y: 0, z: 0 } }];
  const result = resolveRayCandidates(originFace, behind, profile());
  assert.equal(result.accepted.length, 0);
  assert.equal(result.rejected[0].rayLengthCheck.accepted, false);
  console.log('✅ A candidate behind the ray origin is never accepted — the ray is directed.');
}

function checkNonUnitDirectionRejected() {
  const originFace = { faceId: 'BRANCH-1', point: { x: 0, y: 0, z: 0 }, direction: { x: 2, y: 0, z: 0 } };
  assert.throws(() => resolveRayCandidates(originFace, [], profile()), TypeError);
  console.log('✅ A non-unit ray direction is rejected rather than silently used.');
}

function checkDeclaredLimitsRequired() {
  const originFace = { faceId: 'BRANCH-1', point: { x: 0, y: 0, z: 0 }, direction: { x: 1, y: 0, z: 0 } };
  assert.throws(
    () => resolveRayCandidates(originFace, [], {}),
    (error) => error instanceof SharedAnalysisContractError && error.code === 'MAX_RAY_LENGTH_NOT_DECLARED',
  );
  console.log('✅ Ray limits are declared profile values, not defaults; absent, resolution is rejected.');
}

function checkAxisFallback() {
  const originFace = { faceId: 'BRANCH-1', point: { x: 0, y: 0, z: 0 } };
  const candidates = [{ faceId: 'RUN-END', point: { x: 0, y: 0, z: 200 } }];
  const result = resolveRayCandidatesWithAxisFallback(originFace, candidates, profile());
  assert.ok(result, 'a hit along one of the six axis fallbacks must be found');
  assert.equal(result.usedAxisFallback, true);
  assert.equal(result.bestCandidate.faceId, 'RUN-END');

  const noHit = resolveRayCandidatesWithAxisFallback(originFace, [{ faceId: 'FAR', point: { x: 900, y: 900, z: 900 } }], profile());
  assert.equal(noHit, null);
  console.log('✅ Axis fallback finds a hit along one of the six global axes and flags it as such; no hit returns null.');
}

function checkBranchTapScenario() {
  // A realistic case: a run pipe centreline at y=0, radius 75 (an NPS 6-ish
  // run), and an olet branch whose declared end point sits 60mm off the run
  // surface along its own branch direction (+y) -- a common isometric
  // authoring gap. Coordinate-tolerance matching (a `piping-topology`
  // tolerance stage) would never find this: the branch tap and the point on
  // the run it should connect to are ~60mm apart, not coincident. The ray
  // cast finds it because it looks along the branch's own declared direction.
  const runSurfacePoint = { faceId: 'RUN-SURFACE', point: { x: 1000, y: 75, z: 0 } };
  const branchTap = { faceId: 'OLET-BRANCH-TAP', point: { x: 1000, y: 135, z: 0 }, direction: { x: 0, y: -1, z: 0 } };
  const result = resolveRayCandidates(branchTap, [runSurfacePoint], profile({ tubeTolerance: { value: 5, source: 'TEST-PROFILE' } }));
  assert.equal(result.bestCandidate?.faceId, 'RUN-SURFACE');
  assert.equal(result.bestCandidate.distanceAlongRay, 60);
  assert.equal(result.bestCandidate.perpendicularMiss, 0);
  console.log('✅ A branch tap not coincident with the run it connects to is found by ray cast along its own direction.');
}
