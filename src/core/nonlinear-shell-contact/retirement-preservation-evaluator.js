import {
  HASH_PATTERN, assertArray, assertBoolean, assertExactKeys, assertFiniteNumber,
  assertId, assertPlainData, deepFreeze, semanticHash,
} from './contracts.js';
import {
  REQUIRED_RETIREMENT_PRESERVATION_DOMAINS, validateRetirementPreservationContract,
} from './retirement-preservation-contract.js';

export function evaluateRetirementPreservationQualification({
  contract,
  operationalSurveillanceReceipt = null,
  retirementRegistry = [],
  domainEvidence = [],
}) {
  validateRetirementPreservationContract(contract);
  assertArray(retirementRegistry, '$retirementRegistry');
  assertArray(domainEvidence, '$domainEvidence');
  const blockers = [];
  const surveillanceIds = validateNc11Receipt(operationalSurveillanceReceipt, blockers);
  const retirements = new Map();
  for (const record of retirementRegistry) {
    try {
      validateRetirementRegistration(record);
      if (retirements.has(record.id)) blockers.push(`RETIREMENT_DUPLICATE_ID:${record.id}`);
      else retirements.set(record.id, record);
      if (surveillanceIds.size && !surveillanceIds.has(record.surveillanceId)) {
        blockers.push(`RETIREMENT_UNQUALIFIED_SURVEILLANCE:${record.id}:${record.surveillanceId}`);
      }
    } catch (error) {
      blockers.push(`RETIREMENT_INVALID:${record?.id ?? 'UNKNOWN'}:${error.message}`);
    }
  }
  if (retirements.size === 0) blockers.push('RETIREMENT_REGISTRY_EMPTY');
  const evidenceKeys = new Set();
  for (const evidence of domainEvidence) {
    const key = `${evidence?.retirementId}:${evidence?.id}`;
    if (evidenceKeys.has(key)) blockers.push(`RETIREMENT_EVIDENCE_DUPLICATE:${key}`);
    evidenceKeys.add(key);
  }
  for (const record of retirements.values()) {
    for (const id of REQUIRED_RETIREMENT_PRESERVATION_DOMAINS) {
      const evidence = domainEvidence.find((entry) => entry?.retirementId === record.id && entry?.id === id);
      if (!evidence) {
        blockers.push(`RETIREMENT_EVIDENCE_MISSING:${record.id}:${id}`);
        continue;
      }
      try {
        validateRetirementEvidence(evidence, contract, retirements);
        if (evidence.passed !== true) blockers.push(`RETIREMENT_EVIDENCE_FAILED:${record.id}:${id}`);
      } catch (error) {
        blockers.push(`RETIREMENT_EVIDENCE_INVALID:${record.id}:${id}:${error.message}`);
      }
    }
  }
  for (const evidence of domainEvidence) {
    if (!retirements.has(evidence?.retirementId)) blockers.push(`RETIREMENT_EVIDENCE_UNKNOWN_RECORD:${evidence?.retirementId ?? 'UNKNOWN'}`);
  }
  const retirementPreservationQualified = blockers.length === 0;
  const report = {
    schema: 'nonlinear-shell-contact-nc12-report/v1',
    status: retirementPreservationQualified ? 'NC12_RETIREMENT_QUALIFIED' : 'NC12_BLOCKED',
    retirementPreservationContractHash: contract.retirementPreservationContractHash,
    registeredRetirementCount: retirements.size,
    qualifiedRetirementIds: retirementPreservationQualified ? [...retirements.keys()].sort() : [],
    blockers: [...blockers].sort(),
    authority: {
      nc12ContractQualified: true,
      operationalSurveillanceQualified: operationalSurveillanceReceipt?.operationalSurveillanceQualified === true,
      retirementPreservationQualified,
      productionExecutionAuthorized: false,
      productionReactivationAuthorized: false,
      autonomousCaseDispositionAuthorized: false,
      automaticAssetAcceptanceAuthorized: false,
      fitnessForServiceQualified: false,
      remainingStrengthQualified: false,
    },
  };
  return deepFreeze({ ...report, reportSemanticHash: semanticHash(report) });
}

export function validateRetirementRegistration(value) {
  assertPlainData(value, '$retirementRegistration');
  assertExactKeys(value, [
    'id', 'surveillanceId', 'deploymentIds', 'moduleBuildIds', 'sourceArchiveHash',
    'artifactArchiveHash', 'configurationArchiveHash', 'receiptChainArchiveHash',
    'caseLedgerArchiveHash', 'auditLedgerArchiveHash', 'openCaseTransferHash',
    'successorMappingHash', 'retentionScheduleHash', 'privacyReviewHash',
    'credentialRevocationHash', 'deploymentTeardownHash', 'ownerApprovalHash',
    'closeoutReportHash', 'productionReactivationRequested',
  ], '$retirementRegistration');
  for (const field of ['id', 'surveillanceId']) assertId(value[field], `$retirementRegistration.${field}`);
  for (const [field, values] of [['deploymentIds', value.deploymentIds], ['moduleBuildIds', value.moduleBuildIds]]) {
    assertArray(values, `$retirementRegistration.${field}`, { min: 1 });
    const unique = new Set();
    values.forEach((id, index) => {
      assertId(id, `$retirementRegistration.${field}[${index}]`);
      if (unique.has(id)) throw new TypeError(`${field} must be unique.`);
      unique.add(id);
    });
  }
  for (const field of [
    'sourceArchiveHash', 'artifactArchiveHash', 'configurationArchiveHash',
    'receiptChainArchiveHash', 'caseLedgerArchiveHash', 'auditLedgerArchiveHash',
    'openCaseTransferHash', 'successorMappingHash', 'retentionScheduleHash',
    'privacyReviewHash', 'credentialRevocationHash', 'deploymentTeardownHash',
    'ownerApprovalHash', 'closeoutReportHash',
  ]) {
    if (!HASH_PATTERN.test(value[field] ?? '')) throw new TypeError(`${field} must be a governed hash.`);
  }
  assertBoolean(value.productionReactivationRequested, '$retirementRegistration.productionReactivationRequested');
  if (value.productionReactivationRequested !== false) throw new TypeError('Production reactivation is forbidden.');
  return true;
}

function validateNc11Receipt(receipt, blockers) {
  const ids = new Set();
  if (!receipt || receipt.operationalSurveillanceQualified !== true || !HASH_PATTERN.test(receipt.receiptHash ?? '')) {
    blockers.push('NC11_SURVEILLANCE_RECEIPT_MISSING_OR_UNQUALIFIED');
    return ids;
  }
  if (!Array.isArray(receipt.qualifiedSurveillanceIds) || receipt.qualifiedSurveillanceIds.length === 0) {
    blockers.push('NC11_QUALIFIED_SURVEILLANCE_SET_EMPTY');
    return ids;
  }
  for (const id of receipt.qualifiedSurveillanceIds) {
    try { assertId(id, 'qualifiedSurveillanceId'); } catch (error) {
      blockers.push(`NC11_QUALIFIED_SURVEILLANCE_INVALID:${error.message}`);
      continue;
    }
    if (ids.has(id)) blockers.push(`NC11_QUALIFIED_SURVEILLANCE_DUPLICATE:${id}`);
    ids.add(id);
  }
  return ids;
}

function validateRetirementEvidence(evidence, contract, retirements) {
  assertPlainData(evidence, '$retirementPreservationEvidence');
  assertExactKeys(evidence, [
    'id', 'retirementId', 'referenceHash', 'rawEvidenceHash', 'verifierRecordHash',
    'independentVerifierCount', 'archiveReplicaCount', 'recoveryReproductionCount',
    'activeCredentialCount', 'activeDeploymentCount', 'orphanedCaseCount',
    'archiveIntegrityFailureCount', 'ownerApprovalVerified', 'credentialsRevoked',
    'deploymentsRemoved', 'artifactsArchived', 'receiptChainArchived',
    'caseAndAuditLedgersPreserved', 'openCasesTransferred', 'successorMappingVerified',
    'readOnlyRecoveryVerified', 'retentionAndPrivacyVerified', 'noExecutionPathVerified',
    'closeoutReportSigned', 'passed',
  ], '$retirementPreservationEvidence');
  if (!REQUIRED_RETIREMENT_PRESERVATION_DOMAINS.includes(evidence.id)) throw new TypeError('Unknown retirement-preservation evidence domain.');
  if (!retirements.has(evidence.retirementId)) throw new TypeError('Evidence references an unregistered retirement record.');
  for (const field of ['referenceHash', 'rawEvidenceHash', 'verifierRecordHash']) {
    if (!HASH_PATTERN.test(evidence[field] ?? '')) throw new TypeError(`${field} is required.`);
  }
  for (const [field, minimum] of [
    ['independentVerifierCount', contract.minimumIndependentVerifierCount],
    ['archiveReplicaCount', contract.minimumArchiveReplicaCount],
    ['recoveryReproductionCount', contract.minimumRecoveryReproductionCount],
  ]) {
    assertFiniteNumber(evidence[field], field, Number.isInteger, 'integer');
    if (evidence[field] < minimum) throw new TypeError(`${field} is insufficient.`);
  }
  for (const [field, maximum] of [
    ['activeCredentialCount', contract.maximumActiveCredentialCount],
    ['activeDeploymentCount', contract.maximumActiveDeploymentCount],
    ['orphanedCaseCount', contract.maximumOrphanedCaseCount],
    ['archiveIntegrityFailureCount', contract.maximumArchiveIntegrityFailureCount],
  ]) {
    assertFiniteNumber(evidence[field], field, Number.isInteger, 'integer');
    if (evidence[field] > maximum) throw new TypeError(`${field} exceeds the contract limit.`);
  }
  for (const field of [
    'ownerApprovalVerified', 'credentialsRevoked', 'deploymentsRemoved', 'artifactsArchived',
    'receiptChainArchived', 'caseAndAuditLedgersPreserved', 'openCasesTransferred',
    'successorMappingVerified', 'readOnlyRecoveryVerified', 'retentionAndPrivacyVerified',
    'noExecutionPathVerified', 'closeoutReportSigned', 'passed',
  ]) {
    assertBoolean(evidence[field], field);
    if (evidence[field] !== true) throw new TypeError(`${field} must be true.`);
  }
}
