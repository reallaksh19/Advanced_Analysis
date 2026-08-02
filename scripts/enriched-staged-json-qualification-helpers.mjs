import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

export class EnrichedStagedJsonQualificationError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'EnrichedStagedJsonQualificationError';
    this.code = code;
    this.details = deepFreeze(cloneJson(details));
  }
}

export function fail(code, message, details = {}) {
  throw new EnrichedStagedJsonQualificationError(code, message, details);
}

export function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

export function deepFreeze(value, seen = new WeakSet()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  if (ArrayBuffer.isView(value)) return Object.freeze(value);
  for (const key of Reflect.ownKeys(value)) deepFreeze(value[key], seen);
  return Object.freeze(value);
}

export function stableStringify(value) {
  return JSON.stringify(canonicalize(value));
}

export function canonicalize(value) {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'number' && !Number.isFinite(value)) {
      fail('ENRICHED_STAGED_JSON_NON_CANONICAL_VALUE', 'Canonical JSON cannot contain non-finite numbers.');
    }
    return value;
  }
  if (Array.isArray(value)) return value.map(canonicalize);
  const output = {};
  for (const key of Object.keys(value).sort(codePointCompare)) output[key] = canonicalize(value[key]);
  return output;
}

export function sha256Text(text) {
  return `sha256:${createHash('sha256').update(text, 'utf8').digest('hex')}`;
}

export function semanticHash(value) {
  return sha256Text(stableStringify(value));
}

export function rawSha256(value) {
  return createHash('sha256').update(stableStringify(value), 'utf8').digest('hex');
}

export function codePointCompare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function assertDeepFrozen(value, path = '$', seen = new WeakSet()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  assert.equal(Object.isFrozen(value), true, `${path} is not frozen`);
  for (const key of Reflect.ownKeys(value)) assertDeepFrozen(value[key], `${path}.${String(key)}`, seen);
}

export function assertFailureCode(fn, expectedCode) {
  assert.throws(fn, (error) => error?.code === expectedCode, `Expected failure code ${expectedCode}`);
}

export function memoryEvidence() {
  const usage = process.memoryUsage();
  return Object.freeze({
    rssBytes: usage.rss,
    heapUsedBytes: usage.heapUsed,
    externalBytes: usage.external,
  });
}

export function streamCanonicalJson(value, { maxChunkBytes = 65536 } = {}) {
  if (!Number.isInteger(maxChunkBytes) || maxChunkBytes < 128) {
    fail('ENRICHED_STAGED_JSON_STREAM_BOUND_INVALID', 'maxChunkBytes must be an integer of at least 128.');
  }
  let pending = '';
  let maxObservedChunkBytes = 0;
  let chunkCount = 0;
  let byteLength = 0;
  const hash = createHash('sha256');

  function flush(force = false) {
    while (Buffer.byteLength(pending, 'utf8') >= maxChunkBytes || (force && pending.length > 0)) {
      let cut = Math.min(pending.length, maxChunkBytes);
      while (cut > 1 && Buffer.byteLength(pending.slice(0, cut), 'utf8') > maxChunkBytes) cut -= 1;
      const chunk = pending.slice(0, cut);
      pending = pending.slice(cut);
      const bytes = Buffer.byteLength(chunk, 'utf8');
      maxObservedChunkBytes = Math.max(maxObservedChunkBytes, bytes);
      hash.update(chunk, 'utf8');
      chunkCount += 1;
      byteLength += bytes;
    }
  }

  function emit(token) {
    pending += token;
    flush(false);
  }

  function visit(entry) {
    if (entry === null || typeof entry !== 'object') {
      if (typeof entry === 'number' && !Number.isFinite(entry)) {
        fail('ENRICHED_STAGED_JSON_NON_CANONICAL_VALUE', 'Canonical JSON cannot contain non-finite numbers.');
      }
      emit(JSON.stringify(entry));
      return;
    }
    if (Array.isArray(entry)) {
      emit('[');
      for (let index = 0; index < entry.length; index += 1) {
        if (index > 0) emit(',');
        visit(entry[index]);
      }
      emit(']');
      return;
    }
    emit('{');
    const keys = Object.keys(entry).sort(codePointCompare);
    for (let index = 0; index < keys.length; index += 1) {
      if (index > 0) emit(',');
      const key = keys[index];
      emit(JSON.stringify(key));
      emit(':');
      visit(entry[key]);
    }
    emit('}');
  }

  visit(value);
  flush(true);
  return Object.freeze({
    semanticHash: `sha256:${hash.digest('hex')}`,
    byteLength,
    chunkCount,
    maxChunkBytes: maxObservedChunkBytes,
  });
}
