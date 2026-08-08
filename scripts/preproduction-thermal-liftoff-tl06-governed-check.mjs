import assert from 'node:assert/strict';
import { semanticHash } from '../src/core/shared-piping-model/canonical-json.js';
import { calculatePreproductionThermalLiftoffActiveSet } from '../src/workspace/engineering-loads/preproduction-thermal-liftoff-active-set.js';
import {
  PREPRODUCTION_TL05_REFERENCE_METHOD,
  computePreproductionThermalLiftoffCorrelationProblemSemanticHash,
  createPreproductionThermalLiftoffCorrelationAcceptance,
  createPreproductionThermalLiftoffCorrelationReference,
} from '../src/workspace/engineering-loads/preproduction-thermal-liftoff-correlation-authority.js';
import {
  correlatePreproductionThermalLiftoffBenchmarkProgramme,
  requirePreproductionThermalLiftoffCorrelation,
} from '../src/workspace/engineering-loads/preproduction-thermal-liftoff-correlation.js';
import {
  assessPreproductionThermalLiftoffGovernedCurrentness,
  calculatePreproductionThermalLiftoffGovernedExecution,
  createPreproductionThermalLiftoffGovernedRequest,
} from '../src/workspace/engineering-loads/preproduction-thermal-liftoff-governed-execution.js';
import { presentPreproductionThermalLiftoffGovernedExecution } from '../src/workspace/engineering-loads/preproduction-thermal-liftoff-presenter.js';
import { solveIndependentTlBComplementarityReference } from './preproduction-thermal-liftoff-correlation-reference-oracle.mjs';

const H = (label) => semanticHash({ label });
const IDS = ['SITE-A', 'SITE-B', 'SITE-C', 'SITE-D'];
const X = [0, 1000, 2000, 3000];
const C = [
  [0.001, -0.0004, 0, 0],
  [-0.0004, 0.001, -0.0004, 0],
  [0, -0.0004, 0.001, -0.0004],
  [0, 0, -0.0004, 0.001],
];
const CASES = [
  ['DOUBLE_LIFTOFF', [-0.05, 0.12, 0.12, -0.05], ['SITE-A', 'SITE-D']],
  ['NO_LIFTOFF_COUPLED', [-0.02, -0.01, -0.01, -0.02], IDS],
  ['RELEASE_RECONTACT', [-0.15, 0.1, 0.1, -0.1], ['SITE-A', 'SITE-B', 'SITE-D']],
  ['SINGLE_LIFTOFF', [-0.05, -0.02, 0.12, -0.05], ['SITE-A', 'SITE-B', 'SITE-D']],
  ['ZERO_MOVEMENT_COLD_PARITY', [0, 0, 0, 0], IDS],
];
const acceptance = createPreproductionThermalLiftoffCorrelationAcceptance({
  acceptanceId: 'TL06-TL05-ACCEPTANCE-V1',
  requiredBenchmarkCaseIds: CASES.map((row) => row[0]),
  reactionAbsoluteToleranceN: 1e-8,
  gapAbsoluteToleranceM: 1e-12,
  source: source('TL06-TL05-ACCEPTANCE', 'BENCHMARK_QUALIFIED'),
  benchmarkReference: benchmark('TL06-TL05-PROGRAMME'),
  qualification: 'QUALIFIED',
});

const programmeCases = [];
for (const [caseId, movement, expectedActive] of CASES) {
  const intake = makeIntake(caseId, movement, 10);
  // The independent reference remains generated before the TL-04 candidate.
  const oracle = solveIndependentTlBComplementarityReference(intake);
  assert.equal(oracle.referenceMethod, PREPRODUCTION_TL05_REFERENCE_METHOD);
  assert.equal(oracle.enumeratedStateCount, 15);
  assert.equal(oracle.admissibleStateCount, 1);
  assert.equal(oracle.problemSemanticHash, computePreproductionThermalLiftoffCorrelationProblemSemanticHash(intake));
  const reference = makeReference(caseId, intake, oracle);
  const candidate = calculatePreproductionThermalLiftoffActiveSet({
    executionId: `TL06-TL04-${caseId}`,
    executedAt: '2026-08-08T14:35:00.000Z',
    intake,
  });
  assert.equal(candidate.status, 'CONVERGED_PREPRODUCTION_SCREEN');
  assert.deepEqual(candidate.finalActiveSupportSiteIds, expectedActive);
  programmeCases.push({ intake, candidate, reference });
}
const correlation = correlatePreproductionThermalLiftoffBenchmarkProgramme({
  programmeId: 'TL06-CONTROLLED-TL05-PROGRAMME',
  executedAt: '2026-08-08T14:36:00.000Z',
  cases: programmeCases,
  acceptance,
});
assert.equal(correlation.status, 'QUALIFIED_PREPRODUCTION_CORRELATION');
assert.equal(correlation.summary.benchmarkCaseCount, 5);
assert.equal(correlation.summary.passCaseCount, 5);
assert.equal(correlation.summary.stateMismatchCount, 0);

const subject = programmeCases.find((row) => row.reference.benchmarkCaseId === 'RELEASE_RECONTACT');
const request = createPreproductionThermalLiftoffGovernedRequest({
  requestId: 'TL06-EXPLICIT-OPT-IN-QA',
  requestedAt: '2026-08-08T14:37:00.000Z',
  integrationMode: 'PREPRODUCTION_EXPLICIT_OPT_IN',
  expectedApplicabilityClass: 'TL-B_REDUCED_FLEXIBILITY_SINGLE_ROUTE_V1',
  optInAuthority: source('TL06-OWNER-OPT-IN', 'OWNER_APPROVED_PREPRODUCTION'),
  qualification: 'QUALIFIED',
});
assert.equal(request.qualification, 'QUALIFIED');
const sourceSnapshot = JSON.stringify({ request, subject, correlation, programmeCases, acceptance });

const receipt = calculatePreproductionThermalLiftoffGovernedExecution({
  executionId: 'TL06-GOVERNED-QA-001',
  executedAt: '2026-08-08T14:38:00.000Z',
  request,
  activeSetIntake: subject.intake,
  activeSetResult: subject.candidate,
  correlation,
  correlationCases: programmeCases,
  correlationAcceptance: acceptance,
});
assert.equal(receipt.status, 'CALCULATED_PREPRODUCTION_GOVERNED_SCREEN');
assert.equal(receipt.finality, 'PREPRODUCTION_GOVERNED_SCREEN_RECEIPT_ONLY');
assert.equal(receipt.supportResults.length, 4);
assert.deepEqual(
  receipt.supportResults.filter((row) => row.screenedContactState === 'LIFTED').map((row) => row.supportSiteId),
  ['SITE-C'],
);
assert.equal(receipt.policy.governedProductionIntegrationContractQualified, true);
assert.equal(receipt.policy.productionCalculationConsumptionEnabled, false);
assert.equal(receipt.policy.productionMethodRegistrationPermitted, false);
assert.equal(receipt.policy.defaultUiExposurePermitted, false);
assert.equal(receipt.policy.sealExportEligibilityPermitted, false);
assert.equal(receipt.policy.productionCutoverPermitted, false);
assert.equal(receipt.policy.productionFinalReactionCalculated, false);
assert.equal(receipt.policy.finalHotReactionPublicationPermitted, false);
assert.equal(JSON.stringify(receipt).includes('finalHotReactionN'), false);

const currentness = assessPreproductionThermalLiftoffGovernedCurrentness({
  receipt,
  request,
  activeSetIntake: subject.intake,
  activeSetResult: subject.candidate,
  correlation,
  correlationCases: programmeCases,
  correlationAcceptance: acceptance,
});
assert.equal(currentness.status, 'CURRENT');
const presentation = presentPreproductionThermalLiftoffGovernedExecution({ receipt, currentness });
assert.equal(presentation.status, 'PRESENTABLE_GOVERNED_EMPIRICAL_SCREEN');
assert.equal(presentation.rows.length, 4);
assert.equal(presentation.policy.productionUiWiringPerformed, false);

// Changed current TL-04 evidence makes the old receipt stale, even when the new
// TL-04 result is itself valid/current.
const changedSubject = makeCase('RELEASE_RECONTACT', [-0.15, 0.1, 0.1, -0.09], 10, 'TL06-CHANGED-SUBJECT');
const stale = assessPreproductionThermalLiftoffGovernedCurrentness({
  receipt,
  request,
  activeSetIntake: changedSubject.intake,
  activeSetResult: changedSubject.candidate,
  correlation,
  correlationCases: programmeCases,
  correlationAcceptance: acceptance,
});
assert.equal(stale.status, 'STALE_SUPPRESSED');
const stalePresentation = presentPreproductionThermalLiftoffGovernedExecution({ receipt, currentness: stale });
assert.equal(stalePresentation.status, 'STALE_SUPPRESSED');
assert.deepEqual(stalePresentation.rows, []);
assert.equal(stalePresentation.applicabilityClass, null);
assert.equal(stalePresentation.datasetId, null);
assert.equal(stalePresentation.loadCaseId, null);

// A logically forged TL-05 receipt can remain internally hash-valid and even
// source-current under TL-05's lightweight currentness comparison. TL-06 must
// still reject it because the complete correlation is replayed from source.
const forgedCorrelation = structuredClone(correlation);
forgedCorrelation.caseResults[0].candidateExecutionId = 'FORGED-TL05-CANDIDATE-ID';
rehash(forgedCorrelation.caseResults[0]);
rehash(forgedCorrelation);
requirePreproductionThermalLiftoffCorrelation(forgedCorrelation);
assert.throws(() => calculatePreproductionThermalLiftoffGovernedExecution({
  executionId: 'TL06-FORGED-TL05',
  executedAt: '2026-08-08T14:39:00.000Z',
  request,
  activeSetIntake: subject.intake,
  activeSetResult: subject.candidate,
  correlation: forgedCorrelation,
  correlationCases: programmeCases,
  correlationAcceptance: acceptance,
}), (error) => error?.code === 'PREPRODUCTION_TL06_TL05_REPLAY_MISMATCH');

// No implicit/default request can execute.
const blockedRequest = createPreproductionThermalLiftoffGovernedRequest({
  requestId: 'TL06-NOT-OPTED-IN',
  requestedAt: '2026-08-08T14:40:00.000Z',
  integrationMode: 'DISABLED',
  expectedApplicabilityClass: 'TL-B_REDUCED_FLEXIBILITY_SINGLE_ROUTE_V1',
  optInAuthority: source('TL06-NOT-OPTED-IN-SOURCE', 'OWNER_APPROVED_PREPRODUCTION'),
  qualification: 'QUALIFIED',
});
assert.equal(blockedRequest.qualification, 'UNRESOLVED');
assert.throws(() => calculatePreproductionThermalLiftoffGovernedExecution({
  executionId: 'TL06-BLOCKED',
  executedAt: '2026-08-08T14:41:00.000Z',
  request: blockedRequest,
  activeSetIntake: subject.intake,
  activeSetResult: subject.candidate,
  correlation,
  correlationCases: programmeCases,
  correlationAcceptance: acceptance,
}), (error) => error?.code === 'PREPRODUCTION_TL06_REQUEST_NOT_QUALIFIED');

assert.equal(JSON.stringify({ request, subject, correlation, programmeCases, acceptance }), sourceSnapshot);
console.log(JSON.stringify({
  check: 'preproduction-thermal-liftoff-tl06-governed-integration',
  status: 'PASS',
  receiptSchema: receipt.schema,
  receiptStatus: receipt.status,
  applicabilityClass: receipt.applicabilityClass,
  correlationClass: receipt.correlationClass,
  benchmarkCaseCount: correlation.summary.benchmarkCaseCount,
  passingBenchmarkCaseCount: correlation.summary.passCaseCount,
  screenedSupportCount: receipt.supportResults.length,
  liftedSupportSiteIds: receipt.supportResults.filter((row) => row.screenedContactState === 'LIFTED').map((row) => row.supportSiteId),
  explicitOptInRequired: true,
  currentTl04Required: true,
  currentTl05Required: true,
  completeTl05SourceReplayRequired: true,
  selfRehashedLogicalTl05ForgeryRejected: true,
  staleReceiptSuppressed: true,
  stalePresentationRows: stalePresentation.rows.length,
  implicitDefaultRequestRejected: true,
  productionCalculationConsumptionEnabled: false,
  productionMethodRegistrationPermitted: false,
  defaultUiExposurePermitted: false,
  sealExportEligibilityPermitted: false,
  productionCutoverPermitted: false,
  productionFinalReactionCalculated: false,
  finalHotReactionPublicationPermitted: false,
  generalAccuracyClaimPermitted: false,
  qualificationFixtureOnly: true,
  sourceInputsImmutable: true,
}, null, 2));

function makeCase(caseId, movement, maxIterations, prefix = `TL06-${caseId}`) {
  const intake = makeIntake(caseId, movement, maxIterations);
  const oracle = solveIndependentTlBComplementarityReference(intake);
  const reference = makeReference(caseId, intake, oracle);
  const candidate = calculatePreproductionThermalLiftoffActiveSet({
    executionId: `${prefix}-CANDIDATE`,
    executedAt: '2026-08-08T14:34:00.000Z',
    intake,
  });
  return { intake, candidate, reference };
}
function makeReference(caseId, intake, oracle) {
  return createPreproductionThermalLiftoffCorrelationReference({
    referenceId: `TL06-REF-${caseId}`,
    benchmarkCaseId: caseId,
    benchmarkReference: benchmark(`TL06-BENCH-${caseId}`),
    source: source(`TL06-ORACLE-${caseId}`, 'INDEPENDENT_QUALIFICATION_ORACLE'),
    candidateIntakeSemanticHash: intake.semanticHash,
    problemSemanticHash: oracle.problemSemanticHash,
    applicabilityClass: intake.applicabilityClass,
    datasetId: intake.datasetId,
    loadCaseId: intake.loadCaseId,
    referenceMethod: oracle.referenceMethod,
    supportOrdering: IDS,
    supportResults: oracle.supportResults,
    enumeratedStateCount: oracle.enumeratedStateCount,
    admissibleStateCount: oracle.admissibleStateCount,
    qualification: 'QUALIFIED',
  });
}
function makeIntake(caseId, movement, maxIterations) {
  const cold = [50, 100, 100, 50];
  const classifications = caseId.includes('ZERO') || caseId.includes('NO_LIFTOFF')
    ? IDS.map(() => 'CONTACT_RETAINED_CANDIDATE')
    : IDS.map((id, index) => movement[index] > 0.05 ? 'LIFTOFF_CANDIDATE' : 'CONTACT_RETAINED_CANDIDATE');
  const supports = IDS.map((id, index) => freezeHash({
    supportKey: `SUP-${id}`,
    supportSiteId: id,
    routeId: 'ROUTE-TL06',
    routeChainageMm: X[index],
    coldGravityReactionN: cold[index],
    coldGapM: 0,
    usedUpwardRelativeDisplacementM: movement[index],
    freeOpeningM: movement[index],
    tl03Classification: classifications[index],
    contactRowSemanticHash: H(`TL06-CONTACT-${id}`),
    prerequisiteRowSemanticHash: H(`TL06-PREREQ-${id}-${caseId}`),
    tl03SupportScreenSemanticHash: H(`TL06-TL03-${id}-${caseId}`),
    displacementSemanticHash: H(`TL06-DISP-${id}-${movement[index]}`),
  }));
  const gravityContributions = [[500, 100], [1500, 100], [2500, 100]].map(([chainageMm, verticalForceN], index) => freezeHash({
    contributionId: `P-${index + 1}`,
    routeId: 'ROUTE-TL06',
    verticalForceN,
    chainageMm,
    sourceContributionSemanticHash: H(`TL06-P-${index + 1}`),
  }));
  return freezeHash({
    schema: 'engineering-preproduction-thermal-liftoff-active-set-intake/v1',
    method: 'THERMAL_LIFTOFF_ACTIVE_SET_V1',
    applicabilityClass: 'TL-B_REDUCED_FLEXIBILITY_SINGLE_ROUTE_V1',
    datasetId: 'DATASET-TL06-QUALIFICATION',
    loadCaseId: 'OPE',
    coldGravityMethod: 'CHAINAGE_TRIBUTARY_SPAN_V2',
    routeId: 'ROUTE-TL06',
    reactionToleranceN: 1e-6,
    sourceBindings: {
      coldGravityExecutionSemanticHash: H('TL06-COLD-EXEC'),
      coldGravityDistributionSemanticHash: H('TL06-COLD-DIST'),
      contactAuthoritySemanticHash: H('TL06-CONTACT-AUTHORITY'),
      prerequisiteAuthoritySemanticHash: H(`TL06-PREREQ-${caseId}`),
      localScreenSemanticHash: H(`TL06-TL03-${caseId}`),
      flexibilityEvidenceSemanticHash: H('TL06-FLEX'),
      numericalAuthoritySemanticHash: H(`TL06-NUM-${maxIterations}`),
    },
    status: 'READY_FOR_TL04_ACTIVE_SET',
    ordering: IDS,
    supports,
    gravityContributions,
    flexibilityMatrixMPerN: C.map((row) => [...row]),
    numericalControls: {
      gapToleranceM: 1e-9,
      complementarityToleranceNM: 1e-7,
      gravityParityToleranceN: 1e-9,
      forceToleranceN: 1e-8,
      momentToleranceNmm: 1e-5,
      matrixPivotToleranceMPerN: 1e-12,
      maxIterations,
    },
    blockers: [],
    summary: {
      supportCount: 4,
      contributionCount: 3,
      tl03LiftoffCandidateCount: classifications.filter((value) => value === 'LIFTOFF_CANDIDATE').length,
      blockerCount: 0,
    },
    policy: {
      productionCalculationConsumptionEnabled: false,
      productionMethodRegistrationPermitted: false,
      defaultUiExposurePermitted: false,
      gravitySourceRecalculationPermitted: false,
      gravityContributionRebracketingPermitted: true,
      coupledFlexibilitySolvePermitted: true,
      stiffnessSubmatrixReductionPermitted: false,
      activeSetExecutionPermitted: true,
      recontactEvaluationPermitted: true,
      negativeReactionClampingPermitted: false,
      springMechanicsExecuted: false,
      frictionMechanicsExecuted: false,
      finalHotReactionPublicationPermitted: false,
    },
  });
}
function source(sourceId, sourceKind) { return { sourceId, sourceRevision: 'REV-A', sourceSemanticHash: H(`${sourceId}:${sourceKind}:REV-A`), sourceKind }; }
function benchmark(benchmarkId) { return { benchmarkId, benchmarkRevision: 'REV-A', benchmarkSemanticHash: H(`${benchmarkId}:REV-A`) }; }
function freezeHash(material) { return Object.freeze({ ...material, semanticHash: semanticHash(material) }); }
function rehash(value) { delete value.semanticHash; value.semanticHash = semanticHash(value); }
