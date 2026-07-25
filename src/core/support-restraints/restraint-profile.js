import { deepFreeze, isPlainRecord, stringValue } from '../shared-piping-model/index.js';
import {
  RESTRAINT_CLASSIFICATION_PROFILE_SCHEMA,
  RESTRAINT_DIRECTIONS,
  RESTRAINT_PROFILE_ID,
  RESTRAINT_STATES,
} from './constants.js';

const TYPE_MAPPING = Object.freeze({
  ANCHOR: mapping('RESTRAINED', 'RESTRAINED', 'RESTRAINED', 'RESTRAINED'),
  REST: mapping('RESTRAINED', 'UNKNOWN', 'UNKNOWN', 'UNKNOWN'),
  HANGER: mapping('RESTRAINED', 'UNKNOWN', 'UNKNOWN', 'UNKNOWN'),
  GUIDE: mapping('UNKNOWN', 'RESTRAINED', 'FREE', 'UNKNOWN'),
  LINE_STOP: mapping('UNKNOWN', 'UNKNOWN', 'RESTRAINED', 'UNKNOWN'),
  LIMIT: mapping('UNKNOWN', 'UNKNOWN', 'RESTRAINED', 'UNKNOWN'),
  SPRING: mapping('SPRING', 'UNKNOWN', 'UNKNOWN', 'UNKNOWN'),
  SUPPORT: mapping('UNKNOWN', 'UNKNOWN', 'UNKNOWN', 'UNKNOWN'),
});

export function createDefaultRestraintClassificationProfile() {
  return createRestraintClassificationProfile({
    profileId: RESTRAINT_PROFILE_ID,
    profileVersion: 1,
    directions: RESTRAINT_DIRECTIONS,
    typeMapping: TYPE_MAPPING,
  });
}

export function createRestraintClassificationProfile(input) {
  if (!isPlainRecord(input)) throw new TypeError('Restraint classification profile input must be an object.');
  const profile = {
    schema: RESTRAINT_CLASSIFICATION_PROFILE_SCHEMA,
    profileId: requiredString(input.profileId, 'profileId'),
    profileVersion: positiveInteger(input.profileVersion, 'profileVersion'),
    directions: [...input.directions],
    typeMapping: normalizeMapping(input.typeMapping),
  };
  const validation = validateRestraintClassificationProfile(profile);
  if (!validation.ok) throw new TypeError(validation.errors.join(' '));
  return deepFreeze(profile);
}

export function validateRestraintClassificationProfile(profile) {
  const errors = [];
  if (!profile || profile.schema !== RESTRAINT_CLASSIFICATION_PROFILE_SCHEMA) errors.push('Invalid restraint classification profile schema.');
  if (!stringValue(profile?.profileId)) errors.push('Restraint profileId is required.');
  if (!Number.isInteger(profile?.profileVersion) || profile.profileVersion < 1) errors.push('Restraint profileVersion must be positive.');
  if (!Array.isArray(profile?.directions) || profile.directions.join('|') !== RESTRAINT_DIRECTIONS.join('|')) {
    errors.push('Restraint profile directions must use the closed semantic taxonomy.');
  }
  validateMapping(profile?.typeMapping, errors);
  return deepFreeze({ ok: errors.length === 0, errors });
}

function mapping(vertical, lateral, longitudinal, rotational) {
  return Object.freeze({ VERTICAL: vertical, LATERAL: lateral, LONGITUDINAL: longitudinal, ROTATIONAL: rotational });
}

function normalizeMapping(value) {
  const rows = isPlainRecord(value) ? value : {};
  return Object.fromEntries(Object.entries(rows).sort(([left], [right]) => left.localeCompare(right)).map(([type, states]) => [
    stringValue(type).toUpperCase(),
    Object.fromEntries(RESTRAINT_DIRECTIONS.map((direction) => [direction, stringValue(states?.[direction]).toUpperCase()])),
  ]));
}

function validateMapping(mappingValue, errors) {
  if (!isPlainRecord(mappingValue)) return errors.push('Restraint type mapping is required.');
  Object.entries(mappingValue).forEach(([type, mappingRow]) => {
    if (!stringValue(type)) errors.push('Restraint type mapping contains an empty type.');
    RESTRAINT_DIRECTIONS.forEach((direction) => {
      if (!Object.values(RESTRAINT_STATES).includes(mappingRow?.[direction])) {
        errors.push(`Restraint type ${type} has invalid ${direction} state.`);
      }
    });
  });
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
