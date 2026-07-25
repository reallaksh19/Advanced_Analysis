import { deepFreeze, finiteNumber, isPlainRecord, stringValue } from '../shared-piping-model/index.js';
import { canonicalLengthFactor, normalizeLengthUnit } from '../piping-topology/index.js';
import {
  ATTACHMENT_PROFILE_IDS,
  IDENTITY_POLICY,
  SUPPORT_ATTACHMENT_PROFILE_SCHEMA,
} from './constants.js';

export function createEvidenceOnlyAttachmentProfile(lengthUnit = 'unknown') {
  return createSupportAttachmentProfile({
    profileId: ATTACHMENT_PROFILE_IDS.EVIDENCE_ONLY,
    profileVersion: 1,
    lengthUnit,
    allowGeometricProjection: false,
    projectionTolerance: null,
    identityCompatibilityPolicy: IDENTITY_POLICY,
  });
}

export function createGeometricAttachmentProfile(lengthUnit, projectionTolerance) {
  return createSupportAttachmentProfile({
    profileId: ATTACHMENT_PROFILE_IDS.GEOMETRIC,
    profileVersion: 1,
    lengthUnit,
    allowGeometricProjection: true,
    projectionTolerance,
    identityCompatibilityPolicy: IDENTITY_POLICY,
  });
}

export function createSupportAttachmentProfile(input) {
  if (!isPlainRecord(input)) throw new TypeError('Support attachment profile input must be an object.');
  const profile = {
    schema: SUPPORT_ATTACHMENT_PROFILE_SCHEMA,
    profileId: requiredString(input.profileId, 'profileId'),
    profileVersion: positiveInteger(input.profileVersion, 'profileVersion'),
    lengthUnit: normalizeLengthUnit(input.lengthUnit),
    allowGeometricProjection: input.allowGeometricProjection === true,
    projectionTolerance: normalizeTolerance(input),
    identityCompatibilityPolicy: requiredString(
      input.identityCompatibilityPolicy || IDENTITY_POLICY,
      'identityCompatibilityPolicy',
    ),
  };
  const validation = validateSupportAttachmentProfile(profile);
  if (!validation.ok) throw new TypeError(validation.errors.join(' '));
  return deepFreeze(profile);
}

export function validateSupportAttachmentProfile(profile) {
  const errors = [];
  if (!profile || profile.schema !== SUPPORT_ATTACHMENT_PROFILE_SCHEMA) errors.push('Invalid support attachment profile schema.');
  if (!stringValue(profile?.profileId)) errors.push('Support attachment profileId is required.');
  if (!Number.isInteger(profile?.profileVersion) || profile.profileVersion < 1) errors.push('Support attachment profileVersion must be positive.');
  if (!stringValue(profile?.lengthUnit)) errors.push('Support attachment lengthUnit is required.');
  if (typeof profile?.allowGeometricProjection !== 'boolean') errors.push('Support geometric-projection flag must be boolean.');
  if (profile?.allowGeometricProjection && !(finiteNumber(profile.projectionTolerance) > 0)) errors.push('Projection tolerance must be positive.');
  if (!profile?.allowGeometricProjection && profile?.projectionTolerance !== null) errors.push('Evidence-only projection tolerance must be null.');
  if (!stringValue(profile?.identityCompatibilityPolicy)) errors.push('Support attachment identity policy is required.');
  return deepFreeze({ ok: errors.length === 0, errors });
}

export function projectionToleranceCanonical(profile) {
  if (!profile?.allowGeometricProjection) return null;
  const factor = canonicalLengthFactor(profile.lengthUnit);
  return factor === null ? null : profile.projectionTolerance * factor;
}

function normalizeTolerance(input) {
  if (!input.allowGeometricProjection) return null;
  const value = finiteNumber(input.projectionTolerance);
  return value === null ? input.projectionTolerance : value;
}

function positiveInteger(value, field) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) throw new TypeError(`${field} must be a positive integer.`);
  return number;
}

function requiredString(value, field) {
  const normalized = stringValue(value);
  if (!normalized) throw new TypeError(`${field} must be a non-empty string.`);
  return normalized;
}
