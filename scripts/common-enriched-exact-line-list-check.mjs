import assert from 'node:assert/strict';
import {
  COMMON_ENRICHED_LINE_LIST_FIELD_BINDING_SCHEMA,
  COMMON_ENRICHED_LINE_LIST_RESOLUTION_SCHEMA,
  COMMON_ENRICHED_TARGET_INVENTORY_SCHEMA,
  ENGINEERING_MASTER_RECORD_SCHEMA,
  ENGINEERING_MASTER_SNAPSHOT_SCHEMA,
  createCommonEnrichedLineListResolution,
  createCommonEnrichedTargetInventory,
  createEngineeringMasterSnapshot,
  requireCommonEnrichedLineListResolution,
} from '../src/core/common-enriched-properties/index.js';
import {
  createSharedPipingModel,
  semanticHash,
} from '../src/core/shared-piping-model/index.js';

const SOURCE_HASH = 'a'.repeat(64);
const CAPTURED_AT = '2026-08-02T17:30:00.000Z';

const sharedModel = createSharedPipingModel({
  project: { datasetId: 'ENR-LINE-LIST-P3', name: 'Phase 3 line-list fixture', sourceName: 'synthetic.json' },
  units: { length: 'mm', force: 'N', mass: 'kg' },
  sourceSnapshotRef: {
    schema: 'source-package-snapshot/v1',
    datasetId: 'ENR-LINE-LIST-P3',
    sourceSchema: 'synthetic-shared-model/v1',
    sourceSemanticHash: semanticHash({ source: 'ENR-LINE-LIST-P3' }),
    sourceByteHash: null,
  },
  components: [
    component('C-100', 'S100'),
    component('C-200', 'S200'),
    component('C-300', 'S300'),
    component('C-400', 'S400'),
    component('C-500', 'S500'),
  ],
  supports: [],
  sourceReferences: { nodes: [] },
  diagnostics: [],
});

const inventory = createCommonEnrichedTargetInventory({
  schema: COMMON_ENRICHED_TARGET_INVENTORY_SCHEMA,
  inventoryId: 'INV-LINE-LIST-P3',
  sharedModel,
});

const snapshot = createEngineeringMasterSnapshot({
  schema: ENGINEERING_MASTER_SNAPSHOT_SCHEMA,
  snapshotId: 'SNAP-LINE-LIST-P3',
  sourceKind: 'LINE_LIST',
  sourceKey: 'lineList',
  sourceHash: SOURCE_HASH,
  capturedAt: CAPTURED_AT,
  mappingSemanticHash: semanticHash({ lineKey: 'lineKey', pressure: 'pressure', temperature: 'temperature', phase: 'phase' }),
  records: [
    row('LL-001', 'LineList!1', { lineKey: ' s100 ', pressure: 100, temperature: 50, phase: 'LIQUID' }),
    row('LL-002', 'LineList!2', { lineKey: 'S200', pressure: 200, temperature: 60, phase: 'GAS' }),
    row('LL-003', 'LineList!3', { lineKey: 's200', pressure: 201, temperature: 61, phase: 'GAS' }),
    row('LL-004', 'LineList!4', { lineKey: 'S400', pressure: '1200', temperature: 70, phase: 'MIXED' }),
    row('LL-005', 'LineList!5', { lineKey: 'S500', pressure: null, temperature: 80, phase: 'LIQUID' }),
  ],
  metadata: { fileName: 'synthetic-line-list.xlsx', sheet: 'LineList' },
});

const bindings = [
  binding('process.designPressureKpaG', 'pressure', 'kPa(g)', 'NUMBER'),
  binding('process.designTemperatureC', 'temperature', 'degC', 'NUMBER'),
  binding('process.phase', 'phase', null, 'STRING'),
];

const input = {
  schema: COMMON_ENRICHED_LINE_LIST_RESOLUTION_SCHEMA,
  resolutionId: 'RES-LINE-LIST-P3',
  inventory,
  snapshot,
  bindings,
};

const first = createCommonEnrichedLineListResolution(input);
const second = createCommonEnrichedLineListResolution(input);
assert.deepEqual(first, second, 'repeated exact resolution must be deterministic');
assert.deepEqual(requireCommonEnrichedLineListResolution(first), first);
assert.ok(Object.isFrozen(first));
assert.ok(Object.isFrozen(first.targetRecords[0].fields));
assert.deepEqual(first.summary, {
  lineTargetCount: 5,
  exactLineCount: 3,
  missingLineCount: 1,
  ambiguousLineCount: 1,
  exactFieldCount: 7,
  blockedFieldCount: 8,
  conflictFieldCount: 1,
});

const byLine = Object.fromEntries(first.targetRecords.map((record) => [record.lineKey, record]));
assert.ok(byLine.S100.fields.every((field) => field.status === 'RESOLVED_EXACT'));
assert.ok(byLine.S100.fields.every((field) => field.diagnostics.includes('LINE_LIST_LINE_KEY_CANONICALIZED')));
assert.ok(byLine.S200.fields.every((field) => field.status === 'BLOCKED_AMBIGUOUS'));
assert.ok(byLine.S200.fields.every((field) => field.value === null));
assert.ok(byLine.S200.fields.every((field) => field.matchMethod === 'EXACT_LINE_KEY_MULTIPLE_ROWS'));
assert.ok(byLine.S300.fields.every((field) => field.status === 'BLOCKED_MISSING'));
assert.ok(byLine.S300.fields.every((field) => field.sourceKind === 'NONE'));
assert.equal(field(byLine.S400, 'process.designPressureKpaG').status, 'BLOCKED_CONFLICT');
assert.equal(field(byLine.S400, 'process.designTemperatureC').status, 'RESOLVED_EXACT');
assert.equal(field(byLine.S500, 'process.designPressureKpaG').status, 'BLOCKED_MISSING');
assert.equal(field(byLine.S500, 'process.phase').status, 'RESOLVED_EXACT');

expectCode(
  () => createCommonEnrichedLineListResolution({ ...input, bindings: [] }),
  'COMMON_ENRICHED_LINE_LIST_BINDINGS_REQUIRED',
);
expectCode(
  () => createCommonEnrichedLineListResolution({
    ...input,
    snapshot: createEngineeringMasterSnapshot({
      ...withoutSemanticHash(snapshot),
      snapshotId: 'WRONG-SOURCE-KIND',
      sourceKind: 'PIPING_CLASS',
    }),
  }),
  'COMMON_ENRICHED_LINE_LIST_SOURCE_INVALID',
);
expectCode(
  () => createCommonEnrichedLineListResolution({
    ...input,
    snapshot: createEngineeringMasterSnapshot({
      ...withoutSemanticHash(snapshot),
      snapshotId: 'INVALID-LINE-KEY',
      records: [row('LL-001', 'LineList!1', { lineKey: null, pressure: 100, temperature: 50, phase: 'LIQUID' })],
    }),
  }),
  'COMMON_ENRICHED_LINE_LIST_RECORD_INVALID',
);
expectCode(
  () => requireCommonEnrichedLineListResolution({ ...first, resolutionId: 'TAMPERED' }),
  'COMMON_ENRICHED_HASH_MISMATCH',
);
expectCode(
  () => requireCommonEnrichedLineListResolution({
    ...first,
    summary: { ...first.summary, exactFieldCount: first.summary.exactFieldCount + 1 },
  }),
  'COMMON_ENRICHED_SUMMARY_MISMATCH',
);

assert.equal(sharedModel.semanticHash, inventory.sourceModelHash, 'source model must remain unchanged');
assert.equal(snapshot.semanticHash, input.snapshot.semanticHash, 'source snapshot must remain unchanged');

console.log('PASS common enriched exact line-list resolution checks');
console.log(JSON.stringify({
  inventorySemanticHash: inventory.semanticHash,
  snapshotSemanticHash: snapshot.semanticHash,
  resolutionSemanticHash: first.semanticHash,
  summary: first.summary,
}, null, 2));

function component(componentKey, lineId) {
  return {
    componentKey,
    sourceEntityId: componentKey,
    name: componentKey,
    type: 'PIPE',
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
    engineeringProperties: {},
    compatibilityEvidence: {},
    sourceReferences: { sourceEntityId: componentKey },
    diagnostics: [],
  };
}

function row(recordId, locator, values) {
  return { schema: ENGINEERING_MASTER_RECORD_SCHEMA, recordId, locator, values };
}

function binding(targetField, sourceField, unit, valueKind) {
  return {
    schema: COMMON_ENRICHED_LINE_LIST_FIELD_BINDING_SCHEMA,
    targetField,
    sourceField,
    unit,
    valueKind,
  };
}

function field(record, name) {
  return record.fields.find((entry) => entry.field === name);
}

function withoutSemanticHash(value) {
  const { semanticHash: _semanticHash, ...rest } = value;
  return structuredClone(rest);
}

function expectCode(action, code) {
  assert.throws(action, (error) => error?.code === code, `expected ${code}`);
}
