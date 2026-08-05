import {
  EMPIRICAL_FORMULA_IDS,
  deepFreeze,
  requireFiniteNumber,
  requireNonEmptyString,
  requirePositiveNumber,
} from './contracts.js';
import { compileEmpiricalMember } from './member.js';
import { EMPIRICAL_FAILURE_CODES, empiricalFailure } from './failure-codes.js';

export function compileSegmentedPlanarElbow(input) {
  const id = requireNonEmptyString(input.id, 'elbow.id');
  const segmentCount = input.segmentCount ?? 8;
  if (!Number.isInteger(segmentCount) || segmentCount < 2) {
    throw new RangeError('segmentCount must be an integer of at least two.');
  }
  const center = input.centerPoint;
  const near = input.nearPoint;
  const includedAngleRad = requirePositiveNumber(input.includedAngleRad, 'includedAngleRad');
  const sweepSign = input.sweepSign;
  if (sweepSign !== 1 && sweepSign !== -1) throw new TypeError('sweepSign must be +1 or -1.');
  const rx = requireFiniteNumber(near?.xM, 'nearPoint.xM')
    - requireFiniteNumber(center?.xM, 'centerPoint.xM');
  const ry = requireFiniteNumber(near?.yM, 'nearPoint.yM')
    - requireFiniteNumber(center?.yM, 'centerPoint.yM');
  const radiusM = Math.hypot(rx, ry);
  if (!(radiusM > 0)) {
    throw empiricalFailure(EMPIRICAL_FAILURE_CODES.GEOMETRY_INVALID, 'Elbow radius must be positive.');
  }
  const startAngle = Math.atan2(ry, rx);
  const nodes = [];
  for (let index = 0; index <= segmentCount; index += 1) {
    const fraction = index / segmentCount;
    const angle = startAngle + (sweepSign * includedAngleRad * fraction);
    nodes.push(deepFreeze({
      id: index === 0
        ? requireNonEmptyString(input.nearNodeId, 'nearNodeId')
        : index === segmentCount
          ? requireNonEmptyString(input.farNodeId, 'farNodeId')
          : `${id}:S${String(index).padStart(2, '0')}`,
      xM: center.xM + (radiusM * Math.cos(angle)),
      yM: center.yM + (radiusM * Math.sin(angle)),
      stationFraction: fraction,
    }));
  }
  const physicalArcLengthM = radiusM * includedAngleRad;
  const physicalSegmentLengthM = physicalArcLengthM / segmentCount;
  const members = [];
  for (let index = 0; index < segmentCount; index += 1) {
    members.push(compileEmpiricalMember({
      id: `${id}:E${String(index + 1).padStart(2, '0')}`,
      nodeI: nodes[index],
      nodeJ: nodes[index + 1],
      kind: 'SEGMENTED_ELBOW',
      physicalMassLengthM: physicalSegmentLengthM,
      sectionStates: input.sectionStates,
      elasticModulusPa: input.elasticModulusPa,
      flexibilityFactor: input.flexibilityFactor,
      uniformGlobalLoadNM: input.uniformGlobalLoadNM,
      thermal: input.thermal,
    }));
  }
  return deepFreeze({
    id,
    segmentCount,
    centerPoint: deepFreeze({ ...center }),
    radiusM,
    includedAngleRad,
    sweepSign,
    physicalArcLengthM,
    nodes,
    members,
    formulaTrace: [EMPIRICAL_FORMULA_IDS.segmentedElbow],
  });
}
