import {
  canonicalStringify,
  deepFreeze,
  isPlainRecord,
} from '../../core/shared-piping-model/index.js';
import { asciiCompare } from '../../core/lafea-application-templates/index.js';
import { HASH_PATTERN } from './catalog-constants.js';

export { asciiCompare, canonicalStringify, deepFreeze, isPlainRecord };

export function records(value, field) {
  if (!Array.isArray(value) || value.some((item) => !isPlainRecord(item))) {
    throw new TypeError(`${field} must be an array of records.`);
  }
  return [...value];
}

export function strings(value, field) {
  if (!Array.isArray(value)) throw new TypeError(`${field} must be an array.`);
  return [...new Set(value.map((item) => text(item, field)))].sort(asciiCompare);
}

export function text(value, field) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new TypeError(`${field} must be non-empty text.`);
  }
  return value.trim();
}

export function hash(value, field) {
  if (typeof value !== 'string' || !HASH_PATTERN.test(value)) {
    throw new TypeError(`${field} must be a semantic hash.`);
  }
  return value;
}

export function exact(value, keys, label) {
  if (!isPlainRecord(value)) throw new TypeError(`${label} must be a plain object.`);
  const actual = Object.keys(value).sort(asciiCompare);
  const expected = [...keys].sort(asciiCompare);
  if (canonicalStringify(actual) !== canonicalStringify(expected)) {
    throw new TypeError(`${label} keys are invalid.`);
  }
}

export function requireValid(result, label) {
  if (!result?.ok) {
    throw new TypeError(`${label}: ${(result?.errors ?? ['validation failed']).join(' ')}`);
  }
}

export function requireOne(items, key, value) {
  const result = items.find((item) => item[key] === value);
  if (!result) throw new TypeError(`Missing ${key}: ${value}.`);
  return result;
}

export function by(key) {
  return (left, right) => asciiCompare(left[key], right[key]);
}

export function frozen(value, label) {
  if (!value || typeof value !== 'object' || !Object.isFrozen(value)) {
    throw new TypeError(`${label} must be deeply frozen.`);
  }
  Object.values(value).forEach((item) => {
    if (item && typeof item === 'object') frozen(item, label);
  });
}

export function validation(callback) {
  const errors = [];
  try {
    callback();
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  return deepFreeze({ ok: errors.length === 0, errors });
}
