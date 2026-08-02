import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { deepFreeze } from '../shared-piping-model/immutable.js';
import { failCommonEnrichment } from './errors.js';
import { requireCommonEnrichedField } from './field.js';
import { requireCommonEnrichedPipingClassResolution } from './piping-class-resolution.js';
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

export const COMMON_ENRICHED_MATERIAL_RESOLUTION_SCHEMA = 'common-enriched-material-resolution/v1';
export const COMMON_ENRICHED_MATERIAL_KEY_CONFIG_SCHEMA = 'common-enriched-material-key-config/v1';
export const COMMON_ENRICHED_MATERIAL_FIELD_BINDING_SCHEMA = 'common-enriched-material-field-binding/v1';
export const MATERIAL_VALUE_KINDS = Object.freeze(['NUMBER', 'STRING', 'BOOLEAN']);

const RESOLUTION_KEYS = Object.freeze([
  'schema', 'resolutionId', 'pipingClassResolutionSemanticHash', 'snapshotSemanticHash',
  'keyConfigSemanticHash', 'bindingsSemanticHash', 'targetRecords', 'summary', 'semanticHash',
]);
const KEY_CONFIG_KEYS = Object.freeze(['schema', 'targetMaterialCodeField', 'sourceMaterialCodeField']);
const BINDING_KEYS = Object.freeze(['schema', 'targetField', 'sourceField', 'unit', 'valueKind']);
const SUMMARY_KEYS = Object.freeze([
  'lineTargetCount', 'exactKeyCount', 'blockedKeyCount', 'missingRowCount',
  'ambiguousRowCount', 'exactFieldCount', 'blockedFieldCount', 'conflictFieldCount',
]);
const BLOCKING_PRECEDENCE = Object.freeze([
  'BLOCKED_STALE_SOURCE', 'BLOCKED_CONFLICT', 'BLOCKED_AMBIGUOUS', 'BLOCKED_MISSING',
]);

export function materialResolutionSemanticProjection(value) {
  return Object.fromEntries(RESOLUTION_KEYS
    .filter((key) => key !== 'semanticHash')
    .map((key) => [key, value[key]]));
}

export function computeMaterialResolutionSemanticHash(value) {
  return semanticHash(materialResolutionSemanticProjection(value));
}

export function createCommonEnrichedMaterialResolution(input) {
  requireExactKeys(
    input,
    ['schema', 'resolutionId', 'pipingClassResolution', 'snapshot', 'keyConfig', 'bindings'],
    'materialResolutionDraft',
  );
  if (input.schema !== COMMON_ENRICHED_MATERIAL_RESOLUTION_SCHEMA) schemaError('materialResolutionDraft');

  const upstream = requireCommonEnrichedPipingClassResolution(input.pipingClassResolution);
  const snapshot = requireEngineeringMasterSnapshot(input.snapshot);
  if (snapshot.sourceKind !== 'MATERIAL_REGISTER') {
    failCommonEnrichment(
      'material resolution requires a MATERIAL_REGISTER snapshot.',
      'COMMON_ENRICHED_MATERIAL_SOURCE_INVALID',
      { sourceKind: snapshot.sourceKind },
    );
  }
  const keyConfig = requireCommonEnrichedMaterialKeyConfig(input.keyConfig);
  const bindings = normalizeBindings(input.bindings);
  const index = buildExactIndex(snapshot.records, keyConfig.sourceMaterialCodeField);
  const classifications = [];

  const targetRecords = upstream.targetRecords.map((lineRecord) => {
    const key = resolveTargetKey(lineRecord, keyConfig.targetMaterialCodeField);
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
    schema: COMMON_ENRICHED_MATERIAL_RESOLUTION_SCHEMA,
    resolutionId: requireIdentity(input.resolutionId, 'materialResolution.resolutionId'),
    pipingClassResolutionSemanticHash: upstream.semanticHash,
    snapshotSemanticHash: snapshot.semanticHash,
    keyConfigSemanticHash: semanticHash(keyConfig),
    bindingsSemanticHash: semanticHash(bindings),
    targetRecords,
    summary: summarize(targetRecords, classifications),
    semanticHash: 'fnv1a64:0000000000000000',
  };
  return deepFreeze({ ...draft, semanticHash: computeMaterialResolutionSemanticHash(draft) });
}

export function requireCommonEnrichedMaterialResolution(value) {
  requireExactKeys(value, RESOLUTION_KEYS, 'materialResolution');
  if (value.schema !== COMMON_ENRICHED_MATERIAL_RESOLUTION_SCHEMA) schemaError('materialResolution');
  const result = {
    schema: value.schema,
    resolutionId: requireIdentity(value.resolutionId, 'materialResolution.resolutionId'),
    pipingClassResolutionSemanticHash: hash(value.pipingClassResolutionSemanticHash, 'pipingClassResolutionSemanticHash'),
    snapshotSemanticHash: hash(value.snapshotSemanticHash, 'snapshotSemanticHash'),
    keyConfigSemanticHash: hash(value.keyConfigSemanticHash, 'keyConfigSemanticHash'),
    bindingsSemanticHash: hash(value.bindingsSemanticHash, 'bindingsSemanticHash'),
    targetRecords: requireUniqueSorted(value.targetRecords, 'targetId', 'materialResolution.targetRecords')
      .map(requireCommonEnrichedTargetRecord),
    summary: normalizeSummary(value.summary),
    semanticHash: hash(value.semanticHash, 'semanticHash'),
  };
  requireLineRecords(result.targetRecords);
  const expectedSummary = summarizeFromRecords(result.targetRecords);
  if (JSON.stringify(result.summary) !== JSON.stringify(expectedSummary)) {
    failCommonEnrichment(
      'materialResolution.summary is stale.',
      'COMMON_ENRICHED_SUMMARY_MISMATCH',
      { expected: expectedSummary, actual: result.summary },
    );
  }
  const expectedHash = computeMaterialResolutionSemanticHash(result);
  if (result.semanticHash !== expectedHash) {
    failCommonEnrichment(
      'materialResolution.semanticHash is stale.',
      'COMMON_ENRICHED_HASH_MISMATCH',
      { expected: expectedHash, actual: result.semanticHash },
    );
  }
  return deepFreeze(result);
}

export function requireCommonEnrichedMaterialKeyConfig(value) {
  requireExactKeys(value, KEY_CONFIG_KEYS, 'materialKeyConfig');
  if (value.schema !== COMMON_ENRICHED_MATERIAL_KEY_CONFIG_SCHEMA) schemaError('materialKeyConfig');
  return deepFreeze({
    schema: value.schema,
    targetMaterialCodeField: requireIdentity(value.targetMaterialCodeField, 'materialKeyConfig.targetMaterialCodeField'),
    sourceMaterialCodeField: requireIdentity(value.sourceMaterialCodeField, 'materialKeyConfig.sourceMaterialCodeField'),
  });
}

export function requireCommonEnrichedMaterialFieldBinding(value) {
  requireExactKeys(value, BINDING_KEYS, 'materialFieldBinding');
  if (value.schema !== COMMON_ENRICHED_MATERIAL_FIELD_BINDING_SCHEMA) schemaError('materialFieldBinding');
  return deepFreeze({
    schema: value.schema,
    targetField: requireIdentity(value.targetField, 'materialFieldBinding.targetField'),
    sourceField: requireIdentity(value.sourceField, 'materialFieldBinding.sourceField'),
    unit: requireNullableUnit(value.unit, 'materialFieldBinding.unit'),
    valueKind: requireMember(value.valueKind, MATERIAL_VALUE_KINDS, 'materialFieldBinding.valueKind'),
  });
}

function normalizeBindings(value) {
  const bindings = requireUniqueSorted(value, 'targetField', 'materialResolution.bindings')
    .map(requireCommonEnrichedMaterialFieldBinding);
  if (bindings.length === 0) {
    failCommonEnrichment(
      'material resolution requires at least one field binding.',
      'COMMON_ENRICHED_MATERIAL_BINDINGS_REQUIRED',
    );
  }
  const pairs = bindings.map(({ sourceField, targetField }) => `${sourceField}|${targetField}`);
  if (new Set(pairs).size !== pairs.length) {
    failCommonEnrichment('Duplicate material field binding.', 'COMMON_ENRICHED_DUPLICATE_IDENTITY');
  }
  return Object.freeze(bindings);
}

function buildExactIndex(records, sourceField) {
  const index = new Map();
  requireArray(records, 'materialSnapshot.records').forEach((record, recordIndex) => {
    const raw = record.values?.[sourceField];
    if (typeof raw !== 'string' || !raw.trim()) {
      failCommonEnrichment(
        'MATERIAL_REGISTER master record has an invalid exact material code.',
        'COMMON_ENRICHED_MATERIAL_RECORD_INVALID',
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
  if (!field) failure = ['BLOCKED_MISSING', `MATERIAL_REGISTER_KEY_FIELD_MISSING_${fieldName}`];
  else if (field.status !== 'RESOLVED_EXACT') {
    failure = [keyBlockingStatus(field.status), `MATERIAL_REGISTER_KEY_NOT_EXACT_${fieldName}_${field.status}`];
  } else if (typeof field.value !== 'string' || !field.value.trim()) {
    failure = ['BLOCKED_CONFLICT', `MATERIAL_REGISTER_KEY_TYPE_CONFLICT_${fieldName}`];
  } else if (!field.approved) {
    failure = ['BLOCKED_CONFLICT', `MATERIAL_REGISTER_KEY_NOT_APPROVED_${fieldName}`];
  }
  if (failure) {
    return deepFreeze({
      status: failure[0],
      diagnostics: Object.freeze(['MATERIAL_REGISTER_KEY_BLOCKED', failure[1]].sort(compareAscii)),
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
    sourceKind: 'MATERIAL_REGISTER', sourceKey: snapshot.sourceKey, sourceHash: snapshot.sourceHash,
    locator: `${record.locator}:${binding.sourceField}`,
  };
  if (value === null || value === undefined || value === '') {
    return field(binding, null, 'BLOCKED_MISSING', evidence, 'EXACT_MATERIAL_CODE_FIELD_MISSING', false,
      ['MATERIAL_REGISTER_FIELD_MISSING']);
  }
  if (!matches(value, binding.valueKind)) {
    return field(binding, null, 'BLOCKED_CONFLICT', evidence, 'EXACT_MATERIAL_CODE_FIELD_TYPE_CONFLICT', false,
      ['MATERIAL_REGISTER_FIELD_TYPE_CONFLICT']);
  }
  return field(binding, value, 'RESOLVED_EXACT', evidence, 'EXACT_MATERIAL_CODE_AND_FIELD', true, []);
}

function blockedByKey(binding, key) {
  return field(binding, null, key.status, noEvidence(), 'NONE', false, key.diagnostics);
}

function missingRow(binding, key) {
  return field(binding, null, 'BLOCKED_MISSING', noEvidence(), 'NONE', false,
    ['MATERIAL_REGISTER_EXACT_ROW_MISSING', `MATERIAL_REGISTER_EXACT_KEY_${key.label}`]);
}

function ambiguousRow(binding, records, snapshot) {
  return field(binding, null, 'BLOCKED_AMBIGUOUS', {
    sourceKind: 'MATERIAL_REGISTER', sourceKey: snapshot.sourceKey, sourceHash: snapshot.sourceHash,
    locator: records.map(({ locator }) => locator).sort(compareAscii).join('|'),
  }, 'EXACT_MATERIAL_CODE_MULTIPLE_ROWS', false,
  ['MATERIAL_REGISTER_EXACT_ROW_AMBIGUOUS', `MATERIAL_REGISTER_EXACT_ROW_COUNT_${records.length}`]);
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
    'EXACT_MATERIAL_CODE_AND_FIELD', 'EXACT_MATERIAL_CODE_FIELD_MISSING',
    'EXACT_MATERIAL_CODE_FIELD_TYPE_CONFLICT', 'EXACT_MATERIAL_CODE_MULTIPLE_ROWS',
  ]);
  return deepFreeze({
    lineTargetCount: records.length,
    exactKeyCount: records.filter((_record, index) =>
      [...methods[index]].some((method) => exactMethods.has(method))
      || diagnostics[index].has('MATERIAL_REGISTER_EXACT_ROW_MISSING')).length,
    blockedKeyCount: diagnostics.filter((set) => set.has('MATERIAL_REGISTER_KEY_BLOCKED')).length,
    missingRowCount: diagnostics.filter((set) => set.has('MATERIAL_REGISTER_EXACT_ROW_MISSING')).length,
    ambiguousRowCount: methods.filter((set) => set.has('EXACT_MATERIAL_CODE_MULTIPLE_ROWS')).length,
    exactFieldCount: statuses.filter((status) => status === 'RESOLVED_EXACT').length,
    blockedFieldCount: statuses.filter((status) => status.startsWith('BLOCKED_')).length,
    conflictFieldCount: statuses.filter((status) => status === 'BLOCKED_CONFLICT').length,
  });
}

function normalizeSummary(value) {
  requireExactKeys(value, SUMMARY_KEYS, 'materialResolution.summary');
  return deepFreeze(Object.fromEntries(SUMMARY_KEYS.map((key) => [
    key, requireNonNegativeInteger(value[key], `materialResolution.summary.${key}`),
  ])));
}

function requireLineRecords(records) {
  for (const record of records) {
    if (record.targetKind !== 'LINE' || record.lineKey === null
      || record.targetId !== `LINE:${encodeURIComponent(record.lineKey)}`
      || record.sourceRecordId !== record.targetId) {
      failCommonEnrichment(
        'material resolution contains an inconsistent line target.',
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
  return requireSemanticHash(value, `materialResolution.${fieldName}`);
}
function noEvidence() {
  return { sourceKind: 'NONE', sourceKey: null, sourceHash: null, locator: null };
}
function canonicalCode(value) {
  return requireIdentity(String(value).trim().toUpperCase(), 'materialRegisterKey.materialCode');
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
