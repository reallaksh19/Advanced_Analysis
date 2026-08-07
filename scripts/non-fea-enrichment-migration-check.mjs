import assert from 'node:assert/strict';
import {
  createEnrichedSharedModelProjection as createLegacyProjection,
} from '../src/core/first-cut-load-estimation/index.js';
import {
  NON_FEA_ENRICHMENT_SCHEMAS,
  createNonFeaEnrichedProjection,
  createNonFeaEnrichmentImpactPreview,
  createNonFeaEnrichmentRecord,
  createNonFeaEnrichmentSidecar,
  listNonFeaEnrichmentFields,
  migrateFirstCutEnrichment,
  resolveNonFeaEnrichment,
} from '../src/core/non-fea-enrichment/index.js';
import {
  NON_FEA_APPROVED_MASTER_SNAPSHOT_SCHEMA,
  NON_FEA_MASTER_EXACT_ADAPTER_POLICY_SCHEMA,
  NON_FEA_MASTER_EXACT_CANDIDATE_BATCH_SCHEMA,
  buildNonFeaApprovedMasterCandidateBatch,
  createNonFeaApprovedMasterSnapshot,
  createNonFeaMasterExactAdapterPolicy,
  validateNonFeaMasterExactCandidateBatch,
} from '../src/core/non-fea-enrichment/master-exact-candidates.js';
import { createSharedPipingModel } from '../src/core/shared-piping-model/index.js';
import { NON_FEA_FIELD_REGISTRY } from '../src/workspace/project-data/non-fea-field-registry.js';
import { NonFeaEnrichmentStore } from '../src/workspace/enrichment/non-fea-enrichment-store.js';
import { buildStraightFixture } from './w10.5-screening-fixtures.mjs';

const fixture = buildStraightFixture({ lengthsM: [2], pipeMassKgM: 10, opeFluidKgM: 2, hydFluidKgM: 3 });
const sourceModel = fixture.sharedModel;
const sourceHashBefore = sourceModel.semanticHash;
const sourceComponentBefore = JSON.stringify(sourceModel.components[0]);
const sourceSupportCount = sourceModel.supports.length;

checkFieldRegistryParity();
checkLegacyMigrationAndProjection();
checkSourcePrecedence();
checkConflictRejection();
checkDisallowedAuthority();
checkUnmatchedSelector();
checkLegacyPrecedenceDiscrepancy();
checkBlockedMigrationCannotBeAccepted();
checkSensitivityDoesNotRemoveSupport();
checkSourceBindingStaleness();
checkTamperedSidecarImport();
checkApprovedMasterExactCandidateAutomation();

assert.equal(sourceModel.semanticHash, sourceHashBefore, 'source semantic hash changed');
assert.equal(JSON.stringify(sourceModel.components[0]), sourceComponentBefore, 'source component was mutated');
assert.equal(sourceModel.supports.length, sourceSupportCount, 'source support membership changed');

console.log(JSON.stringify({
  phase: 3,
  migratedFields: listNonFeaEnrichmentFields().length,
  sourceImmutable: true,
  exactSelectors: true,
  fieldAuthorityEnforced: true,
  sameAuthorityConflictsBlocked: true,
  legacyPrecedenceDiscrepancyBlocked: true,
  blockedMigrationAcceptanceRejected: true,
  tamperedSidecarRejected: true,
  supportSensitivityIsImpactOnly: true,
  sourceBoundStaleness: true,
  firstCutValueParity: true,
  approvedMasterSnapshots: true,
  approvedMasterExactCandidateAutomation: true,
  fuzzyMasterAuthorityRejected: true,
  masterCandidatesRemainProposalOnly: true,
}, null, 2));

function checkFieldRegistryParity() {
  const registryIds = new Set(NON_FEA_FIELD_REGISTRY.fields.map((row) => row.fieldId));
  for (const definition of listNonFeaEnrichmentFields()) {
    assert.ok(registryIds.has(definition.fieldId), `Phase 3 field ${definition.fieldId} is absent from the authority registry`);
  }
}

function checkLegacyMigrationAndProjection() {
  const legacyRecord = {
    recordId: 'MASTER-EI-1',
    selectorKind: 'ENTITY',
    selectorKey: 'COMP-1',
    fieldId: 'flexuralRigidityNm2',
    value: 2500000,
    unit: 'N*m2',
    sourceId: '[SIMULATED] MASTER',
    revision: '1',
  };
  const report = migrateFirstCutEnrichment({
    sourceSemanticHash: sourceModel.semanticHash,
    masterData: { schema: 'first-cut-master-data/v1', sourceId: '[SIMULATED] MASTER', revision: '1', records: [legacyRecord] },
    bindings: [],
  });
  assert.equal(report.schema, NON_FEA_ENRICHMENT_SCHEMAS.LEGACY_MIGRATION);
  assert.equal(report.status, 'READY_FOR_REVIEW');
  assert.equal(report.records[0].fieldId, 'FLEXURAL_RIGIDITY');
  assert.equal(report.records[0].authority, 'EXACT_APPROVED_MASTER');

  const sidecar = createNonFeaEnrichmentSidecar({ sourceSemanticHash: sourceModel.semanticHash, records: report.records });
  const ledger = resolveNonFeaEnrichment({ sourceModel, sidecar });
  assert.equal(ledger.status, 'READY', ledger.blockers.map((row) => row.message).join('\n'));
  const projection = createNonFeaEnrichedProjection({ sourceModel, resolutionLedger: ledger });
  const impact = createNonFeaEnrichmentImpactPreview({ resolutionLedger: ledger });
  assert.equal(projection.schema, NON_FEA_ENRICHMENT_SCHEMAS.ENRICHED_PROJECTION);
  assert.equal(projection.enrichedModel.components[0].engineeringProperties.flexuralRigidityNm2.value, 2500000);
  assert.equal(sourceModel.components[0].engineeringProperties.flexuralRigidityNm2, undefined);
  assert.equal(projection.enrichedModel.supports.length, sourceSupportCount);
  assert.equal(impact.sourceMutation, false);
  assert.equal(impact.topologyMutation, false);
  assert.equal(impact.supportRemoval, false);
  assert.ok(impact.invalidatedDerivedModels.includes('vertical-beam-foundation'));

  const legacyProjection = createLegacyProjection({
    sourceModel,
    bindings: [{ ...legacyRecord, authorityLevel: 'AUTHORIZED_MASTER' }],
  });
  assert.equal(
    projection.enrichedModel.components[0].engineeringProperties.flexuralRigidityNm2.value,
    legacyProjection.enrichedModel.components[0].engineeringProperties.flexuralRigidityNm2.value,
    'equivalent migrated field changed its engineering value',
  );
}

function checkSourcePrecedence() {
  const sidecar = createNonFeaEnrichmentSidecar({
    sourceSemanticHash: sourceModel.semanticHash,
    records: [record({
      recordId: 'OVERRIDE-PIPE-WEIGHT',
      fieldId: 'UNIT_PIPE_WEIGHT',
      value: 99,
      unit: 'kg/m',
      authority: 'ACCEPTED_OVERRIDE',
    })],
  });
  const ledger = resolveNonFeaEnrichment({ sourceModel, sidecar });
  assert.equal(ledger.status, 'READY');
  const row = ledger.rows.find((item) => item.fieldId === 'UNIT_PIPE_WEIGHT');
  assert.equal(row.selected.authority, 'SOURCE_EXPLICIT');
  assert.equal(row.selected.value, 10);
}

function checkConflictRejection() {
  assert.throws(() => createNonFeaEnrichmentSidecar({
    sourceSemanticHash: sourceModel.semanticHash,
    records: [
      record({ recordId: 'CONFLICT-A', fieldId: 'FLEXURAL_RIGIDITY', value: 1, unit: 'N*m2', authority: 'ACCEPTED_OVERRIDE' }),
      record({ recordId: 'CONFLICT-B', fieldId: 'FLEXURAL_RIGIDITY', value: 2, unit: 'N*m2', authority: 'ACCEPTED_OVERRIDE' }),
    ],
  }), /Ambiguous same-authority/u);
}

function checkDisallowedAuthority() {
  assert.throws(() => createNonFeaEnrichmentRecord({
    recordId: 'BAD-SENSITIVITY-MASTER',
    selectorKind: 'ENTITY',
    selectorKey: sourceModel.supports[0].supportKey,
    fieldId: 'SUPPORT_AVAILABILITY_SENSITIVITY',
    value: 'USER-DECLARED SUPPORT-UNAVAILABLE SENSITIVITY',
    unit: '1',
    authority: 'EXACT_APPROVED_MASTER',
    sourceId: 'UNAUTHORIZED-MASTER',
    revision: '1',
    evidence: { source: 'UNAUTHORIZED-MASTER' },
  }), /not permitted/u);
}

function checkUnmatchedSelector() {
  const sidecar = createNonFeaEnrichmentSidecar({
    sourceSemanticHash: sourceModel.semanticHash,
    records: [record({ recordId: 'NO-MATCH', selectorKey: 'DOES-NOT-EXIST', fieldId: 'FLEXURAL_RIGIDITY', value: 1, unit: 'N*m2' })],
  });
  const ledger = resolveNonFeaEnrichment({ sourceModel, sidecar });
  assert.equal(ledger.status, 'BLOCKED');
  assert.ok(ledger.blockers.some((row) => row.code === 'SELECTOR_NOT_MATCHED'));
}

function conflictingLegacyReport() {
  const base = {
    selectorKind: 'ENTITY', selectorKey: 'COMP-1', fieldId: 'flexuralRigidityNm2', unit: 'N*m2', sourceId: 'LEGACY', revision: '1',
  };
  return migrateFirstCutEnrichment({
    sourceSemanticHash: sourceModel.semanticHash,
    masterData: { schema: 'first-cut-master-data/v1', sourceId: 'MASTER', revision: '1', records: [{ ...base, recordId: 'MASTER', value: 1 }] },
    bindings: [{ ...base, recordId: 'OVERRIDE', value: 2, authorityLevel: 'ACCEPTED_OVERRIDE' }],
  });
}

function checkLegacyPrecedenceDiscrepancy() {
  const report = conflictingLegacyReport();
  assert.equal(report.status, 'BLOCKED');
  assert.ok(report.blockers.some((row) => row.code === 'LEGACY_PRECEDENCE_CHANGE_REQUIRES_DECISION'));
}

function checkBlockedMigrationCannotBeAccepted() {
  const store = new NonFeaEnrichmentStore();
  store.loadSource(sourceModel.semanticHash);
  const report = conflictingLegacyReport();
  store.stageMigratedRecords(report);
  assert.ok(store.getSnapshot().proposals.length > 0);
  assert.throws(
    () => store.acceptProposal(store.getSnapshot().proposals[0].proposalId),
    /Resolve all migration blockers/u,
  );
}

function checkSensitivityDoesNotRemoveSupport() {
  const supportKey = sourceModel.supports[0].supportKey;
  const report = migrateFirstCutEnrichment({
    sourceSemanticHash: sourceModel.semanticHash,
    bindings: [{
      recordId: 'SENSITIVITY-1',
      selectorKind: 'ENTITY',
      selectorKey: supportKey,
      fieldId: 'supportAvailabilitySensitivity',
      value: 'USER-DECLARED SUPPORT-UNAVAILABLE SENSITIVITY',
      unit: '1',
      sourceId: 'REVIEWED-SENSITIVITY',
      revision: '1',
      authorityLevel: 'ACCEPTED_OVERRIDE',
    }],
  });
  assert.equal(report.status, 'READY_FOR_REVIEW');
  const sidecar = createNonFeaEnrichmentSidecar({ sourceSemanticHash: sourceModel.semanticHash, records: report.records });
  const ledger = resolveNonFeaEnrichment({ sourceModel, sidecar });
  assert.equal(ledger.status, 'READY');
  const projection = createNonFeaEnrichedProjection({ sourceModel, resolutionLedger: ledger });
  const impact = createNonFeaEnrichmentImpactPreview({ resolutionLedger: ledger });
  assert.equal(projection.enrichedModel.supports.length, sourceSupportCount, 'common sensitivity removed a support');
  assert.ok(impact.affectedEntities.some((row) => row.fieldId === 'SUPPORT_AVAILABILITY_SENSITIVITY' && row.sensitivityOnly));
  assert.equal(impact.supportRemoval, false);
}

function checkSourceBindingStaleness() {
  const store = new NonFeaEnrichmentStore();
  store.loadSource(sourceModel.semanticHash);
  store.stageProposal({
    proposalId: 'STORE-EI',
    rationale: 'Store source-binding fixture.',
    record: record({ recordId: 'STORE-EI', fieldId: 'FLEXURAL_RIGIDITY', value: 3, unit: 'N*m2' }),
  });
  store.acceptProposal('STORE-EI');
  assert.equal(store.getSnapshot().stale, false);
  store.loadSource('fnv1a64:0000000000000000');
  assert.equal(store.getSnapshot().stale, true);
  store.stageProposal({
    proposalId: 'STORE-EI-2',
    rationale: 'Stale acceptance fixture.',
    record: record({ recordId: 'STORE-EI-2', fieldId: 'SECOND_MOMENT_AREA', value: 4, unit: 'mm4' }),
  });
  assert.throws(() => store.acceptProposal('STORE-EI-2'), /stale/i);
}

function checkTamperedSidecarImport() {
  const store = new NonFeaEnrichmentStore();
  store.loadSource(sourceModel.semanticHash);
  const valid = createNonFeaEnrichmentSidecar({
    sourceSemanticHash: sourceModel.semanticHash,
    records: [record({ recordId: 'IMPORT-SIDECAR', fieldId: 'FLEXURAL_RIGIDITY', value: 7, unit: 'N*m2' })],
  });
  assert.throws(
    () => store.importAcceptedSidecar({ ...valid, semanticHash: 'fnv1a64:0000000000000000' }),
    /semantic hash is invalid/u,
  );
  store.importAcceptedSidecar(valid);
  assert.equal(store.getSnapshot().acceptedRecords.length, 1);
}

function checkApprovedMasterExactCandidateAutomation() {
  const approvedAt = '2026-08-07T12:00:00.000Z';
  const snapshotInput = {
    masterKey: 'weight',
    source: {
      fileName: 'approved-weights.xlsx',
      sheetName: 'Weights',
      sha256: 'a'.repeat(64),
      byteLength: 4096,
    },
    mapping: { bore: 'Bore', valveType: 'Type', weight: 'Weight' },
    normalizedRows: [
      { _sourceRowIndex: 0, _sourceRowNumber: 2, bore: 50, valveType: 'GATE', weight: 25 },
      { _sourceRowIndex: 1, _sourceRowNumber: 3, bore: 80, valveType: 'GLOBE', weight: 30 },
    ],
    diagnostics: [{ code: 'VALID', message: 'Approved fixture.' }],
    approval: { status: 'APPROVED', approvedBy: 'qualification-fixture', approvedAt, basis: 'Exact reviewed master mapping.' },
  };
  const firstSnapshot = createNonFeaApprovedMasterSnapshot(snapshotInput);
  const reorderedSnapshot = createNonFeaApprovedMasterSnapshot({
    ...snapshotInput,
    mapping: { weight: 'Weight', valveType: 'Type', bore: 'Bore' },
    normalizedRows: [...snapshotInput.normalizedRows].reverse(),
  });
  assert.equal(firstSnapshot.schema, NON_FEA_APPROVED_MASTER_SNAPSHOT_SCHEMA);
  assert.equal(firstSnapshot.semanticHash, reorderedSnapshot.semanticHash, 'approved master snapshot must be deterministic');
  assert.throws(() => createNonFeaApprovedMasterSnapshot({
    ...snapshotInput,
    approval: { ...snapshotInput.approval, status: 'DRAFT' },
  }), /explicitly APPROVED/u);

  const policyInput = {
    schema: NON_FEA_MASTER_EXACT_ADAPTER_POLICY_SCHEMA,
    policyId: 'weight:component-type-bore:v1',
    masterKey: 'weight',
    fieldId: 'COMPONENT_WEIGHT',
    selectorKind: 'COMPONENT_TYPE_BORE',
    selectorMap: { bore: 'bore', componentType: 'valveType' },
    valueColumn: 'weight',
    valueKind: 'NUMBER',
    unit: 'kg',
  };
  const policy = createNonFeaMasterExactAdapterPolicy(policyInput);
  assert.throws(() => createNonFeaMasterExactAdapterPolicy({
    ...policyInput,
    selectorKind: 'FUZZY_COMPONENT_NAME',
    selectorMap: { name: 'valveType' },
  }), /Selector kind must be one of/u);

  const exactSource = masterExactSourceModel();
  const matchingSnapshot = createNonFeaApprovedMasterSnapshot({
    ...snapshotInput,
    normalizedRows: [snapshotInput.normalizedRows[0]],
  });
  const batch = buildNonFeaApprovedMasterCandidateBatch({
    sourceModel: exactSource,
    approvedMasterSnapshot: matchingSnapshot,
    policy,
  });
  assert.equal(batch.schema, NON_FEA_MASTER_EXACT_CANDIDATE_BATCH_SCHEMA);
  assert.equal(batch.status, 'READY_FOR_REVIEW');
  assert.equal(batch.proposalOnly, true);
  assert.equal(batch.acceptedRecordCreated, false);
  assert.equal(batch.proposals.length, 2, 'broad exact selector should fan out to exact entity proposals');
  assert.ok(batch.proposals.every((proposal) => proposal.record.selectorKind === 'ENTITY'));
  assert.ok(batch.proposals.every((proposal) => proposal.record.authority === 'EXACT_APPROVED_MASTER'));
  assert.ok(batch.proposals.every((proposal) => proposal.record.evidence.matchMode === 'EXACT'));
  assert.ok(batch.proposals.every((proposal) => proposal.record.evidence.sourceSemanticHash === exactSource.semanticHash));
  assert.equal(validateNonFeaMasterExactCandidateBatch(batch), batch);

  const store = new NonFeaEnrichmentStore();
  store.loadSource(exactSource.semanticHash);
  store.stageMasterCandidateBatch(batch);
  assert.equal(store.getSnapshot().acceptedRecords.length, 0, 'Master candidate automation must not auto-accept records');
  assert.equal(store.getSnapshot().proposals.length, 2);
  store.acceptProposal(store.getSnapshot().proposals[0].proposalId, { acceptanceBasis: 'Reviewed exact approved-master candidate.' });
  assert.equal(store.getSnapshot().acceptedRecords.length, 1);
  assert.equal(store.getSnapshot().acceptedRecords[0].authority, 'EXACT_APPROVED_MASTER');

  const staleStore = new NonFeaEnrichmentStore();
  staleStore.loadSource(exactSource.semanticHash);
  staleStore.stageMasterCandidateBatch(batch);
  staleStore.loadSource('fnv1a64:0000000000000000');
  assert.throws(
    () => staleStore.acceptProposal(staleStore.getSnapshot().proposals[0].proposalId),
    /proposal is stale/u,
  );

  const noMatchSnapshot = createNonFeaApprovedMasterSnapshot({
    ...snapshotInput,
    normalizedRows: [{ _sourceRowIndex: 0, _sourceRowNumber: 2, bore: 999, valveType: 'GATE', weight: 25 }],
  });
  const noMatch = buildNonFeaApprovedMasterCandidateBatch({ sourceModel: exactSource, approvedMasterSnapshot: noMatchSnapshot, policy });
  assert.equal(noMatch.status, 'BLOCKED');
  assert.ok(noMatch.blockers.some((row) => row.code === 'MASTER_EXACT_SELECTOR_NOT_MATCHED'));

  const duplicateSnapshot = createNonFeaApprovedMasterSnapshot({
    ...snapshotInput,
    normalizedRows: [
      { _sourceRowIndex: 0, _sourceRowNumber: 2, bore: 50, valveType: 'GATE', weight: 25 },
      { _sourceRowIndex: 1, _sourceRowNumber: 3, bore: 50, valveType: 'GATE', weight: 26 },
    ],
  });
  const ambiguous = buildNonFeaApprovedMasterCandidateBatch({ sourceModel: exactSource, approvedMasterSnapshot: duplicateSnapshot, policy });
  assert.equal(ambiguous.status, 'BLOCKED');
  assert.equal(ambiguous.proposals.length, 0, 'ambiguous same-target Master rows must not produce proposal authority');
  assert.ok(ambiguous.blockers.some((row) => row.code === 'MASTER_TARGET_FIELD_AMBIGUOUS'));
  assert.throws(() => store.stageMasterCandidateBatch(ambiguous), /Blocked approved-master candidate batches/u);
}

function masterExactSourceModel() {
  const base = buildStraightFixture({
    lengthsM: [1, 1],
    componentTypes: ['GATE', 'GATE'],
    componentMassKg: 20,
    datasetId: 'WAVE-16-MASTER-EXACT',
  }).sharedModel;
  return createSharedPipingModel({
    project: base.project,
    units: base.units,
    sourceSnapshotRef: base.sourceSnapshotRef,
    components: base.components.map((component) => ({
      ...component,
      geometry: { ...component.geometry, boreMm: 50 },
    })),
    supports: base.supports,
    sourceReferences: base.sourceReferences,
    diagnostics: base.diagnostics,
  });
}

function record(overrides) {
  return createNonFeaEnrichmentRecord({
    recordId: overrides.recordId,
    selectorKind: overrides.selectorKind || 'ENTITY',
    selectorKey: overrides.selectorKey || 'COMP-1',
    fieldId: overrides.fieldId,
    value: overrides.value,
    unit: overrides.unit,
    authority: overrides.authority || 'ACCEPTED_OVERRIDE',
    sourceId: overrides.sourceId || 'PHASE-3-CHECK',
    revision: overrides.revision || '1',
    evidence: { source: overrides.sourceId || 'PHASE-3-CHECK', locator: overrides.selectorKey || 'COMP-1' },
    migration: overrides.migration || null,
  });
}
