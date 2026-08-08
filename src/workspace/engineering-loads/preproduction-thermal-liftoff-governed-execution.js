import { semanticHash } from '../../core/shared-piping-model/canonical-json.js';
import { deepFreeze, isPlainRecord, stringValue } from '../../core/shared-piping-model/immutable.js';
import { requirePreproductionThermalLiftoffActiveSetIntake } from './preproduction-thermal-liftoff-active-set-authority.js';
import {
  assessPreproductionThermalLiftoffActiveSetCurrentness,
  requirePreproductionThermalLiftoffActiveSet,
} from './preproduction-thermal-liftoff-active-set.js';
import {
  PREPRODUCTION_TL05_CORRELATION_CLASS,
  requirePreproductionThermalLiftoffCorrelationAcceptance,
} from './preproduction-thermal-liftoff-correlation-authority.js';
import {
  assessPreproductionThermalLiftoffCorrelationCurrentness,
  correlatePreproductionThermalLiftoffBenchmarkProgramme,
  requirePreproductionThermalLiftoffCorrelation,
} from './preproduction-thermal-liftoff-correlation.js';

export const PREPRODUCTION_TL06_REQUEST_SCHEMA =
  'engineering-preproduction-thermal-liftoff-governed-request/v1';
export const PREPRODUCTION_TL06_EXECUTION_SCHEMA =
  'engineering-preproduction-thermal-liftoff-governed-execution/v1';
export const PREPRODUCTION_TL06_CURRENTNESS_SCHEMA =
  'engineering-preproduction-thermal-liftoff-governed-currentness/v1';

const TL06_APPLICABILITY_CLASS = 'TL-B_REDUCED_FLEXIBILITY_SINGLE_ROUTE_V1';
const TL05_ACCURACY_DISPOSITION = 'CONTROLLED_REDUCED_MODEL_CORRELATION_ONLY_NO_GENERAL_PERCENT_ACCURACY';
const OPT_IN_SOURCE_KINDS = new Set(['APPROVED_ENGINEERING_DATA', 'OWNER_APPROVED_PREPRODUCTION']);

export function createPreproductionThermalLiftoffGovernedRequest(input) {
  exactKeys(input, [
    'requestId', 'requestedAt', 'integrationMode', 'expectedApplicabilityClass',
    'optInAuthority', 'qualification',
  ], 'TL-06 governed request input');
  const authority = sourceIdentity(input.optInAuthority, 'optInAuthority');
  const blockers = [];
  if (input.integrationMode !== 'PREPRODUCTION_EXPLICIT_OPT_IN') {
    blockers.push(issue('PREPRODUCTION_TL06_INTEGRATION_MODE_NOT_OPT_IN', 'request'));
  }
  if (input.expectedApplicabilityClass !== TL06_APPLICABILITY_CLASS) {
    blockers.push(issue('PREPRODUCTION_TL06_APPLICABILITY_NOT_QUALIFIED', 'request'));
  }
  if (input.qualification !== 'QUALIFIED' || !OPT_IN_SOURCE_KINDS.has(authority.sourceKind)) {
    blockers.push(issue('PREPRODUCTION_TL06_OPT_IN_AUTHORITY_UNQUALIFIED', 'request'));
  }
  const finalBlockers = uniqueIssues(blockers);
  const material = {
    schema: PREPRODUCTION_TL06_REQUEST_SCHEMA,
    requestId: text(input.requestId, 'requestId'),
    requestedAt: timestamp(input.requestedAt, 'requestedAt'),
    integrationMode: input.integrationMode,
    expectedApplicabilityClass: text(input.expectedApplicabilityClass, 'expectedApplicabilityClass'),
    optInAuthority: authority,
    qualification: finalBlockers.length ? 'UNRESOLVED' : 'QUALIFIED',
    blockers: finalBlockers,
    policy: {
      explicitOptInRequired: true,
      defaultEnablementPermitted: false,
      productionMethodRegistrationPermitted: false,
      defaultUiExposurePermitted: false,
      sealExportEligibilityPermitted: false,
      productionCutoverPermitted: false,
    },
  };
  return requirePreproductionThermalLiftoffGovernedRequest(freezeHash(material));
}

export function requirePreproductionThermalLiftoffGovernedRequest(value) {
  exactKeys(value, [
    'schema', 'requestId', 'requestedAt', 'integrationMode', 'expectedApplicabilityClass',
    'optInAuthority', 'qualification', 'blockers', 'policy', 'semanticHash',
  ], 'TL-06 governed request');
  if (value.schema !== PREPRODUCTION_TL06_REQUEST_SCHEMA) throw coded('PREPRODUCTION_TL06_REQUEST_SCHEMA_INVALID');
  text(value.requestId, 'requestId');
  timestamp(value.requestedAt, 'requestedAt');
  text(value.expectedApplicabilityClass, 'expectedApplicabilityClass');
  const authority = sourceIdentity(value.optInAuthority, 'optInAuthority');
  if (!Array.isArray(value.blockers) || !['QUALIFIED', 'UNRESOLVED'].includes(value.qualification)) {
    throw coded('PREPRODUCTION_TL06_REQUEST_QUALIFICATION_INVALID');
  }
  const expectedBlockers = [];
  if (value.integrationMode !== 'PREPRODUCTION_EXPLICIT_OPT_IN') {
    expectedBlockers.push('PREPRODUCTION_TL06_INTEGRATION_MODE_NOT_OPT_IN');
  }
  if (value.expectedApplicabilityClass !== TL06_APPLICABILITY_CLASS) {
    expectedBlockers.push('PREPRODUCTION_TL06_APPLICABILITY_NOT_QUALIFIED');
  }
  if (!OPT_IN_SOURCE_KINDS.has(authority.sourceKind)) {
    expectedBlockers.push('PREPRODUCTION_TL06_OPT_IN_AUTHORITY_UNQUALIFIED');
  }
  const observedBlockers = value.blockers.map(requireIssue).sort(ascii);
  if (JSON.stringify(observedBlockers) !== JSON.stringify([...new Set(expectedBlockers)].sort(ascii))) {
    throw coded('PREPRODUCTION_TL06_REQUEST_BLOCKER_MISMATCH');
  }
  const shouldQualify = expectedBlockers.length === 0;
  if ((value.qualification === 'QUALIFIED') !== shouldQualify) {
    throw coded('PREPRODUCTION_TL06_REQUEST_QUALIFICATION_CONTRADICTION');
  }
  const p = value.policy || {};
  if (p.explicitOptInRequired !== true
      || p.defaultEnablementPermitted !== false
      || p.productionMethodRegistrationPermitted !== false
      || p.defaultUiExposurePermitted !== false
      || p.sealExportEligibilityPermitted !== false
      || p.productionCutoverPermitted !== false) {
    throw coded('PREPRODUCTION_TL06_REQUEST_POLICY_INVALID');
  }
  verifySemanticHash(value, 'PREPRODUCTION_TL06_REQUEST_HASH_MISMATCH');
  return deepFreeze(structuredClone(value));
}

export function calculatePreproductionThermalLiftoffGovernedExecution(input) {
  exactKeys(input, [
    'executionId', 'executedAt', 'request', 'activeSetIntake', 'activeSetResult',
    'correlation', 'correlationCases', 'correlationAcceptance',
  ], 'TL-06 governed execution input');
  const request = requirePreproductionThermalLiftoffGovernedRequest(input.request);
  const intake = requirePreproductionThermalLiftoffActiveSetIntake(input.activeSetIntake);
  const result = requirePreproductionThermalLiftoffActiveSet(input.activeSetResult);
  if (request.qualification !== 'QUALIFIED') throw coded('PREPRODUCTION_TL06_REQUEST_NOT_QUALIFIED');
  if (intake.status !== 'READY_FOR_TL04_ACTIVE_SET') throw coded('PREPRODUCTION_TL06_TL04_INTAKE_NOT_READY');
  if (result.status !== 'CONVERGED_PREPRODUCTION_SCREEN') throw coded('PREPRODUCTION_TL06_TL04_RESULT_NOT_CONVERGED');
  const tl04Currentness = assessPreproductionThermalLiftoffActiveSetCurrentness(result, intake);
  if (tl04Currentness.status !== 'CURRENT') throw coded('PREPRODUCTION_TL06_TL04_RESULT_STALE');

  const correlationEvidence = verifyCorrelationEvidence({
    correlation: input.correlation,
    cases: input.correlationCases,
    acceptance: input.correlationAcceptance,
  });
  if (request.expectedApplicabilityClass !== result.applicabilityClass
      || result.applicabilityClass !== correlationEvidence.correlation.applicabilityClass
      || result.applicabilityClass !== TL06_APPLICABILITY_CLASS) {
    throw coded('PREPRODUCTION_TL06_APPLICABILITY_MISMATCH');
  }

  const supportResults = result.supportResults.map((row) => freezeHash({
    supportSiteId: row.supportSiteId,
    routeChainageMm: row.routeChainageMm,
    screenedContactState: row.state,
    screenedReactionN: row.solvedTotalReactionN,
    screenedGapM: row.solvedHotGapM,
    coldGravityReactionN: row.coldGravityReactionN,
    sourceTl04SupportSemanticHash: row.semanticHash,
  }));
  const material = {
    schema: PREPRODUCTION_TL06_EXECUTION_SCHEMA,
    executionId: text(input.executionId, 'executionId'),
    executedAt: timestamp(input.executedAt, 'executedAt'),
    method: 'THERMAL_LIFTOFF_ACTIVE_SET_V1',
    stage: 'TL06_GOVERNED_OPT_IN_INTEGRATION',
    finality: 'PREPRODUCTION_GOVERNED_SCREEN_RECEIPT_ONLY',
    status: 'CALCULATED_PREPRODUCTION_GOVERNED_SCREEN',
    applicabilityClass: result.applicabilityClass,
    correlationClass: correlationEvidence.correlation.correlationClass,
    accuracyDisposition: correlationEvidence.correlation.accuracyDisposition,
    datasetId: result.datasetId,
    loadCaseId: result.loadCaseId,
    requestSemanticHash: request.semanticHash,
    sourceBindings: {
      activeSetIntakeSemanticHash: intake.semanticHash,
      activeSetResultSemanticHash: result.semanticHash,
      correlationSemanticHash: correlationEvidence.correlation.semanticHash,
      correlationAcceptanceSemanticHash: correlationEvidence.acceptance.semanticHash,
      correlationEvidenceSetSemanticHash: correlationEvidence.evidenceSetSemanticHash,
    },
    supportResults,
    summary: summarizeSupportResults(supportResults),
    policy: {
      explicitOptInRequired: true,
      governedProductionIntegrationContractQualified: true,
      productionCalculationConsumptionEnabled: false,
      productionMethodRegistrationPermitted: false,
      defaultUiExposurePermitted: false,
      sealExportEligibilityPermitted: false,
      productionCutoverPermitted: false,
      defaultCutoverPerformed: false,
      productionFinalReactionCalculated: false,
      finalHotReactionPublicationPermitted: false,
      presenterMayExposeGovernedScreenOnly: true,
      generalAccuracyClaimPermitted: false,
      outputFittingPermitted: false,
    },
  };
  return requirePreproductionThermalLiftoffGovernedExecution(freezeHash(material));
}

export function requirePreproductionThermalLiftoffGovernedExecution(value) {
  exactKeys(value, [
    'schema', 'executionId', 'executedAt', 'method', 'stage', 'finality', 'status',
    'applicabilityClass', 'correlationClass', 'accuracyDisposition', 'datasetId', 'loadCaseId',
    'requestSemanticHash', 'sourceBindings', 'supportResults', 'summary', 'policy', 'semanticHash',
  ], 'TL-06 governed execution');
  if (value.schema !== PREPRODUCTION_TL06_EXECUTION_SCHEMA
      || value.method !== 'THERMAL_LIFTOFF_ACTIVE_SET_V1'
      || value.stage !== 'TL06_GOVERNED_OPT_IN_INTEGRATION'
      || value.finality !== 'PREPRODUCTION_GOVERNED_SCREEN_RECEIPT_ONLY'
      || value.status !== 'CALCULATED_PREPRODUCTION_GOVERNED_SCREEN'
      || value.applicabilityClass !== TL06_APPLICABILITY_CLASS
      || value.correlationClass !== PREPRODUCTION_TL05_CORRELATION_CLASS
      || value.accuracyDisposition !== TL05_ACCURACY_DISPOSITION) {
    throw coded('PREPRODUCTION_TL06_EXECUTION_IDENTITY_INVALID');
  }
  text(value.executionId, 'executionId');
  timestamp(value.executedAt, 'executedAt');
  text(value.datasetId, 'datasetId');
  text(value.loadCaseId, 'loadCaseId');
  hash(value.requestSemanticHash, 'requestSemanticHash');
  exactKeys(value.sourceBindings, [
    'activeSetIntakeSemanticHash', 'activeSetResultSemanticHash', 'correlationSemanticHash',
    'correlationAcceptanceSemanticHash', 'correlationEvidenceSetSemanticHash',
  ], 'TL-06 source bindings');
  Object.values(value.sourceBindings).forEach((entry) => hash(entry, 'sourceBinding'));
  if (!Array.isArray(value.supportResults) || value.supportResults.length === 0) {
    throw coded('PREPRODUCTION_TL06_SUPPORT_RESULTS_INVALID');
  }
  value.supportResults.forEach(requireSupportResult);
  const expectedSummary = summarizeSupportResults(value.supportResults);
  if (semanticHash(expectedSummary) !== semanticHash(value.summary)) {
    throw coded('PREPRODUCTION_TL06_SUMMARY_INVALID');
  }
  const p = value.policy || {};
  if (p.explicitOptInRequired !== true
      || p.governedProductionIntegrationContractQualified !== true
      || p.productionCalculationConsumptionEnabled !== false
      || p.productionMethodRegistrationPermitted !== false
      || p.defaultUiExposurePermitted !== false
      || p.sealExportEligibilityPermitted !== false
      || p.productionCutoverPermitted !== false
      || p.defaultCutoverPerformed !== false
      || p.productionFinalReactionCalculated !== false
      || p.finalHotReactionPublicationPermitted !== false
      || p.presenterMayExposeGovernedScreenOnly !== true
      || p.generalAccuracyClaimPermitted !== false
      || p.outputFittingPermitted !== false) {
    throw coded('PREPRODUCTION_TL06_EXECUTION_POLICY_INVALID');
  }
  verifySemanticHash(value, 'PREPRODUCTION_TL06_EXECUTION_HASH_MISMATCH');
  return deepFreeze(structuredClone(value));
}

export function assessPreproductionThermalLiftoffGovernedCurrentness(input) {
  exactKeys(input, [
    'receipt', 'request', 'activeSetIntake', 'activeSetResult',
    'correlation', 'correlationCases', 'correlationAcceptance',
  ], 'TL-06 currentness input');
  const receipt = requirePreproductionThermalLiftoffGovernedExecution(input.receipt);
  let rebuilt = null;
  let rebuildErrorCode = null;
  try {
    rebuilt = calculatePreproductionThermalLiftoffGovernedExecution({
      executionId: receipt.executionId,
      executedAt: receipt.executedAt,
      request: input.request,
      activeSetIntake: input.activeSetIntake,
      activeSetResult: input.activeSetResult,
      correlation: input.correlation,
      correlationCases: input.correlationCases,
      correlationAcceptance: input.correlationAcceptance,
    });
  } catch (error) {
    rebuildErrorCode = error?.code || 'PREPRODUCTION_TL06_CURRENTNESS_REBUILD_FAILED';
  }
  const differences = [];
  if (!rebuilt) differences.push(rebuildErrorCode);
  else if (rebuilt.semanticHash !== receipt.semanticHash) differences.push('receiptSemanticHash');
  return requirePreproductionThermalLiftoffGovernedCurrentness(freezeHash({
    schema: PREPRODUCTION_TL06_CURRENTNESS_SCHEMA,
    receiptSemanticHash: receipt.semanticHash,
    observedReceiptSemanticHash: rebuilt?.semanticHash || null,
    status: differences.length ? 'STALE_SUPPRESSED' : 'CURRENT',
    differences: [...new Set(differences)].sort(ascii),
    policy: {
      staleResultPresentationPermitted: false,
      staleNumericalRowsPermitted: false,
      productionCalculationConsumptionEnabled: false,
      finalHotReactionPublicationPermitted: false,
    },
  }));
}

export function requirePreproductionThermalLiftoffGovernedCurrentness(value) {
  exactKeys(value, [
    'schema', 'receiptSemanticHash', 'observedReceiptSemanticHash', 'status',
    'differences', 'policy', 'semanticHash',
  ], 'TL-06 currentness');
  if (value.schema !== PREPRODUCTION_TL06_CURRENTNESS_SCHEMA
      || !['CURRENT', 'STALE_SUPPRESSED'].includes(value.status)) {
    throw coded('PREPRODUCTION_TL06_CURRENTNESS_IDENTITY_INVALID');
  }
  hash(value.receiptSemanticHash, 'receiptSemanticHash');
  if (value.observedReceiptSemanticHash !== null) hash(value.observedReceiptSemanticHash, 'observedReceiptSemanticHash');
  if (!Array.isArray(value.differences)) throw coded('PREPRODUCTION_TL06_CURRENTNESS_DIFFERENCES_INVALID');
  if ((value.status === 'CURRENT') !== (value.differences.length === 0)) {
    throw coded('PREPRODUCTION_TL06_CURRENTNESS_STATUS_MISMATCH');
  }
  const p = value.policy || {};
  if (p.staleResultPresentationPermitted !== false
      || p.staleNumericalRowsPermitted !== false
      || p.productionCalculationConsumptionEnabled !== false
      || p.finalHotReactionPublicationPermitted !== false) {
    throw coded('PREPRODUCTION_TL06_CURRENTNESS_POLICY_INVALID');
  }
  verifySemanticHash(value, 'PREPRODUCTION_TL06_CURRENTNESS_HASH_MISMATCH');
  return deepFreeze(structuredClone(value));
}

function verifyCorrelationEvidence({ correlation: correlationValue, cases, acceptance: acceptanceValue }) {
  const correlation = requirePreproductionThermalLiftoffCorrelation(correlationValue);
  const acceptance = requirePreproductionThermalLiftoffCorrelationAcceptance(acceptanceValue);
  if (correlation.status !== 'QUALIFIED_PREPRODUCTION_CORRELATION'
      || correlation.correlationClass !== PREPRODUCTION_TL05_CORRELATION_CLASS
      || correlation.accuracyDisposition !== TL05_ACCURACY_DISPOSITION
      || correlation.policy.generalAccuracyClaimPermitted !== false
      || correlation.policy.outputFittingPermitted !== false
      || correlation.policy.tl06ProductionIntegrationAutomaticallyPermitted !== false) {
    throw coded('PREPRODUCTION_TL06_TL05_CORRELATION_NOT_QUALIFIED');
  }
  if (!Array.isArray(cases) || cases.length === 0) throw coded('PREPRODUCTION_TL06_TL05_CASE_EVIDENCE_MISSING');
  const currentness = assessPreproductionThermalLiftoffCorrelationCurrentness(correlation, { cases, acceptance });
  if (currentness.status !== 'CURRENT') throw coded('PREPRODUCTION_TL06_TL05_CORRELATION_STALE');
  const replay = correlatePreproductionThermalLiftoffBenchmarkProgramme({
    programmeId: correlation.programmeId,
    executedAt: correlation.executedAt,
    cases,
    acceptance,
  });
  if (replay.semanticHash !== correlation.semanticHash) {
    throw coded('PREPRODUCTION_TL06_TL05_REPLAY_MISMATCH');
  }
  const evidenceSetSemanticHash = semanticHash({
    acceptanceSemanticHash: acceptance.semanticHash,
    caseBindings: correlation.caseResults.map((row) => ({
      benchmarkCaseId: row.benchmarkCaseId,
      intakeSemanticHash: row.intakeSemanticHash,
      candidateSemanticHash: row.candidateSemanticHash,
      referenceSemanticHash: row.referenceSemanticHash,
      problemSemanticHash: row.problemSemanticHash,
    })),
  });
  return { correlation, acceptance, currentness, replay, evidenceSetSemanticHash };
}

function requireSupportResult(value) {
  exactKeys(value, [
    'supportSiteId', 'routeChainageMm', 'screenedContactState', 'screenedReactionN',
    'screenedGapM', 'coldGravityReactionN', 'sourceTl04SupportSemanticHash', 'semanticHash',
  ], 'TL-06 support result');
  text(value.supportSiteId, 'supportSiteId');
  finite(value.routeChainageMm, 'routeChainageMm');
  if (!['ACTIVE', 'LIFTED'].includes(value.screenedContactState)) throw coded('PREPRODUCTION_TL06_SUPPORT_STATE_INVALID');
  finite(value.screenedReactionN, 'screenedReactionN');
  finite(value.screenedGapM, 'screenedGapM');
  nonnegative(value.coldGravityReactionN, 'coldGravityReactionN');
  hash(value.sourceTl04SupportSemanticHash, 'sourceTl04SupportSemanticHash');
  if (value.screenedContactState === 'LIFTED' && value.screenedReactionN !== 0) {
    throw coded('PREPRODUCTION_TL06_LIFTED_REACTION_NONZERO');
  }
  verifySemanticHash(value, 'PREPRODUCTION_TL06_SUPPORT_RESULT_HASH_MISMATCH');
}

function summarizeSupportResults(rows) {
  return {
    supportCount: rows.length,
    activeSupportCount: rows.filter((row) => row.screenedContactState === 'ACTIVE').length,
    liftedSupportCount: rows.filter((row) => row.screenedContactState === 'LIFTED').length,
  };
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
function requireIssue(value) {
  exactKeys(value, ['code', 'severity', 'scope', 'message', 'details'], 'TL-06 blocker');
  if (value.severity !== 'ERROR' || value.message !== value.code || value.details !== null) {
    throw coded('PREPRODUCTION_TL06_BLOCKER_INVALID');
  }
  text(value.code, 'blocker.code');
  text(value.scope, 'blocker.scope');
  return value.code;
}
function issue(code, scope) { return deepFreeze({ code, severity: 'ERROR', scope, message: code, details: null }); }
function uniqueIssues(values) { const map = new Map(); for (const row of values) map.set(`${row.code}|${row.scope}`, row); return [...map.values()].sort((a, b) => ascii(`${a.code}|${a.scope}`, `${b.code}|${b.scope}`)); }
function freezeHash(material) { return deepFreeze({ ...material, semanticHash: semanticHash(material) }); }
function verifySemanticHash(value, code) { const { semanticHash: actual, ...material } = value; if (actual !== semanticHash(material)) throw coded(code); }
function exactKeys(value, keys, label) { if (!isPlainRecord(value) || JSON.stringify(Object.keys(value).sort(ascii)) !== JSON.stringify([...keys].sort(ascii))) throw new TypeError(`${label} contains unexpected or missing keys.`); }
function text(value, label) { const result = stringValue(value); if (!result) throw new TypeError(`${label} must be non-empty.`); return result; }
function timestamp(value, label) { const result = text(value, label); if (!Number.isFinite(Date.parse(result))) throw new TypeError(`${label} must be an ISO timestamp.`); return result; }
function hash(value, label) { if (typeof value !== 'string' || !/^fnv1a64:[0-9a-f]{16}$/u.test(value)) throw new TypeError(`${label} must be an FNV-1a semantic hash.`); return value; }
function finite(value, label) { if (!Number.isFinite(value)) throw new TypeError(`${label} must be finite.`); return value; }
function nonnegative(value, label) { const result = finite(value, label); if (result < 0) throw new TypeError(`${label} must be non-negative.`); return result; }
function ascii(left, right) { return String(left) < String(right) ? -1 : String(left) > String(right) ? 1 : 0; }
function coded(code) { const error = new Error(code); error.code = code; return error; }
