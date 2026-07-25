import { pointOnSegment } from './geometry.js';
import { AUDIT_CODES, QUALIFICATION } from './constants.js';
import { diagnostic, diagnosticOrder, uniqueSorted } from './diagnostics.js';

export function projectSupportStations(path, attachmentModel, restraintModel, profile) {
  const attachments = new Map(attachmentModel.attachments.map((row) => [row.attachmentId, row]));
  const states = new Map(attachmentModel.supportStates.map((row) => [row.supportKey, row]));
  const restraints = new Map(restraintModel.restraints.map((row) => [row.supportKey, row]));
  const targets = new Map(attachmentModel.targets.map((row) => [row.targetId, row]));
  const intervals = new Map(path.componentIntervals.map((row) => [row.componentKey, row]));
  const candidates = [];
  states.forEach((state, supportKey) => {
    const result = stationForSupport({ supportKey, state, attachments, restraints, targets, intervals, profile });
    if (result) candidates.push(result);
  });
  return finalizeStations(candidates, profile.geometryTolerancePolicy);
}

function stationForSupport(context) {
  const { supportKey, state } = context;
  if (state.status !== 'ATTACHED') return blockedSupport(supportKey, stateCode(state.status));
  if (state.attachmentIds.length !== 1) return blockedSupport(supportKey, AUDIT_CODES.SUPPORT_AMBIGUOUS);
  const attachment = context.attachments.get(state.attachmentIds[0]);
  if (!attachment) return blockedSupport(supportKey, AUDIT_CODES.SUPPORT_UNATTACHED);
  const interval = context.intervals.get(attachment.attachedComponentKey);
  if (!interval) return blockedSupport(supportKey, AUDIT_CODES.SUPPORT_PATH_MISMATCH, attachment);
  const restraint = context.restraints.get(supportKey);
  const vertical = restraint?.vertical;
  const stateBlock = verticalBlock(vertical?.state);
  if (stateBlock) return blockedSupport(supportKey, stateBlock, attachment, restraint);
  const station = stationFromAttachment(attachment, context.targets.get(attachment.targetId), interval, context.profile);
  if (station === null) return blockedSupport(supportKey, AUDIT_CODES.SUPPORT_STATION_UNAVAILABLE, attachment, restraint);
  return stationRecord(supportKey, attachment, restraint, station);
}

function stationFromAttachment(attachment, target, interval, profile) {
  const start = interval.sourceGeometryEvidence.entryPointM;
  const end = interval.sourceGeometryEvidence.exitPointM;
  const canonical = attachment.projectedPointCanonical || target?.pointCanonical || null;
  const point = canonical ? { x: canonical.x / 1000, y: canonical.y / 1000, z: canonical.z / 1000 } : null;
  if (point) {
    const projection = pointOnSegment(point, start, end, profile.geometryTolerancePolicy);
    if (projection) return interval.startStationM + projection.parameter * interval.lengthM;
  }
  const portKey = attachment.attachedPortKey || target?.portKey;
  if (portKey === interval.sourceGeometryEvidence.entryPortKey) return interval.startStationM;
  if (portKey === interval.sourceGeometryEvidence.exitPortKey) return interval.endStationM;
  return null;
}

function stationRecord(supportKey, attachment, restraint, station) {
  return {
    supportKey,
    attachmentId: attachment.attachmentId,
    restraintId: restraint.restraintId,
    pathStationM: station,
    attachedComponentKey: attachment.attachedComponentKey,
    attachedPortKey: attachment.attachedPortKey,
    attachmentEvidenceType: attachment.evidenceType,
    verticalState: restraint.vertical.state,
    verticalBasis: restraint.vertical.basis,
    restraintQualification: restraint.qualification,
    sourceEvidence: {
      attachment: attachment.sourceEvidence || null,
      attachmentDiagnostics: attachment.diagnostics || [],
      verticalEvidence: restraint.vertical.evidence || [],
    },
    qualification: QUALIFICATION.READY,
    diagnostics: [],
  };
}

function finalizeStations(rows, policy) {
  const sorted = [...rows].sort((a, b) => stationOrder(a, b));
  const duplicates = duplicateKeys(sorted, policy);
  const stations = sorted.map((row) => duplicates.has(row.supportKey)
    ? { ...row, qualification: QUALIFICATION.BLOCKED, diagnostics: [diagnostic(AUDIT_CODES.DUPLICATE_SUPPORT_STATION, row.supportKey, 'Coincident support stations are not merged.')] }
    : row);
  const qualified = stations.filter((row) => row.qualification === QUALIFICATION.READY);
  const blocked = stations.filter((row) => row.qualification !== QUALIFICATION.READY);
  return {
    supportStations: stations,
    qualifiedSupportKeys: qualified.map((row) => row.supportKey).sort(),
    blockedSupportKeys: blocked.map((row) => row.supportKey).sort(),
    diagnostics: stations.flatMap((row) => row.diagnostics).sort(diagnosticOrder),
    qualification: qualified.length >= 2 && !duplicates.size ? QUALIFICATION.READY : QUALIFICATION.BLOCKED,
    blockers: uniqueSorted([
      ...(qualified.length < 2 ? [AUDIT_CODES.INSUFFICIENT_QUALIFIED_SUPPORTS] : []),
      ...(duplicates.size ? [AUDIT_CODES.DUPLICATE_SUPPORT_STATION] : []),
      ...blocked.flatMap((row) => row.diagnostics.map((item) => item.code)),
    ]),
  };
}

function blockedSupport(supportKey, code, attachment = null, restraint = null) {
  return {
    supportKey,
    attachmentId: attachment?.attachmentId || null,
    restraintId: restraint?.restraintId || null,
    pathStationM: null,
    attachedComponentKey: attachment?.attachedComponentKey || null,
    attachedPortKey: attachment?.attachedPortKey || null,
    attachmentEvidenceType: attachment?.evidenceType || null,
    verticalState: restraint?.vertical?.state || 'UNKNOWN',
    verticalBasis: restraint?.vertical?.basis || 'UNRESOLVED',
    restraintQualification: restraint?.qualification || 'UNRESOLVED',
    sourceEvidence: {},
    qualification: QUALIFICATION.BLOCKED,
    diagnostics: [diagnostic(code, supportKey, supportMessage(code))],
  };
}

function verticalBlock(state) {
  if (state === 'RESTRAINED') return null;
  if (state === 'GAP') return AUDIT_CODES.VERTICAL_GAP_UNSUPPORTED;
  if (state === 'SPRING') return AUDIT_CODES.VERTICAL_SPRING_UNSUPPORTED;
  return AUDIT_CODES.VERTICAL_RESTRAINT_UNRESOLVED;
}
function stateCode(status) { return status === 'AMBIGUOUS' ? AUDIT_CODES.SUPPORT_AMBIGUOUS : AUDIT_CODES.SUPPORT_UNATTACHED; }
function supportMessage(code) { return `Support is blocked for screening: ${code}.`; }
function stationOrder(a, b) { return (a.pathStationM ?? Infinity) - (b.pathStationM ?? Infinity) || a.supportKey.localeCompare(b.supportKey); }
function duplicateKeys(rows, policy) {
  const result = new Set();
  for (let i = 1; i < rows.length; i += 1) {
    if (rows[i - 1].pathStationM === null || rows[i].pathStationM === null) continue;
    const scale = Math.max(1, Math.abs(rows[i - 1].pathStationM), Math.abs(rows[i].pathStationM));
    const tolerance = policy.absoluteToleranceM + policy.relativeTolerance * scale;
    if (Math.abs(rows[i].pathStationM - rows[i - 1].pathStationM) <= tolerance) {
      result.add(rows[i - 1].supportKey); result.add(rows[i].supportKey);
    }
  }
  return result;
}
