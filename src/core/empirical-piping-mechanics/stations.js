import {
  EMPIRICAL_FORMULA_IDS,
  deepFreeze,
  requireFiniteNumber,
} from './contracts.js';
import { EMPIRICAL_FAILURE_CODES, empiricalFailure } from './failure-codes.js';

export function normalizeVector2(vector, fieldName = 'vector') {
  const x = requireFiniteNumber(vector?.x, `${fieldName}.x`);
  const y = requireFiniteNumber(vector?.y, `${fieldName}.y`);
  const magnitude = Math.hypot(x, y);
  if (!(magnitude > 0)) {
    throw empiricalFailure(
      EMPIRICAL_FAILURE_CODES.GEOMETRY_INVALID,
      `${fieldName} has zero magnitude.`,
    );
  }
  return deepFreeze({ x: x / magnitude, y: y / magnitude });
}

export function buildStraightStationFrame(start, end) {
  return normalizeVector2({ x: end.xM - start.xM, y: end.yM - start.yM }, 'straight tangent');
}

export function buildCircularBendTangent({
  nearPoint,
  centerPoint,
  sweepSign,
  stationFraction,
  includedAngleRad,
}) {
  const fraction = requireFiniteNumber(stationFraction, 'stationFraction');
  if (fraction < 0 || fraction > 1) {
    throw new RangeError('stationFraction must be between zero and one.');
  }
  if (sweepSign !== 1 && sweepSign !== -1) {
    throw new TypeError('sweepSign must be +1 or -1.');
  }
  const rx = nearPoint.xM - centerPoint.xM;
  const ry = nearPoint.yM - centerPoint.yM;
  const radius = Math.hypot(rx, ry);
  if (!(radius > 0)) {
    throw empiricalFailure(EMPIRICAL_FAILURE_CODES.GEOMETRY_INVALID, 'Bend radius is zero.');
  }
  includedAngleRad = requireFiniteNumber(includedAngleRad, 'includedAngleRad');
  const angle0 = Math.atan2(ry, rx);
  const angle = angle0 + (sweepSign * includedAngleRad * fraction);
  const radial = { x: Math.cos(angle), y: Math.sin(angle) };
  return deepFreeze({
    x: -sweepSign * radial.y,
    y: sweepSign * radial.x,
  });
}

export function projectStationForce(globalForce, tangent) {
  const unit = normalizeVector2(tangent, 'station tangent');
  const fx = requireFiniteNumber(globalForce?.xN, 'globalForce.xN');
  const fy = requireFiniteNumber(globalForce?.yN, 'globalForce.yN');
  return deepFreeze({
    tangent: unit,
    axialForceN: (fx * unit.x) + (fy * unit.y),
    formulaTrace: [EMPIRICAL_FORMULA_IDS.tangentProjection],
  });
}
