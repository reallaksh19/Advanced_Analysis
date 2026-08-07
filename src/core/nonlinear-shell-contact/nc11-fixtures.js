import { sha256Bytes } from './contracts.js';
import {
  DEFAULT_OPERATIONAL_SURVEILLANCE_CONTRACT,
  REQUIRED_OPERATIONAL_SURVEILLANCE_DOMAINS,
} from './operational-surveillance-contract.js';

const hash = (value) => sha256Bytes(Buffer.from(value));

export const PASSING_NC11_RUN_RECEIPT = Object.freeze({
  governedRunReceiptQualified: true,
  productionExecutionAuthorized: true,
  qualifiedRunIds: ['RUN-001', 'RUN-002', 'RUN-003'],
  receiptHash: hash('qualified-nc10-run-receipt'),
});

export function createPassingSurveillanceRegistry() {
  return [{
    id: 'SURVEILLANCE-001',
    deploymentId: 'DEPLOYMENT-001',
    moduleBuildId: 'BUILD-001',
    runIds: ['RUN-001', 'RUN-002', 'RUN-003'],
    telemetryArchiveHash: hash('telemetry-archive'),
    thresholdProfileHash: hash('threshold-profile'),
    incidentRegisterHash: hash('incident-register'),
    replaySampleRegisterHash: hash('replay-sample-register'),
    expiryRegisterHash: hash('expiry-register'),
    requalificationPlanHash: hash('requalification-plan'),
    reviewerRosterHash: hash('reviewer-roster'),
    monitoringWindowStartHash: hash('monitoring-window-start'),
    monitoringWindowEndHash: hash('monitoring-window-end'),
    authorizationState: 'ACTIVE_UNDER_HUMAN_AUTHORITY',
    automaticReinstatementRequested: false,
  }];
}

export function createPassingSurveillanceEvidence(registry = createPassingSurveillanceRegistry()) {
  return registry.flatMap((record) => REQUIRED_OPERATIONAL_SURVEILLANCE_DOMAINS.map((id) => ({
    id,
    surveillanceId: record.id,
    referenceHash: hash(`reference:${record.id}:${id}`),
    rawEvidenceHash: hash(`raw:${record.id}:${id}`),
    reviewerRecordHash: hash(`review:${record.id}:${id}`),
    monitoringWindowCount: 4,
    replaySampleCount: 3,
    independentReviewerCount: 2,
    unresolvedCriticalCount: 0,
    auditGapCount: 0,
    unreviewedDriftCount: 0,
    falseNegativeCount: 0,
    telemetryComplete: true,
    driftDetectionVerified: true,
    distributionShiftReviewed: true,
    alertThresholdsTested: true,
    falseNegativeTestingPassed: true,
    suspensionTested: true,
    escalationTested: true,
    replayReconstructionPassed: true,
    expiryEnforced: true,
    revocationTested: true,
    requalificationDecisionRecorded: true,
    periodicReviewPassed: true,
    retentionScheduled: true,
    passed: true,
  })));
}

export const NC11_CONTRACT_FIXTURES = Object.freeze([
  { id: 'DEFAULT_OPERATIONAL_SURVEILLANCE_CONTRACT', contract: DEFAULT_OPERATIONAL_SURVEILLANCE_CONTRACT },
  {
    id: 'PASSING_OPERATIONAL_SURVEILLANCE_EVIDENCE_SHAPE',
    contract: DEFAULT_OPERATIONAL_SURVEILLANCE_CONTRACT,
    registry: createPassingSurveillanceRegistry(),
    evidence: createPassingSurveillanceEvidence(),
  },
]);
