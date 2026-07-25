import { pointOnSegment, nearlyEqual, distanceM } from './geometry.js';
import { AUDIT_CODES, PRIMITIVE_TYPES, QUALIFICATION } from './constants.js';
import { diagnostic } from './diagnostics.js';

export function projectPrimitivesToPath(path, primitiveSet, loadCaseId, profile) {
  const intervals = new Map(path.componentIntervals.map((row) => [row.componentKey, row]));
  const candidates = primitiveSet.primitives.filter((row) => row.loadCaseId === loadCaseId);
  const eligible = [], blocked = [], excluded = [];
  candidates.forEach((primitive) => {
    const interval = intervals.get(primitive.componentKey);
    if (!interval) return;
    if (primitive.primitiveType === PRIMITIVE_TYPES.MOMENT) return excluded.push(primitive.primitiveId);
    if (!profile.eligiblePrimitiveTypes.includes(primitive.primitiveType)) return blocked.push(blockedPrimitive(primitive, AUDIT_CODES.LOAD_PRIMITIVE_PATH_MISMATCH));
    if (primitive.semanticDirection !== 'GRAVITY_DOWN' || primitive.globalVector !== null) return blocked.push(blockedPrimitive(primitive, AUDIT_CODES.LOAD_PRIMITIVE_PATH_MISMATCH));
    const projected = primitive.primitiveType === PRIMITIVE_TYPES.POINT
      ? projectPointPrimitive(primitive, interval, profile)
      : projectDistributedPrimitive(primitive, interval, profile);
    (projected.qualification === QUALIFICATION.READY ? eligible : blocked).push(projected);
  });
  return { eligible, blocked, excluded };
}

function projectPointPrimitive(primitive, interval, profile) {
  const geometry = interval.sourceGeometryEvidence;
  const projection = pointOnSegment(primitive.applicationPoint, geometry.entryPointM, geometry.exitPointM, profile.geometryTolerancePolicy);
  if (!projection) return blockedPrimitive(primitive, AUDIT_CODES.POINT_LOAD_STATION_UNAVAILABLE);
  return {
    qualification: QUALIFICATION.READY,
    primitiveId: primitive.primitiveId,
    primitiveType: primitive.primitiveType,
    componentKey: primitive.componentKey,
    pathStationM: interval.startStationM + projection.parameter * interval.lengthM,
    forceN: primitive.pointForceN,
    sourceEvidence: primitive.sourceEvidence,
    diagnostics: [],
  };
}

function projectDistributedPrimitive(primitive, interval, profile) {
  const geometry = interval.sourceGeometryEvidence;
  const lengthMatches = nearlyEqual(primitive.sourceLengthM, interval.lengthM, profile.geometryTolerancePolicy);
  const forward = pointsAgree(primitive.startPoint, geometry.entryPointM, profile) && pointsAgree(primitive.endPoint, geometry.exitPointM, profile);
  const reversed = pointsAgree(primitive.startPoint, geometry.exitPointM, profile) && pointsAgree(primitive.endPoint, geometry.entryPointM, profile);
  if (!lengthMatches || (!forward && !reversed)) return blockedPrimitive(primitive, AUDIT_CODES.DISTRIBUTED_LOAD_INTERVAL_UNAVAILABLE);
  return {
    qualification: QUALIFICATION.READY,
    primitiveId: primitive.primitiveId,
    primitiveType: primitive.primitiveType,
    componentKey: primitive.componentKey,
    intervalStartM: interval.startStationM,
    intervalEndM: interval.endStationM,
    forcePerLengthNM: primitive.forcePerLengthNM,
    sourceEvidence: primitive.sourceEvidence,
    diagnostics: [],
  };
}

function pointsAgree(left, right, profile) {
  if (!left || !right) return false;
  const delta = distanceM(left, right);
  if (delta === null) return false;
  const scale = Math.max(1, Math.abs(left.x), Math.abs(left.y), Math.abs(left.z), Math.abs(right.x), Math.abs(right.y), Math.abs(right.z));
  return delta <= profile.geometryTolerancePolicy.absoluteToleranceM + profile.geometryTolerancePolicy.relativeTolerance * scale;
}

function blockedPrimitive(primitive, code) {
  return {
    qualification: QUALIFICATION.BLOCKED,
    primitiveId: primitive.primitiveId,
    primitiveType: primitive.primitiveType,
    componentKey: primitive.componentKey,
    diagnostics: [diagnostic(code, primitive.primitiveId, `Primitive is blocked for screening: ${code}.`, { primitiveId: primitive.primitiveId })],
  };
}
