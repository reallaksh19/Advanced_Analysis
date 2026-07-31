/**
 * Functionality: Creates and validates explicit gravity profiles consumed by
 * W10.4. The standard-gravity helper remains available for existing callers.
 */

import { deepFreeze, semanticHash } from '../shared-piping-model/index.js';
import { GRAVITY_DIRECTION, GRAVITY_PROFILE_ID, GRAVITY_PROFILE_SCHEMA } from './constants.js';

export function createStandardGravityProfile() {
  return createExplicitGravityProfile({
    profileId: GRAVITY_PROFILE_ID,
    profileVersion: 1,
    accelerationMPerS2: 9.80665,
    sourceBasis: 'CGPM_STANDARD_GRAVITY',
    semanticDirection: GRAVITY_DIRECTION,
  });
}

export function createExplicitGravityProfile(input) {
  const keys = ['profileId', 'profileVersion', 'accelerationMPerS2', 'sourceBasis', 'semanticDirection'];
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || Object.keys(input).sort().join('|') !== [...keys].sort().join('|')) {
    throw new TypeError(`Explicit gravity profile requires exact keys: ${keys.sort().join(', ')}.`);
  }
  assertString(input.profileId, 'Gravity profileId');
  if (!Number.isInteger(input.profileVersion) || input.profileVersion < 1) {
    throw new TypeError('Gravity profileVersion is invalid.');
  }
  if (!(Number.isFinite(input.accelerationMPerS2) && input.accelerationMPerS2 > 0)) {
    throw new TypeError('Gravity acceleration is invalid.');
  }
  assertString(input.sourceBasis, 'Gravity sourceBasis');
  if (input.semanticDirection !== GRAVITY_DIRECTION) {
    throw new TypeError('Gravity direction must be GRAVITY_DOWN.');
  }
  const base = {
    schema: GRAVITY_PROFILE_SCHEMA,
    profileId: input.profileId,
    profileVersion: input.profileVersion,
    accelerationMPerS2: input.accelerationMPerS2,
    sourceBasis: input.sourceBasis,
    semanticDirection: input.semanticDirection,
  };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

export function validateGravityProfile(profile) {
  const errors = [];
  if (profile?.schema !== GRAVITY_PROFILE_SCHEMA) errors.push('Invalid gravity profile schema.');
  if (typeof profile?.profileId !== 'string' || !profile.profileId.trim()) errors.push('Gravity profile ID is required.');
  if (!Number.isInteger(profile?.profileVersion) || profile.profileVersion < 1) errors.push('Gravity profile version is invalid.');
  if (!(Number.isFinite(profile?.accelerationMPerS2) && profile.accelerationMPerS2 > 0)) errors.push('Gravity acceleration is invalid.');
  if (typeof profile?.sourceBasis !== 'string' || !profile.sourceBasis.trim()) errors.push('Gravity source basis is required.');
  if (profile?.semanticDirection !== GRAVITY_DIRECTION) errors.push('Gravity direction must be GRAVITY_DOWN.');
  if (profile?.semanticHash !== semanticHash(withoutHash(profile))) errors.push('Gravity profile semantic hash mismatch.');
  return deepFreeze({ ok: errors.length === 0, errors });
}

function assertString(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${label} is required.`);
}
function withoutHash(profile) {
  const { semanticHash: _semanticHash, ...rest } = profile || {};
  return rest;
}
