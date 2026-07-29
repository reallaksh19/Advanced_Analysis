import {
  add,
  dot,
  norm,
  scale,
  subtract,
} from '../shared-analysis-contract/vector3.js';
import { cleanNumber } from '../shared-analysis-contract/numeric.js';
import { declaredLimitCheck, requireDeclaredValue } from '../shared-analysis-contract/declared-value.js';

/**
 * Ray-cast branch-tap connectivity — the "basic topology" idea ported from
 * `reallaksh19/3D_Converters` (`uxml/UxmlRayTopoGraphBuilder.js`, itself
 * documented there as adapted from an earlier PCF-side ray-shooter).
 *
 * The problem this solves: `piping-topology`'s existing exact/tolerance
 * stages connect two endpoints that are *coincident* — same node id, or
 * within a distance tolerance of each other. A branch tap (a tee or olet
 * branch leg) commonly is NOT coincident with the run it connects to in the
 * source data: the branch leg's declared end point sits some distance off
 * the run's surface, along the branch direction, because the source format
 * described the branch centreline rather than its physical intersection with
 * the run. No amount of tightening a coincidence tolerance finds that
 * connection; it has to be found by casting a ray from the open tap along
 * its own direction and seeing what it hits.
 *
 * This module is the geometry and ranking only — a pure, declared-limit
 * evaluation of one open face against a set of candidate faces. It does not
 * decide anything on its own (no mutation, no auto-accept): the caller
 * inspects `accepted`/`rejected` and chooses. This mirrors the source
 * engine's own design ("UXML does NOT mutate. It returns evidence and
 * candidate actions only") and this repository's fail-closed convention.
 *
 * Not wired into `piping-topology`'s staged connection-resolver pipeline in
 * this change — that pipeline's profile schema
 * (`connection-profile.js` / `TOPOLOGY_CONNECTION_PROFILE_SCHEMA`) is strict
 * and shared by every consumer of `piping-topology`, and extending it is a
 * separate, dedicated work package. This module is usable standalone today
 * (LFEA's InputXML ingestion, or any other caller with faces and a
 * declared profile) and is designed to plug into that pipeline later without
 * a rewrite: `resolveRayCandidates` takes exactly the shape a future
 * `ray-stage.js` would need.
 */

export const RAY_PROJECTION_FORMULA_IDS = Object.freeze({
  PROJECTION: 'RAY_PROJECTION_POINT_ONTO_DIRECTED_LINE',
  RANKING: 'RAY_PROJECTION_SHORTEST_VALID_HIT_WINS',
});

/**
 * Project a point onto a ray (origin + t * direction, `direction` unit).
 *
 * @param {{x:number,y:number,z:number}} origin Ray origin (the open face's point).
 * @param {{x:number,y:number,z:number}} direction Unit ray direction.
 * @param {{x:number,y:number,z:number}} point Candidate point to test.
 * @returns {Readonly<{distanceAlongRay:number, perpendicularMiss:number, projectedPoint:object}>}
 */
export function projectPointOntoRay(origin, direction, point) {
  const originToPoint = subtract(point, origin);
  const distanceAlongRay = dot(originToPoint, direction);
  const projectedPoint = add(origin, scale(direction, distanceAlongRay));
  const perpendicularMiss = norm(subtract(point, projectedPoint));
  return Object.freeze({ distanceAlongRay: cleanNumber(distanceAlongRay), perpendicularMiss, projectedPoint });
}

/**
 * Evaluate every candidate face against one open face's ray and rank the
 * valid hits by shortest distance along the ray. Declared limits only — no
 * literal tolerance in this function.
 *
 * @param {{faceId:string, point:{x:number,y:number,z:number}, direction:{x:number,y:number,z:number}}} originFace
 *        The open face to shoot a ray from. `direction` must already be a unit vector
 *        (the caller decides how it is resolved — from adjacent geometry, or a declared
 *        fallback axis; this function does not guess one).
 * @param {Array<{faceId:string, point:{x:number,y:number,z:number}}>} candidateFaces
 *        Other open faces to test. Must not include `originFace` itself.
 * @param {object} profile Declared limits: `maxRayLength`, `tubeTolerance` (both
 *        `{value, source}`, via `requireDeclaredValue`).
 * @returns {Readonly<{originFaceId:string, accepted:Array<object>, rejected:Array<object>, bestCandidate:object|null}>}
 */
export function resolveRayCandidates(originFace, candidateFaces, profile) {
  const maxRayLength = requireDeclaredValue(profile, 'maxRayLength', { exclusiveMinimum: 0 });
  const tubeTolerance = requireDeclaredValue(profile, 'tubeTolerance', { exclusiveMinimum: 0 });
  const directionNorm = norm(originFace.direction);
  if (!(Math.abs(directionNorm - 1) <= 1e-9)) {
    throw new TypeError(`resolveRayCandidates requires a unit ray direction for face ${originFace.faceId}.`);
  }

  const evaluated = candidateFaces
    .filter((candidate) => candidate.faceId !== originFace.faceId)
    .map((candidate) => evaluateCandidate(originFace, candidate, maxRayLength, tubeTolerance));

  const accepted = evaluated.filter((row) => row.rayLengthCheck.accepted && row.tubeCheck.accepted)
    .sort((a, b) => a.distanceAlongRay - b.distanceAlongRay);
  const rejected = evaluated.filter((row) => !(row.rayLengthCheck.accepted && row.tubeCheck.accepted));

  return Object.freeze({
    originFaceId: originFace.faceId,
    accepted: Object.freeze(accepted),
    rejected: Object.freeze(rejected),
    bestCandidate: accepted[0] || null,
    formulaIds: RAY_PROJECTION_FORMULA_IDS,
  });
}

function evaluateCandidate(originFace, candidate, maxRayLength, tubeTolerance) {
  const projection = projectPointOntoRay(originFace.point, originFace.direction, candidate.point);
  return Object.freeze({
    faceId: candidate.faceId,
    distanceAlongRay: projection.distanceAlongRay,
    perpendicularMiss: projection.perpendicularMiss,
    projectedPoint: projection.projectedPoint,
    // A hit behind the ray origin (distanceAlongRay <= 0) is never valid: the
    // ray is directed, not a line. AT_LEAST 0 excludes exactly zero and below.
    rayLengthCheck: distanceAlongRayCheck(projection.distanceAlongRay, maxRayLength),
    tubeCheck: declaredLimitCheck('RAY_PERPENDICULAR_MISS', projection.perpendicularMiss, tubeTolerance, 'AT_MOST'),
  });
}

function distanceAlongRayCheck(distanceAlongRay, maxRayLength) {
  const withinMax = declaredLimitCheck('RAY_MAX_LENGTH', distanceAlongRay, maxRayLength, 'AT_MOST');
  return Object.freeze({ ...withinMax, accepted: withinMax.accepted && distanceAlongRay > 0 });
}

/**
 * Resolve the 6 global axis directions as a declared fallback when no better
 * source direction is known for an open face — the same declared, named
 * fallback the source engine uses (`GLOBAL_AXIS_FALLBACK_REQUIRES_REVIEW`),
 * kept explicit here so a caller can flag results that used it.
 */
export const GLOBAL_AXIS_FALLBACK_DIRECTIONS = Object.freeze([
  Object.freeze({ x: 1, y: 0, z: 0 }),
  Object.freeze({ x: -1, y: 0, z: 0 }),
  Object.freeze({ x: 0, y: 1, z: 0 }),
  Object.freeze({ x: 0, y: -1, z: 0 }),
  Object.freeze({ x: 0, y: 0, z: 1 }),
  Object.freeze({ x: 0, y: 0, z: -1 }),
]);

/**
 * Try every declared fallback direction (in order) for a face with no better
 * known direction, returning the first one that yields an accepted
 * candidate, tagged `usedAxisFallback: true` so the caller can flag it for
 * review rather than treat it as equal-confidence to a resolved direction.
 *
 * @param {{faceId:string, point:{x:number,y:number,z:number}}} originFace
 * @param {Array<{faceId:string, point:{x:number,y:number,z:number}}>} candidateFaces
 * @param {object} profile
 * @returns {Readonly<object>|null}
 */
export function resolveRayCandidatesWithAxisFallback(originFace, candidateFaces, profile) {
  for (const direction of GLOBAL_AXIS_FALLBACK_DIRECTIONS) {
    // GLOBAL_AXIS_FALLBACK_DIRECTIONS are already unit vectors; no normalisation needed.
    const result = resolveRayCandidates({ ...originFace, direction }, candidateFaces, profile);
    if (result.bestCandidate) return Object.freeze({ ...result, direction, usedAxisFallback: true });
  }
  return null;
}
