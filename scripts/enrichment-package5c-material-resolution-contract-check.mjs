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
} from '../src/core/common-enriched-properties/index.js';
import {
  createSharedPipingModel,
  semanticHash,
} from '../src/core/shared-piping-model/index.js';
import {
  ENRICHMENT_MATERIAL_DENSITY_PROJECTION_SCHEMA,
  assertEnrichmentMaterialDensityProjection,
  buildEnrichmentMaterialDensityProjection,
} from '../src/workspace/engineering-enrichment/production-material-density-overlay.js';

const HASHES = Object.freeze({
  dataset: 'a'.repeat(64),
  lineList: 'b'.repeat(64),
  pipingClass: 'c'.repeat(64),
  material: 'd'.repeat(64),
});
const CAPTURED_AT = '2026-08-08T07:10:00.000Z';

const sharedModel = createSharedPipingModel({
  project: { datasetId: 'ENR-P5C-MATERIAL', name: 'Package 5C material fixture', sourceName: 'synthetic.json' },
  units: { length: 'mm', force: 'N', mass: 'kg' },
  sourceSnapshotRef: {
    schema: 'source-package-snapshot/v1',
    datasetId: 'ENR-P5C-MATERIAL',
    sourceSchema: 'synthetic-shared-model/v1',
    sourceSemanticHash: semanticHash({ source: 'ENR-P5C-MATERIAL' }),
    sourceByteHash: null,
  },
  components: [component('PIPE-1', 'L-1')],
  supports: [],
  sourceReferences: { nodes: [] },
  diagnostics: [],
});
const dataset = {
  schema: 'analysis-workspace-dataset/v1',
  datasetId: 'ENR-P5C-MATERIAL',
  version: 1,
  sourceSha256: HASHES.dataset,
  sharedModel,
  entities: [{ entityId: 'PIPE-1', entityType: 'PIPE', lineKey: 'L-1' }],
};
const inventory = createCommonEnrichedTargetInventory({
  schema: COMMON_ENRICHED_TARGET_INVENTORY_SCHEMA,
  inventoryId: 'INV-P5C',
  sharedModel,
});
const lineListSnapshot = snapshot('SNAP-LINE-P5C', 'LINE_LIST', 'lineList', HASHES.lineList, [
  row('LINE-1', 'LineList!1', { lineKey: 'L-1', pipingClass: 'PC-1', nominalBoreMm: 100, schedule: 'SCH40' }),
]);
const lineListResolution = createCommonEnrichedLineListResolution({
  schema: COMMON_ENRICHED_LINE_LIST_RESOLUTION_SCHEMA,
  resolutionId: 'RES-LINE-P5C',
  inventory,
  snapshot: lineListSnapshot,
  bindings: [
    lineBinding('spec.nominalBoreMm', 'nominalBoreMm', 'mm', 'NUMBER'),
    lineBinding('spec.pipingClass', 'pipingClass', null, 'STRING'),
    lineBinding('spec.schedule', 'schedule', null, 'STRING'),
  ],
});
const pipingClassSnapshot = snapshot('SNAP-PC-P5C', 'PIPING_CLASS', 'pipingClass', HASHES.pipingClass, [
  row('PC-1', 'PipingClass!1', {
    pipingClass: 'PC-1', nominalBoreMm: 100, schedule: 'SCH40', materialCode: 'MAT-1',
  }),
]);
const pipingClassResolution = createCommonEnrichedPipingClassResolution({
  schema: COMMON_ENRICHED_PIPING_CLASS_RESOLUTION_SCHEMA,
  resolutionId: 'RES-PC-P5C',
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
  bindings: [pipingBinding('material.materialCode', 'materialCode', null, 'STRING')],
});
const materialSnapshot = snapshot('SNAP-MAT-P5C', 'MATERIAL_REGISTER', 'materialRegister', HASHES.material, [
  row('MAT-1', 'Material!1', { materialCode: 'MAT-1', densityKgM3: 8000, elasticModulusGpa: 193 }),
]);
const materialInput = {
  schema: COMMON_ENRICHED_MATERIAL_RESOLUTION_SCHEMA,
  resolutionId: 'RES-MAT-P5C',
  pipingClassResolution,
  snapshot: materialSnapshot,
  keyConfig: {
    schema: COMMON_ENRICHED_MATERIAL_KEY_CONFIG_SCHEMA,
    targetMaterialCodeField: 'material.materialCode',
    sourceMaterialCodeField: 'materialCode',
  },
  bindings: [materialBinding('material.densityKgM3', 'densityKgM3', 'kg/m3', 'NUMBER')],
};
const resolution = createCommonEnrichedMaterialResolution(materialInput);
const repeatedResolution = createCommonEnrichedMaterialResolution(materialInput);
assert.deepEqual(repeatedResolution, resolution);
assert.equal(resolution.schema, COMMON_ENRICHED_MATERIAL_RESOLUTION_SCHEMA);
assert.equal(resolution.targetRecords.length, 1);
const densityField = resolution.targetRecords[0].fields[0];
assert.equal(densityField.field, 'material.densityKgM3');
assert.equal(densityField.status, 'RESOLVED_EXACT');
assert.equal(densityField.approved, true);
assert.equal(densityField.value, 8000);
assert.equal(densityField.unit, 'kg/m3');
assert.equal(densityField.sourceKind, 'MATERIAL_REGISTER');
assert.equal(densityField.sourceHash, HASHES.material);

const sourceStructuralHash = semanticHash({ structural: 'P5C' });
const projection = buildEnrichmentMaterialDensityProjection({
  materialResolution: resolution,
  dataset,
  sourceStructuralHash,
});
const repeatedProjection = buildEnrichmentMaterialDensityProjection({
  materialResolution: resolution,
  dataset,
  sourceStructuralHash,
});
assert.deepEqual(repeatedProjection, projection);
assert.equal(projection.schema, ENRICHMENT_MATERIAL_DENSITY_PROJECTION_SCHEMA);
assert.equal(assertEnrichmentMaterialDensityProjection(projection), projection);
assert.equal(projection.summary.status, 'READY_FOR_STRUCTURAL_IMPACT');
assert.equal(projection.rows.length, 1);
assert.equal(projection.rows[0].targetId, 'L-1');
assert.equal(projection.rows[0].proposedValue, 8000);
assert.equal(projection.rows[0].sourceEvidence.sourceKind, 'MATERIAL_REGISTER');
assert.equal(projection.rows[0].sourceEvidence.sourceHash, HASHES.material);

const changedSnapshot = snapshot('SNAP-MAT-P5C-CHANGED', 'MATERIAL_REGISTER', 'materialRegister', 'e'.repeat(64), [
  row('MAT-1', 'Material!1', { materialCode: 'MAT-1', densityKgM3: 8010, elasticModulusGpa: 193 }),
]);
const changedResolution = createCommonEnrichedMaterialResolution({
  ...materialInput,
  resolutionId: 'RES-MAT-P5C-CHANGED',
  snapshot: changedSnapshot,
});
const changedProjection = buildEnrichmentMaterialDensityProjection({
  materialResolution: changedResolution,
  dataset,
  sourceStructuralHash,
});
assert.notEqual(changedResolution.semanticHash, resolution.semanticHash);
assert.notEqual(changedProjection.projectionHash, projection.projectionHash);

const mismatchedDataset = structuredClone(dataset);
mismatchedDataset.sharedModel.semanticHash = semanticHash({ other: 'shared-model' });
const blockedProjection = buildEnrichmentMaterialDensityProjection({
  materialResolution: resolution,
  dataset: mismatchedDataset,
  sourceStructuralHash,
});
assert.equal(blockedProjection.summary.status, 'BLOCKED');
assert.equal(blockedProjection.rows[0].disposition, 'BLOCKED_MATERIAL_RESOLUTION');
assert.ok(blockedProjection.rows[0].blockers.some((item) => item.code === 'MATERIAL_RESOLUTION_SHARED_MODEL_MISMATCH'));

const tampered = structuredClone(projection);
tampered.rows[0].proposedValue = 7999;
assert.throws(
  () => assertEnrichmentMaterialDensityProjection(tampered),
  (error) => error.code === 'ENRICHMENT_MATERIAL_DENSITY_PROJECTION_PROPOSAL_HASH_MISMATCH',
);

assert.throws(
  () => createCommonEnrichedMaterialResolution({
    ...materialInput,
    bindings: [
      materialBinding('material.elasticModulusGpa', 'elasticModulusGpa', 'GPa', 'NUMBER'),
      materialBinding('material.densityKgM3', 'densityKgM3', 'kg/m3', 'NUMBER'),
    ],
  }),
  (error) => error.code === 'COMMON_ENRICHED_ORDER_INVALID',
);

console.log(JSON.stringify({
  check: 'enrichment-package5c-material-resolution-contract',
  status: 'PASS',
  resolutionSemanticHash: resolution.semanticHash,
  projectionHash: projection.projectionHash,
  resolvedLineKey: projection.rows[0].targetId,
  resolvedDensityKgPerM3: projection.rows[0].proposedValue,
  sourceChangeInvalidatesResolutionIdentity: true,
  sourceChangeInvalidatesProjectionIdentity: true,
  sharedModelMismatchBlocksProjection: true,
  nonCanonicalOrderFailsClosed: true,
  projectionTamperFailsClosed: true,
}, null, 2));

function component(componentKey, lineId) {
  return {
    componentKey,
    sourceEntityId: componentKey,
    name: componentKey,
    type: 'PIPE',
    identity: { lineId, branchId: `${lineId}/B1`, systemId: '', zoneId: '' },
    geometry: {
      start: null, end: null, center: null, points: [], branchPoints: [], sources: {},
      sourcePath: `/${componentKey}`, ports: [],
    },
    engineeringProperties: {},
    compatibilityEvidence: {},
    sourceReferences: { sourceEntityId: componentKey },
    diagnostics: [],
  };
}

function snapshot(snapshotId, sourceKind, sourceKey, sourceHash, records) {
  return createEngineeringMasterSnapshot({
    schema: ENGINEERING_MASTER_SNAPSHOT_SCHEMA,
    snapshotId,
    sourceKind,
    sourceKey,
    sourceHash,
    capturedAt: CAPTURED_AT,
    mappingSemanticHash: semanticHash({ sourceKind, sourceKey }),
    records,
    metadata: { fileName: `${sourceKey}.xlsx`, sheet: sourceKey },
  });
}
function row(recordId, locator, values) {
  return { schema: ENGINEERING_MASTER_RECORD_SCHEMA, recordId, locator, values };
}
function lineBinding(targetField, sourceField, unit, valueKind) {
  return { schema: COMMON_ENRICHED_LINE_LIST_FIELD_BINDING_SCHEMA, targetField, sourceField, unit, valueKind };
}
function pipingBinding(targetField, sourceField, unit, valueKind) {
  return { schema: COMMON_ENRICHED_PIPING_CLASS_FIELD_BINDING_SCHEMA, targetField, sourceField, unit, valueKind };
}
function materialBinding(targetField, sourceField, unit, valueKind) {
  return { schema: COMMON_ENRICHED_MATERIAL_FIELD_BINDING_SCHEMA, targetField, sourceField, unit, valueKind };
}
