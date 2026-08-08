import assert from 'node:assert/strict';
import { semanticHash } from '../src/core/shared-piping-model/canonical-json.js';
import {
  requirePreproductionSupportContactAuthority,
} from '../src/workspace/engineering-loads/preproduction-support-contact-authority.js';
import {
  buildPreproductionThermalLiftoffContactBridge,
} from '../src/workspace/engineering-loads/preproduction-support-contact-tl-bridge.js';
import {
  createPreproductionThermalLiftoffDisplacementAuthority,
} from '../src/workspace/engineering-loads/preproduction-thermal-liftoff-displacement-authority.js';
import {
  createPreproductionThermalLiftoffApplicabilityBinding,
  createPreproductionThermalLiftoffReactionToleranceAuthority,
  createPreproductionThermalLiftoffStiffnessEvidence,
} from '../src/workspace/engineering-loads/preproduction-thermal-liftoff-mechanics-authority.js';
import {
  buildPreproductionThermalLiftoffPrerequisiteAuthority,
  buildPreproductionThermalLiftoffPrerequisiteBridge,
} from '../src/workspace/engineering-loads/preproduction-thermal-liftoff-prerequisite-authority.js';
import {
  AUTHORIZED_EMPIRICAL_LOAD_EXECUTION_V8_SCHEMA,
  computeAuthorizedEmpiricalLoadExecutionV8SemanticHash,
  requireAuthorizedEmpiricalLoadExecutionV8,
} from '../src/workspace/engineering-loads/authorized-empirical-load-execution-v8.js';
import {
  calculatePreproductionThermalLiftoffLocalScreenCandidate,
} from '../src/workspace/engineering-loads/preproduction-thermal-liftoff-local-screen.js';
import {
  PREPRODUCTION_TL_LOCAL_SCREEN_EXECUTION_REQUEST_SCHEMA,
  calculatePreproductionThermalLiftoffLocalScreenExecution,
  evaluatePreproductionThermalLiftoffLocalScreenCurrentness,
  requirePreproductionThermalLiftoffLocalScreenExecution,
} from '../src/workspace/engineering-loads/preproduction-thermal-liftoff-local-screen-execution.js';

const contactAuthority = contactAuthorityFixture();
const contactBridge = buildPreproductionThermalLiftoffContactBridge(contactAuthority);
const frame = coordinateFrame();
const displacements = [
  displacement('SITE-A', 0.002),
  displacement('SITE-B', 0.006),
];
const applicability = contactAuthority.rows.map((row) => app(row, frame));
const stiffnessEntries = [
  stiffness('SITE-A', applicability[0], 10_000),
  stiffness('SITE-B', applicability[1], 10_000),
];
const reactionTolerance = createPreproductionThermalLiftoffReactionToleranceAuthority({
  toleranceId: 'TL03-TOLERANCE',
  reactionToleranceN: 5,
  source: source('TL03-TOLERANCE', 'BENCHMARK_QUALIFIED'),
  benchmarkReference: benchmark('TL03-TOLERANCE-BENCHMARK'),
  qualification: 'QUALIFIED',
});
const prerequisiteAuthority = buildPreproductionThermalLiftoffPrerequisiteAuthority({
  contactAuthority,
  displacements,
  stiffnessEntries,
  reactionTolerance,
});
const prerequisiteBridge = buildPreproductionThermalLiftoffPrerequisiteBridge({
  authority: prerequisiteAuthority,
  displacements,
  stiffnessEntries,
  reactionTolerance,
});
const coldGravityExecution = coldExecution({ 'SITE-A': 100, 'SITE-B': 50 });
const request = executionRequest({
  coldGravityExecution,
  contactAuthority,
  contactBridge,
  prerequisiteAuthority,
  prerequisiteBridge,
});

assert.equal(contactBridge.status, 'READY_FOR_TL03_CONTACT_INTAKE');
assert.equal(prerequisiteAuthority.status, 'READY_FOR_TL03_PREREQUISITE_BRIDGE');
assert.equal(prerequisiteBridge.status, 'READY_FOR_TL03_INPUT_RECONCILIATION');
requireAuthorizedEmpiricalLoadExecutionV8(coldGravityExecution);

const coldHashBefore = semanticHash(coldGravityExecution);
const contactHashBefore = semanticHash(contactAuthority);
const prerequisiteHashBefore = semanticHash(prerequisiteAuthority);
const execution = calculatePreproductionThermalLiftoffLocalScreenExecution(request);
requirePreproductionThermalLiftoffLocalScreenExecution(execution);

assert.equal(execution.status, 'SCREEN_COMPLETE');
assert.equal(execution.stage, 'TL03_LOCAL_SCREEN_ONLY');
assert.equal(execution.finality, 'NON_FINAL_NO_REDISTRIBUTION');
assert.equal(execution.runtimeStatus, 'PREPRODUCTION_UNREGISTERED');
assert.equal(execution.rows.length, 2);
assert.equal(execution.summary.contactRetainedCandidateCount, 1);
assert.equal(execution.summary.liftoffCandidateCount, 1);
assert.equal(execution.policy.localScreenExecutionPerformed, true);
assert.equal(execution.policy.activeSetRedistributionPerformed, false);
assert.equal(execution.policy.recontactPerformed, false);
assert.equal(execution.policy.productionCalculationConsumptionEnabled, false);
assert.equal(execution.policy.finalHotReactionPublicationPermitted, false);
assert.equal(execution.policy.negativeTrialReserveClampingPermitted, false);

const retained = execution.rows.find((row) => row.supportSiteId === 'SITE-A');
const lifted = execution.rows.find((row) => row.supportSiteId === 'SITE-B');
assert.equal(retained.classification, 'CONTACT_RETAINED_CANDIDATE');
assert.equal(retained.localUpliftDemandN, 20);
assert.equal(retained.localTrialContactReserveN, 80);
assert.equal(lifted.classification, 'LIFTOFF_CANDIDATE');
assert.equal(lifted.localUpliftDemandN, 60);
assert.equal(lifted.localTrialContactReserveN, -10);
assert.ok(lifted.localTrialContactReserveN < 0, 'negative local reserve must remain unclamped');
for (const row of execution.rows) {
  for (const forbidden of [
    'verticalForceN',
    'reactionN',
    'finalReaction',
    'finalTotalReaction',
    'redistributedReaction',
    'finalHotGap',
    'activeSet',
    'iterationHistory',
  ]) {
    assert.equal(Object.hasOwn(row, forbidden), false, `${forbidden} must not be a TL-03 output`);
  }
}
assert.equal(semanticHash(coldGravityExecution), coldHashBefore, 'cold gravity execution mutated');
assert.equal(semanticHash(contactAuthority), contactHashBefore, 'contact authority mutated');
assert.equal(semanticHash(prerequisiteAuthority), prerequisiteHashBefore, 'prerequisite authority mutated');

const zero = calculatePreproductionThermalLiftoffLocalScreenCandidate({
  supportSiteId: 'ZERO',
  coldGravityReactionN: 133.5056827068759,
  usedUpwardRelativeDisplacementM: 0,
  effectiveVerticalStiffnessNPerM: 10_000,
  reactionToleranceN: 5,
  coldGapM: 0,
});
assert.equal(zero.localUpliftDemandN, 0);
assert.equal(zero.localTrialContactReserveN, 133.5056827068759);
assert.equal(zero.classification, 'CONTACT_RETAINED_CANDIDATE');

const forged = structuredClone(execution);
const forgedRow = forged.rows.find((row) => row.supportSiteId === 'SITE-B');
forgedRow.classification = 'CONTACT_RETAINED_CANDIDATE';
const forgedCandidateMaterial = {
  schema: 'engineering-preproduction-thermal-liftoff-local-screen-candidate/v1',
  supportSiteId: forgedRow.supportSiteId,
  classification: forgedRow.classification,
  coldGravityReactionN: forgedRow.coldGravityReactionN,
  usedUpwardRelativeDisplacementM: forgedRow.usedUpwardRelativeDisplacementM,
  qualifiedEffectiveVerticalStiffnessNPerM: forgedRow.qualifiedEffectiveVerticalStiffnessNPerM,
  localUpliftDemandN: forgedRow.localUpliftDemandN,
  localTrialContactReserveN: forgedRow.localTrialContactReserveN,
  coldGapM: forgedRow.coldGapM,
  screenKinematicOpeningM: forgedRow.screenKinematicOpeningM,
  finality: 'NON_FINAL_NO_REDISTRIBUTION',
};
forgedRow.candidateSemanticHash = semanticHash(forgedCandidateMaterial);
forgedRow.semanticHash = rehash(forgedRow);
forged.summary.contactRetainedCandidateCount += 1;
forged.summary.liftoffCandidateCount -= 1;
forged.semanticHash = rehash(forged);
assert.throws(
  () => requirePreproductionThermalLiftoffLocalScreenExecution(forged),
  (error) => error.code === 'PREPRODUCTION_TL03_LOCAL_SCREEN_CLASSIFICATION_MISMATCH',
);

const changedCold = coldExecution({ 'SITE-A': 101, 'SITE-B': 50 });
const stale = evaluatePreproductionThermalLiftoffLocalScreenCurrentness({
  execution,
  coldGravityExecution: changedCold,
  contactAuthority,
  contactBridge,
  prerequisiteAuthority,
  prerequisiteBridge,
});
assert.equal(stale.status, 'STALE_REBUILD_REQUIRED');
assert.ok(stale.differences.includes('coldGravityExecutionSemanticHash'));

const bridgeTamper = structuredClone(prerequisiteBridge);
bridgeTamper.usedDisplacements[0].usedUpwardRelativeDisplacementM += 0.001;
bridgeTamper.semanticHash = rehash(bridgeTamper);
assert.throws(
  () => calculatePreproductionThermalLiftoffLocalScreenExecution(executionRequest({
    coldGravityExecution,
    contactAuthority,
    contactBridge,
    prerequisiteAuthority,
    prerequisiteBridge: bridgeTamper,
  })),
  (error) => error.code === 'PREPRODUCTION_TL03_DISPLACEMENT_VALUE_MISMATCH',
);

const noToleranceAuthority = buildPreproductionThermalLiftoffPrerequisiteAuthority({
  contactAuthority,
  displacements,
  stiffnessEntries,
  reactionTolerance: null,
});
const noToleranceBridge = buildPreproductionThermalLiftoffPrerequisiteBridge({
  authority: noToleranceAuthority,
  displacements,
  stiffnessEntries,
  reactionTolerance: null,
});
assert.equal(noToleranceAuthority.status, 'BLOCKED');
assert.equal(noToleranceBridge.status, 'BLOCKED');
assert.throws(
  () => calculatePreproductionThermalLiftoffLocalScreenExecution(executionRequest({
    coldGravityExecution,
    contactAuthority,
    contactBridge,
    prerequisiteAuthority: noToleranceAuthority,
    prerequisiteBridge: noToleranceBridge,
  })),
  (error) => error.code === 'PREPRODUCTION_TL03_PREREQUISITE_AUTHORITY_NOT_READY',
);

const failedEquilibriumCold = coldExecution(
  { 'SITE-A': 100, 'SITE-B': 50 },
  { equilibriumPassed: false },
);
assert.throws(
  () => calculatePreproductionThermalLiftoffLocalScreenExecution(executionRequest({
    coldGravityExecution: failedEquilibriumCold,
    contactAuthority,
    contactBridge,
    prerequisiteAuthority,
    prerequisiteBridge,
  })),
  (error) => error.code === 'PREPRODUCTION_TL03_COLD_GRAVITY_LOAD_CASE_INVALID',
);

console.log(JSON.stringify({
  check: 'preproduction-thermal-liftoff-local-screen',
  status: 'PASS',
  executionSchema: execution.schema,
  executionStatus: execution.status,
  coldGravitySchema: coldGravityExecution.schema,
  coldGravityMethod: execution.coldGravityMethod,
  loadCaseId: execution.loadCaseId,
  supportScreenCount: execution.summary.supportScreenCount,
  contactRetainedCandidateCount: execution.summary.contactRetainedCandidateCount,
  liftoffCandidateCount: execution.summary.liftoffCandidateCount,
  negativeTrialReservePreserved: true,
  zeroDisplacementColdParity: true,
  classificationForgeryRejectedAfterRehash: true,
  coldExecutionStalenessDetected: true,
  bridgeValueTamperRejected: true,
  missingToleranceBlocksBeforeExecution: true,
  failedColdEquilibriumBlocksExecution: true,
  activeSetRedistributionPerformed: false,
  finalHotReactionPublished: false,
  productionCalculationConsumptionEnabled: false,
  qualificationFixtureOnly: true,
  sourceImmutable: true,
}, null, 2));

function executionRequest(overrides = {}) {
  return {
    schema: PREPRODUCTION_TL_LOCAL_SCREEN_EXECUTION_REQUEST_SCHEMA,
    executionId: 'TL03-PREPRODUCTION-FIXTURE',
    executedAt: '2026-08-08T11:30:00.000Z',
    coldGravityExecution: overrides.coldGravityExecution,
    contactAuthority: overrides.contactAuthority,
    contactBridge: overrides.contactBridge,
    prerequisiteAuthority: overrides.prerequisiteAuthority,
    prerequisiteBridge: overrides.prerequisiteBridge,
  };
}

function coldExecution(reactions, options = {}) {
  const supportResults = Object.entries(reactions).map(([supportSiteId, verticalForceN]) => ({
    supportSiteId,
    status: 'CALCULATED',
    verticalForceN,
  }));
  const distribution = {
    schema: 'support-load-distribution/v3',
    method: 'CHAINAGE_TRIBUTARY_SPAN_V2',
    datasetId: 'TL-PREREQ-FIXTURE',
    datasetVersion: 1,
    hashes: {},
    sourceAxisBasis: 'Z_UP',
    verticalForceConvention: 'positive reaction opposes source-axis gravity',
    status: 'CALCULATED',
    loadCases: [{
      loadCaseId: 'OPE-TL-QUALIFICATION',
      status: 'CALCULATED',
      supportResults,
      contributionLedger: [],
      excludedInputs: [],
      equilibrium: { passed: options.equilibriumPassed ?? true },
    }],
    freshness: {
      status: 'CURRENT',
      datasetId: 'TL-PREREQ-FIXTURE',
      datasetVersion: 1,
    },
  };
  const h = (label) => semanticHash({ label, fixture: true });
  const draft = {
    schema: AUTHORIZED_EMPIRICAL_LOAD_EXECUTION_V8_SCHEMA,
    executionId: 'COLD-V8-TL03-FIXTURE',
    executedAt: '2026-08-08T11:20:00.000Z',
    requestedMethod: 'CHAINAGE_TRIBUTARY_SPAN_V2',
    executedMethod: 'CHAINAGE_TRIBUTARY_SPAN_V2',
    projectId: 'TL03-PROJECT',
    datasetId: 'TL-PREREQ-FIXTURE',
    datasetVersion: 1,
    authorizedInputSemanticHash: h('authorizedInput'),
    baseOverlaySemanticHash: h('baseOverlay'),
    componentWeightSealHash: h('componentWeightSeal'),
    componentWeightCurrentnessHash: h('componentWeightCurrentness'),
    componentObservedAuthorityHash: h('componentObservedAuthority'),
    componentWeightOverlayHash: h('componentWeightOverlay'),
    operatingFluidDensitySealHash: h('operatingFluidDensitySeal'),
    operatingFluidDensityCurrentnessHash: h('operatingFluidDensityCurrentness'),
    operatingFluidObservedAuthorityHash: h('operatingFluidObservedAuthority'),
    operatingFluidDensityOverlayHash: h('operatingFluidDensityOverlay'),
    materialDensitySealHash: h('materialDensitySeal'),
    materialDensityCurrentnessHash: h('materialDensityCurrentness'),
    materialObservedAuthorityHash: h('materialObservedAuthority'),
    materialDensityOverlayHash: h('materialDensityOverlay'),
    pipeSectionSealHash: h('pipeSectionSeal'),
    pipeSectionCurrentnessHash: h('pipeSectionCurrentness'),
    pipeSectionObservedAuthorityHash: h('pipeSectionObservedAuthority'),
    pipeSectionOverlayHash: h('pipeSectionOverlay'),
    insulationDensitySealHash: h('insulationDensitySeal'),
    insulationDensityCurrentnessHash: h('insulationDensityCurrentness'),
    insulationObservedAuthorityHash: h('insulationObservedAuthority'),
    insulationDensityOverlayHash: h('insulationDensityOverlay'),
    hydroFluidDensitySealHash: h('hydroFluidDensitySeal'),
    hydroFluidDensityCurrentnessHash: h('hydroFluidDensityCurrentness'),
    hydroFluidObservedAuthorityHash: h('hydroFluidObservedAuthority'),
    hydroFluidDensityOverlayHash: h('hydroFluidDensityOverlay'),
    materialSelectionSealHash: h('materialSelectionSeal'),
    materialSelectionCurrentnessHash: h('materialSelectionCurrentness'),
    materialSelectionObservedAuthorityHash: h('materialSelectionObservedAuthority'),
    materialSelectionOverlayHash: h('materialSelectionOverlay'),
    supportCapabilitySealHash: h('supportCapabilitySeal'),
    supportCapabilityCurrentnessHash: h('supportCapabilityCurrentness'),
    supportCapabilityObservedAuthorityHash: h('supportCapabilityObservedAuthority'),
    supportCapabilityOverlayHash: h('supportCapabilityOverlay'),
    activatedEnrichmentFieldFamilies: [
      'COMPONENT_WEIGHTS',
      'OPERATING_FLUID_DENSITIES',
      'MATERIAL_DENSITIES',
      'PIPE_SECTIONS',
      'INSULATION_DENSITIES',
      'HYDRO_FLUID_DENSITIES',
      'MATERIAL_SELECTION',
      'SUPPORT_CAPABILITIES',
    ],
    effectiveComponentWeightsSemanticHash: h('effectiveComponentWeights'),
    effectiveOperatingFluidDensitiesSemanticHash: h('effectiveOperatingFluidDensities'),
    effectiveHydroFluidDensitiesSemanticHash: h('effectiveHydroFluidDensities'),
    effectiveMaterialDensitiesSemanticHash: h('effectiveMaterialDensities'),
    effectivePipeSectionPropertiesSemanticHash: h('effectivePipeSectionProperties'),
    effectiveInsulationDensitiesSemanticHash: h('effectiveInsulationDensities'),
    effectiveSupportTypeCapabilitiesSemanticHash: h('effectiveSupportTypeCapabilities'),
    ephemeralProfileSemanticHash: h('ephemeralProfile'),
    distributionSemanticHash: semanticHash(distribution),
    status: 'CALCULATED',
    summary: {
      loadCaseCount: 1,
      calculatedCaseCount: 1,
      blockedCaseCount: 0,
      contributionCount: 0,
      excludedInputCount: 0,
    },
    distribution,
    semanticHash: 'fnv1a64:0000000000000000',
  };
  draft.semanticHash = computeAuthorizedEmpiricalLoadExecutionV8SemanticHash(draft);
  return requireAuthorizedEmpiricalLoadExecutionV8(draft);
}

function contactAuthorityFixture() {
  const rows = [
    contactRow('SUP-A', 'SITE-A', 0),
    contactRow('SUP-B', 'SITE-B', 1000),
  ];
  const material = {
    schema: 'engineering-preproduction-support-contact-authority/v1',
    datasetId: 'TL-PREREQ-FIXTURE',
    sourceBindings: {
      analysisTopologySemanticHash: semanticHash({ a: 1 }),
      topologyGraphSemanticHash: semanticHash({ a: 2 }),
      supportAttachmentModelSemanticHash: semanticHash({ a: 3 }),
      restraintCapabilityModelSemanticHash: semanticHash({ a: 4 }),
      effectiveRestraintCapabilityModelSemanticHash: semanticHash({ a: 5 }),
      supportSiteModelSemanticHash: semanticHash({ a: 6 }),
      routePartitionModelSemanticHash: semanticHash({ a: 7 }),
      contactSemanticsSemanticHashes: rows.map((row) => row.contactSemanticsHash).sort(),
    },
    coordinateFrame: {
      basis: 'GLOBAL_XYZ_Z_UP',
      verticalContactDirection: 'GLOBAL_Z_PLUS',
      gapConvention: 'POSITIVE_OPEN_PIPE_TO_SUPPORT',
      gapUnit: 'M',
      routeChainageUnit: 'MM',
    },
    status: 'READY_FOR_PREPRODUCTION_CONTACT_AUTHORITY',
    rows,
    blockers: [],
    summary: {
      supportCount: 2,
      qualifiedAuthorityCount: 2,
      tl03ReadyCount: 2,
      tl03UnresolvedCount: 0,
      blockerCount: 0,
    },
    policy: {
      productionCalculationConsumptionEnabled: false,
      gravityMutationPermitted: false,
      supportAvailabilityScenarioExecutionEnabled: false,
      gapMechanicsExecuted: false,
      springMechanicsExecuted: false,
      frictionMechanicsExecuted: false,
      liftOffExecuted: false,
      activeSetRedistributionEnabled: false,
      finalHotReactionPublicationPermitted: false,
      tl03ContactAdapterPermitted: true,
      tl02StiffnessPromotionPermitted: false,
      reactionToleranceAuthorityCreated: false,
      supportMovementAuthorityCreated: false,
    },
  };
  return requirePreproductionSupportContactAuthority({
    ...material,
    semanticHash: semanticHash(material),
  });
}

function contactRow(supportKey, supportSiteId, routeChainageMm) {
  const contactSemanticsHash = semanticHash({ supportKey, contact: 'fixture' });
  const material = {
    supportKey,
    supportSiteId,
    routeId: 'ROUTE-1',
    routeChainageMm,
    restraintId: `R:${supportKey}`,
    attachmentId: `A:${supportKey}`,
    attachedComponentKey: 'PIPE-1',
    sourceRestraintCapabilityHash: semanticHash({ supportKey, source: true }),
    contactSemanticsHash,
    effectiveType: 'UNILATERAL_REST',
    effectiveDirection: 'VERTICAL',
    effectiveAxis: [0, 0, 1],
    verticalState: 'RESTRAINED',
    capability: 'UNILATERAL_REST',
    tensileReactionPermitted: false,
    initialState: 'CONTACTING',
    verticalContactDirection: 'GLOBAL_Z_PLUS',
    coldGapM: 0,
    gapConvention: 'POSITIVE_OPEN_PIPE_TO_SUPPORT',
    gapEvidenceHash: semanticHash({ gap: 0 }),
    restraintStiffnessEvidenceValue: 50_000,
    stiffnessEvidenceHash: semanticHash({ generic: 50_000 }),
    springRateEvidenceHash: semanticHash([]),
    frictionCoefficient: null,
    frictionEvidenceHash: semanticHash([]),
    authorityStatus: 'QUALIFIED_SOURCE_BOUND',
    tl03Status: 'READY_FOR_TL03_CONTACT_INTAKE',
    blockers: [],
    tl03Blockers: [],
    evidenceOnly: {
      tl02EffectiveStiffnessAuthority: 'UNQUALIFIED_APPLICABILITY_REQUIRED',
      springMechanics: 'NOT_PROVIDED',
      frictionMechanics: 'NOT_PROVIDED',
      supportMovementAuthority: 'NOT_PROVIDED_BY_THIS_CONTRACT',
      reactionToleranceAuthority: 'NOT_PROVIDED_BY_THIS_CONTRACT',
    },
  };
  return { ...material, semanticHash: semanticHash(material) };
}

function coordinateFrame() {
  const material = {
    basis: 'GLOBAL_XYZ_Z_UP',
    verticalUnitVector: { x: 0, y: 0, z: 1 },
  };
  return { ...material, semanticHash: semanticHash(material) };
}

function displacement(site, relativeZ) {
  return createPreproductionThermalLiftoffDisplacementAuthority({
    displacementId: `TL01:${site}`,
    loadCaseId: 'OPE-TL-QUALIFICATION',
    supportSiteId: site,
    coordinateFrame: frame,
    pipeDisplacementM: { x: 0, y: 0, z: relativeZ },
    supportDisplacementM: { x: 0, y: 0, z: 0 },
    provenance: 'SOURCE_BACKED_SUPPORT_DISPLACEMENT',
    source: source(`TL01:${site}`, 'GOVERNED_IMPORT'),
    mappingAuthority: null,
    horizontalComponentAuthority: null,
  });
}

function app(row, coordinate) {
  return createPreproductionThermalLiftoffApplicabilityBinding({
    applicabilityId: `TL02-APP:${row.supportSiteId}`,
    supportSiteId: row.supportSiteId,
    classId: 'TL-A',
    templateId: 'TL03-QUALIFICATION-TEMPLATE',
    templateRevision: 'REV-A',
    contactAuthoritySemanticHash: contactAuthority.semanticHash,
    contactRowSemanticHash: row.semanticHash,
    geometrySemanticHash: semanticHash({ site: row.supportSiteId, geometry: true }),
    supportCapabilitySemanticHash: row.sourceRestraintCapabilityHash,
    linePropertySemanticHash: semanticHash({ line: 'L-1' }),
    coordinateFrameSemanticHash: coordinate.semanticHash,
    source: source(`APP:${row.supportSiteId}`, 'APPROVED_ENGINEERING_DATA'),
  });
}

function stiffness(site, applicabilityBinding, value) {
  return createPreproductionThermalLiftoffStiffnessEvidence({
    entryId: `TL02-LOCAL:${site}`,
    supportSiteId: site,
    representation: 'LOCAL_EFFECTIVE_VERTICAL_STIFFNESS',
    data: { kind: 'SCALAR', effectiveVerticalStiffnessNPerM: value },
    units: 'N_PER_M',
    ordering: [site],
    source: source(`STIFF:${site}`, 'BENCHMARKED_TEMPLATE'),
    benchmarkReference: benchmark(`TL02-BENCH:${site}`),
    applicability: applicabilityBinding,
    qualification: 'QUALIFIED',
  });
}

function source(sourceId, sourceKind, sourceRevision = 'REV-A') {
  return {
    sourceId,
    sourceRevision,
    sourceSemanticHash: semanticHash({ sourceId, sourceKind, sourceRevision, fixture: true }),
    sourceKind,
  };
}

function benchmark(benchmarkId) {
  return {
    benchmarkId,
    benchmarkRevision: 'REV-A',
    benchmarkSemanticHash: semanticHash({ benchmarkId, revision: 'REV-A', fixture: true }),
  };
}

function rehash(value) {
  const { semanticHash: _actual, ...material } = value;
  return semanticHash(material);
}
