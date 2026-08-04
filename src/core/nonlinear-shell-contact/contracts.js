import { createHash } from 'node:crypto';

export const SCHEMAS = Object.freeze({
  MODEL: 'nonlinear-shell-contact-model/v1',
  SURFACE: 'shell-surface-definition/v1',
  CONTACT_PAIR: 'shell-rigid-contact-pair/v1',
  LOAD_STEP: 'nonlinear-load-step/v1',
  RESULT: 'nonlinear-shell-contact-result/v1',
  SOLVER_PROFILE: 'external-fe-solver-profile/v1',
  DECK_PROFILE: 'nonlinear-shell-contact-deck-profile/v1',
  EXECUTION_REQUEST: 'external-fe-execution-request/v1',
  RAW_MANIFEST: 'external-fe-raw-output-manifest/v1',
  EXECUTION_RECEIPT: 'nonlinear-shell-contact-execution-receipt/v1',
  NC00_REPORT: 'nonlinear-shell-contact-nc00-report/v1',
});

export const HASH_PATTERN = /^sha256:[0-9a-f]{64}$/u;
export const GIT_SHA_PATTERN = /^[0-9a-f]{40}$/u;
export const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;

export function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function assertPlainData(value, path = '$', seen = new Set()) {
  const type = typeof value;
  if (type === 'function' || type === 'symbol' || type === 'bigint' || type === 'undefined') {
    throw new TypeError(`${path} contains unsupported ${type} data.`);
  }
  if (type === 'number' && !Number.isFinite(value)) {
    throw new TypeError(`${path} must not contain NaN or Infinity.`);
  }
  if (value === null || type !== 'object') return true;
  if (seen.has(value)) throw new TypeError(`${path} contains a cycle.`);
  seen.add(value);
  if (!Array.isArray(value) && !isPlainObject(value)) {
    throw new TypeError(`${path} must contain only plain objects and arrays.`);
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertPlainData(entry, `${path}[${index}]`, seen));
  } else {
    Reflect.ownKeys(value).forEach((key) => {
      if (typeof key === 'symbol') throw new TypeError(`${path} contains a symbol key.`);
      assertPlainData(value[key], `${path}.${key}`, seen);
    });
  }
  seen.delete(value);
  return true;
}

export function assertExactKeys(value, requiredKeys, path, optionalKeys = []) {
  if (!isPlainObject(value)) throw new TypeError(`${path} must be a plain object.`);
  const allowed = new Set([...requiredKeys, ...optionalKeys]);
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  const missing = requiredKeys.filter((key) => !Object.hasOwn(value, key));
  if (unknown.length) throw new TypeError(`${path} contains unknown fields: ${unknown.join(', ')}`);
  if (missing.length) throw new TypeError(`${path} is missing fields: ${missing.join(', ')}`);
}

export function assertArray(value, path, { min = 0 } = {}) {
  if (!Array.isArray(value) || value.length < min) {
    throw new TypeError(`${path} must be an array with at least ${min} entries.`);
  }
}

export function assertString(value, path, { allowEmpty = false } = {}) {
  if (typeof value !== 'string' || (!allowEmpty && value.length === 0)) {
    throw new TypeError(`${path} must be ${allowEmpty ? 'a string' : 'a nonempty string'}.`);
  }
}

export function assertId(value, path) {
  assertString(value, path);
  if (!ID_PATTERN.test(value)) throw new TypeError(`${path} is not a valid governed identity.`);
}

export function assertGitSha(value, path) {
  if (typeof value !== 'string' || !GIT_SHA_PATTERN.test(value)) {
    throw new TypeError(`${path} must be a 40-character lower-case Git SHA.`);
  }
}

export function assertHash(value, path, { nullable = false } = {}) {
  if (nullable && value === null) return;
  if (typeof value !== 'string' || !HASH_PATTERN.test(value)) {
    throw new TypeError(`${path} must be a sha256: governed hash.`);
  }
}

export function assertFiniteNumber(value, path, predicate = () => true, description = 'valid') {
  if (typeof value !== 'number' || !Number.isFinite(value) || !predicate(value)) {
    throw new TypeError(`${path} must be a finite ${description} number.`);
  }
}

export function assertEnum(value, allowed, path) {
  if (!allowed.includes(value)) {
    throw new TypeError(`${path} must be one of: ${allowed.join(', ')}.`);
  }
}

export function assertBoolean(value, path) {
  if (typeof value !== 'boolean') throw new TypeError(`${path} must be boolean.`);
}

export function assertUniqueIds(rows, key, path) {
  const seen = new Set();
  rows.forEach((row, index) => {
    assertId(row[key], `${path}[${index}].${key}`);
    if (seen.has(row[key])) throw new TypeError(`${path} contains duplicate ${key}: ${row[key]}.`);
    seen.add(row[key]);
  });
}

export function codeUnitCompare(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function clonePlain(value) {
  assertPlainData(value);
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

export function canonicalize(value) {
  assertPlainData(value);
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isPlainObject(value)) {
    if (Object.is(value, -0)) return 0;
    return value;
  }
  return Object.fromEntries(
    Object.keys(value)
      .sort(codeUnitCompare)
      .map((key) => [key, canonicalize(value[key])]),
  );
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

export function sha256Bytes(value) {
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(value);
  return `sha256:${createHash('sha256').update(buffer).digest('hex')}`;
}

export function semanticHash(value) {
  return sha256Bytes(Buffer.from(canonicalJson(value), 'utf8'));
}

export function deepFreeze(value, seen = new Set()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  Reflect.ownKeys(value).forEach((key) => deepFreeze(value[key], seen));
  return Object.freeze(value);
}

export function sealWithHash(payload, hashField) {
  const clean = clonePlain(payload);
  delete clean[hashField];
  return deepFreeze({
    ...clean,
    [hashField]: semanticHash(clean),
  });
}

export function verifySealedHash(record, hashField, path = '$') {
  assertPlainData(record, path);
  assertHash(record[hashField], `${path}.${hashField}`);
  const clean = clonePlain(record);
  delete clean[hashField];
  if (semanticHash(clean) !== record[hashField]) {
    throw new TypeError(`${path}.${hashField} does not match reconstructed semantics.`);
  }
  return true;
}

export function assertRelativePath(value, path) {
  assertString(value, path);
  if (value.includes('\0') || value.includes('\\')) {
    throw new TypeError(`${path} must use a safe POSIX relative path.`);
  }
  if (value.startsWith('/') || /^[A-Za-z]:\//u.test(value)) {
    throw new TypeError(`${path} must not be absolute.`);
  }
  const parts = value.split('/');
  if (parts.some((part) => part === '..' || part === '' || part === '.')) {
    throw new TypeError(`${path} must not contain path traversal or empty segments.`);
  }
  if (/^(?:https?|ftp|file):/iu.test(value)) {
    throw new TypeError(`${path} must not be a network URL.`);
  }
  return true;
}

export function assertUnitVector(value, path) {
  assertArray(value, path, { min: 3 });
  if (value.length !== 3) throw new TypeError(`${path} must contain exactly three components.`);
  value.forEach((entry, index) => assertFiniteNumber(entry, `${path}[${index}]`));
  const norm = Math.hypot(...value);
  if (!(norm > 0)) throw new TypeError(`${path} must be nonzero.`);
  return value.map((entry) => entry / norm);
}

export function withoutFields(value, fields) {
  const copy = clonePlain(value);
  fields.forEach((field) => delete copy[field]);
  return copy;
}
