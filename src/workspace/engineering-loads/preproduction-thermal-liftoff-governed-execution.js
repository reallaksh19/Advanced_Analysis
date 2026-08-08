import { semanticHash } from '../../core/shared-piping-model/canonical-json.js';
import { deepFreeze, isPlainRecord, stringValue } from '../../core/shared-piping-model/immutable.js';
import { requirePreproductionThermalLiftoffActiveSetIntake } from './preproduction-thermal-liftoff-active-set-authority.js';
import {
  assessPreproductionThermalLiftoffActiveSetCurrentness,
  requirePreproductionThermalLiftoffActiveSet,
} from './preproduction-thermal-liftoff-active-set.js';
import {
  buildPreproductionThermalLiftoffBenchmarkProgramme,
  qualifyPreproductionThermalLiftoffBenchmark,
  requirePreproductionThermalLiftoffBenchmarkProgramme,
} from './preproduction-thermal-liftoff-benchmark-authority.js';

export const PREPRODUCTION_TL06_REQUEST_SCHEMA =
  'engineering-preproduction-thermal-liftoff-governed-request/v1';
export const PREPRODUCTION_TL06_EXECUTION_SCHEMA =
  'engineering-preproduction-thermal-liftoff-governed-execution/v1';
export const PREPRODUCTION_TL06_CURRENTNESS_SCHEMA =
  'engineering-preproduction-thermal-liftoff-governed-currentness/v1';

const OPT_IN_SOURCE_KINDS = new Set(['APPROVED_ENGINEERING_DATA', 'OWNER_APPROVED_PREPRODUCTION']);

export function createPreproductionThermalLiftoffGovernedRequest(input) {
  exact(input, [
    'requestId', 'requestedAt', 'integrationMode', 'expectedApplicabilityClass',
    'optInAuthority', 'qualification',
  ], 'TL-06 governed request');
  const authority = optInAuthority(input.optInAuthority);
  const blockers = [];
  if (input.integrationMode !== 'PREPRODUCTION_EXPLICIT_OPT_IN') {
    blockers.push(issue('PREPRODUCTION_TL06_INTEGRATION_MODE_NOT_OPT_IN', 'request'));
  }
  if (input.qualification !== 'QUALIFIED' || !OPT_IN_SOURCE_KINDS.has(authority.sourceKind)) {
    blockers.push(issue('PREPRODUCTION_TL06_OPT_IN_AUTHORITY_UNQUALIFIED', 'request'));
  }
  return freezeHash({
    schema: PREPRODUCTION_TL06_REQUEST_SCHEMA,
    requestId: text(input.requestId, 'requestId'),
    requestedAt: timestamp(input.requestedAt, 'requestedAt'),
    integrationMode: input.integrationMode,
    expectedApplicabilityClass: text(input.expectedApplicabilityClass, 'expectedApplicabilityClass'),
    optInAuthority: authority,
    qualification: blockers.length ? 'UNRESOLVED' : 'QUALIFIED',
    blockers,
    policy: {
      explicitOptInRequired: true,
      defaultEnablementPermitted: false,
      productionMethodRegistrationPermitted: false,
      defaultUiExposurePermitted: false,
      sealExportEligibilityPermitted: false,
      productionCutoverPermitted: false,
    },
  });
}

export function requirePreproductionThermalLiftoffGovernedRequest(value) {
  if (value?.schema !== PREPRODUCTION_TL06_REQUEST_SCHEMA) throw coded('PREPRODUCTION_TL06_REQUEST_SCHEMA_INVALID');
  const { semanticHash: actual, ...material } = value;
  if (actual !== semanticHash(material)) throw coded('PREPRODUCTION_TL06_REQUEST_HASH_MISMATCH');
  text(value.requestId, 'requestId');
  timestamp(value.requestedAt, 'requestedAt');
  text(value.expectedApplicabilityClass, 'expectedApplicabilityClass');
  const authority = optInAuthority(value.optInAuthority);
  if (!['QUALIFIED', 'UNRESOLVED'].includes(value.qualification)) throw coded('PREPRODUCTION_TL06_REQUEST_QUALIFICATION_INVALID');
  if (!Array.isArray(value.blockers)) throw coded('PREPRODUCTION_TL06_REQUEST_BLOCKERS_INVALID');
  const blockerCodes = value.blockers.map((blocker, index) => {
    exact(blocker, ['code', 'severity', 'scope', 'message', 'details'], `request.blockers[${index}]`);
    if (blocker.severity !== 'ERROR' || blocker.scope !== 'request' || blocker.message !== blocker.code || blocker.details !== null) {
      throw coded('PREPRODUCTION_TL06_REQUEST_BLOCKER_INVALID');
    }
    if (![
      'PREPRODUCTION_TL06_INTEGRATION_MODE_NOT_OPT_IN',
      'PREPRODUCTION_TL06_OPT_IN_AUTHORITY_UNQUALIFIED',
    ].includes(blocker.code)) throw coded('PREPRODUCTION_TL06_REQUEST_BLOCKER_INVALID');
    return blocker.code;
  });
  if (new Set(blockerCodes).size !== blockerCodes.length) throw coded('PREPRODUCTION_TL06_REQUEST_BLOCKER_DUPLICATE');
  const modeQualified = value.integrationMode === 'PREPRODUCTION_EXPLICIT_OPT_IN';
  const sourceKindQualified = OPT_IN_SOURCE_KINDS.has(authority.sourceKind);
  if (!modeQualified && !blockerCodes.includes('PREPRODUCTION_TL06_INTEGRATION_MODE_NOT_OPT_IN')) {
    throw coded('PREPRODUCTION_TL06_REQUEST_BLOCKER_MISSING');
  }
  if (!sourceKindQualified && !blockerCodes.includes('PREPRODUCTION_TL06_OPT_IN_AUTHORITY_UNQUALIFIED')) {
    throw coded('PREPRODUCTION_TL06_REQUEST_BLOCKER_MISSING');
  }
  if (value.qualification === 'QUALIFIED') {
    if (!modeQualified || !sourceKindQualified || blockerCodes.length !== 0) {
      throw coded('PREPRODUCTION_TL06_REQUEST_QUALIFICATION_CONTRADICTION');
    }
  } else if (blockerCodes.length === 0) {
    throw coded('PREPRODUCTION_TL06_REQUEST_UNRESOLVED_WITHOUT_BLOCKER');
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
  return deepFreeze(structuredClone(value));
}

export function calculatePreproductionThermalLiftoffGovernedExecution(input) {
  exact(input, [
    'executionId', 'executedAt', 'request', 'activeSetIntake', 'activeSetResult',
    'benchmarkProgramme', 'benchmarkEvidence',
  ], 'TL-06 governed execution input');
  const request = requirePreproductionThermalLiftoffGovernedRequest(input.request);
  const intake = requirePreproductionThermalLiftoffActiveSetIntake(input.activeSetIntake);
  const result = requirePreproductionThermalLiftoffActiveSet(input.activeSetResult);
  const programme = requirePreproductionThermalLiftoffBenchmarkProgramme(input.benchmarkProgramme);
  if (request.qualification !== 'QUALIFIED') throw coded('PREPRODUCTION_TL06_REQUEST_NOT_QUALIFIED');
  if (intake.status !== 'READY_FOR_TL04_ACTIVE_SET') throw coded('PREPRODUCTION_TL06_TL04_INTAKE_NOT_READY');
  if (result.status !== 'CONVERGED_PREPRODUCTION_SCREEN') throw coded('PREPRODUCTION_TL06_TL04_RESULT_NOT_CONVERGED');
  const tl04Currentness = assessPreproductionThermalLiftoffActiveSetCurrentness(result, intake);
  if (tl04Currentness.status !== 'CURRENT') throw coded('PREPRODUCTION_TL06_TL04_RESULT_STALE');
  if (programme.status !== 'QUALIFIED_TL05_BENCHMARK_PROGRAMME') throw coded('PREPRODUCTION_TL06_TL05_PROGRAMME_NOT_QUALIFIED');
  if (programme.qualifiedApplicabilityClass !== result.applicabilityClass
      || request.expectedApplicabilityClass !== result.applicabilityClass) {
    throw coded('PREPRODUCTION_TL06_APPLICABILITY_MISMATCH');
  }
  verifyBenchmarkEvidence(programme, input.benchmarkEvidence);

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
    stage: 'TL06_GOVERNED_OPT_IN_INTEGRATION',
    finality: 'PREPRODUCTION_GOVERNED_SCREEN_RECEIPT_ONLY',
    status: 'CALCULATED_PREPRODUCTION_GOVERNED_SCREEN',
    applicabilityClass: result.applicabilityClass,
    datasetId: result.datasetId,
    loadCaseId: result.loadCaseId,
    requestSemanticHash: request.semanticHash,
    sourceBindings: {
      activeSetIntakeSemanticHash: intake.semanticHash,
      activeSetResultSemanticHash: result.semanticHash,
      benchmarkProgrammeSemanticHash: programme.semanticHash,
    },
    supportResults,
    summary: {
      supportCount: supportResults.length,
      activeSupportCount: supportResults.filter((row) => row.screenedContactState === 'ACTIVE').length,
      liftedSupportCount: supportResults.filter((row) => row.screenedContactState === 'LIFTED').length,
    },
    policy: {
      explicitOptInRequired: true,
      productionCalculationConsumptionEnabled: false,
      productionMethodRegistrationPermitted: false,
      defaultUiExposurePermitted: false,
      sealExportEligibilityPermitted: false,
      productionCutoverPermitted: false,
      productionFinalReactionCalculated: false,
      finalHotReactionPublicationPermitted: false,
      presenterMayExposePreproductionScreenOnly: true,
    },
  };
  return requirePreproductionThermalLiftoffGovernedExecution(freezeHash(material));
}

export function requirePreproductionThermalLiftoffGovernedExecution(value) {
  if (value?.schema !== PREPRODUCTION_TL06_EXECUTION_SCHEMA) throw coded('PREPRODUCTION_TL06_EXECUTION_SCHEMA_INVALID');
  const { semanticHash: actual, ...material } = value;
  if (actual !== semanticHash(material)) throw coded('PREPRODUCTION_TL06_EXECUTION_HASH_MISMATCH');
  if (value.stage !== 'TL06_GOVERNED_OPT_IN_INTEGRATION'
      || value.finality !== 'PREPRODUCTION_GOVERNED_SCREEN_RECEIPT_ONLY'
      || value.status !== 'CALCULATED_PREPRODUCTION_GOVERNED_SCREEN') {
    throw coded('PREPRODUCTION_TL06_EXECUTION_IDENTITY_INVALID');
  }
  text(value.executionId, 'executionId');
  timestamp(value.executedAt, 'executedAt');
  text(value.applicabilityClass, 'applicabilityClass');
  text(value.datasetId, 'datasetId');
  text(value.loadCaseId, 'loadCaseId');
  hash(value.requestSemanticHash, 'requestSemanticHash');
  exact(value.sourceBindings, ['activeSetIntakeSemanticHash', 'activeSetResultSemanticHash', 'benchmarkProgrammeSemanticHash'], 'TL-06 source bindings');
  Object.values(value.sourceBindings).forEach((item) => hash(item, 'sourceBinding'));
  if (!Array.isArray(value.supportResults) || value.supportResults.length === 0) throw coded('PREPRODUCTION_TL06_SUPPORT_RESULTS_INVALID');
  value.supportResults.forEach(requireSupportResult);
  const expectedSummary = {
    supportCount: value.supportResults.length,
    activeSupportCount: value.supportResults.filter((row) => row.screenedContactState === 'ACTIVE').length,
    liftedSupportCount: value.supportResults.filter((row) => row.screenedContactState === 'LIFTED').length,
  };
  if (semanticHash(expectedSummary) !== semanticHash(value.summary)) throw coded('PREPRODUCTION_TL06_SUMMARY_INVALID');
  const p = value.policy || {};
  if (p.explicitOptInRequired !== true
      || p.productionCalculationConsumptionEnabled !== false
      || p.productionMethodRegistrationPermitted !== false
      || p.defaultUiExposurePermitted !== false
      || p.sealExportEligibilityPermitted !== false
      || p.productionCutoverPermitted !== false
      || p.productionFinalReactionCalculated !== false
      || p.finalHotReactionPublicationPermitted !== false
      || p.presenterMayExposePreproductionScreenOnly !== true) {
    throw coded('PREPRODUCTION_TL06_EXECUTION_POLICY_INVALID');
  }
  return deepFreeze(structuredClone(value));
}

export function assessPreproductionThermalLiftoffGovernedCurrentness(input) {
  exact(input, [
    'receipt', 'request', 'activeSetIntake', 'activeSetResult',
    'benchmarkProgramme', 'benchmarkEvidence',
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
      benchmarkProgramme: input.benchmarkProgramme,
      benchmarkEvidence: input.benchmarkEvidence,
    });
  } catch (error) {
    rebuildErrorCode = error?.code || 'PREPRODUCTION_TL06_CURRENTNESS_REBUILD_FAILED';
  }
  const differences = [];
  if (!rebuilt) differences.push(rebuildErrorCode);
  else if (rebuilt.semanticHash !== receipt.semanticHash) differences.push('receiptSemanticHash');
  return freezeHash({
    schema: PREPRODUCTION_TL06_CURRENTNESS_SCHEMA,
    receiptSemanticHash: receipt.semanticHash,
    observedReceiptSemanticHash: rebuilt?.semanticHash || null,
    status: differences.length ? 'STALE_SUPPRESSED' : 'CURRENT',
    differences,
    policy: {
      staleResultPresentationPermitted: false,
      productionCalculationConsumptionEnabled: false,
      finalHotReactionPublicationPermitted: false,
    },
  });
}

export function requirePreproductionThermalLiftoffGovernedCurrentness(value) {
  if (value?.schema !== PREPRODUCTION_TL06_CURRENTNESS_SCHEMA) throw coded('PREPRODUCTION_TL06_CURRENTNESS_SCHEMA_INVALID');
  const { semanticHash: actual, ...material } = value;
  if (actual !== semanticHash(material)) throw coded('PREPRODUCTION_TL06_CURRENTNESS_HASH_MISMATCH');
  if (!['CURRENT', 'STALE_SUPPRESSED'].includes(value.status)) throw coded('PREPRODUCTION_TL06_CURRENTNESS_STATUS_INVALID');
  if (!Array.isArray(value.differences)) throw coded('PREPRODUCTION_TL06_CURRENTNESS_DIFFERENCES_INVALID');
  const p = value.policy || {};
  if (p.staleResultPresentationPermitted !== false
      || p.productionCalculationConsumptionEnabled !== false
      || p.finalHotReactionPublicationPermitted !== false) {
    throw coded('PREPRODUCTION_TL06_CURRENTNESS_POLICY_INVALID');
  }
  return deepFreeze(structuredClone(value));
}

function verifyBenchmarkEvidence(programme, evidence) {
  if (!Array.isArray(evidence)) throw new TypeError('benchmarkEvidence must be an array.');
  const rebuilt = evidence.map((bundle, index) => {
    exact(bundle, ['correlation', 'candidate', 'reference', 'numericalAuthority'], `benchmarkEvidence[${index}]`);
    const correlation = bundle.correlation;
    const refreshed = qualifyPreproductionThermalLiftoffBenchmark({
      qualificationId: correlation.qualificationId,
      candidate: bundle.candidate,
      reference: bundle.reference,
      numericalAuthority: bundle.numericalAuthority,
    });
    if (refreshed.semanticHash !== correlation.semanticHash) throw coded('PREPRODUCTION_TL06_TL05_CORRELATION_STALE');
    return refreshed;
  });
  const rebuiltProgramme = buildPreproductionThermalLiftoffBenchmarkProgramme({
    programmeId: programme.programmeId,
    correlations: rebuilt,
  });
  if (rebuiltProgramme.semanticHash !== programme.semanticHash) throw coded('PREPRODUCTION_TL06_TL05_PROGRAMME_STALE');
}

function requireSupportResult(value) {
  const { semanticHash: actual, ...material } = value;
  if (actual !== semanticHash(material)) throw coded('PREPRODUCTION_TL06_SUPPORT_RESULT_HASH_MISMATCH');
  text(value.supportSiteId, 'supportSiteId');
  finite(value.routeChainageMm, 'routeChainageMm');
  if (!['ACTIVE', 'LIFTED'].includes(value.screenedContactState)) throw coded('PREPRODUCTION_TL06_SUPPORT_STATE_INVALID');
  finite(value.screenedReactionN, 'screenedReactionN');
  finite(value.screenedGapM, 'screenedGapM');
  nonnegative(value.coldGravityReactionN, 'coldGravityReactionN');
  hash(value.sourceTl04SupportSemanticHash, 'sourceTl04SupportSemanticHash');
  if (value.screenedContactState === 'LIFTED' && value.screenedReactionN !== 0) throw coded('PREPRODUCTION_TL06_LIFTED_REACTION_NONZERO');
}
function optInAuthority(value) {
  exact(value, ['sourceId', 'sourceRevision', 'sourceSemanticHash', 'sourceKind'], 'optInAuthority');
  return deepFreeze({ sourceId: text(value.sourceId, 'sourceId'), sourceRevision: text(value.sourceRevision, 'sourceRevision'), sourceSemanticHash: hash(value.sourceSemanticHash, 'sourceSemanticHash'), sourceKind: text(value.sourceKind, 'sourceKind') });
}
function freezeHash(material) { return deepFreeze({ ...material, semanticHash: semanticHash(material) }); }
function issue(code, scope) { return deepFreeze({ code, severity: 'ERROR', scope, message: code, details: null }); }
function exact(value, keys, label) { if (!isPlainRecord(value) || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) throw new TypeError(`${label} contains unexpected or missing keys.`); }
function text(value, label) { const s = stringValue(value); if (!s) throw new TypeError(`${label} must be non-empty.`); return s; }
function hash(value, label) { if (typeof value !== 'string' || !/^fnv1a64:[0-9a-f]{16}$/u.test(value)) throw new TypeError(`${label} must be an FNV hash.`); return value; }
function finite(value, label) { if (!Number.isFinite(value)) throw new TypeError(`${label} must be finite.`); return value; }
function nonnegative(value, label) { const n = finite(value, label); if (n < 0) throw new TypeError(`${label} must be non-negative.`); return n; }
function timestamp(value, label) { const s = text(value, label); if (!Number.isFinite(Date.parse(s))) throw new TypeError(`${label} must be an ISO timestamp.`); return s; }
function coded(code) { const error = new Error(code); error.code = code; return error; }
