import assert from 'node:assert/strict';
import { semanticHash } from '../src/core/shared-piping-model/canonical-json.js';
import { requirePreproductionThermalLiftoffActiveSetIntake } from '../src/workspace/engineering-loads/preproduction-thermal-liftoff-active-set-authority.js';
import { calculatePreproductionThermalLiftoffActiveSet } from '../src/workspace/engineering-loads/preproduction-thermal-liftoff-active-set.js';
import {
  buildPreproductionThermalLiftoffBenchmarkProgramme,
  createPreproductionThermalLiftoffBenchmarkNumericalAuthority,
  qualifyPreproductionThermalLiftoffBenchmark,
} from '../src/workspace/engineering-loads/preproduction-thermal-liftoff-benchmark-authority.js';
import {
  assessPreproductionThermalLiftoffGovernedCurrentness,
  calculatePreproductionThermalLiftoffGovernedExecution,
  createPreproductionThermalLiftoffGovernedRequest,
} from '../src/workspace/engineering-loads/preproduction-thermal-liftoff-governed-execution.js';
import { presentPreproductionThermalLiftoffGovernedExecution } from '../src/workspace/engineering-loads/preproduction-thermal-liftoff-presenter.js';
import { solveExhaustiveThermalLiftoffReference } from './preproduction-thermal-liftoff-tl05-exhaustive-oracle.mjs';

const numericalAuthority = createPreproductionThermalLiftoffBenchmarkNumericalAuthority({
  authorityId: 'TL06-TL05-ACCURACY',
  reactionAbsoluteToleranceN: 1e-8,
  reactionRelativeToleranceFraction: 1e-10,
  gapAbsoluteToleranceM: 1e-10,
  gapRelativeToleranceFraction: 1e-9,
  forceResidualToleranceN: 1e-8,
  momentResidualToleranceNmm: 1e-5,
  complementarityToleranceNM: 1e-7,
  source: source('TL06-TL05-ACCURACY', 'BENCHMARK_QUALIFIED'),
  benchmarkReference: benchmark('TL06-TL05-ACCURACY-BENCH'),
  qualification: 'QUALIFIED',
});
const zero = scenario('ZERO_MOVEMENT_COLD_PARITY', [0, 0, 0, 0], 'TL06-ZERO');
const nonlinear = scenario('NONLINEAR_CONTACT_CHANGE_RECONTACT', [-0.15, 0.1, 0.1, -0.1], 'TL06-NONLINEAR');
const programme = buildPreproductionThermalLiftoffBenchmarkProgramme({
  programmeId: 'TL06-QUALIFIED-TL05-PROGRAMME',
  correlations: [zero.correlation, nonlinear.correlation],
});
assert.equal(programme.status, 'QUALIFIED_TL05_BENCHMARK_PROGRAMME');
const benchmarkEvidence = [zero, nonlinear].map((item) => ({
  correlation: item.correlation,
  candidate: item.candidate,
  reference: item.reference,
  numericalAuthority,
}));
const request = createPreproductionThermalLiftoffGovernedRequest({
  requestId: 'TL06-EXPLICIT-OPT-IN-QA',
  requestedAt: '2026-08-08T13:30:00.000Z',
  integrationMode: 'PREPRODUCTION_EXPLICIT_OPT_IN',
  expectedApplicabilityClass: 'TL-B_REDUCED_FLEXIBILITY_SINGLE_ROUTE_V1',
  optInAuthority: source('TL06-OWNER-OPT-IN-QA', 'OWNER_APPROVED_PREPRODUCTION'),
  qualification: 'QUALIFIED',
});
assert.equal(request.qualification, 'QUALIFIED');

const receipt = calculatePreproductionThermalLiftoffGovernedExecution({
  executionId: 'TL06-GOVERNED-QA-001',
  executedAt: '2026-08-08T13:31:00.000Z',
  request,
  activeSetIntake: nonlinear.intake,
  activeSetResult: nonlinear.candidate,
  benchmarkProgramme: programme,
  benchmarkEvidence,
});
assert.equal(receipt.status, 'CALCULATED_PREPRODUCTION_GOVERNED_SCREEN');
assert.equal(receipt.finality, 'PREPRODUCTION_GOVERNED_SCREEN_RECEIPT_ONLY');
assert.equal(receipt.supportResults.length, 4);
assert.deepEqual(receipt.supportResults.filter((row) => row.screenedContactState === 'LIFTED').map((row) => row.supportSiteId), ['SITE-C']);
assert.equal(receipt.policy.explicitOptInRequired, true);
assert.equal(receipt.policy.productionCalculationConsumptionEnabled, false);
assert.equal(receipt.policy.productionMethodRegistrationPermitted, false);
assert.equal(receipt.policy.defaultUiExposurePermitted, false);
assert.equal(receipt.policy.sealExportEligibilityPermitted, false);
assert.equal(receipt.policy.productionCutoverPermitted, false);
assert.equal(receipt.policy.productionFinalReactionCalculated, false);
assert.equal(receipt.policy.finalHotReactionPublicationPermitted, false);
assert.equal(Object.hasOwn(receipt, 'finalHotReaction'), false);
assert.equal(JSON.stringify(receipt).includes('finalHotReactionN'), false);

const currentness = assessPreproductionThermalLiftoffGovernedCurrentness({
  receipt,
  request,
  activeSetIntake: nonlinear.intake,
  activeSetResult: nonlinear.candidate,
  benchmarkProgramme: programme,
  benchmarkEvidence,
});
assert.equal(currentness.status, 'CURRENT');
const presentation = presentPreproductionThermalLiftoffGovernedExecution({ receipt, currentness });
assert.equal(presentation.status, 'PRESENTABLE_PREPRODUCTION_SCREEN');
assert.equal(presentation.rows.length, 4);
assert.equal(presentation.policy.productionUiWiringPerformed, false);
assert.equal(presentation.policy.defaultUiExposurePermitted, false);
assert.equal(presentation.policy.sealExportEligibilityPermitted, false);
assert.equal(presentation.policy.productionCutoverPermitted, false);

// A changed current TL-04 source/result invalidates the old governed receipt and
// stale presentation suppresses every numerical row.
const changed = scenario('NONLINEAR_CONTACT_CHANGE_RECONTACT', [-0.15, 0.1, 0.1, -0.09], 'TL06-CHANGED');
const stale = assessPreproductionThermalLiftoffGovernedCurrentness({
  receipt,
  request,
  activeSetIntake: changed.intake,
  activeSetResult: changed.candidate,
  benchmarkProgramme: programme,
  benchmarkEvidence,
});
assert.equal(stale.status, 'STALE_SUPPRESSED');
const stalePresentation = presentPreproductionThermalLiftoffGovernedExecution({ receipt, currentness: stale });
assert.equal(stalePresentation.status, 'STALE_SUPPRESSED');
assert.deepEqual(stalePresentation.rows, []);
assert.equal(stalePresentation.policy.staleRowsSuppressed, true);

// A fully rehashed TL-05 programme forgery is caught because TL-06 independently
// rebuilds every correlation from candidate/reference/numerical source evidence.
const forgedProgramme = structuredClone(programme);
forgedProgramme.correlations[0].comparisons[0].candidateReactionN += 1;
rehashComparison(forgedProgramme.correlations[0].comparisons[0]);
rehashCorrelation(forgedProgramme.correlations[0]);
forgedProgramme.correlationSemanticHashes = forgedProgramme.correlations.map((row) => row.semanticHash);
rehashProgramme(forgedProgramme);
assert.throws(() => calculatePreproductionThermalLiftoffGovernedExecution({
  executionId: 'TL06-FORGED-PROGRAMME',
  executedAt: '2026-08-08T13:32:00.000Z',
  request,
  activeSetIntake: nonlinear.intake,
  activeSetResult: nonlinear.candidate,
  benchmarkProgramme: forgedProgramme,
  benchmarkEvidence,
}), (error) => ['PREPRODUCTION_TL06_TL05_CORRELATION_STALE', 'PREPRODUCTION_TL06_TL05_PROGRAMME_STALE'].includes(error?.code));

// No implicit/default request can execute.
const blockedRequest = createPreproductionThermalLiftoffGovernedRequest({
  requestId: 'TL06-NOT-OPTED-IN',
  requestedAt: '2026-08-08T13:33:00.000Z',
  integrationMode: 'DISABLED',
  expectedApplicabilityClass: 'TL-B_REDUCED_FLEXIBILITY_SINGLE_ROUTE_V1',
  optInAuthority: source('TL06-NOT-OPTED-IN-SOURCE', 'OWNER_APPROVED_PREPRODUCTION'),
  qualification: 'QUALIFIED',
});
assert.equal(blockedRequest.qualification, 'UNRESOLVED');
assert.throws(() => calculatePreproductionThermalLiftoffGovernedExecution({
  executionId: 'TL06-BLOCKED', executedAt: '2026-08-08T13:34:00.000Z', request: blockedRequest,
  activeSetIntake: nonlinear.intake, activeSetResult: nonlinear.candidate,
  benchmarkProgramme: programme, benchmarkEvidence,
}), (error) => error?.code === 'PREPRODUCTION_TL06_REQUEST_NOT_QUALIFIED');

console.log(JSON.stringify({
  check: 'preproduction-thermal-liftoff-tl06-governed-integration',
  status: 'PASS',
  receiptSchema: receipt.schema,
  receiptStatus: receipt.status,
  explicitOptInRequired: true,
  currentTl04Required: true,
  qualifiedTl05ProgrammeRequired: true,
  tl05EvidenceIndependentlyRebuilt: true,
  currentPresentationRows: presentation.rows.length,
  staleReceiptSuppressed: true,
  stalePresentationRows: stalePresentation.rows.length,
  forgedBenchmarkProgrammeRejected: true,
  implicitDefaultRequestRejected: true,
  productionCalculationConsumptionEnabled: false,
  productionMethodRegistrationPermitted: false,
  defaultUiExposurePermitted: false,
  sealExportEligibilityPermitted: false,
  productionCutoverPermitted: false,
  productionFinalReactionCalculated: false,
  finalHotReactionPublicationPermitted: false,
  qualificationFixtureOnly: true,
}, null, 2));

function scenario(scenarioClass, movements, prefix) {
  const intake = fixtureIntake(movements, prefix);
  const candidate = calculatePreproductionThermalLiftoffActiveSet({
    executionId: `${prefix}-CANDIDATE`, executedAt: '2026-08-08T13:25:00.000Z', intake,
  });
  const oracle = solveExhaustiveThermalLiftoffReference({
    referenceId: `${prefix}-REFERENCE`, scenarioClass, intake,
    source: source(`${prefix}-ORACLE`, 'INDEPENDENT_EXHAUSTIVE_COMPLEMENTARITY_ORACLE'),
    benchmarkReference: benchmark(`${prefix}-REFERENCE-BENCH`),
  });
  const correlation = qualifyPreproductionThermalLiftoffBenchmark({
    qualificationId: `${prefix}-CORRELATION`, candidate, reference: oracle.reference, numericalAuthority,
  });
  assert.equal(correlation.status, 'QUALIFIED_TL05_CORRELATION');
  return { intake, candidate, reference: oracle.reference, correlation };
}

function fixtureIntake(movements, prefix) {
  const ids = ['SITE-A', 'SITE-B', 'SITE-C', 'SITE-D'];
  const chainage = [0, 1000, 2000, 3000];
  const cold = [50, 100, 100, 50];
  const classifications = movements.map((movement, index) => cold[index] - 1000 * movement > 1e-6 ? 'CONTACT_RETAINED_CANDIDATE' : 'LIFTOFF_CANDIDATE');
  const supports = ids.map((id, index) => freezeHash({
    supportKey: `SUP-${id}`, supportSiteId: id, routeId: 'ROUTE-TL06-Q', routeChainageMm: chainage[index],
    coldGravityReactionN: cold[index], coldGapM: 0, usedUpwardRelativeDisplacementM: movements[index], freeOpeningM: movements[index],
    tl03Classification: classifications[index], contactRowSemanticHash: H(`${prefix}-CONTACT-${id}`),
    prerequisiteRowSemanticHash: H(`${prefix}-PREREQ-${id}`), tl03SupportScreenSemanticHash: H(`${prefix}-TL03-${id}`),
    displacementSemanticHash: H(`${prefix}-DISP-${id}`),
  }));
  const gravityContributions = [contribution('P-1', 500), contribution('P-2', 1500), contribution('P-3', 2500)];
  const material = {
    schema: 'engineering-preproduction-thermal-liftoff-active-set-intake/v1', method: 'THERMAL_LIFTOFF_ACTIVE_SET_V1',
    applicabilityClass: 'TL-B_REDUCED_FLEXIBILITY_SINGLE_ROUTE_V1', datasetId: 'DATASET-TL06-QUALIFICATION', loadCaseId: 'OPE',
    coldGravityMethod: 'CHAINAGE_TRIBUTARY_SPAN_V2', routeId: 'ROUTE-TL06-Q', reactionToleranceN: 1e-6,
    sourceBindings: {
      coldGravityExecutionSemanticHash: H(`${prefix}-COLD`), coldGravityDistributionSemanticHash: H(`${prefix}-DIST`),
      contactAuthoritySemanticHash: H(`${prefix}-CONTACT-AUTH`), prerequisiteAuthoritySemanticHash: H(`${prefix}-PREREQ-AUTH`),
      localScreenSemanticHash: H(`${prefix}-LOCAL-SCREEN`), flexibilityEvidenceSemanticHash: H(`${prefix}-FLEX`),
      numericalAuthoritySemanticHash: H(`${prefix}-TL04-NUM`),
    },
    status: 'READY_FOR_TL04_ACTIVE_SET', ordering: ids, supports, gravityContributions,
    flexibilityMatrixMPerN: [[0.001,-0.0004,0,0],[-0.0004,0.001,-0.0004,0],[0,-0.0004,0.001,-0.0004],[0,0,-0.0004,0.001]],
    numericalControls: { gapToleranceM:1e-9, complementarityToleranceNM:1e-7, gravityParityToleranceN:1e-9, forceToleranceN:1e-8, momentToleranceNmm:1e-5, matrixPivotToleranceMPerN:1e-12, maxIterations:10 },
    blockers: [],
    summary: { supportCount:4, contributionCount:3, tl03LiftoffCandidateCount: classifications.filter((x)=>x==='LIFTOFF_CANDIDATE').length, blockerCount:0 },
    policy: { productionCalculationConsumptionEnabled:false, productionMethodRegistrationPermitted:false, defaultUiExposurePermitted:false, gravitySourceRecalculationPermitted:false, gravityContributionRebracketingPermitted:true, coupledFlexibilitySolvePermitted:true, stiffnessSubmatrixReductionPermitted:false, activeSetExecutionPermitted:true, recontactEvaluationPermitted:true, negativeReactionClampingPermitted:false, springMechanicsExecuted:false, frictionMechanicsExecuted:false, finalHotReactionPublicationPermitted:false },
  };
  return requirePreproductionThermalLiftoffActiveSetIntake(freezeHash(material));
}
function contribution(id, chainageMm) { return freezeHash({ contributionId:id, routeId:'ROUTE-TL06-Q', verticalForceN:100, chainageMm, sourceContributionSemanticHash:H(`TL06-${id}`) }); }
function source(sourceId, sourceKind) { return { sourceId, sourceRevision:'REV-A', sourceSemanticHash:H(`${sourceId}:${sourceKind}`), sourceKind }; }
function benchmark(benchmarkId) { return { benchmarkId, benchmarkRevision:'REV-A', benchmarkSemanticHash:H(benchmarkId) }; }
function freezeHash(material) { return Object.freeze({ ...material, semanticHash: semanticHash(material) }); }
function H(label) { return semanticHash({ label }); }
function rehashComparison(row) { const { semanticHash: ignored, ...material } = row; void ignored; row.semanticHash = semanticHash(material); }
function rehashCorrelation(row) { const { semanticHash: ignored, ...material } = row; void ignored; row.semanticHash = semanticHash(material); }
function rehashProgramme(row) { const { semanticHash: ignored, ...material } = row; void ignored; row.semanticHash = semanticHash(material); }
