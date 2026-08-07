import {
  HASH_PATTERN, assertArray, assertBoolean, assertExactKeys, assertFiniteNumber,
  assertId, assertPlainData, assertString, deepFreeze, semanticHash,
} from './contracts.js';
import {
  REQUIRED_PRODUCTION_RUN_DOMAINS, validateProductionRunReceiptContract,
} from './production-run-receipt-contract.js';

export function evaluateProductionRunReceiptQualification({
  contract,
  productionAuthorizationReceipt = null,
  runRegistry = [],
  domainEvidence = [],
}) {
  validateProductionRunReceiptContract(contract);
  assertArray(runRegistry, '$runRegistry');
  assertArray(domainEvidence, '$domainEvidence');
  const blockers = [];
  const authorizedDeploymentIds = validateNc09Receipt(productionAuthorizationReceipt, blockers);
  const runs = new Map();
  for (const run of runRegistry) {
    try {
      validateProductionRunRegistration(run);
      if (runs.has(run.id)) blockers.push(`RUN_DUPLICATE_ID:${run.id}`);
      else runs.set(run.id, run);
      if (authorizedDeploymentIds.size && !authorizedDeploymentIds.has(run.deploymentId)) {
        blockers.push(`RUN_UNAUTHORIZED_DEPLOYMENT:${run.id}:${run.deploymentId}`);
      }
    } catch (error) {
      blockers.push(`RUN_INVALID:${run?.id ?? 'UNKNOWN'}:${error.message}`);
    }
  }
  if (runs.size === 0) blockers.push('RUN_REGISTRY_EMPTY');
  for (const run of runs.values()) {
    if (run.predecessorRunId !== 'NONE' && !runs.has(run.predecessorRunId)) {
      blockers.push(`RUN_PREDECESSOR_UNKNOWN:${run.id}:${run.predecessorRunId}`);
    }
    if (run.predecessorRunId === run.id) blockers.push(`RUN_PREDECESSOR_SELF_REFERENCE:${run.id}`);
  }
  const evidenceKeys = new Set();
  for (const evidence of domainEvidence) {
    const key = `${evidence?.runId}:${evidence?.id}`;
    if (evidenceKeys.has(key)) blockers.push(`RUN_EVIDENCE_DUPLICATE:${key}`);
    evidenceKeys.add(key);
  }
  for (const run of runs.values()) {
    for (const id of REQUIRED_PRODUCTION_RUN_DOMAINS) {
      const evidence = domainEvidence.find((entry) => entry?.runId === run.id && entry?.id === id);
      if (!evidence) {
        blockers.push(`RUN_EVIDENCE_MISSING:${run.id}:${id}`);
        continue;
      }
      try {
        validateProductionRunEvidence(evidence, contract, runs);
        if (evidence.passed !== true) blockers.push(`RUN_EVIDENCE_FAILED:${run.id}:${id}`);
      } catch (error) {
        blockers.push(`RUN_EVIDENCE_INVALID:${run.id}:${id}:${error.message}`);
      }
    }
  }
  for (const evidence of domainEvidence) {
    if (!runs.has(evidence?.runId)) blockers.push(`RUN_EVIDENCE_UNKNOWN_RUN:${evidence?.runId ?? 'UNKNOWN'}`);
  }
  const governedRunReceiptQualified = blockers.length === 0;
  const report = {
    schema: 'nonlinear-shell-contact-nc10-report/v1',
    status: governedRunReceiptQualified ? 'NC10_RUN_RECEIPTS_QUALIFIED' : 'NC10_BLOCKED',
    productionRunReceiptContractHash: contract.productionRunReceiptContractHash,
    registeredRunCount: runs.size,
    qualifiedRunIds: governedRunReceiptQualified ? [...runs.keys()].sort() : [],
    blockers: [...blockers].sort(),
    authority: {
      nc10ContractQualified: true,
      productionExecutionAuthorized: productionAuthorizationReceipt?.productionExecutionAuthorized === true,
      governedRunReceiptQualified,
      autonomousCaseDispositionAuthorized: false,
      automaticAssetAcceptanceAuthorized: false,
      fitnessForServiceQualified: false,
      remainingStrengthQualified: false,
    },
  };
  return deepFreeze({ ...report, reportSemanticHash: semanticHash(report) });
}

export function validateProductionRunRegistration(value) {
  assertPlainData(value, '$productionRunRegistration');
  assertExactKeys(value, [
    'id', 'deploymentId', 'moduleBuildId', 'caseId', 'casePackageHash', 'inputSchemaHash',
    'inputArchiveHash', 'executionRequestHash', 'executionReceiptHash', 'rawManifestHash',
    'parserInventoryHash', 'reconstructionHash', 'calculationLedgerHash',
    'operatorIdentityHash', 'runWindowHash', 'environmentSnapshotHash', 'configurationHash',
    'predecessorRunId', 'autonomousDispositionRequested',
  ], '$productionRunRegistration');
  for (const field of ['id', 'deploymentId', 'moduleBuildId', 'caseId']) assertId(value[field], `$productionRunRegistration.${field}`);
  for (const field of [
    'casePackageHash', 'inputSchemaHash', 'inputArchiveHash', 'executionRequestHash',
    'executionReceiptHash', 'rawManifestHash', 'parserInventoryHash', 'reconstructionHash',
    'calculationLedgerHash', 'operatorIdentityHash', 'runWindowHash', 'environmentSnapshotHash',
    'configurationHash',
  ]) {
    if (!HASH_PATTERN.test(value[field] ?? '')) throw new TypeError(`${field} must be a governed hash.`);
  }
  assertString(value.predecessorRunId, '$productionRunRegistration.predecessorRunId');
  if (value.predecessorRunId !== 'NONE') assertId(value.predecessorRunId, '$productionRunRegistration.predecessorRunId');
  assertBoolean(value.autonomousDispositionRequested, '$productionRunRegistration.autonomousDispositionRequested');
  if (value.autonomousDispositionRequested !== false) throw new TypeError('Autonomous disposition is forbidden.');
  return true;
}

function validateNc09Receipt(receipt, blockers) {
  const deploymentIds = new Set();
  if (!receipt || receipt.productionExecutionAuthorized !== true || !HASH_PATTERN.test(receipt.receiptHash ?? '')) {
    blockers.push('NC09_PRODUCTION_AUTHORIZATION_RECEIPT_MISSING_OR_UNQUALIFIED');
    return deploymentIds;
  }
  if (!Array.isArray(receipt.authorizedDeploymentIds) || receipt.authorizedDeploymentIds.length === 0) {
    blockers.push('NC09_AUTHORIZED_DEPLOYMENT_SET_EMPTY');
    return deploymentIds;
  }
  for (const id of receipt.authorizedDeploymentIds) {
    try { assertId(id, 'authorizedDeploymentId'); } catch (error) {
      blockers.push(`NC09_AUTHORIZED_DEPLOYMENT_INVALID:${error.message}`);
      continue;
    }
    if (deploymentIds.has(id)) blockers.push(`NC09_AUTHORIZED_DEPLOYMENT_DUPLICATE:${id}`);
    deploymentIds.add(id);
  }
  return deploymentIds;
}

function validateProductionRunEvidence(evidence, contract, runs) {
  assertPlainData(evidence, '$productionRunEvidence');
  assertExactKeys(evidence, [
    'id', 'runId', 'referenceHash', 'rawEvidenceHash', 'reviewerRecordHash',
    'independentReviewerCount', 'rawArtifactCount', 'unresolvedWarningCount',
    'unresolvedExceptionCount', 'exitCode', 'executionCompleted', 'exactBuildMatch',
    'exactConfigurationMatch', 'inputCustodyComplete', 'rawCustodyComplete',
    'parserCoverageComplete', 'reconstructionVerified', 'calculationLedgerVerified',
    'retryLedgerComplete', 'ownerDispositionRecorded', 'retentionScheduled', 'passed',
  ], '$productionRunEvidence');
  if (!REQUIRED_PRODUCTION_RUN_DOMAINS.includes(evidence.id)) throw new TypeError('Unknown production-run evidence domain.');
  if (!runs.has(evidence.runId)) throw new TypeError('Evidence references an unregistered run.');
  for (const field of ['referenceHash', 'rawEvidenceHash', 'reviewerRecordHash']) {
    if (!HASH_PATTERN.test(evidence[field] ?? '')) throw new TypeError(`${field} is required.`);
  }
  assertFiniteNumber(evidence.independentReviewerCount, 'independentReviewerCount', Number.isInteger, 'integer');
  if (evidence.independentReviewerCount < contract.minimumIndependentReviewerCount) throw new TypeError('Independent reviewer count is insufficient.');
  assertFiniteNumber(evidence.rawArtifactCount, 'rawArtifactCount', Number.isInteger, 'integer');
  if (evidence.rawArtifactCount < contract.minimumRawArtifactCount) throw new TypeError('Raw artifact count is insufficient.');
  for (const [field, maximum] of [
    ['unresolvedWarningCount', contract.maximumUnresolvedWarningCount],
    ['unresolvedExceptionCount', contract.maximumUnresolvedExceptionCount],
  ]) {
    assertFiniteNumber(evidence[field], field, Number.isInteger, 'integer');
    if (evidence[field] > maximum) throw new TypeError(`${field} exceeds the contract limit.`);
  }
  assertFiniteNumber(evidence.exitCode, 'exitCode', Number.isInteger, 'integer');
  if (evidence.exitCode !== 0) throw new TypeError('Execution exit code must be zero.');
  for (const field of [
    'executionCompleted', 'exactBuildMatch', 'exactConfigurationMatch', 'inputCustodyComplete',
    'rawCustodyComplete', 'parserCoverageComplete', 'reconstructionVerified',
    'calculationLedgerVerified', 'retryLedgerComplete', 'ownerDispositionRecorded',
    'retentionScheduled', 'passed',
  ]) {
    assertBoolean(evidence[field], field);
    if (evidence[field] !== true) throw new TypeError(`${field} must be true.`);
  }
}
