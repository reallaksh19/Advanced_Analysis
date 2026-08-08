import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { semanticHash } from '../src/core/shared-piping-model/canonical-json.js';
import {
  computeAuthorizedEmpiricalLoadInputSemanticHash,
  requireAuthorizedEmpiricalLoadInput,
} from '../src/workspace/engineering-loads/authorized-empirical-load-input.js';
import {
  AUTHORIZED_EMPIRICAL_LOAD_EXECUTION_V3_REQUEST_SCHEMA,
  calculateAuthorizedEmpiricalLoadExecutionV3,
} from '../src/workspace/engineering-loads/authorized-empirical-load-execution-v3.js';
import {
  AUTHORIZED_EMPIRICAL_LOAD_EXECUTION_V4_REQUEST_SCHEMA,
  AUTHORIZED_EMPIRICAL_LOAD_EXECUTION_V4_SCHEMA,
  calculateAuthorizedEmpiricalLoadExecutionV4,
  requireAuthorizedEmpiricalLoadExecutionV4,
} from '../src/workspace/engineering-loads/authorized-empirical-load-execution-v4.js';
import {
  EMPIRICAL_LOAD_COG_METHOD,
  EMPIRICAL_LOAD_METHOD,
} from '../src/workspace/engineering-loads/support-load-distribution-v3.js';
import {
  createEmptyProjectDataProfile,
  createEvidenceValue,
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
  buildEnrichmentProductionComponentWeightOverlay,
} from '../src/workspace/engineering-enrichment/production-component-weight-overlay.js';
import {
  ENRICHMENT_PRODUCTION_OPERATING_FLUID_DENSITY_OVERLAY_SCHEMA,
  assertEnrichmentProductionOperatingFluidDensityOverlay,
  buildEnrichmentProductionOperatingFluidDensityOverlay,
} from '../src/workspace/engineering-enrichment/production-operating-fluid-density-overlay.js';

const HASHES = Object.freeze({
  dataset: '1'.repeat(64),
  lineList: '2'.repeat(64),
  pipingClass: '3'.repeat(64),
  componentWeight: '4'.repeat(64),
});
const fixtureInput = fixture({ x: 250, y: 0, z: 0 });
const authorizedInput = makeAuthorizedInput();
const componentCandidate = candidateProjection(fixtureInput.dataset, [
  componentCandidateRow('VALVE-1', 20, 'PROPOSAL:VALVE-1'),
]);
const fluidCandidate = candidateProjection(fixtureInput.dataset, [
  fluidCandidateRow('L-1', 1000, 'PROPOSAL:FLUID:L-1'),
]);
const componentGovernance = governedSeal(componentCandidate, 'Package 5A component-weight authority.');
const fluidGovernance = governedSeal(fluidCandidate, 'Package 5B operating-fluid-density authority.');
const componentOverlay = buildEnrichmentProductionComponentWeightOverlay({
  seal: componentGovernance.seal,
  currentness: componentGovernance.currentness,
  candidateProjection: componentCandidate,
  dataset: fixtureInput.dataset,
});
const fluidOverlay = buildEnrichmentProductionOperatingFluidDensityOverlay({
  seal: fluidGovernance.seal,
  currentness: fluidGovernance.currentness,
  candidateProjection: fluidCandidate,
  dataset: fixtureInput.dataset,
});

assert.equal(fluidOverlay.schema, ENRICHMENT_PRODUCTION_OPERATING_FLUID_DENSITY_OVERLAY_SCHEMA);
assert.equal(fluidOverlay.status, 'READY_FOR_PRODUCTION_CONSUMPTION');
assert.deepEqual(fluidOverlay.activatedFieldFamilies, ['OPERATING_FLUID_DENSITIES']);
assert.deepEqual(fluidOverlay.operatingFluidDensitiesKgPerM3, { 'L-1': 1000 });
assert.equal(fluidOverlay.bindings.length, 1);
assert.equal(fluidOverlay.bindings[0].targetId, 'L-1');
assert.equal(fluidOverlay.bindings[0].lineKey, 'L-1');
assert.equal(fluidOverlay.bindings[0].densityKgPerM3, 1000);
assert.equal(fluidOverlay.policy.operatingFluidDensitiesActivated, true);
assert.equal(fluidOverlay.policy.hydroFluidDensitiesActivated, false);
assert.equal(fluidOverlay.policy.materialDensitiesActivated, false);
assert.equal(fluidOverlay.policy.pipeSectionsActivated, false);
assert.equal(fluidOverlay.policy.partialProductionOverlayPermitted, false);
assert.equal(fluidOverlay.calculationExecutionPerformed, false);
assert.equal(assertEnrichmentProductionOperatingFluidDensityOverlay(fluidOverlay), fluidOverlay);

const datasetSnapshot = JSON.stringify(fixtureInput.dataset);
const profileSnapshot = JSON.stringify(fixtureInput.profile);
const authorizedSnapshot = JSON.stringify(authorizedInput);

const baselineV2 = executeV3(EMPIRICAL_LOAD_METHOD);
const enrichedV2 = executeV4(EMPIRICAL_LOAD_METHOD);
const baselineCog = executeV3(EMPIRICAL_LOAD_COG_METHOD);
const enrichedCog = executeV4(EMPIRICAL_LOAD_COG_METHOD);

assert.equal(enrichedV2.schema, AUTHORIZED_EMPIRICAL_LOAD_EXECUTION_V4_SCHEMA);
assert.equal(enrichedV2.status, 'CALCULATED');
assert.equal(enrichedV2.requestedMethod, EMPIRICAL_LOAD_METHOD);
assert.equal(enrichedV2.executedMethod, EMPIRICAL_LOAD_METHOD);
assert.deepEqual(
  enrichedV2.activatedEnrichmentFieldFamilies,
  ['COMPONENT_WEIGHTS', 'OPERATING_FLUID_DENSITIES'],
);
assert.equal(enrichedV2.componentWeightSealHash, componentGovernance.seal.sealHash);
assert.equal(enrichedV2.operatingFluidDensitySealHash, fluidGovernance.seal.sealHash);
assert.equal(enrichedV2.componentWeightOverlayHash, componentOverlay.overlayHash);
assert.equal(enrichedV2.operatingFluidDensityOverlayHash, fluidOverlay.overlayHash);
assert.equal(enrichedCog.requestedMethod, EMPIRICAL_LOAD_COG_METHOD);
assert.equal(enrichedCog.executedMethod, EMPIRICAL_LOAD_COG_METHOD);

const expectedFluidMassDeltaKg = Math.PI * (0.09 ** 2) / 4 * 200;
const expectedFluidForceDeltaN = expectedFluidMassDeltaKg * 9.81;
const expectedReactionDeltaN = expectedFluidForceDeltaN / 2;

for (const [baseline, enriched] of [[baselineV2, enrichedV2], [baselineCog, enrichedCog]]) {
  assert.deepEqual(reactionsForCase(enriched, 'EMPTY'), reactionsForCase(baseline, 'EMPTY'));
  assert.deepEqual(reactionsForCase(enriched, 'HYD'), reactionsForCase(baseline, 'HYD'));
  const opeDeltas = reactionDeltasForCase(baseline, enriched, 'OPE');
  assertClose(opeDeltas[0], expectedReactionDeltaN);
  assertClose(opeDeltas[1], expectedReactionDeltaN);
  assertClose(sum(opeDeltas), expectedFluidForceDeltaN);

  const baselinePipe = contribution(baseline, 'OPE', 'PIPE-1');
  const enrichedPipe = contribution(enriched, 'OPE', 'PIPE-1');
  assertClose(enrichedPipe.massKg - baselinePipe.massKg, expectedFluidMassDeltaKg);
  assertClose(enrichedPipe.formula.fluidKg - baselinePipe.formula.fluidKg, expectedFluidMassDeltaKg);
  assert.deepEqual(
    contribution(enriched, 'OPE', 'VALVE-1'),
    contribution(baseline, 'OPE', 'VALVE-1'),
    'Package 5B must not change the already-sealed component contribution.',
  );

  for (const caseId of ['EMPTY', 'OPE', 'HYD']) {
    assert.equal(loadCase(enriched, caseId).equilibrium.forceResidualN, 0);
    assert.equal(loadCase(enriched, caseId).equilibrium.momentResidualNmm, 0);
  }
}

assert.equal(
  enrichedV2.effectiveHydroFluidDensitiesSemanticHash,
  semanticHash(authorizedInput.loadCalculationOverlay.hydroFluidDensitiesKgPerM3),
  'Hydrotest density authority must remain the authorized baseline.',
);
assert.equal(
  enrichedV2.effectiveOperatingFluidDensitiesSemanticHash,
  semanticHash({ 'L-1': 1000 }),
);
assert.notEqual(
  enrichedV2.effectiveOperatingFluidDensitiesSemanticHash,
  semanticHash(authorizedInput.loadCalculationOverlay.operatingFluidDensitiesKgPerM3),
);

const repeated = executeV4(EMPIRICAL_LOAD_METHOD);
assert.deepEqual(repeated, enrichedV2, 'Package 5B production execution must be deterministic');
assert.equal(JSON.stringify(fixtureInput.dataset), datasetSnapshot, '5B mutated source dataset');
assert.equal(JSON.stringify(fixtureInput.profile), profileSnapshot, '5B mutated Project Data');
assert.equal(JSON.stringify(authorizedInput), authorizedSnapshot, '5B mutated authorized input');

const staleFluidObserved = buildEnrichmentObservedAuthority({
  ...fluidGovernance.packet.evidenceRefs,
  numericalImpactHash: hash('fluid-impact-stale'),
  contextIdentities: fluidGovernance.packet.contextIdentities,
});
assert.throws(
  () => executeV4(EMPIRICAL_LOAD_METHOD, {
    operatingFluidObservedAuthority: staleFluidObserved,
  }),
  (error) => error.code === 'EMPIRICAL_EXECUTION_V4_FLUID_OBSERVED_AUTHORITY_MISMATCH',
);

const changedProfile = structuredClone(fixtureInput.profile);
changedProfile.revision += 1;
assert.throws(
  () => executeV4(EMPIRICAL_LOAD_METHOD, { profile: changedProfile }),
  (error) => error.code === 'EMPIRICAL_EXECUTION_V4_PROJECT_DATA_STALE',
);

const differentContextGovernance = governedSeal(
  fluidCandidate,
  'Package 5B alternate-context authority.',
  { overrideSetHash: hash('other-overrides') },
);
const differentContextOverlay = buildEnrichmentProductionOperatingFluidDensityOverlay({
  seal: differentContextGovernance.seal,
  currentness: differentContextGovernance.currentness,
  candidateProjection: fluidCandidate,
  dataset: fixtureInput.dataset,
});
assert.throws(
  () => executeV4(EMPIRICAL_LOAD_METHOD, {
    sealedOperatingFluidDensityOverlay: differentContextOverlay,
    operatingFluidObservedAuthority: differentContextGovernance.observed,
  }),
  (error) => error.code === 'EMPIRICAL_EXECUTION_V4_CONTEXT_AUTHORITY_MISMATCH',
);

const duplicateFluidCandidate = candidateProjection(fixtureInput.dataset, [
  fluidCandidateRow('L-1', 1000, 'PROPOSAL:FLUID:L-1:A'),
  fluidCandidateRow('L-1', 1000, 'PROPOSAL:FLUID:L-1:B'),
]);
const duplicateGovernance = governedSeal(duplicateFluidCandidate, 'Duplicate fluid candidate test.');
const duplicateOverlay = buildEnrichmentProductionOperatingFluidDensityOverlay({
  seal: duplicateGovernance.seal,
  currentness: duplicateGovernance.currentness,
  candidateProjection: duplicateFluidCandidate,
  dataset: fixtureInput.dataset,
});
assert.equal(duplicateOverlay.status, 'BLOCKED');
assert.deepEqual(duplicateOverlay.operatingFluidDensitiesKgPerM3, {});
assert.equal(hasBlocker(duplicateOverlay, 'ENRICHMENT_PRODUCTION_OPERATING_FLUID_LINE_DUPLICATE'), true);

const missingLineCandidate = candidateProjection(fixtureInput.dataset, [
  fluidCandidateRow('L-MISSING', 1000, 'PROPOSAL:FLUID:MISSING'),
]);
const missingLineGovernance = governedSeal(missingLineCandidate, 'Missing fluid line test.');
const missingLineOverlay = buildEnrichmentProductionOperatingFluidDensityOverlay({
  seal: missingLineGovernance.seal,
  currentness: missingLineGovernance.currentness,
  candidateProjection: missingLineCandidate,
  dataset: fixtureInput.dataset,
});
assert.equal(missingLineOverlay.status, 'BLOCKED');
assert.deepEqual(missingLineOverlay.operatingFluidDensitiesKgPerM3, {});
assert.equal(hasBlocker(missingLineOverlay, 'ENRICHMENT_PRODUCTION_OPERATING_FLUID_LINE_MISSING'), true);

const incompleteAuthorizedInput = makeAuthorizedInput({ includeSecondLine: true });
assert.throws(
  () => executeV4(EMPIRICAL_LOAD_METHOD, { authorizedInput: incompleteAuthorizedInput }),
  (error) => error.code === 'EMPIRICAL_EXECUTION_V4_OPERATING_FLUID_COVERAGE_INCOMPLETE',
);

const tamperedOverlay = structuredClone(fluidOverlay);
tamperedOverlay.operatingFluidDensitiesKgPerM3['L-1'] = 999;
assert.throws(
  () => assertEnrichmentProductionOperatingFluidDensityOverlay(tamperedOverlay),
  (error) => error.code === 'ENRICHMENT_PRODUCTION_OPERATING_FLUID_HASH_MISMATCH',
);

const tamperedExecution = structuredClone(enrichedV2);
tamperedExecution.activatedEnrichmentFieldFamilies = [
  'COMPONENT_WEIGHTS',
  'OPERATING_FLUID_DENSITIES',
  'MATERIAL_DENSITIES',
];
assert.throws(
  () => requireAuthorizedEmpiricalLoadExecutionV4(tamperedExecution),
  (error) => error.code === 'EMPIRICAL_EXECUTION_V4_FIELD_FAMILY_INVALID',
);

const overlaySource = await readFile(
  new URL('../src/workspace/engineering-enrichment/production-operating-fluid-density-overlay.js', import.meta.url),
  'utf8',
);
const executionSource = await readFile(
  new URL('../src/workspace/engineering-loads/authorized-empirical-load-execution-v4.js', import.meta.url),
  'utf8',
);
assert.doesNotMatch(
  overlaySource,
  /calculateSupportLoadDistribution|support-load-distribution|linear-fea|lafea|lfea/iu,
  'Operating-fluid production overlay must not contain calculation mechanics.',
);
assert.doesNotMatch(
  executionSource,
  /function\s+(distributePoint|distributeUniform|componentMass|resolveCaseMass|fluidMass)\b/iu,
  'V4 must reuse existing gravity mechanics rather than duplicating formulas.',
);

console.log(JSON.stringify({
  check: 'enrichment-package5b-operating-fluid-density-cutover',
  status: 'PASS',
  overlaySchema: fluidOverlay.schema,
  executionSchema: enrichedV2.schema,
  baselineOperatingDensityKgPerM3: authorizedInput.loadCalculationOverlay.operatingFluidDensitiesKgPerM3['L-1'],
  sealedOperatingDensityKgPerM3: fluidOverlay.operatingFluidDensitiesKgPerM3['L-1'],
  expectedFluidMassDeltaKg,
  expectedFluidForceDeltaN,
  expectedOpeReactionDeltaN: [expectedReactionDeltaN, expectedReactionDeltaN],
  emptyUnchanged: true,
  hydroUnchanged: true,
  componentWeightsPreserved: true,
  independentSealContextsRequiredToMatch: true,
  completeAuthorizedLineCoverageRequired: true,
  staleAuthorityFailsClosed: true,
  sourceImmutable: true,
}, null, 2));

function executeV3(method) {
  return calculateAuthorizedEmpiricalLoadExecutionV3({
    schema: AUTHORIZED_EMPIRICAL_LOAD_EXECUTION_V3_REQUEST_SCHEMA,
    executionId: `BASE-5A:${method}`,
    executedAt: '2026-08-08T06:10:00.000Z',
    method,
    authorizedInput,
    sealedComponentWeightOverlay: componentOverlay,
    observedAuthority: componentGovernance.observed,
    ...fixtureInput,
  });
}

function executeV4(method, overrides = {}) {
  const request = {
    schema: AUTHORIZED_EMPIRICAL_LOAD_EXECUTION_V4_REQUEST_SCHEMA,
    executionId: `ENRICHED-5B:${method}`,
    executedAt: '2026-08-08T06:11:00.000Z',
    method,
    authorizedInput,
    sealedComponentWeightOverlay: componentOverlay,
    componentObservedAuthority: componentGovernance.observed,
    sealedOperatingFluidDensityOverlay: fluidOverlay,
    operatingFluidObservedAuthority: fluidGovernance.observed,
    ...fixtureInput,
    ...overrides,
  };
  return calculateAuthorizedEmpiricalLoadExecutionV4(request);
}

function governedSeal(candidateValue, basis, contextOverrides = {}) {
  const packet = reviewPacket(candidateValue, contextOverrides);
  const observed = buildEnrichmentObservedAuthority({
    ...packet.evidenceRefs,
    contextIdentities: packet.contextIdentities,
  });
  const approval = buildEngineeringEnrichmentApproval({
    reviewPacket: packet,
    approvalId: `APPROVAL:${candidateValue.projectionHash}:${hash(basis)}`,
    reviewerId: 'production-enrichment-reviewer',
    approvedAt: '2026-08-08T06:07:00.000Z',
    basis,
  });
  const seal = buildEngineeringInputSeal({
    reviewPacket: packet,
    observedAuthority: observed,
    approvals: [approval],
    sealId: `SEAL:${candidateValue.projectionHash}:${hash(basis)}`,
    sealedBy: 'production-enrichment-governance',
    sealedAt: '2026-08-08T06:08:00.000Z',
  });
  const currentness = evaluateEngineeringInputSealCurrentness({ seal, observedAuthority: observed });
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

function componentCandidateRow(targetId, proposedValue, proposalId) {
  return candidateRow({
    targetKind: 'COMPONENT', targetId, fieldId: 'componentWeightKg', proposedValue, unit: 'kg', proposalId,
  });
}

function fluidCandidateRow(targetId, proposedValue, proposalId) {
  return candidateRow({
    targetKind: 'LINE', targetId, fieldId: 'fluid.densityKgM3', proposedValue, unit: 'kg/m3', proposalId,
  });
}

function candidateRow({ targetKind, targetId, fieldId, proposedValue, unit, proposalId }) {
  return Object.freeze({
    proposalId,
    proposalHash: hash(`proposal:${proposalId}:${proposedValue}`),
    targetKind,
    targetId,
    fieldId,
    proposedValue,
    unit,
    authorityLevel: 'AUTHORIZED_MASTER_CANDIDATE',
    disposition: 'SHADOW_CANDIDATE_VALUE',
    blockers: [],
    existingExplicitEvidence: null,
    bindingCreated: false,
  });
}

function reviewPacket(candidateValue, contextOverrides = {}) {
  const evidenceRefs = {
    sourceDatasetHash: candidateValue.sourceDatasetHash,
    sourceSharedModelHash: candidateValue.sourceSharedModelHash,
    sourceStructuralHash: candidateValue.sourceStructuralHash,
    masterSnapshotHashes: [hash(`master:${candidateValue.sourceDatasetHash}:${candidateValue.projectionHash}`)],
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
    projectDataHash: semanticHash(fixtureInput.profile),
    overrideSetHash: hash('overrides'),
    approximationSetHash: hash('approximations'),
    selectorRegistryHash: hash('selectors'),
    ...contextOverrides,
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
      datasetId: 'EMP-PROD-05B-DATASET',
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

function makeAuthorizedInput({ includeSecondLine = false } = {}) {
  const pipeSectionProperties = {
    'L-1': {
      outsideDiameterMm: 100,
      wallThicknessMm: 5,
      materialCode: 'MAT-1',
      insulationCode: 'INS-1',
      insulationThicknessMm: 10,
    },
  };
  const operatingFluidDensitiesKgPerM3 = { 'L-1': 800 };
  const hydroFluidDensitiesKgPerM3 = { 'L-1': 1000 };
  const lineBindings = [{
    targetId: 'line:001',
    sourceRecordId: 'SOURCE-PIPE-1',
    lineKey: 'L-1',
    projectionRecordSemanticHash: 'fnv1a64:7777777777777777',
  }];
  if (includeSecondLine) {
    pipeSectionProperties['L-2'] = { ...pipeSectionProperties['L-1'] };
    operatingFluidDensitiesKgPerM3['L-2'] = 850;
    hydroFluidDensitiesKgPerM3['L-2'] = 1000;
    lineBindings.push({
      targetId: 'line:002',
      sourceRecordId: 'SOURCE-PIPE-2',
      lineKey: 'L-2',
      projectionRecordSemanticHash: 'fnv1a64:9999999999999999',
    });
  }
  const overlayValue = {
    pipeSectionProperties,
    materialDensitiesKgPerM3: { 'MAT-1': 7850 },
    operatingFluidDensitiesKgPerM3,
    hydroFluidDensitiesKgPerM3,
    insulationDensitiesKgPerM3: { 'INS-1': 120 },
    componentWeightsKg: { 'CV-1': 10 },
  };
  const draft = {
    schema: 'authorized-empirical-load-input/v1',
    intakeId: includeSecondLine ? 'INTAKE-EMP-05B-TWO-LINES' : 'INTAKE-EMP-05B',
    projectId: 'EMP-PROD-05B-PROJECT',
    baselineId: 'BASELINE-EMP-05B',
    baselineRevision: 1,
    baselineSemanticHash: 'fnv1a64:1111111111111111',
    readinessEvaluationSemanticHash: 'fnv1a64:2222222222222222',
    readinessSemanticHash: 'fnv1a64:3333333333333333',
    handoffSemanticHash: 'fnv1a64:4444444444444444',
    projectionPayloadSemanticHash: 'fnv1a64:5555555555555555',
    adapterVersion: 'empirical-adapter/1.0.0',
    configurationHash: 'fnv1a64:6666666666666666',
    createdAt: '2026-08-08T06:05:00.000Z',
    lineBindings,
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
      lineCount: lineBindings.length,
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
    { source: 'EMP_PROD_05B_FIXTURE', sourceKey, sourceHash },
    true,
  );
  return {
    ...empty,
    projectId: 'EMP-PROD-05B-PROJECT',
    revision: 1,
    updatedAt: '2026-08-08T06:04:00.000Z',
    sourcesAndUnits: {
      ...empty.sourcesAndUnits,
      lineListSource: sourced({ sha256: HASHES.lineList }, 'lineList', HASHES.lineList),
      pipingClassSource: sourced({ sha256: HASHES.pipingClass }, 'pipingClass', HASHES.pipingClass),
      componentWeightSource: sourced({ sha256: HASHES.componentWeight }, 'componentWeight', HASHES.componentWeight),
    },
    topology: {
      ...empty.topology,
      portMatchToleranceMm: approved(1, 'EMP_PROD_05B_TOPOLOGY'),
      supportSiteGroupingToleranceMm: approved(1, 'EMP_PROD_05B_TOPOLOGY'),
      autoCarrierCoincidenceToleranceMm: approved(1, 'EMP_PROD_05B_TOPOLOGY'),
      routeJoiningRules: approved({ mode: 'EXACT' }, 'EMP_PROD_05B_TOPOLOGY'),
      supportTypeCapabilities: approved({ REST: { vertical: true } }, 'EMP_PROD_05B_TOPOLOGY'),
    },
    loadCalculation: {
      ...empty.loadCalculation,
      gravityMPerS2: approved(9.81, 'EMP_PROD_05B_LOAD_POLICY'),
      loadFactor: approved(1, 'EMP_PROD_05B_LOAD_POLICY'),
      equilibriumTolerances: approved(
        { forceN: 1e-8, momentNmm: 1e-5 },
        'EMP_PROD_05B_EQUILIBRIUM',
      ),
      activeLoadCases: approved(['EMPTY', 'OPE', 'HYD'], 'EMP_PROD_05B_CASES'),
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
        componentCog: {
          value: cogPointMm,
          unit: 'mm',
          sourceKind: 'COMPOSITE_EXPLICIT_SOURCE_EVIDENCE',
          sourcePath: 'fixture.componentCog',
          axes: {
            x: evidence(cogPointMm.x, 'mm', 'fixture.componentCog.x'),
            y: evidence(cogPointMm.y, 'mm', 'fixture.componentCog.y'),
            z: evidence(cogPointMm.z, 'mm', 'fixture.componentCog.z'),
          },
        },
      },
    }],
    supports: [],
  };
  return { ...base, semanticHash: semanticHash(base) };
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

function loadCase(execution, caseId) {
  return execution.distribution.loadCases.find((row) => row.loadCaseId === caseId);
}

function reactionsForCase(execution, caseId) {
  return loadCase(execution, caseId).supportResults.map((row) => row.verticalForceN);
}

function reactionDeltasForCase(base, enriched, caseId) {
  const left = reactionsForCase(base, caseId);
  const right = reactionsForCase(enriched, caseId);
  return right.map((value, index) => value - left[index]);
}

function contribution(execution, caseId, entityId) {
  return loadCase(execution, caseId).contributionLedger.find((row) => row.entityId === entityId);
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
