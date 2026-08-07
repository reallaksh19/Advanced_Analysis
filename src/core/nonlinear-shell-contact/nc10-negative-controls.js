import assert from 'node:assert/strict';
import { clonePlain } from './contracts.js';
import {
  createProductionRunReceiptContract, validateProductionRunReceiptContract,
} from './production-run-receipt-contract.js';
import { evaluateProductionRunReceiptQualification } from './production-run-receipt-evaluator.js';
import {
  PASSING_NC10_PRODUCTION_AUTHORIZATION_RECEIPT,
  createPassingProductionRunEvidence,
  createPassingProductionRuns,
} from './nc10-fixtures.js';

export function runNc10NegativeControls() {
  const results = [];
  const rejects = (id, mutate) => {
    const record = clonePlain(createProductionRunReceiptContract());
    mutate(record);
    delete record.productionRunReceiptContractHash;
    assert.throws(() => validateProductionRunReceiptContract(record));
    results.push({ id, passed: true });
  };
  rejects('REJECT_WRONG_ANALYSIS_CLASS', (r) => { r.analysisClass = 'UNCONTROLLED_RUN'; });
  rejects('REJECT_UNQUALIFIED_DEPENDENCY', (r) => { r.upstreamDependency = 'ANY_DEPLOYMENT'; });
  rejects('REJECT_WEAK_RUN_IDENTITY', (r) => { r.runIdentityPolicy = 'CASE_ID_ONLY'; });
  rejects('REJECT_MUTABLE_INPUT', (r) => { r.inputPolicy = 'MUTABLE_INPUT'; });
  rejects('REJECT_FALLBACK_DEPLOYMENT', (r) => { r.executionPolicy = 'ALLOW_FALLBACK'; });
  rejects('REJECT_PARTIAL_RESULT_CUSTODY', (r) => { r.resultPolicy = 'SUMMARY_ONLY'; });
  rejects('REJECT_SINGLE_REVIEWER', (r) => { r.minimumIndependentReviewerCount = 1; });
  rejects('REJECT_NO_RAW_ARTIFACT_MINIMUM', (r) => { r.minimumRawArtifactCount = 0; });
  rejects('REJECT_WARNING_ALLOWANCE', (r) => { r.maximumUnresolvedWarningCount = 1; });
  rejects('REJECT_EXCEPTION_ALLOWANCE', (r) => { r.maximumUnresolvedExceptionCount = 1; });
  rejects('REJECT_AUTONOMOUS_DISPOSITION', (r) => { r.autonomousCaseDispositionAuthorized = true; });
  rejects('REJECT_AUTOMATIC_ACCEPTANCE', (r) => { r.automaticAssetAcceptanceAuthorized = true; });
  rejects('REJECT_FFS_AUTHORITY', (r) => { r.fitnessForServiceAuthorized = true; });
  rejects('REJECT_REMAINING_STRENGTH_AUTHORITY', (r) => { r.remainingStrengthAuthorized = true; });
  rejects('REJECT_FAILURE_PRESSURE_AUTHORITY', (r) => { r.failurePressureAuthorized = true; });
  rejects('REJECT_POLICY_MUTATION', (r) => { r.productionPolicyMutationAuthorized = true; });
  rejects('REJECT_MERGE_AUTHORITY', (r) => { r.mergeAuthorized = true; });
  rejects('REJECT_MISSING_DOMAIN', (r) => { r.requiredDomains.pop(); });
  rejects('REJECT_DUPLICATE_DOMAIN', (r) => { r.requiredDomains.push(r.requiredDomains[0]); });
  rejects('REJECT_UNKNOWN_FIELD', (r) => { r.unreviewed = true; });

  const base = {
    contract: createProductionRunReceiptContract(),
    productionAuthorizationReceipt: PASSING_NC10_PRODUCTION_AUTHORIZATION_RECEIPT,
    runRegistry: createPassingProductionRuns(),
    domainEvidence: createPassingProductionRunEvidence(),
  };
  const blockedCases = [
    ['BLOCK_MISSING_NC09_RECEIPT', { ...base, productionAuthorizationReceipt: null }],
    ['BLOCK_EMPTY_RUN_REGISTRY', { ...base, runRegistry: [], domainEvidence: [] }],
    ['BLOCK_UNAUTHORIZED_DEPLOYMENT', { ...base, runRegistry: [{ ...base.runRegistry[0], deploymentId: 'DEPLOYMENT-999' }] }],
    ['BLOCK_MISSING_EVIDENCE', { ...base, domainEvidence: base.domainEvidence.slice(1) }],
  ];
  for (const [id, input] of blockedCases) {
    assert.equal(evaluateProductionRunReceiptQualification(input).authority.governedRunReceiptQualified, false);
    results.push({ id, passed: true });
  }
  const mutations = [
    ['BLOCK_BAD_REFERENCE_HASH', (e) => { e[0].referenceHash = 'bad'; }],
    ['BLOCK_LOW_REVIEWER_COUNT', (e) => { e[0].independentReviewerCount = 1; }],
    ['BLOCK_LOW_RAW_ARTIFACT_COUNT', (e) => { e[0].rawArtifactCount = 1; }],
    ['BLOCK_WARNING', (e) => { e[0].unresolvedWarningCount = 1; }],
    ['BLOCK_EXCEPTION', (e) => { e[0].unresolvedExceptionCount = 1; }],
    ['BLOCK_NONZERO_EXIT', (e) => { e[0].exitCode = 2; }],
    ['BLOCK_INCOMPLETE_EXECUTION', (e) => { e[0].executionCompleted = false; }],
    ['BLOCK_BUILD_MISMATCH', (e) => { e[0].exactBuildMatch = false; }],
    ['BLOCK_CONFIG_MISMATCH', (e) => { e[0].exactConfigurationMatch = false; }],
    ['BLOCK_INPUT_CUSTODY_GAP', (e) => { e[0].inputCustodyComplete = false; }],
    ['BLOCK_RAW_CUSTODY_GAP', (e) => { e[0].rawCustodyComplete = false; }],
    ['BLOCK_PARSER_GAP', (e) => { e[0].parserCoverageComplete = false; }],
    ['BLOCK_RECONSTRUCTION_FAILURE', (e) => { e[0].reconstructionVerified = false; }],
    ['BLOCK_LEDGER_FAILURE', (e) => { e[0].calculationLedgerVerified = false; }],
    ['BLOCK_RETRY_LEDGER_GAP', (e) => { e[0].retryLedgerComplete = false; }],
    ['BLOCK_OWNER_DISPOSITION_MISSING', (e) => { e[0].ownerDispositionRecorded = false; }],
    ['BLOCK_RETENTION_MISSING', (e) => { e[0].retentionScheduled = false; }],
    ['BLOCK_FAILED_DISPOSITION', (e) => { e[0].passed = false; }],
  ];
  for (const [id, mutate] of mutations) {
    const evidence = clonePlain(base.domainEvidence);
    mutate(evidence);
    assert.equal(evaluateProductionRunReceiptQualification({ ...base, domainEvidence: evidence }).authority.governedRunReceiptQualified, false);
    results.push({ id, passed: true });
  }
  const autonomousRun = clonePlain(base.runRegistry);
  autonomousRun[0].autonomousDispositionRequested = true;
  assert.equal(evaluateProductionRunReceiptQualification({ ...base, runRegistry: autonomousRun }).authority.governedRunReceiptQualified, false);
  results.push({ id: 'BLOCK_AUTONOMOUS_RUN_REQUEST', passed: true });
  const unknownPredecessor = clonePlain(base.runRegistry);
  unknownPredecessor[0].predecessorRunId = 'RUN-999';
  assert.equal(evaluateProductionRunReceiptQualification({ ...base, runRegistry: unknownPredecessor }).authority.governedRunReceiptQualified, false);
  results.push({ id: 'BLOCK_UNKNOWN_PREDECESSOR', passed: true });
  assert.equal(results.length, 44);
  return results;
}
