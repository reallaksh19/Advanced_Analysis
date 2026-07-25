import { isPlainRecord } from './immutable.js';

const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const UINT64_MASK = 0xffffffffffffffffn;

export function canonicalizeJson(value) {
  return canonicalize(value, new Set(), '$');
}

export function canonicalStringify(value) {
  return JSON.stringify(canonicalizeJson(value));
}

export function canonicalPrettyStringify(value) {
  return `${JSON.stringify(canonicalizeJson(value), null, 2)}\n`;
}

export function semanticHash(value) {
  return hashUtf8(canonicalStringify(value));
}

export function hashUtf8(value) {
  return hashBytes(new TextEncoder().encode(String(value)));
}

export function hashBytes(bytes) {
  let hash = FNV_OFFSET;
  for (const byte of bytes) hash = ((hash ^ BigInt(byte)) * FNV_PRIME) & UINT64_MASK;
  return `fnv1a64:${hash.toString(16).padStart(16, '0')}`;
}

export function utf8ByteLength(value) {
  return new TextEncoder().encode(String(value)).length;
}

function canonicalize(value, active, path) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return finiteJsonNumber(value, path);
  if (Array.isArray(value)) return canonicalizeArray(value, active, path);
  if (isPlainRecord(value)) return canonicalizeRecord(value, active, path);
  throw new TypeError(`Canonical JSON does not support ${typeof value} at ${path}.`);
}

function canonicalizeArray(value, active, path) {
  assertNotActive(value, active, path);
  active.add(value);
  const result = value.map((child, index) => canonicalize(child, active, `${path}[${index}]`));
  active.delete(value);
  return result;
}

function canonicalizeRecord(value, active, path) {
  assertNotActive(value, active, path);
  active.add(value);
  const result = {};
  Object.keys(value).sort().forEach((key) => {
    if (value[key] !== undefined) result[key] = canonicalize(value[key], active, `${path}.${key}`);
  });
  active.delete(value);
  return result;
}

function finiteJsonNumber(value, path) {
  if (!Number.isFinite(value)) throw new TypeError(`Canonical JSON requires a finite number at ${path}.`);
  return Object.is(value, -0) ? 0 : value;
}

function assertNotActive(value, active, path) {
  if (active.has(value)) throw new TypeError(`Canonical JSON cannot serialize a cycle at ${path}.`);
}
