import { deepFreeze, semanticHash, stringValue } from '../shared-piping-model/index.js';
import {
  RESTRAINT_CAPABILITY_AUDIT_SCHEMA,
  RESTRAINT_QUALIFICATIONS,
  RESTRAINT_STATES,
} from './constants.js';

export function createRestraintCapabilityAudit(datasetId, restraints) {
  const base = {
    schema: RESTRAINT_CAPABILITY_AUDIT_SCHEMA,
    datasetId,
    explicitlyResolved: selectQualification(restraints, RESTRAINT_QUALIFICATIONS.EXPLICIT),
    typeClassified: selectQualification(restraints, RESTRAINT_QUALIFICATIONS.TYPE),
    partiallyResolved: selectQualification(restraints, RESTRAINT_QUALIFICATIONS.PARTIAL),
    unresolved: selectQualification(restraints, RESTRAINT_QUALIFICATIONS.UNRESOLVED),
    blockedAttachments: selectQualification(restraints, RESTRAINT_QUALIFICATIONS.BLOCKED),
    conflicted: selectQualification(restraints, RESTRAINT_QUALIFICATIONS.CONFLICTED),
    unresolvedSpringStiffness: restraints.filter(hasUnresolvedSpring).map((row) => row.supportKey),
    diagnostics: restraints.flatMap((row) => row.diagnostics).sort(diagnosticOrder),
    summary: auditSummary(restraints),
  };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

export function validateRestraintCapabilityAudit(audit) {
  const errors = [];
  if (!audit || audit.schema !== RESTRAINT_CAPABILITY_AUDIT_SCHEMA) errors.push('Invalid restraint capability audit schema.');
  if (!stringValue(audit?.datasetId)) errors.push('Restraint capability audit datasetId is required.');
  [
    'explicitlyResolved',
    'typeClassified',
    'partiallyResolved',
    'unresolved',
    'blockedAttachments',
    'conflicted',
    'unresolvedSpringStiffness',
    'diagnostics',
  ].forEach((field) => {
    if (!Array.isArray(audit?.[field])) errors.push(`Restraint capability audit ${field} must be an array.`);
  });
  if (audit && audit.semanticHash !== semanticHash(withoutHash(audit))) errors.push('Restraint capability audit semantic hash mismatch.');
  return deepFreeze({ ok: errors.length === 0, errors });
}

function selectQualification(restraints, qualification) {
  return restraints.filter((row) => row.qualification === qualification).map((row) => row.supportKey);
}

function hasUnresolvedSpring(restraint) {
  const hasSpring = ['vertical', 'lateral', 'longitudinal', 'rotational']
    .some((field) => restraint[field].state === RESTRAINT_STATES.SPRING);
  return hasSpring && !restraint.stiffnessEvidence.length && !restraint.springRateEvidence.length;
}

function auditSummary(restraints) {
  return {
    restraintCount: restraints.length,
    explicitlyResolvedCount: count(restraints, RESTRAINT_QUALIFICATIONS.EXPLICIT),
    typeClassifiedCount: count(restraints, RESTRAINT_QUALIFICATIONS.TYPE),
    partiallyResolvedCount: count(restraints, RESTRAINT_QUALIFICATIONS.PARTIAL),
    unresolvedCount: count(restraints, RESTRAINT_QUALIFICATIONS.UNRESOLVED),
    blockedAttachmentCount: count(restraints, RESTRAINT_QUALIFICATIONS.BLOCKED),
    conflictedCount: count(restraints, RESTRAINT_QUALIFICATIONS.CONFLICTED),
  };
}

function count(restraints, qualification) {
  return restraints.filter((row) => row.qualification === qualification).length;
}

function diagnosticOrder(left, right) {
  return `${left.code}|${left.scope}`.localeCompare(`${right.code}|${right.scope}`);
}

function withoutHash(value) {
  const { semanticHash: _semanticHash, ...rest } = value || {};
  return rest;
}
