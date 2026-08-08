import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { semanticHash } from '../src/core/shared-piping-model/canonical-json.js';
import {
  buildRestraintCapabilityModel,
  buildSupportAttachmentModel,
} from '../src/core/support-restraints/index.js';
import {
  computeAuthorizedEmpiricalLoadInputSemanticHash,
  requireAuthorizedEmpiricalLoadInput,
} from '../src/workspace/engineering-loads/authorized-empirical-load-input.js';
import {
  AUTHORIZED_EMPIRICAL_LOAD_EXECUTION_V7_REQUEST_SCHEMA,
  calculateAuthorizedEmpiricalLoadExecutionV7,
} from '../src/workspace/engineering-loads/authorized-empirical-load-execution-v7.js';
import {
  AUTHORIZED_EMPIRICAL_LOAD_EXECUTION_V8_REQUEST_SCHEMA,
  AUTHORIZED_EMPIRICAL_LOAD_EXECUTION_V8_SCHEMA,
  calculateAuthorizedEmpiricalLoadExecutionV8,
  requireAuthorizedEmpiricalLoadExecutionV8,
} from '../src/workspace/engineering-loads/authorized-empirical-load-execution-v8.js';
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
  buildEnrichmentProductionHydroFluidDensityOverlay,
  buildEnrichmentProductionInsulationDensityOverlay,
} from '../src/workspace/engineering-enrichment/production-secondary-density-overlays.js';
import {
  ENRICHMENT_MATERIAL_SELECTION_PROJECTION_SCHEMA,
  buildEnrichmentProductionMaterialSelectionOverlay,
  buildEnrichmentProductionSupportCapabilityOverlay,
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
const MATERIAL_SELECTION_RESOLUTION_HASH = hash('P5F:EXACT_MATERIAL_SELECTION_RESOLUTION');
const BASE_SECTION = Object.freeze({
  outsideDiameterMm: 100, wallThicknessMm: 5, materialCode: 'MAT-1',
  insulationCode: 'INS-1', insulationThicknessMm: 10,
});
const V7_SECTION = Object.freeze({
  outsideDiameterMm: 110, wallThicknessMm: 6, materialCode: 'MAT-1',
  insulationCode: 'INS-2', insulationThicknessMm: 12,
});
const V8_SECTION = Object.freeze({ ...V7_SECTION, materialCode: 'MAT-2' });

const fixtureInput = fixture({ x: 250, y: 0, z: 0 });
const authorizedInput = makeAuthorizedInput();
const componentCandidate = componentCandidateProjection(fixtureInput.dataset, [componentCandidateRow('VALVE-1', 20, 'PROPOSAL:VALVE-1')]);
const fluidCandidate = operatingFluidProjection(fixtureInput.dataset, [fluidProjectionRow('L-1', 1000, 'FLUID_DENSITY:L-1')]);
const materialCandidate = materialDensityProjection(fixtureInput.dataset, [materialDensityRow('L-1', 8050, 'MATERIAL_DENSITY:L-1')]);
const v7SectionCandidate = pipeSectionProjection(fixtureInput.dataset, [pipeSectionRow('L-1', V7_SECTION, 'PIPE_SECTION:L-1:V7')]);
const v8SectionCandidate = pipeSectionProjection(fixtureInput.dataset, [pipeSectionRow('L-1', V8_SECTION, 'PIPE_SECTION:L-1:V8')]);
const insulationCandidate = secondaryDensityProjection(
  fixtureInput.dataset, ENRICHMENT_INSULATION_DENSITY_PROJECTION_SCHEMA, INSULATION_RESOLUTION_HASH,
  'INSULATION_DENSITY', [secondaryDensityRow({
    resolutionHash: INSULATION_RESOLUTION_HASH, fieldFamily: 'INSULATION_DENSITY', targetId: 'L-1',
    referenceCode: 'INS-2', densityKgPerM3: 180, sourceKind: 'INSULATION_REGISTER',
    sourceKey: 'insulationRegister', sourceHash: HASHES.insulationRegister, proposalId: 'INSULATION_DENSITY:L-1',
  })],
);
const hydroCandidate = secondaryDensityProjection(
  fixtureInput.dataset, ENRICHMENT_HYDRO_FLUID_DENSITY_PROJECTION_SCHEMA, HYDRO_RESOLUTION_HASH,
  'HYDRO_FLUID_DENSITY', [secondaryDensityRow({
    resolutionHash: HYDRO_RESOLUTION_HASH, fieldFamily: 'HYDRO_FLUID_DENSITY', targetId: 'L-1',
    referenceCode: 'HYDRO-WATER', densityKgPerM3: 1100, sourceKind: 'FLUID_REGISTER',
    sourceKey: 'fluidRegister', sourceHash: HASHES.fluidRegister, proposalId: 'HYDRO_FLUID_DENSITY:L-1',
  })],
);
const materialSelectionCandidate = materialSelectionProjection(fixtureInput.dataset, [materialSelectionRow('L-1', 'MAT-2', 8050)]);
const supportCore = buildCoreSupportAuthority(fixtureInput.dataset.sharedModel);
const supportCandidate = buildEnrichmentSupportCapabilityProjection({
  attachmentModel: supportCore.attachmentModel,
  restraintCapabilityModel: supportCore.restraintModel,
  dataset: fixtureInput.dataset,
  supportSiteModel: fixtureInput.supportSiteModel,
  sourceStructuralHash: structuralHash(fixtureInput.dataset),
});

const componentGovernance = governedSeal(componentCandidate, 'Package 5A component weight.');
const fluidGovernance = governedSeal(fluidCandidate, 'Package 5B operating fluid density.');
const materialGovernance = governedSeal(materialCandidate, 'Package 5C material density.');
const v7SectionGovernance = governedSeal(v7SectionCandidate, 'Package 5D section consumed by 5E.');
const v8SectionGovernance = governedSeal(v8SectionCandidate, 'Package 5D section consumed by 5F material selection.');
const insulationGovernance = governedSeal(insulationCandidate, 'Package 5E insulation density.');
const hydroGovernance = governedSeal(hydroCandidate, 'Package 5E hydro density.');
const materialSelectionGovernance = governedSeal(materialSelectionCandidate, 'Package 5F material selection identity.');
const supportGovernance = governedSeal(supportCandidate, 'Package 5F support capability authority.');

const componentOverlay = buildEnrichmentProductionComponentWeightOverlay({ seal: componentGovernance.seal, currentness: componentGovernance.currentness, candidateProjection: componentCandidate, dataset: fixtureInput.dataset });
const fluidOverlay = buildEnrichmentProductionOperatingFluidDensityOverlay({ seal: fluidGovernance.seal, currentness: fluidGovernance.currentness, candidateProjection: fluidCandidate, dataset: fixtureInput.dataset });
const materialOverlay = buildEnrichmentProductionMaterialDensityOverlay({ seal: materialGovernance.seal, currentness: materialGovernance.currentness, candidateProjection: materialCandidate, dataset: fixtureInput.dataset });
const v7SectionOverlay = buildEnrichmentProductionPipeSectionOverlay({ seal: v7SectionGovernance.seal, currentness: v7SectionGovernance.currentness, candidateProjection: v7SectionCandidate, dataset: fixtureInput.dataset });
const v8SectionOverlay = buildEnrichmentProductionPipeSectionOverlay({ seal: v8SectionGovernance.seal, currentness: v8SectionGovernance.currentness, candidateProjection: v8SectionCandidate, dataset: fixtureInput.dataset });
const insulationOverlay = buildEnrichmentProductionInsulationDensityOverlay({ seal: insulationGovernance.seal, currentness: insulationGovernance.currentness, candidateProjection: insulationCandidate, dataset: fixtureInput.dataset });
const hydroOverlay = buildEnrichmentProductionHydroFluidDensityOverlay({ seal: hydroGovernance.seal, currentness: hydroGovernance.currentness, candidateProjection: hydroCandidate, dataset: fixtureInput.dataset });
const materialSelectionOverlay = buildEnrichmentProductionMaterialSelectionOverlay({ seal: materialSelectionGovernance.seal, currentness: materialSelectionGovernance.currentness, candidateProjection: materialSelectionCandidate, dataset: fixtureInput.dataset });
const supportOverlay = buildEnrichmentProductionSupportCapabilityOverlay({ seal: supportGovernance.seal, currentness: supportGovernance.currentness, candidateProjection: supportCandidate, dataset: fixtureInput.dataset, supportSiteModel: fixtureInput.supportSiteModel });

assert.equal(materialSelectionOverlay.status, 'READY_FOR_PRODUCTION_CONSUMPTION');
assert.deepEqual(materialSelectionOverlay.lineMaterialAuthority, { 'L-1': { referenceCode: 'MAT-2', densityKgPerM3: 8050, unit: 'kg/m3' } });
assert.equal(supportOverlay.status, 'READY_FOR_PRODUCTION_CONSUMPTION');
assert.deepEqual(supportOverlay.supportTypeCapabilities, { GUIDE: { vertical: true }, REST: { vertical: true } });
assert.equal(supportOverlay.policy.supportAvailabilityScenariosActivated, false);
assert.equal(supportOverlay.policy.gapMechanicsActivated, false);
assert.equal(supportOverlay.policy.springMechanicsActivated, false);
assert.equal(supportOverlay.policy.frictionMechanicsActivated, false);
assert.equal(supportOverlay.policy.liftOffActivated, false);

const datasetSnapshot = JSON.stringify(fixtureInput.dataset);
const profileSnapshot = JSON.stringify(fixtureInput.profile);
const authorizedSnapshot = JSON.stringify(authorizedInput);
const baselineV2 = executeV7(EMPIRICAL_LOAD_METHOD);
const enrichedV2 = executeV8(EMPIRICAL_LOAD_METHOD);
const baselineCog = executeV7(EMPIRICAL_LOAD_COG_METHOD);
const enrichedCog = executeV8(EMPIRICAL_LOAD_COG_METHOD);

assert.equal(enrichedV2.schema, AUTHORIZED_EMPIRICAL_LOAD_EXECUTION_V8_SCHEMA);
assert.equal(enrichedV2.status, 'CALCULATED');
assert.deepEqual(enrichedV2.activatedEnrichmentFieldFamilies, [
  'COMPONENT_WEIGHTS', 'OPERATING_FLUID_DENSITIES', 'MATERIAL_DENSITIES', 'PIPE_SECTIONS',
  'INSULATION_DENSITIES', 'HYDRO_FLUID_DENSITIES', 'MATERIAL_SELECTION', 'SUPPORT_CAPABILITIES',
]);
assert.equal(enrichedV2.materialSelectionSealHash, materialSelectionGovernance.seal.sealHash);
assert.equal(enrichedV2.supportCapabilitySealHash, supportGovernance.seal.sealHash);
assert.notEqual(enrichedV2.effectiveMaterialDensitiesSemanticHash, baselineV2.effectiveMaterialDensitiesSemanticHash);
assert.notEqual(enrichedV2.effectivePipeSectionPropertiesSemanticHash, baselineV2.effectivePipeSectionPropertiesSemanticHash);
assert.equal(enrichedV2.effectiveSupportTypeCapabilitiesSemanticHash, semanticHash({ GUIDE: { vertical: true }, REST: { vertical: true } }));

for (const [baseline, enriched, method] of [
  [baselineV2, enrichedV2, EMPIRICAL_LOAD_METHOD],
  [baselineCog, enrichedCog, EMPIRICAL_LOAD_COG_METHOD],
]) {
  for (const caseId of ['EMPTY', 'OPE', 'HYD']) {
    const baseCase = loadCase(baseline, caseId);
    const nextCase = loadCase(enriched, caseId);
    assertClose(baseCase.equilibrium.appliedForceN, nextCase.equilibrium.appliedForceN);
    assertClose(baseCase.equilibrium.reactionN, nextCase.equilibrium.reactionN);
    assertClose(nextCase.equilibrium.forceResidualN, 0, 1e-8);
    assertClose(nextCase.equilibrium.momentResidualNmm, 0, 1e-5);
    const pipeForce = contribution(enriched, caseId, 'PIPE-1').verticalForceN;
    const valveForce = contribution(enriched, caseId, 'VALVE-1').verticalForceN;
    assertClose(contribution(baseline, caseId, 'PIPE-1').verticalForceN, pipeForce);
    assertClose(contribution(baseline, caseId, 'VALVE-1').verticalForceN, valveForce);
    const expected = method === EMPIRICAL_LOAD_METHOD
      ? [pipeForce / 4, pipeForce / 2 + valveForce, pipeForce / 4]
      : [pipeForce / 4 + valveForce / 2, pipeForce / 2 + valveForce / 2, pipeForce / 4];
    const actual = reactions(enriched, caseId);
    actual.forEach((value, index) => assertClose(value, expected[index]));
    assertClose(reactions(baseline, caseId)[1], 0);
    assert.ok(actual[1] > 0);
    assert.equal(contribution(enriched, caseId, 'PIPE-1').formula.metalKg, contribution(baseline, caseId, 'PIPE-1').formula.metalKg);
    assertComponentMechanicsInvariant(contribution(baseline, caseId, 'VALVE-1'), contribution(enriched, caseId, 'VALVE-1'));
  }
}

assert.throws(
  () => executeV7(EMPIRICAL_LOAD_METHOD, { sealedPipeSectionOverlay: v8SectionOverlay, pipeSectionObservedAuthority: v8SectionGovernance.observed }),
  (error) => error.code === 'EMPIRICAL_EXECUTION_V7_MATERIAL_CODE_CHANGE_OUTSIDE_SCOPE',
);

const mismatchedSelectionCandidate = materialSelectionProjection(fixtureInput.dataset, [materialSelectionRow('L-1', 'MAT-X', 8050)]);
const mismatchedSelectionGovernance = governedSeal(mismatchedSelectionCandidate, 'Mismatched material selection.');
const mismatchedSelectionOverlay = buildEnrichmentProductionMaterialSelectionOverlay({
  seal: mismatchedSelectionGovernance.seal, currentness: mismatchedSelectionGovernance.currentness,
  candidateProjection: mismatchedSelectionCandidate, dataset: fixtureInput.dataset,
});
assert.throws(
  () => executeV8(EMPIRICAL_LOAD_METHOD, {
    sealedMaterialSelectionOverlay: mismatchedSelectionOverlay,
    materialSelectionObservedAuthority: mismatchedSelectionGovernance.observed,
  }),
  (error) => error.code === 'EMPIRICAL_EXECUTION_V8_MATERIAL_CODE_AUTHORITY_MISMATCH',
);

const mismatchedDensityCandidate = materialSelectionProjection(fixtureInput.dataset, [materialSelectionRow('L-1', 'MAT-2', 8060)]);
const mismatchedDensityGovernance = governedSeal(mismatchedDensityCandidate, 'Mismatched material density consensus.');
const mismatchedDensityOverlay = buildEnrichmentProductionMaterialSelectionOverlay({
  seal: mismatchedDensityGovernance.seal, currentness: mismatchedDensityGovernance.currentness,
  candidateProjection: mismatchedDensityCandidate, dataset: fixtureInput.dataset,
});
assert.throws(
  () => executeV8(EMPIRICAL_LOAD_METHOD, {
    sealedMaterialSelectionOverlay: mismatchedDensityOverlay,
    materialSelectionObservedAuthority: mismatchedDensityGovernance.observed,
  }),
  (error) => error.code === 'EMPIRICAL_EXECUTION_V8_MATERIAL_DENSITY_AUTHORITY_MISMATCH',
);

const changedSupportSiteModel = structuredClone(fixtureInput.supportSiteModel);
changedSupportSiteModel.sites[1].positionMm.x = 501;
assert.throws(
  () => executeV8(EMPIRICAL_LOAD_METHOD, { supportSiteModel: changedSupportSiteModel }),
  (error) => error.code === 'EMPIRICAL_EXECUTION_V8_SUPPORT_SITE_MODEL_STALE',
);

const changedProfile = structuredClone(fixtureInput.profile);
changedProfile.revision += 1;
assert.throws(
  () => executeV8(EMPIRICAL_LOAD_METHOD, { profile: changedProfile }),
  (error) => error.code === 'EMPIRICAL_EXECUTION_V8_PROJECT_DATA_STALE',
);

const differentContextGovernance = governedSeal(supportCandidate, 'Different support context.', { approximationSetHash: hash('different-approximations') });
const differentContextOverlay = buildEnrichmentProductionSupportCapabilityOverlay({
  seal: differentContextGovernance.seal, currentness: differentContextGovernance.currentness,
  candidateProjection: supportCandidate, dataset: fixtureInput.dataset, supportSiteModel: fixtureInput.supportSiteModel,
});
assert.throws(
  () => executeV8(EMPIRICAL_LOAD_METHOD, {
    sealedSupportCapabilityOverlay: differentContextOverlay,
    supportCapabilityObservedAuthority: differentContextGovernance.observed,
  }),
  (error) => error.code === 'EMPIRICAL_EXECUTION_V8_CONTEXT_AUTHORITY_MISMATCH',
);

const repeated = executeV8(EMPIRICAL_LOAD_METHOD);
assert.deepEqual(repeated, enrichedV2, 'Package 5F execution must be deterministic');
assert.equal(JSON.stringify(fixtureInput.dataset), datasetSnapshot, '5F mutated source dataset');
assert.equal(JSON.stringify(fixtureInput.profile), profileSnapshot, '5F mutated Project Data');
assert.equal(JSON.stringify(authorizedInput), authorizedSnapshot, '5F mutated authorized input');

const tampered = structuredClone(enrichedV2);
tampered.activatedEnrichmentFieldFamilies.push('SUPPORT_AVAILABILITY_SCENARIOS');
assert.throws(
  () => requireAuthorizedEmpiricalLoadExecutionV8(tampered),
  (error) => error.code === 'EMPIRICAL_EXECUTION_V8_FIELD_FAMILY_INVALID',
);

const overlaySource = await readFile(new URL('../src/workspace/engineering-enrichment/production-material-support-authority-overlays.js', import.meta.url), 'utf8');
const executionSource = await readFile(new URL('../src/workspace/engineering-loads/authorized-empirical-load-execution-v8.js', import.meta.url), 'utf8');
assert.doesNotMatch(overlaySource, /calculateSupportLoadDistribution|distributeUniform|distributePoint|active[-_ ]?set|thermalLift|calculateLift|solveLift|activeSet/iu);
assert.match(overlaySource, /liftOffActivated:\s*false/u);
assert.doesNotMatch(executionSource, /function\s+(distributePoint|distributeUniform|resolveCaseMass|fluidMass|insulationMass|annulusAreaM2)\b/iu);
assert.doesNotMatch(executionSource, /analysis-authority-overlay|STAGEDJSON_SUPPORT_SOLVER_AUTHORITY_UNRESOLVED/iu);

console.log(JSON.stringify({
  check: 'enrichment-package5f-material-support-authority-batch',
  status: 'PASS',
  executionSchema: enrichedV2.schema,
  baselineMaterialCode: V7_SECTION.materialCode,
  sealedMaterialCode: V8_SECTION.materialCode,
  materialDensityKgPerM3: 8050,
  materialIdentityClosureNumericallyNeutralAfter5C: true,
  baselineSupportCapabilities: { REST: { vertical: true }, GUIDE: { vertical: false } },
  sealedSupportCapabilities: supportOverlay.supportTypeCapabilities,
  v2MiddleSupportReactionsN: ['EMPTY', 'OPE', 'HYD'].map((caseId) => reactions(enrichedV2, caseId)[1]),
  v3CogMiddleSupportReactionsN: ['EMPTY', 'OPE', 'HYD'].map((caseId) => reactions(enrichedCog, caseId)[1]),
  totalAppliedForcePreservedAcrossSupportCutover: true,
  equilibriumPreserved: true,
  materialCodeChangeRequiresIndependentSealConsensus: true,
  materialDensityConsensusRequired: true,
  supportSiteIdentityCurrentnessRequired: true,
  supportAvailabilityScenariosActivated: false,
  nonlinearContactMechanicsActivated: false,
  stagedJsonAuthorityOverlayImported: false,
  gravityMechanicsReused: true,
  sourceImmutable: true,
}, null, 2));

function executeV7(method, overrides = {}) {
  return calculateAuthorizedEmpiricalLoadExecutionV7({
    schema: AUTHORIZED_EMPIRICAL_LOAD_EXECUTION_V7_REQUEST_SCHEMA,
    executionId: `BASE-5E:${method}`, executedAt: '2026-08-08T08:24:00.000Z', method, authorizedInput,
    sealedComponentWeightOverlay: componentOverlay, componentObservedAuthority: componentGovernance.observed,
    sealedOperatingFluidDensityOverlay: fluidOverlay, operatingFluidObservedAuthority: fluidGovernance.observed,
    sealedMaterialDensityOverlay: materialOverlay, materialObservedAuthority: materialGovernance.observed,
    sealedPipeSectionOverlay: v7SectionOverlay, pipeSectionObservedAuthority: v7SectionGovernance.observed,
    sealedInsulationDensityOverlay: insulationOverlay, insulationObservedAuthority: insulationGovernance.observed,
    sealedHydroFluidDensityOverlay: hydroOverlay, hydroFluidObservedAuthority: hydroGovernance.observed,
    ...fixtureInput, ...overrides,
  });
}
function executeV8(method, overrides = {}) {
  return calculateAuthorizedEmpiricalLoadExecutionV8({
    schema: AUTHORIZED_EMPIRICAL_LOAD_EXECUTION_V8_REQUEST_SCHEMA,
    executionId: `ENRICHED-5F:${method}`, executedAt: '2026-08-08T08:25:00.000Z', method, authorizedInput,
    sealedComponentWeightOverlay: componentOverlay, componentObservedAuthority: componentGovernance.observed,
    sealedOperatingFluidDensityOverlay: fluidOverlay, operatingFluidObservedAuthority: fluidGovernance.observed,
    sealedMaterialDensityOverlay: materialOverlay, materialObservedAuthority: materialGovernance.observed,
    sealedPipeSectionOverlay: v8SectionOverlay, pipeSectionObservedAuthority: v8SectionGovernance.observed,
    sealedInsulationDensityOverlay: insulationOverlay, insulationObservedAuthority: insulationGovernance.observed,
    sealedHydroFluidDensityOverlay: hydroOverlay, hydroFluidObservedAuthority: hydroGovernance.observed,
    sealedMaterialSelectionOverlay: materialSelectionOverlay, materialSelectionObservedAuthority: materialSelectionGovernance.observed,
    sealedSupportCapabilityOverlay: supportOverlay, supportCapabilityObservedAuthority: supportGovernance.observed,
    ...fixtureInput, ...overrides,
  });
}
function governedSeal(candidateValue, basis, contextOverrides = {}) {
  const packet = reviewPacket(candidateValue, contextOverrides);
  const observed = buildEnrichmentObservedAuthority({ ...packet.evidenceRefs, contextIdentities: packet.contextIdentities });
  const approval = buildEngineeringEnrichmentApproval({
    reviewPacket: packet, approvalId: `APPROVAL:${candidateValue.projectionHash}:${hash(basis)}`,
    reviewerId: 'production-enrichment-reviewer', approvedAt: '2026-08-08T08:21:00.000Z', basis,
  });
  const seal = buildEngineeringInputSeal({
    reviewPacket: packet, observedAuthority: observed, approvals: [approval],
    sealId: `SEAL:${candidateValue.projectionHash}:${hash(basis)}`, sealedBy: 'production-enrichment-governance',
    sealedAt: '2026-08-08T08:22:00.000Z',
  });
  const currentness = evaluateEngineeringInputSealCurrentness({ seal, observedAuthority: observed });
  return { packet, observed, approval, seal, currentness };
}
function reviewPacket(candidateValue, contextOverrides = {}) {
  const resolutionHash = candidateValue.resolutionHash ?? candidateValue.fluidResolutionHash
    ?? candidateValue.materialResolutionHash ?? candidateValue.pipingClassResolutionHash
    ?? candidateValue.restraintCapabilityModelSemanticHash;
  const evidenceRefs = {
    sourceDatasetHash: candidateValue.sourceDatasetHash,
    sourceSharedModelHash: candidateValue.sourceSharedModelHash,
    sourceStructuralHash: candidateValue.sourceStructuralHash,
    masterSnapshotHashes: [hash(`master:${candidateValue.sourceDatasetHash}:${candidateValue.projectionHash}`)],
    proposalHashes: candidateValue.rows.map((row) => row.proposalHash).sort(ascii),
    resolutionHash,
    candidateProjectionHash: candidateValue.projectionHash,
    structuralImpactHash: hash(`structural-impact:${candidateValue.projectionHash}`),
    engineDescriptorHash: hash('engine-descriptor'), baselineReferenceHash: hash('baseline-reference'),
    baselineResultHash: hash('baseline-result'), candidateResultHash: hash(`candidate-result:${candidateValue.projectionHash}`),
    numericalImpactHash: hash(`numerical-impact:${candidateValue.projectionHash}`),
  };
  const contextIdentities = {
    projectDataHash: semanticHash(fixtureInput.profile), overrideSetHash: hash('overrides'),
    approximationSetHash: hash('approximations'), selectorRegistryHash: hash('selectors'), ...contextOverrides,
  };
  const material = {
    schema: 'EngineeringEnrichmentReviewPacket.v1', evidenceRefs, contextIdentities, blockers: [],
    summary: {
      snapshotCount: 1, proposalCount: candidateValue.rows.length, step1Status: 'READY_FOR_REVIEW',
      candidateStatus: candidateValue.summary.status, step2Status: 'PASS_SHADOW_NO_STRUCTURAL_CHANGE',
      step3Status: 'RECORDED_SHADOW_RAW_DELTAS', contextIdentityCount: 4, status: 'READY_FOR_REVIEW_ONLY',
    },
    status: 'READY_FOR_REVIEW_ONLY', reviewDecisionStatus: 'NOT_RECORDED', persistenceCreated: false,
    bindingCreated: false, reviewSelectionCreated: false, approvalGranted: false, current: false,
    sealEligible: false, calculationEligible: false, resultAcceptanceEligible: false,
  };
  return Object.freeze({ ...material, packetHash: semanticHash(material) });
}

function fixture(cogPointMm) {
  const pipe = pipeComponent('PIPE-1', point(0), point(1000), { identity: { lineId: 'L-1', branchId: 'L-1/B1' } });
  const valveBase = pipeComponent('VALVE-1', point(500), point(500), { type: 'VALVE', identity: { lineId: 'L-1', branchId: 'L-1/B1' } });
  const valve = {
    ...valveBase,
    loadEvidence: {
      componentCog: {
        value: cogPointMm, unit: 'mm', sourceKind: 'COMPOSITE_EXPLICIT_SOURCE_EVIDENCE', sourcePath: 'fixture.componentCog',
        axes: {
          x: evidence(cogPointMm.x, 'mm', 'fixture.componentCog.x'),
          y: evidence(cogPointMm.y, 'mm', 'fixture.componentCog.y'),
          z: evidence(cogPointMm.z, 'mm', 'fixture.componentCog.z'),
        },
      },
    },
  };
  const supports = [
    supportRecord('SUP-0', point(0), { sourceEntityId: 'SOURCE-SUP-0', sourceType: 'REST', supportEvidence: supportEvidence({ componentReferences: 'PIPE-1', supportTypes: 'REST' }) }),
    supportRecord('SUP-500', point(500), { sourceEntityId: 'SOURCE-SUP-500', sourceType: 'GUIDE', supportEvidence: supportEvidence({ componentReferences: 'PIPE-1', supportTypes: 'GUIDE', vertical: 'RESTRAINED', lateral: 'RESTRAINED' }) }),
    supportRecord('SUP-1000', point(1000), { sourceEntityId: 'SOURCE-SUP-1000', sourceType: 'REST', supportEvidence: supportEvidence({ componentReferences: 'PIPE-1', supportTypes: 'REST' }) }),
  ];
  const sharedModel = sharedFixture({ datasetId: 'EMP-PROD-05F-DATASET', components: [pipe, valve], supports });
  return {
    dataset: {
      schema: 'analysis-workspace-dataset/v1', datasetId: sharedModel.project.datasetId, version: 1,
      sourceSha256: HASHES.dataset, sharedModel,
      entities: [
        entity('PIPE-1', 'PIPE', 'pipe', 'PIPE-1', 'L-1', {}),
        entity('VALVE-1', 'VALVE', 'component', 'VALVE-1', 'L-1', { attributes: { CATALOG_KEY: 'CV-1' } }),
      ],
    },
    profile: makeProfile(),
    supportSiteModel: supportSites(sharedModel.project.datasetId),
    routePartitionModel: {
      schema: 'route-partition-model/v1',
      routes: [{ routeId: 'ROUTE-1', status: 'READY', blockers: [], physicalEdgeIds: ['PIPE-1', 'VALVE-1'], entityChainages: [chainage('PIPE-1', 0, 1000, 500), chainage('VALVE-1', 500, 500, 500)] }],
      edges: [
        edge('PIPE-1', 'PIPE', point(0), point(1000), 1000, false),
        edge('VALVE-1', 'VALVE', point(500), point(500), 0, true),
      ],
    },
    masterData: { lineList: { sourceHash: HASHES.lineList }, pipingClass: { sourceHash: HASHES.pipingClass }, weight: { sourceHash: HASHES.componentWeight } },
  };
}
function buildCoreSupportAuthority(sharedModel) {
  const attachmentModel = buildSupportAttachmentModel(sharedModel, exactTopology(sharedModel));
  return { attachmentModel, restraintModel: buildRestraintCapabilityModel(attachmentModel) };
}
function makeAuthorizedInput() {
  const overlayValue = {
    pipeSectionProperties: { 'L-1': { ...BASE_SECTION } }, materialDensitiesKgPerM3: { 'MAT-1': 7850 },
    operatingFluidDensitiesKgPerM3: { 'L-1': 800 }, hydroFluidDensitiesKgPerM3: { 'L-1': 1000 },
    insulationDensitiesKgPerM3: { 'INS-1': 120 }, componentWeightsKg: { 'CV-1': 10 },
  };
  const draft = {
    schema: 'authorized-empirical-load-input/v1', intakeId: 'INTAKE-EMP-05F', projectId: 'EMP-PROD-05F-PROJECT',
    baselineId: 'BASELINE-EMP-05F', baselineRevision: 1, baselineSemanticHash: 'fnv1a64:1111111111111111',
    readinessEvaluationSemanticHash: 'fnv1a64:2222222222222222', readinessSemanticHash: 'fnv1a64:3333333333333333',
    handoffSemanticHash: 'fnv1a64:4444444444444444', projectionPayloadSemanticHash: 'fnv1a64:5555555555555555',
    adapterVersion: 'empirical-adapter/1.0.0', configurationHash: 'fnv1a64:6666666666666666', createdAt: '2026-08-08T08:18:00.000Z',
    lineBindings: [{ targetId: 'line:001', sourceRecordId: 'PIPE-1', lineKey: 'L-1', projectionRecordSemanticHash: 'fnv1a64:7777777777777777' }],
    componentBindings: [{ targetId: 'component:001', sourceRecordId: 'VALVE-1', lineKey: 'L-1', catalogKey: 'CV-1', projectionRecordSemanticHash: 'fnv1a64:8888888888888888' }],
    loadCalculationOverlay: overlayValue, overlaySemanticHash: semanticHash(overlayValue),
    summary: { lineCount: 1, componentCount: 1, materialCodeCount: 1, insulationCodeCount: 1, componentCatalogCount: 1 },
    semanticHash: 'fnv1a64:0000000000000000',
  };
  return requireAuthorizedEmpiricalLoadInput({ ...draft, semanticHash: computeAuthorizedEmpiricalLoadInputSemanticHash(draft) });
}
function makeProfile() {
  const empty = createEmptyProjectDataProfile();
  const approved = (value, source) => createEvidenceValue(value, { source }, true);
  const sourced = (value, sourceKey, sourceHash) => createEvidenceValue(value, { source: 'EMP_PROD_05F_FIXTURE', sourceKey, sourceHash }, true);
  return {
    ...empty, projectId: 'EMP-PROD-05F-PROJECT', revision: 1, updatedAt: '2026-08-08T08:17:00.000Z',
    sourcesAndUnits: {
      ...empty.sourcesAndUnits,
      lineListSource: sourced({ sha256: HASHES.lineList }, 'lineList', HASHES.lineList),
      pipingClassSource: sourced({ sha256: HASHES.pipingClass }, 'pipingClass', HASHES.pipingClass),
      componentWeightSource: sourced({ sha256: HASHES.componentWeight }, 'componentWeight', HASHES.componentWeight),
    },
    topology: {
      ...empty.topology,
      portMatchToleranceMm: approved(1, 'EMP_PROD_05F_TOPOLOGY'), supportSiteGroupingToleranceMm: approved(1, 'EMP_PROD_05F_TOPOLOGY'),
      autoCarrierCoincidenceToleranceMm: approved(1, 'EMP_PROD_05F_TOPOLOGY'), routeJoiningRules: approved({ mode: 'EXACT' }, 'EMP_PROD_05F_TOPOLOGY'),
      supportTypeCapabilities: approved({ GUIDE: { vertical: false }, REST: { vertical: true } }, 'EMP_PROD_05F_BASE_SUPPORT_POLICY'),
    },
    loadCalculation: {
      ...empty.loadCalculation,
      gravityMPerS2: approved(9.81, 'EMP_PROD_05F_LOAD_POLICY'), loadFactor: approved(1, 'EMP_PROD_05F_LOAD_POLICY'),
      equilibriumTolerances: approved({ forceN: 1e-8, momentNmm: 1e-5 }, 'EMP_PROD_05F_EQUILIBRIUM'),
      activeLoadCases: approved(['EMPTY', 'OPE', 'HYD'], 'EMP_PROD_05F_CASES'),
    },
  };
}
function supportSites(datasetId) {
  const defs = [['S-0', 0, 'SOURCE-SUP-0', 'REST'], ['S-500', 500, 'SOURCE-SUP-500', 'GUIDE'], ['S-1000', 1000, 'SOURCE-SUP-1000', 'REST']];
  return {
    schema: 'support-site-model/v1', datasetId, sourceAxisBasis: 'Z_UP', groupingToleranceMm: 1, status: 'READY', blockers: [], members: [], assemblies: [],
    sites: defs.map(([siteId, x, sourceEntityId, sourceType]) => ({
      siteId, tags: [siteId], positionMm: point(x), assemblyIds: [`ASM-${siteId}`], memberEntityIds: [`MEM-${siteId}`], primaryEntityId: `MEM-${siteId}`, branchIds: ['L-1/B1'],
      assemblies: [{ assemblyId: `ASM-${siteId}`, tag: siteId, branchId: 'L-1/B1', lineKey: 'L-1', positionMm: point(x), memberEntityIds: [`MEM-${siteId}`], members: [{ entityId: `MEM-${siteId}`, sourceEntityId, sourceType, lineKey: 'L-1', positionMm: point(x) }] }],
    })),
    summary: { sourceSupportRecordCount: 3, supportAssemblyCount: 3, physicalLocationCount: 3 },
  };
}

function componentCandidateProjection(dataset, rows) { return projectionWith(dataset, 'EngineeringEnrichmentCandidateProjection.v2', 'resolutionHash', hash(`component-resolution:${semanticHash(rows)}`), rows, { simulationMode: 'ALL_EXACT_MATCHES_SHADOW_ONLY', bindingCreated: false, reviewSelectionCreated: false, approvalGranted: false, current: false, sealEligible: false, calculationEligible: false }); }
function componentCandidateRow(targetId, proposedValue, proposalId) { return Object.freeze({ proposalId, proposalHash: hash(`component:${proposalId}:${proposedValue}`), targetKind: 'COMPONENT', targetId, fieldId: 'componentWeightKg', proposedValue, unit: 'kg', authorityLevel: 'AUTHORIZED_MASTER_CANDIDATE', disposition: 'SHADOW_CANDIDATE_VALUE', blockers: [], existingExplicitEvidence: null, bindingCreated: false }); }
function operatingFluidProjection(dataset, rows) { return projectionWith(dataset, ENRICHMENT_OPERATING_FLUID_DENSITY_PROJECTION_SCHEMA, 'fluidResolutionHash', FLUID_RESOLUTION_HASH, rows); }
function fluidProjectionRow(targetId, proposedValue, proposalId) { return scalarRow({ resolutionHash: FLUID_RESOLUTION_HASH, targetId, fieldId: 'fluid.densityKgM3', proposedValue, proposalId, sourceKind: 'FLUID_REGISTER', sourceKey: 'fluidRegister', sourceHash: HASHES.fluidRegister }); }
function materialDensityProjection(dataset, rows) { return projectionWith(dataset, ENRICHMENT_MATERIAL_DENSITY_PROJECTION_SCHEMA, 'materialResolutionHash', MATERIAL_RESOLUTION_HASH, rows); }
function materialDensityRow(targetId, proposedValue, proposalId) { return scalarRow({ resolutionHash: MATERIAL_RESOLUTION_HASH, targetId, fieldId: 'material.densityKgM3', proposedValue, proposalId, sourceKind: 'MATERIAL_REGISTER', sourceKey: 'materialRegister', sourceHash: HASHES.materialRegister }); }
function scalarRow({ resolutionHash, targetId, fieldId, proposedValue, proposalId, sourceKind, sourceKey, sourceHash }) {
  const sourceEvidence = Object.freeze({ sourceKind, sourceKey, sourceHash, locator: `${sourceKind}:${targetId}:${fieldId}` });
  const resolutionKey = fieldId.startsWith('material.') ? 'materialResolutionHash' : 'fluidResolutionHash';
  return Object.freeze({
    proposalId, proposalHash: semanticHash({ [resolutionKey]: resolutionHash, targetKind: 'LINE', targetId, fieldId, proposedValue, unit: 'kg/m3', sourceEvidence }),
    targetKind: 'LINE', targetId, fieldId, proposedValue, unit: 'kg/m3', authorityLevel: 'AUTHORIZED_MASTER_CANDIDATE',
    disposition: 'SHADOW_CANDIDATE_VALUE', blockers: [], existingExplicitEvidence: null, bindingCreated: false, sourceEvidence,
  });
}
function pipeSectionProjection(dataset, rows) { return projectionWith(dataset, ENRICHMENT_PIPE_SECTION_PROJECTION_SCHEMA, 'pipingClassResolutionHash', PIPE_SECTION_RESOLUTION_HASH, rows); }
function pipeSectionRow(targetId, proposedSection, proposalId) {
  const sourceEvidence = Object.freeze({ sourceKind: 'PIPING_CLASS', sourceKey: 'pipingClass', sourceHash: HASHES.pipingClass, locators: Object.freeze({ insulationCode: `PC:${targetId}:ins`, insulationThicknessMm: `PC:${targetId}:thk`, materialCode: `PC:${targetId}:mat`, outsideDiameterMm: `PC:${targetId}:od`, wallThicknessMm: `PC:${targetId}:wall` }) });
  const section = Object.freeze({ ...proposedSection });
  return Object.freeze({ proposalId, proposalHash: semanticHash({ pipingClassResolutionHash: PIPE_SECTION_RESOLUTION_HASH, targetKind: 'LINE', targetId, fieldFamily: 'PIPE_SECTION', proposedSection: section, sourceEvidence }), targetKind: 'LINE', targetId, fieldFamily: 'PIPE_SECTION', proposedSection: section, authorityLevel: 'AUTHORIZED_MASTER_CANDIDATE', disposition: 'SHADOW_CANDIDATE_VALUE', blockers: [], bindingCreated: false, sourceEvidence });
}
function secondaryDensityProjection(dataset, schema, resolutionHash, fieldFamily, rows) { return projectionWith(dataset, schema, 'resolutionHash', resolutionHash, rows); }
function secondaryDensityRow({ resolutionHash, fieldFamily, targetId, referenceCode, densityKgPerM3, sourceKind, sourceKey, sourceHash, proposalId }) {
  const sourceEvidence = Object.freeze({ sourceKind, sourceKey, sourceHash, codeLocator: `${sourceKind}:${targetId}:code`, densityLocator: `${sourceKind}:${targetId}:densityKgM3` });
  return Object.freeze({ proposalId, proposalHash: semanticHash({ resolutionHash, targetKind: 'LINE', targetId, fieldFamily, referenceCode, densityKgPerM3, unit: 'kg/m3', sourceEvidence }), targetKind: 'LINE', targetId, fieldFamily, referenceCode, densityKgPerM3, unit: 'kg/m3', authorityLevel: 'AUTHORIZED_MASTER_CANDIDATE', disposition: 'SHADOW_CANDIDATE_VALUE', blockers: [], sourceEvidence });
}
function materialSelectionProjection(dataset, rows) { return projectionWith(dataset, ENRICHMENT_MATERIAL_SELECTION_PROJECTION_SCHEMA, 'materialResolutionHash', MATERIAL_SELECTION_RESOLUTION_HASH, rows); }
function materialSelectionRow(targetId, referenceCode, densityKgPerM3) {
  const sourceEvidence = Object.freeze({ sourceKind: 'MATERIAL_REGISTER', sourceKey: 'materialRegister', sourceHash: HASHES.materialRegister, codeLocator: `Material:${targetId}:code`, densityLocator: `Material:${targetId}:density` });
  const material = { materialResolutionHash: MATERIAL_SELECTION_RESOLUTION_HASH, targetKind: 'LINE', targetId, fieldFamily: 'MATERIAL_SELECTION', referenceCode, densityKgPerM3, unit: 'kg/m3', sourceEvidence };
  return Object.freeze({ proposalId: `MATERIAL_SELECTION:${targetId}`, proposalHash: semanticHash(material), targetKind: 'LINE', targetId, fieldFamily: 'MATERIAL_SELECTION', referenceCode, densityKgPerM3, unit: 'kg/m3', authorityLevel: 'AUTHORIZED_MASTER_CANDIDATE', disposition: 'SHADOW_CANDIDATE_VALUE', blockers: [], sourceEvidence });
}
function projectionWith(dataset, schema, resolutionKey, resolutionHash, rows, extras = {}) {
  const sortedRows = [...rows].sort((a, b) => ascii(a.proposalId, b.proposalId));
  const material = { schema, sourceDatasetHash: dataset.sourceSha256, sourceSharedModelHash: dataset.sharedModel.semanticHash, sourceStructuralHash: structuralHash(dataset), [resolutionKey]: resolutionHash, rows: sortedRows, summary: projectionSummary(sortedRows), ...extras };
  return Object.freeze({ ...material, projectionHash: semanticHash(material) });
}
function projectionSummary(rows) { return { proposalCount: rows.length, projectedCandidateCount: rows.length, blockedCount: 0, dispositions: { SHADOW_CANDIDATE_VALUE: rows.length }, status: 'READY_FOR_STRUCTURAL_IMPACT' }; }

function entity(entityId, entityType, category, sourceEntityId, lineKey, properties) { return { entityId, entityType, category, lineKey, sourceEntityId, jsonPointer: `/entities/${entityId}`, componentReference: entityId, properties }; }
function chainage(entityId, startMm, endMm, pointMm) { return { entityId, startMm, endMm, pointMm, sourceStartChainageMm: startMm, sourceEndChainageMm: endMm }; }
function edge(entityId, entityType, startMm, endMm, lengthMm, pointComponent) { return { entityId, entityType, startMm, endMm, lengthMm, pointComponent, topologyCarrier: false }; }
function evidence(value, unit, sourcePath) { return { value, unit, sourcePath, sourceKind: 'EXPLICIT_SOURCE_EVIDENCE' }; }
function loadCase(execution, caseId) { return execution.distribution.loadCases.find((row) => row.loadCaseId === caseId); }
function reactions(execution, caseId) { return loadCase(execution, caseId).supportResults.map((row) => row.verticalForceN); }
function contribution(execution, caseId, entityId) { return loadCase(execution, caseId).contributionLedger.find((row) => row.entityId === entityId); }
function assertComponentMechanicsInvariant(base, next) { assert.equal(next.entityId, base.entityId); assertClose(next.massKg, base.massKg); assertClose(next.verticalForceN, base.verticalForceN); assertClose(next.chainageMm, base.chainageMm); assert.equal(next.formula.catalogKey, base.formula.catalogKey); assertClose(next.formula.massKg, base.formula.massKg); }
function structuralHash(dataset) { return hash(`structural:${dataset.datasetId}`); }
function assertClose(actual, expected, tolerance = 1e-9) { assert.ok(Math.abs(actual - expected) <= tolerance, `expected ${expected}, got ${actual}`); }
function hash(label) { return semanticHash({ label }); }
function ascii(left, right) { return left < right ? -1 : left > right ? 1 : 0; }