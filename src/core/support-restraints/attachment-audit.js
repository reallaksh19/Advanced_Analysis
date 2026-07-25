import { deepFreeze, semanticHash, stringValue } from '../shared-piping-model/index.js';
import { ATTACHMENT_STATUS, SUPPORT_ATTACHMENT_AUDIT_SCHEMA } from './constants.js';

export function createSupportAttachmentAudit(projection, resolution, targets, profile) {
  const states = resolution.supportStates;
  const base = {
    schema: SUPPORT_ATTACHMENT_AUDIT_SCHEMA,
    datasetId: projection.datasetId,
    profileId: profile.profileId,
    attachedSupports: selectStates(states, ATTACHMENT_STATUS.ATTACHED),
    ambiguousSupports: selectStates(states, ATTACHMENT_STATUS.AMBIGUOUS),
    unattachedSupports: selectStates(states, ATTACHMENT_STATUS.UNATTACHED),
    invalidPositionSupports: selectStates(states, ATTACHMENT_STATUS.INVALID_SUPPORT_POSITION),
    invalidComponentGeometry: [...targets.diagnostics],
    identityConflicts: [...resolution.identityConflicts],
    unitBlockedSupports: selectStates(states, ATTACHMENT_STATUS.UNIT_BLOCKED),
    rejectedCandidates: [...resolution.rejectedCandidates],
    diagnostics: combinedDiagnostics(projection, resolution, targets),
    summary: summary(states, targets, resolution),
  };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

export function validateSupportAttachmentAudit(audit) {
  const errors = [];
  if (!audit || audit.schema !== SUPPORT_ATTACHMENT_AUDIT_SCHEMA) errors.push('Invalid support attachment audit schema.');
  if (!stringValue(audit?.datasetId)) errors.push('Support attachment audit datasetId is required.');
  [
    'attachedSupports',
    'ambiguousSupports',
    'unattachedSupports',
    'invalidPositionSupports',
    'invalidComponentGeometry',
    'identityConflicts',
    'unitBlockedSupports',
    'rejectedCandidates',
    'diagnostics',
  ].forEach((field) => {
    if (!Array.isArray(audit?.[field])) errors.push(`Support attachment audit ${field} must be an array.`);
  });
  if (audit && audit.semanticHash !== semanticHash(withoutHash(audit))) errors.push('Support attachment audit semantic hash mismatch.');
  return deepFreeze({ ok: errors.length === 0, errors });
}

function selectStates(states, status) {
  return states.filter((state) => state.status === status).map((state) => ({
    supportKey: state.supportKey,
    status: state.status,
    attachmentIds: state.attachmentIds,
    alternativeTargetIds: state.alternativeTargetIds,
    diagnostics: state.diagnostics,
  }));
}

function combinedDiagnostics(projection, resolution, targets) {
  return [
    ...projection.diagnostics,
    ...targets.diagnostics,
    ...resolution.diagnostics,
    ...resolution.identityConflicts,
  ].sort(diagnosticOrder);
}

function summary(states, targets, resolution) {
  return {
    supportCount: states.length,
    attachedCount: countStatus(states, ATTACHMENT_STATUS.ATTACHED),
    ambiguousCount: countStatus(states, ATTACHMENT_STATUS.AMBIGUOUS),
    unattachedCount: countStatus(states, ATTACHMENT_STATUS.UNATTACHED),
    invalidPositionCount: countStatus(states, ATTACHMENT_STATUS.INVALID_SUPPORT_POSITION),
    identityConflictCount: resolution.identityConflicts.length,
    unitBlockedCount: countStatus(states, ATTACHMENT_STATUS.UNIT_BLOCKED),
    invalidComponentGeometryCount: targets.diagnostics.length,
  };
}

function countStatus(states, status) {
  return states.filter((state) => state.status === status).length;
}

function diagnosticOrder(left, right) {
  return `${left.code}|${left.scope || ''}|${left.targetId || ''}`
    .localeCompare(`${right.code}|${right.scope || ''}|${right.targetId || ''}`);
}

function withoutHash(value) {
  const { semanticHash: _semanticHash, ...rest } = value || {};
  return rest;
}
