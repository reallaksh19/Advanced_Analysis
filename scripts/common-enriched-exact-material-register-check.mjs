import assert from 'node:assert/strict';
import {
  COMMON_ENRICHED_LINE_LIST_FIELD_BINDING_SCHEMA,
  COMMON_ENRICHED_LINE_LIST_RESOLUTION_SCHEMA,
  COMMON_ENRICHED_MATERIAL_FIELD_BINDING_SCHEMA,
  COMMON_ENRICHED_MATERIAL_KEY_CONFIG_SCHEMA,
  COMMON_ENRICHED_MATERIAL_RESOLUTION_SCHEMA,
  COMMON_ENRICHED_PIPING_CLASS_FIELD_BINDING_SCHEMA,
  COMMON_ENRICHED_PIPING_CLASS_KEY_CONFIG_SCHEMA,
  COMMON_ENRICHED_PIPING_CLASS_RESOLUTION_SCHEMA,
  COMMON_ENRICHED_TARGET_INVENTORY_SCHEMA,
  ENGINEERING_MASTER_RECORD_SCHEMA,
  ENGINEERING_MASTER_SNAPSHOT_SCHEMA,
  createCommonEnrichedLineListResolution,
  createCommonEnrichedMaterialResolution,
  createCommonEnrichedPipingClassResolution,
  createCommonEnrichedTargetInventory,
  createEngineeringMasterSnapshot,
  requireCommonEnrichedMaterialResolution,
} from '../src/core/common-enriched-properties/index.js';
import {
  createSharedPipingModel,
  semanticHash,
} from '../src/core/shared-piping-model/index.js';

const LINE_LIST_HASH = 'a'.repeat(64);
const PIPING_CLASS_HASH = 'b'.repeat(64);
const MATERIAL_HASH = 'c'.repeat(64);
const CAPTURED_AT = '2026-08-02T17:55:00.000Z';

const sharedModel = createSharedPipingModel({
  project: { datasetId: 'ENR-MATERIAL-P5', name: 'Phase 5 material fixture', sourceName: 'synthetic.json' },
  units: { length: 'mm', force: 'N', mass: 'kg' },
  sourceSnapshotRef: {
    schema: 'source-package-snapshot/v1',
    datasetId: 'ENR-MATERIAL-P5',
    sourceSchema: 'synthetic-shared-model/v1',
    sourceSemanticHash: semanticHash({ source: 'ENR-MATERIAL-P5' }),
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
    component('C-800', 'S800'),
  ],
  supports: [],
  sourceReferences: { nodes: [] },
  diagnostics: [],
});

const inventory = createCommonEnrichedTargetInventory({
  schema: COMMON_ENRICHED_TARGET_INVENTORY_SCHEMA,
  inventoryId: 'INV-MATERIAL-P5',
  sharedModel,
});

const lineListSnapshot = createEngineeringMasterSnapshot({
  schema: ENGINEERING_MASTER_SNAPSHOT_SCHEMA,
  snapshotId: 'SNAP-LINE-LIST-P5',
  sourceKind: 'LINE_LIST',
  sourceKey: 'lineList',
  sourceHash: LINE_LIST_HASH,
  capturedAt: CAPTURED_AT,
  mappingSemanticHash: semanticHash({
    lineKey: 'lineKey', pipingClass: 'pipingClass', nominalBoreMm: 'nominalBoreMm', schedule: 'schedule',
  }),
  records: [
    lineRow('LL-001', 'S100', 'M1', 100),
    lineRow('LL-002', 'S200', 'M2', 200),
    lineRow('LL-003', 'S300', 'M3', 300),
    lineRow('LL-004', 'S400', 'M4', 400),
    lineRow('LL-005', 's400', 'M4', 400),
    lineRow('LL-006', 'S500', 'M5', 500),
    lineRow('LL-007', 'S600', 'M6', 600),
    lineRow('LL-008', 'S700', 'M7', 700),
    lineRow('LL-009', 'S800', 'M8', 800),
  ],
  metadata: { fileName: 'synthetic-line-list.xlsx', sheet: 'LineList' },
});

const lineListResolution = createCommonEnrichedLineListResolution({
  schema: COMMON_ENRICHED_LINE_LIST_RESOLUTION_SCHEMA,
  resolutionId: 'RES-LINE-LIST-P5',
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
  snapshotId: 'SNAP-PCLASS-P5',
  sourceKind: 'PIPING_CLASS',
  sourceKey: 'pipingClass',
  sourceHash: PIPING_CLASS_HASH,
  capturedAt: CAPTURED_AT,
  mappingSemanticHash: semanticHash({
    pipingClass: 'pipingClass', nominalBoreMm: 'nominalBoreMm', schedule: 'schedule', materialCode: 'materialCode',
  }),
  records: [
    pipingRow('PC-001', 'M1', 100, 'A106-B'),
    pipingRow('PC-002', 'M2', 200, 'A106-B'),
    pipingRow('PC-003', 'm2', 200, 'A106-B'),
    pipingRow('PC-004', 'M5', 500, null),
    pipingRow('PC-005', 'M6', 600, 'A312-TP316'),
    pipingRow('PC-006', 'M7', 700, 'X-CONFLICT'),
    pipingRow('PC-007', 'M8', 800, 'UNKNOWN'),
  ],
  metadata: { fileName: 'synthetic-piping-class.xlsx', sheet: 'PipingClass' },
});

const pipingClassResolution = createCommonEnrichedPipingClassResolution({
  schema: COMMON_ENRICHED_PIPING_CLASS_RESOLUTION_SCHEMA,
  resolutionId: 'RES-PCLASS-P5',
  lineListResolution,
  snapshot: pipingClassSnapshot,
  keyConfig: {
    schema: COMMON_ENRICHED_PIPING_CLASS_KEY_CONFIG_SCHEMA,
    targetClassField: 'spec.pipingClass',
    targetBoreField: 'spec.nominalBoreMm',
    targetScheduleField: 'spec.schedule',
    sourceClassField: 'pipingClass',
    sourceBoreField: 'nominalBoreMm',
    sourceScheduleField: 'schedule',
  },
  bindings: [
    pipingBinding('material.materialCode', 'materialCode', null, 'STRING'),
  ],
});

const materialSnapshot = createEngineeringMasterSnapshot({
  schema: ENGINEERING_MASTER_SNAPSHOT_SCHEMA,
  snapshotId: 'SNAP-MATERIAL-P5',
  sourceKind: 'MATERIAL_REGISTER',
  sourceKey: 'materialRegister',
  sourceHash: MATERIAL_HASH,
  capturedAt: CAPTURED_AT,
  mappingSemanticHash: semanticHash({
    materialCode: 'materialCode', description: 'description', densityKgM3: 'densityKgM3', elasticModulusGpa: 'elasticModulusGpa',
  }),
  records: [
    row('MAT-001', 'Material!1', {
      materialCode: ' a106-b ', description: 'Carbon steel ASTM A106 Grade B', densityKgM3: 7850, elasticModulusGpa: 200,
    }),
    row('MAT-002', 'Material!2', {
      materialCode: 'A312-TP316', description: 'Stainless steel ASTM A312 TP316', densityKgM3: 8000, elasticModulusGpa: 193,
    }),
    row('MAT-003', 'Material!3', {
      materialCode: 'a312-tp316', description: 'Stainless steel ASTM A312 TP316', densityKgM3: 8000, elasticModulusGpa: 193,
    }),
    row('MAT-004', 'Material!4', {
      materialCode: 'X-CONFLICT', description: 'Synthetic conflict material', densityKgM3: '7900', elasticModulusGpa: null,
    }),
  ],
  metadata: { fileName: 'synthetic-material-register.xlsx', sheet: 'Materials' },
});

const keyConfig = {
  schema: COMMON_ENRICHED_MATERIAL_KEY_CONFIG_SCHEMA,
  targetMaterialCodeField: 'material.materialCode',
  sourceMaterialCodeField: 'materialCode',
};
const bindings = [
  materialBinding('material.description', 'description', null, 'STRING'),
  materialBinding('material.densityKgM3', 'densityKgM3', 'kg/m3', 'NUMBER'),
  materialBinding('material.elasticModulusGpa', 'elasticModulusGpa', 'GPa', 'NUMBER'),
];
const input = {
  schema: COMMON_ENRICHED_MATERIAL_RESOLUTION_SCHEMA,
  resolutionId: 'RES-MATERIAL-P5',
  pipingClassResolution,
  snapshot: materialSnapshot,
  keyConfig,
  bindings,
};

const first = createCommonEnrichedMaterialResolution(input);
const second = createCommonEnrichedMaterialResolution(input);
assert.deepEqual(first, second, 'repeated material resolution must be deterministic');
assert.deepEqual(requireCommonEnrichedMaterialResolution(first), first);
assert.ok(Object.isFrozen(first));
assert.ok(Object.isFrozen(first.targetRecords[0].fields));
assert.deepEqual(first.summary, {
  lineTargetCount: 8,
  exactKeyCount: 4,
  blockedKeyCount: 4,
  missingRowCount: 1,
  ambiguousRowCount: 1,
  exactFieldCount: 4,
  blockedFieldCount: 20,
  conflictFieldCount: 1,
});

const byLine = Object.fromEntries(first.targetRecords.map((record) => [record.lineKey, record]));
assert.ok(byLine.S100.fields.every((entry) => entry.status === 'RESOLVED_EXACT'));
assert.equal(field(byLine.S100, 'material.densityKgM3').value, 7850);
assert.ok(byLine.S200.fields.every((entry) => entry.status === 'BLOCKED_AMBIGUOUS'));
assert.ok(byLine.S200.fields.every((entry) => entry.diagnostics.includes('MATERIAL_REGISTER_KEY_BLOCKED')));
assert.ok(byLine.S300.fields.every((entry) => entry.status === 'BLOCKED_MISSING'));
assert.ok(byLine.S400.fields.every((entry) => entry.status === 'BLOCKED_AMBIGUOUS'));
assert.ok(byLine.S500.fields.every((entry) => entry.status === 'BLOCKED_MISSING'));
assert.ok(byLine.S600.fields.every((entry) => entry.status === 'BLOCKED_AMBIGUOUS'));
assert.ok(byLine.S600.fields.every((entry) => entry.matchMethod === 'EXACT_MATERIAL_CODE_MULTIPLE_ROWS'));
assert.equal(field(byLine.S700, 'material.description').status, 'RESOLVED_EXACT');
assert.equal(field(byLine.S700, 'material.densityKgM3').status, 'BLOCKED_CONFLICT');
assert.equal(field(byLine.S700, 'material.elasticModulusGpa').status, 'BLOCKED_MISSING');
assert.ok(byLine.S800.fields.every((entry) => entry.status === 'BLOCKED_MISSING'));
assert.ok(byLine.S800.fields.every((entry) => entry.diagnostics.includes('MATERIAL_REGISTER_EXACT_ROW_MISSING')));

expectCode(
  () => createCommonEnrichedMaterialResolution({ ...input, bindings: [] }),
  'COMMON_ENRICHED_MATERIAL_BINDINGS_REQUIRED',
);
expectCode(
  () => createCommonEnrichedMaterialResolution({
    ...input,
    snapshot: createEngineeringMasterSnapshot({
      ...withoutSemanticHash(materialSnapshot),
      snapshotId: 'WRONG-SOURCE-KIND-P5',
      sourceKind: 'PIPING_CLASS',
    }),
  }),
  'COMMON_ENRICHED_MATERIAL_SOURCE_INVALID',
);
expectCode(
  () => createCommonEnrichedMaterialResolution({
    ...input,
    snapshot: createEngineeringMasterSnapshot({
      ...withoutSemanticHash(materialSnapshot),
      snapshotId: 'INVALID-MATERIAL-KEY-P5',
      records: [row('MAT-001', 'Material!1', {
        materialCode: null, description: 'Invalid', densityKgM3: 7850, elasticModulusGpa: 200,
      })],
    }),
  }),
  'COMMON_ENRICHED_MATERIAL_RECORD_INVALID',
);
expectCode(
  () => requireCommonEnrichedMaterialResolution({ ...first, resolutionId: 'TAMPERED' }),
  'COMMON_ENRICHED_HASH_MISMATCH',
);
expectCode(
  () => requireCommonEnrichedMaterialResolution({
    ...first,
    summary: { ...first.summary, exactFieldCount: first.summary.exactFieldCount + 1 },
  }),
  'COMMON_ENRICHED_SUMMARY_MISMATCH',
);

assert.equal(pipingClassResolution.semanticHash, input.pipingClassResolution.semanticHash);
assert.equal(materialSnapshot.semanticHash, input.snapshot.semanticHash);

console.log('PASS common enriched exact material-register resolution checks');
console.log(JSON.stringify({
  pipingClassResolutionSemanticHash: pipingClassResolution.semanticHash,
  snapshotSemanticHash: materialSnapshot.semanticHash,
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

function lineRow(recordId, lineKey, pipingClass, nominalBoreMm) {
  return row(recordId, `LineList!${recordId}`, {
    lineKey, pipingClass, nominalBoreMm, schedule: 'SCH40',
  });
}

function pipingRow(recordId, pipingClass, nominalBoreMm, materialCode) {
  return row(recordId, `PipingClass!${recordId}`, {
    pipingClass, nominalBoreMm, schedule: 'SCH40', materialCode,
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

function pipingBinding(targetField, sourceField, unit, valueKind) {
  return {
    schema: COMMON_ENRICHED_PIPING_CLASS_FIELD_BINDING_SCHEMA,
    targetField,
    sourceField,
    unit,
    valueKind,
  };
}

function materialBinding(targetField, sourceField, unit, valueKind) {
  return {
    schema: COMMON_ENRICHED_MATERIAL_FIELD_BINDING_SCHEMA,
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
