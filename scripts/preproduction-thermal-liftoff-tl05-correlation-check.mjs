import assert from 'node:assert/strict';
import { semanticHash } from '../src/core/shared-piping-model/canonical-json.js';
import { requirePreproductionThermalLiftoffActiveSetIntake } from '../src/workspace/engineering-loads/preproduction-thermal-liftoff-active-set-authority.js';
import {
  calculatePreproductionThermalLiftoffActiveSet,
  requirePreproductionThermalLiftoffActiveSet,
} from '../src/workspace/engineering-loads/preproduction-thermal-liftoff-active-set.js';
import {
  buildPreproductionThermalLiftoffBenchmarkProgramme,
  createPreproductionThermalLiftoffBenchmarkNumericalAuthority,
  qualifyPreproductionThermalLiftoffBenchmark,
  requirePreproductionThermalLiftoffBenchmarkProgramme,
} from '../src/workspace/engineering-loads/preproduction-thermal-liftoff-benchmark-authority.js';
import { solveExhaustiveThermalLiftoffReference } from './preproduction-thermal-liftoff-tl05-exhaustive-oracle.mjs';

const ZERO = [0, 0, 0, 0];
const NONLINEAR = [-0.15, 0.1, 0.1, -0.1];
const numericalAuthority = createPreproductionThermalLiftoffBenchmarkNumericalAuthority({
  authorityId: 'TL05-CORRELATION-ACCURACY-V1',
  reactionAbsoluteToleranceN: 1e-8,
  reactionRelativeToleranceFraction: 1e-10,
  gapAbsoluteToleranceM: 1e-10,
  gapRelativeToleranceFraction: 1e-9,
  forceResidualToleranceN: 1e-8,
  momentResidualToleranceNmm: 1e-5,
  complementarityToleranceNM: 1e-7,
  source: source('TL05-CORRELATION-ACCURACY', 'BENCHMARK_QUALIFIED'),
  benchmarkReference: benchmark('TL05-CORRELATION-ACCURACY-BENCH'),
  qualification: 'QUALIFIED',
});
assert.equal(numericalAuthority.qualification, 'QUALIFIED');

const zeroCase = qualifyScenario('ZERO_MOVEMENT_COLD_PARITY', ZERO, 'TL05-ZERO');
assert.equal(zeroCase.candidate.status, 'CONVERGED_PREPRODUCTION_SCREEN');
assert.equal(zeroCase.candidate.summary.iterationCount, 1);
assert.deepEqual(zeroCase.candidate.finalLiftedSupportSiteIds, []);
assert.equal(zeroCase.referenceEvidence.admissibleSubsetCount, 1);
assert.deepEqual(zeroCase.referenceEvidence.selectedActiveSupportSiteIds, ['SITE-A', 'SITE-B', 'SITE-C', 'SITE-D']);
assert.equal(zeroCase.correlation.status, 'QUALIFIED_TL05_CORRELATION');
assert.equal(zeroCase.correlation.summary.stateMatchCount, 4);
assert.equal(zeroCase.correlation.summary.reactionPassCount, 4);
assert.equal(zeroCase.correlation.summary.gapPassCount, 4);
for (const row of zeroCase.candidate.supportResults) {
  assertClose(row.solvedTotalReactionN, row.coldGravityReactionN, 1e-10, `zero parity ${row.supportSiteId}`);
  assertClose(row.solvedHotGapM, 0, 1e-12, `zero gap ${row.supportSiteId}`);
}

const nonlinearCase = qualifyScenario('NONLINEAR_CONTACT_CHANGE_RECONTACT', NONLINEAR, 'TL05-NONLINEAR');
assert.equal(nonlinearCase.candidate.status, 'CONVERGED_PREPRODUCTION_SCREEN');
assert.deepEqual(nonlinearCase.candidate.finalActiveSupportSiteIds, ['SITE-A', 'SITE-B', 'SITE-D']);
assert.deepEqual(nonlinearCase.candidate.finalLiftedSupportSiteIds, ['SITE-C']);
assert.equal(nonlinearCase.candidate.summary.releaseEventCount, 2);
assert.equal(nonlinearCase.candidate.summary.recontactEventCount, 1);
assert.equal(nonlinearCase.referenceEvidence.admissibleSubsetCount, 1);
assert.deepEqual(nonlinearCase.referenceEvidence.selectedActiveSupportSiteIds, ['SITE-A', 'SITE-B', 'SITE-D']);
assert.equal(nonlinearCase.correlation.status, 'QUALIFIED_TL05_CORRELATION');
assert.equal(nonlinearCase.correlation.summary.stateMatchCount, 4);
assert.equal(nonlinearCase.correlation.summary.reactionPassCount, 4);
assert.equal(nonlinearCase.correlation.summary.gapPassCount, 4);
assert.equal(nonlinearCase.referenceEvidence.candidateActiveSetAlgorithmReused, false);
const siteC = nonlinearCase.candidate.supportResults.find((row) => row.supportSiteId === 'SITE-C');
assert.equal(siteC.state, 'LIFTED');
assert.equal(siteC.solvedTotalReactionN, 0);
assert.ok(siteC.solvedHotGapM > 0);

const programme = buildPreproductionThermalLiftoffBenchmarkProgramme({
  programmeId: 'TL05-TL-B-REDUCED-FLEXIBILITY-PROGRAMME-V1',
  correlations: [zeroCase.correlation, nonlinearCase.correlation],
});
const acceptedProgramme = requirePreproductionThermalLiftoffBenchmarkProgramme(programme);
assert.equal(acceptedProgramme.status, 'QUALIFIED_TL05_BENCHMARK_PROGRAMME');
assert.equal(acceptedProgramme.qualifiedApplicabilityClass, 'TL-B_REDUCED_FLEXIBILITY_SINGLE_ROUTE_V1');
assert.equal(acceptedProgramme.summary.requiredScenarioCount, 2);
assert.equal(acceptedProgramme.summary.qualifiedScenarioCount, 2);
assert.equal(acceptedProgramme.policy.productionCutoverPermitted, false);
assert.equal(acceptedProgramme.policy.optInIntegrationEvidenceOnly, true);

// A single passing case cannot qualify the TL-05 programme.
const incomplete = buildPreproductionThermalLiftoffBenchmarkProgramme({
  programmeId: 'TL05-INCOMPLETE',
  correlations: [zeroCase.correlation],
});
assert.equal(incomplete.status, 'BLOCKED_TL05_BENCHMARK_PROGRAMME');
assert.ok(incomplete.blockers.some((row) => row.code === 'PREPRODUCTION_TL05_REQUIRED_SCENARIO_MISSING'));

// Wrong reference contact state is a correlation failure even when its receipt is internally hash-valid.
const wrongReference = structuredClone(nonlinearCase.reference);
wrongReference.supportResults[2].state = 'ACTIVE';
wrongReference.supportResults[2].reactionN = 1;
wrongReference.supportResults[2].gapM = 0;
rehashReference(wrongReference);
const wrongCorrelation = qualifyPreproductionThermalLiftoffBenchmark({
  qualificationId: 'TL05-WRONG-REFERENCE',
  candidate: nonlinearCase.candidate,
  reference: wrongReference,
  numericalAuthority,
});
assert.equal(wrongCorrelation.status, 'BLOCKED_TL05_CORRELATION');
assert.ok(wrongCorrelation.blockers.some((row) => row.code === 'PREPRODUCTION_TL05_SUPPORT_CORRELATION_FAILED'));

// A tolerance with no qualified source cannot turn a mismatch into qualification.
const unqualifiedNumerical = createPreproductionThermalLiftoffBenchmarkNumericalAuthority({
  authorityId: 'TL05-UNQUALIFIED-ACCURACY',
  reactionAbsoluteToleranceN: 1e9,
  reactionRelativeToleranceFraction: 1e9,
  gapAbsoluteToleranceM: 1e9,
  gapRelativeToleranceFraction: 1e9,
  forceResidualToleranceN: 1e9,
  momentResidualToleranceNmm: 1e9,
  complementarityToleranceNM: 1e9,
  source: source('TL05-UNQUALIFIED-ACCURACY', 'SOURCE_SOLVER'),
  benchmarkReference: benchmark('TL05-UNQUALIFIED-ACCURACY-BENCH'),
  qualification: 'QUALIFIED',
});
assert.equal(unqualifiedNumerical.qualification, 'UNRESOLVED');
const blockedByAuthority = qualifyPreproductionThermalLiftoffBenchmark({
  qualificationId: 'TL05-BLOCKED-NUMERICAL',
  candidate: nonlinearCase.candidate,
  reference: nonlinearCase.reference,
  numericalAuthority: unqualifiedNumerical,
});
assert.equal(blockedByAuthority.status, 'BLOCKED_TL05_CORRELATION');
assert.ok(blockedByAuthority.blockers.some((row) => row.code === 'PREPRODUCTION_TL05_NUMERICAL_AUTHORITY_BLOCKED'));

// Candidate arithmetic/source tamper is still rejected before correlation.
const tamperedCandidate = structuredClone(nonlinearCase.candidate);
tamperedCandidate.supportResults[0].solvedTotalReactionN += 1;
rehashSupport(tamperedCandidate.supportResults[0]);
rehashCandidate(tamperedCandidate);
assert.throws(() => requirePreproductionThermalLiftoffActiveSet(tamperedCandidate));

console.log(JSON.stringify({
  check: 'preproduction-thermal-liftoff-tl05-correlation',
  status: 'PASS',
  programmeSchema: acceptedProgramme.schema,
  programmeStatus: acceptedProgramme.status,
  qualifiedApplicabilityClass: acceptedProgramme.qualifiedApplicabilityClass,
  zeroMovementColdParityQualified: true,
  nonlinearContactChangeQualified: true,
  releaseAndRecontactReferenceAgreement: true,
  exhaustiveReferenceUniqueForBothCases: true,
  candidateActiveSetAlgorithmReusedByReference: false,
  exactSupportStateAgreement: true,
  reactionCorrelationPassed: true,
  gapCorrelationPassed: true,
  equilibriumCorrelationPassed: true,
  complementarityCorrelationPassed: true,
  incompleteProgrammeBlocked: true,
  wrongReferenceStateBlocked: true,
  unqualifiedNumericalAuthorityBlocked: true,
  productionCutoverPermitted: false,
  productionMethodRegistrationPermitted: false,
  defaultUiExposurePermitted: false,
  sealExportEligibilityPermitted: false,
  finalHotReactionPublicationPermitted: false,
  qualificationFixtureOnly: true,
}, null, 2));

function qualifyScenario(scenarioClass, movements, prefix) {
  const intake = fixtureIntake(movements);
  const candidate = calculatePreproductionThermalLiftoffActiveSet({
    executionId: `${prefix}-CANDIDATE`,
    executedAt: '2026-08-08T13:20:00.000Z',
    intake,
  });
  const oracle = solveExhaustiveThermalLiftoffReference({
    referenceId: `${prefix}-REFERENCE`,
    scenarioClass,
    intake,
    source: source(`${prefix}-EXHAUSTIVE-ORACLE`, 'INDEPENDENT_EXHAUSTIVE_COMPLEMENTARITY_ORACLE'),
    benchmarkReference: benchmark(`${prefix}-REFERENCE-BENCH`),
  });
  const correlation = qualifyPreproductionThermalLiftoffBenchmark({
    qualificationId: `${prefix}-CORRELATION`,
    candidate,
    reference: oracle.reference,
    numericalAuthority,
  });
  return { intake, candidate, reference: oracle.reference, referenceEvidence: oracle.evidence, correlation };
}

function fixtureIntake(movements) {
  const ids = ['SITE-A', 'SITE-B', 'SITE-C', 'SITE-D'];
  const chainage = [0, 1000, 2000, 3000];
  const cold = [50, 100, 100, 50];
  const classifications = movements.map((movement, index) => cold[index] - 1000 * movement > 1e-6
    ? 'CONTACT_RETAINED_CANDIDATE'
    : 'LIFTOFF_CANDIDATE');
  const supports = ids.map((id, index) => freezeHash({
    supportKey: `SUP-${id}`,
    supportSiteId: id,
    routeId: 'ROUTE-TL05-Q',
    routeChainageMm: chainage[index],
    coldGravityReactionN: cold[index],
    coldGapM: 0,
    usedUpwardRelativeDisplacementM: movements[index],
    freeOpeningM: movements[index],
    tl03Classification: classifications[index],
    contactRowSemanticHash: H(`CONTACT-${id}`),
    prerequisiteRowSemanticHash: H(`PREREQ-${id}`),
    tl03SupportScreenSemanticHash: H(`TL03-${id}-${movements[index]}`),
    displacementSemanticHash: H(`DISP-${id}-${movements[index]}`),
  }));
  const gravityContributions = [
    contribution('P-1', 500, 100),
    contribution('P-2', 1500, 100),
    contribution('P-3', 2500, 100),
  ];
  const matrix = [
    [0.001, -0.0004, 0, 0],
    [-0.0004, 0.001, -0.0004, 0],
    [0, -0.0004, 0.001, -0.0004],
    [0, 0, -0.0004, 0.001],
  ];
  const material = {
    schema: 'engineering-preproduction-thermal-liftoff-active-set-intake/v1',
    method: 'THERMAL_LIFTOFF_ACTIVE_SET_V1',
    applicabilityClass: 'TL-B_REDUCED_FLEXIBILITY_SINGLE_ROUTE_V1',
    datasetId: 'DATASET-TL05-QUALIFICATION',
    loadCaseId: 'OPE',
    coldGravityMethod: 'CHAINAGE_TRIBUTARY_SPAN_V2',
    routeId: 'ROUTE-TL05-Q',
    reactionToleranceN: 1e-6,
    sourceBindings: {
      coldGravityExecutionSemanticHash: H('TL05-COLD'),
      coldGravityDistributionSemanticHash: H('TL05-DISTRIBUTION'),
      contactAuthoritySemanticHash: H('TL05-CONTACT-AUTHORITY'),
      prerequisiteAuthoritySemanticHash: H(`TL05-PREREQUISITE-${JSON.stringify(movements)}`),
      localScreenSemanticHash: H(`TL05-LOCAL-SCREEN-${JSON.stringify(movements)}`),
      flexibilityEvidenceSemanticHash: H('TL05-FLEXIBILITY'),
      numericalAuthoritySemanticHash: H('TL05-TL04-NUMERICAL'),
    },
    status: 'READY_FOR_TL04_ACTIVE_SET',
    ordering: ids,
    supports,
    gravityContributions,
    flexibilityMatrixMPerN: matrix,
    numericalControls: {
      gapToleranceM: 1e-9,
      complementarityToleranceNM: 1e-7,
      gravityParityToleranceN: 1e-9,
      forceToleranceN: 1e-8,
      momentToleranceNmm: 1e-5,
      matrixPivotToleranceMPerN: 1e-12,
      maxIterations: 10,
    },
    blockers: [],
    summary: {
      supportCount: ids.length,
      contributionCount: gravityContributions.length,
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
  };
  return requirePreproductionThermalLiftoffActiveSetIntake(freezeHash(material));
}

function contribution(id, chainageMm, verticalForceN) {
  return freezeHash({
    contributionId: id,
    routeId: 'ROUTE-TL05-Q',
    verticalForceN,
    chainageMm,
    sourceContributionSemanticHash: H(`SOURCE-${id}`),
  });
}

function source(sourceId, sourceKind) {
  return {
    sourceId,
    sourceRevision: 'REV-A',
    sourceSemanticHash: H(`${sourceId}:${sourceKind}:REV-A`),
    sourceKind,
  };
}
function benchmark(benchmarkId) {
  return { benchmarkId, benchmarkRevision: 'REV-A', benchmarkSemanticHash: H(`${benchmarkId}:REV-A`) };
}
function rehashReference(reference) {
  const { semanticHash: ignored, ...material } = reference;
  void ignored;
  reference.semanticHash = semanticHash(material);
}
function rehashSupport(row) {
  const { semanticHash: ignored, ...material } = row;
  void ignored;
  row.semanticHash = semanticHash(material);
}
function rehashCandidate(candidate) {
  candidate.finalActiveSupportSiteIds = candidate.supportResults.filter((row) => row.state === 'ACTIVE').map((row) => row.supportSiteId);
  candidate.finalLiftedSupportSiteIds = candidate.supportResults.filter((row) => row.state === 'LIFTED').map((row) => row.supportSiteId);
  const { semanticHash: ignored, ...material } = candidate;
  void ignored;
  candidate.semanticHash = semanticHash(material);
}
function freezeHash(material) { return Object.freeze({ ...material, semanticHash: semanticHash(material) }); }
function H(label) { return semanticHash({ label }); }
function assertClose(actual, expected, tolerance, label) { assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} vs ${expected}`); }
