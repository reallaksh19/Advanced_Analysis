import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { deepFreeze } from '../shared-piping-model/immutable.js';
import { failCommonEnrichment } from './errors.js';
import { requireCommonEnrichedField } from './field.js';
import { requireCommonEnrichedLineListResolution } from './line-list-resolution.js';
import {
  COMMON_ENRICHED_TARGET_RECORD_SCHEMA,
  createCommonEnrichedTargetRecord,
  requireCommonEnrichedTargetRecord,
} from './target-record.js';
import { requireEngineeringMasterSnapshot } from './source-snapshot.js';
import {
  compareAscii,
  requireArray,
  requireExactKeys,
  requireIdentity,
  requireMember,
  requireNonNegativeInteger,
  requireNullableUnit,
  requireSemanticHash,
  requireUniqueSorted,
} from './validation.js';

export const COMMON_ENRICHED_FLUID_RESOLUTION_SCHEMA = 'common-enriched-fluid-resolution/v1';
export const COMMON_ENRICHED_FLUID_KEY_CONFIG_SCHEMA = 'common-enriched-fluid-key-config/v1';
export const COMMON_ENRICHED_FLUID_FIELD_BINDING_SCHEMA = 'common-enriched-fluid-field-binding/v1';
export const FLUID_VALUE_KINDS = Object.freeze(['NUMBER', 'STRING', 'BOOLEAN']);

const RESOLUTION_KEYS = Object.freeze([
  'schema', 'resolutionId', 'lineListResolutionSemanticHash', 'snapshotSemanticHash',
  'keyConfigSemanticHash', 'bindingsSemanticHash', 'targetRecords', 'summary', 'semanticHash',
]);
const KEY_CONFIG_KEYS = Object.freeze(['schema', 'targetFluidCodeField', 'sourceFluidCodeField']);
const BINDING_KEYS = Object.freeze(['schema', 'targetField', 'sourceField', 'unit', 'valueKind']);
const SUMMARY_KEYS = Object.freeze([
  'lineTargetCount', 'exactKeyCount', 'blockedKeyCount', 'missingRowCount',
  'ambiguousRowCount', 'exactFieldCount', 'blockedFieldCount', 'conflictFieldCount',
]);
const BLOCKING_PRECEDENCE = Object.freeze([
  'BLOCKED_STALE_SOURCE', 'BLOCKED_CONFLICT', 'BLOCKED_AMBIGUOUS', 'BLOCKED_MISSING',
]);

export function fluidResolutionSemanticProjection(value) {
  return Object.fromEntries(RESOLUTION_KEYS
    .filter((key) => key !== 'semanticHash')
    .map((key) => [key, value[key]]));
}

export function computeFluidResolutionSemanticHash(value) {
  return semanticHash(fluidResolutionSemanticProjection(value));
}

export function createCommonEnrichedFluidResolution(input) {
  requireExactKeys(
    input,
    ['schema', 'resolutionId', 'lineListResolution', 'snapshot', 'keyConfig', 'bindings'],
    'fluidResolutionDraft',
  );
  if (input.schema !== COMMON_ENRICHED_FLUID_RESOLUTION_SCHEMA) schemaError('fluidResolutionDraft');

  const upstream = requireCommonEnrichedLineListResolution(input.lineListResolution);
  const snapshot = requireEngineeringMasterSnapshot(input.snapshot);
  if (snapshot.sourceKind !== 'FLUID_REGISTER') {
    failCommonEnrichment(
      'fluid resolution requires a FLUID_REGISTER snapshot.',
      'COMMON_ENRICHED_FLUID_SOURCE_INVALID',
      { sourceKind: snapshot.sourceKind },
    );
  }
  const keyConfig = requireCommonEnrichedFluidKeyConfig(input.keyConfig);
  const bindings = normalizeBindings(input.bindings);
  const index = buildExactIndex(snapshot.records, keyConfig.sourceFluidCodeField);
  const classifications = [];

  const targetRecords = upstream.targetRecords.map((lineRecord) => {
    const key = resolveTargetKey(lineRecord, keyConfig.targetFluidCodeField);
    if (key.status !== 'EXACT') {
      classifications.push({ key: 'BLOCKED', row: 'NOT_QUERIED' });
      return resultRecord(lineRecord, bindings.map((binding) => blockedByKey(binding, key)));
    }
    const bucket = index.get(key.value) || [];
    const row = bucket.length === 0 ? 'MISSING' : bucket.length === 1 ? 'EXACT' : 'AMBIGUOUS';
    classifications.push({ key: 'EXACT', row });
    return resultRecord(lineRecord, resolveFields(key, bucket, snapshot, bindings));
  }).sort(by('targetId'));

  const draft = {
    schema: COMMON_ENRICHED_FLUID_RESOLUTION_SCHEMA,
    resolutionId: requireIdentity(input.resolutionId, 'fluidResolution.resolutionId'),
    lineListResolutionSemanticHash: upstream.semanticHash,
    snapshotSemanticHash: snapshot.semanticHash,
    keyConfigSemanticHash: semanticHash(keyConfig),
    bindingsSemanticHash: semanticHash(bindings),
    targetRecords,
    summary: summarize(targetRecords, classifications),
    semanticHash: 'fnv1a64:0000000000000000',
  };
  return deepFreeze({ ...draft, semanticHash: computeFluidResolutionSemanticHash(draft) });
}

export function requireCommonEnrichedFluidResolution(value) {
  requireExactKeys(value, RESOLUTION_KEYS, 'fluidResolution');
  if (value.schema !== COMMON_ENRICHED_FLUID_RESOLUTION_SCHEMA) schemaError('fluidResolution');
  const result = {
    schema: value.schema,
    resolutionId: requireIdentity(value.resolutionId, 'fluidResolution.resolutionId'),
    lineListResolutionSemanticHash: hash(value.lineListResolutionSemanticHash, 'lineListResolutionSemanticHash'),
    snapshotSemanticHash: hash(value.snapshotSemanticHash, 'snapshotSemanticHash'),
    keyConfigSemanticHash: hash(value.keyConfigSemanticHash, 'keyConfigSemanticHash'),
    bindingsSemanticHash: hash(value.bindingsSemanticHash, 'bindingsSemanticHash'),
    targetRecords: requireUniqueSorted(value.targetRecords, 'targetId', 'fluidResolution.targetRecords')
      .map(requireCommonEnrichedTargetRecord),
    summary: normalizeSummary(value.summary),
    semanticHash: hash(value.semanticHash, 'semanticHash'),
  };
  requireLineRecords(result.targetRecords);
  const expectedSummary = summarizeFromRecords(result.targetRecords);
  if (JSON.stringify(result.summary) !== JSON.stringify(expectedSummary)) {
    failCommonEnrichment(
      'fluidResolution.summary is stale.',
      'COMMON_ENRICHED_SUMMARY_MISMATCH',
      { expected: expectedSummary, actual: result.summary },
    );
  }
  const expectedHash = computeFluidResolutionSemanticHash(result);
  if (result.semanticHash !== expectedHash) {
    failCommonEnrichment(
      'fluidResolution.semanticHash is stale.',
      'COMMON_ENRICHED_HASH_MISMATCH',
      { expected: expectedHash, actual: result.semanticHash },
    );
  }
  return deepFreeze(result);
}

export function requireCommonEnrichedFluidKeyConfig(value) {
  requireExactKeys(value, KEY_CONFIG_KEYS, 'fluidKeyConfig');
  if (value.schema !== COMMON_ENRICHED_FLUID_KEY_CONFIG_SCHEMA) schemaError('fluidKeyConfig');
  return deepFreeze({
    schema: value.schema,
    targetFluidCodeField: requireIdentity(value.targetFluidCodeField, 'fluidKeyConfig.targetFluidCodeField'),
    sourceFluidCodeField: requireIdentity(value.sourceFluidCodeField, 'fluidKeyConfig.sourceFluidCodeField'),
  });
}

export function requireCommonEnrichedFluidFieldBinding(value) {
  requireExactKeys(value, BINDING_KEYS, 'fluidFieldBinding');
  if (value.schema !== COMMON_ENRICHED_FLUID_FIELD_BINDING_SCHEMA) schemaError('fluidFieldBinding');
  return deepFreeze({
    schema: value.schema,
    targetField: requireIdentity(value.targetField, 'fluidFieldBinding.targetField'),
    sourceField: requireIdentity(value.sourceField, 'fluidFieldBinding.sourceField'),
    unit: requireNullableUnit(value.unit, 'fluidFieldBinding.unit'),
    valueKind: requireMember(value.valueKind, FLUID_VALUE_KINDS, 'fluidFieldBinding.valueKind'),
  });
}

function normalizeBindings(value) {
  const bindings = requireUniqueSorted(value, 'targetField', 'fluidResolution.bindings')
    .map(requireCommonEnrichedFluidFieldBinding);
  if (bindings.length === 0) {
    failCommonEnrichment(
      'fluid resolution requires at least one field binding.',
      'COMMON_ENRICHED_FLUID_BINDINGS_REQUIRED',
    );
  }
  const pairs = bindings.map(({ sourceField, targetField }) => `${sourceField}|${targetField}`);
  if (new Set(pairs).size !== pairs.length) {
    failCommonEnrichment('Duplicate fluid field binding.', 'COMMON_ENRICHED_DUPLICATE_IDENTITY');
  }
  return Object.freeze(bindings);
}

function buildExactIndex(records, sourceField) {
  const index = new Map();
  requireArray(records, 'fluidSnapshot.records').forEach((record, recordIndex) => {
    const raw = record.values?.[sourceField];
    if (typeof raw !== 'string' || !raw.trim()) {
      failCommonEnrichment(
        'FLUID_REGISTER master record has an invalid exact fluid code.',
        'COMMON_ENRICHED_FLUID_RECORD_INVALID',
        { recordId: record.recordId, recordIndex },
      );
    }
    const key = canonicalCode(raw);
    const bucket = index.get(key) || [];
    bucket.push(record);
    index.set(key, bucket);
  });
  for (const bucket of index.values()) bucket.sort(by('recordId'));
  return index;
}

function resolveTargetKey(lineRecord, fieldName) {
  const field = lineRecord.fields.find((entry) => entry.field === fieldName);
  let failure = null;
  if (!field) failure = ['BLOCKED_MISSING', `FLUID_REGISTER_KEY_FIELD_MISSING_${fieldName}`];
  else if (field.status !== 'RESOLVED_EXACT') {
    failure = [keyBlockingStatus(field.status), `FLUID_REGISTER_KEY_NOT_EXACT_${fieldName}_${field.status}`];
  } else if (typeof field.value !== 'string' || !field.value.trim()) {
    failure = ['BLOCKED_CONFLICT', `FLUID_REGISTER_KEY_TYPE_CONFLICT_${fieldName}`];
  } else if (!field.approved) {
    failure = ['BLOCKED_CONFLICT', `FLUID_REGISTER_KEY_NOT_APPROVED_${fieldName}`];
  }
  if (failure) {
    return deepFreeze({
      status: failure[0],
      diagnostics: Object.freeze(['FLUID_REGISTER_KEY_BLOCKED', failure[1]].sort(compareAscii)),
    });
  }
  const value = canonicalCode(field.value);
  return deepFreeze({ status: 'EXACT', value, label: encodeURIComponent(value), diagnostics: Object.freeze([]) });
}

function resolveFields(key, bucket, snapshot, bindings) {
  if (bucket.length === 0) return bindings.map((binding) => missingRow(binding, key));
  if (bucket.length > 1) return bindings.map((binding) => ambiguousRow(binding, bucket, snapshot));
  return bindings.map((binding) => exactField(binding, bucket[0], snapshot));
}

function exactField(binding, record, snapshot) {
  const value = record.values[binding.sourceField];
  const evidence = {
    sourceKind: 'FLUID_REGISTER', sourceKey: snapshot.sourceKey, sourceHash: snapshot.sourceHash,
    locator: `${record.locator}:${binding.sourceField}`,
  };
  if (value === null || value === undefined || value === '') {
    return field(binding, null, 'BLOCKED_MISSING', evidence, 'EXACT_FLUID_CODE_FIELD_MISSING', false,
      ['FLUID_REGISTER_FIELD_MISSING']);
  }
  if (!matches(value, binding.valueKind)) {
    return field(binding, null, 'BLOCKED_CONFLICT', evidence, 'EXACT_FLUID_CODE_FIELD_TYPE_CONFLICT', false,
      ['FLUID_REGISTER_FIELD_TYPE_CONFLICT']);
  }
  return field(binding, value, 'RESOLVED_EXACT', evidence, 'EXACT_FLUID_CODE_AND_FIELD', true, []);
}

function blockedByKey(binding, key) {
  return field(binding, null, key.status, noEvidence(), 'NONE', false, key.diagnostics);
}

function missingRow(binding, key) {
  return field(binding, null, 'BLOCKED_MISSING', noEvidence(), 'NONE', false,
    ['FLUID_REGISTER_EXACT_ROW_MISSING', `FLUID_REGISTER_EXACT_KEY_${key.label}`]);
}

function ambiguousRow(binding, records, snapshot) {
  return field(binding, null, 'BLOCKED_AMBIGUOUS', {
    sourceKind: 'FLUID_REGISTER', sourceKey: snapshot.sourceKey, sourceHash: snapshot.sourceHash,
    locator: records.map(({ locator }) => locator).sort(compareAscii).join('|'),
  }, 'EXACT_FLUID_CODE_MULTIPLE_ROWS', false,
  ['FLUID_REGISTER_EXACT_ROW_AMBIGUOUS', `FLUID_REGISTER_EXACT_ROW_COUNT_${records.length}`]);
}

function field(binding, value, status, evidence, matchMethod, approved, diagnostics) {
  return requireCommonEnrichedField({
    schema: 'common-enriched-properties-field/v1',
    field: binding.targetField,
    value,
    unit: binding.unit,
    status,
    ...evidence,
    matchMethod,
    confidence: status === 'RESOLVED_EXACT' ? 1 : 0,
    policyId: null,
    policyHash: null,
    reviewEventId: null,
    approved,
    diagnostics: [...new Set(diagnostics)].sort(compareAscii),
  });
}

function resultRecord(source, fields) {
  return createCommonEnrichedTargetRecord({
    schema: COMMON_ENRICHED_TARGET_RECORD_SCHEMA,
    targetId: source.targetId,
    targetKind: 'LINE',
    sourceModelHash: source.sourceModelHash,
    sourceRecordId: source.sourceRecordId,
    lineKey: source.lineKey,
    fields,
  });
}

function summarize(records, classifications) {
  const statuses = records.flatMap(({ fields }) => fields.map(({ status }) => status));
  return deepFreeze({
    lineTargetCount: records.length,
    exactKeyCount: classifications.filter(({ key }) => key === 'EXACT').length,
    blockedKeyCount: classifications.filter(({ key }) => key === 'BLOCKED').length,
    missingRowCount: classifications.filter(({ row }) => row === 'MISSING').length,
    ambiguousRowCount: classifications.filter(({ row }) => row === 'AMBIGUOUS').length,
    exactFieldCount: statuses.filter((status) => status === 'RESOLVED_EXACT').length,
    blockedFieldCount: statuses.filter((status) => status.startsWith('BLOCKED_')).length,
    conflictFieldCount: statuses.filter((status) => status === 'BLOCKED_CONFLICT').length,
  });
}

function summarizeFromRecords(records) {
  const methods = records.map(({ fields }) => new Set(fields.map(({ matchMethod }) => matchMethod)));
  const diagnostics = records.map(({ fields }) => new Set(fields.flatMap(({ diagnostics: codes }) => codes)));
  const statuses = records.flatMap(({ fields }) => fields.map(({ status }) => status));
  const exactMethods = new Set([
    'EXACT_FLUID_CODE_AND_FIELD', 'EXACT_FLUID_CODE_FIELD_MISSING',
    'EXACT_FLUID_CODE_FIELD_TYPE_CONFLICT', 'EXACT_FLUID_CODE_MULTIPLE_ROWS',
  ]);
  return deepFreeze({
    lineTargetCount: records.length,
    exactKeyCount: records.filter((_record, index) =>
      [...methods[index]].some((method) => exactMethods.has(method))
      || diagnostics[index].has('FLUID_REGISTER_EXACT_ROW_MISSING')).length,
    blockedKeyCount: diagnostics.filter((set) => set.has('FLUID_REGISTER_KEY_BLOCKED')).length,
    missingRowCount: diagnostics.filter((set) => set.has('FLUID_REGISTER_EXACT_ROW_MISSING')).length,
    ambiguousRowCount: methods.filter((set) => set.has('EXACT_FLUID_CODE_MULTIPLE_ROWS')).length,
    exactFieldCount: statuses.filter((status) => status === 'RESOLVED_EXACT').length,
    blockedFieldCount: statuses.filter((status) => status.startsWith('BLOCKED_')).length,
    conflictFieldCount: statuses.filter((status) => status === 'BLOCKED_CONFLICT').length,
  });
}

function normalizeSummary(value) {
  requireExactKeys(value, SUMMARY_KEYS, 'fluidResolution.summary');
  return deepFreeze(Object.fromEntries(SUMMARY_KEYS.map((key) => [
    key, requireNonNegativeInteger(value[key], `fluidResolution.summary.${key}`),
  ])));
}

function requireLineRecords(records) {
  for (const record of records) {
    if (record.targetKind !== 'LINE' || record.lineKey === null
      || record.targetId !== `LINE:${encodeURIComponent(record.lineKey)}`
      || record.sourceRecordId !== record.targetId) {
      failCommonEnrichment(
        'fluid resolution contains an inconsistent line target.',
        'COMMON_ENRICHED_TARGET_RELATIONSHIP_INVALID',
        { targetId: record.targetId },
      );
    }
  }
}

function keyBlockingStatus(status) {
  if (BLOCKING_PRECEDENCE.includes(status)) return status;
  return status === 'PROPOSED_REVIEW' || status === 'RESOLVED_DERIVED'
    ? 'BLOCKED_CONFLICT'
    : 'BLOCKED_MISSING';
}

function hash(value, fieldName) {
  return requireSemanticHash(value, `fluidResolution.${fieldName}`);
}
function noEvidence() {
  return { sourceKind: 'NONE', sourceKey: null, sourceHash: null, locator: null };
}
function canonicalCode(value) {
  return requireIdentity(String(value).trim().toUpperCase(), 'fluidRegisterKey.fluidCode');
}
function matches(value, kind) {
  if (kind === 'NUMBER') return typeof value === 'number' && Number.isFinite(value);
  if (kind === 'STRING') return typeof value === 'string';
  return typeof value === 'boolean';
}
function schemaError(fieldName) {
  failCommonEnrichment(`${fieldName}.schema is unsupported.`, 'COMMON_ENRICHED_SCHEMA_INVALID');
}
function by(name) {
  return (left, right) => compareAscii(left[name], right[name]);
}
