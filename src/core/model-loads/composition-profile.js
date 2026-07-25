import { deepFreeze, semanticHash } from '../shared-piping-model/index.js';
import { COMPOSITION_PROFILE_ID, LINEAR_TYPES, LOAD_COMPOSITION_PROFILE_SCHEMA, LUMPED_TYPES } from './constants.js';

export function createPipingLoadCompositionProfile() {
  const base = {
    schema: LOAD_COMPOSITION_PROFILE_SCHEMA,
    profileId: COMPOSITION_PROFILE_ID,
    profileVersion: 1,
    linearComponentTypes: LINEAR_TYPES,
    lumpedComponentTypes: LUMPED_TYPES,
    sourcePrecedence: [
      'DIRECT_UNIT_MASS',
      'DERIVED_SECTION_MASS',
      'DIRECT_COMPONENT_MASS',
      'EXPLICIT_SOURCE_ONLY',
    ],
    rules: {
      directMassOverridesDerived: true,
      explicitZeroIsValid: true,
      rejectNegativeValues: true,
      requireExplicitPointApplication: true,
      preventDistributedLumpedDoubleCount: true,
    },
  };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

export function validateLoadCompositionProfile(profile) {
  const errors = [];
  if (profile?.schema !== LOAD_COMPOSITION_PROFILE_SCHEMA) errors.push('Invalid load-composition profile schema.');
  if (profile?.profileId !== COMPOSITION_PROFILE_ID) errors.push('Unsupported load-composition profile.');
  if (!profile?.rules?.preventDistributedLumpedDoubleCount) errors.push('Double-count prevention must be enabled.');
  if (profile?.semanticHash !== semanticHash(withoutHash(profile))) errors.push('Load-composition profile semantic hash mismatch.');
  return deepFreeze({ ok: errors.length === 0, errors });
}

export function classifyLoadComponent(type, profile) {
  const normalized = String(type || '').trim().toUpperCase();
  if (profile.linearComponentTypes.includes(normalized)) return 'LINEAR';
  if (profile.lumpedComponentTypes.includes(normalized)) return 'LUMPED';
  return 'UNKNOWN';
}

function withoutHash(value) {
  const { semanticHash: _semanticHash, ...rest } = value || {};
  return rest;
}
