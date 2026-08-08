import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { semanticHash } from '../src/core/shared-piping-model/canonical-json.js';
import {
  computeAuthorizedEmpiricalLoadInputSemanticHash,
  requireAuthorizedEmpiricalLoadInput,
} from '../src/workspace/engineering-loads/authorized-empirical-load-input.js';
import {
  AUTHORIZED_EMPIRICAL_LOAD_EXECUTION_V2_REQUEST_SCHEMA,
  calculateAuthorizedEmpiricalLoadExecutionV2,
} from '../src/workspace/engineering-loads/authorized-empirical-load-execution-v2.js';
import {
  AUTHORIZED_EMPIRICAL_LOAD_EXECUTION_V3_REQUEST_SCHEMA,
  AUTHORIZED_EMPIRICAL_LOAD_EXECUTION_V3_SCHEMA,
  applySealedComponentWeightEnrichmentToAuthorizedProfile,
  calculateAuthorizedEmpiricalLoadExecutionV3,
  requireAuthorizedEmpiricalLoadExecutionV3,
} from '../src/workspace/engineering-loads/authorized-empirical-load-execution-v3.js';
import {
  EMPIRICAL_LOAD_COG_METHOD,
  EMPIRICAL_LOAD_METHOD,
} from '../src/workspace/engineering-loads/support-load-distribution-v3.js';
import {
  createEmptyProjectDataProfile,
  createEvidenceValue,
  projectDataValue,
} from '../src/workspace/project-data/project-data-contract.js';
import {
  buildEnrichmentObservedAuthority,
} from '../src/workspace/engineering-enrichment/review-package-validation.js';
import {
  buildEngineeringEnrichmentApproval,
  buildEngineeringInputSeal,
  evaluateEngineeringInputSealCurrentness,
} from '../src/workspace/engineering-enrichment/input-seal.js';
import {
  ENRICHMENT_PRODUCTION_COMPONENT_WEIGHT_OVERLAY_SCHEMA,
  assertEnrichmentProductionComponentWeightOverlay,
  buildEnrichmentProductionComponentWeightOverlay,
} from '../src/workspace/engineering-enrichment/production-component-weight-overlay.js';

const HASHES = Object.freeze({
  dataset: '1'.repeat(64),
  lineList: '2'.repeat(64),
  pipingClass: '3'.repeat(64),
  componentWeight: '4'.repeat(64),
});
const authorizedInput = makeAuthorizedInput();
const fixtureInput = fixture({ x: 250, y: 0, z: 0 });
const candidate = candidateProjection(fixtureInput.dataset, [
  candidateRow('VALVE-1', 20, 'PROPOSAL:VALVE-1'),
]);
const governance = governedSeal(candidate);
const overlay = buildEnrichmentProductionComponentWeightOverlay({
  seal: governance.seal,
  currentness: governance.currentness,
  candidateProjection: candidate,
  dataset: fixtureInput.dataset,
});

assert.equal(overlay.schema, ENRICHMENT_PRODUCTION_COMPONENT_WEIGHT_OVERLAY_SCHEMA);
assert.equal(overlay.status, 'READY_FOR_PRODUCTION_CONSUMPTION');
assert.deepEqual(overlay.activatedFieldFamilies, ['COMPONENT_WEIGHTS']);
assert.deepEqual(overlay.componentWeightsKg, { 'CV-1': 20 });
assert.equal(overlay.bindings.length, 1);
assert.equal(overlay.bindings[0].targetId, 'VALVE-1');
assert.equal(overlay.bindings[0].resolverKey, 'CV-1');
assert.equal(overlay.bindings[0].resolverKeyBasis, 'CATALOG_KEY');
assert.equal(overlay.policy.componentWeightsActivated, true);
assert.equal(overlay.policy.fluidDensitiesActivated, false);
assert.equal(overlay.policy.materialDensitiesActivated, false);
assert.equal(overlay.policy.pipeSectionsActivated, false);
assert.equal(overlay.policy.partialProductionOverlayPermitted, false);
assert.equal(overlay.calculationExecutionPerformed, false);
assert.equal(assertEnrichmentProductionComponentWeightOverlay(overlay), overlay);

const baseProfileSnapshot = JSON.stringify(fixtureInput.profile);
const authorizedInputSnapshot = JSON.stringify(authorizedInput);
const datasetSnapshot = JSON.stringify(fixtureInput.dataset);
const effectiveProfile = applySealedComponentWeightEnrichmentToAuthorizedProfile(
  fixtureInput.profile,
  authorizedInput,
  overlay,
);
assert.deepEqual(projectDataValue(effectiveProfile, 'loadCalculation.componentWeightsKg'), { 'CV-1': 20 });
assert.deepEqual(
  projectDataValue(effectiveProfile, 'loadCalculation.pipeSectionProperties'),
  authorizedInput.loadCalculationOverlay.pipeSectionProperties,
);
assert.deepEqual(
  projectDataValue(effectiveProfile, 'loadCalculation.materialDensitiesKgPerM3'),
  authorizedInput.loadCalculationOverlay.materialDensitiesKgPerM3,
);
assert.deepEqual(
  projectDataValue(effectiveProfile, 'loadCalculation.operatingFluidDensitiesKgPerM3'),
  authorizedInput.loadCalculationOverlay.operatingFluidDensitiesKgPerM3,
);
assert.deepEqual(
  projectDataValue(effectiveProfile, 'loadCalculation.hydroFluidDensitiesKgPerM3'),
  authorizedInput.loadCalculationOverlay.hydroFluidDensitiesKgPerM3,
);

const baseV2 = executeV2(EMPIRICAL_LOAD_METHOD);
const enrichedV2 = executeV3(EMPIRICAL_LOAD_METHOD, overlay);
const baseCog = executeV2(EMPIRICAL_LOAD_COG_METHOD);
const enrichedCog = executeV3(EMPIRICAL_LOAD_COG_METHOD, overlay);

assert.equal(enrichedV2.schema, AUTHORIZED_EMPIRICAL_LOAD_EXECUTION_V3_SCHEMA);
assert.equal(enrichedV2.status, 'CALCULATED');
assert.equal(enrichedV2.requestedMethod, EMPIRICAL_LOAD_METHOD);
assert.equal(enrichedV2.executedMethod, EMPIRICAL_LOAD_METHOD);
assert.equal(enrichedV2.engineeringInputSealHash, governance.seal.sealHash);
assert.equal(
  enrichedV2.engineeringInputSealCurrentnessHash,
  governance.currentness.currentnessHash,
);
assert.equal(enrichedV2.componentWeightOverlayHash, overlay.overlayHash);
assert.deepEqual(enrichedV2.activatedEnrichmentFieldFamilies, ['COMPONENT_WEIGHTS']);
assert.equal(enrichedV2.baseOverlaySemanticHash, authorizedInput.overlaySemanticHash);
assert.equal(enrichedCog.requestedMethod, EMPIRICAL_LOAD_COG_METHOD);
assert.equal(enrichedCog.executedMethod, EMPIRICAL_LOAD_COG_METHOD);

const v2Delta = reactionDeltas(baseV2, enrichedV2);
const cogDelta = reactionDeltas(baseCog, enrichedCog);
assertClose(v2Delta[0], 49.05);
assertClose(v2Delta[1], 49.05);
assertClose(cogDelta[0], 73.575);
assertClose(cogDelta[1], 24.525);
assertClose(sum(v2Delta), 98.1);
assertClose(sum(cogDelta), 98.1);
assertClose(componentContribution(enrichedV2).forceN, 196.2);
assertClose(componentContribution(enrichedCog).forceN, 196.2);
assert.equal(pipeContribution(baseV2).forceN, pipeContribution(enrichedV2).forceN);
assert.equal(pipeContribution(baseCog).forceN, pipeContribution(enrichedCog).forceN);
assert.equal(enrichedV2.distribution.loadCases[0].equilibrium.forceResidualN, 0);
assert.equal(enrichedV2.distribution.loadCases[0].equilibrium.momentResidualNmm, 0);
assert.equal(enrichedCog.distribution.loadCases[0].equilibrium.forceResidualN, 0);
assert.equal(enrichedCog.distribution.loadCases[0].equilibrium.momentResidualNmm, 0);
assert.equal(componentContribution(baseCog).chainageMm, componentContribution(enrichedCog).chainageMm);

const repeated = executeV3(EMPIRICAL_LOAD_METHOD, overlay);
assert.deepEqual(repeated, enrichedV2, 'Package 5A production execution must be deterministic');
assert.equal(JSON.stringify(fixtureInput.profile), baseProfileSnapshot, '5A mutated Project Data profile');
assert.equal(JSON.stringify(authorizedInput), authorizedInputSnapshot, '5A mutated authorized input');
assert.equal(JSON.stringify(fixtureInput.dataset), datasetSnapshot, '5A mutated source dataset');

const staleObserved = buildEnrichmentObservedAuthority({
  ...governance.packet.evidenceRefs,
  numericalImpactHash: hash('numerical-impact-stale'),
  contextIdentities: governance.packet.contextIdentities,
});
const staleCurrentness = evaluateEngineeringInputSealCurrentness({
  seal: governance.seal,
  observedAuthority: staleObserved,
});
const staleOverlay = buildEnrichmentProductionComponentWeightOverlay({
  seal: governance.seal,
  currentness: staleCurrentness,
  candidateProjection: candidate,
  dataset: fixtureInput.dataset,
});
assert.equal(staleOverlay.status, 'BLOCKED');
assert.deepEqual(staleOverlay.componentWeightsKg, {});
assert.equal(hasBlocker(staleOverlay, 'ENRICHMENT_PRODUCTION_SEAL_NOT_CURRENT'), true);
assert.throws(
  () => executeV3(EMPIRICAL_LOAD_METHOD, staleOverlay),
  (error) => error.code === 'EMPIRICAL_EXECUTION_V3_ENRICHMENT_BLOCKED',
);

const changedCandidate = candidateProjection(fixtureInput.dataset, [
  candidateRow('VALVE-1', 21, 'PROPOSAL:VALVE-1'),
]);
const candidateMismatch = buildEnrichmentProductionComponentWeightOverlay({
  seal: governance.seal,
  currentness: governance.currentness,
  candidateProjection: changedCandidate,
  dataset: fixtureInput.dataset,
});
assert.equal(candidateMismatch.status, 'BLOCKED');
assert.deepEqual(candidateMismatch.componentWeightsKg, {});
assert.equal(hasBlocker(candidateMismatch, 'ENRICHMENT_PRODUCTION_CANDIDATE_SEAL_MISMATCH'), true);

const conflictDataset = twoComponentDatasetSameCatalogKey();
const conflictCandidate = candidateProjection(conflictDataset, [
  candidateRow('VALVE-1', 20, 'PROPOSAL:VALVE-1'),
  candidateRow('VALVE-2', 25, 'PROPOSAL:VALVE-2'),
]);
const conflictGovernance = governedSeal(conflictCandidate);
const conflictOverlay = buildEnrichmentProductionComponentWeightOverlay({
  seal: conflictGovernance.seal,
  currentness: conflictGovernance.currentness,
  candidateProjection: conflictCandidate,
  dataset: conflictDataset,
});
assert.equal(conflictOverlay.status, 'BLOCKED');
assert.deepEqual(conflictOverlay.componentWeightsKg, {});
assert.equal(hasBlocker(conflictOverlay, 'ENRICHMENT_PRODUCTION_COMPONENT_WEIGHT_KEY_CONFLICT'), true);

const missingEntityDataset = structuredClone(fixtureInput.dataset);
missingEntityDataset.entities = [];
const missingEntityOverlay = buildEnrichmentProductionComponentWeightOverlay({
  seal: governance.seal,
  currentness: governance.currentness,
  candidateProjection: candidate,
  dataset: missingEntityDataset,
});
assert.equal(missingEntityOverlay.status, 'BLOCKED');
assert.deepEqual(missingEntityOverlay.componentWeightsKg, {});
assert.equal(hasBlocker(missingEntityOverlay, 'ENRICHMENT_PRODUCTION_COMPONENT_ENTITY_AMBIGUOUS'), true);

const tamperedOverlay = structuredClone(overlay);
tamperedOverlay.componentWeightsKg['CV-1'] = 99;
assert.throws(
  () => assertEnrichmentProductionComponentWeightOverlay(tamperedOverlay),
  (error) => error.code === 'ENRICHMENT_PRODUCTION_OVERLAY_HASH_MISMATCH',
);

const tamperedExecution = structuredClone(enrichedV2);
tamperedExecution.engineeringInputSealHash = hash('other-seal');
assert.throws(
  () => requireAuthorizedEmpiricalLoadExecutionV3(tamperedExecution),
  (error) => error.code === 'EMPIRICAL_EXECUTION_V3_HASH_MISMATCH',
);

const broadenedExecution = structuredClone(enrichedV2);
broadenedExecution.activatedEnrichmentFieldFamilies = ['COMPONENT_WEIGHTS', 'MATERIAL_DENSITIES'];
assert.throws(
  () => requireAuthorizedEmpiricalLoadExecutionV3(broadenedExecution),
  (error) => error.code === 'EMPIRICAL_EXECUTION_V3_FIELD_FAMILY_INVALID',
);

const overlaySource = await readFile(
  new URL('../src/workspace/engineering-enrichment/production-component-weight-overlay.js', import.meta.url),
  'utf8',
);
const executionSource = await readFile(
  new URL('../src/workspace/engineering-loads/authorized-empirical-load-execution-v3.js', import.meta.url),
  'utf8',
);
assert.doesNotMatch(
  overlaySource,
  /support-load-distribution|calculateSupportLoadDistribution|solver|linear-fea|lafea|lfea/iu,
  'Production enrichment overlay must not contain calculation mechanics.',
);
assert.doesNotMatch(
  executionSource,
  /function\s+(distributePoint|distributeUniform|componentMass|resolveCaseMass)\b/iu,
  'V3 must reuse existing gravity mechanics rather than duplicating formulas.',
);

console.log(JSON.stringify({
  check: 'enrichment-package5a-component-weight-cutover',
  status: 'PASS',
  overlaySchema: overlay.schema,
  executionSchema: enrichedV2.schema,
  sealHash: governance.seal.sealHash,
  baseComponentWeightKg: authorizedInput.loadCalculationOverlay.componentWeightsKg['CV-1'],
  sealedComponentWeightKg: overlay.componentWeightsKg['CV-1'],
  v2ReactionDeltaN: v2Delta,
  v3CogReactionDeltaN: cogDelta,
  totalAppliedWeightDeltaN: sum(v2Delta),
  activatedFieldFamilies: enrichedV2.activatedEnrichmentFieldFamilies,
  staleSealFailsClosed: true,
  resolverKeyConflictFailsClosed: true,
  originalGravityMechanicsReused: true,
  sourceImmutable: true,
}, null, 2));

function executeV2(method) {
  return calculateAuthorizedEmpiricalLoadExecutionV2({
    schema: AUTHORIZED_EMPIRICAL_LOAD_EXECUTION_V2_REQUEST_SCHEMA,
    executionId: `BASE:${method}`,
    executedAt: '2026-08-08T05:40:00.000Z',
    method,
    authorizedInput,
    ...fixtureInput,
  });
}

function executeV3(method, sealedComponentWeightOverlay) {
  return calculateAuthorizedEmpiricalLoadExecutionV3({
    schema: AUTHORIZED_EMPIRICAL_LOAD_EXECUTION_V3_REQUEST_SCHEMA,
    executionId: `ENRICHED:${method}`,
    executedAt: '2026-08-08T05:41:00.000Z',
    method,
    authorizedInput,
    sealedComponentWeightOverlay,
    ...fixtureInput,
  });
}

function governedSeal(candidateValue) {
  const packet = reviewPacket(candidateValue);
  const observed = buildEnrichmentObservedAuthority({
    ...packet.evidenceRefs,
    contextIdentities: packet.contextIdentities,
  });
  const approval = buildEngineeringEnrichmentApproval({
    reviewPacket: packet,
    approvalId: `APPROVAL:${candidateValue.projectionHash}`,
    reviewerId: 'production-enrichment-reviewer',
    approvedAt: '2026-08-08T05:38:00.000Z',
    basis: 'Package 5A component-weight shadow evidence accepted.',
  });
  const seal = buildEngineeringInputSeal({
    reviewPacket: packet,
    observedAuthority: observed,
    approvals: [approval],
    sealId: `SEAL:${candidateValue.projectionHash}`,
    sealedBy: 'production-enrichment-governance',
    sealedAt: '2026-08-08T05:39:00.000Z',
  });
  const currentness = evaluateEngineeringInputSealCurrentness({
    seal,
    observedAuthority: observed,
  });
  return { packet, observed, approval, seal, currentness };
}

function candidateProjection(dataset, rows) {
  const sortedRows = [...rows].sort((left, right) => ascii(left.proposalId, right.proposalId));
  const dispositions = { SHADOW_CANDIDATE_VALUE: sortedRows.length };
  const material = {
    schema: 'EngineeringEnrichmentCandidateProjection.v2',
    sourceDatasetHash: dataset.sourceSha256,
    sourceSharedModelHash: dataset.sharedModel.semanticHash,
    sourceStructuralHash: hash(`structural:${dataset.datasetId}`),
    resolutionHash: hash(`resolution:${dataset.datasetId}:${semanticHash(sortedRows)}`),
    simulationMode: 'ALL_EXACT_MATCHES_SHADOW_ONLY',
    rows: sortedRows,
    summary: {
      proposalCount: sortedRows.length,
      projectedCandidateCount: sortedRows.length,
      blockedCount: 0,
      dispositions,
      status: 'READY_FOR_STRUCTURAL_IMPACT',
    },
    bindingCreated: false,
    reviewSelectionCreated: false,
    approvalGranted: false,
    current: false,
    sealEligible: false,
    calculationEligible: false,
  };
  return Object.freeze({ ...material, projectionHash: semanticHash(material) });
}

function candidateRow(targetId, proposedValue, proposalId) {
  return Object.freeze({
    proposalId,
    proposalHash: hash(`proposal:${proposalId}:${proposedValue}`),
    targetKind: 'COMPONENT',
    targetId,
    fieldId: 'componentWeightKg',
    proposedValue,
    unit: 'kg',
    authorityLevel: 'AUTHORIZED_MASTER_CANDIDATE',
    disposition: 'SHADOW_CANDIDATE_VALUE',
    blockers: [],
    existingExplicitEvidence: null,
    bindingCreated: false,
  });
}

function reviewPacket(candidateValue) {
  const evidenceRefs = {
    sourceDatasetHash: candidateValue.sourceDatasetHash,
    sourceSharedModelHash: candidateValue.sourceSharedModelHash,
    sourceStructuralHash: candidateValue.sourceStructuralHash,
    masterSnapshotHashes: [hash(`master:${candidateValue.sourceDatasetHash}`)],
    proposalHashes: candidateValue.rows.map((row) => row.proposalHash).sort(ascii),
    resolutionHash: candidateValue.resolutionHash,
    candidateProjectionHash: candidateValue.projectionHash,
    structuralImpactHash: hash(`structural-impact:${candidateValue.projectionHash}`),
    engineDescriptorHash: hash('engine-descriptor'),
    baselineReferenceHash: hash('baseline-reference'),
    baselineResultHash: hash('baseline-result'),
    candidateResultHash: hash(`candidate-result:${candidateValue.projectionHash}`),
    numericalImpactHash: hash(`numerical-impact:${candidateValue.projectionHash}`),
  };
  const contextIdentities = {
    projectDataHash: hash('project-data'),
    overrideSetHash: hash('overrides'),
    approximationSetHash: hash('approximations'),
    selectorRegistryHash: hash('selectors'),
  };
  const material = {
    schema: 'EngineeringEnrichmentReviewPacket.v1',
    evidenceRefs,
    contextIdentities,
    blockers: [],
    summary: {
      snapshotCount: 1,
      proposalCount: candidateValue.rows.length,
      step1Status: 'READY_FOR_REVIEW',
      candidateStatus: 'READY_FOR_STRUCTURAL_IMPACT',
      step2Status: 'PASS_SHADOW_NO_STRUCTURAL_CHANGE',
      step3Status: 'RECORDED_SHADOW_RAW_DELTAS',
      contextIdentityCount: 4,
      status: 'READY_FOR_REVIEW_ONLY',
    },
    status: 'READY_FOR_REVIEW_ONLY',
    reviewDecisionStatus: 'NOT_RECORDED',
    persistenceCreated: false,
    bindingCreated: false,
    reviewSelectionCreated: false,
    approvalGranted: false,
    current: false,
    sealEligible: false,
    calculationEligible: false,
    resultAcceptanceEligible: false,
  };
  return Object.freeze({ ...material, packetHash: semanticHash(material) });
}

function fixture(cogPointMm) {
  return {
    dataset: {
      schema: 'analysis-workspace-dataset/v1',
      datasetId: 'EMP-PROD-05A-DATASET',
      version: 1,
      sourceSha256: HASHES.dataset,
      sharedModel: sharedModel(cogPointMm),
      entities: [
        entity('PIPE-1', 'PIPE', 'pipe', 'SOURCE-PIPE-1', {}),
        entity('VALVE-1', 'VALVE', 'component', 'SOURCE-VALVE-1', {
          attributes: { CATALOG_KEY: 'CV-1' },
        }),
      ],
    },
    profile: makeProfile(),
    supportSiteModel: {
      schema: 'support-site-model/v1',
      sites: [support('S-0', 0), support('S-1', 1000)],
    },
    routePartitionModel: {
      schema: 'route-partition-model/v1',
      routes: [{
        routeId: 'ROUTE-1',
        status: 'READY',
        blockers: [],
        physicalEdgeIds: ['PIPE-1', 'VALVE-1'],
        entityChainages: [
          chainage('PIPE-1', 0, 1000, 500),
          chainage('VALVE-1', 500, 500, 500),
        ],
      }],
      edges: [
        edge('PIPE-1', 'PIPE', { x: 0, y: 0, z: 0 }, { x: 1000, y: 0, z: 0 }, 1000, false),
        edge('VALVE-1', 'VALVE', { x: 500, y: 0, z: 0 }, { x: 500, y: 0, z: 0 }, 0, true),
      ],
    },
    masterData: {
      lineList: { sourceHash: HASHES.lineList },
      pipingClass: { sourceHash: HASHES.pipingClass },
      weight: { sourceHash: HASHES.componentWeight },
    },
  };
}

function twoComponentDatasetSameCatalogKey() {
  const one = fixture({ x: 250, y: 0, z: 0 }).dataset;
  const sharedBase = {
    ...one.sharedModel,
    components: [
      ...one.sharedModel.components,
      {
        componentKey: 'VALVE-2',
        sourceEntityId: 'SOURCE-VALVE-2',
        type: 'VALVE',
        loadEvidence: {},
      },
    ],
  };
  delete sharedBase.semanticHash;
  const shared = { ...sharedBase, semanticHash: semanticHash(sharedBase) };
  return {
    ...one,
    sharedModel: shared,
    entities: [
      ...one.entities,
      entity('VALVE-2', 'VALVE', 'component', 'SOURCE-VALVE-2', {
        attributes: { CATALOG_KEY: 'CV-1' },
      }),
    ],
  };
}

function makeAuthorizedInput() {
  const overlayValue = {
    pipeSectionProperties: {
      'L-1': {
        outsideDiameterMm: 100,
        wallThicknessMm: 5,
        materialCode: 'MAT-1',
        insulationCode: 'INS-1',
        insulationThicknessMm: 10,
      },
    },
    materialDensitiesKgPerM3: { 'MAT-1': 7850 },
    operatingFluidDensitiesKgPerM3: { 'L-1': 800 },
    hydroFluidDensitiesKgPerM3: { 'L-1': 1000 },
    insulationDensitiesKgPerM3: { 'INS-1': 120 },
    componentWeightsKg: { 'CV-1': 10 },
  };
  const draft = {
    schema: 'authorized-empirical-load-input/v1',
    intakeId: 'INTAKE-EMP-05A',
    projectId: 'EMP-PROD-05A-PROJECT',
    baselineId: 'BASELINE-EMP-05A',
    baselineRevision: 1,
    baselineSemanticHash: 'fnv1a64:1111111111111111',
    readinessEvaluationSemanticHash: 'fnv1a64:2222222222222222',
    readinessSemanticHash: 'fnv1a64:3333333333333333',
    handoffSemanticHash: 'fnv1a64:4444444444444444',
    projectionPayloadSemanticHash: 'fnv1a64:5555555555555555',
    adapterVersion: 'empirical-adapter/1.0.0',
    configurationHash: 'fnv1a64:6666666666666666',
    createdAt: '2026-08-08T05:37:00.000Z',
    lineBindings: [{
      targetId: 'line:001',
      sourceRecordId: 'SOURCE-PIPE-1',
      lineKey: 'L-1',
      projectionRecordSemanticHash: 'fnv1a64:7777777777777777',
    }],
    componentBindings: [{
      targetId: 'component:001',
      sourceRecordId: 'SOURCE-VALVE-1',
      lineKey: 'L-1',
      catalogKey: 'CV-1',
      projectionRecordSemanticHash: 'fnv1a64:8888888888888888',
    }],
    loadCalculationOverlay: overlayValue,
    overlaySemanticHash: semanticHash(overlayValue),
    summary: {
      lineCount: 1,
      componentCount: 1,
      materialCodeCount: 1,
      insulationCodeCount: 1,
      componentCatalogCount: 1,
    },
    semanticHash: 'fnv1a64:0000000000000000',
  };
  return requireAuthorizedEmpiricalLoadInput({
    ...draft,
    semanticHash: computeAuthorizedEmpiricalLoadInputSemanticHash(draft),
  });
}

function makeProfile() {
  const empty = createEmptyProjectDataProfile();
  const approved = (value, source) => createEvidenceValue(value, { source }, true);
  const sourced = (value, sourceKey, sourceHash) => createEvidenceValue(
    value,
    { source: 'EMP_PROD_05A_FIXTURE', sourceKey, sourceHash },
    true,
  );
  return {
    ...empty,
    projectId: 'EMP-PROD-05A-PROJECT',
    revision: 1,
    updatedAt: '2026-08-08T05:36:00.000Z',
    sourcesAndUnits: {
      ...empty.sourcesAndUnits,
      lineListSource: sourced({ sha256: HASHES.lineList }, 'lineList', HASHES.lineList),
      pipingClassSource: sourced({ sha256: HASHES.pipingClass }, 'pipingClass', HASHES.pipingClass),
      componentWeightSource: sourced({ sha256: HASHES.componentWeight }, 'componentWeight', HASHES.componentWeight),
    },
    topology: {
      ...empty.topology,
      portMatchToleranceMm: approved(1, 'EMP_PROD_05A_TOPOLOGY'),
      supportSiteGroupingToleranceMm: approved(1, 'EMP_PROD_05A_TOPOLOGY'),
      autoCarrierCoincidenceToleranceMm: approved(1, 'EMP_PROD_05A_TOPOLOGY'),
      routeJoiningRules: approved({ mode: 'EXACT' }, 'EMP_PROD_05A_TOPOLOGY'),
      supportTypeCapabilities: approved({ REST: { vertical: true } }, 'EMP_PROD_05A_TOPOLOGY'),
    },
    loadCalculation: {
      ...empty.loadCalculation,
      gravityMPerS2: approved(9.81, 'EMP_PROD_05A_LOAD_POLICY'),
      loadFactor: approved(1, 'EMP_PROD_05A_LOAD_POLICY'),
      equilibriumTolerances: approved(
        { forceN: 1e-8, momentNmm: 1e-5 },
        'EMP_PROD_05A_EQUILIBRIUM',
      ),
      activeLoadCases: approved(['EMPTY'], 'EMP_PROD_05A_CASES'),
    },
  };
}

function sharedModel(cogPointMm) {
  const base = {
    schema: 'shared-piping-model/v1',
    units: { length: 'mm', force: 'N', mass: 'kg' },
    components: [{
      componentKey: 'VALVE-1',
      sourceEntityId: 'SOURCE-VALVE-1',
      type: 'VALVE',
      loadEvidence: {
        componentCog: componentCog(cogPointMm, 'mm', 'fixture.componentCog'),
      },
    }],
    supports: [],
  };
  return { ...base, semanticHash: semanticHash(base) };
}

function componentCog(value, unit, sourcePath) {
  return {
    value,
    unit,
    sourceKind: 'COMPOSITE_EXPLICIT_SOURCE_EVIDENCE',
    sourcePath,
    axes: {
      x: evidence(value.x, unit, `${sourcePath}.x`),
      y: evidence(value.y, unit, `${sourcePath}.y`),
      z: evidence(value.z, unit, `${sourcePath}.z`),
    },
  };
}

function evidence(value, unit, sourcePath) {
  return { value, unit, sourcePath, sourceKind: 'EXPLICIT_SOURCE_EVIDENCE' };
}

function entity(entityId, entityType, category, sourceEntityId, properties) {
  return {
    entityId,
    entityType,
    category,
    lineKey: 'L-1',
    sourceEntityId,
    jsonPointer: `/entities/${entityId}`,
    componentReference: entityId,
    properties,
  };
}

function support(siteId, x) {
  return {
    siteId,
    tags: [siteId],
    positionMm: { x, y: 0, z: 0 },
    assemblies: [{ members: [{ sourceType: 'REST' }] }],
  };
}

function chainage(entityId, startMm, endMm, pointMm) {
  return {
    entityId,
    startMm,
    endMm,
    pointMm,
    sourceStartChainageMm: startMm,
    sourceEndChainageMm: endMm,
  };
}

function edge(entityId, entityType, startMm, endMm, lengthMm, pointComponent) {
  return {
    entityId,
    entityType,
    startMm,
    endMm,
    lengthMm,
    pointComponent,
    topologyCarrier: false,
  };
}

function reactionDeltas(base, enriched) {
  const left = reactions(base);
  const right = reactions(enriched);
  return right.map((value, index) => value - left[index]);
}

function reactions(execution) {
  return execution.distribution.loadCases[0].supportResults.map((row) => row.verticalForceN);
}

function componentContribution(execution) {
  return execution.distribution.loadCases[0].contributionLedger.find((row) => row.entityId === 'VALVE-1');
}

function pipeContribution(execution) {
  return execution.distribution.loadCases[0].contributionLedger.find((row) => row.entityId === 'PIPE-1');
}

function hasBlocker(value, code) {
  return value.blockers.some((row) => row.code === code);
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function assertClose(actual, expected, tolerance = 1e-10) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `expected ${expected}, received ${actual}`);
}

function hash(label) {
  return semanticHash({ label });
}

function ascii(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}
