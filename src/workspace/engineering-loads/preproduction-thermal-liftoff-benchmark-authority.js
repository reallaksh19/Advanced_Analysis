import { semanticHash } from '../../core/shared-piping-model/canonical-json.js';
import { deepFreeze, isPlainRecord, stringValue } from '../../core/shared-piping-model/immutable.js';
import { requirePreproductionThermalLiftoffActiveSet } from './preproduction-thermal-liftoff-active-set.js';

export const PREPRODUCTION_TL05_NUMERICAL_AUTHORITY_SCHEMA =
  'engineering-preproduction-thermal-liftoff-benchmark-numerical-authority/v1';
export const PREPRODUCTION_TL05_REFERENCE_SCHEMA =
  'engineering-preproduction-thermal-liftoff-benchmark-reference/v1';
export const PREPRODUCTION_TL05_CORRELATION_SCHEMA =
  'engineering-preproduction-thermal-liftoff-benchmark-correlation/v1';
export const PREPRODUCTION_TL05_PROGRAMME_SCHEMA =
  'engineering-preproduction-thermal-liftoff-benchmark-programme/v1';

export const TL05_REQUIRED_SCENARIOS = Object.freeze([
  'ZERO_MOVEMENT_COLD_PARITY',
  'NONLINEAR_CONTACT_CHANGE_RECONTACT',
]);

const REFERENCE_SOURCE_KINDS = new Set([
  'INDEPENDENT_EXHAUSTIVE_COMPLEMENTARITY_ORACLE',
  'CONTROLLED_NONLINEAR_SOLVER',
  'APPROVED_FLEXIBILITY_REFERENCE',
]);
const NUMERICAL_SOURCE_KINDS = new Set(['BENCHMARK_QUALIFIED', 'APPROVED_ENGINEERING_DATA', 'MEASURED_TEST']);

export function createPreproductionThermalLiftoffBenchmarkNumericalAuthority(input) {
  exact(input, [
    'authorityId', 'reactionAbsoluteToleranceN', 'reactionRelativeToleranceFraction',
    'gapAbsoluteToleranceM', 'gapRelativeToleranceFraction', 'forceResidualToleranceN',
    'momentResidualToleranceNmm', 'complementarityToleranceNM',
    'source', 'benchmarkReference', 'qualification',
  ], 'TL-05 numerical authority input');
  const source = sourceIdentity(input.source, 'TL-05 numerical source');
  const blockers = [];
  if (input.qualification !== 'QUALIFIED' || !NUMERICAL_SOURCE_KINDS.has(source.sourceKind)) {
    blockers.push(issue('PREPRODUCTION_TL05_NUMERICAL_AUTHORITY_UNQUALIFIED', 'numericalAuthority'));
  }
  return freezeHash({
    schema: PREPRODUCTION_TL05_NUMERICAL_AUTHORITY_SCHEMA,
    authorityId: text(input.authorityId, 'authorityId'),
    reactionAbsoluteToleranceN: nonnegative(input.reactionAbsoluteToleranceN, 'reactionAbsoluteToleranceN'),
    reactionRelativeToleranceFraction: nonnegative(input.reactionRelativeToleranceFraction, 'reactionRelativeToleranceFraction'),
    gapAbsoluteToleranceM: nonnegative(input.gapAbsoluteToleranceM, 'gapAbsoluteToleranceM'),
    gapRelativeToleranceFraction: nonnegative(input.gapRelativeToleranceFraction, 'gapRelativeToleranceFraction'),
    forceResidualToleranceN: nonnegative(input.forceResidualToleranceN, 'forceResidualToleranceN'),
    momentResidualToleranceNmm: nonnegative(input.momentResidualToleranceNmm, 'momentResidualToleranceNmm'),
    complementarityToleranceNM: nonnegative(input.complementarityToleranceNM, 'complementarityToleranceNM'),
    source,
    benchmarkReference: benchmark(input.benchmarkReference),
    qualification: blockers.length ? 'UNRESOLVED' : 'QUALIFIED',
    blockers,
    policy: {
      hiddenDefaultPermitted: false,
      solverInternalToleranceAutomaticallyPromotable: false,
      productionCalculationConsumptionEnabled: false,
      productionMethodRegistrationPermitted: false,
    },
  });
}

export function requirePreproductionThermalLiftoffBenchmarkNumericalAuthority(value) {
  if (value?.schema !== PREPRODUCTION_TL05_NUMERICAL_AUTHORITY_SCHEMA) throw coded('PREPRODUCTION_TL05_NUMERICAL_SCHEMA_INVALID');
  const normalized = createPreproductionThermalLiftoffBenchmarkNumericalAuthority({
    authorityId: value.authorityId,
    reactionAbsoluteToleranceN: value.reactionAbsoluteToleranceN,
    reactionRelativeToleranceFraction: value.reactionRelativeToleranceFraction,
    gapAbsoluteToleranceM: value.gapAbsoluteToleranceM,
    gapRelativeToleranceFraction: value.gapRelativeToleranceFraction,
    forceResidualToleranceN: value.forceResidualToleranceN,
    momentResidualToleranceNmm: value.momentResidualToleranceNmm,
    complementarityToleranceNM: value.complementarityToleranceNM,
    source: value.source,
    benchmarkReference: value.benchmarkReference,
    qualification: value.qualification,
  });
  if (normalized.semanticHash !== value.semanticHash) throw coded('PREPRODUCTION_TL05_NUMERICAL_HASH_MISMATCH');
  return normalized;
}

export function createPreproductionThermalLiftoffBenchmarkReference(input) {
  exact(input, [
    'referenceId', 'scenarioClass', 'source', 'benchmarkReference',
    'applicabilityClass', 'datasetId', 'loadCaseId', 'intakeSemanticHash',
    'ordering', 'supportResults', 'equilibrium', 'complementarity', 'qualification',
  ], 'TL-05 reference input');
  const source = sourceIdentity(input.source, 'TL-05 reference source');
  const blockers = [];
  if (input.qualification !== 'QUALIFIED' || !REFERENCE_SOURCE_KINDS.has(source.sourceKind)) {
    blockers.push(issue('PREPRODUCTION_TL05_REFERENCE_SOURCE_UNQUALIFIED', 'reference'));
  }
  const scenarioClass = member(input.scenarioClass, TL05_REQUIRED_SCENARIOS, 'scenarioClass');
  const ordering = order(input.ordering);
  const supportResults = input.supportResults.map((row, index) => referenceSupport(row, `supportResults[${index}]`));
  if (JSON.stringify(ordering) !== JSON.stringify(supportResults.map((row) => row.supportSiteId))) {
    throw coded('PREPRODUCTION_TL05_REFERENCE_SUPPORT_ORDER_MISMATCH');
  }
  const equilibrium = referenceEquilibrium(input.equilibrium);
  const complementarity = referenceComplementarity(input.complementarity);
  return freezeHash({
    schema: PREPRODUCTION_TL05_REFERENCE_SCHEMA,
    referenceId: text(input.referenceId, 'referenceId'),
    scenarioClass,
    source,
    benchmarkReference: benchmark(input.benchmarkReference),
    applicabilityClass: text(input.applicabilityClass, 'applicabilityClass'),
    datasetId: text(input.datasetId, 'datasetId'),
    loadCaseId: text(input.loadCaseId, 'loadCaseId'),
    intakeSemanticHash: hash(input.intakeSemanticHash, 'intakeSemanticHash'),
    ordering,
    supportResults,
    equilibrium,
    complementarity,
    qualification: blockers.length ? 'UNRESOLVED' : 'QUALIFIED',
    blockers,
    policy: {
      candidateActiveSetAlgorithmReused: false,
      productionCalculationConsumptionEnabled: false,
      productionMethodRegistrationPermitted: false,
      finalHotReactionPublicationPermitted: false,
    },
  });
}

export function requirePreproductionThermalLiftoffBenchmarkReference(value) {
  if (value?.schema !== PREPRODUCTION_TL05_REFERENCE_SCHEMA) throw coded('PREPRODUCTION_TL05_REFERENCE_SCHEMA_INVALID');
  const normalized = createPreproductionThermalLiftoffBenchmarkReference({
    referenceId: value.referenceId,
    scenarioClass: value.scenarioClass,
    source: value.source,
    benchmarkReference: value.benchmarkReference,
    applicabilityClass: value.applicabilityClass,
    datasetId: value.datasetId,
    loadCaseId: value.loadCaseId,
    intakeSemanticHash: value.intakeSemanticHash,
    ordering: value.ordering,
    supportResults: value.supportResults,
    equilibrium: value.equilibrium,
    complementarity: value.complementarity,
    qualification: value.qualification,
  });
  if (normalized.semanticHash !== value.semanticHash) throw coded('PREPRODUCTION_TL05_REFERENCE_HASH_MISMATCH');
  return normalized;
}

export function qualifyPreproductionThermalLiftoffBenchmark(input) {
  exact(input, ['qualificationId', 'candidate', 'reference', 'numericalAuthority'], 'TL-05 correlation input');
  const candidate = requirePreproductionThermalLiftoffActiveSet(input.candidate);
  const reference = requirePreproductionThermalLiftoffBenchmarkReference(input.reference);
  const numerical = requirePreproductionThermalLiftoffBenchmarkNumericalAuthority(input.numericalAuthority);
  const blockers = [];
  if (candidate.status !== 'CONVERGED_PREPRODUCTION_SCREEN') {
    blockers.push(issue('PREPRODUCTION_TL05_CANDIDATE_NOT_CONVERGED', 'candidate'));
  }
  if (reference.qualification !== 'QUALIFIED') blockers.push(issue('PREPRODUCTION_TL05_REFERENCE_UNQUALIFIED', 'reference'));
  if (numerical.qualification !== 'QUALIFIED') blockers.push(issue('PREPRODUCTION_TL05_NUMERICAL_AUTHORITY_BLOCKED', 'numericalAuthority'));
  if (candidate.applicabilityClass !== reference.applicabilityClass
      || candidate.datasetId !== reference.datasetId
      || candidate.loadCaseId !== reference.loadCaseId
      || candidate.intakeSemanticHash !== reference.intakeSemanticHash) {
    blockers.push(issue('PREPRODUCTION_TL05_REFERENCE_BINDING_MISMATCH', 'authority'));
  }
  const candidateOrdering = candidate.supportResults.map((row) => row.supportSiteId);
  if (JSON.stringify(candidateOrdering) !== JSON.stringify(reference.ordering)) {
    blockers.push(issue('PREPRODUCTION_TL05_SUPPORT_ORDER_MISMATCH', 'authority'));
  }

  const candidateBySite = new Map(candidate.supportResults.map((row) => [row.supportSiteId, row]));
  const comparisons = reference.supportResults.map((ref) => {
    const actual = candidateBySite.get(ref.supportSiteId);
    if (!actual) {
      return freezeHash({
        supportSiteId: ref.supportSiteId,
        stateMatch: false,
        candidateState: null,
        referenceState: ref.state,
        candidateReactionN: null,
        referenceReactionN: ref.reactionN,
        reactionAbsoluteDifferenceN: null,
        reactionRelativeDifferenceFraction: null,
        reactionPass: false,
        candidateGapM: null,
        referenceGapM: ref.gapM,
        gapAbsoluteDifferenceM: null,
        gapRelativeDifferenceFraction: null,
        gapPass: false,
        passed: false,
      });
    }
    const reactionAbsoluteDifferenceN = Math.abs(actual.solvedTotalReactionN - ref.reactionN);
    const reactionRelativeDifferenceFraction = relativeDifference(actual.solvedTotalReactionN, ref.reactionN);
    const reactionPass = reactionAbsoluteDifferenceN <= numerical.reactionAbsoluteToleranceN
      || (reactionRelativeDifferenceFraction !== null
        && reactionRelativeDifferenceFraction <= numerical.reactionRelativeToleranceFraction);
    const gapAbsoluteDifferenceM = Math.abs(actual.solvedHotGapM - ref.gapM);
    const gapRelativeDifferenceFraction = relativeDifference(actual.solvedHotGapM, ref.gapM);
    const gapPass = gapAbsoluteDifferenceM <= numerical.gapAbsoluteToleranceM
      || (gapRelativeDifferenceFraction !== null
        && gapRelativeDifferenceFraction <= numerical.gapRelativeToleranceFraction);
    const stateMatch = actual.state === ref.state;
    return freezeHash({
      supportSiteId: ref.supportSiteId,
      stateMatch,
      candidateState: actual.state,
      referenceState: ref.state,
      candidateReactionN: actual.solvedTotalReactionN,
      referenceReactionN: ref.reactionN,
      reactionAbsoluteDifferenceN,
      reactionRelativeDifferenceFraction,
      reactionPass,
      candidateGapM: actual.solvedHotGapM,
      referenceGapM: ref.gapM,
      gapAbsoluteDifferenceM,
      gapRelativeDifferenceFraction,
      gapPass,
      passed: stateMatch && reactionPass && gapPass,
    });
  });
  const equilibriumComparison = {
    candidateForceResidualN: candidate.equilibrium?.forceResidualN ?? null,
    referenceForceResidualN: reference.equilibrium.forceResidualN,
    forceResidualDifferenceN: candidate.equilibrium
      ? Math.abs(candidate.equilibrium.forceResidualN - reference.equilibrium.forceResidualN) : null,
    candidateMomentResidualNmm: candidate.equilibrium?.momentResidualNmm ?? null,
    referenceMomentResidualNmm: reference.equilibrium.momentResidualNmm,
    momentResidualDifferenceNmm: candidate.equilibrium
      ? Math.abs(candidate.equilibrium.momentResidualNmm - reference.equilibrium.momentResidualNmm) : null,
  };
  const complementarityComparison = {
    candidateResidualNM: candidate.complementarity?.complementarityResidualNM ?? null,
    referenceResidualNM: reference.complementarity.complementarityResidualNM,
    residualDifferenceNM: candidate.complementarity
      ? Math.abs(candidate.complementarity.complementarityResidualNM - reference.complementarity.complementarityResidualNM) : null,
  };
  const equilibriumPass = candidate.equilibrium !== null
    && Math.abs(reference.equilibrium.forceResidualN) <= numerical.forceResidualToleranceN
    && Math.abs(candidate.equilibrium.forceResidualN) <= numerical.forceResidualToleranceN
    && equilibriumComparison.forceResidualDifferenceN <= numerical.forceResidualToleranceN
    && Math.abs(reference.equilibrium.momentResidualNmm) <= numerical.momentResidualToleranceNmm
    && Math.abs(candidate.equilibrium.momentResidualNmm) <= numerical.momentResidualToleranceNmm
    && equilibriumComparison.momentResidualDifferenceNmm <= numerical.momentResidualToleranceNmm;
  const complementarityPass = candidate.complementarity !== null
    && reference.complementarity.complementarityResidualNM <= numerical.complementarityToleranceNM
    && candidate.complementarity.complementarityResidualNM <= numerical.complementarityToleranceNM
    && complementarityComparison.residualDifferenceNM <= numerical.complementarityToleranceNM;
  if (comparisons.some((row) => !row.passed)) blockers.push(issue('PREPRODUCTION_TL05_SUPPORT_CORRELATION_FAILED', 'correlation'));
  if (!equilibriumPass) blockers.push(issue('PREPRODUCTION_TL05_EQUILIBRIUM_CORRELATION_FAILED', 'correlation'));
  if (!complementarityPass) blockers.push(issue('PREPRODUCTION_TL05_COMPLEMENTARITY_CORRELATION_FAILED', 'correlation'));

  const finalBlockers = uniqueIssues(blockers);
  const qualified = finalBlockers.length === 0;
  const material = {
    schema: PREPRODUCTION_TL05_CORRELATION_SCHEMA,
    qualificationId: text(input.qualificationId, 'qualificationId'),
    scenarioClass: reference.scenarioClass,
    status: qualified ? 'QUALIFIED_TL05_CORRELATION' : 'BLOCKED_TL05_CORRELATION',
    qualifiedApplicabilityClass: qualified ? candidate.applicabilityClass : null,
    datasetId: candidate.datasetId,
    loadCaseId: candidate.loadCaseId,
    candidateSemanticHash: candidate.semanticHash,
    referenceSemanticHash: reference.semanticHash,
    numericalAuthoritySemanticHash: numerical.semanticHash,
    intakeSemanticHash: candidate.intakeSemanticHash,
    comparisons,
    equilibriumComparison: deepFreeze(equilibriumComparison),
    complementarityComparison: deepFreeze(complementarityComparison),
    summary: {
      supportCount: comparisons.length,
      stateMatchCount: comparisons.filter((row) => row.stateMatch).length,
      reactionPassCount: comparisons.filter((row) => row.reactionPass).length,
      gapPassCount: comparisons.filter((row) => row.gapPass).length,
      maxReactionAbsoluteDifferenceN: maxFinite(comparisons.map((row) => row.reactionAbsoluteDifferenceN)),
      maxGapAbsoluteDifferenceM: maxFinite(comparisons.map((row) => row.gapAbsoluteDifferenceM)),
      equilibriumPass,
      complementarityPass,
      blockerCount: finalBlockers.length,
    },
    blockers: finalBlockers,
    policy: {
      productionCalculationConsumptionEnabled: false,
      productionMethodRegistrationPermitted: false,
      defaultUiExposurePermitted: false,
      sealExportEligibilityPermitted: false,
      finalHotReactionPublicationPermitted: false,
      correlationEstablishesProductionAccuracy: false,
      qualifiedApplicabilityOnly: qualified,
    },
  };
  return requirePreproductionThermalLiftoffBenchmarkCorrelation(freezeHash(material));
}

export function requirePreproductionThermalLiftoffBenchmarkCorrelation(value) {
  if (value?.schema !== PREPRODUCTION_TL05_CORRELATION_SCHEMA) throw coded('PREPRODUCTION_TL05_CORRELATION_SCHEMA_INVALID');
  const { semanticHash: actual, ...material } = value;
  if (actual !== semanticHash(material)) throw coded('PREPRODUCTION_TL05_CORRELATION_HASH_MISMATCH');
  if (!TL05_REQUIRED_SCENARIOS.includes(value.scenarioClass)) throw coded('PREPRODUCTION_TL05_SCENARIO_INVALID');
  const qualified = value.status === 'QUALIFIED_TL05_CORRELATION';
  if (!qualified && value.status !== 'BLOCKED_TL05_CORRELATION') throw coded('PREPRODUCTION_TL05_CORRELATION_STATUS_INVALID');
  if (!Array.isArray(value.comparisons) || !Array.isArray(value.blockers)) throw coded('PREPRODUCTION_TL05_CORRELATION_ARRAY_INVALID');
  value.comparisons.forEach((row) => {
    const { semanticHash: rowHash, ...rowMaterial } = row;
    if (rowHash !== semanticHash(rowMaterial)) throw coded('PREPRODUCTION_TL05_COMPARISON_HASH_MISMATCH');
  });
  const p = value.policy || {};
  if (p.productionCalculationConsumptionEnabled !== false
      || p.productionMethodRegistrationPermitted !== false
      || p.defaultUiExposurePermitted !== false
      || p.sealExportEligibilityPermitted !== false
      || p.finalHotReactionPublicationPermitted !== false
      || p.correlationEstablishesProductionAccuracy !== false
      || p.qualifiedApplicabilityOnly !== qualified) {
    throw coded('PREPRODUCTION_TL05_CORRELATION_POLICY_INVALID');
  }
  return deepFreeze(structuredClone(value));
}

export function buildPreproductionThermalLiftoffBenchmarkProgramme(input) {
  exact(input, ['programmeId', 'correlations'], 'TL-05 benchmark programme input');
  if (!Array.isArray(input.correlations)) throw new TypeError('correlations must be an array.');
  const correlations = input.correlations.map(requirePreproductionThermalLiftoffBenchmarkCorrelation)
    .sort((a, b) => ascii(a.scenarioClass, b.scenarioClass));
  const blockers = [];
  const byScenario = new Map();
  for (const correlation of correlations) {
    if (byScenario.has(correlation.scenarioClass)) blockers.push(issue('PREPRODUCTION_TL05_SCENARIO_DUPLICATE', correlation.scenarioClass));
    byScenario.set(correlation.scenarioClass, correlation);
    if (correlation.status !== 'QUALIFIED_TL05_CORRELATION') blockers.push(issue('PREPRODUCTION_TL05_SCENARIO_NOT_QUALIFIED', correlation.scenarioClass));
  }
  for (const scenario of TL05_REQUIRED_SCENARIOS) {
    if (!byScenario.has(scenario)) blockers.push(issue('PREPRODUCTION_TL05_REQUIRED_SCENARIO_MISSING', scenario));
  }
  const applicability = new Set(correlations.map((row) => row.qualifiedApplicabilityClass).filter(Boolean));
  if (applicability.size !== 1) blockers.push(issue('PREPRODUCTION_TL05_APPLICABILITY_INCONSISTENT', 'programme'));
  const finalBlockers = uniqueIssues(blockers);
  const qualified = finalBlockers.length === 0;
  return requirePreproductionThermalLiftoffBenchmarkProgramme(freezeHash({
    schema: PREPRODUCTION_TL05_PROGRAMME_SCHEMA,
    programmeId: text(input.programmeId, 'programmeId'),
    status: qualified ? 'QUALIFIED_TL05_BENCHMARK_PROGRAMME' : 'BLOCKED_TL05_BENCHMARK_PROGRAMME',
    qualifiedApplicabilityClass: qualified ? [...applicability][0] : null,
    requiredScenarioClasses: [...TL05_REQUIRED_SCENARIOS],
    correlationSemanticHashes: correlations.map((row) => row.semanticHash),
    correlations,
    blockers: finalBlockers,
    summary: {
      requiredScenarioCount: TL05_REQUIRED_SCENARIOS.length,
      suppliedScenarioCount: correlations.length,
      qualifiedScenarioCount: correlations.filter((row) => row.status === 'QUALIFIED_TL05_CORRELATION').length,
      blockerCount: finalBlockers.length,
    },
    policy: {
      productionCalculationConsumptionEnabled: false,
      productionMethodRegistrationPermitted: false,
      defaultUiExposurePermitted: false,
      sealExportEligibilityPermitted: false,
      finalHotReactionPublicationPermitted: false,
      productionCutoverPermitted: false,
      optInIntegrationEvidenceOnly: qualified,
    },
  }));
}

export function requirePreproductionThermalLiftoffBenchmarkProgramme(value) {
  if (value?.schema !== PREPRODUCTION_TL05_PROGRAMME_SCHEMA) throw coded('PREPRODUCTION_TL05_PROGRAMME_SCHEMA_INVALID');
  const { semanticHash: actual, ...material } = value;
  if (actual !== semanticHash(material)) throw coded('PREPRODUCTION_TL05_PROGRAMME_HASH_MISMATCH');
  if (!Array.isArray(value.correlations) || !Array.isArray(value.blockers)) throw coded('PREPRODUCTION_TL05_PROGRAMME_ARRAY_INVALID');
  value.correlations.forEach(requirePreproductionThermalLiftoffBenchmarkCorrelation);
  const qualified = value.status === 'QUALIFIED_TL05_BENCHMARK_PROGRAMME';
  if (!qualified && value.status !== 'BLOCKED_TL05_BENCHMARK_PROGRAMME') throw coded('PREPRODUCTION_TL05_PROGRAMME_STATUS_INVALID');
  const p = value.policy || {};
  if (p.productionCalculationConsumptionEnabled !== false
      || p.productionMethodRegistrationPermitted !== false
      || p.defaultUiExposurePermitted !== false
      || p.sealExportEligibilityPermitted !== false
      || p.finalHotReactionPublicationPermitted !== false
      || p.productionCutoverPermitted !== false
      || p.optInIntegrationEvidenceOnly !== qualified) {
    throw coded('PREPRODUCTION_TL05_PROGRAMME_POLICY_INVALID');
  }
  return deepFreeze(structuredClone(value));
}

function referenceSupport(value, label) {
  exact(value, ['supportSiteId', 'state', 'reactionN', 'gapM'], label);
  return deepFreeze({
    supportSiteId: text(value.supportSiteId, 'supportSiteId'),
    state: member(value.state, ['ACTIVE', 'LIFTED'], 'state'),
    reactionN: finite(value.reactionN, 'reactionN'),
    gapM: finite(value.gapM, 'gapM'),
  });
}
function referenceEquilibrium(value) {
  exact(value, ['forceResidualN', 'momentResidualNmm'], 'reference equilibrium');
  return deepFreeze({ forceResidualN: finite(value.forceResidualN, 'forceResidualN'), momentResidualNmm: finite(value.momentResidualNmm, 'momentResidualNmm') });
}
function referenceComplementarity(value) {
  exact(value, ['complementarityResidualNM'], 'reference complementarity');
  return deepFreeze({ complementarityResidualNM: nonnegative(value.complementarityResidualNM, 'complementarityResidualNM') });
}
function relativeDifference(actual, expected) {
  if (expected === 0) return actual === 0 ? 0 : null;
  return Math.abs(actual - expected) / Math.abs(expected);
}
function maxFinite(values) {
  const finiteValues = values.filter(Number.isFinite);
  return finiteValues.length ? Math.max(...finiteValues) : null;
}
function sourceIdentity(value, label) {
  exact(value, ['sourceId', 'sourceRevision', 'sourceSemanticHash', 'sourceKind'], label);
  return deepFreeze({ sourceId: text(value.sourceId, 'sourceId'), sourceRevision: text(value.sourceRevision, 'sourceRevision'), sourceSemanticHash: hash(value.sourceSemanticHash, 'sourceSemanticHash'), sourceKind: text(value.sourceKind, 'sourceKind') });
}
function benchmark(value) {
  exact(value, ['benchmarkId', 'benchmarkRevision', 'benchmarkSemanticHash'], 'benchmark');
  return deepFreeze({ benchmarkId: text(value.benchmarkId, 'benchmarkId'), benchmarkRevision: text(value.benchmarkRevision, 'benchmarkRevision'), benchmarkSemanticHash: hash(value.benchmarkSemanticHash, 'benchmarkSemanticHash') });
}
function order(value) {
  if (!Array.isArray(value) || value.length === 0) throw new TypeError('ordering must be non-empty.');
  const result = value.map((item) => text(item, 'supportSiteId'));
  if (new Set(result).size !== result.length) throw new TypeError('ordering must be unique.');
  return deepFreeze(result);
}
function freezeHash(material) { return deepFreeze({ ...material, semanticHash: semanticHash(material) }); }
function issue(code, scope) { return deepFreeze({ code, severity: 'ERROR', scope, message: code, details: null }); }
function uniqueIssues(values) { const map = new Map(); for (const value of values) map.set(`${value.code}|${value.scope}`, value); return [...map.values()].sort((a, b) => ascii(`${a.code}|${a.scope}`, `${b.code}|${b.scope}`)); }
function exact(value, keys, label) { if (!isPlainRecord(value) || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) throw new TypeError(`${label} contains unexpected or missing keys.`); }
function text(value, label) { const s = stringValue(value); if (!s) throw new TypeError(`${label} must be non-empty.`); return s; }
function hash(value, label) { if (typeof value !== 'string' || !/^fnv1a64:[0-9a-f]{16}$/u.test(value)) throw new TypeError(`${label} must be an FNV hash.`); return value; }
function finite(value, label) { if (!Number.isFinite(value)) throw new TypeError(`${label} must be finite.`); return value; }
function nonnegative(value, label) { const n = finite(value, label); if (n < 0) throw new TypeError(`${label} must be non-negative.`); return n; }
function member(value, allowed, label) { if (!allowed.includes(value)) throw new TypeError(`${label} is unsupported.`); return value; }
function ascii(a, b) { return String(a).localeCompare(String(b), 'en', { numeric: false, sensitivity: 'variant' }); }
function coded(code) { const error = new Error(code); error.code = code; return error; }
