import { semanticHash } from '../src/core/shared-piping-model/canonical-json.js';
import {
  computeAuthorizedEmpiricalLoadExecutionV8SemanticHash,
  requireAuthorizedEmpiricalLoadExecutionV8,
} from '../src/workspace/engineering-loads/authorized-empirical-load-execution-v8.js';
import { createPreproductionThermalLiftoffDisplacementAuthority } from '../src/workspace/engineering-loads/preproduction-thermal-liftoff-displacement-authority.js';
import {
  createPreproductionThermalLiftoffApplicabilityBinding,
  createPreproductionThermalLiftoffReactionToleranceAuthority,
  createPreproductionThermalLiftoffStiffnessEvidence,
} from '../src/workspace/engineering-loads/preproduction-thermal-liftoff-mechanics-authority.js';
import { buildPreproductionThermalLiftoffPrerequisiteAuthority } from '../src/workspace/engineering-loads/preproduction-thermal-liftoff-prerequisite-authority.js';
import { buildPreproductionThermalLiftoffLocalScreenIntake } from '../src/workspace/engineering-loads/preproduction-thermal-liftoff-local-screen-intake.js';
import { calculatePreproductionThermalLiftoffLocalScreen } from '../src/workspace/engineering-loads/preproduction-thermal-liftoff-local-screen.js';
import {
  buildPreproductionThermalLiftoffActiveSetIntake,
  createPreproductionThermalLiftoffActiveSetNumericalAuthority,
} from '../src/workspace/engineering-loads/preproduction-thermal-liftoff-active-set-authority.js';
import {
  assessPreproductionThermalLiftoffActiveSetCurrentness,
  calculatePreproductionThermalLiftoffActiveSet,
  requirePreproductionThermalLiftoffActiveSet,
} from '../src/workspace/engineering-loads/preproduction-thermal-liftoff-active-set.js';

const H = (label) => semanticHash({ label });
const DATASET_ID = 'DATASET-TL04-QUALIFICATION';
const LOAD_CASE_ID = 'OPE';
const ROUTE_ID = 'ROUTE-TL04-Q';
const SITES = ['SITE-A', 'SITE-B', 'SITE-C', 'SITE-D'];
const CHAINAGE = { 'SITE-A': 0, 'SITE-B': 1000, 'SITE-C': 2000, 'SITE-D': 3000 };
const C = [
  [0.001, -0.0004, 0, 0],
  [-0.0004, 0.001, -0.0004, 0],
  [0, -0.0004, 0.001, -0.0004],
  [0, 0, -0.0004, 0.001],
];
const THERMAL_MOVEMENT = { 'SITE-A': -0.15, 'SITE-B': 0.1, 'SITE-C': 0.1, 'SITE-D': -0.1 };
const ZERO_MOVEMENT = Object.fromEntries(SITES.map((id) => [id, 0]));
const FRAME_MATERIAL = { basis: 'GLOBAL_XYZ_Z_UP', verticalUnitVector: { x: 0, y: 0, z: 1 } };
const FRAME = Object.freeze({ ...FRAME_MATERIAL, semanticHash: semanticHash(FRAME_MATERIAL) });
const contactAuthority = makeContactAuthority();
const contactSnapshot = JSON.stringify(contactAuthority);
const coldGravity = gravityFixture();
const coldSnapshot = JSON.stringify(coldGravity);
const numericalAuthority = numericalControls(10);

const fixture = buildFixture(THERMAL_MOVEMENT, numericalAuthority);
assert(fixture.intake.status === 'READY_FOR_TL04_ACTIVE_SET', 'TL-04 intake must be READY.');
assert(fixture.tl03.summary.liftoffCandidateCount === 2, 'TL-03 should identify SITE-B and SITE-C as non-final lift-off candidates.');
assert(fixture.intake.summary.tl03LiftoffCandidateCount === 2, 'TL-04 intake must retain both TL-03 candidate identities.');

const result = calculatePreproductionThermalLiftoffActiveSet({
  executionId: 'TL04-QUALIFICATION-EXECUTION',
  executedAt: '2026-08-08T12:10:00.000Z',
  intake: fixture.intake,
});
assert(result.status === 'CONVERGED_PREPRODUCTION_SCREEN', 'TL-04 fixture must converge.');
assert(result.summary.iterationCount === 3, 'Fixture should converge in three deterministic active-set iterations.');
assert(result.summary.releaseEventCount === 2, 'First active-set solve should release SITE-B and SITE-C.');
assert(result.summary.recontactEventCount === 1, 'Redistribution should re-contact one support.');
assert(JSON.stringify(result.finalActiveSupportSiteIds) === JSON.stringify(['SITE-A', 'SITE-B', 'SITE-D']), 'SITE-B must re-contact; SITE-C must remain lifted.');
assert(JSON.stringify(result.finalLiftedSupportSiteIds) === JSON.stringify(['SITE-C']), 'Only SITE-C should remain lifted.');
const siteB = result.supportResults.find((row) => row.supportSiteId === 'SITE-B');
const siteC = result.supportResults.find((row) => row.supportSiteId === 'SITE-C');
assert(siteB.tl03Classification === 'LIFTOFF_CANDIDATE' && siteB.state === 'ACTIVE', 'TL-03 candidate SITE-B must demonstrate non-final classification via TL-04 re-contact.');
assert(siteC.state === 'LIFTED' && siteC.solvedTotalReactionN === 0, 'Final lifted support must carry zero solved contact reaction by active-set constraint, not clamping.');
assert(siteC.solvedHotGapM > 0.014 && siteC.solvedHotGapM < 0.015, 'SITE-C must retain a positive solved separation gap.');
assert(near(siteB.redistributedGravityReactionN, 150, 1e-10), 'Final active-set gravity re-bracketing at SITE-B must be 150 N.');
assert(near(result.supportResults.find((row) => row.supportSiteId === 'SITE-D').redistributedGravityReactionN, 100, 1e-10), 'Final re-bracketed SITE-D gravity reaction must be 100 N.');
assert(Math.abs(result.equilibrium.forceResidualN) <= fixture.intake.numericalControls.forceToleranceN, 'Total force equilibrium must pass.');
assert(Math.abs(result.equilibrium.momentResidualNmm) <= fixture.intake.numericalControls.momentToleranceNmm, 'Total moment equilibrium must pass.');
assert(result.complementarity.complementarityResidualNM <= fixture.intake.numericalControls.complementarityToleranceNM, 'Complementarity residual must pass.');
assert(result.policy.negativeReactionClamped === false, 'Negative reaction clamping remains prohibited.');
assert(result.policy.gravitySourceRecalculated === false, 'Cold gravity source calculation must not be rerun.');
assert(result.policy.gravityContributionRebracketingPerformed === true, 'Authorized cold contribution ledger must be re-bracketed after release.');
assert(result.policy.stiffnessSubmatrixReductionPerformed === false, 'Generic stiffness submatrix reduction remains prohibited.');
assert(result.policy.productionFinalReactionCalculated === false, 'TL-04 result is not a production final reaction.');
assert(result.policy.finalHotReactionPublicationPermitted === false, 'TL-04 result cannot publish final hot reactions to production.');

const zero = buildFixture(ZERO_MOVEMENT, numericalAuthority);
const zeroResult = calculatePreproductionThermalLiftoffActiveSet({
  executionId: 'TL04-ZERO-MOVEMENT',
  executedAt: '2026-08-08T12:11:00.000Z',
  intake: zero.intake,
});
assert(zeroResult.status === 'CONVERGED_PREPRODUCTION_SCREEN', 'Zero-movement fixture must converge.');
assert(zeroResult.summary.iterationCount === 1, 'Zero movement must require no active-set changes.');
for (const row of zeroResult.supportResults) {
  assert(near(row.solvedTotalReactionN, row.coldGravityReactionN, 1e-10), 'Zero movement must reproduce exact cold gravity reactions.');
  assert(near(row.solvedHotGapM, 0, 1e-12), 'Zero movement active contacts must retain zero gap.');
}

const stiffnessMatrixEvidence = stiffnessMatrixInsteadOfFlexibility(fixture.flexibilityEvidence);
const stiffnessIntake = buildPreproductionThermalLiftoffActiveSetIntake({
  coldGravityExecution: coldGravity,
  contactAuthority,
  prerequisiteAuthority: fixture.prerequisite,
  localScreen: fixture.tl03,
  flexibilityEvidence: stiffnessMatrixEvidence,
  numericalAuthority,
});
assert(stiffnessIntake.status === 'BLOCKED', 'Generic reduced stiffness evidence must not be used by TL-04 V1 through naive submatrix deletion.');
assert(stiffnessIntake.blockers.some((row) => row.code === 'PREPRODUCTION_TL04_FLEXIBILITY_AUTHORITY_REQUIRED'), 'Stiffness-only active-set attempt must report explicit flexibility authority blocker.');

const staleFlexibility = makeFlexibilityEvidence(fixture.localStiffnessEntries[0].applicability, C.map((row) => [...row]), 'REV-STALE');
const staleFlexibilityIntake = buildPreproductionThermalLiftoffActiveSetIntake({
  coldGravityExecution: coldGravity,
  contactAuthority,
  prerequisiteAuthority: fixture.prerequisite,
  localScreen: fixture.tl03,
  flexibilityEvidence: staleFlexibility,
  numericalAuthority,
});
assert(staleFlexibilityIntake.status === 'BLOCKED', 'Flexibility evidence not retained by exact prerequisite authority must fail closed.');
assert(staleFlexibilityIntake.blockers.some((row) => row.code === 'PREPRODUCTION_TL04_FLEXIBILITY_NOT_RETAINED_BY_PREREQUISITE_AUTHORITY'), 'Stale flexibility evidence must report retained-authority mismatch.');

let parityRejected = false;
try {
  const badGravity = gravityFixture({ firstForceN: 90 });
  const badFixture = buildFixture(THERMAL_MOVEMENT, numericalAuthority, badGravity);
  calculatePreproductionThermalLiftoffActiveSet({
    executionId: 'TL04-BAD-COLD-PARITY',
    executedAt: '2026-08-08T12:12:00.000Z',
    intake: badFixture.intake,
  });
} catch (error) {
  parityRejected = error?.code === 'PREPRODUCTION_TL04_COLD_GRAVITY_PARITY_MISMATCH';
}
assert(parityRejected, 'Contribution ledger that cannot reproduce authorized all-contact cold reactions must fail before active-set execution.');

const oneIteration = buildFixture(THERMAL_MOVEMENT, numericalControls(1));
const nonconvergent = calculatePreproductionThermalLiftoffActiveSet({
  executionId: 'TL04-MAX-ITERATION-BLOCK',
  executedAt: '2026-08-08T12:13:00.000Z',
  intake: oneIteration.intake,
});
assert(nonconvergent.status === 'BLOCKED_NONCONVERGENT', 'Governed max-iteration exhaustion must return blocked nonconvergence.');
assert(nonconvergent.supportResults.length === 0, 'Nonconvergent result must not publish a partial final reaction set.');

const staleFixture = buildFixture({ ...THERMAL_MOVEMENT, 'SITE-C': 0.11 }, numericalAuthority);
const currentness = assessPreproductionThermalLiftoffActiveSetCurrentness(result, staleFixture.intake);
assert(currentness.status === 'STALE_RERUN_REQUIRED', 'Changed displacement/prerequisite/TL-03 authority must require TL-04 rerun.');

const tampered = structuredClone(result);
tampered.supportResults[1].thermalIncrementN += 1;
const rowMaterial = { ...tampered.supportResults[1] };
delete rowMaterial.semanticHash;
tampered.supportResults[1].semanticHash = semanticHash(rowMaterial);
const material = { ...tampered };
delete material.semanticHash;
tampered.semanticHash = semanticHash(material);
let arithmeticTamperRejected = false;
try {
  requirePreproductionThermalLiftoffActiveSet(tampered);
} catch (error) {
  arithmeticTamperRejected = error?.code === 'PREPRODUCTION_TL04_SUPPORT_REACTION_ARITHMETIC_MISMATCH';
}
assert(arithmeticTamperRejected, 'Self-rehashed final reaction arithmetic tamper must fail closed.');

assert(JSON.stringify(contactAuthority) === contactSnapshot, 'Contact authority must remain immutable.');
assert(JSON.stringify(coldGravity) === coldSnapshot, 'Cold gravity execution must remain immutable.');

console.log(JSON.stringify({
  check: 'preproduction-thermal-liftoff-active-set',
  status: 'PASS',
  intakeSchema: fixture.intake.schema,
  resultSchema: result.schema,
  applicabilityClass: result.applicabilityClass,
  loadCaseId: result.loadCaseId,
  tl03LiftoffCandidateCount: fixture.tl03.summary.liftoffCandidateCount,
  iterationCount: result.summary.iterationCount,
  releaseEventCount: result.summary.releaseEventCount,
  recontactEventCount: result.summary.recontactEventCount,
  finalActiveSupportSiteIds: result.finalActiveSupportSiteIds,
  finalLiftedSupportSiteIds: result.finalLiftedSupportSiteIds,
  tl03CandidateRecontacted: siteB.tl03Classification === 'LIFTOFF_CANDIDATE' && siteB.state === 'ACTIVE',
  liftedReactionZeroByActiveSetConstraint: siteC.solvedTotalReactionN === 0,
  positiveLiftedGapM: siteC.solvedHotGapM,
  zeroMovementColdGravityParity: zeroResult.supportResults.every((row) => near(row.solvedTotalReactionN, row.coldGravityReactionN, 1e-10)),
  stiffnessSubmatrixReductionPermitted: fixture.intake.policy.stiffnessSubmatrixReductionPermitted,
  staleFlexibilityFailsClosed: staleFlexibilityIntake.status === 'BLOCKED',
  coldLedgerParityMismatchFailsClosed: parityRejected,
  nonconvergencePublishesNoFinalReactionSet: nonconvergent.supportResults.length === 0,
  currentnessDetectsAuthorityChange: currentness.status === 'STALE_RERUN_REQUIRED',
  arithmeticTamperFailsClosed: arithmeticTamperRejected,
  gravitySourceRecalculated: result.policy.gravitySourceRecalculated,
  gravityContributionRebracketingPerformed: result.policy.gravityContributionRebracketingPerformed,
  negativeReactionClamped: result.policy.negativeReactionClamped,
  productionFinalReactionCalculated: result.policy.productionFinalReactionCalculated,
  finalHotReactionPublicationPermitted: result.policy.finalHotReactionPublicationPermitted,
  qualificationFixtureOnly: true,
  sourceImmutable: true,
}, null, 2));

function buildFixture(movements, numerical, gravity = coldGravity) {
  const displacements = SITES.map((id) => displacement(id, movements[id]));
  const localStiffnessEntries = SITES.map((id) => localStiffness(id, contactAuthority.rows.find((row) => row.supportSiteId === id)));
  const flexibilityEvidence = makeFlexibilityEvidence(localStiffnessEntries[0].applicability, C);
  const reactionTolerance = createPreproductionThermalLiftoffReactionToleranceAuthority({
    toleranceId: 'TL04-REACTION-TOL',
    reactionToleranceN: 1e-6,
    source: source('TL04-REACTION-TOL-SOURCE', 'BENCHMARK_QUALIFIED'),
    benchmarkReference: benchmark('TL04-REACTION-TOL-BENCH'),
    qualification: 'QUALIFIED',
  });
  const prerequisite = buildPreproductionThermalLiftoffPrerequisiteAuthority({
    contactAuthority,
    displacements,
    stiffnessEntries: [...localStiffnessEntries, flexibilityEvidence],
    reactionTolerance,
  });
  assert(prerequisite.status === 'READY_FOR_TL03_PREREQUISITE_BRIDGE', 'Fixture prerequisite must be READY.');
  assert(prerequisite.retainedInfluenceEvidenceSemanticHashes.includes(flexibilityEvidence.semanticHash), 'Fixture prerequisite must retain exact flexibility evidence.');
  const tl03Intake = buildPreproductionThermalLiftoffLocalScreenIntake({
    coldGravityExecution: gravity,
    contactAuthority,
    prerequisiteAuthority: prerequisite,
  });
  assert(tl03Intake.status === 'READY_FOR_TL03_LOCAL_SCREEN', 'Fixture TL-03 intake must be READY.');
  const tl03 = calculatePreproductionThermalLiftoffLocalScreen({
    executionId: `TL03-FOR-TL04-${H(movements)}`,
    executedAt: '2026-08-08T12:09:00.000Z',
    intake: tl03Intake,
  });
  const intake = buildPreproductionThermalLiftoffActiveSetIntake({
    coldGravityExecution: gravity,
    contactAuthority,
    prerequisiteAuthority: prerequisite,
    localScreen: tl03,
    flexibilityEvidence,
    numericalAuthority: numerical,
  });
  return { displacements, localStiffnessEntries, flexibilityEvidence, reactionTolerance, prerequisite, tl03Intake, tl03, intake };
}

function numericalControls(maxIterations) {
  return createPreproductionThermalLiftoffActiveSetNumericalAuthority({
    authorityId: `TL04-NUMERICAL-${maxIterations}`,
    gapToleranceM: 1e-9,
    complementarityToleranceNM: 1e-7,
    gravityParityToleranceN: 1e-9,
    forceToleranceN: 1e-8,
    momentToleranceNmm: 1e-5,
    matrixPivotToleranceMPerN: 1e-12,
    matrixSymmetryToleranceMPerN: 1e-12,
    maxIterations,
    source: source(`TL04-NUMERICAL-SOURCE-${maxIterations}`, 'BENCHMARK_QUALIFIED'),
    benchmarkReference: benchmark(`TL04-NUMERICAL-BENCH-${maxIterations}`),
    qualification: 'QUALIFIED',
  });
}

function displacement(supportSiteId, z) {
  return createPreproductionThermalLiftoffDisplacementAuthority({
    displacementId: `DISP-${supportSiteId}-${z}`,
    loadCaseId: LOAD_CASE_ID,
    supportSiteId,
    coordinateFrame: FRAME,
    pipeDisplacementM: { x: 0, y: 0, z },
    supportDisplacementM: { x: 0, y: 0, z: 0 },
    provenance: 'SOURCE_BACKED_SUPPORT_DISPLACEMENT',
    source: source(`DISP-SOURCE-${supportSiteId}-${z}`, 'GOVERNED_IMPORT'),
    mappingAuthority: null,
    horizontalComponentAuthority: null,
  });
}

function localStiffness(supportSiteId, contactRow) {
  const applicability = createPreproductionThermalLiftoffApplicabilityBinding({
    applicabilityId: `APP-${supportSiteId}`,
    supportSiteId,
    classId: 'TL-B',
    templateId: 'TL04-FOUR-REST-TEMPLATE',
    templateRevision: '1',
    contactAuthoritySemanticHash: contactAuthority.semanticHash,
    contactRowSemanticHash: contactRow.semanticHash,
    geometrySemanticHash: H('TL04-GEOMETRY'),
    supportCapabilitySemanticHash: H(`TL04-CAPABILITY-${supportSiteId}`),
    linePropertySemanticHash: H('TL04-LINE-PROPERTIES'),
    coordinateFrameSemanticHash: FRAME.semanticHash,
    source: source(`APP-SOURCE-${supportSiteId}`, 'APPROVED_ENGINEERING_DATA'),
  });
  return createPreproductionThermalLiftoffStiffnessEvidence({
    entryId: `LOCAL-K-${supportSiteId}`,
    supportSiteId,
    representation: 'LOCAL_EFFECTIVE_VERTICAL_STIFFNESS',
    data: { effectiveVerticalStiffnessNPerM: 1000 },
    units: 'N_PER_M',
    ordering: [supportSiteId],
    source: source(`LOCAL-K-SOURCE-${supportSiteId}`, 'BENCHMARKED_TEMPLATE'),
    benchmarkReference: benchmark(`LOCAL-K-BENCH-${supportSiteId}`),
    applicability,
    qualification: 'QUALIFIED',
  });
}

function makeFlexibilityEvidence(applicability, values, revision = '1') {
  return createPreproductionThermalLiftoffStiffnessEvidence({
    entryId: `TL04-FLEX-${revision}`,
    supportSiteId: 'SITE-A',
    representation: 'REDUCED_VERTICAL_FLEXIBILITY_MATRIX_EVIDENCE',
    data: { kind: 'MATRIX', values: values.map((row) => [...row]) },
    units: 'M_PER_N',
    ordering: [...SITES],
    source: {
      sourceId: 'TL04-FLEX-SOURCE',
      sourceRevision: revision,
      sourceSemanticHash: H(`TL04-FLEX-SOURCE-${revision}`),
      sourceKind: 'BENCHMARKED_TEMPLATE',
    },
    benchmarkReference: benchmark('TL04-FLEX-BENCH'),
    applicability,
    qualification: 'QUALIFIED',
  });
}

function stiffnessMatrixInsteadOfFlexibility(flexibility) {
  return createPreproductionThermalLiftoffStiffnessEvidence({
    entryId: 'TL04-STIFFNESS-MATRIX-NOT-ACTIVESET-AUTHORITY',
    supportSiteId: 'SITE-A',
    representation: 'REDUCED_VERTICAL_STIFFNESS_MATRIX_EVIDENCE',
    data: { kind: 'MATRIX', values: [
      [1000, 0, 0, 0],
      [0, 1000, 0, 0],
      [0, 0, 1000, 0],
      [0, 0, 0, 1000],
    ] },
    units: 'N_PER_M',
    ordering: [...SITES],
    source: source('TL04-STIFFNESS-MATRIX-SOURCE', 'BENCHMARKED_TEMPLATE'),
    benchmarkReference: benchmark('TL04-STIFFNESS-MATRIX-BENCH'),
    applicability: flexibility.applicability,
    qualification: 'QUALIFIED',
  });
}

function makeContactAuthority() {
  const rows = SITES.map((id) => contactRow(`SUP-${id}`, id, CHAINAGE[id]));
  const material = {
    schema: 'engineering-preproduction-support-contact-authority/v1',
    datasetId: DATASET_ID,
    sourceBindings: {
      analysisTopologySemanticHash: H('TL04-TOPOLOGY'),
      topologyGraphSemanticHash: H('TL04-GRAPH'),
      supportAttachmentModelSemanticHash: H('TL04-ATTACHMENTS'),
      restraintCapabilityModelSemanticHash: H('TL04-RESTRAINTS'),
      effectiveRestraintCapabilityModelSemanticHash: H('TL04-EFFECTIVE-RESTRAINTS'),
      supportSiteModelSemanticHash: H('TL04-SUPPORT-SITES'),
      routePartitionModelSemanticHash: H('TL04-ROUTES'),
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
      tl03ReadyCount: rows.length,
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
  return Object.freeze({ ...material, semanticHash: semanticHash(material) });
}

function contactRow(supportKey, supportSiteId, routeChainageMm) {
  const material = {
    supportKey,
    supportSiteId,
    routeId: ROUTE_ID,
    routeChainageMm,
    restraintId: `R-${supportSiteId}`,
    attachmentId: `A-${supportSiteId}`,
    attachedComponentKey: `C-${supportSiteId}`,
    sourceRestraintCapabilityHash: H(`SRC-RESTRAINT-${supportSiteId}`),
    contactSemanticsHash: H(`CONTACT-SEM-${supportSiteId}`),
    effectiveType: 'UNILATERAL_REST',
    effectiveDirection: 'VERTICAL',
    effectiveAxis: [0, 0, 1],
    verticalState: 'GAP',
    capability: 'UNILATERAL_REST',
    tensileReactionPermitted: false,
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
  return Object.freeze({ ...material, semanticHash: semanticHash(material) });
}

function gravityFixture({ firstForceN = 100 } = {}) {
  const contributions = [
    contribution('P-1', 500, firstForceN),
    contribution('P-2', 1500, 100),
    contribution('P-3', 2500, 100),
  ];
  const supportResults = [
    supportResult('SITE-A', 50),
    supportResult('SITE-B', 100),
    supportResult('SITE-C', 100),
    supportResult('SITE-D', 50),
  ];
  const distribution = {
    schema: 'support-load-distribution/v3',
    method: 'CHAINAGE_TRIBUTARY_SPAN_V2',
    datasetId: DATASET_ID,
    sourceAxisBasis: 'Z_UP',
    verticalForceConvention: 'positive reaction opposes source-axis gravity',
    status: 'CALCULATED',
    loadCases: [{
      loadCaseId: LOAD_CASE_ID,
      status: 'CALCULATED',
      supportResults,
      contributionLedger: contributions,
      excludedInputs: [],
    }],
    freshness: { status: 'CURRENT', datasetId: DATASET_ID, datasetVersion: 1 },
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
    executionId: `GRAVITY-TL04-${firstForceN}`,
    executedAt: '2026-08-08T12:08:00.000Z',
    requestedMethod: 'CHAINAGE_TRIBUTARY_SPAN_V2',
    executedMethod: 'CHAINAGE_TRIBUTARY_SPAN_V2',
    projectId: 'PROJECT-TL04-Q',
    datasetId: DATASET_ID,
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
      contributionCount: contributions.length,
      excludedInputCount: 0,
    },
    distribution,
    semanticHash: 'fnv1a64:0000000000000000',
  };
  for (const field of hashFields) draft[field] = H(`${field}:TL04:${firstForceN}`);
  draft.semanticHash = computeAuthorizedEmpiricalLoadExecutionV8SemanticHash(draft);
  return requireAuthorizedEmpiricalLoadExecutionV8(draft);
}
function contribution(contributionId, chainageMm, verticalForceN) {
  return { contributionId, routeId: ROUTE_ID, verticalForceN, chainageMm, source: { qualificationFixtureOnly: true } };
}
function supportResult(supportSiteId, verticalForceN) { return { supportSiteId, status: 'CALCULATED', verticalForceN }; }
function source(sourceId, sourceKind) { return { sourceId, sourceRevision: '1', sourceSemanticHash: H(sourceId), sourceKind }; }
function benchmark(benchmarkId) { return { benchmarkId, benchmarkRevision: '1', benchmarkSemanticHash: H(benchmarkId) }; }
function near(actual, expected, tolerance) { return Math.abs(actual - expected) <= tolerance; }
function assert(condition, message) { if (!condition) throw new Error(message); }
