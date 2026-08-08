import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { semanticHash } from '../src/core/shared-piping-model/canonical-json.js';
import {
  computeAuthorizedEmpiricalLoadInputSemanticHash,
  requireAuthorizedEmpiricalLoadInput,
} from '../src/workspace/engineering-loads/authorized-empirical-load-input.js';
import {
  AUTHORIZED_EMPIRICAL_LOAD_EXECUTION_V6_REQUEST_SCHEMA,
  calculateAuthorizedEmpiricalLoadExecutionV6,
} from '../src/workspace/engineering-loads/authorized-empirical-load-execution-v6.js';
import {
  AUTHORIZED_EMPIRICAL_LOAD_EXECUTION_V7_REQUEST_SCHEMA,
  AUTHORIZED_EMPIRICAL_LOAD_EXECUTION_V7_SCHEMA,
  calculateAuthorizedEmpiricalLoadExecutionV7,
  requireAuthorizedEmpiricalLoadExecutionV7,
} from '../src/workspace/engineering-loads/authorized-empirical-load-execution-v7.js';
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
  buildEnrichmentProductionPipeSectionOverlay,
} from '../src/workspace/engineering-enrichment/production-pipe-section-overlay.js';
import {
  ENRICHMENT_HYDRO_FLUID_DENSITY_PROJECTION_SCHEMA,
  ENRICHMENT_INSULATION_DENSITY_PROJECTION_SCHEMA,
  ENRICHMENT_PRODUCTION_HYDRO_FLUID_DENSITY_OVERLAY_SCHEMA,
  ENRICHMENT_PRODUCTION_INSULATION_DENSITY_OVERLAY_SCHEMA,
  assertEnrichmentHydroFluidDensityProjection,
  assertEnrichmentInsulationDensityProjection,
  assertEnrichmentProductionHydroFluidDensityOverlay,
  assertEnrichmentProductionInsulationDensityOverlay,
  buildEnrichmentProductionHydroFluidDensityOverlay,
  buildEnrichmentProductionInsulationDensityOverlay,
} from '../src/workspace/engineering-enrichment/production-secondary-density-overlays.js';

const HASHES = Object.freeze({
  dataset: '1'.repeat(64),
  lineList: '2'.repeat(64),
  pipingClass: '3'.repeat(64),
  componentWeight: '4'.repeat(64),
  fluidRegister: '5'.repeat(64),
  materialRegister: '6'.repeat(64),
  insulationRegister: '7'.repeat(64),
});
const FLUID_RESOLUTION_HASH = hash('P5B:EXACT_FLUID_RESOLUTION');
const MATERIAL_RESOLUTION_HASH = hash('P5C:EXACT_MATERIAL_RESOLUTION');
const PIPE_SECTION_RESOLUTION_HASH = hash('P5D:EXACT_PIPING_CLASS_SECTION_RESOLUTION');
const INSULATION_RESOLUTION_HASH = hash('P5E:EXACT_INSULATION_RESOLUTION');
const HYDRO_RESOLUTION_HASH = hash('P5E:EXACT_HYDRO_MEDIUM_RESOLUTION');

const BASE_SECTION = Object.freeze({
  outsideDiameterMm: 100,
  wallThicknessMm: 5,
  materialCode: 'MAT-1',
  insulationCode: 'INS-1',
  insulationThicknessMm: 10,
});
const V6_SECTION = Object.freeze({
  outsideDiameterMm: 110,
  wallThicknessMm: 6,
  materialCode: 'MAT-1',
  insulationCode: 'INS-1',
  insulationThicknessMm: 12,
});
const V7_SECTION = Object.freeze({
  ...V6_SECTION,
  insulationCode: 'INS-2',
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
const v6SectionCandidate = pipeSectionProjection(fixtureInput.dataset, [
  pipeSectionProjectionRow('L-1', V6_SECTION, 'PIPE_SECTION:L-1:V6'),
]);
const v7SectionCandidate = pipeSectionProjection(fixtureInput.dataset, [
  pipeSectionProjectionRow('L-1', V7_SECTION, 'PIPE_SECTION:L-1:V7'),
]);
const insulationCandidate = secondaryDensityProjection(
  fixtureInput.dataset,
  ENRICHMENT_INSULATION_DENSITY_PROJECTION_SCHEMA,
  INSULATION_RESOLUTION_HASH,
  'INSULATION_DENSITY',
  [secondaryDensityRow({
    resolutionHash: INSULATION_RESOLUTION_HASH,
    fieldFamily: 'INSULATION_DENSITY',
    targetId: 'L-1',
    referenceCode: 'INS-2',
    densityKgPerM3: 180,
    sourceKind: 'INSULATION_REGISTER',
    sourceKey: 'insulationRegister',
    sourceHash: HASHES.insulationRegister,
    proposalId: 'INSULATION_DENSITY:L-1',
  })],
);
const hydroCandidate = secondaryDensityProjection(
  fixtureInput.dataset,
  ENRICHMENT_HYDRO_FLUID_DENSITY_PROJECTION_SCHEMA,
  HYDRO_RESOLUTION_HASH,
  'HYDRO_FLUID_DENSITY',
  [secondaryDensityRow({
    resolutionHash: HYDRO_RESOLUTION_HASH,
    fieldFamily: 'HYDRO_FLUID_DENSITY',
    targetId: 'L-1',
    referenceCode: 'HYDRO-WATER',
    densityKgPerM3: 1100,
    sourceKind: 'FLUID_REGISTER',
    sourceKey: 'fluidRegister',
    sourceHash: HASHES.fluidRegister,
    proposalId: 'HYDRO_FLUID_DENSITY:L-1',
  })],
);

assert.equal(assertEnrichmentInsulationDensityProjection(insulationCandidate), insulationCandidate);
assert.equal(assertEnrichmentHydroFluidDensityProjection(hydroCandidate), hydroCandidate);

const componentGovernance = governedSeal(componentCandidate, 'Package 5A component-weight authority.');
const fluidGovernance = governedSeal(fluidCandidate, 'Package 5B operating-fluid-density authority.');
const materialGovernance = governedSeal(materialCandidate, 'Package 5C material-density authority.');
const v6SectionGovernance = governedSeal(v6SectionCandidate, 'Package 5D baseline section authority.');
const v7SectionGovernance = governedSeal(v7SectionCandidate, 'Package 5D section authority consumed by 5E.');
const insulationGovernance = governedSeal(insulationCandidate, 'Package 5E insulation-density authority.');
const hydroGovernance = governedSeal(hydroCandidate, 'Package 5E hydro/test-medium density authority.');

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
const v6SectionOverlay = buildEnrichmentProductionPipeSectionOverlay({
  seal: v6SectionGovernance.seal,
  currentness: v6SectionGovernance.currentness,
  candidateProjection: v6SectionCandidate,
  dataset: fixtureInput.dataset,
});
const v7SectionOverlay = buildEnrichmentProductionPipeSectionOverlay({
  seal: v7SectionGovernance.seal,
  currentness: v7SectionGovernance.currentness,
  candidateProjection: v7SectionCandidate,
  dataset: fixtureInput.dataset,
});
const insulationOverlay = buildEnrichmentProductionInsulationDensityOverlay({
  seal: insulationGovernance.seal,
  currentness: insulationGovernance.currentness,
  candidateProjection: insulationCandidate,
  dataset: fixtureInput.dataset,
});
const hydroOverlay = buildEnrichmentProductionHydroFluidDensityOverlay({
  seal: hydroGovernance.seal,
  currentness: hydroGovernance.currentness,
  candidateProjection: hydroCandidate,
  dataset: fixtureInput.dataset,
});

assert.equal(insulationOverlay.schema, ENRICHMENT_PRODUCTION_INSULATION_DENSITY_OVERLAY_SCHEMA);
assert.equal(hydroOverlay.schema, ENRICHMENT_PRODUCTION_HYDRO_FLUID_DENSITY_OVERLAY_SCHEMA);
assert.equal(insulationOverlay.status, 'READY_FOR_PRODUCTION_CONSUMPTION');
assert.equal(hydroOverlay.status, 'READY_FOR_PRODUCTION_CONSUMPTION');
assert.deepEqual(insulationOverlay.activatedFieldFamilies, ['INSULATION_DENSITIES']);
assert.deepEqual(hydroOverlay.activatedFieldFamilies, ['HYDRO_FLUID_DENSITIES']);
assert.deepEqual(insulationOverlay.lineInsulationAuthority, {
  'L-1': { referenceCode: 'INS-2', densityKgPerM3: 180, unit: 'kg/m3' },
});
assert.deepEqual(hydroOverlay.lineHydroFluidAuthority, {
  'L-1': { referenceCode: 'HYDRO-WATER', densityKgPerM3: 1100, unit: 'kg/m3' },
});
assert.equal(assertEnrichmentProductionInsulationDensityOverlay(insulationOverlay), insulationOverlay);
assert.equal(assertEnrichmentProductionHydroFluidDensityOverlay(hydroOverlay), hydroOverlay);

const datasetSnapshot = JSON.stringify(fixtureInput.dataset);
const profileSnapshot = JSON.stringify(fixtureInput.profile);
const authorizedSnapshot = JSON.stringify(authorizedInput);

const baselineV2 = executeV6(EMPIRICAL_LOAD_METHOD);
const enrichedV2 = executeV7(EMPIRICAL_LOAD_METHOD);
const baselineCog = executeV6(EMPIRICAL_LOAD_COG_METHOD);
const enrichedCog = executeV7(EMPIRICAL_LOAD_COG_METHOD);

assert.equal(enrichedV2.schema, AUTHORIZED_EMPIRICAL_LOAD_EXECUTION_V7_SCHEMA);
assert.equal(enrichedV2.status, 'CALCULATED');
assert.deepEqual(enrichedV2.activatedEnrichmentFieldFamilies, [
  'COMPONENT_WEIGHTS',
  'OPERATING_FLUID_DENSITIES',
  'MATERIAL_DENSITIES',
  'PIPE_SECTIONS',
  'INSULATION_DENSITIES',
  'HYDRO_FLUID_DENSITIES',
]);
assert.equal(enrichedV2.insulationDensitySealHash, insulationGovernance.seal.sealHash);
assert.equal(enrichedV2.hydroFluidDensitySealHash, hydroGovernance.seal.sealHash);
assert.equal(enrichedCog.requestedMethod, EMPIRICAL_LOAD_COG_METHOD);
assert.equal(enrichedCog.executedMethod, EMPIRICAL_LOAD_COG_METHOD);

const insulationVolumeM3 = annulusAreaM2(
  V7_SECTION.outsideDiameterMm + (2 * V7_SECTION.insulationThicknessMm),
  V7_SECTION.outsideDiameterMm,
);
const insideDiameterMm = V7_SECTION.outsideDiameterMm - (2 * V7_SECTION.wallThicknessMm);
const fluidVolumeM3 = Math.PI * insideDiameterMm ** 2 / 4e6;
const expectedInsulationMassDeltaKg = insulationVolumeM3 * (180 - 120);
const expectedHydroFluidMassDeltaKg = fluidVolumeM3 * (1100 - 1000);
const expectedInsulationForceDeltaN = expectedInsulationMassDeltaKg * 9.81;
const expectedHydroExtraForceDeltaN = expectedHydroFluidMassDeltaKg * 9.81;

for (const [baseline, enriched] of [[baselineV2, enrichedV2], [baselineCog, enrichedCog]]) {
  for (const caseId of ['EMPTY', 'OPE', 'HYD']) {
    const expectedForceDelta = expectedInsulationForceDeltaN
      + (caseId === 'HYD' ? expectedHydroExtraForceDeltaN : 0);
    const deltas = reactionDeltasForCase(baseline, enriched, caseId);
    assertClose(deltas[0], expectedForceDelta / 2);
    assertClose(deltas[1], expectedForceDelta / 2);
    assertClose(sum(deltas), expectedForceDelta);

    const baselinePipe = contribution(baseline, caseId, 'PIPE-1');
    const enrichedPipe = contribution(enriched, caseId, 'PIPE-1');
    assertClose(enrichedPipe.formula.metalKg, baselinePipe.formula.metalKg);
    assertClose(
      enrichedPipe.formula.insulationKg - baselinePipe.formula.insulationKg,
      expectedInsulationMassDeltaKg,
    );
    if (caseId === 'HYD') {
      assertClose(enrichedPipe.formula.fluidKg - baselinePipe.formula.fluidKg, expectedHydroFluidMassDeltaKg);
    } else {
      assertClose(enrichedPipe.formula.fluidKg, baselinePipe.formula.fluidKg);
    }
    assert.equal(enrichedPipe.formula.outsideDiameterMm, baselinePipe.formula.outsideDiameterMm);
    assert.equal(enrichedPipe.formula.insideDiameterMm, baselinePipe.formula.insideDiameterMm);
    assertComponentMechanicsInvariant(
      contribution(baseline, caseId, 'VALVE-1'),
      contribution(enriched, caseId, 'VALVE-1'),
    );
    assertClose(loadCase(enriched, caseId).equilibrium.forceResidualN, 0, 1e-8);
    assertClose(loadCase(enriched, caseId).equilibrium.momentResidualNmm, 0, 1e-5);
  }
}

assert.equal(enrichedV2.effectiveComponentWeightsSemanticHash, baselineV2.effectiveComponentWeightsSemanticHash);
assert.equal(enrichedV2.effectiveOperatingFluidDensitiesSemanticHash, baselineV2.effectiveOperatingFluidDensitiesSemanticHash);
assert.equal(enrichedV2.effectiveMaterialDensitiesSemanticHash, baselineV2.effectiveMaterialDensitiesSemanticHash);
assert.notEqual(enrichedV2.effectivePipeSectionPropertiesSemanticHash, baselineV2.effectivePipeSectionPropertiesSemanticHash);
assert.notEqual(enrichedV2.effectiveInsulationDensitiesSemanticHash, baselineV2.effectiveInsulationDensitiesSemanticHash);
assert.notEqual(enrichedV2.effectiveHydroFluidDensitiesSemanticHash, baselineV2.effectiveHydroFluidDensitiesSemanticHash);
assert.equal(enrichedV2.effectiveInsulationDensitiesSemanticHash, semanticHash({ 'INS-2': 180 }));
assert.equal(enrichedV2.effectiveHydroFluidDensitiesSemanticHash, semanticHash({ 'L-1': 1100 }));

const repeated = executeV7(EMPIRICAL_LOAD_METHOD);
assert.deepEqual(repeated, enrichedV2, 'Package 5E batch execution must be deterministic');
assert.equal(JSON.stringify(fixtureInput.dataset), datasetSnapshot, '5E mutated source dataset');
assert.equal(JSON.stringify(fixtureInput.profile), profileSnapshot, '5E mutated Project Data');
assert.equal(JSON.stringify(authorizedInput), authorizedSnapshot, '5E mutated authorized input');

const staleInsulationObserved = buildEnrichmentObservedAuthority({
  ...insulationGovernance.packet.evidenceRefs,
  numericalImpactHash: hash('insulation-impact-stale'),
  contextIdentities: insulationGovernance.packet.contextIdentities,
});
assert.throws(
  () => executeV7(EMPIRICAL_LOAD_METHOD, { insulationObservedAuthority: staleInsulationObserved }),
  (error) => error.code === 'EMPIRICAL_EXECUTION_V7_INSULATION_OBSERVED_AUTHORITY_MISMATCH',
);
const staleHydroObserved = buildEnrichmentObservedAuthority({
  ...hydroGovernance.packet.evidenceRefs,
  numericalImpactHash: hash('hydro-impact-stale'),
  contextIdentities: hydroGovernance.packet.contextIdentities,
});
const staleHydroCurrentness = evaluateEngineeringInputSealCurrentness({
  seal: hydroGovernance.seal,
  observedAuthority: staleHydroObserved,
});
const staleHydroOverlay = buildEnrichmentProductionHydroFluidDensityOverlay({
  seal: hydroGovernance.seal,
  currentness: staleHydroCurrentness,
  candidateProjection: hydroCandidate,
  dataset: fixtureInput.dataset,
});
assert.equal(staleHydroOverlay.status, 'BLOCKED');
assert.deepEqual(staleHydroOverlay.lineHydroFluidAuthority, {});
assert.equal(hasBlocker(staleHydroOverlay, 'ENRICHMENT_PRODUCTION_HYDRO_FLUID_DENSITY_SEAL_NOT_CURRENT'), true);

const changedProfile = structuredClone(fixtureInput.profile);
changedProfile.revision += 1;
assert.throws(
  () => executeV7(EMPIRICAL_LOAD_METHOD, { profile: changedProfile }),
  (error) => error.code === 'EMPIRICAL_EXECUTION_V7_PROJECT_DATA_STALE',
);

const differentContextGovernance = governedSeal(
  hydroCandidate,
  'Package 5E alternate-context hydro authority.',
  { selectorRegistryHash: hash('different-selectors') },
);
const differentContextHydroOverlay = buildEnrichmentProductionHydroFluidDensityOverlay({
  seal: differentContextGovernance.seal,
  currentness: differentContextGovernance.currentness,
  candidateProjection: hydroCandidate,
  dataset: fixtureInput.dataset,
});
assert.throws(
  () => executeV7(EMPIRICAL_LOAD_METHOD, {
    sealedHydroFluidDensityOverlay: differentContextHydroOverlay,
    hydroFluidObservedAuthority: differentContextGovernance.observed,
  }),
  (error) => error.code === 'EMPIRICAL_EXECUTION_V7_CONTEXT_AUTHORITY_MISMATCH',
);

const mismatchedInsulationCandidate = secondaryDensityProjection(
  fixtureInput.dataset,
  ENRICHMENT_INSULATION_DENSITY_PROJECTION_SCHEMA,
  INSULATION_RESOLUTION_HASH,
  'INSULATION_DENSITY',
  [secondaryDensityRow({
    resolutionHash: INSULATION_RESOLUTION_HASH,
    fieldFamily: 'INSULATION_DENSITY',
    targetId: 'L-1',
    referenceCode: 'INS-3',
    densityKgPerM3: 180,
    sourceKind: 'INSULATION_REGISTER',
    sourceKey: 'insulationRegister',
    sourceHash: HASHES.insulationRegister,
    proposalId: 'INSULATION_DENSITY:L-1:MISMATCH',
  })],
);
const mismatchedInsulationGovernance = governedSeal(mismatchedInsulationCandidate, 'Insulation code mismatch test.');
const mismatchedInsulationOverlay = buildEnrichmentProductionInsulationDensityOverlay({
  seal: mismatchedInsulationGovernance.seal,
  currentness: mismatchedInsulationGovernance.currentness,
  candidateProjection: mismatchedInsulationCandidate,
  dataset: fixtureInput.dataset,
});
assert.throws(
  () => executeV7(EMPIRICAL_LOAD_METHOD, {
    sealedInsulationDensityOverlay: mismatchedInsulationOverlay,
    insulationObservedAuthority: mismatchedInsulationGovernance.observed,
  }),
  (error) => error.code === 'EMPIRICAL_EXECUTION_V7_INSULATION_CODE_AUTHORITY_MISMATCH',
);

const materialCodeCandidate = pipeSectionProjection(fixtureInput.dataset, [
  pipeSectionProjectionRow('L-1', { ...V7_SECTION, materialCode: 'MAT-2' }, 'PIPE_SECTION:L-1:MAT-CHANGE'),
]);
const materialCodeGovernance = governedSeal(materialCodeCandidate, 'Material selection remains out of scope.');
const materialCodeOverlay = buildEnrichmentProductionPipeSectionOverlay({
  seal: materialCodeGovernance.seal,
  currentness: materialCodeGovernance.currentness,
  candidateProjection: materialCodeCandidate,
  dataset: fixtureInput.dataset,
});
assert.throws(
  () => executeV7(EMPIRICAL_LOAD_METHOD, {
    sealedPipeSectionOverlay: materialCodeOverlay,
    pipeSectionObservedAuthority: materialCodeGovernance.observed,
  }),
  (error) => error.code === 'EMPIRICAL_EXECUTION_V7_MATERIAL_CODE_CHANGE_OUTSIDE_SCOPE',
);

const duplicateInsulationCandidate = secondaryDensityProjection(
  fixtureInput.dataset,
  ENRICHMENT_INSULATION_DENSITY_PROJECTION_SCHEMA,
  INSULATION_RESOLUTION_HASH,
  'INSULATION_DENSITY',
  [
    secondaryDensityRow({
      resolutionHash: INSULATION_RESOLUTION_HASH,
      fieldFamily: 'INSULATION_DENSITY',
      targetId: 'L-1',
      referenceCode: 'INS-2',
      densityKgPerM3: 180,
      sourceKind: 'INSULATION_REGISTER',
      sourceKey: 'insulationRegister',
      sourceHash: HASHES.insulationRegister,
      proposalId: 'INSULATION_DENSITY:L-1:A',
    }),
    secondaryDensityRow({
      resolutionHash: INSULATION_RESOLUTION_HASH,
      fieldFamily: 'INSULATION_DENSITY',
      targetId: 'L-1',
      referenceCode: 'INS-2',
      densityKgPerM3: 181,
      sourceKind: 'INSULATION_REGISTER',
      sourceKey: 'insulationRegister',
      sourceHash: HASHES.insulationRegister,
      proposalId: 'INSULATION_DENSITY:L-1:B',
    }),
  ],
);
const duplicateInsulationGovernance = governedSeal(duplicateInsulationCandidate, 'Duplicate insulation candidate test.');
const duplicateInsulationOverlay = buildEnrichmentProductionInsulationDensityOverlay({
  seal: duplicateInsulationGovernance.seal,
  currentness: duplicateInsulationGovernance.currentness,
  candidateProjection: duplicateInsulationCandidate,
  dataset: fixtureInput.dataset,
});
assert.equal(duplicateInsulationOverlay.status, 'BLOCKED');
assert.deepEqual(duplicateInsulationOverlay.lineInsulationAuthority, {});
assert.equal(hasBlocker(duplicateInsulationOverlay, 'ENRICHMENT_PRODUCTION_INSULATION_DENSITY_LINE_DUPLICATE'), true);

const missingHydroCandidate = secondaryDensityProjection(
  fixtureInput.dataset,
  ENRICHMENT_HYDRO_FLUID_DENSITY_PROJECTION_SCHEMA,
  HYDRO_RESOLUTION_HASH,
  'HYDRO_FLUID_DENSITY',
  [secondaryDensityRow({
    resolutionHash: HYDRO_RESOLUTION_HASH,
    fieldFamily: 'HYDRO_FLUID_DENSITY',
    targetId: 'L-MISSING',
    referenceCode: 'HYDRO-WATER',
    densityKgPerM3: 1100,
    sourceKind: 'FLUID_REGISTER',
    sourceKey: 'fluidRegister',
    sourceHash: HASHES.fluidRegister,
    proposalId: 'HYDRO_FLUID_DENSITY:L-MISSING',
  })],
);
const missingHydroGovernance = governedSeal(missingHydroCandidate, 'Missing hydro line test.');
const missingHydroOverlay = buildEnrichmentProductionHydroFluidDensityOverlay({
  seal: missingHydroGovernance.seal,
  currentness: missingHydroGovernance.currentness,
  candidateProjection: missingHydroCandidate,
  dataset: fixtureInput.dataset,
});
assert.equal(missingHydroOverlay.status, 'BLOCKED');
assert.equal(hasBlocker(missingHydroOverlay, 'ENRICHMENT_PRODUCTION_HYDRO_FLUID_DENSITY_LINE_MISSING'), true);

const tamperedInsulationOverlay = structuredClone(insulationOverlay);
tamperedInsulationOverlay.lineInsulationAuthority['L-1'].densityKgPerM3 = 179;
assert.throws(
  () => assertEnrichmentProductionInsulationDensityOverlay(tamperedInsulationOverlay),
  (error) => error.code === 'ENRICHMENT_PRODUCTION_INSULATION_DENSITY_HASH_MISMATCH',
);
const tamperedExecution = structuredClone(enrichedV2);
tamperedExecution.activatedEnrichmentFieldFamilies.push('SUPPORT_CAPABILITIES');
assert.throws(
  () => requireAuthorizedEmpiricalLoadExecutionV7(tamperedExecution),
  (error) => error.code === 'EMPIRICAL_EXECUTION_V7_FIELD_FAMILY_INVALID',
);

const overlaySource = await readFile(
  new URL('../src/workspace/engineering-enrichment/production-secondary-density-overlays.js', import.meta.url),
  'utf8',
);
const executionSource = await readFile(
  new URL('../src/workspace/engineering-loads/authorized-empirical-load-execution-v7.js', import.meta.url),
  'utf8',
);
assert.doesNotMatch(
  overlaySource,
  /calculateSupportLoadDistribution|support-load-distribution|linear-fea|lafea|lfea/iu,
  'Secondary-density production overlays must not contain calculation mechanics.',
);
assert.doesNotMatch(
  executionSource,
  /function\s+(distributePoint|distributeUniform|componentMass|resolveCaseMass|fluidMass|insulationMass|annulusAreaM2)\b/iu,
  'V7 must reuse existing gravity mechanics rather than duplicate mass or distribution formulas.',
);

console.log(JSON.stringify({
  check: 'enrichment-package5e-scalar-density-batch',
  status: 'PASS',
  executionSchema: enrichedV2.schema,
  baselineInsulationCode: V6_SECTION.insulationCode,
  sealedInsulationCode: V7_SECTION.insulationCode,
  sealedInsulationDensityKgPerM3: 180,
  sealedTestMediumCode: 'HYDRO-WATER',
  sealedHydroDensityKgPerM3: 1100,
  expectedInsulationMassDeltaKg,
  expectedHydroFluidMassDeltaKg,
  expectedEmptyOpeReactionDeltaN: [expectedInsulationForceDeltaN / 2, expectedInsulationForceDeltaN / 2],
  expectedHydReactionDeltaN: [
    (expectedInsulationForceDeltaN + expectedHydroExtraForceDeltaN) / 2,
    (expectedInsulationForceDeltaN + expectedHydroExtraForceDeltaN) / 2,
  ],
  componentMechanicsPreserved: true,
  operatingFluidAuthorityPreserved: true,
  materialDensityAuthorityPreserved: true,
  pipeDimensionsPreservedAcrossV6V7: true,
  insulationCodeChangeRequiresIndependentSealConsensus: true,
  materialCodeChangeStillFailsClosed: true,
  defaultHydroWaterAssumptionPermitted: false,
  independentSealContextsRequiredToMatch: true,
  staleAuthorityFailsClosed: true,
  sourceImmutable: true,
}, null, 2));

function executeV6(method, overrides = {}) {
  return calculateAuthorizedEmpiricalLoadExecutionV6({
    schema: AUTHORIZED_EMPIRICAL_LOAD_EXECUTION_V6_REQUEST_SCHEMA,
    executionId: `BASE-5D:${method}`,
    executedAt: '2026-08-08T07:57:00.000Z',
    method,
    authorizedInput,
    sealedComponentWeightOverlay: componentOverlay,
    componentObservedAuthority: componentGovernance.observed,
    sealedOperatingFluidDensityOverlay: fluidOverlay,
    operatingFluidObservedAuthority: fluidGovernance.observed,
    sealedMaterialDensityOverlay: materialOverlay,
    materialObservedAuthority: materialGovernance.observed,
    sealedPipeSectionOverlay: v6SectionOverlay,
    pipeSectionObservedAuthority: v6SectionGovernance.observed,
    ...fixtureInput,
    ...overrides,
  });
}

function executeV7(method, overrides = {}) {
  return calculateAuthorizedEmpiricalLoadExecutionV7({
    schema: AUTHORIZED_EMPIRICAL_LOAD_EXECUTION_V7_REQUEST_SCHEMA,
    executionId: `ENRICHED-5E:${method}`,
    executedAt: '2026-08-08T07:58:00.000Z',
    method,
    authorizedInput,
    sealedComponentWeightOverlay: componentOverlay,
    componentObservedAuthority: componentGovernance.observed,
    sealedOperatingFluidDensityOverlay: fluidOverlay,
    operatingFluidObservedAuthority: fluidGovernance.observed,
    sealedMaterialDensityOverlay: materialOverlay,
    materialObservedAuthority: materialGovernance.observed,
    sealedPipeSectionOverlay: v7SectionOverlay,
    pipeSectionObservedAuthority: v7SectionGovernance.observed,
    sealedInsulationDensityOverlay: insulationOverlay,
    insulationObservedAuthority: insulationGovernance.observed,
    sealedHydroFluidDensityOverlay: hydroOverlay,
    hydroFluidObservedAuthority: hydroGovernance.observed,
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
    approvedAt: '2026-08-08T07:54:00.000Z',
    basis,
  });
  const seal = buildEngineeringInputSeal({
    reviewPacket: packet,
    observedAuthority: observed,
    approvals: [approval],
    sealId: `SEAL:${candidateValue.projectionHash}:${hash(basis)}`,
    sealedBy: 'production-enrichment-governance',
    sealedAt: '2026-08-08T07:55:00.000Z',
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
    summary: projectionSummary(sortedRows),
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
    sourceKind: 'FLUID_REGISTER', sourceKey: 'fluidRegister', sourceHash: HASHES.fluidRegister,
    locator: `Fluids:${targetId}:densityKgM3`,
  });
  return Object.freeze({
    proposalId,
    proposalHash: semanticHash({
      fluidResolutionHash: FLUID_RESOLUTION_HASH,
      targetKind: 'LINE', targetId, fieldId: 'fluid.densityKgM3', proposedValue,
      unit: 'kg/m3', sourceEvidence,
    }),
    targetKind: 'LINE', targetId, fieldId: 'fluid.densityKgM3', proposedValue, unit: 'kg/m3',
    authorityLevel: 'AUTHORIZED_MASTER_CANDIDATE', disposition: 'SHADOW_CANDIDATE_VALUE',
    blockers: [], existingExplicitEvidence: null, bindingCreated: false, sourceEvidence,
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
    sourceKind: 'MATERIAL_REGISTER', sourceKey: 'materialRegister', sourceHash: HASHES.materialRegister,
    locator: `Materials:${targetId}:densityKgM3`,
  });
  return Object.freeze({
    proposalId,
    proposalHash: semanticHash({
      materialResolutionHash: MATERIAL_RESOLUTION_HASH,
      targetKind: 'LINE', targetId, fieldId: 'material.densityKgM3', proposedValue,
      unit: 'kg/m3', sourceEvidence,
    }),
    targetKind: 'LINE', targetId, fieldId: 'material.densityKgM3', proposedValue, unit: 'kg/m3',
    authorityLevel: 'AUTHORIZED_MASTER_CANDIDATE', disposition: 'SHADOW_CANDIDATE_VALUE',
    blockers: [], existingExplicitEvidence: null, bindingCreated: false, sourceEvidence,
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
    sourceKind: 'PIPING_CLASS', sourceKey: 'pipingClass', sourceHash: HASHES.pipingClass,
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
      targetKind: 'LINE', targetId, fieldFamily: 'PIPE_SECTION', proposedSection: section, sourceEvidence,
    }),
    targetKind: 'LINE', targetId, fieldFamily: 'PIPE_SECTION', proposedSection: section,
    authorityLevel: 'AUTHORIZED_MASTER_CANDIDATE', disposition: 'SHADOW_CANDIDATE_VALUE',
    blockers: [], bindingCreated: false, sourceEvidence,
  });
}

function secondaryDensityProjection(dataset, schema, resolutionHash, fieldFamily, rows) {
  const sortedRows = [...rows].sort((left, right) => ascii(left.proposalId, right.proposalId));
  const material = {
    schema,
    sourceDatasetHash: dataset.sourceSha256,
    sourceSharedModelHash: dataset.sharedModel.semanticHash,
    sourceStructuralHash: structuralHash(dataset),
    resolutionHash,
    rows: sortedRows,
    summary: projectionSummary(sortedRows),
  };
  return Object.freeze({ ...material, projectionHash: semanticHash(material) });
}

function secondaryDensityRow({
  resolutionHash, fieldFamily, targetId, referenceCode, densityKgPerM3,
  sourceKind, sourceKey, sourceHash, proposalId,
}) {
  const sourceEvidence = Object.freeze({
    sourceKind,
    sourceKey,
    sourceHash,
    codeLocator: `${sourceKind}:${targetId}:code`,
    densityLocator: `${sourceKind}:${targetId}:densityKgM3`,
  });
  return Object.freeze({
    proposalId,
    proposalHash: semanticHash({
      resolutionHash,
      targetKind: 'LINE',
      targetId,
      fieldFamily,
      referenceCode,
      densityKgPerM3,
      unit: 'kg/m3',
      sourceEvidence,
    }),
    targetKind: 'LINE',
    targetId,
    fieldFamily,
    referenceCode,
    densityKgPerM3,
    unit: 'kg/m3',
    authorityLevel: 'AUTHORIZED_MASTER_CANDIDATE',
    disposition: 'SHADOW_CANDIDATE_VALUE',
    blockers: [],
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
      datasetId: 'EMP-PROD-05E-DATASET',
      version: 1,
      sourceSha256: HASHES.dataset,
      sharedModel: sharedModel(cogPointMm),
      entities: [
        entity('PIPE-1', 'PIPE', 'pipe', 'SOURCE-PIPE-1', 'L-1', {}),
        entity('PIPE-2', 'PIPE', 'pipe', 'SOURCE-PIPE-2', 'L-2', {}),
        entity('VALVE-1', 'VALVE', 'component', 'SOURCE-VALVE-1', 'L-1', { attributes: { CATALOG_KEY: 'CV-1' } }),
      ],
    },
    profile: makeProfile(),
    supportSiteModel: { schema: 'support-site-model/v1', sites: [support('S-0', 0), support('S-1', 1000)] },
    routePartitionModel: {
      schema: 'route-partition-model/v1',
      routes: [{
        routeId: 'ROUTE-1', status: 'READY', blockers: [], physicalEdgeIds: ['PIPE-1', 'VALVE-1'],
        entityChainages: [chainage('PIPE-1', 0, 1000, 500), chainage('VALVE-1', 500, 500, 500)],
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

function makeAuthorizedInput() {
  const overlayValue = {
    pipeSectionProperties: { 'L-1': { ...BASE_SECTION } },
    materialDensitiesKgPerM3: { 'MAT-1': 7850 },
    operatingFluidDensitiesKgPerM3: { 'L-1': 800 },
    hydroFluidDensitiesKgPerM3: { 'L-1': 1000 },
    insulationDensitiesKgPerM3: { 'INS-1': 120 },
    componentWeightsKg: { 'CV-1': 10 },
  };
  const draft = {
    schema: 'authorized-empirical-load-input/v1',
    intakeId: 'INTAKE-EMP-05E',
    projectId: 'EMP-PROD-05E-PROJECT',
    baselineId: 'BASELINE-EMP-05E', baselineRevision: 1,
    baselineSemanticHash: 'fnv1a64:1111111111111111',
    readinessEvaluationSemanticHash: 'fnv1a64:2222222222222222',
    readinessSemanticHash: 'fnv1a64:3333333333333333',
    handoffSemanticHash: 'fnv1a64:4444444444444444',
    projectionPayloadSemanticHash: 'fnv1a64:5555555555555555',
    adapterVersion: 'empirical-adapter/1.0.0',
    configurationHash: 'fnv1a64:6666666666666666',
    createdAt: '2026-08-08T07:50:00.000Z',
    lineBindings: [{
      targetId: 'line:001', sourceRecordId: 'SOURCE-PIPE-1', lineKey: 'L-1',
      projectionRecordSemanticHash: 'fnv1a64:7777777777777777',
    }],
    componentBindings: [{
      targetId: 'component:001', sourceRecordId: 'SOURCE-VALVE-1', lineKey: 'L-1', catalogKey: 'CV-1',
      projectionRecordSemanticHash: 'fnv1a64:8888888888888888',
    }],
    loadCalculationOverlay: overlayValue,
    overlaySemanticHash: semanticHash(overlayValue),
    summary: { lineCount: 1, componentCount: 1, materialCodeCount: 1, insulationCodeCount: 1, componentCatalogCount: 1 },
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
    { source: 'EMP_PROD_05E_FIXTURE', sourceKey, sourceHash },
    true,
  );
  return {
    ...empty,
    projectId: 'EMP-PROD-05E-PROJECT', revision: 1, updatedAt: '2026-08-08T07:49:00.000Z',
    sourcesAndUnits: {
      ...empty.sourcesAndUnits,
      lineListSource: sourced({ sha256: HASHES.lineList }, 'lineList', HASHES.lineList),
      pipingClassSource: sourced({ sha256: HASHES.pipingClass }, 'pipingClass', HASHES.pipingClass),
      componentWeightSource: sourced({ sha256: HASHES.componentWeight }, 'componentWeight', HASHES.componentWeight),
    },
    topology: {
      ...empty.topology,
      portMatchToleranceMm: approved(1, 'EMP_PROD_05E_TOPOLOGY'),
      supportSiteGroupingToleranceMm: approved(1, 'EMP_PROD_05E_TOPOLOGY'),
      autoCarrierCoincidenceToleranceMm: approved(1, 'EMP_PROD_05E_TOPOLOGY'),
      routeJoiningRules: approved({ mode: 'EXACT' }, 'EMP_PROD_05E_TOPOLOGY'),
      supportTypeCapabilities: approved({ REST: { vertical: true } }, 'EMP_PROD_05E_TOPOLOGY'),
    },
    loadCalculation: {
      ...empty.loadCalculation,
      gravityMPerS2: approved(9.81, 'EMP_PROD_05E_LOAD_POLICY'),
      loadFactor: approved(1, 'EMP_PROD_05E_LOAD_POLICY'),
      equilibriumTolerances: approved({ forceN: 1e-8, momentNmm: 1e-5 }, 'EMP_PROD_05E_EQUILIBRIUM'),
      activeLoadCases: approved(['EMPTY', 'OPE', 'HYD'], 'EMP_PROD_05E_CASES'),
    },
  };
}

function annulusAreaM2(outerDiameterMm, innerDiameterMm) {
  return Math.PI * (outerDiameterMm ** 2 - innerDiameterMm ** 2) / 4e6;
}

function sharedModel(cogPointMm) {
  const base = {
    schema: 'shared-piping-model/v1', units: { length: 'mm', force: 'N', mass: 'kg' },
    components: [{
      componentKey: 'VALVE-1', sourceEntityId: 'SOURCE-VALVE-1', type: 'VALVE',
      loadEvidence: { componentCog: {
        value: cogPointMm, unit: 'mm', sourceKind: 'COMPOSITE_EXPLICIT_SOURCE_EVIDENCE', sourcePath: 'fixture.componentCog',
        axes: {
          x: evidence(cogPointMm.x, 'mm', 'fixture.componentCog.x'),
          y: evidence(cogPointMm.y, 'mm', 'fixture.componentCog.y'),
          z: evidence(cogPointMm.z, 'mm', 'fixture.componentCog.z'),
        },
      } },
    }],
    supports: [],
  };
  return { ...base, semanticHash: semanticHash(base) };
}
function evidence(value, unit, sourcePath) { return { value, unit, sourcePath, sourceKind: 'EXPLICIT_SOURCE_EVIDENCE' }; }
function entity(entityId, entityType, category, sourceEntityId, lineKey, properties) {
  return { entityId, entityType, category, lineKey, sourceEntityId, jsonPointer: `/entities/${entityId}`, componentReference: entityId, properties };
}
function support(siteId, x) { return { siteId, tags: [siteId], positionMm: { x, y: 0, z: 0 }, assemblies: [{ members: [{ sourceType: 'REST' }] }] }; }
function chainage(entityId, startMm, endMm, pointMm) { return { entityId, startMm, endMm, pointMm, sourceStartChainageMm: startMm, sourceEndChainageMm: endMm }; }
function edge(entityId, entityType, startMm, endMm, lengthMm, pointComponent) { return { entityId, entityType, startMm, endMm, lengthMm, pointComponent, topologyCarrier: false }; }
function loadCase(execution, caseId) { return execution.distribution.loadCases.find((row) => row.loadCaseId === caseId); }
function reactionsForCase(execution, caseId) { return loadCase(execution, caseId).supportResults.map((row) => row.verticalForceN); }
function reactionDeltasForCase(base, enriched, caseId) {
  const left = reactionsForCase(base, caseId);
  const right = reactionsForCase(enriched, caseId);
  return right.map((value, index) => value - left[index]);
}
function contribution(execution, caseId, entityId) { return loadCase(execution, caseId).contributionLedger.find((row) => row.entityId === entityId); }
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
  assert.deepEqual(applicationPointMechanics(enriched.formula.applicationPointAuthority), applicationPointMechanics(baseline.formula.applicationPointAuthority));
}
function applicationPointMechanics(authority) {
  if (!authority) return null;
  const { auditSemanticHash: _auditSemanticHash, ...mechanics } = authority;
  return mechanics;
}
function hasBlocker(value, code) { return value.blockers.some((row) => row.code === code); }
function sum(values) { return values.reduce((total, value) => total + value, 0); }
function structuralHash(dataset) { return hash(`structural:${dataset.datasetId}`); }
function assertClose(actual, expected, tolerance = 1e-10) { assert.ok(Math.abs(actual - expected) <= tolerance, `expected ${expected}, received ${actual}`); }
function hash(label) { return semanticHash({ label }); }
function ascii(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
