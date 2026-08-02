import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { deepFreeze, isPlainRecord } from '../shared-piping-model/immutable.js';
import { failCommonEnrichment } from './errors.js';
import {
  compareAscii,
  requireArray,
  requireExactKeys,
  requireIdentity,
  requireMember,
  requireNonNegativeInteger,
  requireOptionalIdentity,
  requireSemanticHash,
  requireStringArray,
  requireUniqueSorted,
} from './validation.js';

export const COMMON_ENRICHED_TARGET_INVENTORY_SCHEMA = 'common-enriched-target-inventory/v1';
export const COMMON_ENRICHED_LINE_TARGET_SCHEMA = 'common-enriched-line-target/v1';
export const COMMON_ENRICHED_COMPONENT_TARGET_SCHEMA = 'common-enriched-component-target/v1';
export const TARGET_IDENTITY_STATUSES = Object.freeze(['RESOLVED_EXACT', 'BLOCKED_MISSING']);

const INVENTORY_KEYS = Object.freeze([
  'schema',
  'inventoryId',
  'sourceModelHash',
  'lineTargets',
  'componentTargets',
  'summary',
  'semanticHash',
]);
const LINE_TARGET_KEYS = Object.freeze([
  'schema',
  'targetId',
  'lineKey',
  'sourceRecordIds',
  'componentTargetIds',
  'branchIds',
  'status',
  'diagnostics',
]);
const COMPONENT_TARGET_KEYS = Object.freeze([
  'schema',
  'targetId',
  'sourceRecordId',
  'sourceEntityId',
  'componentType',
  'rawLineId',
  'lineKey',
  'lineTargetId',
  'branchId',
  'status',
  'diagnostics',
]);
const SUMMARY_KEYS = Object.freeze([
  'lineTargetCount',
  'componentTargetCount',
  'exactComponentCount',
  'blockedMissingComponentCount',
  'multiComponentLineCount',
]);

export function targetInventorySemanticProjection(value) {
  return {
    schema: value.schema,
    inventoryId: value.inventoryId,
    sourceModelHash: value.sourceModelHash,
    lineTargets: value.lineTargets,
    componentTargets: value.componentTargets,
    summary: value.summary,
  };
}

export function computeTargetInventorySemanticHash(value) {
  return semanticHash(targetInventorySemanticProjection(value));
}

export function createCommonEnrichedTargetInventory(input) {
  requireExactKeys(input, ['schema', 'inventoryId', 'sharedModel'], 'targetInventoryDraft');
  if (input.schema !== COMMON_ENRICHED_TARGET_INVENTORY_SCHEMA) {
    failCommonEnrichment('targetInventoryDraft.schema is unsupported.', 'COMMON_ENRICHED_SCHEMA_INVALID');
  }
  const sharedModel = requireCurrentSharedModel(input.sharedModel);
  const sourceComponents = normalizeSourceComponents(sharedModel.components);
  const lineBuckets = new Map();

  const componentTargets = sourceComponents.map((component) => {
    const targetId = componentTargetId(component.sourceRecordId);
    if (component.rawLineId === null) {
      return deepFreeze({
        schema: COMMON_ENRICHED_COMPONENT_TARGET_SCHEMA,
        targetId,
        sourceRecordId: component.sourceRecordId,
        sourceEntityId: component.sourceEntityId,
        componentType: component.componentType,
        rawLineId: null,
        lineKey: null,
        lineTargetId: null,
        branchId: component.branchId,
        status: 'BLOCKED_MISSING',
        diagnostics: Object.freeze(['MODEL_LINE_ID_MISSING']),
      });
    }

    const lineKey = canonicalExactLineKey(component.rawLineId);
    const lineTargetId = lineTargetIdFor(lineKey);
    const diagnostics = component.rawLineId === lineKey
      ? Object.freeze([])
      : Object.freeze(['MODEL_LINE_ID_CANONICALIZED']);
    const target = deepFreeze({
      schema: COMMON_ENRICHED_COMPONENT_TARGET_SCHEMA,
      targetId,
      sourceRecordId: component.sourceRecordId,
      sourceEntityId: component.sourceEntityId,
      componentType: component.componentType,
      rawLineId: component.rawLineId,
      lineKey,
      lineTargetId,
      branchId: component.branchId,
      status: 'RESOLVED_EXACT',
      diagnostics,
    });
    const bucket = lineBuckets.get(lineKey) || [];
    bucket.push(target);
    lineBuckets.set(lineKey, bucket);
    return target;
  }).sort(byField('targetId'));

  const lineTargets = [...lineBuckets.entries()]
    .map(([lineKey, components]) => createLineTarget(lineKey, components))
    .sort(byField('targetId'));
  const summary = buildSummary(lineTargets, componentTargets);
  const draft = {
    schema: COMMON_ENRICHED_TARGET_INVENTORY_SCHEMA,
    inventoryId: requireIdentity(input.inventoryId, 'targetInventory.inventoryId'),
    sourceModelHash: sharedModel.semanticHash,
    lineTargets,
    componentTargets,
    summary,
    semanticHash: 'fnv1a64:0000000000000000',
  };
  return deepFreeze({ ...draft, semanticHash: computeTargetInventorySemanticHash(draft) });
}

export function requireCommonEnrichedTargetInventory(value) {
  requireExactKeys(value, INVENTORY_KEYS, 'targetInventory');
  if (value.schema !== COMMON_ENRICHED_TARGET_INVENTORY_SCHEMA) {
    failCommonEnrichment('targetInventory.schema is unsupported.', 'COMMON_ENRICHED_SCHEMA_INVALID');
  }
  const inventory = {
    schema: value.schema,
    inventoryId: requireIdentity(value.inventoryId, 'targetInventory.inventoryId'),
    sourceModelHash: requireSemanticHash(value.sourceModelHash, 'targetInventory.sourceModelHash'),
    lineTargets: requireUniqueSorted(value.lineTargets, 'targetId', 'targetInventory.lineTargets')
      .map(requireLineTarget),
    componentTargets: requireUniqueSorted(value.componentTargets, 'targetId', 'targetInventory.componentTargets')
      .map(requireComponentTarget),
    summary: requireSummary(value.summary),
    semanticHash: requireSemanticHash(value.semanticHash, 'targetInventory.semanticHash'),
  };
  requireInventoryRelationships(inventory);
  const expectedSummary = buildSummary(inventory.lineTargets, inventory.componentTargets);
  if (JSON.stringify(inventory.summary) !== JSON.stringify(expectedSummary)) {
    failCommonEnrichment('targetInventory.summary is stale.', 'COMMON_ENRICHED_SUMMARY_MISMATCH', {
      expected: expectedSummary,
      actual: inventory.summary,
    });
  }
  const expectedHash = computeTargetInventorySemanticHash(inventory);
  if (inventory.semanticHash !== expectedHash) {
    failCommonEnrichment('targetInventory.semanticHash is stale.', 'COMMON_ENRICHED_HASH_MISMATCH', {
      expected: expectedHash,
      actual: inventory.semanticHash,
    });
  }
  return deepFreeze(inventory);
}

function createLineTarget(lineKey, components) {
  const componentTargetIds = components.map((entry) => entry.targetId).sort(compareAscii);
  const sourceRecordIds = components.map((entry) => entry.sourceRecordId).sort(compareAscii);
  const branchIds = [...new Set(components.map((entry) => entry.branchId).filter(Boolean))].sort(compareAscii);
  const diagnostics = components.some((entry) => entry.diagnostics.includes('MODEL_LINE_ID_CANONICALIZED'))
    ? ['MODEL_LINE_ID_CANONICALIZED']
    : [];
  return deepFreeze({
    schema: COMMON_ENRICHED_LINE_TARGET_SCHEMA,
    targetId: lineTargetIdFor(lineKey),
    lineKey,
    sourceRecordIds: Object.freeze(sourceRecordIds),
    componentTargetIds: Object.freeze(componentTargetIds),
    branchIds: Object.freeze(branchIds),
    status: 'RESOLVED_EXACT',
    diagnostics: Object.freeze(diagnostics),
  });
}

function requireLineTarget(value) {
  requireExactKeys(value, LINE_TARGET_KEYS, 'lineTarget');
  if (value.schema !== COMMON_ENRICHED_LINE_TARGET_SCHEMA) {
    failCommonEnrichment('lineTarget.schema is unsupported.', 'COMMON_ENRICHED_SCHEMA_INVALID');
  }
  const target = {
    schema: value.schema,
    targetId: requireIdentity(value.targetId, 'lineTarget.targetId'),
    lineKey: requireIdentity(value.lineKey, 'lineTarget.lineKey'),
    sourceRecordIds: requireStringArray(value.sourceRecordIds, 'lineTarget.sourceRecordIds'),
    componentTargetIds: requireStringArray(value.componentTargetIds, 'lineTarget.componentTargetIds'),
    branchIds: requireStringArray(value.branchIds, 'lineTarget.branchIds'),
    status: requireMember(value.status, TARGET_IDENTITY_STATUSES, 'lineTarget.status'),
    diagnostics: requireStringArray(value.diagnostics, 'lineTarget.diagnostics'),
  };
  if (target.status !== 'RESOLVED_EXACT'
    || target.targetId !== lineTargetIdFor(target.lineKey)
    || target.sourceRecordIds.length === 0
    || target.componentTargetIds.length === 0) {
    failCommonEnrichment('lineTarget identity is invalid.', 'COMMON_ENRICHED_TARGET_IDENTITY_INVALID', {
      targetId: target.targetId,
    });
  }
  return deepFreeze(target);
}

function requireComponentTarget(value) {
  requireExactKeys(value, COMPONENT_TARGET_KEYS, 'componentTarget');
  if (value.schema !== COMMON_ENRICHED_COMPONENT_TARGET_SCHEMA) {
    failCommonEnrichment('componentTarget.schema is unsupported.', 'COMMON_ENRICHED_SCHEMA_INVALID');
  }
  const target = {
    schema: value.schema,
    targetId: requireIdentity(value.targetId, 'componentTarget.targetId'),
    sourceRecordId: requireIdentity(value.sourceRecordId, 'componentTarget.sourceRecordId'),
    sourceEntityId: requireOptionalIdentity(value.sourceEntityId, 'componentTarget.sourceEntityId'),
    componentType: requireIdentity(value.componentType, 'componentTarget.componentType'),
    rawLineId: requireOptionalIdentity(value.rawLineId, 'componentTarget.rawLineId'),
    lineKey: requireOptionalIdentity(value.lineKey, 'componentTarget.lineKey'),
    lineTargetId: requireOptionalIdentity(value.lineTargetId, 'componentTarget.lineTargetId'),
    branchId: requireOptionalIdentity(value.branchId, 'componentTarget.branchId'),
    status: requireMember(value.status, TARGET_IDENTITY_STATUSES, 'componentTarget.status'),
    diagnostics: requireStringArray(value.diagnostics, 'componentTarget.diagnostics'),
  };
  if (target.targetId !== componentTargetId(target.sourceRecordId)) {
    failCommonEnrichment('componentTarget.targetId is inconsistent.', 'COMMON_ENRICHED_TARGET_IDENTITY_INVALID');
  }
  if (target.status === 'RESOLVED_EXACT') {
    if (target.rawLineId === null || target.lineKey === null || target.lineTargetId === null
      || target.lineTargetId !== lineTargetIdFor(target.lineKey)) {
      failCommonEnrichment('Exact component target requires exact line identity.', 'COMMON_ENRICHED_TARGET_IDENTITY_INVALID');
    }
  } else if (target.rawLineId !== null || target.lineKey !== null || target.lineTargetId !== null
    || !target.diagnostics.includes('MODEL_LINE_ID_MISSING')) {
    failCommonEnrichment('Blocked component target must remain unbound.', 'COMMON_ENRICHED_TARGET_IDENTITY_INVALID');
  }
  return deepFreeze(target);
}

function requireInventoryRelationships(inventory) {
  const lineById = new Map(inventory.lineTargets.map((target) => [target.targetId, target]));
  const componentById = new Map(inventory.componentTargets.map((target) => [target.targetId, target]));
  for (const component of inventory.componentTargets) {
    if (component.status !== 'RESOLVED_EXACT') continue;
    const line = lineById.get(component.lineTargetId);
    if (!line || !line.componentTargetIds.includes(component.targetId)
      || !line.sourceRecordIds.includes(component.sourceRecordId)) {
      failCommonEnrichment('Component target is not bound to its line target.', 'COMMON_ENRICHED_TARGET_RELATIONSHIP_INVALID', {
        componentTargetId: component.targetId,
      });
    }
  }
  for (const line of inventory.lineTargets) {
    const related = line.componentTargetIds.map((id) => componentById.get(id));
    if (related.some((target) => !target || target.lineTargetId !== line.targetId)
      || related.map((target) => target.sourceRecordId).sort(compareAscii).join('|') !== line.sourceRecordIds.join('|')) {
      failCommonEnrichment('Line target membership is inconsistent.', 'COMMON_ENRICHED_TARGET_RELATIONSHIP_INVALID', {
        lineTargetId: line.targetId,
      });
    }
  }
}

function requireSummary(value) {
  requireExactKeys(value, SUMMARY_KEYS, 'targetInventory.summary');
  return deepFreeze({
    lineTargetCount: requireNonNegativeInteger(value.lineTargetCount, 'targetInventory.summary.lineTargetCount'),
    componentTargetCount: requireNonNegativeInteger(value.componentTargetCount, 'targetInventory.summary.componentTargetCount'),
    exactComponentCount: requireNonNegativeInteger(value.exactComponentCount, 'targetInventory.summary.exactComponentCount'),
    blockedMissingComponentCount: requireNonNegativeInteger(value.blockedMissingComponentCount, 'targetInventory.summary.blockedMissingComponentCount'),
    multiComponentLineCount: requireNonNegativeInteger(value.multiComponentLineCount, 'targetInventory.summary.multiComponentLineCount'),
  });
}

function buildSummary(lineTargets, componentTargets) {
  return deepFreeze({
    lineTargetCount: lineTargets.length,
    componentTargetCount: componentTargets.length,
    exactComponentCount: componentTargets.filter((entry) => entry.status === 'RESOLVED_EXACT').length,
    blockedMissingComponentCount: componentTargets.filter((entry) => entry.status === 'BLOCKED_MISSING').length,
    multiComponentLineCount: lineTargets.filter((entry) => entry.componentTargetIds.length > 1).length,
  });
}

function normalizeSourceComponents(components) {
  const rows = requireArray(components, 'sharedModel.components').map((component, index) => {
    if (!isPlainRecord(component)) {
      failCommonEnrichment(`sharedModel.components[${index}] must be a record.`, 'COMMON_ENRICHED_RECORD_REQUIRED');
    }
    const identity = isPlainRecord(component.identity) ? component.identity : {};
    return {
      sourceRecordId: requireIdentity(component.componentKey, `sharedModel.components[${index}].componentKey`),
      sourceEntityId: optionalTrimmedIdentity(component.sourceEntityId, `sharedModel.components[${index}].sourceEntityId`),
      componentType: requireIdentity(String(component.type || 'OBJECT').trim(), `sharedModel.components[${index}].type`),
      rawLineId: optionalTrimmedIdentity(identity.lineId, `sharedModel.components[${index}].identity.lineId`),
      branchId: optionalTrimmedIdentity(identity.branchId, `sharedModel.components[${index}].identity.branchId`),
    };
  }).sort(byField('sourceRecordId'));
  const ids = rows.map((entry) => entry.sourceRecordId);
  if (new Set(ids).size !== ids.length) {
    failCommonEnrichment('sharedModel.components contains duplicate componentKey.', 'COMMON_ENRICHED_DUPLICATE_IDENTITY', {
      identityField: 'componentKey',
    });
  }
  return rows;
}

function requireCurrentSharedModel(value) {
  if (!isPlainRecord(value) || value.schema !== 'shared-piping-model/v1') {
    failCommonEnrichment('A shared-piping-model/v1 source is required.', 'COMMON_ENRICHED_SOURCE_MODEL_INVALID');
  }
  requireSemanticHash(value.semanticHash, 'sharedModel.semanticHash');
  requireArray(value.components, 'sharedModel.components');
  const { semanticHash: _semanticHash, ...projection } = value;
  const expected = semanticHash(projection);
  if (value.semanticHash !== expected) {
    failCommonEnrichment('sharedModel.semanticHash is stale.', 'COMMON_ENRICHED_SOURCE_MODEL_STALE', {
      expected,
      actual: value.semanticHash,
    });
  }
  return value;
}

function canonicalExactLineKey(value) {
  return requireIdentity(value.trim().toUpperCase(), 'lineKey');
}

function optionalTrimmedIdentity(value, field) {
  if (value === null || value === undefined || value === '') return null;
  const normalized = String(value).trim();
  if (!normalized) return null;
  return requireIdentity(normalized, field);
}

function lineTargetIdFor(lineKey) {
  return `LINE:${encodeURIComponent(lineKey)}`;
}

function componentTargetId(sourceRecordId) {
  return `COMPONENT:${encodeURIComponent(sourceRecordId)}`;
}

function byField(field) {
  return (left, right) => compareAscii(left[field], right[field]);
}
