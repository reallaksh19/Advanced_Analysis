import { deepFreeze, stringValue } from '../../core/shared-piping-model/index.js';

export const RESTRAINT_FAMILY_MAPPING = Object.freeze({
  REST: 'REST',
  HOLDOWN: 'HOLDOWN',
  HOLDDOWN: 'HOLDOWN',
  HOLD_DOWN: 'HOLDOWN',
  GUIDE: 'GUIDE',
  GUI: 'GUIDE',
  LINESTOP: 'LINE_STOP',
  LINE_STOP: 'LINE_STOP',
  LIMIT: 'LIMIT',
  LIM: 'LIMIT',
  CAN: 'CAN',
  SPRING: 'SPRING_WARNING',
  'SPRING CAN': 'SPRING_WARNING',
  'CAN SPRING': 'SPRING_WARNING',
  U_BOLT: 'U_BOLT',
  SHOE: 'SHOE',
  TRUNNION: 'TRUNNION',
  HANGER: 'HANGER',
  SPRING_HANGER: 'SPRING_HANGER',
  ANCHOR: 'ANCHOR',
});

export const RESTRAINT_FAMILY_COLORS = Object.freeze({
  REST: 0x22d3ee,
  SHOE: 0x22d3ee,
  TRUNNION: 0x22d3ee,
  HANGER: 0x22d3ee,
  GUIDE: 0x4ade80,
  LINE_STOP: 0xf59e0b,
  LIMIT: 0xf59e0b,
  ANCHOR: 0xef4444,
  HOLDOWN: 0xa78bfa,
  U_BOLT: 0xa78bfa,
  SPRING_WARNING: 0xfacc15,
  SPRING_HANGER: 0xfacc15,
  CAN: 0xfacc15,
});

export function restraintFamily(restraint = {}) {
  const rawKind = stringValue(restraint.kind || restraint.family || restraint.type).toUpperCase();
  return RESTRAINT_FAMILY_MAPPING[rawKind] || rawKind;
}

export function restraintColor(family) {
  return RESTRAINT_FAMILY_COLORS[stringValue(family).toUpperCase()] ?? 0x22d3ee;
}

export function stableRestraintId(support = {}, restraint = {}, index = 0) {
  const explicit = stringValue(restraint.id || restraint.restraintId);
  const supportId = stringValue(support.id || support.supportId);
  if (explicit) return explicit;
  if (!supportId) throw new TypeError('Stable restraint identity requires a support ID.');
  return `${supportId}:restraint:${Number(index)}`;
}

export function normalizeSupportScale(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(6, Math.max(0.25, parsed)) : 2.5;
}

export function normalizeGapMm(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function normalizeRestraintEvidence(support, restraint, index) {
  return deepFreeze({
    restraintId: stableRestraintId(support, restraint, index),
    originalKind: stringValue(restraint?.kind || restraint?.type || restraint?.family),
    family: restraintFamily(restraint),
    gapMm: normalizeGapMm(restraint?.gapMm ?? restraint?.gap),
    positiveGapMm: normalizeGapMm(restraint?.positiveGapMm),
    negativeGapMm: normalizeGapMm(restraint?.negativeGapMm),
    directionToken: stringValue(restraint?.direction || restraint?.axis).toUpperCase(),
    sourcePaths: normalizeSourcePaths(support, restraint),
  });
}

export function supportRestraintRows(support = {}) {
  if (Array.isArray(support.restraints)) return support.restraints;
  if (Array.isArray(support.restraint?.restraints)) return support.restraint.restraints;
  return support.restraint ? [support.restraint] : [];
}

function normalizeSourcePaths(support, restraint) {
  return Object.freeze([...new Set([
    ...(support?.sourcePaths || []),
    support?.sourcePath,
    ...(restraint?.sourcePaths || []),
    restraint?.sourcePath,
  ].map(stringValue).filter(Boolean))].sort());
}
