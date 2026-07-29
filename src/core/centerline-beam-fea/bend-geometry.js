import {
  SharedAnalysisContractError,
  add,
  cross,
  dot,
  norm,
  scale,
  subtract,
} from '../shared-analysis-contract/index.js';
import { cleanNumber } from '../shared-analysis-contract/numeric.js';

/**
 * Discretise a bend into straight chords along its arc.
 *
 * The bend is defined by its two tangent points and its arc centre. Chord end
 * points lie ON the arc, so the discretised length is shorter than the arc
 * length. The length error is reported so the caller can reject an
 * under-seeded bend rather than silently absorbing it.
 *
 * A bend is modelled downstream as a chain of straight beam elements with the
 * in-plane bending stiffness reduced by the flexibility factor (LFEA B-2) —
 * not as a curved-beam element. This function only produces the chord points;
 * it does not touch stiffness.
 *
 * @param {{x:number,y:number,z:number}} tangentStart Arc start point.
 * @param {{x:number,y:number,z:number}} tangentEnd Arc end point.
 * @param {{x:number,y:number,z:number}} centre Arc centre.
 * @param {number} segments Number of chords, from `profile.bendSeedingSegments`.
 * @returns {Readonly<{points:Array<{x:number,y:number,z:number}>, arcLength:number,
 *                     chordLength:number, lengthErrorFraction:number, radius:number,
 *                     sweepAngle:number}>}
 */
export function discretiseBend(tangentStart, tangentEnd, centre, segments) {
  if (!Number.isInteger(segments) || segments < 2) {
    throw new SharedAnalysisContractError(
      'A bend requires at least two chords; supply profile.bendSeedingSegments.',
      'BEND_SEEDING_SEGMENTS_BELOW_MINIMUM',
    );
  }
  const startRadial = subtract(tangentStart, centre);
  const endRadial = subtract(tangentEnd, centre);
  const startRadius = norm(startRadial);
  const endRadius = norm(endRadial);
  if (!(startRadius > 0) || !(endRadius > 0)) {
    throw new SharedAnalysisContractError('Bend centre must not coincide with a tangent point.', 'BEND_CENTRE_DEGENERATE');
  }
  const radiusResidual = Math.abs(startRadius - endRadius) / Math.max(startRadius, endRadius);
  if (!(radiusResidual <= 1e-9)) {
    throw new SharedAnalysisContractError(
      `Bend tangent points are not equidistant from the declared centre (relative residual ${radiusResidual}).`,
      'BEND_CENTRE_INCONSISTENT',
    );
  }
  const radius = cleanNumber(0.5 * (startRadius + endRadius));
  const axis = normalizeAxis(cross(startRadial, endRadial));
  const cosSweep = clamp(dot(startRadial, endRadial) / (startRadius * endRadius), -1, 1);
  const sweepAngle = Math.acos(cosSweep);
  if (!(sweepAngle > 0)) {
    throw new SharedAnalysisContractError('Bend sweep angle must be greater than zero.', 'BEND_SWEEP_DEGENERATE');
  }
  const points = [];
  for (let index = 0; index <= segments; index += 1) {
    const theta = (sweepAngle * index) / segments;
    points.push(add(centre, rotate(startRadial, axis, theta)));
  }
  const arcLength = cleanNumber(radius * sweepAngle);
  const chordLength = cleanNumber(chainLength(points));
  return Object.freeze({
    points: Object.freeze(points),
    arcLength,
    chordLength,
    lengthErrorFraction: cleanNumber((arcLength - chordLength) / arcLength),
    radius,
    sweepAngle,
  });
}

function rotate(vector, axis, theta) {
  const cosTheta = Math.cos(theta);
  const sinTheta = Math.sin(theta);
  const parallel = scale(axis, dot(axis, vector) * (1 - cosTheta));
  return add(add(scale(vector, cosTheta), scale(cross(axis, vector), sinTheta)), parallel);
}

function normalizeAxis(vector) {
  const length = norm(vector);
  if (!(length > 0)) {
    throw new SharedAnalysisContractError('Bend tangent points and centre must not be collinear.', 'BEND_PLANE_DEGENERATE');
  }
  return scale(vector, 1 / length);
}

function chainLength(points) {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) total += norm(subtract(points[index], points[index - 1]));
  return total;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}
