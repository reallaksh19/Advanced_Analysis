import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  CLASS_COUNT,
  ENGINEERING_FIELDS,
  FIELD_STATUS,
  FIXTURE_SCHEMA,
  LINE_FLAG,
  RATING_COUNT,
  SERVICE_COUNT,
  SOURCE_HASHES,
  getFixtureManifest,
  validateFixtureManifest,
} from './enrichment-ui-phase0-fixture-schema.mjs';
import { sha256Text, stableStringify } from './enrichment-ui-phase0-fixture-codec.mjs';

export function buildEnrichmentUiFixture(manifestOrName = 'small') {
  const manifest = typeof manifestOrName === 'string'
    ? getFixtureManifest(manifestOrName)
    : manifestOrName;
  validateFixtureManifest(manifest);

  const seedTag = sha256Text(manifest.seed).slice(0, 12).toUpperCase();
  const random = createXorshift32(seedToUint32(manifest.seed));
  const { lineCount, componentCount } = manifest;

  const targetIdByOrdinal = new Array(lineCount);
  const normalizedLineKeyByOrdinal = new Array(lineCount);
  const modelPathByOrdinal = new Array(lineCount);
  const serviceIdByOrdinal = new Uint8Array(lineCount);
  const ratingIdByOrdinal = new Uint8Array(lineCount);
  const classIdByOrdinal = new Uint8Array(lineCount);
  const lineFlags = new Uint8Array(lineCount);
  const sourceLocatorCountByOrdinal = new Uint8Array(lineCount);
  const componentCountByLineOrdinal = new Uint32Array(lineCount);

  applyPinnedFlags(lineFlags, manifest);

  for (let ordinal = 0; ordinal < lineCount; ordinal += 1) {
    targetIdByOrdinal[ordinal] = `LINE:${seedTag}:${ordinal.toString(36).padStart(7, '0')}`;
    normalizedLineKeyByOrdinal[ordinal] = normalizedLineKeyForOrdinal(ordinal, manifest);
    modelPathByOrdinal[ordinal] = `/SYNTHETIC/SITE-${String(ordinal % 7).padStart(2, '0')}/ZONE-${String(ordinal % 23).padStart(2, '0')}/LINE-${ordinal.toString(36).toUpperCase().padStart(7, '0')}`;
    serviceIdByOrdinal[ordinal] = ordinal % SERVICE_COUNT;
    ratingIdByOrdinal[ordinal] = Math.floor(ordinal / SERVICE_COUNT) % RATING_COUNT;
    classIdByOrdinal[ordinal] = Math.floor(ordinal / (SERVICE_COUNT * RATING_COUNT)) % CLASS_COUNT;
    sourceLocatorCountByOrdinal[ordinal] = 1 + ((ordinal + (random() & 0xffff)) % 3);
  }

  const engineeringColumns = Object.create(null);
  for (let fieldOrdinal = 0; fieldOrdinal < ENGINEERING_FIELDS.length; fieldOrdinal += 1) {
    const fieldId = ENGINEERING_FIELDS[fieldOrdinal];
    const values = new Float64Array(lineCount);
    const statuses = new Uint8Array(lineCount);
    for (let ordinal = 0; ordinal < lineCount; ordinal += 1) {
      values[ordinal] = deterministicEngineeringValue(ordinal, fieldOrdinal);
      statuses[ordinal] = statusForLineAndField(lineFlags[ordinal], fieldOrdinal);
      if (statuses[ordinal] >= FIELD_STATUS.BLOCKED_MISSING
        && statuses[ordinal] <= FIELD_STATUS.BLOCKED_STALE_SOURCE) {
        values[ordinal] = Number.NaN;
      }
    }
    engineeringColumns[fieldId] = Object.freeze({ values, statuses });
  }

  const componentParentLineOrdinal = new Uint32Array(componentCount);
  const componentTypeCode = new Uint8Array(componentCount);
  const componentBoreMm = new Uint16Array(componentCount);
  for (let componentOrdinal = 0; componentOrdinal < componentCount; componentOrdinal += 1) {
    const lineOrdinal = Math.min(
      lineCount - 1,
      Math.floor((componentOrdinal * lineCount) / componentCount),
    );
    componentParentLineOrdinal[componentOrdinal] = lineOrdinal;
    componentTypeCode[componentOrdinal] = componentOrdinal % 9;
    componentBoreMm[componentOrdinal] = 15 + ((componentOrdinal * 5 + lineOrdinal * 3) % 985);
    componentCountByLineOrdinal[lineOrdinal] += 1;
  }

  const fixture = {
    schema: FIXTURE_SCHEMA,
    manifest,
    seedTag,
    generatedAt: manifest.pinnedTimestamp,
    sourceHashes: SOURCE_HASHES,
    dictionaries: Object.freeze({
      services: Object.freeze(Array.from({ length: SERVICE_COUNT }, (_, index) => `SERVICE-${String(index + 1).padStart(2, '0')}`)),
      ratings: Object.freeze(['150', '300', '600', '900']),
      pipingClasses: Object.freeze(Array.from({ length: CLASS_COUNT }, (_, index) => `PC-${String(index + 1).padStart(2, '0')}`)),
      componentTypes: Object.freeze(['PIPE', 'ELBOW', 'TEE', 'REDUCER', 'VALVE', 'FLANGE', 'SUPPORT', 'BRANCH', 'OTHER']),
    }),
    lines: Object.freeze({
      targetIdByOrdinal: Object.freeze(targetIdByOrdinal),
      normalizedLineKeyByOrdinal: Object.freeze(normalizedLineKeyByOrdinal),
      modelPathByOrdinal: Object.freeze(modelPathByOrdinal),
      serviceIdByOrdinal,
      ratingIdByOrdinal,
      classIdByOrdinal,
      flagsByOrdinal: lineFlags,
      sourceLocatorCountByOrdinal,
      componentCountByLineOrdinal,
      engineeringColumns: Object.freeze(engineeringColumns),
    }),
    components: Object.freeze({
      count: componentCount,
      parentLineOrdinal: componentParentLineOrdinal,
      typeCode: componentTypeCode,
      boreMm: componentBoreMm,
    }),
  };

  Object.defineProperty(fixture, 'semanticHash', {
    value: hashFixture(fixture),
    enumerable: true,
    writable: false,
    configurable: false,
  });

  return Object.freeze(fixture);
}

export function normalizedLineKeyForOrdinal(ordinal, manifest) {
  if (ordinal < manifest.duplicateKeyTargetCount) {
    return `DUP-${Math.floor(ordinal / 2).toString(36).toUpperCase().padStart(6, '0')}`;
  }
  return `LINE-${ordinal.toString(36).toUpperCase().padStart(7, '0')}`;
}

export function componentTargetId(fixture, componentOrdinal) {
  assert(Number.isSafeInteger(componentOrdinal) && componentOrdinal >= 0 && componentOrdinal < fixture.components.count,
    'E_QF_SCHEMA_INVALID: component ordinal');
  return `COMP:${fixture.seedTag}:${componentOrdinal.toString(36).padStart(8, '0')}`;
}


export function hashFixture(fixture) {
  const hash = createHash('sha256');
  hash.update(stableStringify({
    schema: fixture.schema,
    manifest: fixture.manifest,
    seedTag: fixture.seedTag,
    generatedAt: fixture.generatedAt,
    sourceHashes: fixture.sourceHashes,
    dictionaries: fixture.dictionaries,
  }));
  hash.update(fixture.lines.targetIdByOrdinal.join('\n'));
  hash.update(fixture.lines.normalizedLineKeyByOrdinal.join('\n'));
  hash.update(fixture.lines.modelPathByOrdinal.join('\n'));
  for (const array of [
    fixture.lines.serviceIdByOrdinal,
    fixture.lines.ratingIdByOrdinal,
    fixture.lines.classIdByOrdinal,
    fixture.lines.flagsByOrdinal,
    fixture.lines.sourceLocatorCountByOrdinal,
    fixture.lines.componentCountByLineOrdinal,
  ]) hash.update(Buffer.from(array.buffer, array.byteOffset, array.byteLength));
  for (const fieldId of ENGINEERING_FIELDS) {
    const column = fixture.lines.engineeringColumns[fieldId];
    hash.update(fieldId);
    hash.update(Buffer.from(column.values.buffer, column.values.byteOffset, column.values.byteLength));
    hash.update(Buffer.from(column.statuses.buffer, column.statuses.byteOffset, column.statuses.byteLength));
  }
  for (const array of [
    fixture.components.parentLineOrdinal,
    fixture.components.typeCode,
    fixture.components.boreMm,
  ]) hash.update(Buffer.from(array.buffer, array.byteOffset, array.byteLength));
  return hash.digest('hex');
}

function applyPinnedFlags(flags, manifest) {
  let cursor = 0;
  cursor = applyFlagRange(flags, cursor, manifest.duplicateKeyTargetCount, LINE_FLAG.DUPLICATE_KEY);
  cursor = applyFlagRange(flags, cursor, manifest.missingMasterTargetCount, LINE_FLAG.MISSING_MASTER);
  cursor = applyFlagRange(flags, cursor, manifest.ambiguousContainmentTargetCount, LINE_FLAG.AMBIGUOUS_CONTAINMENT);
  cursor = applyFlagRange(flags, cursor, manifest.staleSourceTargetCount, LINE_FLAG.STALE_HASH);
  applyFlagRange(flags, cursor, manifest.blockedFieldTargetCount, LINE_FLAG.BLOCKED_FIELD);
}

function applyFlagRange(flags, start, count, bit) {
  for (let index = start; index < start + count; index += 1) flags[index] |= bit;
  return start + count;
}

function deterministicEngineeringValue(lineOrdinal, fieldOrdinal) {
  const whole = ((lineOrdinal + 1) * 37 + (fieldOrdinal + 1) * 101) % 100_000;
  return whole / 100;
}

function statusForLineAndField(flags, fieldOrdinal) {
  if ((flags & LINE_FLAG.MISSING_MASTER) !== 0 && fieldOrdinal % 5 === 0) return FIELD_STATUS.BLOCKED_MISSING;
  if ((flags & LINE_FLAG.AMBIGUOUS_CONTAINMENT) !== 0 && fieldOrdinal % 7 === 0) return FIELD_STATUS.BLOCKED_AMBIGUOUS;
  if ((flags & LINE_FLAG.STALE_HASH) !== 0 && fieldOrdinal % 11 === 0) return FIELD_STATUS.BLOCKED_STALE_SOURCE;
  if ((flags & LINE_FLAG.BLOCKED_FIELD) !== 0 && fieldOrdinal % 13 === 0) return FIELD_STATUS.BLOCKED_CONFLICT;
  if (fieldOrdinal % 17 === 0) return FIELD_STATUS.RESOLVED_DERIVED;
  if (fieldOrdinal % 19 === 0) return FIELD_STATUS.PROPOSED_REVIEW;
  return FIELD_STATUS.RESOLVED_EXACT;
}

export function countFlag(flags, bit) {
  let count = 0;
  for (const value of flags) if ((value & bit) !== 0) count += 1;
  return count;
}

function seedToUint32(seed) {
  return Number.parseInt(sha256Text(seed).slice(0, 8), 16) >>> 0;
}

function createXorshift32(initialState) {
  let state = initialState || 0x9e3779b9;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state;
  };
}
