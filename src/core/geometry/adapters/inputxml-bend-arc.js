import {
  add,
  dot,
  norm,
  scale,
  subtract,
} from '../../shared-analysis-contract/vector3.js';
import { cleanNumber } from '../../shared-analysis-contract/numeric.js';

/**
 * Resolve a bend's arc centre from its two tangent points and the direction
 * of travel arriving at the first one.
 *
 * A radius and two tangent points alone do not fix a unique circle — an
 * infinite family of circles of that radius passes through two points, one
 * for every plane through the chord. What fixes the plane, and therefore the
 * centre, is that a tangent point's radius vector is perpendicular to the
 * direction of travel there (`(C - P1) . dIn = 0`). That single condition,
 * together with `|C - P1| = R`, is enough:
 *
 *   v          = P2 - P1                        (chord)
 *   vPerp      = v - (v . dIn) dIn               (component of v across the incoming tangent)
 *   n          = normalize(vPerp)                (direction from P1 to the centre)
 *   halfSweep  = angle between dIn and v          (tangent-chord angle theorem: this
 *                                                   equals half the arc's central angle)
 *   R_computed = |v| / (2 sin(halfSweep))
 *   C          = P1 + R_computed * n
 *
 * This derives the radius from the geometry rather than trusting the
 * declared one, so the declared value becomes a check, not an input — a
 * declared radius that disagrees with the geometry is a modelling conflict,
 * not something to silently prefer one side of.
 *
 * Returns `null` for a degenerate case (incoming direction not a unit
 * vector, the chord parallel to the incoming direction — no real turn, or a
 * zero-length chord) rather than throwing: the caller decides whether "could
 * not resolve a centre" is fatal or just means the bend stays span-limited
 * instead of curvature-seeded.
 *
 * @param {{x:number,y:number,z:number}} incomingDirection Unit vector, direction of
 *        travel arriving at `tangentStart`.
 * @param {{x:number,y:number,z:number}} tangentStart Arc start point.
 * @param {{x:number,y:number,z:number}} tangentEnd Arc end point.
 * @returns {Readonly<{centre:{x:number,y:number,z:number}, computedRadius:number,
 *                     sweepAngle:number}>|null}
 */
export function resolveBendArcCentre(incomingDirection, tangentStart, tangentEnd) {
  const incomingNorm = norm(incomingDirection);
  if (!(Math.abs(incomingNorm - 1) <= 1e-9)) return null;

  const chord = subtract(tangentEnd, tangentStart);
  const chordLength = norm(chord);
  if (!(chordLength > 0)) return null;

  const alongIncoming = dot(chord, incomingDirection);
  const perpendicular = subtract(chord, scale(incomingDirection, alongIncoming));
  const perpendicularLength = norm(perpendicular);
  if (!(perpendicularLength > 1e-9)) return null; // chord parallel to dIn: no real turn.

  const n = scale(perpendicular, 1 / perpendicularLength);
  const cosHalfSweep = clamp(alongIncoming / chordLength, -1, 1);
  const sinHalfSweep = perpendicularLength / chordLength;
  const computedRadius = cleanNumber(chordLength / (2 * sinHalfSweep));
  const centre = add(tangentStart, scale(n, computedRadius));

  return Object.freeze({
    centre,
    computedRadius,
    sweepAngle: cleanNumber(2 * Math.acos(cosHalfSweep)),
  });
}

/**
 * Cross-check a computed radius against a declared one.
 *
 * @param {number} computedRadius From `resolveBendArcCentre`.
 * @param {number} declaredRadius From the source format (e.g. InputXML `BEND RADIUS`).
 * @param {number} relativeTolerance Maximum allowed relative disagreement.
 * @returns {Readonly<{computedRadius:number, declaredRadius:number, relativeDeviation:number, accepted:boolean}>}
 */
export function checkDeclaredRadius(computedRadius, declaredRadius, relativeTolerance) {
  const scaleValue = Math.max(Math.abs(computedRadius), Math.abs(declaredRadius), Number.MIN_VALUE);
  const relativeDeviation = cleanNumber(Math.abs(computedRadius - declaredRadius) / scaleValue);
  return Object.freeze({
    computedRadius,
    declaredRadius,
    relativeDeviation,
    accepted: relativeDeviation <= relativeTolerance,
  });
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}
