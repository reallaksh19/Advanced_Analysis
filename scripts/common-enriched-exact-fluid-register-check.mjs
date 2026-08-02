import assert from 'node:assert/strict';
import {
  COMMON_ENRICHED_FLUID_FIELD_BINDING_SCHEMA,
  COMMON_ENRICHED_FLUID_KEY_CONFIG_SCHEMA,
  COMMON_ENRICHED_FLUID_RESOLUTION_SCHEMA,
  COMMON_ENRICHED_LINE_LIST_FIELD_BINDING_SCHEMA,
  COMMON_ENRICHED_LINE_LIST_RESOLUTION_SCHEMA,
  COMMON_ENRICHED_TARGET_INVENTORY_SCHEMA,
  ENGINEERING_MASTER_RECORD_SCHEMA,
  ENGINEERING_MASTER_SNAPSHOT_SCHEMA,
  createCommonEnrichedFluidResolution,
  createCommonEnrichedLineListResolution,
  createCommonEnrichedTargetInventory,
  createEngineeringMasterSnapshot,
  requireCommonEnrichedFluidResolution,
} from '../src/core/common-enriched-properties/index.js';
import {
  createSharedPipingModel,
  semanticHash,
} from '../src/core/shared-piping-model/index.js';

const LINE_LIST_HASH = 'a'.repeat(64);
const FLUID_HASH = 'd'.repeat(64);
const CAPTURED_AT = '2026-08-02T18:10:00.000Z';

const sharedModel = createSharedPipingModel({
  project: { datasetId: 'ENR-FLUID-P6', name: 'Phase 6 fluid fixture', sourceName: 'synthetic.json' },
  units: { length: 'mm', force: 'N', mass: 'kg' },
  sourceSnapshotRef: {
    schema: 'source-package-snapshot/v1',
    datasetId: 'ENR-FLUID-P6',
    sourceSchema: 'synthetic-shared-model/v1',
    sourceSemanticHash: semanticHash({ source: 'ENR-FLUID-P6' }),
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
  inventoryId: 'INV-FLUID-P6',
  sharedModel,
});

const lineListSnapshot = createEngineeringMasterSnapshot({
  schema: ENGINEERING_MASTER_SNAPSHOT_SCHEMA,
  snapshotId: 'SNAP-LINE-LIST-P6',
  sourceKind: 'LINE_LIST',
  sourceKey: 'lineList',
  sourceHash: LINE_LIST_HASH,
  capturedAt: CAPTURED_AT,
  mappingSemanticHash: semanticHash({ lineKey: 'lineKey', fluidCode: 'fluidCode' }),
  records: [
    lineRow('LL-001', 'S100', ' water '),
    lineRow('LL-002', 'S200', 'OIL'),
    lineRow('LL-003', 'S300', 'GAS'),
    lineRow('LL-004', 'S400', 'STEAM'),
    lineRow('LL-005', 's400', 'WATER'),
    lineRow('LL-006', 'S500', null),
    lineRow('LL-007', 'S600', 'CONFLICT'),
    lineRow('LL-008', 'S700', 'STEAM'),
  ],
  metadata: { fileName: 'synthetic-line-list.xlsx', sheet: 'LineList' },
});

const lineListResolution = createCommonEnrichedLineListResolution({
  schema: COMMON_ENRICHED_LINE_LIST_RESOLUTION_SCHEMA,
  resolutionId: 'RES-LINE-LIST-P6',
  inventory,
  snapshot: lineListSnapshot,
  bindings: [lineBinding('process.fluidCode', 'fluidCode', null, 'STRING')],
});

const fluidSnapshot = createEngineeringMasterSnapshot({
  schema: ENGINEERING_MASTER_SNAPSHOT_SCHEMA,
  snapshotId: 'SNAP-FLUID-P6',
  sourceKind: 'FLUID_REGISTER',
  sourceKey: 'fluidRegister',
  sourceHash: FLUID_HASH,
  capturedAt: CAPTURED_AT,
  mappingSemanticHash: semanticHash({
    fluidCode: 'fluidCode', description: 'description', densityKgM3: 'densityKgM3', dynamicViscosityMpaS: 'dynamicViscosityMpaS',
  }),
  records: [
    row('FL-001', 'Fluid!1', {
      fluidCode: 'WATER', description: 'Water', densityKgM3: 998.2, dynamicViscosityMpaS: 1.002,
    }),
    row('FL-002', 'Fluid!2', {
      fluidCode: 'OIL', description: 'Synthetic oil', densityKgM3: 850, dynamicViscosityMpaS: 32,
    }),
    row('FL-003', 'Fluid!3', {
      fluidCode: ' oil ', description: 'Synthetic oil', densityKgM3: 850, dynamicViscosityMpaS: 32,
    }),
    row('FL-004', 'Fluid!4', {
      fluidCode: 'CONFLICT', description: 'Conflict fluid', densityKgM3: '900', dynamicViscosityMpaS: null,
    }),
    row('FL-005', 'Fluid!5', {
      fluidCode: 'STEAM', description: 'Steam', densityKgM3: 0.6, dynamicViscosityMpaS: 0.013,
    }),
  ],
  metadata: { fileName: 'synthetic-fluid-register.xlsx', sheet: 'Fluids' },
});

const keyConfig = {
  schema: COMMON_ENRICHED_FLUID_KEY_CONFIG_SCHEMA,
  targetFluidCodeField: 'process.fluidCode',
  sourceFluidCodeField: 'fluidCode',
};
const bindings = [
  fluidBinding('fluid.description', 'description', null, 'STRING'),
  fluidBinding('fluid.densityKgM3', 'densityKgM3', 'kg/m3', 'NUMBER'),
  fluidBinding('fluid.dynamicViscosityMpaS', 'dynamicViscosityMpaS', 'mPa.s', 'NUMBER'),
];
const input = {
  schema: COMMON_ENRICHED_FLUID_RESOLUTION_SCHEMA,
  resolutionId: 'RES-FLUID-P6',
  lineListResolution,
  snapshot: fluidSnapshot,
  keyConfig,
  bindings,
};

const first = createCommonEnrichedFluidResolution(input);
const second = createCommonEnrichedFluidResolution(input);
assert.deepEqual(first, second, 'repeated fluid resolution must be deterministic');
assert.deepEqual(requireCommonEnrichedFluidResolution(first), first);
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
assert.equal(field(byLine.S100, 'fluid.densityKgM3').value, 998.2);
assert.ok(byLine.S200.fields.every((entry) => entry.status === 'BLOCKED_AMBIGUOUS'));
assert.ok(byLine.S200.fields.every((entry) => entry.matchMethod === 'EXACT_FLUID_CODE_MULTIPLE_ROWS'));
assert.ok(byLine.S300.fields.every((entry) => entry.status === 'BLOCKED_MISSING'));
assert.ok(byLine.S300.fields.every((entry) => entry.diagnostics.includes('FLUID_REGISTER_EXACT_ROW_MISSING')));
assert.ok(byLine.S400.fields.every((entry) => entry.status === 'BLOCKED_AMBIGUOUS'));
assert.ok(byLine.S400.fields.every((entry) => entry.diagnostics.includes('FLUID_REGISTER_KEY_BLOCKED')));
assert.ok(byLine.S500.fields.every((entry) => entry.status === 'BLOCKED_MISSING'));
assert.ok(byLine.S500.fields.every((entry) => entry.diagnostics.includes('FLUID_REGISTER_KEY_BLOCKED')));
assert.equal(field(byLine.S600, 'fluid.description').status, 'RESOLVED_EXACT');
assert.equal(field(byLine.S600, 'fluid.densityKgM3').status, 'BLOCKED_CONFLICT');
assert.equal(field(byLine.S600, 'fluid.dynamicViscosityMpaS').status, 'BLOCKED_MISSING');
assert.ok(byLine.S700.fields.every((entry) => entry.status === 'RESOLVED_EXACT'));

expectCode(
  () => createCommonEnrichedFluidResolution({ ...input, bindings: [] }),
  'COMMON_ENRICHED_FLUID_BINDINGS_REQUIRED',
);
expectCode(
  () => createCommonEnrichedFluidResolution({
    ...input,
    snapshot: createEngineeringMasterSnapshot({
      ...withoutSemanticHash(fluidSnapshot),
      snapshotId: 'WRONG-SOURCE-KIND-P6',
      sourceKind: 'MATERIAL_REGISTER',
    }),
  }),
  'COMMON_ENRICHED_FLUID_SOURCE_INVALID',
);
expectCode(
  () => createCommonEnrichedFluidResolution({
    ...input,
    snapshot: createEngineeringMasterSnapshot({
      ...withoutSemanticHash(fluidSnapshot),
      snapshotId: 'INVALID-FLUID-KEY-P6',
      records: [row('FL-001', 'Fluid!1', {
        fluidCode: null, description: 'Invalid', densityKgM3: 998.2, dynamicViscosityMpaS: 1.002,
      })],
    }),
  }),
  'COMMON_ENRICHED_FLUID_RECORD_INVALID',
);
expectCode(
  () => requireCommonEnrichedFluidResolution({ ...first, resolutionId: 'TAMPERED' }),
  'COMMON_ENRICHED_HASH_MISMATCH',
);
expectCode(
  () => requireCommonEnrichedFluidResolution({
    ...first,
    summary: { ...first.summary, exactFieldCount: first.summary.exactFieldCount + 1 },
  }),
  'COMMON_ENRICHED_SUMMARY_MISMATCH',
);

assert.equal(lineListResolution.semanticHash, input.lineListResolution.semanticHash);
assert.equal(fluidSnapshot.semanticHash, input.snapshot.semanticHash);

console.log('PASS common enriched exact fluid-register resolution checks');
console.log(JSON.stringify({
  lineListResolutionSemanticHash: lineListResolution.semanticHash,
  snapshotSemanticHash: fluidSnapshot.semanticHash,
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

function lineRow(recordId, lineKey, fluidCode) {
  return row(recordId, `LineList!${recordId}`, { lineKey, fluidCode });
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

function fluidBinding(targetField, sourceField, unit, valueKind) {
  return {
    schema: COMMON_ENRICHED_FLUID_FIELD_BINDING_SCHEMA,
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
