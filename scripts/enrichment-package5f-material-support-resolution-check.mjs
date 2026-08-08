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
import { semanticHash } from '../src/core/shared-piping-model/index.js';
import {
  buildRestraintCapabilityModel,
  buildSupportAttachmentModel,
} from '../src/core/support-restraints/index.js';
import {
  ENRICHMENT_MATERIAL_SELECTION_PROJECTION_SCHEMA,
  ENRICHMENT_SUPPORT_CAPABILITY_PROJECTION_SCHEMA,
  assertEnrichmentMaterialSelectionProjection,
  assertEnrichmentSupportCapabilityProjection,
  buildEnrichmentMaterialSelectionProjection,
  buildEnrichmentSupportCapabilityProjection,
} from '../src/workspace/engineering-enrichment/production-material-support-authority-overlays.js';
import {
  exactTopology,
  pipeComponent,
  point,
  sharedFixture,
  supportEvidence,
  supportRecord,
} from './w10.3-support-restraint-fixtures.mjs';

const HASHES = Object.freeze({
  dataset: 'a'.repeat(64),
  lineList: 'b'.repeat(64),
  pipingClass: 'c'.repeat(64),
  material: 'd'.repeat(64),
});
const CAPTURED_AT = '2026-08-08T08:20:00.000Z';
const pipe = pipeComponent('PIPE-1', point(0), point(1000), {
  identity: { lineId: 'L-1', branchId: 'L-1/B1' },
});
const supports = [
  supportRecord('SUP-0', point(0), {
    sourceEntityId: 'SOURCE-SUP-0', sourceType: 'REST',
    supportEvidence: supportEvidence({ componentReferences: 'PIPE-1', supportTypes: 'REST' }),
  }),
  supportRecord('SUP-500', point(500), {
    sourceEntityId: 'SOURCE-SUP-500', sourceType: 'GUIDE',
    supportEvidence: supportEvidence({
      componentReferences: 'PIPE-1', supportTypes: 'GUIDE', vertical: 'RESTRAINED', lateral: 'RESTRAINED',
    }),
  }),
  supportRecord('SUP-1000', point(1000), {
    sourceEntityId: 'SOURCE-SUP-1000', sourceType: 'REST',
    supportEvidence: supportEvidence({ componentReferences: 'PIPE-1', supportTypes: 'REST' }),
  }),
];
const sharedModel = sharedFixture({
  datasetId: 'ENR-P5F-MATERIAL-SUPPORT',
  components: [pipe],
  supports,
});
const dataset = {
  schema: 'analysis-workspace-dataset/v1',
  datasetId: sharedModel.project.datasetId,
  version: 1,
  sourceSha256: HASHES.dataset,
  sharedModel,
  entities: [{ entityId: 'PIPE-1', entityType: 'PIPE', lineKey: 'L-1' }],
};
const supportSiteModel = supportSites(dataset.datasetId, [
  ['SITE-0', 0, 'SOURCE-SUP-0', 'REST'],
  ['SITE-500', 500, 'SOURCE-SUP-500', 'GUIDE'],
  ['SITE-1000', 1000, 'SOURCE-SUP-1000', 'REST'],
]);

const inventory = createCommonEnrichedTargetInventory({
  schema: COMMON_ENRICHED_TARGET_INVENTORY_SCHEMA,
  inventoryId: 'INV-P5F',
  sharedModel,
});
const lineListResolution = createCommonEnrichedLineListResolution({
  schema: COMMON_ENRICHED_LINE_LIST_RESOLUTION_SCHEMA,
  resolutionId: 'RES-LINE-P5F',
  inventory,
  snapshot: snapshot('SNAP-LINE-P5F', 'LINE_LIST', 'lineList', HASHES.lineList, [
    row('LINE-1', 'LineList!1', { lineKey: 'L-1', pipingClass: 'PC-1', nominalBoreMm: 100, schedule: 'SCH40' }),
  ]),
  bindings: [
    lineBinding('spec.nominalBoreMm', 'nominalBoreMm', 'mm', 'NUMBER'),
    lineBinding('spec.pipingClass', 'pipingClass', null, 'STRING'),
    lineBinding('spec.schedule', 'schedule', null, 'STRING'),
  ],
});
const pipingClassResolution = createCommonEnrichedPipingClassResolution({
  schema: COMMON_ENRICHED_PIPING_CLASS_RESOLUTION_SCHEMA,
  resolutionId: 'RES-PC-P5F',
  lineListResolution,
  snapshot: snapshot('SNAP-PC-P5F', 'PIPING_CLASS', 'pipingClass', HASHES.pipingClass, [
    row('PC-1', 'PipingClass!1', { pipingClass: 'PC-1', nominalBoreMm: 100, schedule: 'SCH40', materialCode: 'MAT-2' }),
  ]),
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
const materialInput = {
  schema: COMMON_ENRICHED_MATERIAL_RESOLUTION_SCHEMA,
  resolutionId: 'RES-MAT-P5F',
  pipingClassResolution,
  snapshot: snapshot('SNAP-MAT-P5F', 'MATERIAL_REGISTER', 'materialRegister', HASHES.material, [
    row('MAT-2', 'Material!1', { materialCode: 'MAT-2', densityKgM3: 8050 }),
  ]),
  keyConfig: {
    schema: COMMON_ENRICHED_MATERIAL_KEY_CONFIG_SCHEMA,
    targetMaterialCodeField: 'material.materialCode',
    sourceMaterialCodeField: 'materialCode',
  },
  bindings: [
    materialBinding('material.code', 'materialCode', null, 'STRING'),
    materialBinding('material.densityKgM3', 'densityKgM3', 'kg/m3', 'NUMBER'),
  ],
};
const materialResolution = createCommonEnrichedMaterialResolution(materialInput);
const materialProjection = buildEnrichmentMaterialSelectionProjection({
  materialResolution,
  dataset,
  sourceStructuralHash: structuralHash(dataset),
});
assert.equal(materialProjection.schema, ENRICHMENT_MATERIAL_SELECTION_PROJECTION_SCHEMA);
assert.equal(assertEnrichmentMaterialSelectionProjection(materialProjection), materialProjection);
assert.equal(materialProjection.summary.status, 'READY_FOR_STRUCTURAL_IMPACT');
assert.equal(materialProjection.rows[0].referenceCode, 'MAT-2');
assert.equal(materialProjection.rows[0].densityKgPerM3, 8050);
assert.equal(materialProjection.rows[0].sourceEvidence.sourceKind, 'MATERIAL_REGISTER');

const attachmentModel = buildSupportAttachmentModel(sharedModel, exactTopology(sharedModel));
const restraintModel = buildRestraintCapabilityModel(attachmentModel);
const supportProjection = buildEnrichmentSupportCapabilityProjection({
  attachmentModel,
  restraintCapabilityModel: restraintModel,
  dataset,
  supportSiteModel,
  sourceStructuralHash: structuralHash(dataset),
});
assert.equal(supportProjection.schema, ENRICHMENT_SUPPORT_CAPABILITY_PROJECTION_SCHEMA);
assert.equal(assertEnrichmentSupportCapabilityProjection(supportProjection), supportProjection);
assert.equal(supportProjection.summary.status, 'READY_FOR_STRUCTURAL_IMPACT');
assert.equal(supportProjection.rows.length, 3);
assert.deepEqual(
  supportProjection.rows.map((row) => [row.sourceType, row.verticalEnabled])
    .sort((a, b) => ascii(a[0], b[0]) || Number(a[1]) - Number(b[1])),
  [['GUIDE', true], ['REST', true], ['REST', true]],
);
assert.ok(supportProjection.rows.every((row) => row.solverEligible));
assert.ok(supportProjection.rows.every((row) => ['RESTRAINED', 'FREE'].includes(row.verticalState)));

const repeatedMaterial = buildEnrichmentMaterialSelectionProjection({
  materialResolution,
  dataset,
  sourceStructuralHash: structuralHash(dataset),
});
const repeatedSupport = buildEnrichmentSupportCapabilityProjection({
  attachmentModel,
  restraintCapabilityModel: restraintModel,
  dataset,
  supportSiteModel,
  sourceStructuralHash: structuralHash(dataset),
});
assert.deepEqual(repeatedMaterial, materialProjection);
assert.deepEqual(repeatedSupport, supportProjection);

const gapShared = sharedFixture({
  datasetId: dataset.datasetId,
  components: [pipe],
  supports: [supportRecord('SUP-GAP', point(500), {
    sourceEntityId: 'SOURCE-SUP-GAP', sourceType: 'REST',
    supportEvidence: supportEvidence({ componentReferences: 'PIPE-1', supportTypes: 'REST', verticalGaps: 2 }),
  })],
});
const gapDataset = { ...dataset, sharedModel: gapShared };
const gapAttachment = buildSupportAttachmentModel(gapShared, exactTopology(gapShared));
const gapRestraint = buildRestraintCapabilityModel(gapAttachment);
const gapProjection = buildEnrichmentSupportCapabilityProjection({
  attachmentModel: gapAttachment,
  restraintCapabilityModel: gapRestraint,
  dataset: gapDataset,
  supportSiteModel: supportSites(dataset.datasetId, [['SITE-GAP', 500, 'SOURCE-SUP-GAP', 'REST']]),
  sourceStructuralHash: structuralHash(dataset),
});
assert.equal(gapProjection.summary.status, 'BLOCKED');
assert.equal(gapProjection.rows[0].verticalState, 'GAP');
assert.ok(gapProjection.rows[0].blockers.some((item) => item.code === 'SUPPORT_VERTICAL_GAP_UNSUPPORTED'));

const conflictShared = sharedFixture({
  datasetId: dataset.datasetId,
  components: [pipe],
  supports: [
    supportRecord('SUP-T-A', point(0), {
      sourceEntityId: 'SOURCE-T-A', sourceType: 'REST',
      supportEvidence: supportEvidence({ componentReferences: 'PIPE-1', supportTypes: 'REST' }),
    }),
    supportRecord('SUP-T-B', point(1000), {
      sourceEntityId: 'SOURCE-T-B', sourceType: 'REST',
      supportEvidence: supportEvidence({ componentReferences: 'PIPE-1', supportTypes: 'REST', vertical: 'FREE' }),
    }),
  ],
});
const conflictDataset = { ...dataset, sharedModel: conflictShared };
const conflictAttachment = buildSupportAttachmentModel(conflictShared, exactTopology(conflictShared));
const conflictRestraint = buildRestraintCapabilityModel(conflictAttachment);
const conflictProjection = buildEnrichmentSupportCapabilityProjection({
  attachmentModel: conflictAttachment,
  restraintCapabilityModel: conflictRestraint,
  dataset: conflictDataset,
  supportSiteModel: supportSites(dataset.datasetId, [
    ['SITE-T-A', 0, 'SOURCE-T-A', 'REST'],
    ['SITE-T-B', 1000, 'SOURCE-T-B', 'REST'],
  ]),
  sourceStructuralHash: structuralHash(dataset),
});
assert.equal(conflictProjection.summary.status, 'BLOCKED');
assert.ok(conflictProjection.rows.every((row) => row.blockers.some((item) => item.code === 'SUPPORT_TYPE_VERTICAL_CAPABILITY_CONFLICT')));

const changedMaterialResolution = createCommonEnrichedMaterialResolution({
  ...materialInput,
  resolutionId: 'RES-MAT-P5F-CHANGED',
  snapshot: snapshot('SNAP-MAT-P5F-CHANGED', 'MATERIAL_REGISTER', 'materialRegister', 'e'.repeat(64), [
    row('MAT-2', 'Material!1', { materialCode: 'MAT-2', densityKgM3: 8060 }),
  ]),
});
const changedMaterialProjection = buildEnrichmentMaterialSelectionProjection({
  materialResolution: changedMaterialResolution,
  dataset,
  sourceStructuralHash: structuralHash(dataset),
});
assert.notEqual(changedMaterialProjection.projectionHash, materialProjection.projectionHash);

const tamperedMaterial = structuredClone(materialProjection);
tamperedMaterial.rows[0].referenceCode = 'MAT-X';
assert.throws(
  () => assertEnrichmentMaterialSelectionProjection(tamperedMaterial),
  (error) => error.code === 'ENRICHMENT_MATERIAL_SELECTION_PROPOSAL_HASH_MISMATCH',
);
const tamperedSupport = structuredClone(supportProjection);
tamperedSupport.rows[0].verticalEnabled = false;
assert.throws(
  () => assertEnrichmentSupportCapabilityProjection(tamperedSupport),
  (error) => error.code === 'ENRICHMENT_SUPPORT_CAPABILITY_PROPOSAL_HASH_MISMATCH',
);

console.log(JSON.stringify({
  check: 'enrichment-package5f-material-support-resolution',
  status: 'PASS',
  materialResolutionHash: materialResolution.semanticHash,
  materialProjectionHash: materialProjection.projectionHash,
  sealedMaterialCodeCandidate: materialProjection.rows[0].referenceCode,
  sealedMaterialDensityCandidateKgPerM3: materialProjection.rows[0].densityKgPerM3,
  supportAttachmentModelHash: attachmentModel.semanticHash,
  restraintCapabilityModelHash: restraintModel.semanticHash,
  supportProjectionHash: supportProjection.projectionHash,
  supportCapabilityCandidates: supportProjection.rows.map((row) => ({
    supportKey: row.supportKey, sourceType: row.sourceType, verticalEnabled: row.verticalEnabled,
  })),
  gapStateFailsClosed: true,
  sameTypeCapabilityConflictFailsClosed: true,
  sourceChangeInvalidatesMaterialIdentity: true,
  projectionTamperFailsClosed: true,
}, null, 2));

function snapshot(snapshotId, sourceKind, sourceKey, sourceHash, records) {
  return createEngineeringMasterSnapshot({
    schema: ENGINEERING_MASTER_SNAPSHOT_SCHEMA,
    snapshotId, sourceKind, sourceKey, sourceHash, capturedAt: CAPTURED_AT,
    mappingSemanticHash: semanticHash({ sourceKind, sourceKey }), records,
    metadata: { fileName: `${sourceKey}.xlsx`, sheet: sourceKey },
  });
}
function row(recordId, locator, values) { return { schema: ENGINEERING_MASTER_RECORD_SCHEMA, recordId, locator, values }; }
function lineBinding(targetField, sourceField, unit, valueKind) { return { schema: COMMON_ENRICHED_LINE_LIST_FIELD_BINDING_SCHEMA, targetField, sourceField, unit, valueKind }; }
function pipingBinding(targetField, sourceField, unit, valueKind) { return { schema: COMMON_ENRICHED_PIPING_CLASS_FIELD_BINDING_SCHEMA, targetField, sourceField, unit, valueKind }; }
function materialBinding(targetField, sourceField, unit, valueKind) { return { schema: COMMON_ENRICHED_MATERIAL_FIELD_BINDING_SCHEMA, targetField, sourceField, unit, valueKind }; }
function supportSites(datasetId, definitions) {
  return {
    schema: 'support-site-model/v1', datasetId, sourceAxisBasis: 'Z_UP', groupingToleranceMm: 1,
    status: 'READY', blockers: [], members: [], assemblies: [],
    sites: definitions.map(([siteId, x, sourceEntityId, sourceType]) => ({
      siteId, tags: [siteId], positionMm: { x, y: 0, z: 0 },
      assemblyIds: [`ASM-${siteId}`], memberEntityIds: [`MEM-${siteId}`], primaryEntityId: `MEM-${siteId}`,
      branchIds: ['L-1/B1'],
      assemblies: [{
        assemblyId: `ASM-${siteId}`, tag: siteId, branchId: 'L-1/B1', lineKey: 'L-1',
        positionMm: { x, y: 0, z: 0 }, memberEntityIds: [`MEM-${siteId}`],
        members: [{ entityId: `MEM-${siteId}`, sourceEntityId, sourceType, lineKey: 'L-1', positionMm: { x, y: 0, z: 0 } }],
      }],
    })),
    summary: { sourceSupportRecordCount: definitions.length, supportAssemblyCount: definitions.length, physicalLocationCount: definitions.length },
  };
}
function structuralHash(value) { return semanticHash({ structural: value.datasetId }); }
function ascii(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
