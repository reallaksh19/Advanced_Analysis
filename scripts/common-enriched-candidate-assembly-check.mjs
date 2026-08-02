import assert from 'node:assert/strict';
import * as E from '../src/core/common-enriched-properties/index.js';
import { createSharedPipingModel, semanticHash } from '../src/core/shared-piping-model/index.js';

const AT = '2026-08-02T18:45:00.000Z';
const model = createSharedPipingModel({
  project: { datasetId: 'P9', name: 'P9', sourceName: 'p9.json' },
  units: { length: 'mm', force: 'N', mass: 'kg' },
  sourceSnapshotRef: {
    schema: 'source-package-snapshot/v1', datasetId: 'P9',
    sourceSchema: 'synthetic/v1', sourceSemanticHash: semanticHash({ p: 9 }), sourceByteHash: null,
  },
  components: [{
    componentKey: 'C1', sourceEntityId: 'E1', name: 'C1', type: 'VALVE',
    identity: { lineId: 'L1', branchId: 'L1/B1', systemId: '', zoneId: '' },
    geometry: { start: null, end: null, center: null, points: [], branchPoints: [], sources: {}, sourcePath: '/C1', ports: [] },
    engineeringProperties: {}, compatibilityEvidence: {}, sourceReferences: { sourceEntityId: 'E1' }, diagnostics: [],
  }],
  supports: [], sourceReferences: { nodes: [] }, diagnostics: [],
});
const inventory = E.createCommonEnrichedTargetInventory({
  schema: E.COMMON_ENRICHED_TARGET_INVENTORY_SCHEMA, inventoryId: 'INV-P9', sharedModel: model,
});
const llSnap = snap('LL', 'LINE_LIST', 'll', 'a', [{
  lineKey: 'L1', pipingClass: 'M1', nominalBoreMm: 100, schedule: 'SCH40', fluidCode: 'W', insulationCode: 'I',
}]);
const ll = E.createCommonEnrichedLineListResolution({
  schema: E.COMMON_ENRICHED_LINE_LIST_RESOLUTION_SCHEMA, resolutionId: 'R-LL', inventory, snapshot: llSnap,
  bindings: [
    bind(E.COMMON_ENRICHED_LINE_LIST_FIELD_BINDING_SCHEMA, 'process.fluidCode', 'fluidCode', null, 'STRING'),
    bind(E.COMMON_ENRICHED_LINE_LIST_FIELD_BINDING_SCHEMA, 'process.insulationCode', 'insulationCode', null, 'STRING'),
    bind(E.COMMON_ENRICHED_LINE_LIST_FIELD_BINDING_SCHEMA, 'spec.nominalBoreMm', 'nominalBoreMm', 'mm', 'NUMBER'),
    bind(E.COMMON_ENRICHED_LINE_LIST_FIELD_BINDING_SCHEMA, 'spec.pipingClass', 'pipingClass', null, 'STRING'),
    bind(E.COMMON_ENRICHED_LINE_LIST_FIELD_BINDING_SCHEMA, 'spec.schedule', 'schedule', null, 'STRING'),
  ],
});
const pcSnap = snap('PC', 'PIPING_CLASS', 'pc', 'b', [{
  pipingClass: 'M1', nominalBoreMm: 100, schedule: 'SCH40', materialCode: 'A', outsideDiameterMm: 114.3, wallThicknessMm: 6,
}]);
const pcConfig = {
  schema: E.COMMON_ENRICHED_PIPING_CLASS_KEY_CONFIG_SCHEMA,
  targetClassField: 'spec.pipingClass', targetBoreField: 'spec.nominalBoreMm', targetScheduleField: 'spec.schedule',
  sourceClassField: 'pipingClass', sourceBoreField: 'nominalBoreMm', sourceScheduleField: 'schedule',
};
const pcBindings = [
  bind(E.COMMON_ENRICHED_PIPING_CLASS_FIELD_BINDING_SCHEMA, 'material.materialCode', 'materialCode', null, 'STRING'),
  bind(E.COMMON_ENRICHED_PIPING_CLASS_FIELD_BINDING_SCHEMA, 'spec.outsideDiameterMm', 'outsideDiameterMm', 'mm', 'NUMBER'),
  bind(E.COMMON_ENRICHED_PIPING_CLASS_FIELD_BINDING_SCHEMA, 'spec.wallThicknessMm', 'wallThicknessMm', 'mm', 'NUMBER'),
];
const pc = E.createCommonEnrichedPipingClassResolution({
  schema: E.COMMON_ENRICHED_PIPING_CLASS_RESOLUTION_SCHEMA, resolutionId: 'R-PC',
  lineListResolution: ll, snapshot: pcSnap, keyConfig: pcConfig, bindings: pcBindings,
});
const matSnap = snap('MAT', 'MATERIAL_REGISTER', 'mat', 'c', [{ materialCode: 'A', description: 'Steel', densityKgM3: 7850 }]);
const matConfig = {
  schema: E.COMMON_ENRICHED_MATERIAL_KEY_CONFIG_SCHEMA,
  targetMaterialCodeField: 'material.materialCode', sourceMaterialCodeField: 'materialCode',
};
const matBindings = [
  bind(E.COMMON_ENRICHED_MATERIAL_FIELD_BINDING_SCHEMA, 'material.densityKgM3', 'densityKgM3', 'kg/m3', 'NUMBER'),
  bind(E.COMMON_ENRICHED_MATERIAL_FIELD_BINDING_SCHEMA, 'material.description', 'description', null, 'STRING'),
];
const mat = E.createCommonEnrichedMaterialResolution({
  schema: E.COMMON_ENRICHED_MATERIAL_RESOLUTION_SCHEMA, resolutionId: 'R-MAT',
  pipingClassResolution: pc, snapshot: matSnap, keyConfig: matConfig, bindings: matBindings,
});
const fluidSnap = snap('FL', 'FLUID_REGISTER', 'fluid', 'd', [{ fluidCode: 'W', description: 'Water', densityKgM3: 998 }]);
const fluidConfig = {
  schema: E.COMMON_ENRICHED_FLUID_KEY_CONFIG_SCHEMA,
  targetFluidCodeField: 'process.fluidCode', sourceFluidCodeField: 'fluidCode',
};
const fluid = E.createCommonEnrichedFluidResolution({
  schema: E.COMMON_ENRICHED_FLUID_RESOLUTION_SCHEMA, resolutionId: 'R-FL', lineListResolution: ll,
  snapshot: fluidSnap, keyConfig: fluidConfig,
  bindings: [
    bind(E.COMMON_ENRICHED_FLUID_FIELD_BINDING_SCHEMA, 'fluid.densityKgM3', 'densityKgM3', 'kg/m3', 'NUMBER'),
    bind(E.COMMON_ENRICHED_FLUID_FIELD_BINDING_SCHEMA, 'fluid.description', 'description', null, 'STRING'),
  ],
});
const insSnap = snap('INS', 'INSULATION_REGISTER', 'ins', 'e', [{ insulationCode: 'I', description: 'Wool', densityKgM3: 120 }]);
const ins = E.createCommonEnrichedInsulationResolution({
  schema: E.COMMON_ENRICHED_INSULATION_RESOLUTION_SCHEMA, resolutionId: 'R-INS', lineListResolution: ll,
  snapshot: insSnap,
  keyConfig: {
    schema: E.COMMON_ENRICHED_INSULATION_KEY_CONFIG_SCHEMA,
    targetInsulationCodeField: 'process.insulationCode', sourceInsulationCodeField: 'insulationCode',
  },
  bindings: [
    bind(E.COMMON_ENRICHED_INSULATION_FIELD_BINDING_SCHEMA, 'insulation.densityKgM3', 'densityKgM3', 'kg/m3', 'NUMBER'),
    bind(E.COMMON_ENRICHED_INSULATION_FIELD_BINDING_SCHEMA, 'insulation.description', 'description', null, 'STRING'),
  ],
});
const wtSnap = snap('WT', 'COMPONENT_WEIGHT_MASTER', 'wt', 'f', [{ entityId: 'E1', weightKg: 15 }]);
const wt = E.createCommonEnrichedComponentWeightResolution({
  schema: E.COMMON_ENRICHED_COMPONENT_WEIGHT_RESOLUTION_SCHEMA, resolutionId: 'R-WT', inventory, sharedModel: model,
  lineListResolution: ll, snapshot: wtSnap,
  keyConfig: {
    schema: E.COMMON_ENRICHED_COMPONENT_WEIGHT_KEY_CONFIG_SCHEMA, selectorKind: 'ENTITY',
    targetCatalogKeyProperty: null, targetBoreField: null, sourceEntityIdField: 'entityId',
    sourceCatalogKeyField: null, sourceComponentTypeField: null, sourceBoreField: null,
  }, sourceWeightField: 'weightKg',
});
const snapshots = [llSnap, pcSnap, matSnap, fluidSnap, insSnap, wtSnap];
const input = {
  schema: E.COMMON_ENRICHED_CANDIDATE_ASSEMBLY_SCHEMA, candidateId: 'CAND-P9', projectId: 'P9', revision: 1,
  createdAt: '2026-08-02T18:46:00.000Z', reviewLedgerHash: semanticHash({ ledger: 0 }), inventory, snapshots,
  lineListResolution: ll, pipingClassResolution: pc, materialResolution: mat,
  fluidResolution: fluid, insulationResolution: ins, componentWeightResolution: wt,
};
const candidate = E.createCommonEnrichedCandidateFromExactResolutions(input);
assert.deepEqual(E.createCommonEnrichedCandidateFromExactResolutions(input), candidate);
assert.deepEqual(E.requireCommonEnrichedPropertiesCandidate(candidate), candidate);
assert.equal(candidate.status, E.COMMON_ENRICHED_CANDIDATE_STATUS);
assert.equal(candidate.sourceSnapshots.length, 6);
assert.equal(candidate.targetRecords.length, 2);
assert.equal(candidate.targetRecords.find((r) => r.targetKind === 'LINE').fields.length, 14);
assert.equal(candidate.targetRecords.find((r) => r.targetKind === 'COMPONENT').fields.length, 1);
assert.ok(Object.isFrozen(candidate));

const conflictingFluid = E.createCommonEnrichedFluidResolution({
  schema: E.COMMON_ENRICHED_FLUID_RESOLUTION_SCHEMA, resolutionId: 'R-FL-CONFLICT', lineListResolution: ll,
  snapshot: fluidSnap, keyConfig: fluidConfig,
  bindings: [bind(E.COMMON_ENRICHED_FLUID_FIELD_BINDING_SCHEMA, 'process.fluidCode', 'description', null, 'STRING')],
});
code(() => E.createCommonEnrichedCandidateFromExactResolutions({ ...input, fluidResolution: conflictingFluid }),
  'COMMON_ENRICHED_CANDIDATE_FIELD_CONFLICT');
const altPc = E.createCommonEnrichedPipingClassResolution({
  schema: E.COMMON_ENRICHED_PIPING_CLASS_RESOLUTION_SCHEMA, resolutionId: 'R-PC-ALT',
  lineListResolution: ll, snapshot: pcSnap, keyConfig: pcConfig, bindings: pcBindings,
});
const altMat = E.createCommonEnrichedMaterialResolution({
  schema: E.COMMON_ENRICHED_MATERIAL_RESOLUTION_SCHEMA, resolutionId: 'R-MAT-ALT',
  pipingClassResolution: altPc, snapshot: matSnap, keyConfig: matConfig, bindings: matBindings,
});
code(() => E.createCommonEnrichedCandidateFromExactResolutions({ ...input, materialResolution: altMat }),
  'COMMON_ENRICHED_CANDIDATE_DEPENDENCY_MISMATCH');
code(() => E.createCommonEnrichedCandidateFromExactResolutions({ ...input, snapshots: snapshots.slice(0, 5) }),
  'COMMON_ENRICHED_CANDIDATE_SNAPSHOT_SET_INVALID');
code(() => E.requireCommonEnrichedPropertiesCandidate({ ...candidate, candidateId: 'TAMPERED' }),
  'COMMON_ENRICHED_HASH_MISMATCH');
console.log('PASS common enriched exact candidate assembly checks');
console.log(JSON.stringify({ semanticHash: candidate.semanticHash, records: 2, lineFields: 14, status: candidate.status }, null, 2));

function snap(id, sourceKind, sourceKey, fill, values) {
  return E.createEngineeringMasterSnapshot({
    schema: E.ENGINEERING_MASTER_SNAPSHOT_SCHEMA, snapshotId: `S-${id}`, sourceKind, sourceKey,
    sourceHash: fill.repeat(64), capturedAt: AT, mappingSemanticHash: semanticHash({ sourceKind }),
    records: values.map((entry, index) => ({
      schema: E.ENGINEERING_MASTER_RECORD_SCHEMA, recordId: `${id}-${index + 1}`, locator: `${id}!${index + 1}`, values: entry,
    })), metadata: { fixture: 'p9' },
  });
}
function bind(schema, targetField, sourceField, unit, valueKind) {
  return { schema, targetField, sourceField, unit, valueKind };
}
function code(action, expected) {
  assert.throws(action, (error) => error?.code === expected, `expected ${expected}`);
}
