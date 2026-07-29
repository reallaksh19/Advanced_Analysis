import { SharedAnalysisContractError } from './errors.js';

export function exactKeys(record, expected, label) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    throw new SharedAnalysisContractError(`${label} must be a record`, 'NOT_A_RECORD');
  }
  const actual = Object.keys(record).sort();
  const wanted = [...expected].sort();
  const missing = wanted.filter((key) => !actual.includes(key));
  const unexpected = actual.filter((key) => !wanted.includes(key));
  if (missing.length > 0) {
    throw new SharedAnalysisContractError(`${label} is missing ${missing.join(', ')}`, 'MISSING_FIELD');
  }
  if (unexpected.length > 0) {
    throw new SharedAnalysisContractError(`${label} carries unexpected ${unexpected.join(', ')}`, 'UNEXPECTED_FIELD');
  }
}

export function nonEmptyString(value, label) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new SharedAnalysisContractError(`${label} must be a non-empty string`, 'MISSING_DECLARATION');
  }
  return value;
}

export function member(value, supported, label) {
  if (!supported.includes(value)) {
    throw new SharedAnalysisContractError(`${label} is unsupported: ${String(value)}`, 'UNSUPPORTED_VALUE');
  }
  return value;
}

export function stringArray(value, label) {
  if (!Array.isArray(value)) {
    throw new SharedAnalysisContractError(`${label} must be an array`, 'NOT_AN_ARRAY');
  }
  return value.map((item, index) => nonEmptyString(item, `${label}[${index}]`));
}

/**
 * Sorted, de-duplicated union of limitation strings.
 *
 * Section 8 rule 3 of both plans: limitations propagate. A consuming analysis
 * renders the limitations of the run that fed it alongside its own, so the
 * merge must never drop an inherited string.
 *
 * @param {...string[]} lists Limitation string arrays.
 * @returns {readonly string[]} Frozen, sorted, unique limitations.
 */
export function mergeLimitations(...lists) {
  const merged = new Set();
  for (const list of lists) {
    for (const value of stringArray(list, 'limitations')) merged.add(value);
  }
  return Object.freeze([...merged].sort());
}
