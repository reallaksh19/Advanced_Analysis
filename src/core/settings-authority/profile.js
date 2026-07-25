import { canonicalStringify, deepFreeze, semanticHash } from '../shared-piping-model/index.js';
import { ENGINEERING_SETTINGS_PROFILE_SCHEMA } from './constants.js';
import { approvedSettingValues } from './definitions.js';
import { validateSettingsValues } from './validation.js';

export function createEngineeringSettingsProfile(settings = approvedSettingValues()) {
  const canonicalSettings = Object.fromEntries(Object.entries(settings || {}).sort(([a], [b]) => a.localeCompare(b)));
  const validation = validateSettingsValues(canonicalSettings);
  if (!validation.ok) throw new TypeError(`Invalid engineering settings profile: ${validation.errors.join(' ')}`);
  const identityEvidence = { schema: ENGINEERING_SETTINGS_PROFILE_SCHEMA, settings: canonicalSettings };
  const profileId = `engineering-settings:${semanticHash(identityEvidence)}`;
  const base = { schema: ENGINEERING_SETTINGS_PROFILE_SCHEMA, profileId, settings: canonicalSettings };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

export function createApprovedDefaultProfile() { return createEngineeringSettingsProfile(approvedSettingValues()); }

export function validateEngineeringSettingsProfile(value) {
  const errors = [];
  if (value?.schema !== ENGINEERING_SETTINGS_PROFILE_SCHEMA) errors.push('Invalid engineering settings profile schema.');
  const values = validateSettingsValues(value?.settings);
  errors.push(...values.errors);
  if (!errors.length) {
    try {
      const expected = createEngineeringSettingsProfile(value.settings);
      if (canonicalStringify(value) !== canonicalStringify(expected)) errors.push('Engineering settings profile identity is invalid.');
    } catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }
  }
  return deepFreeze({ ok: errors.length === 0, errors });
}
