import assert from 'node:assert/strict';
import {
  COMMON_ENRICHED_LINE_LIST_FIELD_BINDING_SCHEMA,
  COMMON_ENRICHED_LINE_LIST_RESOLUTION_SCHEMA,
  COMMON_ENRICHED_PIPING_CLASS_FIELD_BINDING_SCHEMA,
  COMMON_ENRICHED_PIPING_CLASS_KEY_CONFIG_SCHEMA,
  COMMON_ENRICHED_PIPING_CLASS_RESOLUTION_SCHEMA,
  COMMON_ENRICHED_TARGET_INVENTORY_SCHEMA,
  ENGINEERING_MASTER_RECORD_SCHEMA,
  ENGINEERING_MASTER_SNAPSHOT_SCHEMA,
  createCommonEnrichedLineListResolution,
  createCommonEnrichedPipingClassResolution,
  createCommonEnrichedTargetInventory,
  createEngineeringMasterSnapshot,
  requireCommonEnrichedPipingClassResolution,
} from '../src/core/common-enriched-properties/index.js';
import {
  createSharedPipingModel,
  semanticHash,
} from '../src/core/shared-piping-model/index.js';

const LINE_LIST_HASH = 'a'.repeat(64);
const PIPING_CLASS_HASH = 'b'.repeat(64);
const CAPTURED_AT = '2026-08-02T17:45:00.000Z';

const sharedModel = createSharedPipingModel({
  project: { datasetId: 'ENR-PCLASS-P4', name: 'Phase 4 piping-class fixture', sourceName: 'synthetic.json' },
  units: { length: 'mm', force: 'N', mass: 'kg' },
  sourceSnapshotRef: {
    schema: 'source-package-snapshot/v1',
    datasetId: 'ENR-PCLASS-P4',
    sourceSchema: 'synthetic-shared-model/v1',
    sourceSemanticHash: semanticHash({ source: 'ENR-PCLASS-P4' }),
    sourceByteHash: null,
  },
  components: [
    component('C-100', 'S100'),
    component('C-200', 'S200'),
    component('C-300', 'S300'),
    component('C-400', 'S400'),
    component('C-500', 'S500'),
    component('C-600', 'S600'),
  ],
  supports: [],
  sourceReferences: { nodes: [] },
  diagnostics: [],
});

const inventory = createCommonEnrichedTargetInventory({
  schema: COMMON_ENRICHED_TARGET_INVENTORY_SCHEMA,
  inventoryId: 'INV-PCLASS-P4',
  sharedModel,
});

const lineListSnapshot = createEngineeringMasterSnapshot({
  schema: ENGINEERING_MASTER_SNAPSHOT_SCHEMA,
  snapshotId: 'SNAP-LINE-LIST-P4',
  sourceKind: 'LINE_LIST',
  sourceKey: 'lineList',
  sourceHash: LINE_LIST_HASH,
  capturedAt: CAPTURED_AT,
  mappingSemanticHash: semanticHash({
    lineKey: 'lineKey',
    pipingClass: 'pipingClass',
    nominalBoreMm: 'nominalBoreMm',
    schedule: 'schedule',
  }),
  records: [
    row('LL-001', 'LineList!1', { lineKey: 'S100', pipingClass: 'm1', nominalBoreMm: 100, schedule: 'sch40' }),
    row('LL-002', 'LineList!2', { lineKey: 'S200', pipingClass: 'M2', nominalBoreMm: 200, schedule: 'SCH80' }),
    row('LL-003', 'LineList!3', { lineKey: 'S300', pipingClass: 'M3', nominalBoreMm: 300, schedule: 'SCH40' }),
    row('LL-004', 'LineList!4', { lineKey: 'S400', pipingClass: 'M4', nominalBoreMm: 400, schedule: 'SCH40' }),
    row('LL-005', 'LineList!5', { lineKey: 's400', pipingClass: 'M4', nominalBoreMm: 400, schedule: 'SCH80' }),
    row('LL-006', 'LineList!6', { lineKey: 'S500', pipingClass: 'M5', nominalBoreMm: 500, schedule: 'SCH40' }),
    row('LL-007', 'LineList!7', { lineKey: 'S600', pipingClass: 'M6', nominalBoreMm: 600, schedule: null }),
  ],
  metadata: { fileName: 'synthetic-line-list.xlsx', sheet: 'LineList' },
});

const lineListResolution = createCommonEnrichedLineListResolution({
  schema: COMMON_ENRICHED_LINE_LIST_RESOLUTION_SCHEMA,
  resolutionId: 'RES-LINE-LIST-P4',
  inventory,
  snapshot: lineListSnapshot,
  bindings: [
    lineBinding('spec.nominalBoreMm', 'nominalBoreMm', 'mm', 'NUMBER'),
    lineBinding('spec.pipingClass', 'pipingClass', null, 'STRING'),
    lineBinding('spec.schedule', 'schedule', null, 'STRING'),
  ],
});

const pipingClassSnapshot = createEngineeringMasterSnapshot({
  schema: ENGINEERING_MASTER_SNAPSHOT_SCHEMA,
  snapshotId: 'SNAP-PCLASS-P4',
  sourceKind: 'PIPING_CLASS',
  sourceKey: 'pipingClass',
  sourceHash: PIPING_CLASS_HASH,
  capturedAt: CAPTURED_AT,
  mappingSemanticHash: semanticHash({
    pipingClass: 'pipingClass',
    nominalBoreMm: 'nominalBoreMm',
    schedule: 'schedule',
    outsideDiameterMm: 'outsideDiameterMm',
    wallThicknessMm: 'wallThicknessMm',
    materialCode: 'materialCode',
  }),
  records: [
    row('PC-001', 'PipingClass!1', {
      pipingClass: 'M1', nominalBoreMm: 100, schedule: 'SCH40',
      outsideDiameterMm: 114.3, wallThicknessMm: 6.02, materialCode: 'A106-B',
    }),
    row('PC-002', 'PipingClass!2', {
      pipingClass: 'M2', nominalBoreMm: 200, schedule: 'SCH80',
      outsideDiameterMm: 219.1, wallThicknessMm: 12.7, materialCode: 'A106-B',
    }),
    row('PC-003', 'PipingClass!3', {
      pipingClass: 'm2', nominalBoreMm: 200, schedule: 'sch80',
      outsideDiameterMm: 219.1, wallThicknessMm: 12.7, materialCode: 'A106-B',
    }),
    row('PC-004', 'PipingClass!4', {
      pipingClass: 'M5', nominalBoreMm: 500, schedule: 'SCH40',
      outsideDiameterMm: 508, wallThicknessMm: '12.7', materialCode: null,
    }),
    row('PC-005', 'PipingClass!5', {
      pipingClass: 'M6', nominalBoreMm: 600, schedule: 'SCH40',
      outsideDiameterMm: 610, wallThicknessMm: 17.48, materialCode: 'A106-B',
    }),
  ],
  metadata: { fileName: 'synthetic-piping-class.xlsx', sheet: 'PipingClass' },
});

const keyConfig = {
  schema: COMMON_ENRICHED_PIPING_CLASS_KEY_CONFIG_SCHEMA,
  targetClassField: 'spec.pipingClass',
  targetBoreField: 'spec.nominalBoreMm',
  targetScheduleField: 'spec.schedule',
  sourceClassField: 'pipingClass',
  sourceBoreField: 'nominalBoreMm',
  sourceScheduleField: 'schedule',
};
const bindings = [
  pipingBinding('material.materialCode', 'materialCode', null, 'STRING'),
  pipingBinding('spec.outsideDiameterMm', 'outsideDiameterMm', 'mm', 'NUMBER'),
  pipingBinding('spec.wallThicknessMm', 'wallThicknessMm', 'mm', 'NUMBER'),
];
const input = {
  schema: COMMON_ENRICHED_PIPING_CLASS_RESOLUTION_SCHEMA,
  resolutionId: 'RES-PCLASS-P4',
  lineListResolution,
  snapshot: pipingClassSnapshot,
  keyConfig,
  bindings,
};

const first = createCommonEnrichedPipingClassResolution(input);
const second = createCommonEnrichedPipingClassResolution(input);
assert.deepEqual(first, second, 'repeated piping-class resolution must be deterministic');
assert.deepEqual(requireCommonEnrichedPipingClassResolution(first), first);
assert.ok(Object.isFrozen(first));
assert.ok(Object.isFrozen(first.targetRecords[0].fields));
assert.deepEqual(first.summary, {
  lineTargetCount: 6,
  exactKeyCount: 4,
  blockedKeyCount: 2,
  missingRowCount: 1,
  ambiguousRowCount: 1,
  exactFieldCount: 4,
  blockedFieldCount: 14,
  conflictFieldCount: 1,
});

const byLine = Object.fromEntries(first.targetRecords.map((record) => [record.lineKey, record]));
assert.ok(byLine.S100.fields.every((entry) => entry.status === 'RESOLVED_EXACT'));
assert.equal(field(byLine.S100, 'spec.outsideDiameterMm').value, 114.3);
assert.ok(byLine.S200.fields.every((entry) => entry.status === 'BLOCKED_AMBIGUOUS'));
assert.ok(byLine.S200.fields.every((entry) => entry.matchMethod === 'EXACT_PIPING_CLASS_KEY_MULTIPLE_ROWS'));
assert.ok(byLine.S300.fields.every((entry) => entry.status === 'BLOCKED_MISSING'));
assert.ok(byLine.S300.fields.every((entry) => entry.diagnostics.includes('PIPING_CLASS_EXACT_ROW_MISSING')));
assert.ok(byLine.S400.fields.every((entry) => entry.status === 'BLOCKED_AMBIGUOUS'));
assert.ok(byLine.S400.fields.every((entry) => entry.diagnostics.includes('PIPING_CLASS_KEY_BLOCKED')));
assert.equal(field(byLine.S500, 'spec.outsideDiameterMm').status, 'RESOLVED_EXACT');
assert.equal(field(byLine.S500, 'spec.wallThicknessMm').status, 'BLOCKED_CONFLICT');
assert.equal(field(byLine.S500, 'material.materialCode').status, 'BLOCKED_MISSING');
assert.ok(byLine.S600.fields.every((entry) => entry.status === 'BLOCKED_MISSING'));
assert.ok(byLine.S600.fields.every((entry) => entry.diagnostics.includes('PIPING_CLASS_KEY_BLOCKED')));

const noScheduleSnapshot = createEngineeringMasterSnapshot({
  ...withoutSemanticHash(pipingClassSnapshot),
  snapshotId: 'SNAP-PCLASS-NO-SCHEDULE-P4',
  records: [
    ...pipingClassSnapshot.records,
    row('PC-006', 'PipingClass!6', {
      pipingClass: 'M1', nominalBoreMm: 100, schedule: 'SCH80',
      outsideDiameterMm: 114.3, wallThicknessMm: 8.56, materialCode: 'A106-B',
    }),
  ].sort((left, right) => left.recordId.localeCompare(right.recordId)),
});
const noSchedule = createCommonEnrichedPipingClassResolution({
  ...input,
  resolutionId: 'RES-PCLASS-NO-SCHEDULE-P4',
  snapshot: noScheduleSnapshot,
  keyConfig: {
    ...keyConfig,
    targetScheduleField: null,
    sourceScheduleField: null,
  },
});
const noScheduleS100 = noSchedule.targetRecords.find((record) => record.lineKey === 'S100');
assert.ok(noScheduleS100.fields.every((entry) => entry.status === 'BLOCKED_AMBIGUOUS'),
  'omitting schedule must expose multiple class/bore rows, not select a default schedule');

expectCode(
  () => createCommonEnrichedPipingClassResolution({ ...input, bindings: [] }),
  'COMMON_ENRICHED_PIPING_CLASS_BINDINGS_REQUIRED',
);
expectCode(
  () => createCommonEnrichedPipingClassResolution({
    ...input,
    snapshot: createEngineeringMasterSnapshot({
      ...withoutSemanticHash(pipingClassSnapshot),
      snapshotId: 'WRONG-SOURCE-KIND-P4',
      sourceKind: 'LINE_LIST',
    }),
  }),
  'COMMON_ENRICHED_PIPING_CLASS_SOURCE_INVALID',
);
expectCode(
  () => createCommonEnrichedPipingClassResolution({
    ...input,
    snapshot: createEngineeringMasterSnapshot({
      ...withoutSemanticHash(pipingClassSnapshot),
      snapshotId: 'INVALID-PCLASS-KEY-P4',
      records: [row('PC-001', 'PipingClass!1', {
        pipingClass: 'M1', nominalBoreMm: '100', schedule: 'SCH40',
        outsideDiameterMm: 114.3, wallThicknessMm: 6.02, materialCode: 'A106-B',
      })],
    }),
  }),
  'COMMON_ENRICHED_PIPING_CLASS_RECORD_INVALID',
);
expectCode(
  () => createCommonEnrichedPipingClassResolution({
    ...input,
    keyConfig: { ...keyConfig, sourceScheduleField: null },
  }),
  'COMMON_ENRICHED_PIPING_CLASS_KEY_CONFIG_INVALID',
);
expectCode(
  () => requireCommonEnrichedPipingClassResolution({ ...first, resolutionId: 'TAMPERED' }),
  'COMMON_ENRICHED_HASH_MISMATCH',
);
expectCode(
  () => requireCommonEnrichedPipingClassResolution({
    ...first,
    summary: { ...first.summary, exactFieldCount: first.summary.exactFieldCount + 1 },
  }),
  'COMMON_ENRICHED_SUMMARY_MISMATCH',
);

assert.equal(lineListResolution.semanticHash, input.lineListResolution.semanticHash);
assert.equal(pipingClassSnapshot.semanticHash, input.snapshot.semanticHash);

console.log('PASS common enriched exact piping-class resolution checks');
console.log(JSON.stringify({
  lineListResolutionSemanticHash: lineListResolution.semanticHash,
  snapshotSemanticHash: pipingClassSnapshot.semanticHash,
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

function lineBinding(targetField, sourceField, unit, valueKind) {
  return {
    schema: COMMON_ENRICHED_LINE_LIST_FIELD_BINDING_SCHEMA,
    targetField,
    sourceField,
    unit,
    valueKind,
  };
}

function pipingBinding(targetField, sourceField, unit, valueKind) {
  return {
    schema: COMMON_ENRICHED_PIPING_CLASS_FIELD_BINDING_SCHEMA,
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
