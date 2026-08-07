import assert from 'node:assert/strict';
import { clonePlain } from './contracts.js';
import {
  createOperationalSurveillanceContract, validateOperationalSurveillanceContract,
} from './operational-surveillance-contract.js';
import { evaluateOperationalSurveillanceQualification } from './operational-surveillance-evaluator.js';
import {
  PASSING_NC11_RUN_RECEIPT, createPassingSurveillanceEvidence,
  createPassingSurveillanceRegistry,
} from './nc11-fixtures.js';

export function runNc11NegativeControls() {
  const results = [];
  const rejects = (id, mutate) => {
    const record = clonePlain(createOperationalSurveillanceContract());
    mutate(record);
    delete record.operationalSurveillanceContractHash;
    assert.throws(() => validateOperationalSurveillanceContract(record));
    results.push({ id, passed: true });
  };
  rejects('REJECT_WRONG_ANALYSIS_CLASS', (r) => { r.analysisClass = 'PASSIVE_LOGGING'; });
  rejects('REJECT_UNQUALIFIED_DEPENDENCY', (r) => { r.upstreamDependency = 'ANY_RUN'; });
  rejects('REJECT_PARTIAL_MONITORING', (r) => { r.monitoringPolicy = 'SAMPLE_ONLY'; });
  rejects('REJECT_ALLOWED_DRIFT', (r) => { r.maximumUnreviewedDriftCount = 1; });
  rejects('REJECT_CRITICAL_INCIDENT_ALLOWANCE', (r) => { r.maximumUnresolvedCriticalCount = 1; });
  rejects('REJECT_AUDIT_GAP_ALLOWANCE', (r) => { r.maximumAuditGapCount = 1; });
  rejects('REJECT_FALSE_NEGATIVE_ALLOWANCE', (r) => { r.maximumFalseNegativeCount = 1; });
  rejects('REJECT_TOO_FEW_WINDOWS', (r) => { r.minimumMonitoringWindowCount = 2; });
  rejects('REJECT_TOO_FEW_REPLAYS', (r) => { r.minimumReplaySampleCount = 2; });
  rejects('REJECT_TOO_FEW_REVIEWERS', (r) => { r.minimumIndependentReviewerCount = 1; });
  rejects('REJECT_AUTOMATIC_REINSTATEMENT', (r) => { r.automaticReinstatementAuthorized = true; });
  rejects('REJECT_AUTONOMOUS_DISPOSITION', (r) => { r.autonomousCaseDispositionAuthorized = true; });
  rejects('REJECT_AUTOMATIC_ACCEPTANCE', (r) => { r.automaticAssetAcceptanceAuthorized = true; });
  rejects('REJECT_FFS_AUTHORITY', (r) => { r.fitnessForServiceAuthorized = true; });
  rejects('REJECT_REMAINING_STRENGTH_AUTHORITY', (r) => { r.remainingStrengthAuthorized = true; });
  rejects('REJECT_MERGE_AUTHORITY', (r) => { r.mergeAuthorized = true; });
  rejects('REJECT_MISSING_DOMAIN', (r) => { r.requiredDomains.pop(); });
  rejects('REJECT_DUPLICATE_DOMAIN', (r) => { r.requiredDomains.push(r.requiredDomains[0]); });
  rejects('REJECT_WEAK_EXPIRY', (r) => { r.expiryPolicy = 'MANUAL_ONLY'; });
  rejects('REJECT_UNKNOWN_FIELD', (r) => { r.shadowMode = true; });

  const base = {
    contract: createOperationalSurveillanceContract(),
    governedRunReceipt: PASSING_NC11_RUN_RECEIPT,
    surveillanceRegistry: createPassingSurveillanceRegistry(),
    domainEvidence: createPassingSurveillanceEvidence(),
  };
  const blockedCases = [
    ['BLOCK_MISSING_NC10_RECEIPT', { ...base, governedRunReceipt: null }],
    ['BLOCK_EMPTY_REGISTRY', { ...base, surveillanceRegistry: [], domainEvidence: [] }],
    ['BLOCK_UNQUALIFIED_RUN', { ...base, surveillanceRegistry: [{ ...base.surveillanceRegistry[0], runIds: ['RUN-999'] }] }],
    ['BLOCK_SUSPENDED_STATE', { ...base, surveillanceRegistry: [{ ...base.surveillanceRegistry[0], authorizationState: 'SUSPENDED_PENDING_REVIEW' }] }],
    ['BLOCK_MISSING_EVIDENCE', { ...base, domainEvidence: base.domainEvidence.slice(1) }],
  ];
  for (const [id, input] of blockedCases) {
    assert.equal(evaluateOperationalSurveillanceQualification(input).authority.operationalSurveillanceQualified, false);
    results.push({ id, passed: true });
  }
  const mutations = [
    ['BLOCK_BAD_HASH', (e) => { e[0].referenceHash = 'bad'; }],
    ['BLOCK_LOW_WINDOW_COUNT', (e) => { e[0].monitoringWindowCount = 1; }],
    ['BLOCK_LOW_REPLAY_COUNT', (e) => { e[0].replaySampleCount = 1; }],
    ['BLOCK_LOW_REVIEWER_COUNT', (e) => { e[0].independentReviewerCount = 1; }],
    ['BLOCK_CRITICAL_INCIDENT', (e) => { e[0].unresolvedCriticalCount = 1; }],
    ['BLOCK_AUDIT_GAP', (e) => { e[0].auditGapCount = 1; }],
    ['BLOCK_UNREVIEWED_DRIFT', (e) => { e[0].unreviewedDriftCount = 1; }],
    ['BLOCK_FALSE_NEGATIVE', (e) => { e[0].falseNegativeCount = 1; }],
    ['BLOCK_TELEMETRY_GAP', (e) => { e[0].telemetryComplete = false; }],
    ['BLOCK_DRIFT_DETECTION_FAILURE', (e) => { e[0].driftDetectionVerified = false; }],
    ['BLOCK_SHIFT_REVIEW_GAP', (e) => { e[0].distributionShiftReviewed = false; }],
    ['BLOCK_THRESHOLD_TEST_GAP', (e) => { e[0].alertThresholdsTested = false; }],
    ['BLOCK_FALSE_NEGATIVE_TEST_FAILURE', (e) => { e[0].falseNegativeTestingPassed = false; }],
    ['BLOCK_SUSPENSION_TEST_FAILURE', (e) => { e[0].suspensionTested = false; }],
    ['BLOCK_ESCALATION_TEST_FAILURE', (e) => { e[0].escalationTested = false; }],
    ['BLOCK_REPLAY_FAILURE', (e) => { e[0].replayReconstructionPassed = false; }],
    ['BLOCK_EXPIRY_NOT_ENFORCED', (e) => { e[0].expiryEnforced = false; }],
    ['BLOCK_REVOCATION_NOT_TESTED', (e) => { e[0].revocationTested = false; }],
    ['BLOCK_REQUALIFICATION_DECISION_MISSING', (e) => { e[0].requalificationDecisionRecorded = false; }],
    ['BLOCK_PERIODIC_REVIEW_FAILURE', (e) => { e[0].periodicReviewPassed = false; }],
    ['BLOCK_RETENTION_GAP', (e) => { e[0].retentionScheduled = false; }],
    ['BLOCK_FAILED_EVIDENCE', (e) => { e[0].passed = false; }],
  ];
  for (const [id, mutate] of mutations) {
    const evidence = clonePlain(base.domainEvidence);
    mutate(evidence);
    assert.equal(evaluateOperationalSurveillanceQualification({ ...base, domainEvidence: evidence }).authority.operationalSurveillanceQualified, false);
    results.push({ id, passed: true });
  }
  const auto = clonePlain(base.surveillanceRegistry);
  auto[0].automaticReinstatementRequested = true;
  assert.equal(evaluateOperationalSurveillanceQualification({ ...base, surveillanceRegistry: auto }).authority.operationalSurveillanceQualified, false);
  results.push({ id: 'BLOCK_AUTOMATIC_REINSTATEMENT_REQUEST', passed: true });
  assert.equal(results.length, 48);
  return results;
}
