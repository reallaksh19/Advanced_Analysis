import { semanticHash } from '../../core/shared-piping-model/canonical-json.js';
import { deepFreeze, isPlainRecord } from '../../core/shared-piping-model/immutable.js';
import { requirePreproductionThermalLiftoffActiveSetIntake } from './preproduction-thermal-liftoff-active-set-authority.js';
import { requirePreproductionThermalLiftoffActiveSet } from './preproduction-thermal-liftoff-active-set.js';
import {
  PREPRODUCTION_TL05_CORRELATION_CLASS,
  computePreproductionThermalLiftoffCorrelationProblemSemanticHash,
  requirePreproductionThermalLiftoffCorrelationAcceptance,
  requirePreproductionThermalLiftoffCorrelationReference,
} from './preproduction-thermal-liftoff-correlation-authority.js';

export const PREPRODUCTION_TL05_CORRELATION_SCHEMA = 'engineering-preproduction-thermal-liftoff-correlation/v1';
export const PREPRODUCTION_TL05_CORRELATION_CURRENTNESS_SCHEMA = 'engineering-preproduction-thermal-liftoff-correlation-currentness/v1';

export function correlatePreproductionThermalLiftoffBenchmarkProgramme(input) {
  exactKeys(input, ['programmeId', 'executedAt', 'cases', 'acceptance'], 'TL-05 programme input');
  const acceptance = requirePreproductionThermalLiftoffCorrelationAcceptance(input.acceptance);
  if (acceptance.qualification !== 'QUALIFIED') throw coded('PREPRODUCTION_TL05_ACCEPTANCE_NOT_READY');
  if (!Array.isArray(input.cases) || input.cases.length === 0) throw new TypeError('cases must be non-empty.');
  const cases = input.cases.map(normalizeCase);
  const observed = cases.map((row) => row.reference.benchmarkCaseId).sort(ascii);
  if (new Set(observed).size !== observed.length) throw coded('PREPRODUCTION_TL05_DUPLICATE_BENCHMARK_CASE');
  if (JSON.stringify(observed) !== JSON.stringify(acceptance.requiredBenchmarkCaseIds)) {
    throw coded('PREPRODUCTION_TL05_REQUIRED_CASE_COVERAGE_MISMATCH');
  }
  const applicability = new Set(cases.map((row) => row.intake.applicabilityClass));
  if (applicability.size !== 1) throw coded('PREPRODUCTION_TL05_APPLICABILITY_CLASS_CONFLICT');

  const caseResults = cases.map((row) => compareCase(row, acceptance)).sort((a, b) => ascii(a.benchmarkCaseId, b.benchmarkCaseId));
  const blockers = caseResults.filter((row) => row.status === 'FAIL').map((row) => issue(
    'PREPRODUCTION_TL05_CASE_CORRELATION_FAILED', row.benchmarkCaseId, 'Controlled TL-B benchmark case failed.',
  ));
  const summary = summarize(caseResults);
  const passed = blockers.length === 0 && summary.passCaseCount === acceptance.requiredBenchmarkCaseIds.length;
  const material = {
    schema: PREPRODUCTION_TL05_CORRELATION_SCHEMA,
    method: 'THERMAL_LIFTOFF_ACTIVE_SET_V1',
    stage: 'TL05_CONTROLLED_CORRELATION',
    finality: 'PREPRODUCTION_CORRELATION_EVIDENCE_ONLY',
    correlationClass: PREPRODUCTION_TL05_CORRELATION_CLASS,
    programmeId: text(input.programmeId),
    executedAt: timestamp(input.executedAt),
    applicabilityClass: [...applicability][0],
    acceptanceSemanticHash: acceptance.semanticHash,
    requiredBenchmarkCaseIds: [...acceptance.requiredBenchmarkCaseIds],
    status: passed ? 'QUALIFIED_PREPRODUCTION_CORRELATION' : 'CORRELATION_FAILED',
    caseResults,
    summary,
    accuracyDisposition: 'CONTROLLED_REDUCED_MODEL_CORRELATION_ONLY_NO_GENERAL_PERCENT_ACCURACY',
    blockers,
    policy: {
      productionCalculationConsumptionEnabled: false,
      productionMethodRegistrationPermitted: false,
      defaultUiExposurePermitted: false,
      finalHotReactionPublicationPermitted: false,
      candidateMechanicsModified: false,
      candidateStateSelectedFromReferenceOutput: false,
      outputFittingPermitted: false,
      exactSupportStateMatchRequired: true,
      uniqueReferenceStateRequired: true,
      generalAccuracyClaimPermitted: false,
      qualifiedTemplateCorrelationClaimPermitted: passed,
      tl06ProductionIntegrationAutomaticallyPermitted: false,
      springMechanicsExecuted: false,
      frictionMechanicsExecuted: false,
    },
  };
  return requirePreproductionThermalLiftoffCorrelation(freezeHash(material));
}

export function requirePreproductionThermalLiftoffCorrelation(value) {
  exactKeys(value, [
    'schema','method','stage','finality','correlationClass','programmeId','executedAt','applicabilityClass',
    'acceptanceSemanticHash','requiredBenchmarkCaseIds','status','caseResults','summary','accuracyDisposition','blockers','policy','semanticHash',
  ], 'TL-05 correlation');
  if (value.schema !== PREPRODUCTION_TL05_CORRELATION_SCHEMA || value.method !== 'THERMAL_LIFTOFF_ACTIVE_SET_V1'
      || value.stage !== 'TL05_CONTROLLED_CORRELATION' || value.finality !== 'PREPRODUCTION_CORRELATION_EVIDENCE_ONLY'
      || value.correlationClass !== PREPRODUCTION_TL05_CORRELATION_CLASS
      || value.accuracyDisposition !== 'CONTROLLED_REDUCED_MODEL_CORRELATION_ONLY_NO_GENERAL_PERCENT_ACCURACY') {
    throw coded('PREPRODUCTION_TL05_RESULT_IDENTITY_INVALID');
  }
  text(value.programmeId); timestamp(value.executedAt); text(value.applicabilityClass); hash(value.acceptanceSemanticHash);
  if (!Array.isArray(value.requiredBenchmarkCaseIds) || !Array.isArray(value.caseResults) || !Array.isArray(value.blockers)) throw new TypeError('TL-05 result arrays invalid.');
  const ids = value.caseResults.map(requireCaseResult);
  if (JSON.stringify(ids) !== JSON.stringify(value.requiredBenchmarkCaseIds)) throw coded('PREPRODUCTION_TL05_RESULT_CASE_COVERAGE_INVALID');
  const expected = summarize(value.caseResults);
  if (semanticHash(expected) !== semanticHash(value.summary)) throw coded('PREPRODUCTION_TL05_RESULT_SUMMARY_INVALID');
  const passed = expected.passCaseCount === value.requiredBenchmarkCaseIds.length && value.blockers.length === 0;
  if ((value.status === 'QUALIFIED_PREPRODUCTION_CORRELATION') !== passed) throw coded('PREPRODUCTION_TL05_RESULT_STATUS_MISMATCH');
  if (!['QUALIFIED_PREPRODUCTION_CORRELATION','CORRELATION_FAILED'].includes(value.status)) throw coded('PREPRODUCTION_TL05_RESULT_STATUS_INVALID');
  const p = value.policy || {};
  if (p.productionCalculationConsumptionEnabled !== false || p.productionMethodRegistrationPermitted !== false
      || p.defaultUiExposurePermitted !== false || p.finalHotReactionPublicationPermitted !== false
      || p.candidateMechanicsModified !== false || p.candidateStateSelectedFromReferenceOutput !== false
      || p.outputFittingPermitted !== false || p.exactSupportStateMatchRequired !== true || p.uniqueReferenceStateRequired !== true
      || p.generalAccuracyClaimPermitted !== false || p.qualifiedTemplateCorrelationClaimPermitted !== passed
      || p.tl06ProductionIntegrationAutomaticallyPermitted !== false || p.springMechanicsExecuted !== false || p.frictionMechanicsExecuted !== false) {
    throw coded('PREPRODUCTION_TL05_RESULT_POLICY_INVALID');
  }
  const { semanticHash: actual, ...material } = value;
  if (actual !== semanticHash(material)) throw coded('PREPRODUCTION_TL05_RESULT_HASH_MISMATCH');
  return deepFreeze(structuredClone(value));
}

export function assessPreproductionThermalLiftoffCorrelationCurrentness(resultValue, input) {
  const result = requirePreproductionThermalLiftoffCorrelation(resultValue);
  exactKeys(input, ['cases','acceptance'], 'TL-05 currentness input');
  const acceptance = requirePreproductionThermalLiftoffCorrelationAcceptance(input.acceptance);
  const cases = input.cases.map(normalizeCase);
  const previous = new Map(result.caseResults.map((row) => [row.benchmarkCaseId, row]));
  const differences = [];
  if (result.acceptanceSemanticHash !== acceptance.semanticHash) differences.push('acceptanceSemanticHash');
  const ids = cases.map((row) => row.reference.benchmarkCaseId).sort(ascii);
  if (JSON.stringify(ids) !== JSON.stringify(result.requiredBenchmarkCaseIds)) differences.push('benchmarkCaseIds');
  for (const row of cases) {
    const prior = previous.get(row.reference.benchmarkCaseId);
    if (!prior) continue;
    if (prior.intakeSemanticHash !== row.intake.semanticHash) differences.push(`${row.reference.benchmarkCaseId}:intake`);
    if (prior.candidateSemanticHash !== row.candidate.semanticHash) differences.push(`${row.reference.benchmarkCaseId}:candidate`);
    if (prior.referenceSemanticHash !== row.reference.semanticHash) differences.push(`${row.reference.benchmarkCaseId}:reference`);
  }
  return freezeHash({
    schema: PREPRODUCTION_TL05_CORRELATION_CURRENTNESS_SCHEMA,
    correlationSemanticHash: result.semanticHash,
    observedAcceptanceSemanticHash: acceptance.semanticHash,
    status: differences.length ? 'STALE_RECORRELATION_REQUIRED' : 'CURRENT',
    differences: [...new Set(differences)].sort(ascii),
    productionCalculationConsumptionEnabled: false,
    tl06ProductionIntegrationAutomaticallyPermitted: false,
  });
}

function normalizeCase(value) {
  exactKeys(value, ['intake','candidate','reference'], 'TL-05 case input');
  return {
    intake: requirePreproductionThermalLiftoffActiveSetIntake(value.intake),
    candidate: requirePreproductionThermalLiftoffActiveSet(value.candidate),
    reference: requirePreproductionThermalLiftoffCorrelationReference(value.reference),
  };
}

function compareCase(row, acceptance) {
  const { intake, candidate, reference } = row;
  const blockers = [];
  const problemHash = computePreproductionThermalLiftoffCorrelationProblemSemanticHash(intake);
  if (candidate.status !== 'CONVERGED_PREPRODUCTION_SCREEN') blockers.push(issue('PREPRODUCTION_TL05_CANDIDATE_NOT_CONVERGED', reference.benchmarkCaseId, 'TL-04 candidate is not converged.'));
  if (reference.qualification !== 'QUALIFIED' || reference.admissibleStateCount !== 1) blockers.push(issue('PREPRODUCTION_TL05_REFERENCE_NOT_UNIQUE', reference.benchmarkCaseId, 'Reference state is not uniquely qualified.'));
  if (candidate.intakeSemanticHash !== intake.semanticHash || reference.candidateIntakeSemanticHash !== intake.semanticHash) blockers.push(issue('PREPRODUCTION_TL05_INTAKE_BINDING_MISMATCH', reference.benchmarkCaseId, 'Candidate/reference intake binding mismatch.'));
  if (reference.problemSemanticHash !== problemHash) blockers.push(issue('PREPRODUCTION_TL05_PROBLEM_BINDING_MISMATCH', reference.benchmarkCaseId, 'Independent problem identity mismatch.'));
  if (candidate.applicabilityClass !== intake.applicabilityClass || reference.applicabilityClass !== intake.applicabilityClass
      || candidate.datasetId !== intake.datasetId || reference.datasetId !== intake.datasetId
      || candidate.loadCaseId !== intake.loadCaseId || reference.loadCaseId !== intake.loadCaseId) blockers.push(issue('PREPRODUCTION_TL05_IDENTITY_MISMATCH', reference.benchmarkCaseId, 'Candidate/reference engineering identity mismatch.'));
  const candidateById = new Map(candidate.supportResults.map((x) => [x.supportSiteId, x]));
  const supportComparisons = reference.supportResults.map((r) => comparison(candidateById.get(r.supportSiteId), r, acceptance));
  if (supportComparisons.some((x) => x.missingCandidate)) blockers.push(issue('PREPRODUCTION_TL05_SUPPORT_COVERAGE_MISMATCH', reference.benchmarkCaseId, 'Candidate support coverage mismatch.'));
  const maxReactionAbsoluteDeviationN = Math.max(0, ...supportComparisons.map((x) => x.reactionAbsoluteDeviationN));
  const maxGapAbsoluteDeviationM = Math.max(0, ...supportComparisons.map((x) => x.gapAbsoluteDeviationM));
  const stateMismatchCount = supportComparisons.filter((x) => !x.stateMatch).length;
  if (supportComparisons.some((x) => !x.stateMatch || !x.reactionWithinTolerance || !x.gapWithinTolerance)) blockers.push(issue('PREPRODUCTION_TL05_NUMERICAL_DEVIATION', reference.benchmarkCaseId, 'Support state/reaction/gap differs from controlled reference.'));
  const material = {
    benchmarkCaseId: reference.benchmarkCaseId,
    intakeSemanticHash: intake.semanticHash,
    candidateSemanticHash: candidate.semanticHash,
    referenceSemanticHash: reference.semanticHash,
    problemSemanticHash: problemHash,
    candidateExecutionId: candidate.executionId,
    candidateIterationCount: candidate.iterationHistory.length,
    referenceMethod: reference.referenceMethod,
    referenceEnumeratedStateCount: reference.enumeratedStateCount,
    referenceAdmissibleStateCount: reference.admissibleStateCount,
    reactionAbsoluteToleranceN: acceptance.reactionAbsoluteToleranceN,
    gapAbsoluteToleranceM: acceptance.gapAbsoluteToleranceM,
    status: blockers.length ? 'FAIL' : 'PASS',
    supportComparisons,
    maxReactionAbsoluteDeviationN,
    maxGapAbsoluteDeviationM,
    stateMismatchCount,
    blockers,
  };
  return freezeHash(material);
}

function comparison(candidate, reference, acceptance) {
  if (!candidate) return freezeHash({ supportSiteId: reference.supportSiteId, missingCandidate: true, candidateState: null, referenceState: reference.state, stateMatch: false, candidateTotalReactionN: null, referenceTotalReactionN: reference.referenceTotalReactionN, reactionAbsoluteDeviationN: Infinity, reactionWithinTolerance: false, candidateHotGapM: null, referenceHotGapM: reference.referenceHotGapM, gapAbsoluteDeviationM: Infinity, gapWithinTolerance: false });
  const reactionAbsoluteDeviationN = Math.abs(candidate.solvedTotalReactionN - reference.referenceTotalReactionN);
  const gapAbsoluteDeviationM = Math.abs(candidate.solvedHotGapM - reference.referenceHotGapM);
  return freezeHash({
    supportSiteId: reference.supportSiteId, missingCandidate: false,
    candidateState: candidate.state, referenceState: reference.state, stateMatch: candidate.state === reference.state,
    candidateTotalReactionN: candidate.solvedTotalReactionN, referenceTotalReactionN: reference.referenceTotalReactionN,
    reactionAbsoluteDeviationN, reactionWithinTolerance: reactionAbsoluteDeviationN <= acceptance.reactionAbsoluteToleranceN,
    candidateHotGapM: candidate.solvedHotGapM, referenceHotGapM: reference.referenceHotGapM,
    gapAbsoluteDeviationM, gapWithinTolerance: gapAbsoluteDeviationM <= acceptance.gapAbsoluteToleranceM,
  });
}

function requireCaseResult(value) {
  if (!isPlainRecord(value)) throw new TypeError('case result must be object.');
  const id = text(value.benchmarkCaseId); hash(value.intakeSemanticHash); hash(value.candidateSemanticHash); hash(value.referenceSemanticHash); hash(value.problemSemanticHash);
  if (!['PASS','FAIL'].includes(value.status) || !Array.isArray(value.supportComparisons) || !Array.isArray(value.blockers)) throw coded('PREPRODUCTION_TL05_CASE_STATUS_INVALID');
  value.supportComparisons.forEach((x) => requireComparison(x, value.reactionAbsoluteToleranceN, value.gapAbsoluteToleranceM));
  const maxR = Math.max(0, ...value.supportComparisons.map((x) => x.reactionAbsoluteDeviationN));
  const maxG = Math.max(0, ...value.supportComparisons.map((x) => x.gapAbsoluteDeviationM));
  const mismatches = value.supportComparisons.filter((x) => !x.stateMatch).length;
  if (value.maxReactionAbsoluteDeviationN !== maxR || value.maxGapAbsoluteDeviationM !== maxG || value.stateMismatchCount !== mismatches) throw coded('PREPRODUCTION_TL05_CASE_SUMMARY_ARITHMETIC_MISMATCH');
  const { semanticHash: actual, ...material } = value; if (actual !== semanticHash(material)) throw coded('PREPRODUCTION_TL05_CASE_HASH_MISMATCH');
  return id;
}

function requireComparison(value, reactionToleranceN, gapToleranceM) {
  if (!isPlainRecord(value)) throw new TypeError('comparison must be object.');
  const { semanticHash: actual, ...material } = value;
  if (actual !== semanticHash(material)) throw coded('PREPRODUCTION_TL05_COMPARISON_HASH_MISMATCH');
  if (value.missingCandidate) return;
  const r = Math.abs(value.candidateTotalReactionN - value.referenceTotalReactionN);
  const g = Math.abs(value.candidateHotGapM - value.referenceHotGapM);
  if (value.stateMatch !== (value.candidateState === value.referenceState)
      || value.reactionAbsoluteDeviationN !== r || value.reactionWithinTolerance !== (r <= reactionToleranceN)
      || value.gapAbsoluteDeviationM !== g || value.gapWithinTolerance !== (g <= gapToleranceM)) {
    throw coded('PREPRODUCTION_TL05_COMPARISON_ARITHMETIC_MISMATCH');
  }
}

function summarize(rows) { return { benchmarkCaseCount: rows.length, passCaseCount: rows.filter((x) => x.status === 'PASS').length, failCaseCount: rows.filter((x) => x.status === 'FAIL').length, comparedSupportCount: rows.reduce((n,x) => n + x.supportComparisons.length,0), stateMismatchCount: rows.reduce((n,x) => n + x.stateMismatchCount,0), maxReactionAbsoluteDeviationN: Math.max(0,...rows.map((x) => x.maxReactionAbsoluteDeviationN)), maxGapAbsoluteDeviationM: Math.max(0,...rows.map((x) => x.maxGapAbsoluteDeviationM)) }; }
function issue(code, scope, message) { return deepFreeze({ code, severity:'ERROR', scope, message, details:null }); }
function freezeHash(material) { return deepFreeze({ ...material, semanticHash: semanticHash(material) }); }
function exactKeys(value, keys, label) { if (!isPlainRecord(value) || JSON.stringify(Object.keys(value).sort(ascii)) !== JSON.stringify([...keys].sort(ascii))) throw new TypeError(`${label} contains unexpected or missing keys.`); }
function text(value) { if (typeof value !== 'string' || !value.trim()) throw new TypeError('text must be non-empty.'); return value; }
function timestamp(value) { const x=text(value); if (new Date(x).toISOString() !== x) throw new TypeError('timestamp must be canonical.'); return x; }
function hash(value) { if (typeof value !== 'string' || !/^fnv1a64:[0-9a-f]{16}$/u.test(value)) throw new TypeError('hash invalid.'); return value; }
function ascii(a,b) { return String(a)<String(b)?-1:String(a)>String(b)?1:0; }
function coded(code) { const error=new Error(code); error.code=code; return error; }
