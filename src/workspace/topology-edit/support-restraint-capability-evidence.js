import { deepFreeze, stringValue } from '../../core/shared-piping-model/index.js';

const GAP_DIRECTION_BY_FAMILY = Object.freeze({
  REST: 'vertical',
  SHOE: 'vertical',
  TRUNNION: 'vertical',
  HANGER: 'vertical',
  HOLDOWN: 'vertical',
  SPRING_HANGER: 'vertical',
  CAN: 'vertical',
  SPRING_WARNING: 'vertical',
  GUIDE: 'lateral',
  U_BOLT: 'lateral',
  LINE_STOP: 'longitudinal',
  LIMIT: 'longitudinal',
});
const BLOCKING_QUALIFICATIONS = new Set(['BLOCKED', 'CONFLICTED', 'UNRESOLVED']);
const DIRECTION_KEYS = Object.freeze(['vertical', 'lateral', 'longitudinal', 'rotational']);

export function mergeEvidenceSourcePaths(support, restraint, extra = []) {
  return Object.freeze([...new Set([
    ...(support?.sourcePaths || []), support?.sourcePath,
    ...(restraint?.sourcePaths || []), restraint?.sourcePath,
    ...extra,
  ].map(stringValue).filter(Boolean))].sort(compareCodeUnits));
}

export function mergeGovernedGap(values, inheritedDiagnostics = []) {
  const accepted = values.map(normalizeGapMm).filter((value) => value !== null);
  const unique = [...new Set(accepted)].sort((left, right) => left - right);
  if (unique.length <= 1) return deepFreeze({ value: unique[0] ?? null, diagnostics: [] });
  if (inheritedDiagnostics.some((row) => row.code === 'RESTRAINT_GAP_EVIDENCE_CONFLICT')) {
    return deepFreeze({ value: null, diagnostics: [] });
  }
  return deepFreeze({
    value: null,
    diagnostics: [diagnostic(
      'RESTRAINT_GAP_EVIDENCE_CONFLICT',
      'Scalar and capability gap evidence contain conflicting values.',
    )],
  });
}

export function normalizeCapabilityRestraintEvidence(restraint = {}, family = '') {
  const diagnostics = [];
  const sourcePaths = collectEvidenceSourcePaths(restraint);
  const directionKey = GAP_DIRECTION_BY_FAMILY[String(family).toUpperCase()] || null;
  const gapRows = directionKey
    ? evidenceRows(restraint?.gapEvidence?.[directionKey], diagnostics, directionKey)
    : [];
  const gapMm = oneGovernedGap(gapRows, diagnostics, directionKey);
  const qualification = stringValue(restraint?.qualification).toUpperCase();
  if (BLOCKING_QUALIFICATIONS.has(qualification)) {
    diagnostics.push(diagnostic(
      'RESTRAINT_CAPABILITY_NOT_QUALIFIED',
      `Capability qualification is ${qualification}.`,
    ));
  }
  if (stringValue(restraint?.supportType).toUpperCase() === 'CONFLICT') {
    diagnostics.push(diagnostic(
      'RESTRAINT_FAMILY_CONFLICT',
      'Support-type authority reports conflicting family evidence.',
    ));
  }
  for (const key of DIRECTION_KEYS) {
    if (stringValue(restraint?.[key]?.state).toUpperCase() === 'CONFLICT') {
      diagnostics.push(diagnostic(
        'RESTRAINT_DIRECTION_CONFLICT',
        `${key} restraint capability is conflicted.`,
      ));
    }
  }
  return deepFreeze({ gapMm, sourcePaths, diagnostics });
}

function evidenceRows(value, diagnostics, directionKey) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    diagnostics.push(diagnostic(
      'RESTRAINT_GAP_EVIDENCE_INVALID',
      `${directionKey} gap evidence must be an array.`,
    ));
    return [];
  }
  return value;
}

function oneGovernedGap(rows, diagnostics, directionKey) {
  const accepted = [];
  for (const row of rows) {
    const unit = stringValue(row?.unit).toLowerCase();
    if (unit !== 'mm') {
      diagnostics.push(diagnostic(
        'RESTRAINT_GAP_UNIT_UNSUPPORTED',
        `${directionKey} gap evidence must be expressed in mm.`,
      ));
      continue;
    }
    const rawValue = row?.value;
    const value = rawValue === null || rawValue === undefined || rawValue === ''
      ? Number.NaN : Number(rawValue);
    if (!Number.isFinite(value) || value < 0) {
      diagnostics.push(diagnostic(
        'RESTRAINT_GAP_VALUE_INVALID',
        `${directionKey} gap evidence must be a non-negative finite number.`,
      ));
      continue;
    }
    accepted.push(value);
  }
  const unique = [...new Set(accepted)].sort((left, right) => left - right);
  if (unique.length > 1) {
    diagnostics.push(diagnostic(
      'RESTRAINT_GAP_EVIDENCE_CONFLICT',
      `${directionKey} gap evidence contains conflicting values.`,
    ));
    return null;
  }
  return unique[0] ?? null;
}

function collectEvidenceSourcePaths(restraint) {
  const values = [];
  for (const row of restraint?.supportTypeEvidence || []) values.push(row?.sourcePath);
  for (const key of DIRECTION_KEYS) {
    for (const row of restraint?.[key]?.evidence || []) values.push(row?.sourcePath);
    for (const row of restraint?.gapEvidence?.[key] || []) values.push(row?.sourcePath);
  }
  return [...new Set(values.map(stringValue).filter(Boolean))].sort(compareCodeUnits);
}

function normalizeGapMm(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function diagnostic(code, message) {
  return deepFreeze({ code, severity: 'ERROR', message });
}

function compareCodeUnits(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}
