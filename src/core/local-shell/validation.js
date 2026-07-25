import { ShellModelError } from './errors.js';
import { finiteNumber } from './numeric.js';

export function exactKeys(record, expected, label) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) throw new ShellModelError(`${label} must be a record`);
  const actual = Object.keys(record).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new ShellModelError(`${label} keys must be exactly ${wanted.join(', ')}`);
  }
}

export function nonEmptyString(value, label) {
  if (typeof value !== 'string' || value.length === 0) throw new ShellModelError(`${label} must be a non-empty string`);
  return value;
}

export function stringArray(value, label) {
  if (!Array.isArray(value)) throw new ShellModelError(`${label} must be an array`);
  return value.map((item, index) => nonEmptyString(item, `${label}[${index}]`));
}

export function fixedVector(value, size, label) {
  if (!Array.isArray(value) || value.length !== size) throw new ShellModelError(`${label} must contain exactly ${size} values`);
  return value.map((item, index) => finiteNumber(item, `${label}[${index}]`));
}

export function uniqueBy(records, field, label) {
  const seen = new Set();
  for (const record of records) {
    const identity = record[field];
    if (seen.has(identity)) throw new ShellModelError(`Duplicate ${label} ${identity}`);
    seen.add(identity);
  }
}

export function member(value, supported, label) {
  if (!supported.includes(value)) throw new ShellModelError(`${label} is unsupported: ${value}`);
  return value;
}

export function toleranceRule(record, label) {
  exactKeys(record, ['absolute', 'relative'], label);
  const absolute = finiteNumber(record.absolute, `${label}.absolute`);
  const relative = finiteNumber(record.relative, `${label}.relative`);
  if (absolute < 0 || relative < 0) throw new ShellModelError(`${label} values must be non-negative`);
  return { absolute, relative };
}

export function minimumRule(record, label) {
  exactKeys(record, ['minimum'], label);
  return { minimum: finiteNumber(record.minimum, `${label}.minimum`) };
}
