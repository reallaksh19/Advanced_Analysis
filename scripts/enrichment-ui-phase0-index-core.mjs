import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { LINE_FLAG, sourceLocatorsForLine, stableStringify } from './enrichment-ui-phase0-fixtures.mjs';

export const EMPTY_ORDINALS = new Uint32Array(0);

export function buildEnrichmentUiIndexes(fixture) {
  assert.equal(fixture?.manifest?.lineCount, fixture?.lines?.targetIdByOrdinal?.length,
    'E_QF_SCHEMA_INVALID: fixture line store');
  const lineCount = fixture.manifest.lineCount;
  const componentCount = fixture.components.count;

  const lineOrdinalByTargetId = new Map();
  const mutableKeyBuckets = new Map();
  const mutableLocatorBuckets = new Map();

  for (let ordinal = 0; ordinal < lineCount; ordinal += 1) {
    const targetId = fixture.lines.targetIdByOrdinal[ordinal];
    assert(!lineOrdinalByTargetId.has(targetId), `E_QF_DUPLICATE_TARGET_ID: ${targetId}`);
    lineOrdinalByTargetId.set(targetId, ordinal);

    appendUniqueOrdinal(
      mutableKeyBuckets,
      fixture.lines.normalizedLineKeyByOrdinal[ordinal],
      ordinal,
    );

    for (const locator of sourceLocatorsForLine(fixture, ordinal)) {
      appendUniqueOrdinal(mutableLocatorBuckets, canonicalLocatorKey(locator), ordinal);
    }
  }

  const lineOrdinalsByNormalizedKey = freezeBuckets(mutableKeyBuckets);
  const lineOrdinalsBySourceLocator = freezeBuckets(mutableLocatorBuckets);
  const componentsByLine = buildComponentAdjacency(fixture);
  const facetBitsets = buildFacetBitsets(fixture);

  const indexes = {
    lineOrdinalByTargetId,
    lineOrdinalsByNormalizedKey,
    lineOrdinalsBySourceLocator,
    componentsByLine,
    facetBitsets,
    counts: Object.freeze({ lineCount, componentCount }),
  };

  Object.defineProperty(indexes, 'structuralDigest', {
    value: hashIndexes(indexes, fixture),
    enumerable: true,
    writable: false,
    configurable: false,
  });

  return Object.freeze(indexes);
}


function buildComponentAdjacency(fixture) {
  const lineCount = fixture.manifest.lineCount;
  const componentCount = fixture.components.count;
  const offsets = new Uint32Array(lineCount + 1);
  for (let lineOrdinal = 0; lineOrdinal < lineCount; lineOrdinal += 1) {
    offsets[lineOrdinal + 1] = offsets[lineOrdinal] + fixture.lines.componentCountByLineOrdinal[lineOrdinal];
  }
  const componentOrdinals = new Uint32Array(componentCount);
  const cursor = offsets.slice(0, lineCount);
  for (let componentOrdinal = 0; componentOrdinal < componentCount; componentOrdinal += 1) {
    const lineOrdinal = fixture.components.parentLineOrdinal[componentOrdinal];
    componentOrdinals[cursor[lineOrdinal]] = componentOrdinal;
    cursor[lineOrdinal] += 1;
  }
  return Object.freeze({ offsets, componentOrdinals });
}

function buildFacetBitsets(fixture) {
  const lineCount = fixture.manifest.lineCount;
  const byServiceId = new Map();
  const byRatingId = new Map();
  const byClassId = new Map();
  const byLineFlag = new Map();
  for (let id = 0; id < fixture.dictionaries.services.length; id += 1) byServiceId.set(id, emptyBitset(lineCount));
  for (let id = 0; id < fixture.dictionaries.ratings.length; id += 1) byRatingId.set(id, emptyBitset(lineCount));
  for (let id = 0; id < fixture.dictionaries.pipingClasses.length; id += 1) byClassId.set(id, emptyBitset(lineCount));
  for (const flag of Object.values(LINE_FLAG)) byLineFlag.set(flag, emptyBitset(lineCount));

  for (let ordinal = 0; ordinal < lineCount; ordinal += 1) {
    setBit(byServiceId.get(fixture.lines.serviceIdByOrdinal[ordinal]), ordinal);
    setBit(byRatingId.get(fixture.lines.ratingIdByOrdinal[ordinal]), ordinal);
    setBit(byClassId.get(fixture.lines.classIdByOrdinal[ordinal]), ordinal);
    for (const flag of Object.values(LINE_FLAG)) {
      if ((fixture.lines.flagsByOrdinal[ordinal] & flag) !== 0) setBit(byLineFlag.get(flag), ordinal);
    }
  }
  return Object.freeze({ byServiceId, byRatingId, byClassId, byLineFlag });
}

function appendUniqueOrdinal(map, key, ordinal) {
  let bucket = map.get(key);
  if (!bucket) {
    bucket = [];
    map.set(key, bucket);
  }
  if (bucket.length === 0 || bucket[bucket.length - 1] !== ordinal) bucket.push(ordinal);
}

function freezeBuckets(mutableBuckets) {
  const result = new Map();
  for (const [key, bucket] of mutableBuckets) result.set(key, new Uint32Array(bucket));
  return result;
}

function canonicalLocatorKey(locator) {
  return `${locator.sourceKind}:${locator.sourceHash}:${locator.locator}`;
}


export function emptyBitset(size) {
  return new Uint32Array(Math.ceil(size / 32));
}

export function fullBitset(size) {
  const words = emptyBitset(size);
  words.fill(0xffffffff);
  const excessBits = words.length * 32 - size;
  if (excessBits > 0) words[words.length - 1] >>>= excessBits;
  return words;
}

export function setBit(bitset, ordinal) {
  bitset[ordinal >>> 5] |= 1 << (ordinal & 31);
}

export function andBitsets(left, right) {
  assert.equal(left.length, right.length, 'E_QF_SCHEMA_INVALID: bitset length');
  const result = new Uint32Array(left.length);
  for (let index = 0; index < left.length; index += 1) result[index] = left[index] & right[index];
  return result;
}

export function orBitsets(bitsets) {
  const valid = bitsets.filter(Boolean);
  if (valid.length === 0) return new Uint32Array(0);
  const result = new Uint32Array(valid[0].length);
  for (const bitset of valid) {
    assert.equal(bitset.length, result.length, 'E_QF_SCHEMA_INVALID: bitset length');
    for (let index = 0; index < result.length; index += 1) result[index] |= bitset[index];
  }
  return result;
}

export function bitsetToOrdinals(bitset, lineCount) {
  const values = [];
  for (let ordinal = 0; ordinal < lineCount; ordinal += 1) {
    if ((bitset[ordinal >>> 5] & (1 << (ordinal & 31))) !== 0) values.push(ordinal);
  }
  return new Uint32Array(values);
}

function hashIndexes(indexes, fixture) {
  const hash = createHash('sha256');
  hash.update(fixture.semanticHash);
  hash.update(String(indexes.lineOrdinalByTargetId.size));
  for (const [key, bucket] of Array.from(indexes.lineOrdinalsByNormalizedKey.entries()).sort(([a], [b]) => a.localeCompare(b))) {
    hash.update(key);
    hash.update(Buffer.from(bucket.buffer, bucket.byteOffset, bucket.byteLength));
  }
  for (const [key, bucket] of Array.from(indexes.lineOrdinalsBySourceLocator.entries()).sort(([a], [b]) => a.localeCompare(b))) {
    hash.update(key);
    hash.update(Buffer.from(bucket.buffer, bucket.byteOffset, bucket.byteLength));
  }
  hash.update(Buffer.from(indexes.componentsByLine.offsets.buffer));
  hash.update(Buffer.from(indexes.componentsByLine.componentOrdinals.buffer));
  return hash.digest('hex');
}


export function hashTypedOrdinalList(values) {
  return createHash('sha256')
    .update(Buffer.from(values.buffer, values.byteOffset, values.byteLength))
    .digest('hex');
}
