import { canonicalizeJson } from '../shared-piping-model/canonical-json.js';
import { isPlainRecord } from '../shared-piping-model/immutable.js';
import { failCommonEnrichment } from './errors.js';

const SEMANTIC_HASH_PATTERN = /^fnv1a64:[0-9a-f]{16}$/u;
const SOURCE_DIGEST_PATTERN = /^(?:[0-9a-f]{64}|sha256:[0-9a-f]{64}|fnv1a64:[0-9a-f]{16})$/u;
const ASCII_IDENTITY_PATTERN = /^[\x20-\x7e]+$/u;

export function requireExactKeys(value, expected, field) {
  requireRecord(value, field);
  const actual = Object.keys(value).sort(compareAscii);
  const wanted = [...expected].sort(compareAscii);
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    failCommonEnrichment(`${field} keys are not exact.`, 'COMMON_ENRICHED_KEYS_INVALID', {
      field,
      actual,
      expected: wanted,
    });
  }
  return value;
}

export function requireRecord(value, field) {
  if (!isPlainRecord(value)) {
    failCommonEnrichment(`${field} must be a plain record.`, 'COMMON_ENRICHED_RECORD_REQUIRED', { field });
  }
  return value;
}

export function requireArray(value, field) {
  if (!Array.isArray(value)) {
    failCommonEnrichment(`${field} must be an array.`, 'COMMON_ENRICHED_ARRAY_REQUIRED', { field });
  }
  return value;
}

export function requireIdentity(value, field) {
  if (typeof value !== 'string' || !value.trim() || !ASCII_IDENTITY_PATTERN.test(value)) {
    failCommonEnrichment(`${field} must be a non-empty ASCII identity.`, 'COMMON_ENRICHED_IDENTITY_INVALID', { field });
  }
  return value;
}

export function requireOptionalIdentity(value, field) {
  if (value === null) return null;
  return requireIdentity(value, field);
}

export function requireMember(value, allowed, field) {
  if (!allowed.includes(value)) {
    failCommonEnrichment(`${field} is unsupported.`, 'COMMON_ENRICHED_VALUE_UNSUPPORTED', {
      field,
      value,
      allowed,
    });
  }
  return value;
}

export function requireBoolean(value, field) {
  if (typeof value !== 'boolean') {
    failCommonEnrichment(`${field} must be boolean.`, 'COMMON_ENRICHED_BOOLEAN_REQUIRED', { field });
  }
  return value;
}

export function requirePositiveInteger(value, field) {
  if (!Number.isInteger(value) || value < 1) {
    failCommonEnrichment(`${field} must be a positive integer.`, 'COMMON_ENRICHED_REVISION_INVALID', { field });
  }
  return value;
}

export function requireNonNegativeInteger(value, field) {
  if (!Number.isInteger(value) || value < 0) {
    failCommonEnrichment(`${field} must be a non-negative integer.`, 'COMMON_ENRICHED_COUNT_INVALID', { field });
  }
  return value;
}

export function requireFiniteNumber(value, field) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    failCommonEnrichment(`${field} must be finite.`, 'COMMON_ENRICHED_NUMBER_INVALID', { field });
  }
  return value;
}

export function requireConfidence(value, field) {
  requireFiniteNumber(value, field);
  if (value < 0 || value > 1) {
    failCommonEnrichment(`${field} must be in [0, 1].`, 'COMMON_ENRICHED_CONFIDENCE_INVALID', { field, value });
  }
  return value;
}

export function requireIsoDateTime(value, field) {
  requireIdentity(value, field);
  const millis = Date.parse(value);
  if (!Number.isFinite(millis) || new Date(millis).toISOString() !== value) {
    failCommonEnrichment(`${field} must be a canonical UTC ISO timestamp.`, 'COMMON_ENRICHED_TIMESTAMP_INVALID', { field, value });
  }
  return value;
}

export function requireSemanticHash(value, field) {
  if (typeof value !== 'string' || !SEMANTIC_HASH_PATTERN.test(value)) {
    failCommonEnrichment(`${field} must be an FNV semantic hash.`, 'COMMON_ENRICHED_SEMANTIC_HASH_INVALID', { field });
  }
  return value;
}

export function requireSourceDigest(value, field) {
  if (typeof value !== 'string' || !SOURCE_DIGEST_PATTERN.test(value)) {
    failCommonEnrichment(`${field} must be SHA-256 or FNV-1a-64.`, 'COMMON_ENRICHED_SOURCE_HASH_INVALID', { field });
  }
  return value;
}

export function requireOptionalSourceDigest(value, field) {
  if (value === null) return null;
  return requireSourceDigest(value, field);
}

export function requireNullableUnit(value, field) {
  if (value === null) return null;
  return requireIdentity(value, field);
}

export function requireJsonScalar(value, field) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return Object.is(value, -0) ? 0 : value;
  failCommonEnrichment(`${field} must be a finite JSON scalar or null.`, 'COMMON_ENRICHED_SCALAR_INVALID', { field });
}

export function requireCanonicalJson(value, field) {
  try {
    return canonicalizeJson(value);
  } catch (error) {
    failCommonEnrichment(`${field} must be canonical-JSON compatible.`, 'COMMON_ENRICHED_JSON_INVALID', {
      field,
      reason: error instanceof Error ? error.message : String(error),
    });
  }
}

export function requireStringArray(value, field) {
  const normalized = requireArray(value, field).map((entry, index) => requireIdentity(entry, `${field}[${index}]`));
  const sorted = [...new Set(normalized)].sort(compareAscii);
  if (sorted.length !== normalized.length || JSON.stringify(sorted) !== JSON.stringify(normalized)) {
    failCommonEnrichment(`${field} must be sorted and de-duplicated.`, 'COMMON_ENRICHED_ARRAY_NOT_CANONICAL', {
      field,
      expected: sorted,
      actual: normalized,
    });
  }
  return normalized;
}

export function requireUniqueSorted(records, identityField, field) {
  const array = requireArray(records, field);
  const identities = array.map((record, index) => requireIdentity(record?.[identityField], `${field}[${index}].${identityField}`));
  const sorted = [...identities].sort(compareAscii);
  const unique = [...new Set(sorted)];
  if (unique.length !== identities.length) {
    failCommonEnrichment(`${field} contains duplicate ${identityField}.`, 'COMMON_ENRICHED_DUPLICATE_IDENTITY', { field, identityField });
  }
  if (JSON.stringify(sorted) !== JSON.stringify(identities)) {
    failCommonEnrichment(`${field} must be sorted by ${identityField}.`, 'COMMON_ENRICHED_ORDER_INVALID', {
      field,
      identityField,
      expected: sorted,
      actual: identities,
    });
  }
  return array;
}

export function compareAscii(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}
