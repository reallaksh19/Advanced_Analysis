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

const capturedAt = '2026-08-08T06:42:00.000Z';
const sharedModel = createSharedPipingModel({
  project: {
    datasetId: 'ENR-P5B-FLUID-CONTRACT',
    name: 'Package 5B fluid resolver contract fixture',
    sourceName: 'synthetic.json',
  },
  units: { length: 'mm', force: 'N', mass: 'kg' },
  sourceSnapshotRef: {
    schema: 'source-package-snapshot/v1',
    datasetId: 'ENR-P5B-FLUID-CONTRACT',
    sourceSchema: 'synthetic-shared-model/v1',
    sourceSemanticHash: semanticHash({ source: 'ENR-P5B-FLUID-CONTRACT' }),
    sourceByteHash: null,
  },
  components: [component('PIPE-1', 'L-1')],
  supports: [],
  sourceReferences: { nodes: [] },
  diagnostics: [],
});

const inventory = createCommonEnrichedTargetInventory({
  schema: COMMON_ENRICHED_TARGET_INVENTORY_SCHEMA,
  inventoryId: 'INV-P5B-FLUID-CONTRACT',
  sharedModel,
});
const lineListSnapshot = createEngineeringMasterSnapshot({
  schema: ENGINEERING_MASTER_SNAPSHOT_SCHEMA,
  snapshotId: 'SNAP-P5B-LINE-LIST',
  sourceKind: 'LINE_LIST',
  sourceKey: 'lineList',
  sourceHash: 'a'.repeat(64),
  capturedAt,
  mappingSemanticHash: semanticHash({ lineKey: 'lineKey', fluidCode: 'fluidCode' }),
  records: [masterRecord('LL-1', 'LineList!1', { lineKey: 'L-1', fluidCode: ' WATER ' })],
  metadata: { fileName: 'line-list.xlsx', sheet: 'LineList' },
});
const lineListResolution = createCommonEnrichedLineListResolution({
  schema: COMMON_ENRICHED_LINE_LIST_RESOLUTION_SCHEMA,
  resolutionId: 'RES-P5B-LINE-LIST',
  inventory,
  snapshot: lineListSnapshot,
  bindings: [{
    schema: COMMON_ENRICHED_LINE_LIST_FIELD_BINDING_SCHEMA,
    targetField: 'process.fluidCode',
    sourceField: 'fluidCode',
    unit: null,
    valueKind: 'STRING',
  }],
});
const fluidSnapshot = createEngineeringMasterSnapshot({
  schema: ENGINEERING_MASTER_SNAPSHOT_SCHEMA,
  snapshotId: 'SNAP-P5B-FLUID',
  sourceKind: 'FLUID_REGISTER',
  sourceKey: 'fluidRegister',
  sourceHash: 'd'.repeat(64),
  capturedAt,
  mappingSemanticHash: semanticHash({
    fluidCode: 'fluidCode',
    densityKgM3: 'densityKgM3',
    description: 'description',
    dynamicViscosityMpaS: 'dynamicViscosityMpaS',
  }),
  records: [masterRecord('FL-1', 'Fluids!1', {
    fluidCode: 'WATER',
    densityKgM3: 1000,
    description: 'Water',
    dynamicViscosityMpaS: 1.002,
  })],
  metadata: { fileName: 'fluid-register.xlsx', sheet: 'Fluids' },
});
const bindings = [
  fluidBinding('fluid.densityKgM3', 'densityKgM3', 'kg/m3', 'NUMBER'),
  fluidBinding('fluid.description', 'description', null, 'STRING'),
  fluidBinding('fluid.dynamicViscosityMpaS', 'dynamicViscosityMpaS', 'mPa.s', 'NUMBER'),
];
const input = {
  schema: COMMON_ENRICHED_FLUID_RESOLUTION_SCHEMA,
  resolutionId: 'RES-P5B-FLUID',
  lineListResolution,
  snapshot: fluidSnapshot,
  keyConfig: {
    schema: COMMON_ENRICHED_FLUID_KEY_CONFIG_SCHEMA,
    targetFluidCodeField: 'process.fluidCode',
    sourceFluidCodeField: 'fluidCode',
  },
  bindings,
};

const first = createCommonEnrichedFluidResolution(input);
const second = createCommonEnrichedFluidResolution(input);
assert.deepEqual(first, second, 'canonical fluid resolution must be deterministic');
assert.deepEqual(requireCommonEnrichedFluidResolution(first), first);
assert.deepEqual(bindings.map((row) => row.targetField), [
  'fluid.densityKgM3',
  'fluid.description',
  'fluid.dynamicViscosityMpaS',
]);
assert.equal(first.summary.lineTargetCount, 1);
assert.equal(first.summary.exactKeyCount, 1);
assert.equal(first.summary.blockedKeyCount, 0);
assert.equal(first.summary.exactFieldCount, 3);
assert.equal(first.summary.blockedFieldCount, 0);
const target = first.targetRecords[0];
const density = target.fields.find((row) => row.field === 'fluid.densityKgM3');
assert.equal(target.lineKey, 'L-1');
assert.equal(density.status, 'RESOLVED_EXACT');
assert.equal(density.value, 1000);
assert.equal(density.unit, 'kg/m3');
assert.equal(density.approved, true);
assert.equal(density.evidence.sourceKind, 'FLUID_REGISTER');
assert.equal(density.evidence.sourceHash, fluidSnapshot.sourceHash);

const changedSnapshot = createEngineeringMasterSnapshot({
  ...withoutSemanticHash(fluidSnapshot),
  snapshotId: 'SNAP-P5B-FLUID-CHANGED',
  sourceHash: 'e'.repeat(64),
});
const changed = createCommonEnrichedFluidResolution({
  ...input,
  resolutionId: 'RES-P5B-FLUID-CHANGED',
  snapshot: changedSnapshot,
});
assert.notEqual(changed.snapshotSemanticHash, first.snapshotSemanticHash);
assert.notEqual(changed.semanticHash, first.semanticHash);

assert.throws(
  () => createCommonEnrichedFluidResolution({
    ...input,
    bindings: [bindings[1], bindings[0], bindings[2]],
  }),
  (error) => error?.code === 'COMMON_ENRICHED_ORDER_INVALID',
  'non-canonical binding order must fail closed',
);

console.log(JSON.stringify({
  check: 'enrichment-package5b-fluid-resolution-contract',
  status: 'PASS',
  resolutionSemanticHash: first.semanticHash,
  snapshotSemanticHash: first.snapshotSemanticHash,
  resolvedLineKey: target.lineKey,
  resolvedDensityKgPerM3: density.value,
  canonicalBindingOrder: bindings.map((row) => row.targetField),
  sourceChangeInvalidatesResolutionIdentity: true,
  nonCanonicalOrderFailsClosed: true,
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

function masterRecord(recordId, locator, values) {
  return { schema: ENGINEERING_MASTER_RECORD_SCHEMA, recordId, locator, values };
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

function withoutSemanticHash(value) {
  const { semanticHash: _semanticHash, ...rest } = value;
  return structuredClone(rest);
}
