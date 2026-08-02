import assert from 'node:assert/strict';
import {
  COMMON_ENRICHED_COMPONENT_WEIGHT_KEY_CONFIG_SCHEMA,
  COMMON_ENRICHED_COMPONENT_WEIGHT_RESOLUTION_SCHEMA,
  COMMON_ENRICHED_LINE_LIST_FIELD_BINDING_SCHEMA,
  COMMON_ENRICHED_LINE_LIST_RESOLUTION_SCHEMA,
  COMMON_ENRICHED_TARGET_INVENTORY_SCHEMA,
  ENGINEERING_MASTER_RECORD_SCHEMA,
  ENGINEERING_MASTER_SNAPSHOT_SCHEMA,
  createCommonEnrichedComponentWeightResolution,
  createCommonEnrichedLineListResolution,
  createCommonEnrichedTargetInventory,
  createEngineeringMasterSnapshot,
  requireCommonEnrichedComponentWeightResolution,
} from '../src/core/common-enriched-properties/index.js';
import {
  createSharedPipingModel,
  semanticHash,
} from '../src/core/shared-piping-model/index.js';

const LINE_LIST_HASH = 'a'.repeat(64);
const WEIGHT_HASH = 'f'.repeat(64);
const CAPTURED_AT = '2026-08-02T18:30:00.000Z';

const sharedModel = createSharedPipingModel({
  project: { datasetId: 'ENR-WEIGHT-P8', name: 'Phase 8 component-weight fixture', sourceName: 'synthetic.json' },
  units: { length: 'mm', force: 'N', mass: 'kg' },
  sourceSnapshotRef: {
    schema: 'source-package-snapshot/v1',
    datasetId: 'ENR-WEIGHT-P8',
    sourceSchema: 'synthetic-shared-model/v1',
    sourceSemanticHash: semanticHash({ source: 'ENR-WEIGHT-P8' }),
    sourceByteHash: null,
  },
  components: [
    component('C-100', 'S100', 'VALVE', 'ENT-100', 'CAT-V100'),
    component('C-200', 'S200', 'ELBOW', 'ENT-200', 'CAT-E200'),
    component('C-300', 'S300', 'TEE', 'ENT-300', 'CAT-T300'),
    component('C-400', 'S400', 'VALVE', 'ENT-400', 'CAT-V400'),
    component('C-500', 'S500', 'VALVE', null, null),
    component('C-600', 'S600', 'REDUCER', 'ENT-600', 'CAT-R600'),
    component('C-700', 'S700', 'VALVE', 'ENT-700', 'CAT-V700'),
  ],
  supports: [],
  sourceReferences: { nodes: [] },
  diagnostics: [],
});

const inventory = createCommonEnrichedTargetInventory({
  schema: COMMON_ENRICHED_TARGET_INVENTORY_SCHEMA,
  inventoryId: 'INV-WEIGHT-P8',
  sharedModel,
});

const lineListSnapshot = createEngineeringMasterSnapshot({
  schema: ENGINEERING_MASTER_SNAPSHOT_SCHEMA,
  snapshotId: 'SNAP-LINE-LIST-P8',
  sourceKind: 'LINE_LIST',
  sourceKey: 'lineList',
  sourceHash: LINE_LIST_HASH,
  capturedAt: CAPTURED_AT,
  mappingSemanticHash: semanticHash({ lineKey: 'lineKey', nominalBoreMm: 'nominalBoreMm' }),
  records: [
    lineRow('LL-001', 'S100', 100),
    lineRow('LL-002', 'S200', 200),
    lineRow('LL-003', 'S300', 300),
    lineRow('LL-004', 'S400', 400),
    lineRow('LL-005', 's400', 401),
    lineRow('LL-006', 'S500', null),
    lineRow('LL-007', 'S600', 600),
    lineRow('LL-008', 'S700', 700),
  ],
  metadata: { fileName: 'synthetic-line-list.xlsx', sheet: 'LineList' },
});

const lineListResolution = createCommonEnrichedLineListResolution({
  schema: COMMON_ENRICHED_LINE_LIST_RESOLUTION_SCHEMA,
  resolutionId: 'RES-LINE-LIST-P8',
  inventory,
  snapshot: lineListSnapshot,
  bindings: [lineBinding('spec.nominalBoreMm', 'nominalBoreMm', 'mm', 'NUMBER')],
});

const weightSnapshot = createEngineeringMasterSnapshot({
  schema: ENGINEERING_MASTER_SNAPSHOT_SCHEMA,
  snapshotId: 'SNAP-WEIGHT-P8',
  sourceKind: 'COMPONENT_WEIGHT_MASTER',
  sourceKey: 'componentWeightMaster',
  sourceHash: WEIGHT_HASH,
  capturedAt: CAPTURED_AT,
  mappingSemanticHash: semanticHash({
    entityId: 'entityId',
    catalogKey: 'catalogKey',
    componentType: 'componentType',
    boreMm: 'boreMm',
    weightKg: 'weightKg',
  }),
  records: [
    weightRow('WT-001', 'Weight!1', 'ENT-100', 'CAT-V100', 'VALVE', 100, 15),
    weightRow('WT-002', 'Weight!2', 'ENT-200', 'CAT-E200', 'ELBOW', 200, 20),
    weightRow('WT-003', 'Weight!3', 'ENT-201', 'CAT-E201', ' elbow ', 200, 21),
    weightRow('WT-004', 'Weight!4', 'ENT-600', 'CAT-R600', 'REDUCER', 600, '30'),
    weightRow('WT-005', 'Weight!5', 'ENT-700', 'CAT-V700', 'VALVE', 700, 35),
    weightRow('WT-006', 'Weight!6', 'ENT-400', 'CAT-V400', 'VALVE', 450, 25),
  ],
  metadata: { fileName: 'synthetic-component-weight.xlsx', sheet: 'Weights' },
});

const typeBoreConfig = {
  schema: COMMON_ENRICHED_COMPONENT_WEIGHT_KEY_CONFIG_SCHEMA,
  selectorKind: 'COMPONENT_TYPE_BORE',
  targetCatalogKeyProperty: null,
  targetBoreField: 'spec.nominalBoreMm',
  sourceEntityIdField: null,
  sourceCatalogKeyField: null,
  sourceComponentTypeField: 'componentType',
  sourceBoreField: 'boreMm',
};
const input = {
  schema: COMMON_ENRICHED_COMPONENT_WEIGHT_RESOLUTION_SCHEMA,
  resolutionId: 'RES-WEIGHT-P8',
  inventory,
  sharedModel,
  lineListResolution,
  snapshot: weightSnapshot,
  keyConfig: typeBoreConfig,
  sourceWeightField: 'weightKg',
};

const first = createCommonEnrichedComponentWeightResolution(input);
const second = createCommonEnrichedComponentWeightResolution(input);
assert.deepEqual(first, second, 'repeated component-weight resolution must be deterministic');
assert.deepEqual(requireCommonEnrichedComponentWeightResolution(first), first);
assert.ok(Object.isFrozen(first));
assert.ok(Object.isFrozen(first.targetRecords[0].fields));
assert.deepEqual(first.summary, {
  componentTargetCount: 7,
  exactKeyCount: 5,
  blockedKeyCount: 2,
  missingRowCount: 1,
  ambiguousRowCount: 1,
  exactWeightCount: 2,
  blockedWeightCount: 5,
  conflictWeightCount: 1,
});

const byComponent = Object.fromEntries(first.targetRecords.map((record) => [record.sourceRecordId, record]));
assert.equal(weight(byComponent['C-100']).status, 'RESOLVED_EXACT');
assert.equal(weight(byComponent['C-100']).value, 15);
assert.equal(weight(byComponent['C-200']).status, 'BLOCKED_AMBIGUOUS');
assert.equal(weight(byComponent['C-200']).matchMethod, 'EXACT_COMPONENT_WEIGHT_SELECTOR_MULTIPLE_ROWS');
assert.equal(weight(byComponent['C-300']).status, 'BLOCKED_MISSING');
assert.ok(weight(byComponent['C-300']).diagnostics.includes('COMPONENT_WEIGHT_EXACT_ROW_MISSING'));
assert.equal(weight(byComponent['C-400']).status, 'BLOCKED_AMBIGUOUS');
assert.ok(weight(byComponent['C-400']).diagnostics.includes('COMPONENT_WEIGHT_KEY_BLOCKED'));
assert.equal(weight(byComponent['C-500']).status, 'BLOCKED_MISSING');
assert.ok(weight(byComponent['C-500']).diagnostics.includes('COMPONENT_WEIGHT_KEY_BLOCKED'));
assert.equal(weight(byComponent['C-600']).status, 'BLOCKED_CONFLICT');
assert.equal(weight(byComponent['C-700']).status, 'RESOLVED_EXACT');
assert.equal(weight(byComponent['C-700']).value, 35);

const entityResolution = createCommonEnrichedComponentWeightResolution({
  ...input,
  resolutionId: 'RES-WEIGHT-ENTITY-P8',
  keyConfig: {
    schema: COMMON_ENRICHED_COMPONENT_WEIGHT_KEY_CONFIG_SCHEMA,
    selectorKind: 'ENTITY',
    targetCatalogKeyProperty: null,
    targetBoreField: null,
    sourceEntityIdField: 'entityId',
    sourceCatalogKeyField: null,
    sourceComponentTypeField: null,
    sourceBoreField: null,
  },
});
const entityByComponent = Object.fromEntries(
  entityResolution.targetRecords.map((record) => [record.sourceRecordId, record]),
);
assert.equal(weight(entityByComponent['C-100']).status, 'RESOLVED_EXACT');
assert.equal(weight(entityByComponent['C-400']).status, 'RESOLVED_EXACT',
  'ENTITY selection must not depend on ambiguous line bore');
assert.equal(weight(entityByComponent['C-500']).status, 'BLOCKED_MISSING');

const catalogResolution = createCommonEnrichedComponentWeightResolution({
  ...input,
  resolutionId: 'RES-WEIGHT-CATALOG-P8',
  keyConfig: {
    schema: COMMON_ENRICHED_COMPONENT_WEIGHT_KEY_CONFIG_SCHEMA,
    selectorKind: 'CATALOG_KEY',
    targetCatalogKeyProperty: 'catalogKey',
    targetBoreField: null,
    sourceEntityIdField: null,
    sourceCatalogKeyField: 'catalogKey',
    sourceComponentTypeField: null,
    sourceBoreField: null,
  },
});
const catalogByComponent = Object.fromEntries(
  catalogResolution.targetRecords.map((record) => [record.sourceRecordId, record]),
);
assert.equal(weight(catalogByComponent['C-100']).status, 'RESOLVED_EXACT');
assert.equal(weight(catalogByComponent['C-500']).status, 'BLOCKED_MISSING');

expectCode(
  () => createCommonEnrichedComponentWeightResolution({
    ...input,
    keyConfig: { ...typeBoreConfig, sourceEntityIdField: 'entityId' },
  }),
  'COMMON_ENRICHED_COMPONENT_WEIGHT_KEY_CONFIG_INVALID',
);
expectCode(
  () => createCommonEnrichedComponentWeightResolution({
    ...input,
    snapshot: createEngineeringMasterSnapshot({
      ...withoutSemanticHash(weightSnapshot),
      snapshotId: 'WRONG-SOURCE-KIND-P8',
      sourceKind: 'INSULATION_REGISTER',
    }),
  }),
  'COMMON_ENRICHED_COMPONENT_WEIGHT_SOURCE_INVALID',
);
expectCode(
  () => createCommonEnrichedComponentWeightResolution({
    ...input,
    snapshot: createEngineeringMasterSnapshot({
      ...withoutSemanticHash(weightSnapshot),
      snapshotId: 'INVALID-WEIGHT-KEY-P8',
      records: [weightRow('WT-001', 'Weight!1', 'ENT-100', 'CAT-V100', 'VALVE', '100', 15)],
    }),
  }),
  'COMMON_ENRICHED_COMPONENT_WEIGHT_RECORD_INVALID',
);
const staleSharedModel = structuredClone(sharedModel);
staleSharedModel.components[0].type = 'CHANGED';
expectCode(
  () => createCommonEnrichedComponentWeightResolution({ ...input, sharedModel: staleSharedModel }),
  'COMMON_ENRICHED_SOURCE_MODEL_STALE',
);
expectCode(
  () => requireCommonEnrichedComponentWeightResolution({ ...first, resolutionId: 'TAMPERED' }),
  'COMMON_ENRICHED_HASH_MISMATCH',
);
expectCode(
  () => requireCommonEnrichedComponentWeightResolution({
    ...first,
    summary: { ...first.summary, exactWeightCount: first.summary.exactWeightCount + 1 },
  }),
  'COMMON_ENRICHED_SUMMARY_MISMATCH',
);

assert.equal(sharedModel.semanticHash, input.sharedModel.semanticHash);
assert.equal(inventory.semanticHash, input.inventory.semanticHash);
assert.equal(lineListResolution.semanticHash, input.lineListResolution.semanticHash);
assert.equal(weightSnapshot.semanticHash, input.snapshot.semanticHash);

console.log('PASS common enriched exact component-weight resolution checks');
console.log(JSON.stringify({
  inventorySemanticHash: inventory.semanticHash,
  lineListResolutionSemanticHash: lineListResolution.semanticHash,
  snapshotSemanticHash: weightSnapshot.semanticHash,
  resolutionSemanticHash: first.semanticHash,
  summary: first.summary,
}, null, 2));

function component(componentKey, lineId, type, sourceEntityId, catalogKey) {
  return {
    componentKey,
    sourceEntityId,
    name: componentKey,
    type,
    identity: { lineId, branchId: `${lineId}/B1`, systemId: '', zoneId: '' },
    geometry: {
      start: null,
      end: null,
      center: null,
      points: [],
      branchPoints: [],
      sources: {},
      sourcePath: `/${componentKey}`,
      ports: [],
    },
    engineeringProperties: catalogKey === null ? {} : { catalogKey },
    compatibilityEvidence: {},
    sourceReferences: { sourceEntityId: sourceEntityId || componentKey },
    diagnostics: [],
  };
}

function lineRow(recordId, lineKey, nominalBoreMm) {
  return row(recordId, `LineList!${recordId}`, { lineKey, nominalBoreMm });
}

function weightRow(recordId, locator, entityId, catalogKey, componentType, boreMm, weightKg) {
  return row(recordId, locator, {
    entityId,
    catalogKey,
    componentType,
    boreMm,
    weightKg,
  });
}

function row(recordId, locator, values) {
  return { schema: ENGINEERING_MASTER_RECORD_SCHEMA, recordId, locator, values };
}

function lineBinding(targetField, sourceField, unit, valueKind) {
  return {
    schema: COMMON_ENRICHED_LINE_LIST_FIELD_BINDING_SCHEMA,
    targetField,
    sourceField,
    unit,
    valueKind,
  };
}

function weight(record) {
  return record.fields[0];
}

function withoutSemanticHash(value) {
  const { semanticHash: _semanticHash, ...rest } = value;
  return structuredClone(rest);
}

function expectCode(action, code) {
  assert.throws(action, (error) => error?.code === code, `expected ${code}`);
}
