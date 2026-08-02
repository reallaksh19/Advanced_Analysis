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
  requireOptionalIdentity,
  requireSemanticHash,
  requireUniqueSorted,
} from './validation.js';

export const COMMON_ENRICHED_PIPING_CLASS_RESOLUTION_SCHEMA =
  'common-enriched-piping-class-resolution/v1';
export const COMMON_ENRICHED_PIPING_CLASS_KEY_CONFIG_SCHEMA =
  'common-enriched-piping-class-key-config/v1';
export const COMMON_ENRICHED_PIPING_CLASS_FIELD_BINDING_SCHEMA =
  'common-enriched-piping-class-field-binding/v1';

export const PIPING_CLASS_VALUE_KINDS = Object.freeze([
  'NUMBER',
  'STRING',
  'BOOLEAN',
]);

const RESOLUTION_KEYS = Object.freeze([
  'schema',
  'resolutionId',
  'lineListResolutionSemanticHash',
  'snapshotSemanticHash',
  'keyConfigSemanticHash',
  'bindingsSemanticHash',
  'targetRecords',
  'summary',
  'semanticHash',
]);
const KEY_CONFIG_KEYS = Object.freeze([
  'schema',
  'targetClassField',
  'targetBoreField',
  'targetScheduleField',
  'sourceClassField',
  'sourceBoreField',
  'sourceScheduleField',
]);
const BINDING_KEYS = Object.freeze([
  'schema',
  'targetField',
  'sourceField',
  'unit',
  'valueKind',
]);
const SUMMARY_KEYS = Object.freeze([
  'lineTargetCount',
  'exactKeyCount',
  'blockedKeyCount',
  'missingRowCount',
  'ambiguousRowCount',
  'exactFieldCount',
  'blockedFieldCount',
  'conflictFieldCount',
]);
const BLOCKING_PRECEDENCE = Object.freeze([
  'BLOCKED_STALE_SOURCE',
  'BLOCKED_CONFLICT',
  'BLOCKED_AMBIGUOUS',
  'BLOCKED_MISSING',
]);

export function pipingClassResolutionSemanticProjection(value) {
  return {
    schema: value.schema,
    resolutionId: value.resolutionId,
    lineListResolutionSemanticHash: value.lineListResolutionSemanticHash,
    snapshotSemanticHash: value.snapshotSemanticHash,
    keyConfigSemanticHash: value.keyConfigSemanticHash,
    bindingsSemanticHash: value.bindingsSemanticHash,
    targetRecords: value.targetRecords,
    summary: value.summary,
  };
}

export function computePipingClassResolutionSemanticHash(value) {
  return semanticHash(pipingClassResolutionSemanticProjection(value));
}

export function createCommonEnrichedPipingClassResolution(input) {
  requireExactKeys(
    input,
    ['schema', 'resolutionId', 'lineListResolution', 'snapshot', 'keyConfig', 'bindings'],
    'pipingClassResolutionDraft',
  );
  if (input.schema !== COMMON_ENRICHED_PIPING_CLASS_RESOLUTION_SCHEMA) {
    failCommonEnrichment(
      'pipingClassResolutionDraft.schema is unsupported.',
      'COMMON_ENRICHED_SCHEMA_INVALID',
    );
  }

  const lineListResolution = requireCommonEnrichedLineListResolution(input.lineListResolution);
  const snapshot = requireEngineeringMasterSnapshot(input.snapshot);
  if (snapshot.sourceKind !== 'PIPING_CLASS') {
    failCommonEnrichment(
      'piping-class resolution requires a PIPING_CLASS snapshot.',
      'COMMON_ENRICHED_PIPING_CLASS_SOURCE_INVALID',
      { sourceKind: snapshot.sourceKind },
    );
  }
  const keyConfig = requireCommonEnrichedPipingClassKeyConfig(input.keyConfig);
  const bindings = normalizeBindings(input.bindings);
  const sourceIndex = buildExactPipingClassIndex(snapshot.records, keyConfig);
  const classifications = [];

  const targetRecords = lineListResolution.targetRecords.map((lineRecord) => {
    const keyState = resolveTargetKey(lineRecord, keyConfig);
    if (keyState.status !== 'EXACT') {
      classifications.push({ key: 'BLOCKED', row: 'NOT_QUERIED' });
      return createResultRecord(
        lineRecord,
        bindings.map((binding) => blockedByKeyField(binding, keyState)),
      );
    }

    const bucket = sourceIndex.get(keyState.key) || [];
    const rowStatus = bucket.length === 0 ? 'MISSING' : bucket.length === 1 ? 'EXACT' : 'AMBIGUOUS';
    classifications.push({ key: 'EXACT', row: rowStatus });
    return createResultRecord(
      lineRecord,
      resolvePipingClassFields(keyState, bucket, snapshot, bindings),
    );
  }).sort(byField('targetId'));

  const summary = buildSummary(targetRecords, classifications);
  const draft = {
    schema: COMMON_ENRICHED_PIPING_CLASS_RESOLUTION_SCHEMA,
    resolutionId: requireIdentity(input.resolutionId, 'pipingClassResolution.resolutionId'),
    lineListResolutionSemanticHash: lineListResolution.semanticHash,
    snapshotSemanticHash: snapshot.semanticHash,
    keyConfigSemanticHash: semanticHash(keyConfig),
    bindingsSemanticHash: semanticHash(bindings),
    targetRecords,
    summary,
    semanticHash: 'fnv1a64:0000000000000000',
  };
  return deepFreeze({
    ...draft,
    semanticHash: computePipingClassResolutionSemanticHash(draft),
  });
}

export function requireCommonEnrichedPipingClassResolution(value) {
  requireExactKeys(value, RESOLUTION_KEYS, 'pipingClassResolution');
  if (value.schema !== COMMON_ENRICHED_PIPING_CLASS_RESOLUTION_SCHEMA) {
    failCommonEnrichment(
      'pipingClassResolution.schema is unsupported.',
      'COMMON_ENRICHED_SCHEMA_INVALID',
    );
  }
  const resolution = {
    schema: value.schema,
    resolutionId: requireIdentity(value.resolutionId, 'pipingClassResolution.resolutionId'),
    lineListResolutionSemanticHash: requireSemanticHash(
      value.lineListResolutionSemanticHash,
      'pipingClassResolution.lineListResolutionSemanticHash',
    ),
    snapshotSemanticHash: requireSemanticHash(
      value.snapshotSemanticHash,
      'pipingClassResolution.snapshotSemanticHash',
    ),
    keyConfigSemanticHash: requireSemanticHash(
      value.keyConfigSemanticHash,
      'pipingClassResolution.keyConfigSemanticHash',
    ),
    bindingsSemanticHash: requireSemanticHash(
      value.bindingsSemanticHash,
      'pipingClassResolution.bindingsSemanticHash',
    ),
    targetRecords: requireUniqueSorted(
      value.targetRecords,
      'targetId',
      'pipingClassResolution.targetRecords',
    ).map(requireCommonEnrichedTargetRecord),
    summary: requireSummary(value.summary),
    semanticHash: requireSemanticHash(value.semanticHash, 'pipingClassResolution.semanticHash'),
  };
  requireLineTargetRecords(resolution.targetRecords);
  const expectedSummary = buildSummaryFromRecords(resolution.targetRecords);
  if (JSON.stringify(resolution.summary) !== JSON.stringify(expectedSummary)) {
    failCommonEnrichment(
      'pipingClassResolution.summary is stale.',
      'COMMON_ENRICHED_SUMMARY_MISMATCH',
      { expected: expectedSummary, actual: resolution.summary },
    );
  }
  const expectedHash = computePipingClassResolutionSemanticHash(resolution);
  if (resolution.semanticHash !== expectedHash) {
    failCommonEnrichment(
      'pipingClassResolution.semanticHash is stale.',
      'COMMON_ENRICHED_HASH_MISMATCH',
      { expected: expectedHash, actual: resolution.semanticHash },
    );
  }
  return deepFreeze(resolution);
}

export function requireCommonEnrichedPipingClassKeyConfig(value) {
  requireExactKeys(value, KEY_CONFIG_KEYS, 'pipingClassKeyConfig');
  if (value.schema !== COMMON_ENRICHED_PIPING_CLASS_KEY_CONFIG_SCHEMA) {
    failCommonEnrichment(
      'pipingClassKeyConfig.schema is unsupported.',
      'COMMON_ENRICHED_SCHEMA_INVALID',
    );
  }
  const config = {
    schema: value.schema,
    targetClassField: requireIdentity(
      value.targetClassField,
      'pipingClassKeyConfig.targetClassField',
    ),
    targetBoreField: requireIdentity(
      value.targetBoreField,
      'pipingClassKeyConfig.targetBoreField',
    ),
    targetScheduleField: requireOptionalIdentity(
      value.targetScheduleField,
      'pipingClassKeyConfig.targetScheduleField',
    ),
    sourceClassField: requireIdentity(
      value.sourceClassField,
      'pipingClassKeyConfig.sourceClassField',
    ),
    sourceBoreField: requireIdentity(
      value.sourceBoreField,
      'pipingClassKeyConfig.sourceBoreField',
    ),
    sourceScheduleField: requireOptionalIdentity(
      value.sourceScheduleField,
      'pipingClassKeyConfig.sourceScheduleField',
    ),
  };
  if ((config.targetScheduleField === null) !== (config.sourceScheduleField === null)) {
    failCommonEnrichment(
      'Piping-class schedule fields must both be configured or both be null.',
      'COMMON_ENRICHED_PIPING_CLASS_KEY_CONFIG_INVALID',
    );
  }
  if (new Set([
    config.targetClassField,
    config.targetBoreField,
    config.targetScheduleField,
  ].filter(Boolean)).size !== (config.targetScheduleField === null ? 2 : 3)) {
    failCommonEnrichment(
      'Piping-class target key fields must be distinct.',
      'COMMON_ENRICHED_PIPING_CLASS_KEY_CONFIG_INVALID',
    );
  }
  return deepFreeze(config);
}

export function requireCommonEnrichedPipingClassFieldBinding(value) {
  requireExactKeys(value, BINDING_KEYS, 'pipingClassFieldBinding');
  if (value.schema !== COMMON_ENRICHED_PIPING_CLASS_FIELD_BINDING_SCHEMA) {
    failCommonEnrichment(
      'pipingClassFieldBinding.schema is unsupported.',
      'COMMON_ENRICHED_SCHEMA_INVALID',
    );
  }
  return deepFreeze({
    schema: value.schema,
    targetField: requireIdentity(value.targetField, 'pipingClassFieldBinding.targetField'),
    sourceField: requireIdentity(value.sourceField, 'pipingClassFieldBinding.sourceField'),
    unit: requireNullableUnit(value.unit, 'pipingClassFieldBinding.unit'),
    valueKind: requireMember(
      value.valueKind,
      PIPING_CLASS_VALUE_KINDS,
      'pipingClassFieldBinding.valueKind',
    ),
  });
}

function normalizeBindings(value) {
  const bindings = requireUniqueSorted(
    requireArray(value, 'pipingClassResolution.bindings'),
    'targetField',
    'pipingClassResolution.bindings',
  ).map(requireCommonEnrichedPipingClassFieldBinding);
  if (bindings.length === 0) {
    failCommonEnrichment(
      'piping-class resolution requires at least one field binding.',
      'COMMON_ENRICHED_PIPING_CLASS_BINDINGS_REQUIRED',
    );
  }
  const sourceTargetPairs = bindings.map((binding) => `${binding.sourceField}|${binding.targetField}`);
  if (new Set(sourceTargetPairs).size !== sourceTargetPairs.length) {
    failCommonEnrichment(
      'piping-class field bindings contain a duplicate source/target pair.',
      'COMMON_ENRICHED_DUPLICATE_IDENTITY',
    );
  }
  return Object.freeze(bindings);
}

function buildExactPipingClassIndex(records, config) {
  const index = new Map();
  records.forEach((record, recordIndex) => {
    const classValue = record.values?.[config.sourceClassField];
    const boreValue = record.values?.[config.sourceBoreField];
    const scheduleValue = config.sourceScheduleField === null
      ? null
      : record.values?.[config.sourceScheduleField];
    if (typeof classValue !== 'string' || !classValue.trim()
      || typeof boreValue !== 'number' || !Number.isFinite(boreValue)
      || (config.sourceScheduleField !== null
        && (typeof scheduleValue !== 'string' || !scheduleValue.trim()))) {
      failCommonEnrichment(
        'PIPING_CLASS master record has an invalid exact key.',
        'COMMON_ENRICHED_PIPING_CLASS_RECORD_INVALID',
        { recordId: record.recordId, recordIndex },
      );
    }
    const key = compositeKey(classValue, boreValue, scheduleValue);
    const bucket = index.get(key) || [];
    bucket.push(record);
    index.set(key, bucket);
  });
  for (const bucket of index.values()) bucket.sort(byField('recordId'));
  return index;
}

function resolveTargetKey(lineRecord, config) {
  const fieldsByName = new Map(lineRecord.fields.map((field) => [field.field, field]));
  const requirements = [
    { name: config.targetClassField, kind: 'STRING' },
    { name: config.targetBoreField, kind: 'NUMBER' },
    ...(config.targetScheduleField === null
      ? []
      : [{ name: config.targetScheduleField, kind: 'STRING' }]),
  ];
  const failures = [];
  const values = [];

  requirements.forEach((requirement) => {
    const field = fieldsByName.get(requirement.name);
    if (!field) {
      failures.push({
        status: 'BLOCKED_MISSING',
        diagnostic: `PIPING_CLASS_KEY_FIELD_MISSING_${requirement.name}`,
      });
      return;
    }
    if (field.status !== 'RESOLVED_EXACT') {
      failures.push({
        status: keyBlockingStatus(field.status),
        diagnostic: `PIPING_CLASS_KEY_NOT_EXACT_${requirement.name}_${field.status}`,
      });
      return;
    }
    if (!matchesValueKind(field.value, requirement.kind)) {
      failures.push({
        status: 'BLOCKED_CONFLICT',
        diagnostic: `PIPING_CLASS_KEY_TYPE_CONFLICT_${requirement.name}`,
      });
      return;
    }
    values.push(field.value);
  });

  if (failures.length > 0) {
    return deepFreeze({
      status: selectBlockingStatus(failures.map((failure) => failure.status)),
      diagnostics: Object.freeze([
        'PIPING_CLASS_KEY_BLOCKED',
        ...failures.map((failure) => failure.diagnostic),
      ].sort(compareAscii)),
    });
  }

  return deepFreeze({
    status: 'EXACT',
    key: compositeKey(values[0], values[1], values[2] ?? null),
    label: compositeKeyLabel(values[0], values[1], values[2] ?? null),
    diagnostics: Object.freeze([]),
  });
}

function resolvePipingClassFields(keyState, bucket, snapshot, bindings) {
  if (bucket.length === 0) {
    return bindings.map((binding) => blockedNoMatchField(binding, keyState));
  }
  if (bucket.length > 1) {
    return bindings.map((binding) => blockedAmbiguousField(binding, bucket, snapshot));
  }
  return bindings.map((binding) => exactOrBlockedField(
    binding,
    bucket[0],
    snapshot,
  ));
}

function exactOrBlockedField(binding, record, snapshot) {
  const value = record.values[binding.sourceField];
  const locator = `${record.locator}:${binding.sourceField}`;
  if (value === null || value === undefined || value === '') {
    return createField({
      binding,
      value: null,
      status: 'BLOCKED_MISSING',
      sourceKind: 'PIPING_CLASS',
      sourceKey: snapshot.sourceKey,
      sourceHash: snapshot.sourceHash,
      locator,
      matchMethod: 'EXACT_PIPING_CLASS_KEY_FIELD_MISSING',
      approved: false,
      diagnostics: ['PIPING_CLASS_FIELD_MISSING'],
    });
  }
  if (!matchesValueKind(value, binding.valueKind)) {
    return createField({
      binding,
      value: null,
      status: 'BLOCKED_CONFLICT',
      sourceKind: 'PIPING_CLASS',
      sourceKey: snapshot.sourceKey,
      sourceHash: snapshot.sourceHash,
      locator,
      matchMethod: 'EXACT_PIPING_CLASS_KEY_FIELD_TYPE_CONFLICT',
      approved: false,
      diagnostics: ['PIPING_CLASS_FIELD_TYPE_CONFLICT'],
    });
  }
  return createField({
    binding,
    value,
    status: 'RESOLVED_EXACT',
    sourceKind: 'PIPING_CLASS',
    sourceKey: snapshot.sourceKey,
    sourceHash: snapshot.sourceHash,
    locator,
    matchMethod: 'EXACT_PIPING_CLASS_KEY_AND_FIELD',
    approved: true,
    diagnostics: [],
  });
}

function blockedByKeyField(binding, keyState) {
  return createField({
    binding,
    value: null,
    status: keyState.status,
    sourceKind: 'NONE',
    sourceKey: null,
    sourceHash: null,
    locator: null,
    matchMethod: 'NONE',
    approved: false,
    diagnostics: keyState.diagnostics,
  });
}

function blockedNoMatchField(binding, keyState) {
  return createField({
    binding,
    value: null,
    status: 'BLOCKED_MISSING',
    sourceKind: 'NONE',
    sourceKey: null,
    sourceHash: null,
    locator: null,
    matchMethod: 'NONE',
    approved: false,
    diagnostics: [
      'PIPING_CLASS_EXACT_ROW_MISSING',
      `PIPING_CLASS_EXACT_KEY_${keyState.label}`,
    ].sort(compareAscii),
  });
}

function blockedAmbiguousField(binding, records, snapshot) {
  return createField({
    binding,
    value: null,
    status: 'BLOCKED_AMBIGUOUS',
    sourceKind: 'PIPING_CLASS',
    sourceKey: snapshot.sourceKey,
    sourceHash: snapshot.sourceHash,
    locator: records.map((record) => record.locator).sort(compareAscii).join('|'),
    matchMethod: 'EXACT_PIPING_CLASS_KEY_MULTIPLE_ROWS',
    approved: false,
    diagnostics: [
      'PIPING_CLASS_EXACT_ROW_AMBIGUOUS',
      `PIPING_CLASS_EXACT_ROW_COUNT_${records.length}`,
    ].sort(compareAscii),
  });
}

function createResultRecord(lineRecord, fields) {
  return createCommonEnrichedTargetRecord({
    schema: COMMON_ENRICHED_TARGET_RECORD_SCHEMA,
    targetId: lineRecord.targetId,
    targetKind: 'LINE',
    sourceModelHash: lineRecord.sourceModelHash,
    sourceRecordId: lineRecord.sourceRecordId,
    lineKey: lineRecord.lineKey,
    fields,
  });
}

function createField({
  binding,
  value,
  status,
  sourceKind,
  sourceKey,
  sourceHash,
  locator,
  matchMethod,
  approved,
  diagnostics,
}) {
  return requireCommonEnrichedField({
    schema: 'common-enriched-properties-field/v1',
    field: binding.targetField,
    value,
    unit: binding.unit,
    status,
    sourceKind,
    sourceKey,
    sourceHash,
    locator,
    matchMethod,
    confidence: status === 'RESOLVED_EXACT' ? 1 : 0,
    policyId: null,
    policyHash: null,
    reviewEventId: null,
    approved,
    diagnostics: [...new Set(diagnostics)].sort(compareAscii),
  });
}

function requireLineTargetRecords(records) {
  for (const record of records) {
    if (record.targetKind !== 'LINE' || record.lineKey === null
      || record.targetId !== `LINE:${encodeURIComponent(record.lineKey)}`
      || record.sourceRecordId !== record.targetId) {
      failCommonEnrichment(
        'piping-class resolution contains a non-line or inconsistent target record.',
        'COMMON_ENRICHED_TARGET_RELATIONSHIP_INVALID',
        { targetId: record.targetId },
      );
    }
  }
}

function requireSummary(value) {
  requireExactKeys(value, SUMMARY_KEYS, 'pipingClassResolution.summary');
  return deepFreeze({
    lineTargetCount: requireNonNegativeInteger(
      value.lineTargetCount,
      'pipingClassResolution.summary.lineTargetCount',
    ),
    exactKeyCount: requireNonNegativeInteger(
      value.exactKeyCount,
      'pipingClassResolution.summary.exactKeyCount',
    ),
    blockedKeyCount: requireNonNegativeInteger(
      value.blockedKeyCount,
      'pipingClassResolution.summary.blockedKeyCount',
    ),
    missingRowCount: requireNonNegativeInteger(
      value.missingRowCount,
      'pipingClassResolution.summary.missingRowCount',
    ),
    ambiguousRowCount: requireNonNegativeInteger(
      value.ambiguousRowCount,
      'pipingClassResolution.summary.ambiguousRowCount',
    ),
    exactFieldCount: requireNonNegativeInteger(
      value.exactFieldCount,
      'pipingClassResolution.summary.exactFieldCount',
    ),
    blockedFieldCount: requireNonNegativeInteger(
      value.blockedFieldCount,
      'pipingClassResolution.summary.blockedFieldCount',
    ),
    conflictFieldCount: requireNonNegativeInteger(
      value.conflictFieldCount,
      'pipingClassResolution.summary.conflictFieldCount',
    ),
  });
}

function buildSummary(targetRecords, classifications) {
  const statuses = targetRecords.flatMap((record) => record.fields.map((field) => field.status));
  return deepFreeze({
    lineTargetCount: targetRecords.length,
    exactKeyCount: classifications.filter((entry) => entry.key === 'EXACT').length,
    blockedKeyCount: classifications.filter((entry) => entry.key === 'BLOCKED').length,
    missingRowCount: classifications.filter((entry) => entry.row === 'MISSING').length,
    ambiguousRowCount: classifications.filter((entry) => entry.row === 'AMBIGUOUS').length,
    exactFieldCount: statuses.filter((status) => status === 'RESOLVED_EXACT').length,
    blockedFieldCount: statuses.filter((status) => status.startsWith('BLOCKED_')).length,
    conflictFieldCount: statuses.filter((status) => status === 'BLOCKED_CONFLICT').length,
  });
}

function buildSummaryFromRecords(targetRecords) {
  const statuses = targetRecords.flatMap((record) => record.fields.map((field) => field.status));
  const diagnosticsByRecord = targetRecords.map((record) => new Set(
    record.fields.flatMap((field) => field.diagnostics),
  ));
  const methodsByRecord = targetRecords.map((record) => new Set(
    record.fields.map((field) => field.matchMethod),
  ));
  return deepFreeze({
    lineTargetCount: targetRecords.length,
    exactKeyCount: targetRecords.filter((_record, index) => (
      methodsByRecord[index].has('EXACT_PIPING_CLASS_KEY_AND_FIELD')
      || methodsByRecord[index].has('EXACT_PIPING_CLASS_KEY_FIELD_MISSING')
      || methodsByRecord[index].has('EXACT_PIPING_CLASS_KEY_FIELD_TYPE_CONFLICT')
      || methodsByRecord[index].has('EXACT_PIPING_CLASS_KEY_MULTIPLE_ROWS')
      || diagnosticsByRecord[index].has('PIPING_CLASS_EXACT_ROW_MISSING')
    )).length,
    blockedKeyCount: diagnosticsByRecord.filter((diagnostics) => (
      diagnostics.has('PIPING_CLASS_KEY_BLOCKED')
    )).length,
    missingRowCount: diagnosticsByRecord.filter((diagnostics) => (
      diagnostics.has('PIPING_CLASS_EXACT_ROW_MISSING')
    )).length,
    ambiguousRowCount: methodsByRecord.filter((methods) => (
      methods.has('EXACT_PIPING_CLASS_KEY_MULTIPLE_ROWS')
    )).length,
    exactFieldCount: statuses.filter((status) => status === 'RESOLVED_EXACT').length,
    blockedFieldCount: statuses.filter((status) => status.startsWith('BLOCKED_')).length,
    conflictFieldCount: statuses.filter((status) => status === 'BLOCKED_CONFLICT').length,
  });
}

function keyBlockingStatus(status) {
  if (BLOCKING_PRECEDENCE.includes(status)) return status;
  if (status === 'PROPOSED_REVIEW' || status === 'RESOLVED_DERIVED') {
    return 'BLOCKED_CONFLICT';
  }
  return 'BLOCKED_MISSING';
}

function selectBlockingStatus(statuses) {
  return BLOCKING_PRECEDENCE.find((status) => statuses.includes(status)) || 'BLOCKED_MISSING';
}

function compositeKey(classValue, boreValue, scheduleValue) {
  return JSON.stringify([
    canonicalClassValue(classValue),
    canonicalBoreValue(boreValue),
    scheduleValue === null ? null : canonicalScheduleValue(scheduleValue),
  ]);
}

function compositeKeyLabel(classValue, boreValue, scheduleValue) {
  return [
    canonicalClassValue(classValue),
    canonicalBoreValue(boreValue),
    scheduleValue === null ? '-' : canonicalScheduleValue(scheduleValue),
  ].map((value) => encodeURIComponent(String(value))).join('|');
}

function canonicalClassValue(value) {
  return requireIdentity(String(value).trim().toUpperCase(), 'pipingClassKey.class');
}

function canonicalScheduleValue(value) {
  return requireIdentity(String(value).trim().toUpperCase(), 'pipingClassKey.schedule');
}

function canonicalBoreValue(value) {
  return Object.is(value, -0) ? 0 : value;
}

function matchesValueKind(value, valueKind) {
  if (valueKind === 'NUMBER') return typeof value === 'number' && Number.isFinite(value);
  if (valueKind === 'STRING') return typeof value === 'string';
  return typeof value === 'boolean';
}

function byField(field) {
  return (left, right) => compareAscii(left[field], right[field]);
}
