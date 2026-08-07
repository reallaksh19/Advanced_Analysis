import {
  assertArray, assertEnum, assertExactKeys, assertFiniteNumber, assertPlainData,
  assertString, clonePlain, deepFreeze, sealWithHash, verifySealedHash,
} from './contracts.js';

export const OPERATIONAL_SURVEILLANCE_SCHEMA = 'nonlinear-shell-contact-operational-surveillance/v1';
export const REQUIRED_OPERATIONAL_SURVEILLANCE_DOMAINS = Object.freeze([
  'NC10_RUN_RECEIPT_BINDING',
  'MONITORING_TELEMETRY_CUSTODY',
  'BUILD_CONFIGURATION_AND_SCHEMA_DRIFT_DETECTION',
  'INPUT_OUTPUT_DISTRIBUTION_SHIFT_REVIEW',
  'ALERT_THRESHOLD_AND_FALSE_NEGATIVE_TESTING',
  'INCIDENT_SUSPENSION_AND_ESCALATION',
  'REPLAY_SAMPLING_AND_INDEPENDENT_RECONSTRUCTION',
  'AUTHORIZATION_EXPIRY_AND_REVOCATION',
  'REQUALIFICATION_DECISION_AND_SCOPE',
  'PERIODIC_REVIEW_AND_RETENTION',
]);

export function createOperationalSurveillanceContract(input = {}) {
  const payload = {
    schema: OPERATIONAL_SURVEILLANCE_SCHEMA,
    analysisClass: 'CONTINUOUS_SURVEILLANCE_OF_GOVERNED_EXECUTION',
    upstreamDependency: 'QUALIFIED_NC10_RUN_RECEIPT',
    monitoringPolicy: 'COMPLETE_METRICS_LOGS_ALERTS_AND_RECEIPT_SAMPLING',
    driftPolicy: 'ZERO_UNREVIEWED_BUILD_CONFIGURATION_SCHEMA_OR_RESULT_DRIFT',
    incidentPolicy: 'SUSPEND_ON_CRITICAL_INCIDENT_CUSTODY_BREAK_OR_CONTROL_FAILURE',
    thresholdPolicy: 'PRE_REGISTERED_NON_BENEFICIAL_ALERT_THRESHOLDS',
    replayPolicy: 'RISK_BASED_COMPLETE_REPLAY_WITH_INDEPENDENT_RECONSTRUCTION',
    expiryPolicy: 'AUTOMATIC_SUSPENSION_AT_AUTHORIZATION_EXPIRY',
    requalificationPolicy: 'HUMAN_APPROVED_FULL_OR_TARGETED_REQUALIFICATION',
    reinstatementPolicy: 'NO_REINSTATEMENT_WITHOUT_NEW_GOVERNED_RECEIPT',
    retentionPolicy: 'APPEND_ONLY_SURVEILLANCE_INCIDENT_AND_DECISION_LEDGER',
    minimumMonitoringWindowCount: 3,
    minimumReplaySampleCount: 3,
    minimumIndependentReviewerCount: 2,
    maximumUnresolvedCriticalCount: 0,
    maximumAuditGapCount: 0,
    maximumUnreviewedDriftCount: 0,
    maximumFalseNegativeCount: 0,
    requiredDomains: [...REQUIRED_OPERATIONAL_SURVEILLANCE_DOMAINS],
    automaticReinstatementAuthorized: false,
    autonomousCaseDispositionAuthorized: false,
    automaticAssetAcceptanceAuthorized: false,
    fitnessForServiceAuthorized: false,
    remainingStrengthAuthorized: false,
    mergeAuthorized: false,
    ...clonePlain(input),
  };
  validateOperationalSurveillanceContract(payload);
  return sealWithHash(payload, 'operationalSurveillanceContractHash');
}

export function validateOperationalSurveillanceContract(value) {
  assertPlainData(value, '$operationalSurveillanceContract');
  assertExactKeys(value, [
    'schema', 'analysisClass', 'upstreamDependency', 'monitoringPolicy', 'driftPolicy',
    'incidentPolicy', 'thresholdPolicy', 'replayPolicy', 'expiryPolicy',
    'requalificationPolicy', 'reinstatementPolicy', 'retentionPolicy',
    'minimumMonitoringWindowCount', 'minimumReplaySampleCount',
    'minimumIndependentReviewerCount', 'maximumUnresolvedCriticalCount',
    'maximumAuditGapCount', 'maximumUnreviewedDriftCount', 'maximumFalseNegativeCount',
    'requiredDomains', 'automaticReinstatementAuthorized',
    'autonomousCaseDispositionAuthorized', 'automaticAssetAcceptanceAuthorized',
    'fitnessForServiceAuthorized', 'remainingStrengthAuthorized', 'mergeAuthorized',
  ], '$operationalSurveillanceContract', ['operationalSurveillanceContractHash']);
  const enums = {
    schema: [OPERATIONAL_SURVEILLANCE_SCHEMA],
    analysisClass: ['CONTINUOUS_SURVEILLANCE_OF_GOVERNED_EXECUTION'],
    upstreamDependency: ['QUALIFIED_NC10_RUN_RECEIPT'],
    monitoringPolicy: ['COMPLETE_METRICS_LOGS_ALERTS_AND_RECEIPT_SAMPLING'],
    driftPolicy: ['ZERO_UNREVIEWED_BUILD_CONFIGURATION_SCHEMA_OR_RESULT_DRIFT'],
    incidentPolicy: ['SUSPEND_ON_CRITICAL_INCIDENT_CUSTODY_BREAK_OR_CONTROL_FAILURE'],
    thresholdPolicy: ['PRE_REGISTERED_NON_BENEFICIAL_ALERT_THRESHOLDS'],
    replayPolicy: ['RISK_BASED_COMPLETE_REPLAY_WITH_INDEPENDENT_RECONSTRUCTION'],
    expiryPolicy: ['AUTOMATIC_SUSPENSION_AT_AUTHORIZATION_EXPIRY'],
    requalificationPolicy: ['HUMAN_APPROVED_FULL_OR_TARGETED_REQUALIFICATION'],
    reinstatementPolicy: ['NO_REINSTATEMENT_WITHOUT_NEW_GOVERNED_RECEIPT'],
    retentionPolicy: ['APPEND_ONLY_SURVEILLANCE_INCIDENT_AND_DECISION_LEDGER'],
  };
  for (const [field, allowed] of Object.entries(enums)) assertEnum(value[field], allowed, `$operationalSurveillanceContract.${field}`);
  for (const [field, minimum] of [
    ['minimumMonitoringWindowCount', 3], ['minimumReplaySampleCount', 3],
    ['minimumIndependentReviewerCount', 2],
  ]) {
    assertFiniteNumber(value[field], `$operationalSurveillanceContract.${field}`, Number.isInteger, 'integer');
    if (value[field] < minimum) throw new TypeError(`${field} is below the governed minimum.`);
  }
  for (const field of [
    'maximumUnresolvedCriticalCount', 'maximumAuditGapCount',
    'maximumUnreviewedDriftCount', 'maximumFalseNegativeCount',
  ]) {
    assertFiniteNumber(value[field], `$operationalSurveillanceContract.${field}`, Number.isInteger, 'integer');
    if (value[field] !== 0) throw new TypeError(`${field} must be zero.`);
  }
  validateRequiredSet(value.requiredDomains, REQUIRED_OPERATIONAL_SURVEILLANCE_DOMAINS, '$operationalSurveillanceContract.requiredDomains');
  for (const field of [
    'automaticReinstatementAuthorized', 'autonomousCaseDispositionAuthorized',
    'automaticAssetAcceptanceAuthorized', 'fitnessForServiceAuthorized',
    'remainingStrengthAuthorized', 'mergeAuthorized',
  ]) {
    if (value[field] !== false) throw new TypeError(`${field} is outside NC-11 authority.`);
  }
  if (value.operationalSurveillanceContractHash) {
    verifySealedHash(value, 'operationalSurveillanceContractHash', '$operationalSurveillanceContract');
  }
  return true;
}

function validateRequiredSet(value, required, path) {
  assertArray(value, path, { min: required.length });
  value.forEach((entry, index) => assertString(entry, `${path}[${index}]`));
  if (new Set(value).size !== value.length) throw new TypeError(`${path} must be unique.`);
  for (const id of required) if (!value.includes(id)) throw new TypeError(`${path} is missing ${id}.`);
}

export const DEFAULT_OPERATIONAL_SURVEILLANCE_CONTRACT = deepFreeze(createOperationalSurveillanceContract());
