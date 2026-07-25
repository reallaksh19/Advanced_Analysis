import { isPlainRecord } from '../shared-piping-model/index.js';
import { modelError } from './errors.js';

export function codeUnitCompare(left, right) { return left < right ? -1 : left > right ? 1 : 0; }

export function exactRecord(value, keys, path) {
  if (!isPlainRecord(value)) {
    throw modelError('PLAIN_RECORD_REQUIRED', path, `${path} must be a plain object.`);
  }
  const actual = Object.keys(value).sort(codeUnitCompare);
  const expected = [...keys].sort(codeUnitCompare);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw modelError('EXACT_KEYS_REQUIRED', path, `${path} keys must be ${expected.join(', ')}.`);
  }
  return value;
}

export function nonEmptyString(value, path) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw modelError('NON_EMPTY_STRING_REQUIRED', path, `${path} must be a non-empty string.`);
  }
  return value.trim();
}

export function arrayValue(value, path) {
  if (!Array.isArray(value)) throw modelError('ARRAY_REQUIRED', path, `${path} must be an array.`);
  return value;
}

export function enumValue(value, enumeration, path) {
  if (!Object.values(enumeration).includes(value)) {
    throw modelError('ENUM_VALUE_INVALID', path, `${path} is invalid.`);
  }
  return value;
}

export function uniqueIdentities(rows, key, path) {
  const seen = new Set();
  rows.forEach((row, index) => {
    const value = row[key];
    if (seen.has(value)) {
      throw modelError('DUPLICATE_IDENTITY', `${path}[${index}].${key}`, `Duplicate ${key} ${value}.`);
    }
    seen.add(value);
  });
}

export function clonePlain(value) { return cloneValue(value, new WeakSet(), '$'); }

function cloneValue(value, active, path) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw modelError('NON_FINITE_VALUE', path, `${path} must be finite.`);
    return Object.is(value, -0) ? 0 : value;
  }
  if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint' || value === undefined) {
    throw modelError('NON_JSON_VALUE', path, `${path} is not JSON-safe.`);
  }
  if (Array.isArray(value)) return cloneArray(value, active, path);
  if (isPlainRecord(value)) return cloneRecord(value, active, path);
  throw modelError('NON_PLAIN_VALUE', path, `${path} must contain only plain JSON data.`);
}

function cloneArray(value, active, path) {
  assertNotCycle(value, active, path);
  assertArrayShape(value, path);
  active.add(value);
  const result = Array.from({ length: value.length }, (_, index) => (
    cloneValue(value[index], active, `${path}[${index}]`)
  ));
  active.delete(value);
  return result;
}

function assertArrayShape(value, path) {
  const allowed = new Set(['length', ...Array.from({ length: value.length }, (_, index) => String(index))]);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !allowed.has(key)) {
      throw modelError('NON_JSON_ARRAY_SHAPE', path, `${path} contains a non-JSON array property.`);
    }
    if (key !== 'length' && !Object.prototype.propertyIsEnumerable.call(value, key)) {
      throw modelError('NON_JSON_ARRAY_SHAPE', path, `${path} contains a non-enumerable array item.`);
    }
  }
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) {
      throw modelError('SPARSE_ARRAY_FORBIDDEN', `${path}[${index}]`, `${path} must not contain holes.`);
    }
  }
}

function cloneRecord(value, active, path) {
  assertNotCycle(value, active, path);
  const keys = recordKeys(value, path);
  active.add(value);
  const result = {};
  keys.forEach((key) => { result[key] = cloneValue(value[key], active, `${path}.${key}`); });
  active.delete(value);
  return result;
}

function recordKeys(value, path) {
  const keys = Reflect.ownKeys(value);
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (typeof key !== 'string' || !descriptor?.enumerable || descriptor.get || descriptor.set) {
      throw modelError('NON_JSON_RECORD_SHAPE', path, `${path} contains a non-JSON record property.`);
    }
  }
  return keys;
}

function assertNotCycle(value, active, path) {
  if (active.has(value)) throw modelError('CYCLIC_VALUE', path, `${path} contains a cycle.`);
}
