import { canonicalStringify, deepFreeze } from '../shared-piping-model/index.js';
import { ACTIVE_SETTING_DEFINITIONS, getActiveSettingDefinition } from './definitions.js';

export function validateSettingDefinitions(definitions = ACTIVE_SETTING_DEFINITIONS) {
  const errors = [];
  if (!Array.isArray(definitions) || definitions.length === 0) errors.push('At least one active setting definition is required.');
  const ids = definitions.map((row) => row?.settingId);
  if (new Set(ids).size !== ids.length) errors.push('Active setting IDs must be unique.');
  definitions.forEach((row) => {
    if (!row?.settingId || !row.label || !row.description) errors.push('Active setting text is incomplete.');
    if (row?.classification !== 'ACTIVE_RUNTIME_INPUT') errors.push(`${row?.settingId || 'Unknown'} is not an active runtime input.`);
    if (!Array.isArray(row?.runtimeConsumers) || row.runtimeConsumers.length === 0) errors.push(`${row?.settingId || 'Unknown'} has no verified runtime consumer.`);
    if (!Array.isArray(row?.allowedValuesOrRange) || row.allowedValuesOrRange.length === 0) errors.push(`${row?.settingId || 'Unknown'} has no allowed values.`);
    if (!row?.persistencePolicy || !row?.defaultAuthority) errors.push(`${row?.settingId || 'Unknown'} authority metadata is incomplete.`);
  });
  const sorted = [...ids].sort();
  if (canonicalStringify(ids) !== canonicalStringify(sorted)) errors.push('Active setting definitions are not canonically ordered.');
  return deepFreeze({ ok: errors.length === 0, errors });
}

export function validateSettingValue(settingId, value) {
  const definition = getActiveSettingDefinition(settingId);
  if (!definition) return deepFreeze({ ok: false, errors: [`Unknown active setting: ${settingId}.`] });
  const errors = [];
  if (definition.valueType === 'ENUM' && !definition.allowedValuesOrRange.includes(value)) {
    errors.push(`${settingId} must be one of: ${definition.allowedValuesOrRange.join(', ')}.`);
  }
  return deepFreeze({ ok: errors.length === 0, errors });
}

export function validateSettingsValues(settings) {
  const errors = [];
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    return deepFreeze({ ok: false, errors: ['Settings values must be an object.'], fieldErrors: {} });
  }
  const expected = ACTIVE_SETTING_DEFINITIONS.map((row) => row.settingId);
  const actual = Object.keys(settings).sort();
  if (canonicalStringify(actual) !== canonicalStringify(expected)) errors.push('Settings fields do not match the approved active definition set.');
  const fieldErrors = {};
  expected.forEach((settingId) => {
    const result = validateSettingValue(settingId, settings[settingId]);
    if (!result.ok) fieldErrors[settingId] = result.errors;
  });
  Object.values(fieldErrors).flat().forEach((error) => errors.push(error));
  return deepFreeze({ ok: errors.length === 0, errors, fieldErrors });
}
