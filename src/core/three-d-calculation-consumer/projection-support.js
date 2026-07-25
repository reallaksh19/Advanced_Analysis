import { deepFreeze } from '../shared-piping-model/index.js';
import { canonicalDiagnostics, sortedStrings } from './projection-model.js';

export function projectSupportAttachments(model) {
  const states = new Map(model.supportStates.map((row) => [row.supportKey, row]));
  const attached = model.attachments.map((row) => attachmentRow(row, states.get(row.supportKey)?.status || 'ATTACHED'));
  const unattached = model.supportStates.filter((state) => !state.attachmentIds.length)
    .map((state) => deepFreeze({
      attachmentId: null,
      supportKey: state.supportKey,
      status: state.status,
      attachedComponentKey: null,
      attachedPortKey: null,
      targetId: null,
      evidenceType: null,
      projectedPointCanonical: null,
      distanceCanonical: null,
      segmentParameter: null,
      confidence: null,
      identityCompatibility: null,
      alternativeTargetIds: sortedStrings(state.alternativeTargetIds),
      diagnostics: canonicalDiagnostics(state.diagnostics),
    }));
  return deepFreeze([...attached, ...unattached].sort(attachmentOrder));
}

export function projectRestraintCapabilities(model) {
  return deepFreeze(model.restraints.map((row) => deepFreeze({
    supportKey: row.supportKey,
    attachmentId: row.attachmentId,
    qualification: row.qualification,
    solverEligible: row.solverEligible,
    vertical: row.vertical,
    lateral: row.lateral,
    longitudinal: row.longitudinal,
    rotational: row.rotational,
    gapEvidence: row.gapEvidence,
    stiffnessEvidence: row.stiffnessEvidence,
    springEvidence: row.springRateEvidence,
    frictionEvidence: row.frictionEvidence,
    sourceEvidence: deepFreeze({ supportTypeEvidence: row.supportTypeEvidence }),
    diagnostics: canonicalDiagnostics(row.diagnostics),
  })).sort((a, b) => a.supportKey.localeCompare(b.supportKey)));
}

function attachmentRow(row, status) {
  return deepFreeze({
    attachmentId: row.attachmentId,
    supportKey: row.supportKey,
    status,
    attachedComponentKey: row.attachedComponentKey,
    attachedPortKey: row.attachedPortKey,
    targetId: row.targetId,
    evidenceType: row.evidenceType,
    projectedPointCanonical: row.projectedPointCanonical ?? null,
    distanceCanonical: row.distanceCanonical ?? null,
    segmentParameter: row.segmentParameter ?? null,
    confidence: row.confidence ?? null,
    identityCompatibility: row.identityCompatibility,
    alternativeTargetIds: sortedStrings(row.alternativeTargetIds),
    diagnostics: canonicalDiagnostics(row.diagnostics),
  });
}
function attachmentOrder(a, b) { return `${a.supportKey}\0${a.attachmentId || ''}`.localeCompare(`${b.supportKey}\0${b.attachmentId || ''}`); }
