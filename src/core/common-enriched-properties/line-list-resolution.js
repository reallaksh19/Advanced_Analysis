import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { deepFreeze } from '../shared-piping-model/immutable.js';
import { failCommonEnrichment } from './errors.js';
import { requireCommonEnrichedField } from './field.js';
import {
  COMMON_ENRICHED_TARGET_RECORD_SCHEMA,
  createCommonEnrichedTargetRecord,
  requireCommonEnrichedTargetRecord,
} from './target-record.js';
import { requireCommonEnrichedTargetInventory } from './target-inventory.js';
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

export const COMMON_ENRICHED_LINE_LIST_RESOLUTION_SCHEMA =
  'common-enriched-line-list-resolution/v1';
export const COMMON_ENRICHED_LINE_LIST_FIELD_BINDING_SCHEMA =
  'common-enriched-line-list-field-binding/v1';

export const LINE_LIST_VALUE_KINDS = Object.freeze([
  'NUMBER',
  'STRING',
  'BOOLEAN',
]);

const RESOLUTION_KEYS = Object.freeze([
  'schema',
  'resolutionId',
  'inventorySemanticHash',
  'snapshotSemanticHash',
  'bindingsSemanticHash',
  'targetRecords',
  'summary',
  'semanticHash',
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
  'exactLineCount',
  'missingLineCount',
  'ambiguousLineCount',
  'exactFieldCount',
  'blockedFieldCount',
  'conflictFieldCount',
]);

export function lineListResolutionSemanticProjection(value) {
  return {
    schema: value.schema,
    resolutionId: value.resolutionId,
    inventorySemanticHash: value.inventorySemanticHash,
    snapshotSemanticHash: value.snapshotSemanticHash,
    bindingsSemanticHash: value.bindingsSemanticHash,
    targetRecords: value.targetRecords,
    summary: value.summary,
  };
}

export function computeLineListResolutionSemanticHash(value) {
  return semanticHash(lineListResolutionSemanticProjection(value));
}

export function createCommonEnrichedLineListResolution(input) {
  requireExactKeys(
    input,
    ['schema', 'resolutionId', 'inventory', 'snapshot', 'bindings'],
    'lineListResolutionDraft',
  );
  if (input.schema !== COMMON_ENRICHED_LINE_LIST_RESOLUTION_SCHEMA) {
    failCommonEnrichment(
      'lineListResolutionDraft.schema is unsupported.',
      'COMMON_ENRICHED_SCHEMA_INVALID',
    );
  }

  const inventory = requireCommonEnrichedTargetInventory(input.inventory);
  const snapshot = requireEngineeringMasterSnapshot(input.snapshot);
  if (snapshot.sourceKind !== 'LINE_LIST') {
    failCommonEnrichment(
      'line-list resolution requires a LINE_LIST snapshot.',
      'COMMON_ENRICHED_LINE_LIST_SOURCE_INVALID',
      { sourceKind: snapshot.sourceKind },
    );
  }
  const bindings = normalizeBindings(input.bindings);
  const sourceIndex = buildExactLineListIndex(snapshot.records);
  const lineClassifications = [];

  const targetRecords = inventory.lineTargets.map((lineTarget) => {
    const bucket = sourceIndex.get(lineTarget.lineKey) || [];
    lineClassifications.push(bucket.length === 0 ? 'MISSING' : bucket.length === 1 ? 'EXACT' : 'AMBIGUOUS');
    const fields = resolveLineFields(lineTarget.lineKey, bucket, snapshot, bindings);
    return createCommonEnrichedTargetRecord({
      schema: COMMON_ENRICHED_TARGET_RECORD_SCHEMA,
      targetId: lineTarget.targetId,
      targetKind: 'LINE',
      sourceModelHash: inventory.sourceModelHash,
      sourceRecordId: lineTarget.targetId,
      lineKey: lineTarget.lineKey,
      fields,
    });
  }).sort(byField('targetId'));

  const summary = buildSummary(targetRecords, lineClassifications);
  const draft = {
    schema: COMMON_ENRICHED_LINE_LIST_RESOLUTION_SCHEMA,
    resolutionId: requireIdentity(input.resolutionId, 'lineListResolution.resolutionId'),
    inventorySemanticHash: inventory.semanticHash,
    snapshotSemanticHash: snapshot.semanticHash,
    bindingsSemanticHash: semanticHash(bindings),
    targetRecords,
    summary,
    semanticHash: 'fnv1a64:0000000000000000',
  };
  return deepFreeze({
    ...draft,
    semanticHash: computeLineListResolutionSemanticHash(draft),
  });
}

export function requireCommonEnrichedLineListResolution(value) {
  requireExactKeys(value, RESOLUTION_KEYS, 'lineListResolution');
  if (value.schema !== COMMON_ENRICHED_LINE_LIST_RESOLUTION_SCHEMA) {
    failCommonEnrichment(
      'lineListResolution.schema is unsupported.',
      'COMMON_ENRICHED_SCHEMA_INVALID',
    );
  }
  const resolution = {
    schema: value.schema,
    resolutionId: requireIdentity(value.resolutionId, 'lineListResolution.resolutionId'),
    inventorySemanticHash: requireSemanticHash(
      value.inventorySemanticHash,
      'lineListResolution.inventorySemanticHash',
    ),
    snapshotSemanticHash: requireSemanticHash(
      value.snapshotSemanticHash,
      'lineListResolution.snapshotSemanticHash',
    ),
    bindingsSemanticHash: requireSemanticHash(
      value.bindingsSemanticHash,
      'lineListResolution.bindingsSemanticHash',
    ),
    targetRecords: requireUniqueSorted(
      value.targetRecords,
      'targetId',
      'lineListResolution.targetRecords',
    ).map(requireCommonEnrichedTargetRecord),
    summary: requireSummary(value.summary),
    semanticHash: requireSemanticHash(value.semanticHash, 'lineListResolution.semanticHash'),
  };
  requireLineTargetRecords(resolution.targetRecords);
  const expectedSummary = buildSummaryFromRecords(resolution.targetRecords);
  if (JSON.stringify(resolution.summary) !== JSON.stringify(expectedSummary)) {
    failCommonEnrichment(
      'lineListResolution.summary is stale.',
      'COMMON_ENRICHED_SUMMARY_MISMATCH',
      { expected: expectedSummary, actual: resolution.summary },
    );
  }
  const expectedHash = computeLineListResolutionSemanticHash(resolution);
  if (resolution.semanticHash !== expectedHash) {
    failCommonEnrichment(
      'lineListResolution.semanticHash is stale.',
      'COMMON_ENRICHED_HASH_MISMATCH',
      { expected: expectedHash, actual: resolution.semanticHash },
    );
  }
  return deepFreeze(resolution);
}

export function requireCommonEnrichedLineListFieldBinding(value) {
  requireExactKeys(value, BINDING_KEYS, 'lineListFieldBinding');
  if (value.schema !== COMMON_ENRICHED_LINE_LIST_FIELD_BINDING_SCHEMA) {
    failCommonEnrichment(
      'lineListFieldBinding.schema is unsupported.',
      'COMMON_ENRICHED_SCHEMA_INVALID',
    );
  }
  return deepFreeze({
    schema: value.schema,
    targetField: requireIdentity(value.targetField, 'lineListFieldBinding.targetField'),
    sourceField: requireIdentity(value.sourceField, 'lineListFieldBinding.sourceField'),
    unit: requireNullableUnit(value.unit, 'lineListFieldBinding.unit'),
    valueKind: requireMember(
      value.valueKind,
      LINE_LIST_VALUE_KINDS,
      'lineListFieldBinding.valueKind',
    ),
  });
}

function normalizeBindings(value) {
  const bindings = requireUniqueSorted(
    requireArray(value, 'lineListResolution.bindings'),
    'targetField',
    'lineListResolution.bindings',
  ).map(requireCommonEnrichedLineListFieldBinding);
  if (bindings.length === 0) {
    failCommonEnrichment(
      'line-list resolution requires at least one field binding.',
      'COMMON_ENRICHED_LINE_LIST_BINDINGS_REQUIRED',
    );
  }
  const sourceTargetPairs = bindings.map((binding) => `${binding.sourceField}|${binding.targetField}`);
  if (new Set(sourceTargetPairs).size !== sourceTargetPairs.length) {
    failCommonEnrichment(
      'line-list field bindings contain a duplicate source/target pair.',
      'COMMON_ENRICHED_DUPLICATE_IDENTITY',
    );
  }
  return Object.freeze(bindings);
}

function buildExactLineListIndex(records) {
  const index = new Map();
  records.forEach((record, recordIndex) => {
    const rawLineKey = record.values?.lineKey;
    if (typeof rawLineKey !== 'string' || !rawLineKey.trim()) {
      failCommonEnrichment(
        'LINE_LIST master records require a normalized values.lineKey string.',
        'COMMON_ENRICHED_LINE_LIST_RECORD_INVALID',
        { recordId: record.recordId, recordIndex },
      );
    }
    const lineKey = canonicalExactLineKey(rawLineKey);
    const bucket = index.get(lineKey) || [];
    bucket.push(record);
    index.set(lineKey, bucket);
  });
  for (const bucket of index.values()) bucket.sort(byField('recordId'));
  return index;
}

function resolveLineFields(lineKey, bucket, snapshot, bindings) {
  if (bucket.length === 0) {
    return bindings.map((binding) => blockedNoMatchField(binding));
  }
  if (bucket.length > 1) {
    return bindings.map((binding) => blockedAmbiguousField(binding, bucket, snapshot));
  }
  return bindings.map((binding) => exactOrBlockedField(
    lineKey,
    binding,
    bucket[0],
    snapshot,
  ));
}

function exactOrBlockedField(lineKey, binding, record, snapshot) {
  const value = record.values[binding.sourceField];
  const locator = `${record.locator}:${binding.sourceField}`;
  const diagnostics = record.values.lineKey === lineKey
    ? []
    : ['LINE_LIST_LINE_KEY_CANONICALIZED'];

  if (value === null || value === undefined || value === '') {
    return createField({
      binding,
      value: null,
      status: 'BLOCKED_MISSING',
      sourceKind: 'LINE_LIST',
      sourceKey: snapshot.sourceKey,
      sourceHash: snapshot.sourceHash,
      locator,
      matchMethod: 'EXACT_LINE_KEY_FIELD_MISSING',
      approved: false,
      diagnostics: [...diagnostics, 'LINE_LIST_FIELD_MISSING'],
    });
  }
  if (!matchesValueKind(value, binding.valueKind)) {
    return createField({
      binding,
      value: null,
      status: 'BLOCKED_CONFLICT',
      sourceKind: 'LINE_LIST',
      sourceKey: snapshot.sourceKey,
      sourceHash: snapshot.sourceHash,
      locator,
      matchMethod: 'EXACT_LINE_KEY_FIELD_TYPE_CONFLICT',
      approved: false,
      diagnostics: [...diagnostics, 'LINE_LIST_FIELD_TYPE_CONFLICT'],
    });
  }
  return createField({
    binding,
    value,
    status: 'RESOLVED_EXACT',
    sourceKind: 'LINE_LIST',
    sourceKey: snapshot.sourceKey,
    sourceHash: snapshot.sourceHash,
    locator,
    matchMethod: 'EXACT_LINE_KEY_AND_FIELD',
    approved: true,
    diagnostics,
  });
}

function blockedNoMatchField(binding) {
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
    diagnostics: ['LINE_LIST_EXACT_ROW_MISSING'],
  });
}

function blockedAmbiguousField(binding, records, snapshot) {
  return createField({
    binding,
    value: null,
    status: 'BLOCKED_AMBIGUOUS',
    sourceKind: 'LINE_LIST',
    sourceKey: snapshot.sourceKey,
    sourceHash: snapshot.sourceHash,
    locator: records.map((record) => record.locator).sort(compareAscii).join('|'),
    matchMethod: 'EXACT_LINE_KEY_MULTIPLE_ROWS',
    approved: false,
    diagnostics: [
      'LINE_LIST_EXACT_ROW_AMBIGUOUS',
      `LINE_LIST_EXACT_ROW_COUNT_${records.length}`,
    ].sort(compareAscii),
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

function matchesValueKind(value, valueKind) {
  if (valueKind === 'NUMBER') return typeof value === 'number' && Number.isFinite(value);
  if (valueKind === 'STRING') return typeof value === 'string';
  return typeof value === 'boolean';
}

function requireLineTargetRecords(records) {
  for (const record of records) {
    if (record.targetKind !== 'LINE' || record.lineKey === null
      || record.targetId !== `LINE:${encodeURIComponent(record.lineKey)}`
      || record.sourceRecordId !== record.targetId) {
      failCommonEnrichment(
        'line-list resolution contains a non-line or inconsistent target record.',
        'COMMON_ENRICHED_TARGET_RELATIONSHIP_INVALID',
        { targetId: record.targetId },
      );
    }
  }
}

function requireSummary(value) {
  requireExactKeys(value, SUMMARY_KEYS, 'lineListResolution.summary');
  return deepFreeze({
    lineTargetCount: requireNonNegativeInteger(
      value.lineTargetCount,
      'lineListResolution.summary.lineTargetCount',
    ),
    exactLineCount: requireNonNegativeInteger(
      value.exactLineCount,
      'lineListResolution.summary.exactLineCount',
    ),
    missingLineCount: requireNonNegativeInteger(
      value.missingLineCount,
      'lineListResolution.summary.missingLineCount',
    ),
    ambiguousLineCount: requireNonNegativeInteger(
      value.ambiguousLineCount,
      'lineListResolution.summary.ambiguousLineCount',
    ),
    exactFieldCount: requireNonNegativeInteger(
      value.exactFieldCount,
      'lineListResolution.summary.exactFieldCount',
    ),
    blockedFieldCount: requireNonNegativeInteger(
      value.blockedFieldCount,
      'lineListResolution.summary.blockedFieldCount',
    ),
    conflictFieldCount: requireNonNegativeInteger(
      value.conflictFieldCount,
      'lineListResolution.summary.conflictFieldCount',
    ),
  });
}

function buildSummary(targetRecords, lineClassifications) {
  const statuses = targetRecords.flatMap((record) => record.fields.map((field) => field.status));
  return deepFreeze({
    lineTargetCount: targetRecords.length,
    exactLineCount: lineClassifications.filter((status) => status === 'EXACT').length,
    missingLineCount: lineClassifications.filter((status) => status === 'MISSING').length,
    ambiguousLineCount: lineClassifications.filter((status) => status === 'AMBIGUOUS').length,
    exactFieldCount: statuses.filter((status) => status === 'RESOLVED_EXACT').length,
    blockedFieldCount: statuses.filter((status) => status.startsWith('BLOCKED_')).length,
    conflictFieldCount: statuses.filter((status) => status === 'BLOCKED_CONFLICT').length,
  });
}

function buildSummaryFromRecords(targetRecords) {
  const statuses = targetRecords.flatMap((record) => record.fields.map((field) => field.status));
  const sourceMethods = targetRecords.map((record) => new Set(record.fields.map((field) => field.matchMethod)));
  return deepFreeze({
    lineTargetCount: targetRecords.length,
    exactLineCount: sourceMethods.filter((methods) => methods.has('EXACT_LINE_KEY_AND_FIELD')
      || methods.has('EXACT_LINE_KEY_FIELD_MISSING')
      || methods.has('EXACT_LINE_KEY_FIELD_TYPE_CONFLICT')).length,
    missingLineCount: sourceMethods.filter((methods) => methods.size === 1 && methods.has('NONE')).length,
    ambiguousLineCount: sourceMethods.filter((methods) => methods.size === 1
      && methods.has('EXACT_LINE_KEY_MULTIPLE_ROWS')).length,
    exactFieldCount: statuses.filter((status) => status === 'RESOLVED_EXACT').length,
    blockedFieldCount: statuses.filter((status) => status.startsWith('BLOCKED_')).length,
    conflictFieldCount: statuses.filter((status) => status === 'BLOCKED_CONFLICT').length,
  });
}

function canonicalExactLineKey(value) {
  return requireIdentity(value.trim().toUpperCase(), 'lineListRecord.values.lineKey');
}

function byField(field) {
  return (left, right) => compareAscii(left[field], right[field]);
}
