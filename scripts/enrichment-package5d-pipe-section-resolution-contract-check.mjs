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
} from '../src/core/common-enriched-properties/index.js';
import {
  createSharedPipingModel,
  semanticHash,
} from '../src/core/shared-piping-model/index.js';
import {
  ENRICHMENT_PIPE_SECTION_PROJECTION_SCHEMA,
  assertEnrichmentPipeSectionProjection,
  buildEnrichmentPipeSectionProjection,
} from '../src/workspace/engineering-enrichment/production-pipe-section-overlay.js';

const HASHES = Object.freeze({
  dataset: 'a'.repeat(64),
  lineList: 'b'.repeat(64),
  pipingClass: 'c'.repeat(64),
});
const CAPTURED_AT = '2026-08-08T07:40:00.000Z';

const sharedModel = createSharedPipingModel({
  project: { datasetId: 'ENR-P5D-SECTION', name: 'Package 5D section fixture', sourceName: 'synthetic.json' },
  units: { length: 'mm', force: 'N', mass: 'kg' },
  sourceSnapshotRef: {
    schema: 'source-package-snapshot/v1',
    datasetId: 'ENR-P5D-SECTION',
    sourceSchema: 'synthetic-shared-model/v1',
    sourceSemanticHash: semanticHash({ source: 'ENR-P5D-SECTION' }),
    sourceByteHash: null,
  },
  components: [component('PIPE-1', 'L-1')],
  supports: [],
  sourceReferences: { nodes: [] },
  diagnostics: [],
});
const dataset = {
  schema: 'analysis-workspace-dataset/v1',
  datasetId: 'ENR-P5D-SECTION',
  version: 1,
  sourceSha256: HASHES.dataset,
  sharedModel,
  entities: [{ entityId: 'PIPE-1', entityType: 'PIPE', lineKey: 'L-1' }],
};
const inventory = createCommonEnrichedTargetInventory({
  schema: COMMON_ENRICHED_TARGET_INVENTORY_SCHEMA,
  inventoryId: 'INV-P5D',
  sharedModel,
});
const lineListSnapshot = snapshot('SNAP-LINE-P5D', 'LINE_LIST', 'lineList', HASHES.lineList, [
  row('LINE-1', 'LineList!1', {
    lineKey: 'L-1', pipingClass: 'PC-1', nominalBoreMm: 100, schedule: 'SCH40',
  }),
]);
const lineListResolution = createCommonEnrichedLineListResolution({
  schema: COMMON_ENRICHED_LINE_LIST_RESOLUTION_SCHEMA,
  resolutionId: 'RES-LINE-P5D',
  inventory,
  snapshot: lineListSnapshot,
  bindings: [
    lineBinding('spec.nominalBoreMm', 'nominalBoreMm', 'mm', 'NUMBER'),
    lineBinding('spec.pipingClass', 'pipingClass', null, 'STRING'),
    lineBinding('spec.schedule', 'schedule', null, 'STRING'),
  ],
});

const sourceRow = {
  pipingClass: 'PC-1',
  nominalBoreMm: 100,
  schedule: 'SCH40',
  outsideDiameterMm: 110,
  wallThicknessMm: 6,
  materialCode: 'MAT-1',
  insulationCode: 'INS-1',
  insulationThicknessMm: 12,
};
const pipingClassSnapshot = snapshot(
  'SNAP-PC-P5D',
  'PIPING_CLASS',
  'pipingClass',
  HASHES.pipingClass,
  [row('PC-1', 'PipingClass!1', sourceRow)],
);
const pipingClassInput = {
  schema: COMMON_ENRICHED_PIPING_CLASS_RESOLUTION_SCHEMA,
  resolutionId: 'RES-PC-P5D',
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
  bindings: sectionBindings(),
};
const resolution = createCommonEnrichedPipingClassResolution(pipingClassInput);
const repeatedResolution = createCommonEnrichedPipingClassResolution(pipingClassInput);
assert.deepEqual(repeatedResolution, resolution);
assert.equal(resolution.targetRecords.length, 1);
assert.equal(resolution.summary.exactFieldCount, 5);
assert.ok(resolution.targetRecords[0].fields.every((field) => field.status === 'RESOLVED_EXACT'));
assert.ok(resolution.targetRecords[0].fields.every((field) => field.sourceKind === 'PIPING_CLASS'));

const sourceStructuralHash = semanticHash({ structural: 'P5D' });
const projection = buildEnrichmentPipeSectionProjection({
  pipingClassResolution: resolution,
  dataset,
  sourceStructuralHash,
});
const repeatedProjection = buildEnrichmentPipeSectionProjection({
  pipingClassResolution: resolution,
  dataset,
  sourceStructuralHash,
});
assert.deepEqual(repeatedProjection, projection);
assert.equal(projection.schema, ENRICHMENT_PIPE_SECTION_PROJECTION_SCHEMA);
assert.equal(assertEnrichmentPipeSectionProjection(projection), projection);
assert.equal(projection.summary.status, 'READY_FOR_STRUCTURAL_IMPACT');
assert.equal(projection.rows.length, 1);
assert.equal(projection.rows[0].targetId, 'L-1');
assert.deepEqual(projection.rows[0].proposedSection, {
  outsideDiameterMm: 110,
  wallThicknessMm: 6,
  materialCode: 'MAT-1',
  insulationCode: 'INS-1',
  insulationThicknessMm: 12,
});
assert.equal(projection.rows[0].sourceEvidence.sourceKind, 'PIPING_CLASS');
assert.equal(projection.rows[0].sourceEvidence.sourceHash, HASHES.pipingClass);
assert.equal(Object.keys(projection.rows[0].sourceEvidence.locators).length, 5);

const changedSnapshot = snapshot(
  'SNAP-PC-P5D-CHANGED',
  'PIPING_CLASS',
  'pipingClass',
  'd'.repeat(64),
  [row('PC-1', 'PipingClass!1', { ...sourceRow, outsideDiameterMm: 112 })],
);
const changedResolution = createCommonEnrichedPipingClassResolution({
  ...pipingClassInput,
  resolutionId: 'RES-PC-P5D-CHANGED',
  snapshot: changedSnapshot,
});
const changedProjection = buildEnrichmentPipeSectionProjection({
  pipingClassResolution: changedResolution,
  dataset,
  sourceStructuralHash,
});
assert.notEqual(changedResolution.semanticHash, resolution.semanticHash);
assert.notEqual(changedProjection.projectionHash, projection.projectionHash);

const mismatchedDataset = structuredClone(dataset);
mismatchedDataset.sharedModel.semanticHash = semanticHash({ other: 'shared-model' });
const blockedProjection = buildEnrichmentPipeSectionProjection({
  pipingClassResolution: resolution,
  dataset: mismatchedDataset,
  sourceStructuralHash,
});
assert.equal(blockedProjection.summary.status, 'BLOCKED');
assert.equal(blockedProjection.rows[0].disposition, 'BLOCKED_PIPE_SECTION_RESOLUTION');
assert.ok(blockedProjection.rows[0].blockers.some(
  (item) => item.code === 'PIPE_SECTION_RESOLUTION_SHARED_MODEL_MISMATCH',
));

const invalidGeometrySnapshot = snapshot(
  'SNAP-PC-P5D-BAD-GEOM',
  'PIPING_CLASS',
  'pipingClass',
  'e'.repeat(64),
  [row('PC-1', 'PipingClass!1', { ...sourceRow, outsideDiameterMm: 10, wallThicknessMm: 6 })],
);
const invalidGeometryResolution = createCommonEnrichedPipingClassResolution({
  ...pipingClassInput,
  resolutionId: 'RES-PC-P5D-BAD-GEOM',
  snapshot: invalidGeometrySnapshot,
});
const invalidGeometryProjection = buildEnrichmentPipeSectionProjection({
  pipingClassResolution: invalidGeometryResolution,
  dataset,
  sourceStructuralHash,
});
assert.equal(invalidGeometryProjection.summary.status, 'BLOCKED');
assert.ok(invalidGeometryProjection.rows[0].blockers.some(
  (item) => item.code === 'PIPE_SECTION_GEOMETRY_INVALID',
));

const tampered = structuredClone(projection);
tampered.rows[0].proposedSection.wallThicknessMm = 7;
assert.throws(
  () => assertEnrichmentPipeSectionProjection(tampered),
  (error) => error.code === 'ENRICHMENT_PIPE_SECTION_PROJECTION_PROPOSAL_HASH_MISMATCH',
);

const nonCanonicalBindings = sectionBindings();
[nonCanonicalBindings[0], nonCanonicalBindings[1]] = [nonCanonicalBindings[1], nonCanonicalBindings[0]];
assert.throws(
  () => createCommonEnrichedPipingClassResolution({
    ...pipingClassInput,
    bindings: nonCanonicalBindings,
  }),
  (error) => error.code === 'COMMON_ENRICHED_ORDER_INVALID',
);

console.log(JSON.stringify({
  check: 'enrichment-package5d-pipe-section-resolution-contract',
  status: 'PASS',
  resolutionSemanticHash: resolution.semanticHash,
  projectionHash: projection.projectionHash,
  resolvedLineKey: projection.rows[0].targetId,
  resolvedSection: projection.rows[0].proposedSection,
  sourceChangeInvalidatesResolutionIdentity: true,
  sourceChangeInvalidatesProjectionIdentity: true,
  sharedModelMismatchBlocksProjection: true,
  invalidGeometryBlocksProjection: true,
  nonCanonicalOrderFailsClosed: true,
  projectionTamperFailsClosed: true,
}, null, 2));

function sectionBindings() {
  return [
    pipingBinding('section.insulationCode', 'insulationCode', null, 'STRING'),
    pipingBinding('section.insulationThicknessMm', 'insulationThicknessMm', 'mm', 'NUMBER'),
    pipingBinding('section.materialCode', 'materialCode', null, 'STRING'),
    pipingBinding('section.outsideDiameterMm', 'outsideDiameterMm', 'mm', 'NUMBER'),
    pipingBinding('section.wallThicknessMm', 'wallThicknessMm', 'mm', 'NUMBER'),
  ];
}

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
