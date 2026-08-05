import { deepFreeze } from './contracts.js';

export function canonicalize(value) {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) throw new TypeError('Semantic identity cannot contain non-finite numbers.');
      return Object.is(value, -0) ? 0 : value;
    }
    return value;
  }
  if (Array.isArray(value)) return value.map(canonicalize);
  const result = {};
  for (const key of Object.keys(value).sort()) {
    const child = value[key];
    if (child !== undefined) result[key] = canonicalize(child);
  }
  return result;
}

export function stableStringify(value) {
  return JSON.stringify(canonicalize(value));
}

export function semanticHash(value) {
  const text = stableStringify(value);
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  const bytes = new TextEncoder().encode(text);
  for (const byte of bytes) {
    hash ^= BigInt(byte);
    hash = (hash * prime) & mask;
  }
  return `fnv1a64:${hash.toString(16).padStart(16, '0')}`;
}

export function freezeWithIdentity(value, identityFields = value) {
  return deepFreeze({
    ...value,
    semanticIdentity: semanticHash(identityFields),
  });
}
