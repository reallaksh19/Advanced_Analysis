import assert from 'node:assert/strict';
import {
  COMMON_ENRICHED_FLUID_FIELD_BINDING_SCHEMA,
  COMMON_ENRICHED_FLUID_KEY_CONFIG_SCHEMA,
  COMMON_ENRICHED_FLUID_RESOLUTION_SCHEMA,
  COMMON_ENRICHED_INSULATION_FIELD_BINDING_SCHEMA,
  COMMON_ENRICHED_INSULATION_KEY_CONFIG_SCHEMA,
  COMMON_ENRICHED_INSULATION_RESOLUTION_SCHEMA,
  COMMON_ENRICHED_LINE_LIST_FIELD_BINDING_SCHEMA,
  COMMON_ENRICHED_LINE_LIST_RESOLUTION_SCHEMA,
  COMMON_ENRICHED_TARGET_INVENTORY_SCHEMA,
  ENGINEERING_MASTER_RECORD_SCHEMA,
  ENGINEERING_MASTER_SNAPSHOT_SCHEMA,
  createCommonEnrichedFluidResolution,
  createCommonEnrichedInsulationResolution,
  createCommonEnrichedLineListResolution,
  createCommonEnrichedTargetInventory,
  createEngineeringMasterSnapshot,
} from '../src/core/common-enriched-properties/index.js';
import { createSharedPipingModel, semanticHash } from '../src/core/shared-piping-model/index.js';
import {
  ENRICHMENT_HYDRO_FLUID_DENSITY_PROJECTION_SCHEMA,
  ENRICHMENT_INSULATION_DENSITY_PROJECTION_SCHEMA,
  assertEnrichmentHydroFluidDensityProjection,
  assertEnrichmentInsulationDensityProjection,
  buildEnrichmentHydroFluidDensityProjection,
  buildEnrichmentInsulationDensityProjection,
} from '../src/workspace/engineering-enrichment/production-secondary-density-overlays.js';

const HASHES = Object.freeze({
  dataset: 'a'.repeat(64),
  lineList: 'b'.repeat(64),
  insulation: 'c'.repeat(64),
  fluid: 'd'.repeat(64),
});
const CAPTURED_AT = '2026-08-08T07:55:00.000Z';
const STRUCTURAL_HASH = semanticHash({ structural: 'P5E-BATCH' });

const sharedModel = createSharedPipingModel({
  project: { datasetId: 'ENR-P5E-BATCH', name: 'Package 5E batch fixture', sourceName: 'synthetic.json' },
  units: { length: 'mm', force: 'N', mass: 'kg' },
  sourceSnapshotRef: {
    schema: 'source-package-snapshot/v1',
    datasetId: 'ENR-P5E-BATCH',
    sourceSchema: 'synthetic-shared-model/v1',
    sourceSemanticHash: semanticHash({ source: 'ENR-P5E-BATCH' }),
    sourceByteHash: null,
  },
  components: [component('PIPE-1', 'L-1')],
  supports: [],
  sourceReferences: { nodes: [] },
  diagnostics: [],
});
const dataset = {
  schema: 'analysis-workspace-dataset/v1',
  datasetId: 'ENR-P5E-BATCH',
  version: 1,
  sourceSha256: HASHES.dataset,
  sharedModel,
  entities: [{ entityId: 'PIPE-1', entityType: 'PIPE', lineKey: 'L-1' }],
};
const inventory = createCommonEnrichedTargetInventory({
  schema: COMMON_ENRICHED_TARGET_INVENTORY_SCHEMA,
  inventoryId: 'INV-P5E-BATCH',
  sharedModel,
});
const lineListSnapshot = snapshot('SNAP-LINE-P5E', 'LINE_LIST', 'lineList', HASHES.lineList, [
  row('LINE-1', 'LineList!1', {
    lineKey: 'L-1',
    insulationCode: 'INS-2',
    testMedium: 'HYDRO-WATER',
  }),
]);
const lineListResolution = createCommonEnrichedLineListResolution({
  schema: COMMON_ENRICHED_LINE_LIST_RESOLUTION_SCHEMA,
  resolutionId: 'RES-LINE-P5E',
  inventory,
  snapshot: lineListSnapshot,
  bindings: [
    lineBinding('process.insulationCode', 'insulationCode', null, 'STRING'),
    lineBinding('process.testMedium', 'testMedium', null, 'STRING'),
  ],
});

const insulationSnapshot = snapshot(
  'SNAP-INS-P5E',
  'INSULATION_REGISTER',
  'insulationRegister',
  HASHES.insulation,
  [row('INS-2', 'Insulation!1', { insulationCode: 'INS-2', densityKgM3: 180 })],
);
const insulationInput = {
  schema: COMMON_ENRICHED_INSULATION_RESOLUTION_SCHEMA,
  resolutionId: 'RES-INS-P5E',
  lineListResolution,
  snapshot: insulationSnapshot,
  keyConfig: {
    schema: COMMON_ENRICHED_INSULATION_KEY_CONFIG_SCHEMA,
    targetInsulationCodeField: 'process.insulationCode',
    sourceInsulationCodeField: 'insulationCode',
  },
  bindings: [
    insulationBinding('insulation.code', 'insulationCode', null, 'STRING'),
    insulationBinding('insulation.densityKgM3', 'densityKgM3', 'kg/m3', 'NUMBER'),
  ],
};
const insulationResolution = createCommonEnrichedInsulationResolution(insulationInput);
const insulationProjection = buildEnrichmentInsulationDensityProjection({
  insulationResolution,
  dataset,
  sourceStructuralHash: STRUCTURAL_HASH,
});
assert.deepEqual(
  buildEnrichmentInsulationDensityProjection({ insulationResolution, dataset, sourceStructuralHash: STRUCTURAL_HASH }),
  insulationProjection,
);
assert.equal(insulationProjection.schema, ENRICHMENT_INSULATION_DENSITY_PROJECTION_SCHEMA);
assert.equal(assertEnrichmentInsulationDensityProjection(insulationProjection), insulationProjection);
assert.equal(insulationProjection.summary.status, 'READY_FOR_STRUCTURAL_IMPACT');
assert.equal(insulationProjection.rows.length, 1);
assert.equal(insulationProjection.rows[0].targetId, 'L-1');
assert.equal(insulationProjection.rows[0].referenceCode, 'INS-2');
assert.equal(insulationProjection.rows[0].densityKgPerM3, 180);
assert.equal(insulationProjection.rows[0].sourceEvidence.sourceKind, 'INSULATION_REGISTER');

const fluidSnapshot = snapshot(
  'SNAP-FLUID-P5E',
  'FLUID_REGISTER',
  'fluidRegister',
  HASHES.fluid,
  [row('HYDRO-WATER', 'Fluids!1', { fluidCode: 'HYDRO-WATER', densityKgM3: 1100 })],
);
const hydroInput = {
  schema: COMMON_ENRICHED_FLUID_RESOLUTION_SCHEMA,
  resolutionId: 'RES-HYDRO-P5E',
  lineListResolution,
  snapshot: fluidSnapshot,
  keyConfig: {
    schema: COMMON_ENRICHED_FLUID_KEY_CONFIG_SCHEMA,
    targetFluidCodeField: 'process.testMedium',
    sourceFluidCodeField: 'fluidCode',
  },
  bindings: [
    fluidBinding('contents.hydroDensityKgM3', 'densityKgM3', 'kg/m3', 'NUMBER'),
    fluidBinding('contents.hydroMediumCode', 'fluidCode', null, 'STRING'),
  ],
};
const hydroResolution = createCommonEnrichedFluidResolution(hydroInput);
const hydroProjection = buildEnrichmentHydroFluidDensityProjection({
  hydroFluidResolution: hydroResolution,
  dataset,
  sourceStructuralHash: STRUCTURAL_HASH,
});
assert.deepEqual(
  buildEnrichmentHydroFluidDensityProjection({ hydroFluidResolution: hydroResolution, dataset, sourceStructuralHash: STRUCTURAL_HASH }),
  hydroProjection,
);
assert.equal(hydroProjection.schema, ENRICHMENT_HYDRO_FLUID_DENSITY_PROJECTION_SCHEMA);
assert.equal(assertEnrichmentHydroFluidDensityProjection(hydroProjection), hydroProjection);
assert.equal(hydroProjection.summary.status, 'READY_FOR_STRUCTURAL_IMPACT');
assert.equal(hydroProjection.rows.length, 1);
assert.equal(hydroProjection.rows[0].targetId, 'L-1');
assert.equal(hydroProjection.rows[0].referenceCode, 'HYDRO-WATER');
assert.equal(hydroProjection.rows[0].densityKgPerM3, 1100);
assert.equal(hydroProjection.rows[0].sourceEvidence.sourceKind, 'FLUID_REGISTER');

const changedInsulationResolution = createCommonEnrichedInsulationResolution({
  ...insulationInput,
  resolutionId: 'RES-INS-P5E-CHANGED',
  snapshot: snapshot(
    'SNAP-INS-P5E-CHANGED',
    'INSULATION_REGISTER',
    'insulationRegister',
    'e'.repeat(64),
    [row('INS-2', 'Insulation!1', { insulationCode: 'INS-2', densityKgM3: 190 })],
  ),
});
const changedInsulationProjection = buildEnrichmentInsulationDensityProjection({
  insulationResolution: changedInsulationResolution,
  dataset,
  sourceStructuralHash: STRUCTURAL_HASH,
});
assert.notEqual(changedInsulationResolution.semanticHash, insulationResolution.semanticHash);
assert.notEqual(changedInsulationProjection.projectionHash, insulationProjection.projectionHash);

const changedHydroResolution = createCommonEnrichedFluidResolution({
  ...hydroInput,
  resolutionId: 'RES-HYDRO-P5E-CHANGED',
  snapshot: snapshot(
    'SNAP-FLUID-P5E-CHANGED',
    'FLUID_REGISTER',
    'fluidRegister',
    'f'.repeat(64),
    [row('HYDRO-WATER', 'Fluids!1', { fluidCode: 'HYDRO-WATER', densityKgM3: 1110 })],
  ),
});
const changedHydroProjection = buildEnrichmentHydroFluidDensityProjection({
  hydroFluidResolution: changedHydroResolution,
  dataset,
  sourceStructuralHash: STRUCTURAL_HASH,
});
assert.notEqual(changedHydroResolution.semanticHash, hydroResolution.semanticHash);
assert.notEqual(changedHydroProjection.projectionHash, hydroProjection.projectionHash);

const mismatchedDataset = structuredClone(dataset);
mismatchedDataset.sharedModel.semanticHash = semanticHash({ other: 'shared-model' });
const blockedInsulation = buildEnrichmentInsulationDensityProjection({
  insulationResolution,
  dataset: mismatchedDataset,
  sourceStructuralHash: STRUCTURAL_HASH,
});
const blockedHydro = buildEnrichmentHydroFluidDensityProjection({
  hydroFluidResolution: hydroResolution,
  dataset: mismatchedDataset,
  sourceStructuralHash: STRUCTURAL_HASH,
});
assert.equal(blockedInsulation.summary.status, 'BLOCKED');
assert.equal(blockedHydro.summary.status, 'BLOCKED');

const tamperedInsulation = structuredClone(insulationProjection);
tamperedInsulation.rows[0].densityKgPerM3 = 179;
assert.throws(
  () => assertEnrichmentInsulationDensityProjection(tamperedInsulation),
  (error) => error.code === 'ENRICHMENT_INSULATION_DENSITY_PROJECTION_PROPOSAL_HASH_MISMATCH',
);
const tamperedHydro = structuredClone(hydroProjection);
tamperedHydro.rows[0].referenceCode = 'WATER';
assert.throws(
  () => assertEnrichmentHydroFluidDensityProjection(tamperedHydro),
  (error) => error.code === 'ENRICHMENT_HYDRO_FLUID_DENSITY_PROJECTION_PROPOSAL_HASH_MISMATCH',
);

assert.throws(
  () => createCommonEnrichedInsulationResolution({
    ...insulationInput,
    bindings: [
      insulationBinding('insulation.densityKgM3', 'densityKgM3', 'kg/m3', 'NUMBER'),
      insulationBinding('insulation.code', 'insulationCode', null, 'STRING'),
    ],
  }),
  (error) => error.code === 'COMMON_ENRICHED_ORDER_INVALID',
);
assert.throws(
  () => createCommonEnrichedFluidResolution({
    ...hydroInput,
    bindings: [
      fluidBinding('contents.hydroMediumCode', 'fluidCode', null, 'STRING'),
      fluidBinding('contents.hydroDensityKgM3', 'densityKgM3', 'kg/m3', 'NUMBER'),
    ],
  }),
  (error) => error.code === 'COMMON_ENRICHED_ORDER_INVALID',
);

console.log(JSON.stringify({
  check: 'enrichment-package5e-secondary-density-resolution',
  status: 'PASS',
  insulationResolutionHash: insulationResolution.semanticHash,
  insulationProjectionHash: insulationProjection.projectionHash,
  insulationCode: insulationProjection.rows[0].referenceCode,
  insulationDensityKgPerM3: insulationProjection.rows[0].densityKgPerM3,
  hydroResolutionHash: hydroResolution.semanticHash,
  hydroProjectionHash: hydroProjection.projectionHash,
  testMediumCode: hydroProjection.rows[0].referenceCode,
  hydroDensityKgPerM3: hydroProjection.rows[0].densityKgPerM3,
  sourceChangesInvalidateIdentities: true,
  sharedModelMismatchFailsClosed: true,
  nonCanonicalOrderingFailsClosed: true,
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

function insulationBinding(targetField, sourceField, unit, valueKind) {
  return { schema: COMMON_ENRICHED_INSULATION_FIELD_BINDING_SCHEMA, targetField, sourceField, unit, valueKind };
}

function fluidBinding(targetField, sourceField, unit, valueKind) {
  return { schema: COMMON_ENRICHED_FLUID_FIELD_BINDING_SCHEMA, targetField, sourceField, unit, valueKind };
}
