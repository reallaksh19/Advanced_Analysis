import { deepFreeze } from '../shared-piping-model/immutable.js';
import { failCommonEnrichment } from './errors.js';
import {
  COMMON_ENRICHED_CANDIDATE_SCHEMA,
  COMMON_ENRICHED_CANDIDATE_STATUS,
  COMMON_ENRICHED_SOURCE_BINDING_SCHEMA,
  createCommonEnrichedPropertiesCandidate,
} from './candidate.js';
import { requireCommonEnrichedComponentWeightResolution } from './component-weight-resolution.js';
import { requireCommonEnrichedFluidResolution } from './fluid-register-resolution.js';
import { requireCommonEnrichedInsulationResolution } from './insulation-register-resolution.js';
import { requireCommonEnrichedLineListResolution } from './line-list-resolution.js';
import { requireCommonEnrichedMaterialResolution } from './material-register-resolution.js';
import { requireCommonEnrichedPipingClassResolution } from './piping-class-resolution.js';
import { requireEngineeringMasterSnapshot } from './source-snapshot.js';
import {
  COMMON_ENRICHED_TARGET_RECORD_SCHEMA,
  createCommonEnrichedTargetRecord,
} from './target-record.js';
import { requireCommonEnrichedTargetInventory } from './target-inventory.js';
import {
  compareAscii,
  requireArray,
  requireExactKeys,
  requireIdentity,
  requireIsoDateTime,
  requirePositiveInteger,
  requireSemanticHash,
} from './validation.js';

export const COMMON_ENRICHED_CANDIDATE_ASSEMBLY_SCHEMA =
  'common-enriched-candidate-assembly/v1';

const REQUIRED_SNAPSHOT_KINDS = Object.freeze([
  'COMPONENT_WEIGHT_MASTER',
  'FLUID_REGISTER',
  'INSULATION_REGISTER',
  'LINE_LIST',
  'MATERIAL_REGISTER',
  'PIPING_CLASS',
]);

export function createCommonEnrichedCandidateFromExactResolutions(input) {
  requireExactKeys(
    input,
    [
      'schema',
      'candidateId',
      'projectId',
      'revision',
      'createdAt',
      'reviewLedgerHash',
      'inventory',
      'snapshots',
      'lineListResolution',
      'pipingClassResolution',
      'materialResolution',
      'fluidResolution',
      'insulationResolution',
      'componentWeightResolution',
    ],
    'candidateAssemblyDraft',
  );
  if (input.schema !== COMMON_ENRICHED_CANDIDATE_ASSEMBLY_SCHEMA) {
    failCommonEnrichment(
      'candidateAssemblyDraft.schema is unsupported.',
      'COMMON_ENRICHED_SCHEMA_INVALID',
    );
  }

  const inventory = requireCommonEnrichedTargetInventory(input.inventory);
  const snapshots = normalizeSnapshots(input.snapshots);
  const lineList = requireCommonEnrichedLineListResolution(input.lineListResolution);
  const pipingClass = requireCommonEnrichedPipingClassResolution(input.pipingClassResolution);
  const material = requireCommonEnrichedMaterialResolution(input.materialResolution);
  const fluid = requireCommonEnrichedFluidResolution(input.fluidResolution);
  const insulation = requireCommonEnrichedInsulationResolution(input.insulationResolution);
  const componentWeight = requireCommonEnrichedComponentWeightResolution(
    input.componentWeightResolution,
  );

  requireDependencyChain({
    inventory,
    snapshots,
    lineList,
    pipingClass,
    material,
    fluid,
    insulation,
    componentWeight,
  });

  const lineSets = [lineList, pipingClass, material, fluid, insulation];
  lineSets.forEach((resolution) => requireLineCoverage(inventory, resolution));
  requireComponentCoverage(inventory, componentWeight);

  const targetRecords = [
    ...mergeLineRecords(inventory, lineSets),
    ...copyComponentRecords(inventory, componentWeight),
  ].sort(by('targetId'));

  const sourceSnapshots = snapshots.map((snapshot) => deepFreeze({
    schema: COMMON_ENRICHED_SOURCE_BINDING_SCHEMA,
    sourceKey: snapshot.sourceKey,
    sourceHash: snapshot.sourceHash,
    snapshotSemanticHash: snapshot.semanticHash,
  })).sort(by('sourceKey'));

  return createCommonEnrichedPropertiesCandidate({
    schema: COMMON_ENRICHED_CANDIDATE_SCHEMA,
    candidateId: requireIdentity(input.candidateId, 'candidateAssembly.candidateId'),
    projectId: requireIdentity(input.projectId, 'candidateAssembly.projectId'),
    revision: requirePositiveInteger(input.revision, 'candidateAssembly.revision'),
    createdAt: requireIsoDateTime(input.createdAt, 'candidateAssembly.createdAt'),
    status: COMMON_ENRICHED_CANDIDATE_STATUS,
    sourceModelHash: inventory.sourceModelHash,
    sourceSnapshots,
    targetRecords,
    reviewLedgerHash: requireSemanticHash(
      input.reviewLedgerHash,
      'candidateAssembly.reviewLedgerHash',
    ),
  });
}

function normalizeSnapshots(value) {
  const snapshots = requireArray(value, 'candidateAssembly.snapshots')
    .map(requireEngineeringMasterSnapshot)
    .sort(by('sourceKind'));
  if (snapshots.length !== REQUIRED_SNAPSHOT_KINDS.length
    || snapshots.some((snapshot, index) => snapshot.sourceKind !== REQUIRED_SNAPSHOT_KINDS[index])) {
    failCommonEnrichment(
      'candidate assembly requires exactly one snapshot of every exact source kind.',
      'COMMON_ENRICHED_CANDIDATE_SNAPSHOT_SET_INVALID',
      { expected: REQUIRED_SNAPSHOT_KINDS, actual: snapshots.map((snapshot) => snapshot.sourceKind) },
    );
  }
  if (new Set(snapshots.map((snapshot) => snapshot.sourceKey)).size !== snapshots.length) {
    failCommonEnrichment(
      'candidate source snapshot keys must be unique.',
      'COMMON_ENRICHED_DUPLICATE_IDENTITY',
      { identityField: 'sourceKey' },
    );
  }
  return Object.freeze(snapshots);
}

function requireDependencyChain(context) {
  const {
    inventory,
    snapshots,
    lineList,
    pipingClass,
    material,
    fluid,
    insulation,
    componentWeight,
  } = context;
  requireHashEqual(
    lineList.inventorySemanticHash,
    inventory.semanticHash,
    'line-list inventory',
  );
  requireHashEqual(
    pipingClass.lineListResolutionSemanticHash,
    lineList.semanticHash,
    'piping-class line-list dependency',
  );
  requireHashEqual(
    material.pipingClassResolutionSemanticHash,
    pipingClass.semanticHash,
    'material piping-class dependency',
  );
  requireHashEqual(
    fluid.lineListResolutionSemanticHash,
    lineList.semanticHash,
    'fluid line-list dependency',
  );
  requireHashEqual(
    insulation.lineListResolutionSemanticHash,
    lineList.semanticHash,
    'insulation line-list dependency',
  );
  requireHashEqual(
    componentWeight.inventorySemanticHash,
    inventory.semanticHash,
    'component-weight inventory dependency',
  );
  requireHashEqual(
    componentWeight.sourceModelHash,
    inventory.sourceModelHash,
    'component-weight source model dependency',
  );
  requireHashEqual(
    componentWeight.lineListResolutionSemanticHash,
    lineList.semanticHash,
    'component-weight line-list dependency',
  );

  const byKind = new Map(snapshots.map((snapshot) => [snapshot.sourceKind, snapshot]));
  requireHashEqual(lineList.snapshotSemanticHash, byKind.get('LINE_LIST').semanticHash, 'line-list snapshot');
  requireHashEqual(pipingClass.snapshotSemanticHash, byKind.get('PIPING_CLASS').semanticHash, 'piping-class snapshot');
  requireHashEqual(material.snapshotSemanticHash, byKind.get('MATERIAL_REGISTER').semanticHash, 'material snapshot');
  requireHashEqual(fluid.snapshotSemanticHash, byKind.get('FLUID_REGISTER').semanticHash, 'fluid snapshot');
  requireHashEqual(insulation.snapshotSemanticHash, byKind.get('INSULATION_REGISTER').semanticHash, 'insulation snapshot');
  requireHashEqual(componentWeight.snapshotSemanticHash, byKind.get('COMPONENT_WEIGHT_MASTER').semanticHash, 'component-weight snapshot');
}

function requireLineCoverage(inventory, resolution) {
  const expected = inventory.lineTargets.map((target) => target.targetId);
  const actual = resolution.targetRecords.map((record) => record.targetId);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    failCommonEnrichment(
      'Line resolution target coverage differs from the inventory.',
      'COMMON_ENRICHED_CANDIDATE_TARGET_COVERAGE_INVALID',
      { resolutionId: resolution.resolutionId, expected, actual },
    );
  }
  const inventoryById = new Map(inventory.lineTargets.map((target) => [target.targetId, target]));
  for (const record of resolution.targetRecords) {
    const target = inventoryById.get(record.targetId);
    if (record.targetKind !== 'LINE'
      || record.sourceModelHash !== inventory.sourceModelHash
      || record.sourceRecordId !== target.targetId
      || record.lineKey !== target.lineKey) {
      failCommonEnrichment(
        'Line resolution record differs from the target inventory.',
        'COMMON_ENRICHED_TARGET_RELATIONSHIP_INVALID',
        { targetId: record.targetId },
      );
    }
  }
}

function requireComponentCoverage(inventory, resolution) {
  const expected = inventory.componentTargets.map((target) => target.targetId);
  const actual = resolution.targetRecords.map((record) => record.targetId);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    failCommonEnrichment(
      'Component-weight target coverage diffrs from the inventory.',
      'COMMON_ENRICHED_CANDIDATE_TARGET_COVERAGE_INVALID',
      { resolutionId: resolution.resolutionId, expected, actual },
    );
  }
  const inventoryById = new Map(
    inventory.componentTargets.map((target) => [target.targetId, target]),
  );
  for (const record of resolution.targetRecords) {
    const target = inventoryById.get(record.targetId);
    if (record.targetKind !== 'COMPONENT'
      || record.sourceModelHash !== inventory.sourceModelHash
      || record.sourceRecordId !== target.sourceRecordId
      || record.lineKey !== target.lineKey) {
      failCommonEnrichment(
        'Component resolution record differs from the target inventory.',
        'COMMON_ENRICHED_TARGET_RELATIONSHIP_INVALID',
        { targetId: record.targetId },
      );
    }
  }
}

function mergeLineRecords(inventory, lineSets) {
  const recordsByResolution = lineSets.map((resolution) => new Map(
    resolution.targetRecords.map((record) => [record.targetId, record]),
  ));
  return inventory.lineTargets.map((target) => {
    const fields = [];
    const fieldOwners = new Map();
    lineSets.forEach((resolution, resolutionIndex) => {
      const record = recordsByResolution[resolutionIndex].get(target.targetId);
      for (const field of record.fields) {
        const existing = fieldOwners.get(field.field);
        if (existing) {
          failCommonEnrichment(
            'Candidate assembly encountered multiple authorities for one target field.',
            'COMMON_ENRICHED_CANDIDATE_FIELD_CONFLICT',
            {
              targetId: target.targetId,
              field: field.field,
              resolutionIds: [existing, resolution.resolutionId].sort(compareAscii),
            },
          );
        }
        fieldOwners.set(field.field, resolution.resolutionId);
        fields.push(field);
      }
    });
    fields.sort(by('field'));
    return createCommonEnrichedTargetRecord({
      schema: COMMON_ENRICHED_TARGET_RECORD_SCHEMA,
      targetId: target.targetId,
      targetKind: 'LINE',
      sourceModelHash: inventory.sourceModelHash,
      sourceRecordId: target.targetId,
      lineKey: target.lineKey,
      fields,
    });
  });
}

function copyComponentRecords(inventory, resolution) {
  const byId = new Map(resolution.targetRecords.map((record) => [record.targetId, record]));
  return inventory.componentTargets.map((target) => {
    const record = byId.get(target.targetId);
    return createCommonEnrichedTargetRecord({
      schema: COMMON_ENRICHED_TARGET_RECORD_SCHEMA,
      targetId: record.targetId,
      targetKind: 'COMPONENT',
      sourceModelHash: inventory.sourceModelHash,
      sourceRecordId: record.sourceRecordId,
      lineKey: record.lineKey,
      fields: record.fields,
    });
  });
}

function requireHashEqual(actual, expected, label) {
  if (actual !== expected) {
    failCommonEnrichment(
      `${label} semantic hash differs from its required dependency.`,
      'COMMON_ENRICHED_CANDIDATE_DEPENDENCY_MISMATCH',
      { label, expected, actual },
    );
  }
}

function by(field) {
  return (left, right) => compareAscii(left[field], right[field]);
}
