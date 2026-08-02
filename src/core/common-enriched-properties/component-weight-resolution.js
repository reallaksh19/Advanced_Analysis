import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { deepFreeze, isPlainRecord } from '../shared-piping-model/immutable.js';
import { failCommonEnrichment } from './errors.js';
import { requireCommonEnrichedField } from './field.js';
import { requireCommonEnrichedLineListResolution } from './line-list-resolution.js';
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
  requireOptionalIdentity,
  requireSemanticHash,
  requireUniqueSorted,
} from './validation.js';

export const COMMON_ENRICHED_COMPONENT_WEIGHT_RESOLUTION_SCHEMA =
  'common-enriched-component-weight-resolution/v1';
export const COMMON_ENRICHED_COMPONENT_WEIGHT_KEY_CONFIG_SCHEMA =
  'common-enriched-component-weight-key-config/v1';
export const COMPONENT_WEIGHT_SELECTOR_KINDS = Object.freeze([
  'ENTITY',
  'CATALOG_KEY',
  'COMPONENT_TYPE_BORE',
]);

const RESOLUTION_KEYS = Object.freeze([
  'schema',
  'resolutionId',
  'inventorySemanticHash',
  'sourceModelHash',
  'lineListResolutionSemanticHash',
  'snapshotSemanticHash',
  'keyConfigSemanticHash',
  'sourceWeightField',
  'targetRecords',
  'summary',
  'semanticHash',
]);
const KEY_CONFIG_KEYS = Object.freeze([
  'schema',
  'selectorKind',
  'targetCatalogKeyProperty',
  'targetBoreField',
  'sourceEntityIdField',
  'sourceCatalogKeyField',
  'sourceComponentTypeField',
  'sourceBoreField',
]);
const SUMMARY_KEYS = Object.freeze([
  'componentTargetCount',
  'exactKeyCount',
  'blockedKeyCount',
  'missingRowCount',
  'ambiguousRowCount',
  'exactWeightCount',
  'blockedWeightCount',
  'conflictWeightCount',
]);
const BLOCKING_PRECEDENCE = Object.freeze([
  'BLOCKED_STALE_SOURCE',
  'BLOCKED_CONFLICT',
  'BLOCKED_AMBIGUOUS',
  'BLOCKED_MISSING',
]);

export function componentWeightResolutionSemanticProjection(value) {
  return Object.fromEntries(RESOLUTION_KEYS
    .filter((key) => key !== 'semanticHash')
    .map((key) => [key, value[key]]));
}

export function computeComponentWeightResolutionSemanticHash(value) {
  return semanticHash(componentWeightResolutionSemanticProjection(value));
}

export function createCommonEnrichedComponentWeightResolution(input) {
  requireExactKeys(
    input,
    [
      'schema',
      'resolutionId',
      'inventory',
      'sharedModel',
      'lineListResolution',
      'snapshot',
      'keyConfig',
      'sourceWeightField',
    ],
    'componentWeightResolutionDraft',
  );
  if (input.schema !== COMMON_ENRICHED_COMPONENT_WEIGHT_RESOLUTION_SCHEMA) {
    schemaError('componentWeightResolutionDraft');
  }

  const inventory = requireCommonEnrichedTargetInventory(input.inventory);
  const sharedModel = requireCurrentSharedModel(input.sharedModel, inventory.sourceModelHash);
  const lineListResolution = requireCommonEnrichedLineListResolution(input.lineListResolution);
  requireLineResolutionCompatibility(inventory, lineListResolution);
  const snapshot = requireEngineeringMasterSnapshot(input.snapshot);
  if (snapshot.sourceKind !== 'COMPONENT_WEIGHT_MASTER') {
    failCommonEnrichment(
      'component-weight resolution requires a COMPONENT_WEIGHT_MASTER snapshot.',
      'COMMON_ENRICHED_COMPONENT_WEIGHT_SOURCE_INVALID',
      { sourceKind: snapshot.sourceKind },
    );
  }
  const keyConfig = requireCommonEnrichedComponentWeightKeyConfig(input.keyConfig);
  const sourceWeightField = requireIdentity(
    input.sourceWeightField,
    'componentWeightResolution.sourceWeightField',
  );
  const sourceComponents = buildSourceComponentIndex(sharedModel.components);
  const lineRecords = new Map(
    lineListResolution.targetRecords.map((record) => [record.targetId, record]),
  );
  const sourceIndex = buildExactWeightIndex(snapshot.records, keyConfig);
  const classifications = [];

  const targetRecords = inventory.componentTargets.map((componentTarget) => {
    const sourceComponent = sourceComponents.get(componentTarget.sourceRecordId);
    if (!sourceComponent
      || sourceComponent.sourceEntityId !== componentTarget.sourceEntityId
      || sourceComponent.componentType !== componentTarget.componentType) {
      failCommonEnrichment(
        'component target differs from the bound shared model.',
        'COMMON_ENRICHED_TARGET_RELATIONSHIP_INVALID',
        { targetId: componentTarget.targetId },
      );
    }
    const key = resolveTargetSelector(
      componentTarget,
      sourceComponent,
      lineRecords,
      keyConfig,
    );
    if (key.status !== 'EXACT') {
      classifications.push({ key: 'BLOCKED', row: 'NOT_QUERIED' });
      return resultRecord(componentTarget, blockedByKey(key), inventory.sourceModelHash);
    }

    const bucket = sourceIndex.get(key.key) || [];
    const row = bucket.length === 0 ? 'MISSING' : bucket.length === 1 ? 'EXACT' : 'AMBIGUOUS';
    classifications.push({ key: 'EXACT', row });
    return resultRecord(
      componentTarget,
      resolveWeightField(key, bucket, snapshot, sourceWeightField),
      inventory.sourceModelHash,
    );
  }).sort(by('targetId'));

  const draft = {
    schema: COMMON_ENRICHED_COMPONENT_WEIGHT_RESOLUTION_SCHEMA,
    resolutionId: requireIdentity(input.resolutionId, 'componentWeightResolution.resolutionId'),
    inventorySemanticHash: inventory.semanticHash,
    sourceModelHash: sharedModel.semanticHash,
    lineListResolutionSemanticHash: lineListResolution.semanticHash,
    snapshotSemanticHash: snapshot.semanticHash,
    keyConfigSemanticHash: semanticHash(keyConfig),
    sourceWeightField,
    targetRecords,
    summary: summarize(targetRecords, classifications),
    semanticHash: 'fnv1a64:0000000000000000',
  };
  return deepFreeze({
    ...draft,
    semanticHash: computeComponentWeightResolutionSemanticHash(draft),
  });
}

export function requireCommonEnrichedComponentWeightResolution(value) {
  requireExactKeys(value, RESOLUTION_KEYS, 'componentWeightResolution');
  if (value.schema !== COMMON_ENRICHED_COMPONENT_WEIGHT_RESOLUTION_SCHEMA) {
    schemaError('componentWeightResolution');
  }
  const result = {
    schema: value.schema,
    resolutionId: requireIdentity(value.resolutionId, 'componentWeightResolution.resolutionId'),
    inventorySemanticHash: hash(value.inventorySemanticHash, 'inventorySemanticHash'),
    sourceModelHash: hash(value.sourceModelHash, 'sourceModelHash'),
    lineListResolutionSemanticHash: hash(
      value.lineListResolutionSemanticHash,
      'lineListResolutionSemanticHash',
    ),
    snapshotSemanticHash: hash(value.snapshotSemanticHash, 'snapshotSemanticHash'),
    keyConfigSemanticHash: hash(value.keyConfigSemanticHash, 'keyConfigSemanticHash'),
    sourceWeightField: requireIdentity(
      value.sourceWeightField,
      'componentWeightResolution.sourceWeightField',
    ),
    targetRecords: requireUniqueSorted(
      value.targetRecords,
      'targetId',
      'componentWeightResolution.targetRecords',
    ).map(requireCommonEnrichedTargetRecord),
    summary: normalizeSummary(value.summary),
    semanticHash: hash(value.semanticHash, 'semanticHash'),
  };
  requireComponentRecords(result.targetRecords);
  const expectedSummary = summarizeFromRecords(result.targetRecords);
  if (JSON.stringify(result.summary) !== JSON.stringify(expectedSummary)) {
    failCommonEnrichment(
      'componentWeightResolution.summary is stale.',
      'COMMON_ENRICHED_SUMMARY_MISMATCH',
      { expected: expectedSummary, actual: result.summary },
    );
  }
  const expectedHash = computeComponentWeightResolutionSemanticHash(result);
  if (result.semanticHash !== expectedHash) {
    failCommonEnrichment(
      'componentWeightResolution.semanticHash is stale.',
      'COMMON_ENRICHED_HASH_MISMATCH',
      { expected: expectedHash, actual: result.semanticHash },
    );
  }
  return deepFreeze(result);
}

export function requireCommonEnrichedComponentWeightKeyConfig(value) {
  requireExactKeys(value, KEY_CONFIG_KEYS, 'componentWeightKeyConfig');
  if (value.schema !== COMMON_ENRICHED_COMPONENT_WEIGHT_KEY_CONFIG_SCHEMA) {
    schemaError('componentWeightKeyConfig');
  }
  const config = {
    schema: value.schema,
    selectorKind: requireMember(
      value.selectorKind,
      COMPONENT_WEIGHT_SELECTOR_KINDS,
      'componentWeightKeyConfig.selectorKind',
    ),
    targetCatalogKeyProperty: requireOptionalIdentity(
      value.targetCatalogKeyProperty,
      'componentWeightKeyConfig.targetCatalogKeyProperty',
    ),
    targetBoreField: requireOptionalIdentity(
      value.targetBoreField,
      'componentWeightKeyConfig.targetBoreField',
    ),
    sourceEntityIdField: requireOptionalIdentity(
      value.sourceEntityIdField,
      'componentWeightKeyConfig.sourceEntityIdField',
    ),
    sourceCatalogKeyField: requireOptionalIdentity(
      value.sourceCatalogKeyField,
      'componentWeightKeyConfig.sourceCatalogKeyField',
    ),
    sourceComponentTypeField: requireOptionalIdentity(
      value.sourceComponentTypeField,
      'componentWeightKeyConfig.sourceComponentTypeField',
    ),
    sourceBoreField: requireOptionalIdentity(
      value.sourceBoreField,
      'componentWeightKeyConfig.sourceBoreField',
    ),
  };
  requireSelectorConfiguration(config);
  return deepFreeze(config);
}

function requireSelectorConfiguration(config) {
  const active = {
    ENTITY: ['sourceEntityIdField'],
    CATALOG_KEY: ['targetCatalogKeyProperty', 'sourceCatalogKeyField'],
    COMPONENT_TYPE_BORE: [
      'targetBoreField',
      'sourceComponentTypeField',
      'sourceBoreField',
    ],
  }[config.selectorKind];
  const optionalKeys = KEY_CONFIG_KEYS.filter((key) => !['schema', 'selectorKind'].includes(key));
  for (const key of optionalKeys) {
    const shouldExist = active.includes(key);
    if (shouldExist !== (config[key] !== null)) {
      failCommonEnrichment(
        `componentWeightKeyConfig.${key} is invalid for ${config.selectorKind}.`,
        'COMMON_ENRICHED_COMPONENT_WEIGHT_KEY_CONFIG_INVALID',
      );
    }
  }
}

function buildSourceComponentIndex(components) {
  const rows = requireArray(components, 'sharedModel.components').map((component, index) => {
    if (!isPlainRecord(component)) {
      failCommonEnrichment(
        `sharedModel.components[${index}] must be a record.`,
        'COMMON_ENRICHED_RECORD_REQUIRED',
      );
    }
    return {
      componentKey: requireIdentity(
        component.componentKey,
        `sharedModel.components[${index}].componentKey`,
      ),
      sourceEntityId: optionalText(component.sourceEntityId),
      componentType: requireIdentity(
        String(component.type || 'OBJECT').trim(),
        `sharedModel.components[${index}].type`,
      ),
      engineeringProperties: isPlainRecord(component.engineeringProperties)
        ? component.engineeringProperties
        : {},
    };
  }).sort(by('componentKey'));
  if (new Set(rows.map((row) => row.componentKey)).size !== rows.length) {
    failCommonEnrichment(
      'sharedModel.components contains duplicate componentKey.',
      'COMMON_ENRICHED_DUPLICATE_IDENTITY',
    );
  }
  return new Map(rows.map((row) => [row.componentKey, row]));
}

function buildExactWeightIndex(records, config) {
  const index = new Map();
  requireArray(records, 'componentWeightSnapshot.records').forEach((record, recordIndex) => {
    const selector = sourceSelector(record, config, recordIndex);
    const bucket = index.get(selector.key) || [];
    bucket.push(record);
    index.set(selector.key, bucket);
  });
  for (const bucket of index.values()) bucket.sort(by('recordId'));
  return index;
}

function sourceSelector(record, config, recordIndex) {
  const values = record.values || {};
  if (config.selectorKind === 'ENTITY') {
    const entityId = requireSourceString(
      values[config.sourceEntityIdField],
      record,
      recordIndex,
      config.sourceEntityIdField,
    );
    return selector('ENTITY', { entityId });
  }
  if (config.selectorKind === 'CATALOG_KEY') {
    const catalogKey = requireSourceString(
      values[config.sourceCatalogKeyField],
      record,
      recordIndex,
      config.sourceCatalogKeyField,
    );
    return selector('CATALOG_KEY', { catalogKey });
  }
  const componentType = requireSourceString(
    values[config.sourceComponentTypeField],
    record,
    recordIndex,
    config.sourceComponentTypeField,
  );
  const boreMm = values[config.sourceBoreField];
  if (typeof boreMm !== 'number' || !Number.isFinite(boreMm)) {
    invalidMasterKey(record, recordIndex, config.sourceBoreField);
  }
  return selector('COMPONENT_TYPE_BORE', { componentType, boreMm: normalizeNumber(boreMm) });
}

function resolveTargetSelector(componentTarget, component, lineRecords, config) {
  if (config.selectorKind === 'ENTITY') {
    if (component.sourceEntityId === null) {
      return blockedSelector(
        'BLOCKED_MISSING',
        'COMPONENT_WEIGHT_ENTITY_ID_MISSING',
      );
    }
    return selector('ENTITY', { entityId: component.sourceEntityId });
  }
  if (config.selectorKind === 'CATALOG_KEY') {
    const raw = component.engineeringProperties[config.targetCatalogKeyProperty];
    if (typeof raw !== 'string' || !raw.trim()) {
      return blockedSelector(
        'BLOCKED_MISSING',
        `COMPONENT_WEIGHT_CATALOG_KEY_MISSING_${config.targetCatalogKeyProperty}`,
      );
    }
    return selector('CATALOG_KEY', { catalogKey: raw });
  }

  if (componentTarget.lineTargetId === null) {
    return blockedSelector('BLOCKED_MISSING', 'COMPONENT_WEIGHT_LINE_IDENTITY_MISSING');
  }
  const lineRecord = lineRecords.get(componentTarget.lineTargetId);
  if (!lineRecord) {
    return blockedSelector('BLOCKED_MISSING', 'COMPONENT_WEIGHT_LINE_RECORD_MISSING');
  }
  const boreField = lineRecord.fields.find((field) => field.field === config.targetBoreField);
  if (!boreField) {
    return blockedSelector(
      'BLOCKED_MISSING',
      `COMPONENT_WEIGHT_BORE_FIELD_MISSING_${config.targetBoreField}`,
    );
  }
  if (boreField.status !== 'RESOLVED_EXACT') {
    return blockedSelector(
      keyBlockingStatus(boreField.status),
      `COMPONENT_WEIGHT_BORE_NOT_EXACT_${config.targetBoreField}_${boreField.status}`,
    );
  }
  if (!boreField.approved || typeof boreField.value !== 'number' || !Number.isFinite(boreField.value)) {
    return blockedSelector(
      'BLOCKED_CONFLICT',
      `COMPONENT_WEIGHT_BORE_INVALID_${config.targetBoreField}`,
    );
  }
  return selector('COMPONENT_TYPE_BORE', {
    componentType: component.componentType,
    boreMm: normalizeNumber(boreField.value),
  });
}

function selector(kind, parts) {
  const normalizedParts = {};
  Object.keys(parts).sort(compareAscii).forEach((key) => {
    const value = parts[key];
    normalizedParts[key] = typeof value === 'number'
      ? normalizeNumber(value)
      : requireIdentity(String(value).trim().toUpperCase(), `componentWeightSelector.${key}`);
  });
  return deepFreeze({
    status: 'EXACT',
    kind,
    parts: deepFreeze(normalizedParts),
    key: JSON.stringify([kind, normalizedParts]),
    label: encodeURIComponent(JSON.stringify(normalizedParts)),
    diagnostics: Object.freeze([]),
  });
}

function blockedSelector(status, diagnostic) {
  return deepFreeze({
    status,
    diagnostics: Object.freeze(['COMPONENT_WEIGHT_KEY_BLOCKED', diagnostic].sort(compareAscii)),
  });
}

function resolveWeightField(key, bucket, snapshot, sourceWeightField) {
  if (bucket.length === 0) {
    return createWeightField({
      value: null,
      status: 'BLOCKED_MISSING',
      evidence: noEvidence(),
      matchMethod: 'NONE',
      approved: false,
      diagnostics: [
        'COMPONENT_WEIGHT_EXACT_ROW_MISSING',
        `COMPONENT_WEIGHT_EXACT_KEY_${key.label}`,
      ],
    });
  }
  if (bucket.length > 1) {
    return createWeightField({
      value: null,
      status: 'BLOCKED_AMBIGUOUS',
      evidence: {
        sourceKind: 'COMPONENT_WEIGHT_MASTER',
        sourceKey: snapshot.sourceKey,
        sourceHash: snapshot.sourceHash,
        locator: bucket.map((record) => record.locator).sort(compareAscii).join('|'),
      },
      matchMethod: 'EXACT_COMPONENT_WEIGHT_SELECTOR_MULTIPLE_ROWS',
      approved: false,
      diagnostics: [
        'COMPONENT_WEIGHT_EXACT_ROW_AMBIGUOUS',
        `COMPONENT_WEIGHT_EXACT_ROW_COUNT_${bucket.length}`,
      ],
    });
  }

  const record = bucket[0];
  const value = record.values[sourceWeightField];
  const evidence = {
    sourceKind: 'COMPONENT_WEIGHT_MASTER',
    sourceKey: snapshot.sourceKey,
    sourceHash: snapshot.sourceHash,
    locator: `${record.locator}:${sourceWeightField}`,
  };
  if (value === null || value === undefined || value === '') {
    return createWeightField({
      value: null,
      status: 'BLOCKED_MISSING',
      evidence,
      matchMethod: 'EXACT_COMPONENT_WEIGHT_SELECTOR_FIELD_MISSING',
      approved: false,
      diagnostics: ['COMPONENT_WEIGHT_FIELD_MISSING'],
    });
  }
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return createWeightField({
      value: null,
      status: 'BLOCKED_CONFLICT',
      evidence,
      matchMethod: 'EXACT_COMPONENT_WEIGHT_SELECTOR_FIELD_CONFLICT',
      approved: false,
      diagnostics: ['COMPONENT_WEIGHT_FIELD_INVALID'],
    });
  }
  return createWeightField({
    value,
    status: 'RESOLVED_EXACT',
    evidence,
    matchMethod: 'EXACT_COMPONENT_WEIGHT_SELECTOR_AND_FIELD',
    approved: true,
    diagnostics: [],
  });
}

function blockedByKey(key) {
  return createWeightField({
    value: null,
    status: key.status,
    evidence: noEvidence(),
    matchMethod: 'NONE',
    approved: false,
    diagnostics: key.diagnostics,
  });
}

function createWeightField({ value, status, evidence, matchMethod, approved, diagnostics }) {
  return requireCommonEnrichedField({
    schema: 'common-enriched-properties-field/v1',
    field: 'component.weightKg',
    value,
    unit: 'kg',
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

function resultRecord(componentTarget, weightField, sourceModelHash) {
  return createCommonEnrichedTargetRecord({
    schema: COMMON_ENRICHED_TARGET_RECORD_SCHEMA,
    targetId: componentTarget.targetId,
    targetKind: 'COMPONENT',
    sourceModelHash,
    sourceRecordId: componentTarget.sourceRecordId,
    lineKey: componentTarget.lineKey,
    fields: [weightField],
  });
}

function summarize(records, classifications) {
  const statuses = records.map((record) => record.fields[0].status);
  return deepFreeze({
    componentTargetCount: records.length,
    exactKeyCount: classifications.filter(({ key }) => key === 'EXACT').length,
    blockedKeyCount: classifications.filter(({ key }) => key === 'BLOCKED').length,
    missingRowCount: classifications.filter(({ row }) => row === 'MISSING').length,
    ambiguousRowCount: classifications.filter(({ row }) => row === 'AMBIGUOUS').length,
    exactWeightCount: statuses.filter((status) => status === 'RESOLVED_EXACT').length,
    blockedWeightCount: statuses.filter((status) => status.startsWith('BLOCKED_')).length,
    conflictWeightCount: statuses.filter((status) => status === 'BLOCKED_CONFLICT').length,
  });
}

function summarizeFromRecords(records) {
  const fields = records.map((record) => record.fields[0]);
  return deepFreeze({
    componentTargetCount: records.length,
    exactKeyCount: fields.filter((field) =>
      field.matchMethod.startsWith('EXACT_COMPONENT_WEIGHT_SELECTOR')
      || field.diagnostics.includes('COMPONENT_WEIGHT_EXACT_ROW_MISSING')).length,
    blockedKeyCount: fields.filter((field) =>
      field.diagnostics.includes('COMPONENT_WEIGHT_KEY_BLOCKED')).length,
    missingRowCount: fields.filter((field) =>
      field.diagnostics.includes('COMPONENT_WEIGHT_EXACT_ROW_MISSING')).length,
    ambiguousRowCount: fields.filter((field) =>
      field.matchMethod === 'EXACT_COMPONENT_WEIGHT_SELECTOR_MULTIPLE_ROWS').length,
    exactWeightCount: fields.filter((field) => field.status === 'RESOLVED_EXACT').length,
    blockedWeightCount: fields.filter((field) => field.status.startsWith('BLOCKED_')).length,
    conflictWeightCount: fields.filter((field) => field.status === 'BLOCKED_CONFLICT').length,
  });
}

function normalizeSummary(value) {
  requireExactKeys(value, SUMMARY_KEYS, 'componentWeightResolution.summary');
  return deepFreeze(Object.fromEntries(SUMMARY_KEYS.map((key) => [
    key,
    requireNonNegativeInteger(value[key], `componentWeightResolution.summary.${key}`),
  ])));
}

function requireComponentRecords(records) {
  for (const record of records) {
    if (record.targetKind !== 'COMPONENT'
      || record.targetId !== `COMPONENT:${encodeURIComponent(record.sourceRecordId)}`
      || record.fields.length !== 1
      || record.fields[0].field !== 'component.weightKg') {
      failCommonEnrichment(
        'component-weight resolution contains an inconsistent component target.',
        'COMMON_ENRICHED_TARGET_RELATIONSHIP_INVALID',
        { targetId: record.targetId },
      );
    }
  }
}

function requireLineResolutionCompatibility(inventory, resolution) {
  if (resolution.targetRecords.some((record) => record.sourceModelHash !== inventory.sourceModelHash)) {
    failCommonEnrichment(
      'line-list resolution source model differs from target inventory.',
      'COMMON_ENRICHED_SOURCE_MODEL_STALE',
    );
  }
}

function requireCurrentSharedModel(value, expectedHash) {
  if (!isPlainRecord(value) || value.schema !== 'shared-piping-model/v1') {
    failCommonEnrichment(
      'A shared-piping-model/v1 source is required.',
      'COMMON_ENRICHED_SOURCE_MODEL_INVALID',
    );
  }
  requireSemanticHash(value.semanticHash, 'sharedModel.semanticHash');
  const { semanticHash: _semanticHash, ...projection } = value;
  const actualHash = semanticHash(projection);
  if (value.semanticHash !== actualHash || value.semanticHash !== expectedHash) {
    failCommonEnrichment(
      'sharedModel.semanticHash is stale or differs from the target inventory.',
      'COMMON_ENRICHED_SOURCE_MODEL_STALE',
      { expected: expectedHash, actual: value.semanticHash },
    );
  }
  requireArray(value.components, 'sharedModel.components');
  return value;
}

function requireSourceString(value, record, recordIndex, fieldName) {
  if (typeof value !== 'string' || !value.trim()) {
    invalidMasterKey(record, recordIndex, fieldName);
  }
  return value;
}

function invalidMasterKey(record, recordIndex, fieldName) {
  failCommonEnrichment(
    'COMPONENT_WEIGHT_MASTER record has an invalid exact selector.',
    'COMMON_ENRICHED_COMPONENT_WEIGHT_RECORD_INVALID',
    { recordId: record.recordId, recordIndex, fieldName },
  );
}

function keyBlockingStatus(status) {
  if (BLOCKING_PRECEDENCE.includes(status)) return status;
  return status === 'PROPOSED_REVIEW' || status === 'RESOLVED_DERIVED'
    ? 'BLOCKED_CONFLICT'
    : 'BLOCKED_MISSING';
}

function hash(value, fieldName) {
  return requireSemanticHash(value, `componentWeightResolution.${fieldName}`);
}

function noEvidence() {
  return { sourceKind: 'NONE', sourceKey: null, sourceHash: null, locator: null };
}

function optionalText(value) {
  if (value === null || value === undefined || value === '') return null;
  const text = String(value).trim();
  return text || null;
}

function normalizeNumber(value) {
  return Object.is(value, -0) ? 0 : value;
}

function schemaError(fieldName) {
  failCommonEnrichment(`${fieldName}.schema is unsupported.`, 'COMMON_ENRICHED_SCHEMA_INVALID');
}

function by(name) {
  return (left, right) => compareAscii(left[name], right[name]);
}
