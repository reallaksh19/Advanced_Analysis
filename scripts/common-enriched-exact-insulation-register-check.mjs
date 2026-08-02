import assert from 'node:assert/strict';
import {
  COMMON_ENRICHED_INSULATION_FIELD_BINDING_SCHEMA,
  COMMON_ENRICHED_INSULATION_KEY_CONFIG_SCHEMA,
  COMMON_ENRICHED_INSULATION_RESOLUTION_SCHEMA,
  COMMON_ENRICHED_LINE_LIST_FIELD_BINDING_SCHEMA,
  COMMON_ENRICHED_LINE_LIST_RESOLUTION_SCHEMA,
  COMMON_ENRICHED_TARGET_INVENTORY_SCHEMA,
  ENGINEERING_MASTER_RECORD_SCHEMA,
  ENGINEERING_MASTER_SNAPSHOT_SCHEMA,
  createCommonEnrichedInsulationResolution,
  createCommonEnrichedLineListResolution,
  createCommonEnrichedTargetInventory,
  createEngineeringMasterSnapshot,
  requireCommonEnrichedInsulationResolution,
} from '../src/core/common-enriched-properties/index.js';
import {
  createSharedPipingModel,
  semanticHash,
} from '../src/core/shared-piping-model/index.js';

const LINE_LIST_HASH = 'a'.repeat(64);
const INSULATION_HASH = 'e'.repeat(64);
const CAPTURED_AT = '2026-08-02T18:20:00.000Z';

const sharedModel = createSharedPipingModel({
  project: { datasetId: 'ENR-INSULATION-P7', name: 'Phase 7 insulation fixture', sourceName: 'synthetic.json' },
  units: { length: 'mm', force: 'N', mass: 'kg' },
  sourceSnapshotRef: {
    schema: 'source-package-snapshot/v1',
    datasetId: 'ENR-INSULATION-P7',
    sourceSchema: 'synthetic-shared-model/v1',
    sourceSemanticHash: semanticHash({ source: 'ENR-INSULATION-P7' }),
    sourceByteHash: null,
  },
  components: [
    component('C-100', 'S100'),
    component('C-200', 'S200'),
    component('C-300', 'S300'),
    component('C-400', 'S400'),
    component('C-500', 'S500'),
    component('C-600', 'S600'),
    component('C-700', 'S700'),
  ],
  supports: [],
  sourceReferences: { nodes: [] },
  diagnostics: [],
});

const inventory = createCommonEnrichedTargetInventory({
  schema: COMMON_ENRICHED_TARGET_INVENTORY_SCHEMA,
  inventoryId: 'INV-INSULATION-P7',
  sharedModel,
});

const lineListSnapshot = createEngineeringMasterSnapshot({
  schema: ENGINEERING_MASTER_SNAPSHOT_SCHEMA,
  snapshotId: 'SNAP-LINE-LIST-P7',
  sourceKind: 'LINE_LIST',
  sourceKey: 'lineList',
  sourceHash: LINE_LIST_HASH,
  capturedAt: CAPTURED_AT,
  mappingSemanticHash: semanticHash({ lineKey: 'lineKey', insulationCode: 'insulationCode' }),
  records: [
    lineRow('LL-001', 'S100', ' ins-a '),
    lineRow('LL-002', 'S200', 'INS-B'),
    lineRow('LL-003', 'S300', 'INS-C'),
    lineRow('LL-004', 'S400', 'INS-D'),
    lineRow('LL-005', 's400', 'INS-A'),
    lineRow('LL-006', 'S500', null),
    lineRow('LL-007', 'S600', 'INS-X'),
    lineRow('LL-008', 'S700', 'INS-D'),
  ],
  metadata: { fileName: 'synthetic-line-list.xlsx', sheet: 'LineList' },
});

const lineListResolution = createCommonEnrichedLineListResolution({
  schema: COMMON_ENRICHED_LINE_LIST_RESOLUTION_SCHEMA,
  resolutionId: 'RES-LINE-LIST-P7',
  inventory,
  snapshot: lineListSnapshot,
  bindings: [lineBinding('process.insulationCode', 'insulationCode', null, 'STRING')],
});

const insulationSnapshot = createEngineeringMasterSnapshot({
  schema: ENGINEERING_MASTER_SNAPSHOT_SCHEMA,
  snapshotId: 'SNAP-INSULATION-P7',
  sourceKind: 'INSULATION_REGISTER',
  sourceKey: 'insulationRegister',
  sourceHash: INSULATION_HASH,
  capturedAt: CAPTURED_AT,
  mappingSemanticHash: semanticHash({
    insulationCode: 'insulationCode', description: 'description', densityKgM3: 'densityKgM3', thicknessMm: 'thicknessMm',
  }),
  records: [
    row('INS-001', 'InsulationMaster!1', {
      insulationCode: 'INS-A', description: 'Mineral wool', densityKgM3: 120, thicknessMm: 50,
    }),
    row('INS-002', 'InsulationMaster!2', {
      insulationCode: 'INS-B', description: 'Calcium silicate', densityKgM3: 200, thicknessMm: 40,
    }),
    row('INS-003', 'InsulationMaster!3', {
      insulationCode: ' ins-b ', description: 'Calcium silicate', densityKgM3: 200, thicknessMm: 40,
    }),
    row('INS-004', 'InsulationMaster!4', {
      insulationCode: 'INS-X', description: 'Conflict insulation', densityKgM3: '150', thicknessMm: null,
    }),
    row('INS-005', 'InsulationMaster!5', {
      insulationCode: 'INS-D', description: 'Foam glass', densityKgM3: 90, thicknessMm: 25,
    }),
  ],
  metadata: { fileName: 'synthetic-insulation-register.xlsx', sheet: 'Insulation' },
});

const keyConfig = {
  schema: COMMON_ENRICHED_INSULATION_KEY_CONFIG_SCHEMA,
  targetInsulationCodeField: 'process.insulationCode',
  sourceInsulationCodeField: 'insulationCode',
};
const bindings = [
  insulationBinding('insulation.description', 'description', null, 'STRING'),
  insulationBinding('insulation.densityKgM3', 'densityKgM3', 'kg/m3', 'NUMBER'),
  insulationBinding('insulation.thicknessMm', 'thicknessMm', 'mm', 'NUMBER'),
];
const input = {
  schema: COMMON_ENRICHED_INSULATION_RESOLUTION_SCHEMA,
  resolutionId: 'RES-INSULATION-P7',
  lineListResolution,
  snapshot: insulationSnapshot,
  keyConfig,
  bindings,
};

const first = createCommonEnrichedInsulationResolution(input);
const second = createCommonEnrichedInsulationResolution(input);
assert.deepEqual(first, second, 'repeated insulation resolution must be deterministic');
assert.deepEqual(requireCommonEnrichedInsulationResolution(first), first);
assert.ok(Object.isFrozen(first));
assert.ok(Object.isFrozen(first.targetRecords[0].fields));
assert.deepEqual(first.summary, {
  lineTargetCount: 7,
  exactKeyCount: 5,
  blockedKeyCount: 2,
  missingRowCount: 1,
  ambiguousRowCount: 1,
  exactFieldCount: 7,
  blockedFieldCount: 14,
  conflictFieldCount: 1,
});

const byLine = Object.fromEntries(first.targetRecords.map((record) => [record.lineKey, record]));
assert.ok(byLine.S100.fields.every((entry) => entry.status === 'RESOLVED_EXACT'));
assert.equal(field(byLine.S100, 'insulation.densityKgM3').value, 120);
assert.ok(byLine.S200.fields.every((entry) => entry.status === 'BLOCKED_AMBIGUOUS'));
assert.ok(byLine.S200.fields.every((entry) => entry.matchMethod === 'EXACT_INSULATION_CODE_MULTIPLE_ROWS'));
assert.ok(byLine.S300.fields.every((entry) => entry.status === 'BLOCKED_MISSING'));
assert.ok(byLine.S300.fields.every((entry) => entry.diagnostics.includes('INSULATION_REGISTER_EXACT_ROW_MISSING')));
assert.ok(byLine.S400.fields.every((entry) => entry.status === 'BLOCKED_AMBIGUOUS'));
assert.ok(byLine.S400.fields.every((entry) => entry.diagnostics.includes('INSULATION_REGISTER_KEY_BLOCKED')));
assert.ok(byLine.S500.fields.every((entry) => entry.status === 'BLOCKED_MISSING'));
assert.ok(byLine.S500.fields.every((entry) => entry.diagnostics.includes('INSULATION_REGISTER_KEY_BLOCKED')));
assert.equal(field(byLine.S600, 'insulation.description').status, 'RESOLVED_EXACT');
assert.equal(field(byLine.S600, 'insulation.densityKgM3').status, 'BLOCKED_CONFLICT');
assert.equal(field(byLine.S600, 'insulation.thicknessMm').status, 'BLOCKED_MISSING');
assert.ok(byLine.S700.fields.every((entry) => entry.status === 'RESOLVED_EXACT'));

expectCode(
  () => createCommonEnrichedInsulationResolution({ ...input, bindings: [] }),
  'COMMON_ENRICHED_INSULATION_BINDINGS_REQUIRED',
);
expectCode(
  () => createCommonEnrichedInsulationResolution({
    ...input,
    snapshot: createEngineeringMasterSnapshot({
      ...withoutSemanticHash(insulationSnapshot),
      snapshotId: 'WRONG-SOURCE-KIND-P7',
      sourceKind: 'MATERIAL_REGISTER',
    }),
  }),
  'COMMON_ENRICHED_INSULATION_SOURCE_INVALID',
);
expectCode(
  () => createCommonEnrichedInsulationResolution({
    ...input,
    snapshot: createEngineeringMasterSnapshot({
      ...withoutSemanticHash(insulationSnapshot),
      snapshotId: 'INVALID-INSULATION-KEY-P7',
      records: [row('INS-001', 'InsulationMaster!1', {
        insulationCode: null, description: 'Invalid', densityKgM3: 120, thicknessMm: 50,
      })],
    }),
  }),
  'COMMON_ENRICHED_INSULATION_RECORD_INVALID',
);
expectCode(
  () => requireCommonEnrichedInsulationResolution({ ...first, resolutionId: 'TAMPERED' }),
  'COMMON_ENRICHED_HASH_MISMATCH',
);
expectCode(
  () => requireCommonEnrichedInsulationResolution({
    ...first,
    summary: { ...first.summary, exactFieldCount: first.summary.exactFieldCount + 1 },
  }),
  'COMMON_ENRICHED_SUMMARY_MISMATCH',
);

assert.equal(lineListResolution.semanticHash, input.lineListResolution.semanticHash);
assert.equal(insulationSnapshot.semanticHash, input.snapshot.semanticHash);

console.log('PASS common enriched exact insulation-register resolution checks');
console.log(JSON.stringify({
  lineListResolutionSemanticHash: lineListResolution.semanticHash,
  snapshotSemanticHash: insulationSnapshot.semanticHash,
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

function lineRow(recordId, lineKey, insulationCode) {
  return row(recordId, `LineList!${recordId}`, { lineKey, insulationCode });
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

function insulationBinding(targetField, sourceField, unit, valueKind) {
  return {
    schema: COMMON_ENRICHED_INSULATION_FIELD_BINDING_SCHEMA,
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
