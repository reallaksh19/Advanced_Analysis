import { isPlainRecord } from '../shared-piping-model/index.js';
import { modelError } from './errors.js';
import { finiteNumber } from './numeric.js';
import { vector3 } from './vector-math.js';

export function record(value, path) {
  if (!isPlainRecord(value)) throw modelError('PLAIN_RECORD_REQUIRED', path, `${path} must be a plain object.`);
  return value;
}

export function exactKeys(value, allowedKeys, path) {
  const allowed = new Set(allowedKeys);
  const unsupported = Object.keys(value).filter((key) => !allowed.has(key)).sort(codeUnitCompare);
  if (unsupported.length) {
    throw modelError('UNSUPPORTED_FIELD', path, `${path} contains unsupported field(s): ${unsupported.join(', ')}.`);
  }
  return value;
}

export function stringValue(value, path) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw modelError('NON_EMPTY_STRING_REQUIRED', path, `${path} must be a non-empty string.`);
  }
  return value.trim();
}

export function booleanValue(value, path) {
  if (typeof value !== 'boolean') throw modelError('BOOLEAN_REQUIRED', path, `${path} must be boolean.`);
  return value;
}

export function enumValue(value, enumeration, path) {
  if (!Object.values(enumeration).includes(value)) {
    throw modelError('ENUM_VALUE_INVALID', path, `${path} is invalid.`);
  }
  return value;
}

export function arrayValue(value, path) {
  if (!Array.isArray(value)) throw modelError('ARRAY_REQUIRED', path, `${path} must be an array.`);
  return value;
}

export function uniqueByIdentity(values, path) {
  uniqueStrings(values.map((value, index) => stringValue(value.identity, `${path}[${index}].identity`)), path);
}

export function uniqueStrings(values, path) {
  const seen = new Set();
  values.forEach((value, index) => {
    if (seen.has(value)) throw modelError('DUPLICATE_IDENTITY', `${path}[${index}]`, `Duplicate identity ${value}.`);
    seen.add(value);
  });
  return values;
}

export function sortByIdentity(values) {
  return [...values].sort((left, right) => codeUnitCompare(left.identity, right.identity));
}

export function sortedStrings(values) { return [...new Set(values)].sort(codeUnitCompare); }
export function codeUnitCompare(left, right) { return left < right ? -1 : left > right ? 1 : 0; }

export function sourceRef(value, ancestry, path) {
  const ref = stringValue(value, path);
  const prefix = `${ancestry.sourceModelIdentity}@${ancestry.sourceVersion}#`;
  if (!ref.startsWith(prefix) || ref.slice(prefix.length).trim() === '') {
    throw modelError('MIXED_OR_STALE_ANCESTRY', path, `${path} must begin with ${prefix} and include a non-empty source path.`);
  }
  return ref;
}

export function scalarEvidence(value, ancestry, path) {
  const item = exactKeys(record(value, path), ['value', 'sourceRef'], path);
  return { value: finiteNumber(item.value, `${path}.value`), sourceRef: sourceRef(item.sourceRef, ancestry, `${path}.sourceRef`) };
}

export function vectorEvidence(value, ancestry, path) {
  const item = exactKeys(record(value, path), ['value', 'sourceRef'], path);
  return { value: vector3(item.value, `${path}.value`), sourceRef: sourceRef(item.sourceRef, ancestry, `${path}.sourceRef`) };
}
