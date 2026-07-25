import { deepFreeze, semanticHash, stringValue } from '../shared-piping-model/index.js';
import {
  RESTRAINT_BASIS,
  RESTRAINT_DIRECTIONS,
  RESTRAINT_QUALIFICATIONS,
  RESTRAINT_STATES,
} from './constants.js';

export function classifySupportRestraint(support, attachmentState, attachments, profile) {
  const supportType = resolveSupportType(support);
  const directions = Object.fromEntries(RESTRAINT_DIRECTIONS.map((direction) => [
    direction.toLowerCase(),
    classifyDirection(direction, support, supportType, profile),
  ]));
  const diagnostics = classificationDiagnostics(support, supportType, directions);
  const qualification = qualificationFor(attachmentState, directions);
  const attachment = attachments[0] || null;
  const base = {
    supportKey: support.supportKey,
    attachmentId: attachment?.attachmentId || null,
    attachedComponentKey: attachment?.attachedComponentKey || null,
    supportType: supportType.value,
    supportTypeEvidence: supportType.evidence,
    classificationProfile: {
      profileId: profile.profileId,
      profileVersion: profile.profileVersion,
    },
    vertical: directions.vertical,
    lateral: directions.lateral,
    longitudinal: directions.longitudinal,
    rotational: directions.rotational,
    gapEvidence: support.gapEvidence,
    stiffnessEvidence: support.stiffnessEvidence,
    springRateEvidence: support.springRateEvidence,
    frictionEvidence: support.frictionEvidence,
    qualification,
    solverEligible: attachmentState?.status === 'ATTACHED' && qualification !== RESTRAINT_QUALIFICATIONS.CONFLICTED,
    diagnostics,
  };
  return deepFreeze({ restraintId: `restraint:${semanticHash(base).split(':')[1]}`, ...base });
}

function classifyDirection(direction, support, supportType, profile) {
  const key = direction.toLowerCase();
  const explicitRows = support.capabilityEvidence[key] || [];
  const gapRows = support.gapEvidence[key] || [];
  const explicit = explicitState(explicitRows, gapRows);
  if (explicit) return explicit;
  const mapped = profile.typeMapping[supportType.value]?.[direction] || RESTRAINT_STATES.UNKNOWN;
  if (mapped !== RESTRAINT_STATES.UNKNOWN) {
    return directionRecord(mapped, RESTRAINT_BASIS.TYPE, supportType.evidence);
  }
  return directionRecord(RESTRAINT_STATES.UNKNOWN, RESTRAINT_BASIS.UNRESOLVED, []);
}

function explicitState(capabilityRows, gapRows) {
  const states = capabilityRows.map((row) => parseCapability(row.value)).filter(Boolean);
  if (gapRows.length) states.push(RESTRAINT_STATES.GAP);
  const unique = [...new Set(states)];
  if (unique.length > 1) {
    return directionRecord(RESTRAINT_STATES.CONFLICT, RESTRAINT_BASIS.CONFLICT, [
      ...capabilityRows,
      ...gapRows,
    ]);
  }
  if (unique.length === 1) {
    return directionRecord(unique[0], RESTRAINT_BASIS.EXPLICIT, [
      ...capabilityRows,
      ...gapRows,
    ]);
  }
  return null;
}

function parseCapability(value) {
  const normalized = stringValue(value).toUpperCase().replace(/[ -]+/g, '_');
  const groups = {
    [RESTRAINT_STATES.RESTRAINED]: ['TRUE', 'YES', '1', 'RESTRAINED', 'FIXED', 'LOCKED'],
    [RESTRAINT_STATES.FREE]: ['FALSE', 'NO', '0', 'FREE', 'UNRESTRAINED'],
    [RESTRAINT_STATES.GAP]: ['GAP', 'LIMIT', 'LIMITED'],
    [RESTRAINT_STATES.SPRING]: ['SPRING', 'ELASTIC', 'FLEXIBLE'],
    [RESTRAINT_STATES.UNKNOWN]: ['UNKNOWN', 'UNRESOLVED'],
  };
  return Object.entries(groups).find(([, aliases]) => aliases.includes(normalized))?.[0] || null;
}

function resolveSupportType(support) {
  const rows = support.supportTypeEvidence;
  const values = [...new Set(rows.map((row) => normalizedType(row.value)).filter(Boolean))];
  if (values.length > 1) return { value: 'CONFLICT', evidence: rows, conflict: true };
  if (values.length === 1) return { value: values[0], evidence: rows, conflict: false };
  return {
    value: normalizedType(support.sourceType) || 'SUPPORT',
    evidence: [],
    conflict: false,
  };
}

function classificationDiagnostics(support, supportType, directions) {
  const rows = [];
  if (supportType.conflict) rows.push(diagnostic(
    'SUPPORT_TYPE_CONFLICT',
    support.supportKey,
    'Conflicting explicit support-type evidence remains unresolved.',
  ));
  Object.entries(directions).forEach(([direction, record]) => {
    if (record.state === RESTRAINT_STATES.CONFLICT) rows.push(diagnostic(
      'RESTRAINT_CAPABILITY_CONFLICT',
      `${support.supportKey}:${direction}`,
      'Contradictory explicit capability evidence produced CONFLICT.',
    ));
  });
  if (supportType.value === 'SPRING' && !support.stiffnessEvidence.length && !support.springRateEvidence.length) {
    rows.push(diagnostic(
      'SPRING_STIFFNESS_UNRESOLVED',
      support.supportKey,
      'Spring capability is retained without inventing stiffness.',
    ));
  }
  return rows.sort(diagnosticOrder);
}

function qualificationFor(attachmentState, directions) {
  const records = Object.values(directions);
  if (records.some((row) => row.state === RESTRAINT_STATES.CONFLICT)) return RESTRAINT_QUALIFICATIONS.CONFLICTED;
  if (attachmentState?.status !== 'ATTACHED') return RESTRAINT_QUALIFICATIONS.BLOCKED;
  const explicit = records.filter((row) => row.basis === RESTRAINT_BASIS.EXPLICIT).length;
  const inferred = records.filter((row) => row.basis === RESTRAINT_BASIS.TYPE).length;
  const unknown = records.filter((row) => row.state === RESTRAINT_STATES.UNKNOWN).length;
  if (explicit === records.length) return RESTRAINT_QUALIFICATIONS.EXPLICIT;
  if (explicit > 0) return RESTRAINT_QUALIFICATIONS.PARTIAL;
  if (inferred > 0 && unknown < records.length) return RESTRAINT_QUALIFICATIONS.TYPE;
  return RESTRAINT_QUALIFICATIONS.UNRESOLVED;
}

function directionRecord(state, basis, evidence) {
  return deepFreeze({
    state,
    basis,
    evidence: [...evidence],
  });
}

function normalizedType(value) {
  return stringValue(value).toUpperCase().replace(/[ -]+/g, '_');
}

function diagnostic(code, scope, message) {
  return deepFreeze({ code, severity: 'WARNING', scope, message });
}

function diagnosticOrder(left, right) {
  return `${left.code}|${left.scope}`.localeCompare(`${right.code}|${right.scope}`);
}
