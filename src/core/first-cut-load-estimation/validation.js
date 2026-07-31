/**
 * Functionality: Shared strict validation helpers for first-cut contracts.
 * Parameters and outputs are explicit; validation never mutates caller data.
 */

import { deepFreeze, isPlainRecord, semanticHash, stringValue } from '../shared-piping-model/index.js';

export function assertPlainRecord(value, label) {
  if (!isPlainRecord(value)) throw new TypeError(`${label} must be a plain object.`);
  return value;
}

export function assertExactKeys(value, keys, label) {
  assertPlainRecord(value, label);
  const expected = [...keys].sort();
  const actual = Object.keys(value).sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new TypeError(`${label} requires exact keys: ${expected.join(', ')}.`);
  }
}

export function assertFinite(value, label, predicate) {
  if (!Number.isFinite(value) || !predicate(value)) throw new TypeError(`${label} is invalid.`);
  return value;
}

export function assertString(value, label) {
  const normalized = stringValue(value);
  if (!normalized) throw new TypeError(`${label} is required.`);
  return normalized;
}

export function assertHash(value, label) {
  const normalized = assertString(value, label);
  if (!/^fnv1a64:[0-9a-f]{16}$/u.test(normalized)) throw new TypeError(`${label} must be an FNV-1a semantic hash.`);
  return normalized;
}

export function assertEnum(value, allowed, label) {
  if (!allowed.includes(value)) throw new TypeError(`${label} is invalid.`);
  return value;
}

export function assertStringArray(value, allowed, label) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new TypeError(`${label} must be a string array.`);
  }
  const sorted = [...new Set(value)].sort();
  if (sorted.length !== value.length || sorted.some((item) => !allowed.includes(item))) {
    throw new TypeError(`${label} contains duplicate or unsupported values.`);
  }
  return sorted;
}

export function withSemanticHash(base) {
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

export function validateHashedContract(value, schema, exactKeys) {
  const errors = [];
  if (!isPlainRecord(value)) return deepFreeze({ ok: false, errors: ['Value must be a plain object.'] });
  if (value.schema !== schema) errors.push(`Expected schema ${schema}.`);
  const actual = Object.keys(value).sort();
  const expected = [...exactKeys, 'semanticHash'].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    errors.push('Contract contains missing or extra keys.');
  }
  const { semanticHash: actualHash, ...base } = value;
  if (actualHash !== semanticHash(base)) errors.push('Semantic hash mismatch.');
  return deepFreeze({ ok: errors.length === 0, errors });
}

export function withoutUiMetadata(value) {
  if (Array.isArray(value)) return value.map(withoutUiMetadata);
  if (!isPlainRecord(value)) return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !['timestamp', 'createdAt', 'updatedAt', 'uiState'].includes(key))
    .map(([key, child]) => [key, withoutUiMetadata(child)]));
}
