import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { semanticHash } from '../src/core/shared-piping-model/canonical-json.js';
import {
  computeAuthorizedEmpiricalLoadInputSemanticHash,
  requireAuthorizedEmpiricalLoadInput,
} from '../src/workspace/engineering-loads/authorized-empirical-load-input.js';
import {
  AUTHORIZED_EMPIRICAL_LOAD_EXECUTION_V5_REQUEST_SCHEMA,
  calculateAuthorizedEmpiricalLoadExecutionV5,
} from '../src/workspace/engineering-loads/authorized-empirical-load-execution-v5.js';
import {
  AUTHORIZED_EMPIRICAL_LOAD_EXECUTION_V6_REQUEST_SCHEMA,
  AUTHORIZED_EMPIRICAL_LOAD_EXECUTION_V6_SCHEMA,
  calculateAuthorizedEmpiricalLoadExecutionV6,
  requireAuthorizedEmpiricalLoadExecutionV6,
} from '../src/workspace/engineering-loads/authorized-empirical-load-execution-v6.js';
import {
  EMPIRICAL_LOAD_COG_METHOD,
  EMPIRICAL_LOAD_METHOD,
} from '../src/workspace/engineering-loads/support-load-distribution-v3.js';
import {
  createEmptyProjectDataProfile,
  createEvidenceValue,
} from '../src/workspace/project-data/project-data-contract.js';
import { buildEnrichmentObservedAuthority } from '../src/workspace/engineering-enrichment/review-package-validation.js';
import {
  buildEngineeringEnrichmentApproval,
  buildEngineeringInputSeal,
  evaluateEngineeringInputSealCurrentness,
} from '../src/workspace/engineering-enrichment/input-seal.js';
import { buildEnrichmentProductionComponentWeightOverlay } from '../src/workspace/engineering-enrichment/production-component-weight-overlay.js';
import {
  ENRICHMENT_OPERATING_FLUID_DENSITY_PROJECTION_SCHEMA,
  buildEnrichmentProductionOperatingFluidDensityOverlay,
} from '../src/workspace/engineering-enrichment/production-operating-fluid-density-overlay.js';
import {
  ENRICHMENT_MATERIAL_DENSITY_PROJECTION_SCHEMA,
  buildEnrichmentProductionMaterialDensityOverlay,
} from '../src/workspace/engineering-enrichment/production-material-density-overlay.js';
import {
  ENRICHMENT_PIPE_SECTION_PROJECTION_SCHEMA,
  ENRICHMENT_PRODUCTION_PIPE_SECTION_OVERLAY_SCHEMA,
  assertEnrichmentPipeSectionProjection,
  assertEnrichmentProductionPipeSectionOverlay,
  buildEnrichmentProductionPipeSectionOverlay,
} from '../src/workspace/engineering-enrichment/production-pipe-section-overlay.js';

const HASHES = Object.freeze({
  dataset: '1'.repeat(64),
  lineList: '2'.repeat(64),
  pipingClass: '3'.repeat(64),
  componentWeight: '4'.repeat(64),
  fluidRegister: '5'.repeat(64),
  materialRegister: '6'.repeat(64),
});
const FLUID_RESOLUTION_HASH = hash('P5B:EXACT_FLUID_RESOLUTION');
const MATERIAL_RESOLUTION_HASH = hash('P5C:EXACT_MATERIAL_RESOLUTION');
const PIPE_SECTION_RESOLUTION_HASH = hash('P5D:EXACT_PIPING_CLASS_SECTION_RESOLUTION');
const BASE_SECTION = Object.freeze({
  outsideDiameterMm: 100,
  wallThicknessMm: 5,
  materialCode: 'MAT-1',
  insulationCode: 'INS-1',
  insulationThicknessMm: 10,
});
const SEALED_SECTION = Object.freeze({
  outsideDiameterMm: 110,
  wallThicknessMm: 6,
  materialCode: 'MAT-1',
  insulationCode: 'INS-1',
  insulationThicknessMm: 12,
});
const fixtureInput = fixture({ x: 250, y: 0, z: 0 });
const authorizedInput = makeAuthorizedInput();

const componentCandidate = componentCandidateProjection(fixtureInput.dataset, [
  componentCandidateRow('VALVE-1', 20, 'PROPOSAL:VALVE-1'),
]);
const fluidCandidate = operatingFluidProjection(fixtureInput.dataset, [
  fluidProjectionRow('L-1', 1000, 'FLUID_DENSITY:L-1'),
]);
const materialCandidate = materialDensityProjection(fixtureInput.dataset, [
  materialProjectionRow('L-1', 8000, 'MATERIAL_DENSITY:L-1'),
]);
const sectionCandidate = pipeSectionProjection(fixtureInput.dataset, [
  pipeSectionProjectionRow('L-1', SEALED_SECTION, 'PIPE_SECTION:L-1'),
]);

assert.equal(sectionCandidate.schema, ENRICHMENT_PIPE_SECTION_PROJECTION_SCHEMA);
assert.equal(assertEnrichmentPipeSectionProjection(sectionCandidate), sectionCandidate);
assert.equal(sectionCandidate.summary.status, 'READY_FOR_STRUCTURAL_IMPACT');
assert.equal(sectionCandidate.pipingClassResolutionHash, PIPE_SECTION_RESOLUTION_HASH);

const componentGovernance = governedSeal(componentCandidate, 'Package 5A component-weight authority.');
const fluidGovernance = governedSeal(fluidCandidate, 'Package 5B operating-fluid-density authority.');
const materialGovernance = governedSeal(materialCandidate, 'Package 5C material-density authority.');
const sectionGovernance = governedSeal(sectionCandidate, 'Package 5D pipe-section authority.');
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
const materialOverlay = buildEnrichmentProductionMaterialDensityOverlay({
  seal: materialGovernance.seal,
  currentness: materialGovernance.currentness,
  candidateProjection: materialCandidate,
  dataset: fixtureInput.dataset,
});
const sectionOverlay = buildEnrichmentProductionPipeSectionOverlay({
  seal: sectionGovernance.seal,
  currentness: sectionGovernance.currentness,
  candidateProjection: sectionCandidate,
  dataset: fixtureInput.dataset,
});

assert.equal(sectionOverlay.schema, ENRICHMENT_PRODUCTION_PIPE_SECTION_OVERLAY_SCHEMA);
assert.equal(sectionOverlay.status, 'READY_FOR_PRODUCTION_CONSUMPTION');
assert.deepEqual(sectionOverlay.activatedFieldFamilies, ['PIPE_SECTIONS']);
assert.deepEqual(sectionOverlay.pipeSectionProperties, { 'L-1': SEALED_SECTION });
assert.deepEqual(sectionOverlay.bindings[0].section, SEALED_SECTION);
assert.equal(sectionOverlay.policy.pipeSectionsActivated, true);
assert.equal(sectionOverlay.policy.materialDensitiesActivated, false);
assert.equal(sectionOverlay.policy.insulationDensitiesActivated, false);
assert.equal(sectionOverlay.policy.materialCodeChangePermitted, false);
assert.equal(sectionOverlay.policy.insulationCodeChangePermitted, false);
assert.equal(assertEnrichmentProductionPipeSectionOverlay(sectionOverlay), sectionOverlay);

const datasetSnapshot = JSON.stringify(fixtureInput.dataset);
const profileSnapshot = JSON.stringify(fixtureInput.profile);
const authorizedSnapshot = JSON.stringify(authorizedInput);

const baselineV2 = executeV5(EMPIRICAL_LOAD_METHOD);
const enrichedV2 = executeV6(EMPIRICAL_LOAD_METHOD);
const baselineCog = executeV5(EMPIRICAL_LOAD_COG_METHOD);
const enrichedCog = executeV6(EMPIRICAL_LOAD_COG_METHOD);

assert.equal(enrichedV2.schema, AUTHORIZED_EMPIRICAL_LOAD_EXECUTION_V6_SCHEMA);
assert.equal(enrichedV2.status, 'CALCULATED');
assert.deepEqual(enrichedV2.activatedEnrichmentFieldFamilies, [
  'COMPONENT_WEIGHTS',
  'OPERATING_FLUID_DENSITIES',
  'MATERIAL_DENSITIES',
  'PIPE_SECTIONS',
]);
assert.equal(enrichedV2.pipeSectionSealHash, sectionGovernance.seal.sealHash);
assert.equal(enrichedV2.pipeSectionOverlayHash, sectionOverlay.overlayHash);
assert.equal(enrichedCog.requestedMethod, EMPIRICAL_LOAD_COG_METHOD);
assert.equal(enrichedCog.executedMethod, EMPIRICAL_LOAD_COG_METHOD);

const materialDensityKgPerM3 = 8000;
const insulationDensityKgPerM3 = 120;
const operatingFluidDensityKgPerM3 = 1000;
const hydroFluidDensityKgPerM3 = 1000;
const baselineTerms = massTerms(
  BASE_SECTION,
  materialDensityKgPerM3,
  insulationDensityKgPerM3,
  operatingFluidDensityKgPerM3,
);
const sealedTerms = massTerms(
  SEALED_SECTION,
  materialDensityKgPerM3,
  insulationDensityKgPerM3,
  operatingFluidDensityKgPerM3,
);
const expectedMetalMassDeltaKg = sealedTerms.metalKg - baselineTerms.metalKg;
const expectedInsulationMassDeltaKg = sealedTerms.insulationKg - baselineTerms.insulationKg;
const expectedFluidMassDeltaKg = sealedTerms.fluidKg - baselineTerms.fluidKg;
const expectedEmptyMassDeltaKg = expectedMetalMassDeltaKg + expectedInsulationMassDeltaKg;
const expectedLoadedMassDeltaKg = expectedEmptyMassDeltaKg + expectedFluidMassDeltaKg;
const expectedEmptyForceDeltaN = expectedEmptyMassDeltaKg * 9.81;
const expectedLoadedForceDeltaN = expectedLoadedMassDeltaKg * 9.81;

for (const [baseline, enriched] of [[baselineV2, enrichedV2], [baselineCog, enrichedCog]]) {
  for (const caseId of ['EMPTY', 'OPE', 'HYD']) {
    const loaded = caseId !== 'EMPTY';
    const expectedMassDelta = loaded ? expectedLoadedMassDeltaKg : expectedEmptyMassDeltaKg;
    const expectedForceDelta = loaded ? expectedLoadedForceDeltaN : expectedEmptyForceDeltaN;
    const deltas = reactionDeltasForCase(baseline, enriched, caseId);
    assertClose(deltas[0], expectedForceDelta / 2);
    assertClose(deltas[1], expectedForceDelta / 2);
    assertClose(sum(deltas), expectedForceDelta);

    const baselinePipe = contribution(baseline, caseId, 'PIPE-1');
    const enrichedPipe = contribution(enriched, caseId, 'PIPE-1');
    assertClose(enrichedPipe.massKg - baselinePipe.massKg, expectedMassDelta);
    assertClose(enrichedPipe.formula.metalKg - baselinePipe.formula.metalKg, expectedMetalMassDeltaKg);
    assertClose(
      enrichedPipe.formula.insulationKg - baselinePipe.formula.insulationKg,
      expectedInsulationMassDeltaKg,
    );
    assertClose(
      enrichedPipe.formula.fluidKg - baselinePipe.formula.fluidKg,
      loaded ? expectedFluidMassDeltaKg : 0,
    );
    assert.equal(enrichedPipe.formula.outsideDiameterMm, SEALED_SECTION.outsideDiameterMm);
    assert.equal(enrichedPipe.formula.insideDiameterMm, 98);
    assertComponentMechanicsInvariant(
      contribution(baseline, caseId, 'VALVE-1'),
      contribution(enriched, caseId, 'VALVE-1'),
    );
    assertClose(loadCase(enriched, caseId).equilibrium.forceResidualN, 0, 1e-8);
    assertClose(loadCase(enriched, caseId).equilibrium.momentResidualNmm, 0, 1e-5);
  }
}

assert.equal(
  enrichedV2.effectiveComponentWeightsSemanticHash,
  baselineV2.effectiveComponentWeightsSemanticHash,
);
assert.equal(
  enrichedV2.effectiveOperatingFluidDensitiesSemanticHash,
  baselineV2.effectiveOperatingFluidDensitiesSemanticHash,
);
assert.equal(
  enrichedV2.effectiveHydroFluidDensitiesSemanticHash,
  baselineV2.effectiveHydroFluidDensitiesSemanticHash,
);
assert.equal(
  enrichedV2.effectiveMaterialDensitiesSemanticHash,
  baselineV2.effectiveMaterialDensitiesSemanticHash,
);
assert.equal(
  enrichedV2.effectiveInsulationDensitiesSemanticHash,
  semanticHash(authorizedInput.loadCalculationOverlay.insulationDensitiesKgPerM3),
);
assert.equal(
  enrichedV2.effectivePipeSectionPropertiesSemanticHash,
  semanticHash({ 'L-1': SEALED_SECTION }),
);
assert.notEqual(
  enrichedV2.effectivePipeSectionPropertiesSemanticHash,
  baselineV2.effectivePipeSectionPropertiesSemanticHash,
);

const repeated = executeV6(EMPIRICAL_LOAD_METHOD);
assert.deepEqual(repeated, enrichedV2, 'Package 5D execution must be deterministic');
assert.equal(JSON.stringify(fixtureInput.dataset), datasetSnapshot, '5D mutated source dataset');
assert.equal(JSON.stringify(fixtureInput.profile), profileSnapshot, '5D mutated Project Data');
assert.equal(JSON.stringify(authorizedInput), authorizedSnapshot, '5D mutated authorized input');

const staleSectionObserved = buildEnrichmentObservedAuthority({
  ...sectionGovernance.packet.evidenceRefs,
  numericalImpactHash: hash('section-impact-stale'),
  contextIdentities: sectionGovernance.packet.contextIdentities,
});
assert.throws(
  () => executeV6(EMPIRICAL_LOAD_METHOD, { pipeSectionObservedAuthority: staleSectionObserved }),
  (error) => error.code === 'EMPIRICAL_EXECUTION_V6_PIPE_SECTION_OBSERVED_AUTHORITY_MISMATCH',
);
const staleSectionCurrentness = evaluateEngineeringInputSealCurrentness({
  seal: sectionGovernance.seal,
  observedAuthority: staleSectionObserved,
});
const staleSectionOverlay = buildEnrichmentProductionPipeSectionOverlay({
  seal: sectionGovernance.seal,
  currentness: staleSectionCurrentness,
  candidateProjection: sectionCandidate,
  dataset: fixtureInput.dataset,
});
assert.equal(staleSectionOverlay.status, 'BLOCKED');
assert.deepEqual(staleSectionOverlay.pipeSectionProperties, {});
assert.equal(hasBlocker(staleSectionOverlay, 'ENRICHMENT_PRODUCTION_PIPE_SECTION_SEAL_NOT_CURRENT'), true);

const changedProfile = structuredClone(fixtureInput.profile);
changedProfile.revision += 1;
assert.throws(
  () => executeV6(EMPIRICAL_LOAD_METHOD, { profile: changedProfile }),
  (error) => error.code === 'EMPIRICAL_EXECUTION_V6_PROJECT_DATA_STALE',
);

const differentContextGovernance = governedSeal(
  sectionCandidate,
  'Package 5D alternate-context authority.',
  { approximationSetHash: hash('different-approximations') },
);
const differentContextOverlay = buildEnrichmentProductionPipeSectionOverlay({
  seal: differentContextGovernance.seal,
  currentness: differentContextGovernance.currentness,
  candidateProjection: sectionCandidate,
  dataset: fixtureInput.dataset,
});
assert.throws(
  () => executeV6(EMPIRICAL_LOAD_METHOD, {
    sealedPipeSectionOverlay: differentContextOverlay,
    pipeSectionObservedAuthority: differentContextGovernance.observed,
  }),
  (error) => error.code === 'EMPIRICAL_EXECUTION_V6_CONTEXT_AUTHORITY_MISMATCH',
);

const duplicateSectionCandidate = pipeSectionProjection(fixtureInput.dataset, [
  pipeSectionProjectionRow('L-1', SEALED_SECTION, 'PIPE_SECTION:L-1:A'),
  pipeSectionProjectionRow('L-1', { ...SEALED_SECTION, outsideDiameterMm: 111 }, 'PIPE_SECTION:L-1:B'),
]);
const duplicateGovernance = governedSeal(duplicateSectionCandidate, 'Duplicate section candidate test.');
const duplicateOverlay = buildEnrichmentProductionPipeSectionOverlay({
  seal: duplicateGovernance.seal,
  currentness: duplicateGovernance.currentness,
  candidateProjection: duplicateSectionCandidate,
  dataset: fixtureInput.dataset,
});
assert.equal(duplicateOverlay.status, 'BLOCKED');
assert.deepEqual(duplicateOverlay.pipeSectionProperties, {});
assert.equal(hasBlocker(duplicateOverlay, 'ENRICHMENT_PRODUCTION_PIPE_SECTION_LINE_DUPLICATE'), true);

const missingLineCandidate = pipeSectionProjection(fixtureInput.dataset, [
  pipeSectionProjectionRow('L-MISSING', SEALED_SECTION, 'PIPE_SECTION:L-MISSING'),
]);
const missingLineGovernance = governedSeal(missingLineCandidate, 'Missing section line test.');
const missingLineOverlay = buildEnrichmentProductionPipeSectionOverlay({
  seal: missingLineGovernance.seal,
  currentness: missingLineGovernance.currentness,
  candidateProjection: missingLineCandidate,
  dataset: fixtureInput.dataset,
});
assert.equal(missingLineOverlay.status, 'BLOCKED');
assert.equal(hasBlocker(missingLineOverlay, 'ENRICHMENT_PRODUCTION_PIPE_SECTION_LINE_MISSING'), true);

const twoLineAuthorizedInput = makeAuthorizedInput({ includeSecondLine: true });
const twoLineFluidCandidate = operatingFluidProjection(fixtureInput.dataset, [
  fluidProjectionRow('L-1', 1000, 'FLUID_DENSITY:L-1:TWO'),
  fluidProjectionRow('L-2', 1000, 'FLUID_DENSITY:L-2:TWO'),
]);
const twoLineMaterialCandidate = materialDensityProjection(fixtureInput.dataset, [
  materialProjectionRow('L-1', 8000, 'MATERIAL_DENSITY:L-1:TWO'),
  materialProjectionRow('L-2', 8000, 'MATERIAL_DENSITY:L-2:TWO'),
]);
const twoLineFluidGovernance = governedSeal(twoLineFluidCandidate, 'Two-line fluid authority.');
const twoLineMaterialGovernance = governedSeal(twoLineMaterialCandidate, 'Two-line material authority.');
const twoLineFluidOverlay = buildEnrichmentProductionOperatingFluidDensityOverlay({
  seal: twoLineFluidGovernance.seal,
  currentness: twoLineFluidGovernance.currentness,
  candidateProjection: twoLineFluidCandidate,
  dataset: fixtureInput.dataset,
});
const twoLineMaterialOverlay = buildEnrichmentProductionMaterialDensityOverlay({
  seal: twoLineMaterialGovernance.seal,
  currentness: twoLineMaterialGovernance.currentness,
  candidateProjection: twoLineMaterialCandidate,
  dataset: fixtureInput.dataset,
});
assert.throws(
  () => executeV6(EMPIRICAL_LOAD_METHOD, {
    authorizedInput: twoLineAuthorizedInput,
    sealedOperatingFluidDensityOverlay: twoLineFluidOverlay,
    operatingFluidObservedAuthority: twoLineFluidGovernance.observed,
    sealedMaterialDensityOverlay: twoLineMaterialOverlay,
    materialObservedAuthority: twoLineMaterialGovernance.observed,
  }),
  (error) => error.code === 'EMPIRICAL_EXECUTION_V6_PIPE_SECTION_COVERAGE_INCOMPLETE',
);

const materialCodeCandidate = pipeSectionProjection(fixtureInput.dataset, [
  pipeSectionProjectionRow(
    'L-1',
    { ...SEALED_SECTION, materialCode: 'MAT-2' },
    'PIPE_SECTION:L-1:MATERIAL-CODE-CHANGE',
  ),
]);
const materialCodeGovernance = governedSeal(materialCodeCandidate, 'Material code parity guard test.');
const materialCodeOverlay = buildEnrichmentProductionPipeSectionOverlay({
  seal: materialCodeGovernance.seal,
  currentness: materialCodeGovernance.currentness,
  candidateProjection: materialCodeCandidate,
  dataset: fixtureInput.dataset,
});
assert.equal(materialCodeOverlay.status, 'READY_FOR_PRODUCTION_CONSUMPTION');
assert.throws(
  () => executeV6(EMPIRICAL_LOAD_METHOD, {
    sealedPipeSectionOverlay: materialCodeOverlay,
    pipeSectionObservedAuthority: materialCodeGovernance.observed,
  }),
  (error) => error.code === 'EMPIRICAL_EXECUTION_V6_MATERIAL_CODE_CHANGE_OUTSIDE_SCOPE',
);

const insulationCodeCandidate = pipeSectionProjection(fixtureInput.dataset, [
  pipeSectionProjectionRow(
    'L-1',
    { ...SEALED_SECTION, insulationCode: 'INS-2' },
    'PIPE_SECTION:L-1:INSULATION-CODE-CHANGE',
  ),
]);
const insulationCodeGovernance = governedSeal(insulationCodeCandidate, 'Insulation code parity guard test.');
const insulationCodeOverlay = buildEnrichmentProductionPipeSectionOverlay({
  seal: insulationCodeGovernance.seal,
  currentness: insulationCodeGovernance.currentness,
  candidateProjection: insulationCodeCandidate,
  dataset: fixtureInput.dataset,
});
assert.equal(insulationCodeOverlay.status, 'READY_FOR_PRODUCTION_CONSUMPTION');
assert.throws(
  () => executeV6(EMPIRICAL_LOAD_METHOD, {
    sealedPipeSectionOverlay: insulationCodeOverlay,
    pipeSectionObservedAuthority: insulationCodeGovernance.observed,
  }),
  (error) => error.code === 'EMPIRICAL_EXECUTION_V6_INSULATION_CODE_CHANGE_OUTSIDE_SCOPE',
);

const tamperedOverlay = structuredClone(sectionOverlay);
tamperedOverlay.pipeSectionProperties['L-1'].wallThicknessMm = 7;
assert.throws(
  () => assertEnrichmentProductionPipeSectionOverlay(tamperedOverlay),
  (error) => error.code === 'ENRICHMENT_PRODUCTION_PIPE_SECTION_HASH_MISMATCH',
);

const tamperedExecution = structuredClone(enrichedV2);
tamperedExecution.activatedEnrichmentFieldFamilies.push('INSULATION_DENSITIES');
assert.throws(
  () => requireAuthorizedEmpiricalLoadExecutionV6(tamperedExecution),
  (error) => error.code === 'EMPIRICAL_EXECUTION_V6_FIELD_FAMILY_INVALID',
);

const overlaySource = await readFile(
  new URL('../src/workspace/engineering-enrichment/production-pipe-section-overlay.js', import.meta.url),
  'utf8',
);
const executionSource = await readFile(
  new URL('../src/workspace/engineering-loads/authorized-empirical-load-execution-v6.js', import.meta.url),
  'utf8',
);
assert.doesNotMatch(
  overlaySource,
  /calculateSupportLoadDistribution|support-load-distribution|linear-fea|lafea|lfea/iu,
  'Pipe-section production overlay must not contain calculation mechanics.',
);
assert.doesNotMatch(
  executionSource,
  /function\s+(distributePoint|distributeUniform|componentMass|resolveCaseMass|fluidMass|insulationMass|annulusAreaM2)\b/iu,
  'V6 must reuse existing gravity mechanics rather than duplicating formulas.',
);

console.log(JSON.stringify({
  check: 'enrichment-package5d-pipe-section-cutover',
  status: 'PASS',
  projectionSchema: sectionCandidate.schema,
  overlaySchema: sectionOverlay.schema,
  executionSchema: enrichedV2.schema,
  baselineSection: BASE_SECTION,
  sealedSection: SEALED_SECTION,
  expectedMetalMassDeltaKg,
  expectedInsulationMassDeltaKg,
  expectedFluidMassDeltaKg,
  expectedEmptyForceDeltaN,
  expectedEmptyReactionDeltaN: [expectedEmptyForceDeltaN / 2, expectedEmptyForceDeltaN / 2],
  expectedLoadedForceDeltaN,
  expectedOpeHydReactionDeltaN: [expectedLoadedForceDeltaN / 2, expectedLoadedForceDeltaN / 2],
  componentMechanicsPreserved: true,
  operatingFluidAuthorityPreserved: true,
  hydroAuthorityPreserved: true,
  materialDensityAuthorityPreserved: true,
  insulationDensityAuthorityPreserved: true,
  materialCodeChangeFailsClosed: true,
  insulationCodeChangeFailsClosed: true,
  independentSealContextsRequiredToMatch: true,
  completeAuthorizedLineCoverageRequired: true,
  staleAuthorityFailsClosed: true,
  sourceImmutable: true,
}, null, 2));

function executeV5(method, overrides = {}) {
  return calculateAuthorizedEmpiricalLoadExecutionV5({
    schema: AUTHORIZED_EMPIRICAL_LOAD_EXECUTION_V5_REQUEST_SCHEMA,
    executionId: `BASE-5C:${method}`,
    executedAt: '2026-08-08T07:42:00.000Z',
    method,
    authorizedInput,
    sealedComponentWeightOverlay: componentOverlay,
    componentObservedAuthority: componentGovernance.observed,
    sealedOperatingFluidDensityOverlay: fluidOverlay,
    operatingFluidObservedAuthority: fluidGovernance.observed,
    sealedMaterialDensityOverlay: materialOverlay,
    materialObservedAuthority: materialGovernance.observed,
    ...fixtureInput,
    ...overrides,
  });
}

function executeV6(method, overrides = {}) {
  return calculateAuthorizedEmpiricalLoadExecutionV6({
    schema: AUTHORIZED_EMPIRICAL_LOAD_EXECUTION_V6_REQUEST_SCHEMA,
    executionId: `ENRICHED-5D:${method}`,
    executedAt: '2026-08-08T07:43:00.000Z',
    method,
    authorizedInput,
    sealedComponentWeightOverlay: componentOverlay,
    componentObservedAuthority: componentGovernance.observed,
    sealedOperatingFluidDensityOverlay: fluidOverlay,
    operatingFluidObservedAuthority: fluidGovernance.observed,
    sealedMaterialDensityOverlay: materialOverlay,
    materialObservedAuthority: materialGovernance.observed,
    sealedPipeSectionOverlay: sectionOverlay,
    pipeSectionObservedAuthority: sectionGovernance.observed,
    ...fixtureInput,
    ...overrides,
  });
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
    approvedAt: '2026-08-08T07:39:00.000Z',
    basis,
  });
  const seal = buildEngineeringInputSeal({
    reviewPacket: packet,
    observedAuthority: observed,
    approvals: [approval],
    sealId: `SEAL:${candidateValue.projectionHash}:${hash(basis)}`,
    sealedBy: 'production-enrichment-governance',
    sealedAt: '2026-08-08T07:40:00.000Z',
  });
  const currentness = evaluateEngineeringInputSealCurrentness({ seal, observedAuthority: observed });
  return { packet, observed, approval, seal, currentness };
}

function componentCandidateProjection(dataset, rows) {
  const sortedRows = [...rows].sort((left, right) => ascii(left.proposalId, right.proposalId));
  const material = {
    schema: 'EngineeringEnrichmentCandidateProjection.v2',
    sourceDatasetHash: dataset.sourceSha256,
    sourceSharedModelHash: dataset.sharedModel.semanticHash,
    sourceStructuralHash: structuralHash(dataset),
    resolutionHash: hash(`component-resolution:${dataset.datasetId}:${semanticHash(sortedRows)}`),
    simulationMode: 'ALL_EXACT_MATCHES_SHADOW_ONLY',
    rows: sortedRows,
    summary: {
      proposalCount: sortedRows.length,
      projectedCandidateCount: sortedRows.length,
      blockedCount: 0,
      dispositions: { SHADOW_CANDIDATE_VALUE: sortedRows.length },
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
  return Object.freeze({
    proposalId,
    proposalHash: hash(`component-proposal:${proposalId}:${proposedValue}`),
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

function operatingFluidProjection(dataset, rows) {
  const sortedRows = [...rows].sort((left, right) => ascii(left.proposalId, right.proposalId));
  const material = {
    schema: ENRICHMENT_OPERATING_FLUID_DENSITY_PROJECTION_SCHEMA,
    sourceDatasetHash: dataset.sourceSha256,
    sourceSharedModelHash: dataset.sharedModel.semanticHash,
    sourceStructuralHash: structuralHash(dataset),
    fluidResolutionHash: FLUID_RESOLUTION_HASH,
    rows: sortedRows,
    summary: projectionSummary(sortedRows),
  };
  return Object.freeze({ ...material, projectionHash: semanticHash(material) });
}

function fluidProjectionRow(targetId, proposedValue, proposalId) {
  const sourceEvidence = Object.freeze({
    sourceKind: 'FLUID_REGISTER',
    sourceKey: 'fluidRegister',
    sourceHash: HASHES.fluidRegister,
    locator: `Fluids:${targetId}:densityKgM3`,
  });
  return Object.freeze({
    proposalId,
    proposalHash: semanticHash({
      fluidResolutionHash: FLUID_RESOLUTION_HASH,
      targetKind: 'LINE',
      targetId,
      fieldId: 'fluid.densityKgM3',
      proposedValue,
      unit: 'kg/m3',
      sourceEvidence,
    }),
    targetKind: 'LINE',
    targetId,
    fieldId: 'fluid.densityKgM3',
    proposedValue,
    unit: 'kg/m3',
    authorityLevel: 'AUTHORIZED_MASTER_CANDIDATE',
    disposition: 'SHADOW_CANDIDATE_VALUE',
    blockers: [],
    existingExplicitEvidence: null,
    bindingCreated: false,
    sourceEvidence,
  });
}

function materialDensityProjection(dataset, rows) {
  const sortedRows = [...rows].sort((left, right) => ascii(left.proposalId, right.proposalId));
  const material = {
    schema: ENRICHMENT_MATERIAL_DENSITY_PROJECTION_SCHEMA,
    sourceDatasetHash: dataset.sourceSha256,
    sourceSharedModelHash: dataset.sharedModel.semanticHash,
    sourceStructuralHash: structuralHash(dataset),
    materialResolutionHash: MATERIAL_RESOLUTION_HASH,
    rows: sortedRows,
    summary: projectionSummary(sortedRows),
  };
  return Object.freeze({ ...material, projectionHash: semanticHash(material) });
}

function materialProjectionRow(targetId, proposedValue, proposalId) {
  const sourceEvidence = Object.freeze({
    sourceKind: 'MATERIAL_REGISTER',
    sourceKey: 'materialRegister',
    sourceHash: HASHES.materialRegister,
    locator: `Materials:${targetId}:densityKgM3`,
  });
  return Object.freeze({
    proposalId,
    proposalHash: semanticHash({
      materialResolutionHash: MATERIAL_RESOLUTION_HASH,
      targetKind: 'LINE',
      targetId,
      fieldId: 'material.densityKgM3',
      proposedValue,
      unit: 'kg/m3',
      sourceEvidence,
    }),
    targetKind: 'LINE',
    targetId,
    fieldId: 'material.densityKgM3',
    proposedValue,
    unit: 'kg/m3',
    authorityLevel: 'AUTHORIZED_MASTER_CANDIDATE',
    disposition: 'SHADOW_CANDIDATE_VALUE',
    blockers: [],
    existingExplicitEvidence: null,
    bindingCreated: false,
    sourceEvidence,
  });
}

function pipeSectionProjection(dataset, rows) {
  const sortedRows = [...rows].sort((left, right) => ascii(left.proposalId, right.proposalId));
  const material = {
    schema: ENRICHMENT_PIPE_SECTION_PROJECTION_SCHEMA,
    sourceDatasetHash: dataset.sourceSha256,
    sourceSharedModelHash: dataset.sharedModel.semanticHash,
    sourceStructuralHash: structuralHash(dataset),
    pipingClassResolutionHash: PIPE_SECTION_RESOLUTION_HASH,
    rows: sortedRows,
    summary: projectionSummary(sortedRows),
  };
  return Object.freeze({ ...material, projectionHash: semanticHash(material) });
}

function pipeSectionProjectionRow(targetId, proposedSection, proposalId) {
  const sourceEvidence = Object.freeze({
    sourceKind: 'PIPING_CLASS',
    sourceKey: 'pipingClass',
    sourceHash: HASHES.pipingClass,
    locators: Object.freeze({
      insulationCode: `PipingClass:${targetId}:insulationCode`,
      insulationThicknessMm: `PipingClass:${targetId}:insulationThicknessMm`,
      materialCode: `PipingClass:${targetId}:materialCode`,
      outsideDiameterMm: `PipingClass:${targetId}:outsideDiameterMm`,
      wallThicknessMm: `PipingClass:${targetId}:wallThicknessMm`,
    }),
  });
  const section = Object.freeze({ ...proposedSection });
  return Object.freeze({
    proposalId,
    proposalHash: semanticHash({
      pipingClassResolutionHash: PIPE_SECTION_RESOLUTION_HASH,
      targetKind: 'LINE',
      targetId,
      fieldFamily: 'PIPE_SECTION',
      proposedSection: section,
      sourceEvidence,
    }),
    targetKind: 'LINE',
    targetId,
    fieldFamily: 'PIPE_SECTION',
    proposedSection: section,
    authorityLevel: 'AUTHORIZED_MASTER_CANDIDATE',
    disposition: 'SHADOW_CANDIDATE_VALUE',
    blockers: [],
    bindingCreated: false,
    sourceEvidence,
  });
}

function projectionSummary(rows) {
  return {
    proposalCount: rows.length,
    projectedCandidateCount: rows.length,
    blockedCount: 0,
    dispositions: { SHADOW_CANDIDATE_VALUE: rows.length },
    status: 'READY_FOR_STRUCTURAL_IMPACT',
  };
}

function reviewPacket(candidateValue, contextOverrides = {}) {
  const resolutionHash = candidateValue.resolutionHash
    ?? candidateValue.fluidResolutionHash
    ?? candidateValue.materialResolutionHash
    ?? candidateValue.pipingClassResolutionHash;
  const evidenceRefs = {
    sourceDatasetHash: candidateValue.sourceDatasetHash,
    sourceSharedModelHash: candidateValue.sourceSharedModelHash,
    sourceStructuralHash: candidateValue.sourceStructuralHash,
    masterSnapshotHashes: [hash(`master:${candidateValue.sourceDatasetHash}:${candidateValue.projectionHash}`)],
    proposalHashes: candidateValue.rows.map((row) => row.proposalHash).sort(ascii),
    resolutionHash,
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
      candidateStatus: candidateValue.summary.status,
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
      datasetId: 'EMP-PROD-05D-DATASET',
      version: 1,
      sourceSha256: HASHES.dataset,
      sharedModel: sharedModel(cogPointMm),
      entities: [
        entity('PIPE-1', 'PIPE', 'pipe', 'SOURCE-PIPE-1', 'L-1', {}),
        entity('PIPE-2', 'PIPE', 'pipe', 'SOURCE-PIPE-2', 'L-2', {}),
        entity('VALVE-1', 'VALVE', 'component', 'SOURCE-VALVE-1', 'L-1', {
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
  const pipeSectionProperties = { 'L-1': { ...BASE_SECTION } };
  const operatingFluidDensitiesKgPerM3 = { 'L-1': 800 };
  const hydroFluidDensitiesKgPerM3 = { 'L-1': 1000 };
  const lineBindings = [{
    targetId: 'line:001',
    sourceRecordId: 'SOURCE-PIPE-1',
    lineKey: 'L-1',
    projectionRecordSemanticHash: 'fnv1a64:7777777777777777',
  }];
  if (includeSecondLine) {
    pipeSectionProperties['L-2'] = { ...BASE_SECTION };
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
    intakeId: includeSecondLine ? 'INTAKE-EMP-05D-TWO-LINES' : 'INTAKE-EMP-05D',
    projectId: 'EMP-PROD-05D-PROJECT',
    baselineId: 'BASELINE-EMP-05D',
    baselineRevision: 1,
    baselineSemanticHash: 'fnv1a64:1111111111111111',
    readinessEvaluationSemanticHash: 'fnv1a64:2222222222222222',
    readinessSemanticHash: 'fnv1a64:3333333333333333',
    handoffSemanticHash: 'fnv1a64:4444444444444444',
    projectionPayloadSemanticHash: 'fnv1a64:5555555555555555',
    adapterVersion: 'empirical-adapter/1.0.0',
    configurationHash: 'fnv1a64:6666666666666666',
    createdAt: '2026-08-08T07:35:00.000Z',
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
    { source: 'EMP_PROD_05D_FIXTURE', sourceKey, sourceHash },
    true,
  );
  return {
    ...empty,
    projectId: 'EMP-PROD-05D-PROJECT',
    revision: 1,
    updatedAt: '2026-08-08T07:34:00.000Z',
    sourcesAndUnits: {
      ...empty.sourcesAndUnits,
      lineListSource: sourced({ sha256: HASHES.lineList }, 'lineList', HASHES.lineList),
      pipingClassSource: sourced({ sha256: HASHES.pipingClass }, 'pipingClass', HASHES.pipingClass),
      componentWeightSource: sourced(
        { sha256: HASHES.componentWeight },
        'componentWeight',
        HASHES.componentWeight,
      ),
    },
    topology: {
      ...empty.topology,
      portMatchToleranceMm: approved(1, 'EMP_PROD_05D_TOPOLOGY'),
      supportSiteGroupingToleranceMm: approved(1, 'EMP_PROD_05D_TOPOLOGY'),
      autoCarrierCoincidenceToleranceMm: approved(1, 'EMP_PROD_05D_TOPOLOGY'),
      routeJoiningRules: approved({ mode: 'EXACT' }, 'EMP_PROD_05D_TOPOLOGY'),
      supportTypeCapabilities: approved({ REST: { vertical: true } }, 'EMP_PROD_05D_TOPOLOGY'),
    },
    loadCalculation: {
      ...empty.loadCalculation,
      gravityMPerS2: approved(9.81, 'EMP_PROD_05D_LOAD_POLICY'),
      loadFactor: approved(1, 'EMP_PROD_05D_LOAD_POLICY'),
      equilibriumTolerances: approved(
        { forceN: 1e-8, momentNmm: 1e-5 },
        'EMP_PROD_05D_EQUILIBRIUM',
      ),
      activeLoadCases: approved(['EMPTY', 'OPE', 'HYD'], 'EMP_PROD_05D_CASES'),
    },
  };
}

function massTerms(section, materialDensity, insulationDensity, fluidDensity) {
  const insideDiameterMm = section.outsideDiameterMm - (2 * section.wallThicknessMm);
  return {
    metalKg: annulusAreaM2(section.outsideDiameterMm, insideDiameterMm) * materialDensity,
    insulationKg: annulusAreaM2(
      section.outsideDiameterMm + (2 * section.insulationThicknessMm),
      section.outsideDiameterMm,
    ) * insulationDensity,
    fluidKg: Math.PI * insideDiameterMm ** 2 / 4e6 * fluidDensity,
  };
}

function annulusAreaM2(outerDiameterMm, innerDiameterMm) {
  return Math.PI * (outerDiameterMm ** 2 - innerDiameterMm ** 2) / 4e6;
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

function entity(entityId, entityType, category, sourceEntityId, lineKey, properties) {
  return {
    entityId,
    entityType,
    category,
    lineKey,
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

function assertComponentMechanicsInvariant(baseline, enriched) {
  assert.equal(enriched.contributionId, baseline.contributionId);
  assert.equal(enriched.routeId, baseline.routeId);
  assert.equal(enriched.entityId, baseline.entityId);
  assert.deepEqual(enriched.source, baseline.source);
  assertClose(enriched.massKg, baseline.massKg);
  assertClose(enriched.verticalForceN, baseline.verticalForceN);
  assertClose(enriched.chainageMm, baseline.chainageMm);
  assert.equal(enriched.formula.catalogKey, baseline.formula.catalogKey);
  assertClose(enriched.formula.massKg, baseline.formula.massKg);
  assert.deepEqual(enriched.allocations, baseline.allocations);
  assert.deepEqual(
    applicationPointMechanics(enriched.formula.applicationPointAuthority),
    applicationPointMechanics(baseline.formula.applicationPointAuthority),
  );
}

function applicationPointMechanics(authority) {
  if (!authority) return null;
  const { auditSemanticHash: _auditSemanticHash, ...mechanics } = authority;
  return mechanics;
}

function hasBlocker(value, code) {
  return value.blockers.some((row) => row.code === code);
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function structuralHash(dataset) {
  return hash(`structural:${dataset.datasetId}`);
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
