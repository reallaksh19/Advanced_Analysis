import { deepFreeze } from '../../core/shared-piping-model/index.js';

export function createSupportGlyphEvidence(input = {}) {
  const supportId = requiredText(input.supportId, 'SUPPORT_ID_MISSING');
  return deepFreeze({
    supportId,
    supportStatus: requiredText(input.supportStatus, 'SUPPORT_STATUS_MISSING'),
    hostEntityId: optionalText(input.hostEntityId),
    sourcePaths: stringArray(input.sourcePaths, 'SUPPORT_SOURCE_PATHS_INVALID'),
  });
}

export function createRestraintGlyphEvidence(input = {}) {
  return deepFreeze({
    supportId: requiredText(input.supportId, 'SUPPORT_ID_MISSING'),
    restraintId: requiredText(input.restraintId, 'RESTRAINT_ID_MISSING'),
    restraintFamily: requiredText(input.restraintFamily, 'RESTRAINT_FAMILY_MISSING'),
    restraintStatus: requiredText(input.restraintStatus, 'RESTRAINT_STATUS_MISSING'),
    sourcePaths: stringArray(input.sourcePaths, 'RESTRAINT_SOURCE_PATHS_INVALID'),
    positiveContactPoint: optionalPoint(
      input.positiveContactPoint,
      'POSITIVE_CONTACT_POINT_INVALID',
    ),
    negativeContactPoint: optionalPoint(
      input.negativeContactPoint,
      'NEGATIVE_CONTACT_POINT_INVALID',
    ),
  });
}

export function supportGlyphPickTarget(evidence) {
  return deepFreeze({
    objectKind: 'support',
    objectId: evidence.supportId,
    supportId: evidence.supportId,
    sourcePaths: evidence.sourcePaths,
  });
}

export function restraintGlyphPickTarget(evidence) {
  return deepFreeze({
    objectKind: 'restraint',
    objectId: evidence.restraintId,
    supportId: evidence.supportId,
    restraintId: evidence.restraintId,
    restraintFamily: evidence.restraintFamily,
    sourcePaths: evidence.sourcePaths,
  });
}

function stringArray(value, code) {
  if (!Array.isArray(value)) fail('An array of strings is required.', code);
  const rows = value.map((row) => requiredText(row, code));
  return [...new Set(rows)].sort(compareCodeUnits);
}

function optionalPoint(value, code) {
  if (value === null || value === undefined) return null;
  if (![value.x, value.y, value.z].every((row) => Number.isFinite(Number(row)))) {
    fail('A finite point is required.', code);
  }
  return { x: Number(value.x), y: Number(value.y), z: Number(value.z) };
}

function requiredText(value, code) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) fail('A non-empty string is required.', code);
  return text;
}

function optionalText(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function compareCodeUnits(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function fail(message, detailCode) {
  const error = new TypeError(`TOPOLOGY_EDIT_SUPPORT_GLYPH_INVALID: ${message}`);
  error.code = 'TOPOLOGY_EDIT_SUPPORT_GLYPH_INVALID';
  error.detailCode = detailCode;
  throw error;
}
