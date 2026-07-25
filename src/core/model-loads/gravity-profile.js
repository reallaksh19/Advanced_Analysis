import { deepFreeze, semanticHash } from '../shared-piping-model/index.js';
import { GRAVITY_DIRECTION, GRAVITY_PROFILE_ID, GRAVITY_PROFILE_SCHEMA } from './constants.js';

export function createStandardGravityProfile() {
  const base = {
    schema: GRAVITY_PROFILE_SCHEMA,
    profileId: GRAVITY_PROFILE_ID,
    profileVersion: 1,
    accelerationMPerS2: 9.80665,
    sourceBasis: 'CGPM_STANDARD_GRAVITY',
    semanticDirection: GRAVITY_DIRECTION,
  };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

export function validateGravityProfile(profile) {
  const errors = [];
  if (profile?.schema !== GRAVITY_PROFILE_SCHEMA) errors.push('Invalid gravity profile schema.');
  if (profile?.profileId !== GRAVITY_PROFILE_ID) errors.push('Unsupported gravity profile.');
  if (profile?.accelerationMPerS2 !== 9.80665) errors.push('Standard gravity must equal 9.80665 m/s².');
  if (profile?.semanticDirection !== GRAVITY_DIRECTION) errors.push('Gravity direction must be GRAVITY_DOWN.');
  if (profile?.semanticHash !== semanticHash(withoutHash(profile))) errors.push('Gravity profile semantic hash mismatch.');
  return deepFreeze({ ok: errors.length === 0, errors });
}

function withoutHash(value) {
  const { semanticHash: _semanticHash, ...rest } = value || {};
  return rest;
}
