import { deepFreeze } from '../shared-piping-model/index.js';
import { AUDIT_CODES, ELIGIBLE_LOAD_TYPES, QUALIFICATION } from './constants.js';
import { diagnostic, uniqueSorted } from './diagnostics.js';
import { pointOnSegment, pointsAgree } from './geometry.js';
import { nearlyEqual } from './numeric.js';

export function projectBeamLoads(path, primitiveSet, loadCaseId, profile) {
  const intervals = new Map(path.componentIntervals.map((row) => [row.componentKey, row]));
  const rows = primitiveSet.primitives.filter((row) => row.loadCaseId === loadCaseId && intervals.has(row.componentKey));
  const eligible = [], blocked = [], excluded = [];
  rows.forEach((primitive) => {
    if (primitive.primitiveType === 'EXPLICIT_POINT_MOMENT') {
      blocked.push(blockedPrimitive(primitive, AUDIT_CODES.POINT_MOMENT_UNSUPPORTED));
      return;
    }
    if (!ELIGIBLE_LOAD_TYPES.includes(primitive.primitiveType)
      || primitive.semanticDirection !== 'GRAVITY_DOWN' || primitive.globalVector !== null) {
      blocked.push(blockedPrimitive(primitive, AUDIT_CODES.LOAD_PRIMITIVE_PATH_MISMATCH));
      return;
    }
    const interval = intervals.get(primitive.componentKey);
    const projected = primitive.primitiveType === 'POINT_GRAVITY_LOAD'
      ? projectPoint(primitive, interval, profile)
      : projectDistributed(primitive, interval, profile);
    (projected.qualification === QUALIFICATION.READY ? eligible : blocked).push(projected);
  });
  return deepFreeze({
    eligible: eligible.sort(projectionOrder), blocked: blocked.sort(projectionOrder), excluded,
    blockers: uniqueSorted(blocked.flatMap((row) => row.diagnostics.map((item) => item.code))),
  });
}

export function primitivePathIntegrity(pathModel, primitiveSet) {
  const memberships = componentPathMemberships(pathModel);
  const mismatches = primitiveSet.primitives
    .filter((primitive) => primitive.primitiveType !== 'EXPLICIT_POINT_MOMENT')
    .map((primitive) => mismatchRecord(primitive, memberships))
    .filter(Boolean)
    .sort((a, b) => a.primitiveId.localeCompare(b.primitiveId));
  return deepFreeze({
    rows: mismatches.filter((row) => row.pathIds.length > 0),
    diagnostics: mismatches.map((row) => diagnostic(
      AUDIT_CODES.LOAD_PRIMITIVE_PATH_MISMATCH, row.primitiveId,
      'Primitive component does not belong to exactly one qualified topology-local path.', row, 'WARNING',
    )),
  });
}

function componentPathMemberships(pathModel) {
  const memberships = new Map();
  pathModel.paths.forEach((path) => path.orderedComponentKeys.forEach((key) => {
    const rows = memberships.get(key) || [];
    rows.push(path.pathId);
    memberships.set(key, rows);
  }));
  return memberships;
}

function mismatchRecord(primitive, memberships) {
  const pathIds = memberships.get(primitive.componentKey) || [];
  if (pathIds.length === 1) return null;
  return deepFreeze({
    primitiveId: primitive.primitiveId,
    loadCaseId: primitive.loadCaseId,
    componentKey: primitive.componentKey,
    pathIds: [...pathIds].sort(),
  });
}

function projectPoint(primitive, interval, profile) {
  const geometry = interval.sourceGeometryEvidence;
  const projection = pointOnSegment(
    primitive.applicationPoint, geometry.entryPointM, geometry.exitPointM, profile.geometryTolerancePolicy,
  );
  if (!projection) return blockedPrimitive(primitive, AUDIT_CODES.POINT_LOAD_MAPPING_FAILED);
  return deepFreeze({
    qualification: QUALIFICATION.READY, primitiveId: primitive.primitiveId,
    primitiveType: primitive.primitiveType, componentKey: primitive.componentKey,
    pathStationM: interval.startStationM + projection.parameter * interval.lengthM,
    pointForceN: primitive.pointForceN, sourceEvidence: primitive.sourceEvidence,
    diagnostics: [],
  });
}

function projectDistributed(primitive, interval, profile) {
  const geometry = interval.sourceGeometryEvidence;
  const forward = pointsAgree(primitive.startPoint, geometry.entryPointM, profile.geometryTolerancePolicy)
    && pointsAgree(primitive.endPoint, geometry.exitPointM, profile.geometryTolerancePolicy);
  const reverse = pointsAgree(primitive.startPoint, geometry.exitPointM, profile.geometryTolerancePolicy)
    && pointsAgree(primitive.endPoint, geometry.entryPointM, profile.geometryTolerancePolicy);
  const lengthOk = nearlyEqual(primitive.sourceLengthM, interval.lengthM, profile.geometryTolerancePolicy);
  if ((!forward && !reverse) || !lengthOk || !Number.isFinite(primitive.forcePerLengthNM)) {
    return blockedPrimitive(primitive, AUDIT_CODES.DISTRIBUTED_LOAD_MAPPING_FAILED);
  }
  return deepFreeze({
    qualification: QUALIFICATION.READY, primitiveId: primitive.primitiveId,
    primitiveType: primitive.primitiveType, componentKey: primitive.componentKey,
    intervalStartM: interval.startStationM, intervalEndM: interval.endStationM,
    forcePerLengthNM: primitive.forcePerLengthNM, sourceEvidence: primitive.sourceEvidence,
    diagnostics: [],
  });
}

function blockedPrimitive(primitive, code) {
  return deepFreeze({
    qualification: QUALIFICATION.BLOCKED, primitiveId: primitive.primitiveId,
    primitiveType: primitive.primitiveType, componentKey: primitive.componentKey,
    diagnostics: [diagnostic(code, primitive.primitiveId, `Beam load is blocked: ${code}.`, { primitiveId: primitive.primitiveId, componentKey: primitive.componentKey })],
  });
}
function projectionOrder(a, b) { return a.primitiveId.localeCompare(b.primitiveId); }
