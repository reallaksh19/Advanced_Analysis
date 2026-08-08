import { semanticHash } from '../../core/shared-piping-model/canonical-json.js';
import { deepFreeze, isPlainRecord, stringValue } from '../../core/shared-piping-model/immutable.js';
import {
  requirePreproductionThermalLiftoffActiveSetIntake,
} from './preproduction-thermal-liftoff-active-set-authority.js';

export const PREPRODUCTION_TL05_REFERENCE_SCHEMA =
  'engineering-preproduction-thermal-liftoff-correlation-reference/v1';
export const PREPRODUCTION_TL05_ACCEPTANCE_SCHEMA =
  'engineering-preproduction-thermal-liftoff-correlation-acceptance/v1';
export const PREPRODUCTION_TL05_REFERENCE_METHOD =
  'INDEPENDENT_EXHAUSTIVE_COMPLEMENTARITY_ORACLE_V1';
export const PREPRODUCTION_TL05_CORRELATION_CLASS =
  'TL-B_EXHAUSTIVE_ORACLE_CORRELATED_V1';

const REFERENCE_SOURCE_KINDS = new Set([
  'INDEPENDENT_QUALIFICATION_ORACLE',
]);

export function computePreproductionThermalLiftoffCorrelationProblemSemanticHash(intakeValue) {
  const intake = requirePreproductionThermalLiftoffActiveSetIntake(intakeValue);
  if (intake.status !== 'READY_FOR_TL04_ACTIVE_SET') {
    throw coded('PREPRODUCTION_TL05_PROBLEM_INTAKE_NOT_READY');
  }
  return semanticHash(problemMaterial(intake));
}

export function createPreproductionThermalLiftoffCorrelationReference(input) {
  exactKeys(input, [
    'referenceId', 'benchmarkCaseId', 'benchmarkReference', 'source',
    'candidateIntakeSemanticHash', 'problemSemanticHash', 'applicabilityClass',
    'datasetId', 'loadCaseId', 'referenceMethod', 'supportOrdering',
    'supportResults', 'enumeratedStateCount', 'admissibleStateCount',
    'qualification',
  ], 'TL-05 correlation reference input');
  const source = sourceIdentity(input.source, 'TL-05 reference source');
  const benchmarkReference = benchmark(input.benchmarkReference);
  const blockers = [];
  if (input.referenceMethod !== PREPRODUCTION_TL05_REFERENCE_METHOD) {
    blockers.push(issue(
      'PREPRODUCTION_TL05_REFERENCE_METHOD_UNQUALIFIED',
      'reference',
      'TL-05 V1 accepts only the independent exhaustive complementarity oracle.',
    ));
  }
  if (!REFERENCE_SOURCE_KINDS.has(source.sourceKind)) {
    blockers.push(issue(
      'PREPRODUCTION_TL05_REFERENCE_SOURCE_UNQUALIFIED',
      'reference',
      'TL-05 reference source must retain independent qualification-oracle custody.',
    ));
  }
  if (input.qualification !== 'QUALIFIED') {
    blockers.push(issue(
      'PREPRODUCTION_TL05_REFERENCE_NOT_QUALIFIED',
      'reference',
      'TL-05 reference evidence must be explicitly qualified.',
    ));
  }
  const ordering = uniqueTextList(input.supportOrdering, 'supportOrdering');
  const supportResults = normalizeReferenceSupportResults(input.supportResults);
  if (JSON.stringify(supportResults.map((row) => row.supportSiteId)) !== JSON.stringify(ordering)) {
    blockers.push(issue(
      'PREPRODUCTION_TL05_REFERENCE_SUPPORT_ORDER_MISMATCH',
      'reference',
      'Reference support results must follow the exact governed support ordering.',
    ));
  }
  const enumeratedStateCount = positiveInteger(input.enumeratedStateCount, 'enumeratedStateCount');
  const admissibleStateCount = nonnegativeInteger(input.admissibleStateCount, 'admissibleStateCount');
  if (admissibleStateCount !== 1) {
    blockers.push(issue(
      'PREPRODUCTION_TL05_REFERENCE_UNIQUENESS_NOT_PROVEN',
      'reference',
      'Controlled TL-B reference qualification requires exactly one admissible complementarity state.',
      { admissibleStateCount },
    ));
  }
  const finalBlockers = uniqueIssues(blockers);
  const qualified = finalBlockers.length === 0;
  const material = {
    schema: PREPRODUCTION_TL05_REFERENCE_SCHEMA,
    referenceId: text(input.referenceId, 'referenceId'),
    benchmarkCaseId: text(input.benchmarkCaseId, 'benchmarkCaseId'),
    benchmarkReference,
    source,
    candidateIntakeSemanticHash: hash(input.candidateIntakeSemanticHash, 'candidateIntakeSemanticHash'),
    problemSemanticHash: hash(input.problemSemanticHash, 'problemSemanticHash'),
    applicabilityClass: text(input.applicabilityClass, 'applicabilityClass'),
    datasetId: text(input.datasetId, 'datasetId'),
    loadCaseId: text(input.loadCaseId, 'loadCaseId'),
    referenceMethod: input.referenceMethod,
    supportOrdering: ordering,
    supportResults: qualified ? supportResults : [],
    enumeratedStateCount,
    admissibleStateCount,
    qualification: qualified ? 'QUALIFIED' : 'UNRESOLVED',
    blockers: finalBlockers,
    policy: {
      candidateOutputConsumed: false,
      iterativeActiveSetUsed: false,
      exhaustiveStateEnumerationPerformed: true,
      outputFittingPermitted: false,
      productionCalculationConsumptionEnabled: false,
      productionMethodRegistrationPermitted: false,
      finalHotReactionPublicationPermitted: false,
    },
  };
  return requirePreproductionThermalLiftoffCorrelationReference(freezeHash(material));
}

export function requirePreproductionThermalLiftoffCorrelationReference(value) {
  exactKeys(value, [
    'schema', 'referenceId', 'benchmarkCaseId', 'benchmarkReference', 'source',
    'candidateIntakeSemanticHash', 'problemSemanticHash', 'applicabilityClass',
    'datasetId', 'loadCaseId', 'referenceMethod', 'supportOrdering',
    'supportResults', 'enumeratedStateCount', 'admissibleStateCount',
    'qualification', 'blockers', 'policy', 'semanticHash',
  ], 'TL-05 correlation reference');
  if (value.schema !== PREPRODUCTION_TL05_REFERENCE_SCHEMA
      || value.referenceMethod !== PREPRODUCTION_TL05_REFERENCE_METHOD) {
    throw coded('PREPRODUCTION_TL05_REFERENCE_IDENTITY_INVALID');
  }
  text(value.referenceId, 'referenceId');
  text(value.benchmarkCaseId, 'benchmarkCaseId');
  benchmark(value.benchmarkReference);
  const source = sourceIdentity(value.source, 'TL-05 reference source');
  if (!REFERENCE_SOURCE_KINDS.has(source.sourceKind)) {
    throw coded('PREPRODUCTION_TL05_REFERENCE_SOURCE_INVALID');
  }
  hash(value.candidateIntakeSemanticHash, 'candidateIntakeSemanticHash');
  hash(value.problemSemanticHash, 'problemSemanticHash');
  text(value.applicabilityClass, 'applicabilityClass');
  text(value.datasetId, 'datasetId');
  text(value.loadCaseId, 'loadCaseId');
  const ordering = uniqueTextList(value.supportOrdering, 'supportOrdering');
  if (!Array.isArray(value.supportResults) || !Array.isArray(value.blockers)) {
    throw new TypeError('TL-05 reference arrays are invalid.');
  }
  const enumerated = positiveInteger(value.enumeratedStateCount, 'enumeratedStateCount');
  const admissible = nonnegativeInteger(value.admissibleStateCount, 'admissibleStateCount');
  if (admissible > enumerated) throw coded('PREPRODUCTION_TL05_REFERENCE_STATE_COUNT_INVALID');
  if (!['QUALIFIED', 'UNRESOLVED'].includes(value.qualification)) {
    throw coded('PREPRODUCTION_TL05_REFERENCE_QUALIFICATION_INVALID');
  }
  if (value.qualification === 'QUALIFIED') {
    if (value.blockers.length !== 0 || admissible !== 1 || value.supportResults.length !== ordering.length) {
      throw coded('PREPRODUCTION_TL05_REFERENCE_QUALIFIED_CONTRACT_INVALID');
    }
    const ids = value.supportResults.map(requireReferenceSupportResult);
    if (JSON.stringify(ids) !== JSON.stringify(ordering)) {
      throw coded('PREPRODUCTION_TL05_REFERENCE_SUPPORT_ORDER_INVALID');
    }
  } else if (value.supportResults.length !== 0 || value.blockers.length === 0) {
    throw coded('PREPRODUCTION_TL05_REFERENCE_UNRESOLVED_PARTIAL_INVALID');
  }
  const policy = value.policy || {};
  if (policy.candidateOutputConsumed !== false
      || policy.iterativeActiveSetUsed !== false
      || policy.exhaustiveStateEnumerationPerformed !== true
      || policy.outputFittingPermitted !== false
      || policy.productionCalculationConsumptionEnabled !== false
      || policy.productionMethodRegistrationPermitted !== false
      || policy.finalHotReactionPublicationPermitted !== false) {
    throw coded('PREPRODUCTION_TL05_REFERENCE_POLICY_INVALID');
  }
  const { semanticHash: actual, ...material } = value;
  if (actual !== semanticHash(material)) throw coded('PREPRODUCTION_TL05_REFERENCE_HASH_MISMATCH');
  return deepFreeze(structuredClone(value));
}

export function createPreproductionThermalLiftoffCorrelationAcceptance(input) {
  exactKeys(input, [
    'acceptanceId', 'requiredBenchmarkCaseIds', 'reactionAbsoluteToleranceN',
    'gapAbsoluteToleranceM', 'source', 'benchmarkReference', 'qualification',
  ], 'TL-05 correlation acceptance input');
  const requiredBenchmarkCaseIds = uniqueTextList(
    input.requiredBenchmarkCaseIds,
    'requiredBenchmarkCaseIds',
  ).sort(ascii);
  const source = sourceIdentity(input.source, 'TL-05 acceptance source');
  const benchmarkReference = benchmark(input.benchmarkReference);
  const blockers = [];
  if (input.qualification !== 'QUALIFIED') {
    blockers.push(issue(
      'PREPRODUCTION_TL05_ACCEPTANCE_NOT_QUALIFIED',
      'acceptance',
      'TL-05 correlation acceptance limits require explicit qualification.',
    ));
  }
  if (!['BENCHMARK_QUALIFIED', 'APPROVED_ENGINEERING_DATA'].includes(source.sourceKind)) {
    blockers.push(issue(
      'PREPRODUCTION_TL05_ACCEPTANCE_SOURCE_UNQUALIFIED',
      'acceptance',
      'TL-05 acceptance limits require benchmark-qualified or approved engineering custody.',
    ));
  }
  if (requiredBenchmarkCaseIds.length < 3) {
    blockers.push(issue(
      'PREPRODUCTION_TL05_ACCEPTANCE_CASE_SET_TOO_SMALL',
      'acceptance',
      'TL-05 qualification requires a controlled multi-case benchmark programme.',
    ));
  }
  const finalBlockers = uniqueIssues(blockers);
  const material = {
    schema: PREPRODUCTION_TL05_ACCEPTANCE_SCHEMA,
    acceptanceId: text(input.acceptanceId, 'acceptanceId'),
    requiredBenchmarkCaseIds,
    reactionAbsoluteToleranceN: nonnegative(
      input.reactionAbsoluteToleranceN,
      'reactionAbsoluteToleranceN',
    ),
    gapAbsoluteToleranceM: nonnegative(
      input.gapAbsoluteToleranceM,
      'gapAbsoluteToleranceM',
    ),
    source,
    benchmarkReference,
    qualification: finalBlockers.length ? 'UNRESOLVED' : 'QUALIFIED',
    blockers: finalBlockers,
    policy: {
      defaultTolerancePermitted: false,
      percentageOnlyAcceptancePermitted: false,
      exactSupportStateMatchRequired: true,
      uniqueReferenceStateRequired: true,
      outputFittingPermitted: false,
      productionCalculationConsumptionEnabled: false,
      productionMethodRegistrationPermitted: false,
    },
  };
  return requirePreproductionThermalLiftoffCorrelationAcceptance(freezeHash(material));
}

export function requirePreproductionThermalLiftoffCorrelationAcceptance(value) {
  exactKeys(value, [
    'schema', 'acceptanceId', 'requiredBenchmarkCaseIds',
    'reactionAbsoluteToleranceN', 'gapAbsoluteToleranceM', 'source',
    'benchmarkReference', 'qualification', 'blockers', 'policy', 'semanticHash',
  ], 'TL-05 correlation acceptance');
  if (value.schema !== PREPRODUCTION_TL05_ACCEPTANCE_SCHEMA) {
    throw coded('PREPRODUCTION_TL05_ACCEPTANCE_SCHEMA_INVALID');
  }
  text(value.acceptanceId, 'acceptanceId');
  const caseIds = uniqueTextList(value.requiredBenchmarkCaseIds, 'requiredBenchmarkCaseIds');
  if (JSON.stringify(caseIds) !== JSON.stringify([...caseIds].sort(ascii))) {
    throw coded('PREPRODUCTION_TL05_ACCEPTANCE_CASE_ORDER_INVALID');
  }
  nonnegative(value.reactionAbsoluteToleranceN, 'reactionAbsoluteToleranceN');
  nonnegative(value.gapAbsoluteToleranceM, 'gapAbsoluteToleranceM');
  const source = sourceIdentity(value.source, 'TL-05 acceptance source');
  benchmark(value.benchmarkReference);
  if (!['QUALIFIED', 'UNRESOLVED'].includes(value.qualification)
      || !Array.isArray(value.blockers)) {
    throw coded('PREPRODUCTION_TL05_ACCEPTANCE_QUALIFICATION_INVALID');
  }
  if (value.qualification === 'QUALIFIED') {
    if (value.blockers.length !== 0 || caseIds.length < 3
        || !['BENCHMARK_QUALIFIED', 'APPROVED_ENGINEERING_DATA'].includes(source.sourceKind)) {
      throw coded('PREPRODUCTION_TL05_ACCEPTANCE_QUALIFIED_CONTRACT_INVALID');
    }
  } else if (value.blockers.length === 0) {
    throw coded('PREPRODUCTION_TL05_ACCEPTANCE_UNRESOLVED_BLOCKERS_MISSING');
  }
  const policy = value.policy || {};
  if (policy.defaultTolerancePermitted !== false
      || policy.percentageOnlyAcceptancePermitted !== false
      || policy.exactSupportStateMatchRequired !== true
      || policy.uniqueReferenceStateRequired !== true
      || policy.outputFittingPermitted !== false
      || policy.productionCalculationConsumptionEnabled !== false
      || policy.productionMethodRegistrationPermitted !== false) {
    throw coded('PREPRODUCTION_TL05_ACCEPTANCE_POLICY_INVALID');
  }
  const { semanticHash: actual, ...material } = value;
  if (actual !== semanticHash(material)) throw coded('PREPRODUCTION_TL05_ACCEPTANCE_HASH_MISMATCH');
  return deepFreeze(structuredClone(value));
}

function problemMaterial(intake) {
  return {
    method: intake.method,
    applicabilityClass: intake.applicabilityClass,
    datasetId: intake.datasetId,
    loadCaseId: intake.loadCaseId,
    coldGravityMethod: intake.coldGravityMethod,
    routeId: intake.routeId,
    reactionToleranceN: intake.reactionToleranceN,
    ordering: [...intake.ordering],
    supports: intake.supports.map((row) => ({
      supportSiteId: row.supportSiteId,
      routeChainageMm: row.routeChainageMm,
      coldGravityReactionN: row.coldGravityReactionN,
      coldGapM: row.coldGapM,
      freeOpeningM: row.freeOpeningM,
    })),
    gravityContributions: intake.gravityContributions.map((row) => ({
      contributionId: row.contributionId,
      routeId: row.routeId,
      verticalForceN: row.verticalForceN,
      chainageMm: row.chainageMm,
    })),
    flexibilityMatrixMPerN: intake.flexibilityMatrixMPerN.map((row) => [...row]),
    numericalControls: {
      gapToleranceM: intake.numericalControls.gapToleranceM,
      complementarityToleranceNM: intake.numericalControls.complementarityToleranceNM,
      gravityParityToleranceN: intake.numericalControls.gravityParityToleranceN,
      forceToleranceN: intake.numericalControls.forceToleranceN,
      momentToleranceNmm: intake.numericalControls.momentToleranceNmm,
      matrixPivotToleranceMPerN: intake.numericalControls.matrixPivotToleranceMPerN,
    },
  };
}

function normalizeReferenceSupportResults(value) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new TypeError('supportResults must be a non-empty array.');
  }
  return value.map((row) => {
    exactKeys(row, [
      'supportSiteId', 'state', 'referenceTotalReactionN', 'referenceHotGapM',
    ], 'TL-05 reference support result input');
    const material = {
      supportSiteId: text(row.supportSiteId, 'supportSiteId'),
      state: state(row.state),
      referenceTotalReactionN: finite(row.referenceTotalReactionN, 'referenceTotalReactionN'),
      referenceHotGapM: finite(row.referenceHotGapM, 'referenceHotGapM'),
    };
    if (material.state === 'LIFTED' && material.referenceTotalReactionN !== 0) {
      throw coded('PREPRODUCTION_TL05_REFERENCE_LIFTED_REACTION_NONZERO');
    }
    return freezeHash(material);
  });
}

function requireReferenceSupportResult(value) {
  exactKeys(value, [
    'supportSiteId', 'state', 'referenceTotalReactionN', 'referenceHotGapM',
    'semanticHash',
  ], 'TL-05 reference support result');
  const supportSiteId = text(value.supportSiteId, 'supportSiteId');
  state(value.state);
  finite(value.referenceTotalReactionN, 'referenceTotalReactionN');
  finite(value.referenceHotGapM, 'referenceHotGapM');
  if (value.state === 'LIFTED' && value.referenceTotalReactionN !== 0) {
    throw coded('PREPRODUCTION_TL05_REFERENCE_LIFTED_REACTION_NONZERO');
  }
  const { semanticHash: actual, ...material } = value;
  if (actual !== semanticHash(material)) {
    throw coded('PREPRODUCTION_TL05_REFERENCE_SUPPORT_HASH_MISMATCH');
  }
  return supportSiteId;
}

function state(value) {
  if (!['ACTIVE', 'LIFTED'].includes(value)) {
    throw coded('PREPRODUCTION_TL05_REFERENCE_SUPPORT_STATE_INVALID');
  }
  return value;
}
function sourceIdentity(value, label) {
  exactKeys(value, ['sourceId', 'sourceRevision', 'sourceSemanticHash', 'sourceKind'], label);
  return deepFreeze({
    sourceId: text(value.sourceId, 'sourceId'),
    sourceRevision: text(value.sourceRevision, 'sourceRevision'),
    sourceSemanticHash: hash(value.sourceSemanticHash, 'sourceSemanticHash'),
    sourceKind: text(value.sourceKind, 'sourceKind'),
  });
}
function benchmark(value) {
  exactKeys(value, ['benchmarkId', 'benchmarkRevision', 'benchmarkSemanticHash'], 'benchmarkReference');
  return deepFreeze({
    benchmarkId: text(value.benchmarkId, 'benchmarkId'),
    benchmarkRevision: text(value.benchmarkRevision, 'benchmarkRevision'),
    benchmarkSemanticHash: hash(value.benchmarkSemanticHash, 'benchmarkSemanticHash'),
  });
}
function issue(code, scope, message, details = null) {
  return deepFreeze({ code, severity: 'ERROR', scope, message, details });
}
function uniqueIssues(values) {
  const map = new Map();
  for (const row of values) map.set(`${row.code}|${row.scope}`, row);
  return [...map.values()].sort((a, b) => ascii(`${a.code}|${a.scope}`, `${b.code}|${b.scope}`));
}
function uniqueTextList(value, label) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new TypeError(`${label} must be a non-empty array.`);
  }
  const normalized = value.map((item) => text(item, label));
  if (new Set(normalized).size !== normalized.length) {
    throw coded('PREPRODUCTION_TL05_DUPLICATE_IDENTITY');
  }
  return normalized;
}
function freezeHash(material) {
  return deepFreeze({ ...material, semanticHash: semanticHash(material) });
}
function exactKeys(value, keys, label) {
  if (!isPlainRecord(value)
      || JSON.stringify(Object.keys(value).sort(ascii)) !== JSON.stringify([...keys].sort(ascii))) {
    throw new TypeError(`${label} contains unexpected or missing keys.`);
  }
}
function text(value, label) {
  const result = stringValue(value);
  if (!result) throw new TypeError(`${label} must be non-empty.`);
  return result;
}
function finite(value, label) {
  if (!Number.isFinite(value)) throw new TypeError(`${label} must be finite.`);
  return value;
}
function nonnegative(value, label) {
  const result = finite(value, label);
  if (result < 0) throw new TypeError(`${label} must be non-negative.`);
  return result;
}
function positiveInteger(value, label) {
  if (!Number.isInteger(value) || value <= 0) throw new TypeError(`${label} must be a positive integer.`);
  return value;
}
function nonnegativeInteger(value, label) {
  if (!Number.isInteger(value) || value < 0) throw new TypeError(`${label} must be a non-negative integer.`);
  return value;
}
function hash(value, label) {
  if (typeof value !== 'string' || !/^fnv1a64:[0-9a-f]{16}$/u.test(value)) {
    throw new TypeError(`${label} must be an FNV-1a hash.`);
  }
  return value;
}
function ascii(left, right) {
  return String(left) < String(right) ? -1 : String(left) > String(right) ? 1 : 0;
}
function coded(code, details = null) {
  const error = new Error(code);
  error.code = code;
  error.details = details;
  return error;
}
