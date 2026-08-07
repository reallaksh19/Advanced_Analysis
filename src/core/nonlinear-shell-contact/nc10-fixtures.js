import { sha256Bytes } from './contracts.js';
import {
  DEFAULT_PRODUCTION_RUN_RECEIPT_CONTRACT, REQUIRED_PRODUCTION_RUN_DOMAINS,
} from './production-run-receipt-contract.js';

const hash = (value) => sha256Bytes(Buffer.from(value));

export const PASSING_NC10_PRODUCTION_AUTHORIZATION_RECEIPT = Object.freeze({
  productionExecutionAuthorized: true,
  authorizedDeploymentIds: ['DEPLOYMENT-001'],
  receiptHash: hash('qualified-nc09-production-receipt'),
});

export function createPassingProductionRuns() {
  return [{
    id: 'RUN-001',
    deploymentId: 'DEPLOYMENT-001',
    moduleBuildId: 'BUILD-001',
    caseId: 'CASE-001',
    casePackageHash: hash('case-package'),
    inputSchemaHash: hash('input-schema'),
    inputArchiveHash: hash('input-archive'),
    executionRequestHash: hash('execution-request'),
    executionReceiptHash: hash('execution-receipt'),
    rawManifestHash: hash('raw-manifest'),
    parserInventoryHash: hash('parser-inventory'),
    reconstructionHash: hash('reconstruction'),
    calculationLedgerHash: hash('calculation-ledger'),
    operatorIdentityHash: hash('operator-identity'),
    runWindowHash: hash('run-window'),
    environmentSnapshotHash: hash('environment-snapshot'),
    configurationHash: hash('configuration'),
    predecessorRunId: 'NONE',
    autonomousDispositionRequested: false,
  }];
}

export function createPassingProductionRunEvidence(runs = createPassingProductionRuns()) {
  return runs.flatMap((run) => REQUIRED_PRODUCTION_RUN_DOMAINS.map((id) => ({
    id,
    runId: run.id,
    referenceHash: hash(`reference:${run.id}:${id}`),
    rawEvidenceHash: hash(`raw:${run.id}:${id}`),
    reviewerRecordHash: hash(`review:${run.id}:${id}`),
    independentReviewerCount: 2,
    rawArtifactCount: 4,
    unresolvedWarningCount: 0,
    unresolvedExceptionCount: 0,
    exitCode: 0,
    executionCompleted: true,
    exactBuildMatch: true,
    exactConfigurationMatch: true,
    inputCustodyComplete: true,
    rawCustodyComplete: true,
    parserCoverageComplete: true,
    reconstructionVerified: true,
    calculationLedgerVerified: true,
    retryLedgerComplete: true,
    ownerDispositionRecorded: true,
    retentionScheduled: true,
    passed: true,
  })));
}

export const NC10_CONTRACT_FIXTURES = Object.freeze([
  { id: 'DEFAULT_PRODUCTION_RUN_RECEIPT_CONTRACT', contract: DEFAULT_PRODUCTION_RUN_RECEIPT_CONTRACT },
  {
    id: 'PASSING_PRODUCTION_RUN_EVIDENCE_SHAPE',
    contract: DEFAULT_PRODUCTION_RUN_RECEIPT_CONTRACT,
    runs: createPassingProductionRuns(),
    evidence: createPassingProductionRunEvidence(),
  },
]);
