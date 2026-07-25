import {
  ENGINEERING_SETTINGS_PERSISTENCE_KEY,
  ENGINEERING_SETTINGS_PROFILE_SCHEMA,
  validateEngineeringSettingsProfile,
} from '../core/settings-authority/index.js';
import { canonicalPrettyStringify, deepFreeze } from '../core/shared-piping-model/index.js';

export class SettingsPersistenceAdapter {
  constructor(storage = globalThis.localStorage, key = ENGINEERING_SETTINGS_PERSISTENCE_KEY) {
    this.storage = storage || null;
    this.key = key;
  }
  load() {
    if (!this.storage) return result(null, 'UNAVAILABLE', null, []);
    const raw = this.storage.getItem(this.key);
    if (raw === null) return result(null, 'EMPTY', null, []);
    try {
      const value = JSON.parse(raw);
      const validation = validateEngineeringSettingsProfile(value);
      if (!validation.ok) return result(null, 'REJECTED', summarize(value), diagnostics(validation.errors));
      return result(value, 'LOADED', null, []);
    } catch (error) {
      return result(null, 'REJECTED', { parseError: messageOf(error), byteLength: raw.length }, diagnostics([messageOf(error)]));
    }
  }
  save(profile) {
    const validation = validateEngineeringSettingsProfile(profile);
    if (!validation.ok) throw new TypeError(`Cannot persist invalid settings profile: ${validation.errors.join(' ')}`);
    if (!this.storage) throw new TypeError('Settings persistence is unavailable.');
    const record = {
      schema: ENGINEERING_SETTINGS_PROFILE_SCHEMA,
      profileId: profile.profileId,
      semanticHash: profile.semanticHash,
      settings: profile.settings,
    };
    this.storage.setItem(this.key, canonicalPrettyStringify(record));
    return summary('SAVED', profile.profileId, null);
  }
}
function result(profile, status, rejectedStoredSummary, diagnosticsRows) {
  return deepFreeze({ profile, summary: summary(status, profile?.profileId || null, rejectedStoredSummary), diagnostics: deepFreeze(diagnosticsRows) });
}
function summary(status, profileId, rejectedStoredSummary) { return deepFreeze({ key: ENGINEERING_SETTINGS_PERSISTENCE_KEY, schema: ENGINEERING_SETTINGS_PROFILE_SCHEMA, status, profileId, rejectedStoredSummary }); }
function summarize(value) { return { schema: value?.schema || null, profileId: value?.profileId || null, keys: value && typeof value === 'object' ? Object.keys(value).sort() : [] }; }
function diagnostics(errors) { return errors.map((message) => ({ code: 'SETTINGS_PERSISTENCE_REJECTED', severity: 'WARNING', message })); }
function messageOf(error) { return error instanceof Error ? error.message : String(error); }
