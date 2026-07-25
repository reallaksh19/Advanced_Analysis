import { sourceError } from './errors.js';

export function exactKeys(value, keys, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw sourceError('RECORD_REQUIRED', path, `${path} must be a record.`);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw sourceError('FIELD_SET_MISMATCH', path, `${path} fields must be exactly: ${expected.join(', ')}.`);
}
export function stringValue(value, path) {
  if (typeof value !== 'string' || value.trim() === '') throw sourceError('STRING_REQUIRED', path, `${path} must be a non-empty string.`);
  return value;
}
export function finiteNumber(value, path) {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw sourceError('FINITE_NUMBER_REQUIRED', path, `${path} must be finite.`);
  return Object.is(value, -0) ? 0 : value;
}
export function positiveNumber(value, path) {
  const result = finiteNumber(value, path);
  if (!(result > 0)) throw sourceError('POSITIVE_NUMBER_REQUIRED', path, `${path} must be positive.`);
  return result;
}
export function vector3(value, path) {
  if (!Array.isArray(value) || value.length !== 3) throw sourceError('VECTOR3_REQUIRED', path, `${path} must have three entries.`);
  return value.map((item, index) => finiteNumber(item, `${path}[${index}]`));
}
export function stringArray(value, path, minimum = 0) {
  if (!Array.isArray(value) || value.length < minimum) throw sourceError('STRING_ARRAY_REQUIRED', path, `${path} must be an array with at least ${minimum} entries.`);
  return value.map((item, index) => stringValue(item, `${path}[${index}]`));
}
export function unique(values, path) {
  if (new Set(values).size !== values.length) throw sourceError('DUPLICATE_IDENTITY', path, `${path} contains duplicates.`);
  return values;
}
export function member(value, allowed, path) {
  if (!allowed.includes(value)) throw sourceError('UNSUPPORTED_ENUM', path, `${path} must be one of ${allowed.join(', ')}.`);
  return value;
}
export function booleanValue(value, path) {
  if (typeof value !== 'boolean') throw sourceError('BOOLEAN_REQUIRED', path, `${path} must be boolean.`);
  return value;
}