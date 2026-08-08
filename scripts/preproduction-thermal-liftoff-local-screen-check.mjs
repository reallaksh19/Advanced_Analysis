import { semanticHash } from '../src/core/shared-piping-model/canonical-json.js';
import {
  computeAuthorizedEmpiricalLoadExecutionV8SemanticHash,
  requireAuthorizedEmpiricalLoadExecutionV8,
} from '../src/workspace/engineering-loads/authorized-empirical-load-execution-v8.js';
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
} from '../src/workspace/engineering-loads/preproduction-thermal-liftoff-prerequisite-authority.js';
import {
  buildPreproductionThermalLiftoffLocalScreenIntake,
} from '../src/workspace/engineering-loads/preproduction-thermal-liftoff-local-screen-intake.js';
import {
  assessPreproductionThermalLiftoffLocalScreenCurrentness,
  calculatePreproductionThermalLiftoffLocalScreen,
  requirePreproductionThermalLiftoffLocalScreen,
} from '../src/workspace/engineering-loads/preproduction-thermal-liftoff-local-screen.js';

const H = (label) => semanticHash({ label });
const DATASET_ID = 'DATASET-TL03-QUALIFICATION';
const LOAD_CASE_ID = 'OPE';
const FRAME_MATERIAL = { basis: 'GLOBAL_XYZ_Z_UP', verticalUnitVector: { x: 0, y: 0, z: 1 } };
const FRAME = Object.freeze({ ...FRAME_MATERIAL, semanticHash: semanticHash(FRAME_MATERIAL) });

const contactAuthority = makeContactAuthority();
const contactSnapshot = JSON.stringify(contactAuthority);
const displacements = [
  displacement('SITE-A', 0.01),
  displacement('SITE-B', 0.03),
];
const stiffnessEntries = [
  stiffness('SITE-A', contactAuthority.rows.find((row) => row.supportSiteId === 'SITE-A'), 1000),
  stiffness('SITE-B', contactAuthority.rows.find((row) => row.supportSiteId === 'SITE-B'), 1000),
];
const reactionTolerance = createPreproductionThermalLiftoffReactionToleranceAuthority({
  toleranceId: 'TL03-TOL-Q',
  reactionToleranceN: 5,
  source: source('TL03-TOL-SOURCE', 'BENCHMARK_QUALIFIED'),
  benchmarkReference: benchmark('TL03-TOL-BENCH'),
  qualification: 'QUALIFIED',
});
const prerequisiteAuthority = buildPreproductionThermalLiftoffPrerequisiteAuthority({
  contactAuthority,
  displacements,
  stiffnessEntries,
  reactionTolerance,
});
assert(prerequisiteAuthority.status === 'READY_FOR_TL03_PREREQUISITE_BRIDGE', 'Prerequisite fixture must be READY.');
const prerequisiteSnapshot = JSON.stringify(prerequisiteAuthority);

const coldGravity = gravityFixture({
  datasetId: DATASET_ID,
  loadCaseId: LOAD_CASE_ID,
  reactions: { 'SITE-A': 100, 'SITE-B': 20, 'SITE-FIXED': 200 },
});
const coldSnapshot = JSON.stringify(coldGravity);
const intake = buildPreproductionThermalLiftoffLocalScreenIntake({
  coldGravityExecution: coldGravity,
  contactAuthority,
  prerequisiteAuthority,
});
assert(intake.status === 'READY_FOR_TL03_LOCAL_SCREEN', 'TL-03 intake must be READY.');
assert(intake.rows.length === 2, 'Exactly the two TL-03-ready unilateral sites must be bound.');
assert(JSON.stringify(intake.unscreenedColdSupportSiteIds) === JSON.stringify(['SITE-FIXED']), 'Known bilateral/fixed cold support must remain explicitly unscreened.');

const result = calculatePreproductionThermalLiftoffLocalScreen({
  executionId: 'TL03-QUALIFICATION-EXECUTION',
  executedAt: '2026-08-08T11:30:00.000Z',
  intake,
});
const siteA = result.supportScreens.find((row) => row.supportSiteId === 'SITE-A');
const siteB = result.supportScreens.find((row) => row.supportSiteId === 'SITE-B');
assert(siteA.classification === 'CONTACT_RETAINED_CANDIDATE', 'SITE-A should retain contact candidate status.');
assert(siteA.localUpliftDemandN === 10, 'SITE-A uplift demand should be 10 N.');
assert(siteA.localTrialContactReserveN === 90, 'SITE-A trial reserve should be 90 N.');
assert(siteB.classification === 'LIFTOFF_CANDIDATE', 'SITE-B should be a lift-off candidate.');
assert(siteB.localUpliftDemandN === 30, 'SITE-B uplift demand should be 30 N.');
assert(siteB.localTrialContactReserveN === -10, 'Negative trial reserve must remain negative evidence.');
assert(result.summary.negativeTrialReserveCount === 1, 'One negative trial reserve should be retained.');
assert(result.policy.negativeReactionClamped === false, 'Negative reaction clamping must remain prohibited.');
assert(result.policy.activeSetRedistributionPerformed === false, 'TL-04 redistribution must not execute.');
assert(result.policy.finalReactionCalculated === false, 'TL-03 must not calculate final hot reaction.');

const thresholdGravity = gravityFixture({
  datasetId: DATASET_ID,
  loadCaseId: LOAD_CASE_ID,
  reactions: { 'SITE-A': 100, 'SITE-B': 35, 'SITE-FIXED': 200 },
});
const thresholdIntake = buildPreproductionThermalLiftoffLocalScreenIntake({
  coldGravityExecution: thresholdGravity,
  contactAuthority,
  prerequisiteAuthority,
});
const thresholdResult = calculatePreproductionThermalLiftoffLocalScreen({
  executionId: 'TL03-THRESHOLD-EXECUTION',
  executedAt: '2026-08-08T11:31:00.000Z',
  intake: thresholdIntake,
});
const thresholdB = thresholdResult.supportScreens.find((row) => row.supportSiteId === 'SITE-B');
assert(thresholdB.localTrialContactReserveN === 5, 'Boundary reserve should equal the governed tolerance.');
assert(thresholdB.classification === 'LIFTOFF_CANDIDATE', 'Reserve equal to tolerance must remain a lift-off candidate.');

const stale = assessPreproductionThermalLiftoffLocalScreenCurrentness(result, thresholdIntake);
assert(stale.status === 'STALE_RESCREEN_REQUIRED', 'Changed cold reaction authority must require re-screening.');

const missingColdIntake = buildPreproductionThermalLiftoffLocalScreenIntake({
  coldGravityExecution: gravityFixture({
    datasetId: DATASET_ID,
    loadCaseId: LOAD_CASE_ID,
    reactions: { 'SITE-A': 100, 'SITE-FIXED': 200 },
  }),
  contactAuthority,
  prerequisiteAuthority,
});
assert(missingColdIntake.status === 'BLOCKED' && missingColdIntake.rows.length === 0, 'Missing exact cold reaction must fail closed without partial rows.');

const loadCaseMismatchIntake = buildPreproductionThermalLiftoffLocalScreenIntake({
  coldGravityExecution: gravityFixture({
    datasetId: DATASET_ID,
    loadCaseId: 'EMPTY',
    reactions: { 'SITE-A': 100, 'SITE-B': 20, 'SITE-FIXED': 200 },
  }),
  contactAuthority,
  prerequisiteAuthority,
});
assert(loadCaseMismatchIntake.status === 'BLOCKED' && loadCaseMismatchIntake.rows.length === 0, 'Displacement/gravity load-case mismatch must fail closed.');

const datasetMismatchIntake = buildPreproductionThermalLiftoffLocalScreenIntake({
  coldGravityExecution: gravityFixture({
    datasetId: 'OTHER-DATASET',
    loadCaseId: LOAD_CASE_ID,
    reactions: { 'SITE-A': 100, 'SITE-B': 20, 'SITE-FIXED': 200 },
  }),
  contactAuthority,
  prerequisiteAuthority,
});
assert(datasetMismatchIntake.status === 'BLOCKED', 'Cross-dataset authority composition must fail closed.');

let blockedExecutionRejected = false;
try {
  calculatePreproductionThermalLiftoffLocalScreen({
    executionId: 'BLOCKED-EXECUTION',
    executedAt: '2026-08-08T11:32:00.000Z',
    intake: missingColdIntake,
  });
} catch (error) {
  blockedExecutionRejected = error?.code === 'PREPRODUCTION_TL03_INTAKE_NOT_READY';
}
assert(blockedExecutionRejected, 'Blocked intake must not execute local-screen arithmetic.');

const tampered = structuredClone(result);
tampered.supportScreens[1].localTrialContactReserveN = 0;
const tamperedRowMaterial = { ...tampered.supportScreens[1] };
delete tamperedRowMaterial.semanticHash;
tampered.supportScreens[1].semanticHash = semanticHash(tamperedRowMaterial);
const tamperedMaterial = { ...tampered };
delete tamperedMaterial.semanticHash;
tampered.semanticHash = semanticHash(tamperedMaterial);
let arithmeticTamperRejected = false;
try {
  requirePreproductionThermalLiftoffLocalScreen(tampered);
} catch (error) {
  arithmeticTamperRejected = error?.code === 'PREPRODUCTION_TL03_ARITHMETIC_MISMATCH';
}
assert(arithmeticTamperRejected, 'Self-rehashed arithmetic tamper must fail semantic validation.');

assert(JSON.stringify(contactAuthority) === contactSnapshot, 'Contact authority must remain immutable.');
assert(JSON.stringify(prerequisiteAuthority) === prerequisiteSnapshot, 'Prerequisite authority must remain immutable.');
assert(JSON.stringify(coldGravity) === coldSnapshot, 'Cold gravity execution must remain immutable.');

console.log(JSON.stringify({
  check: 'preproduction-thermal-liftoff-local-screen',
  status: 'PASS',
  intakeSchema: intake.schema,
  screenSchema: result.schema,
  screenStatus: result.status,
  loadCaseId: result.loadCaseId,
  supportScreenCount: result.summary.supportScreenCount,
  contactRetainedCandidateCount: result.summary.contactRetainedCandidateCount,
  liftoffCandidateCount: result.summary.liftoffCandidateCount,
  negativeTrialReservePreserved: siteB.localTrialContactReserveN === -10,
  toleranceBoundaryClassifiedAsLiftoffCandidate: thresholdB.classification === 'LIFTOFF_CANDIDATE',
  knownNonTl03ColdSupportExplicitlyUnscreened: intake.unscreenedColdSupportSiteIds.includes('SITE-FIXED'),
  missingColdReactionFailsClosed: missingColdIntake.status === 'BLOCKED',
  loadCaseMismatchFailsClosed: loadCaseMismatchIntake.status === 'BLOCKED',
  datasetMismatchFailsClosed: datasetMismatchIntake.status === 'BLOCKED',
  blockedIntakeExecutionRejected: blockedExecutionRejected,
  arithmeticTamperFailsClosed: arithmeticTamperRejected,
  currentnessDetectsColdReactionChange: stale.status === 'STALE_RESCREEN_REQUIRED',
  gravityRecalculated: result.policy.inputGravityRecalculated,
  negativeReactionClamped: result.policy.negativeReactionClamped,
  activeSetRedistributionPerformed: result.policy.activeSetRedistributionPerformed,
  recontactPerformed: result.policy.recontactPerformed,
  finalReactionCalculated: result.policy.finalReactionCalculated,
  qualificationFixtureOnly: true,
  sourceImmutable: true,
}, null, 2));

function displacement(supportSiteId, z) {
  return createPreproductionThermalLiftoffDisplacementAuthority({
    displacementId: `DISP-${supportSiteId}`,
    loadCaseId: LOAD_CASE_ID,
    supportSiteId,
    coordinateFrame: FRAME,
    pipeDisplacementM: { x: 0, y: 0, z },
    supportDisplacementM: { x: 0, y: 0, z: 0 },
    provenance: 'SOURCE_BACKED_SUPPORT_DISPLACEMENT',
    source: source(`DISP-SOURCE-${supportSiteId}`, 'GOVERNED_IMPORT'),
    mappingAuthority: null,
    horizontalComponentAuthority: null,
  });
}

function stiffness(supportSiteId, contactRow, stiffnessNPerM) {
  const applicability = createPreproductionThermalLiftoffApplicabilityBinding({
    applicabilityId: `APP-${supportSiteId}`,
    supportSiteId,
    classId: 'TL-A',
    templateId: 'TL03-Q-TEMPLATE',
    templateRevision: '1',
    contactAuthoritySemanticHash: contactAuthority.semanticHash,
    contactRowSemanticHash: contactRow.semanticHash,
    geometrySemanticHash: H(`GEOMETRY-${supportSiteId}`),
    supportCapabilitySemanticHash: H(`CAPABILITY-${supportSiteId}`),
    linePropertySemanticHash: H(`LINE-${supportSiteId}`),
    coordinateFrameSemanticHash: FRAME.semanticHash,
    source: source(`APP-SOURCE-${supportSiteId}`, 'APPROVED_ENGINEERING_DATA'),
  });
  return createPreproductionThermalLiftoffStiffnessEvidence({
    entryId: `K-${supportSiteId}`,
    supportSiteId,
    representation: 'LOCAL_EFFECTIVE_VERTICAL_STIFFNESS',
    data: { effectiveVerticalStiffnessNPerM: stiffnessNPerM },
    units: 'N_PER_M',
    ordering: [supportSiteId],
    source: source(`K-SOURCE-${supportSiteId}`, 'BENCHMARKED_TEMPLATE'),
    benchmarkReference: benchmark(`K-BENCH-${supportSiteId}`),
    applicability,
    qualification: 'QUALIFIED',
  });
}

function makeContactAuthority() {
  const rows = [
    contactRow('SUP-A', 'SITE-A', 0, 'UNILATERAL_REST', 'READY_FOR_TL03_CONTACT_INTAKE'),
    contactRow('SUP-B', 'SITE-B', 1000, 'UNILATERAL_REST', 'READY_FOR_TL03_CONTACT_INTAKE'),
    contactRow('SUP-FIXED', 'SITE-FIXED', 2000, 'BILATERAL', 'UNRESOLVED_GATE'),
  ].sort((a, b) => a.supportKey.localeCompare(b.supportKey));
  const material = {
    schema: 'engineering-preproduction-support-contact-authority/v1',
    datasetId: DATASET_ID,
    sourceBindings: {
      analysisTopologySemanticHash: H('TOPOLOGY'),
      topologyGraphSemanticHash: H('GRAPH'),
      supportAttachmentModelSemanticHash: H('ATTACHMENTS'),
      restraintCapabilityModelSemanticHash: H('RESTRAINTS'),
      effectiveRestraintCapabilityModelSemanticHash: H('EFFECTIVE-RESTRAINTS'),
      supportSiteModelSemanticHash: H('SUPPORT-SITES'),
      routePartitionModelSemanticHash: H('ROUTES'),
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
      supportCount: rows.length,
      qualifiedAuthorityCount: rows.length,
      tl03ReadyCount: 2,
      tl03UnresolvedCount: 1,
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
  return Object.freeze({ ...material, semanticHash: semanticHash(material) });
}

function contactRow(supportKey, supportSiteId, routeChainageMm, capability, tl03Status) {
  const unilateral = capability === 'UNILATERAL_REST';
  const material = {
    supportKey,
    supportSiteId,
    routeId: 'ROUTE-Q',
    routeChainageMm,
    restraintId: `R-${supportSiteId}`,
    attachmentId: `A-${supportSiteId}`,
    attachedComponentKey: `C-${supportSiteId}`,
    sourceRestraintCapabilityHash: H(`SRC-RESTRAINT-${supportSiteId}`),
    contactSemanticsHash: H(`CONTACT-SEM-${supportSiteId}`),
    effectiveType: capability,
    effectiveDirection: 'VERTICAL',
    effectiveAxis: [0, 0, 1],
    verticalState: unilateral ? 'GAP' : 'RESTRAINED',
    capability,
    tensileReactionPermitted: !unilateral,
    initialState: 'CONTACTING',
    verticalContactDirection: 'GLOBAL_Z_PLUS',
    coldGapM: 0,
    gapConvention: 'POSITIVE_OPEN_PIPE_TO_SUPPORT',
    gapEvidenceHash: H(`GAP-${supportSiteId}`),
    restraintStiffnessEvidenceValue: 12345,
    stiffnessEvidenceHash: H(`UNQUALIFIED-K-${supportSiteId}`),
    springRateEvidenceHash: H(`SPRING-${supportSiteId}`),
    frictionCoefficient: null,
    frictionEvidenceHash: H(`FRICTION-${supportSiteId}`),
    authorityStatus: 'QUALIFIED_SOURCE_BOUND',
    tl03Status,
    blockers: [],
    tl03Blockers: tl03Status === 'READY_FOR_TL03_CONTACT_INTAKE'
      ? []
      : [{
        code: 'PREPRODUCTION_SUPPORT_CONTACT_TL03_CAPABILITY_UNSUPPORTED',
        severity: 'ERROR',
        scope: supportKey,
        message: 'Bilateral support is not a lift-off candidate in TL-03.',
        details: null,
      }],
    evidenceOnly: {
      tl02EffectiveStiffnessAuthority: 'UNQUALIFIED_APPLICABILITY_REQUIRED',
      springMechanics: 'NOT_PROVIDED',
      frictionMechanics: 'NOT_PROVIDED',
      supportMovementAuthority: 'NOT_PROVIDED_BY_THIS_CONTRACT',
      reactionToleranceAuthority: 'NOT_PROVIDED_BY_THIS_CONTRACT',
    },
  };
  return Object.freeze({ ...material, semanticHash: semanticHash(material) });
}

function gravityFixture({ datasetId, loadCaseId, reactions }) {
  const supportResults = Object.entries(reactions)
    .map(([supportSiteId, verticalForceN]) => ({
      supportSiteId,
      status: 'CALCULATED',
      verticalForceN,
    }))
    .sort((a, b) => a.supportSiteId.localeCompare(b.supportSiteId));
  const distribution = {
    schema: 'support-load-distribution/v3',
    method: 'CHAINAGE_TRIBUTARY_SPAN_V2',
    datasetId,
    sourceAxisBasis: 'Z_UP',
    verticalForceConvention: 'positive reaction opposes source-axis gravity',
    status: 'CALCULATED',
    loadCases: [{
      loadCaseId,
      status: 'CALCULATED',
      supportResults,
      contributionLedger: [],
      excludedInputs: [],
    }],
    freshness: { status: 'CURRENT', datasetId, datasetVersion: 1 },
  };
  const hashFields = [
    'authorizedInputSemanticHash','baseOverlaySemanticHash',
    'componentWeightSealHash','componentWeightCurrentnessHash','componentObservedAuthorityHash','componentWeightOverlayHash',
    'operatingFluidDensitySealHash','operatingFluidDensityCurrentnessHash','operatingFluidObservedAuthorityHash','operatingFluidDensityOverlayHash',
    'materialDensitySealHash','materialDensityCurrentnessHash','materialObservedAuthorityHash','materialDensityOverlayHash',
    'pipeSectionSealHash','pipeSectionCurrentnessHash','pipeSectionObservedAuthorityHash','pipeSectionOverlayHash',
    'insulationDensitySealHash','insulationDensityCurrentnessHash','insulationObservedAuthorityHash','insulationDensityOverlayHash',
    'hydroFluidDensitySealHash','hydroFluidDensityCurrentnessHash','hydroFluidObservedAuthorityHash','hydroFluidDensityOverlayHash',
    'materialSelectionSealHash','materialSelectionCurrentnessHash','materialSelectionObservedAuthorityHash','materialSelectionOverlayHash',
    'supportCapabilitySealHash','supportCapabilityCurrentnessHash','supportCapabilityObservedAuthorityHash','supportCapabilityOverlayHash',
    'effectiveComponentWeightsSemanticHash','effectiveOperatingFluidDensitiesSemanticHash','effectiveHydroFluidDensitiesSemanticHash',
    'effectiveMaterialDensitiesSemanticHash','effectivePipeSectionPropertiesSemanticHash','effectiveInsulationDensitiesSemanticHash',
    'effectiveSupportTypeCapabilitiesSemanticHash','ephemeralProfileSemanticHash',
  ];
  const draft = {
    schema: 'authorized-empirical-load-execution/v8',
    executionId: `GRAVITY-${datasetId}-${loadCaseId}`,
    executedAt: '2026-08-08T11:29:00.000Z',
    requestedMethod: 'CHAINAGE_TRIBUTARY_SPAN_V2',
    executedMethod: 'CHAINAGE_TRIBUTARY_SPAN_V2',
    projectId: 'PROJECT-TL03-Q',
    datasetId,
    datasetVersion: 1,
    activatedEnrichmentFieldFamilies: [
      'COMPONENT_WEIGHTS','OPERATING_FLUID_DENSITIES','MATERIAL_DENSITIES','PIPE_SECTIONS',
      'INSULATION_DENSITIES','HYDRO_FLUID_DENSITIES','MATERIAL_SELECTION','SUPPORT_CAPABILITIES',
    ],
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
  for (const field of hashFields) draft[field] = H(`${field}:${datasetId}:${loadCaseId}`);
  draft.semanticHash = computeAuthorizedEmpiricalLoadExecutionV8SemanticHash(draft);
  return requireAuthorizedEmpiricalLoadExecutionV8(draft);
}

function source(sourceId, sourceKind) {
  return {
    sourceId,
    sourceRevision: '1',
    sourceSemanticHash: H(sourceId),
    sourceKind,
  };
}
function benchmark(benchmarkId) {
  return {
    benchmarkId,
    benchmarkRevision: '1',
    benchmarkSemanticHash: H(benchmarkId),
  };
}
function assert(condition, message) {
  if (!condition) throw new Error(message);
}
