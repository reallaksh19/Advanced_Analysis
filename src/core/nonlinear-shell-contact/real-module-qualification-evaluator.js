import {
  GIT_SHA_PATTERN,
  HASH_PATTERN,
  assertBoolean,
  assertExactKeys,
  assertGitSha,
  assertHash,
  assertId,
  assertPlainData,
  assertString,
  deepFreeze,
  semanticHash,
  verifySealedHash,
} from './contracts.js';
import {
  REQUIRED_NC08R_DOMAINS,
  validateRealModuleQualificationContract,
} from './real-module-qualification-contract.js';

const UPSTREAM_SCHEMA = 'nonlinear-shell-contact-nc08r-upstream-binding/v1';
const RELEASE_SCHEMA = 'lafea-nc08r-real-module-release/v1';
const EVIDENCE_SCHEMA = 'lafea-nc08r-real-module-evidence/v1';

export const QUALIFIED_NC08_SYNTHETIC_REFERENCE_CUSTODY = deepFreeze({
  nc08ExactHeadSha: 'e7f5f725c98861c7d734f64f75925602225e8e4b',
  nc08ReportHash: 'sha256:b7b38c0018978c1ded085d0590d4899c55734735104dd23fa16007136afd9705',
  nc08ArtifactDigest: 'sha256:6d39eee81da5a469f8a8455056ceabf413831fc7550ec2518c9d18989a472755',
  nc08BuildRecordHash: 'sha256:b7eb1e1ec26fbaaf2a54601d276155042dbe06888eb5f5c47fa768b8e4214b22',
  nc08BuildArtifactHash: 'sha256:2890f118cb88ff398c2147953bf13b157d08c96b18f557925a4b8bc102caa0a9',
  nc08UpstreamBindingHash: 'sha256:d3e592d595f3419ba13341b9d63710184792e2fd34f09265cbf73c9715555c40',
  syntheticBuildId: 'NC08-SYNTHETIC-REFERENCE-MODULE-001',
  syntheticReferenceModuleQualified: true,
  moduleQualified: false,
  productionExecutionAuthorized: false,
});

export function evaluateRealModuleQualification({
  contract,
  candidateExactHeadSha,
  candidateSourceTreeSha,
  implementationHash,
  upstreamBinding,
  releaseRecord,
  domainEvidence,
}) {
  validateRealModuleQualificationContract(contract);
  const blockers = [];

  if (!GIT_SHA_PATTERN.test(candidateExactHeadSha ?? '')) blockers.push('CANDIDATE_HEAD_INVALID');
  if (!GIT_SHA_PATTERN.test(candidateSourceTreeSha ?? '')) blockers.push('CANDIDATE_SOURCE_TREE_INVALID');
  if (!HASH_PATTERN.test(implementationHash ?? '')) blockers.push('IMPLEMENTATION_HASH_INVALID');

  try {
    validateUpstreamBinding(upstreamBinding);
  } catch (error) {
    blockers.push(`UPSTREAM_INVALID:${error.message}`);
  }
  try {
    validateRealModuleReleaseRecord(
      releaseRecord,
      candidateExactHeadSha,
      candidateSourceTreeSha,
      contract,
    );
  } catch (error) {
    blockers.push(`RELEASE_INVALID:${error.message}`);
  }

  const rows = Array.isArray(domainEvidence) ? domainEvidence : [];
  const evidenceById = new Map();
  for (const row of rows) {
    if (evidenceById.has(row?.id)) blockers.push(`EVIDENCE_DUPLICATE:${row?.id ?? 'UNKNOWN'}`);
    else evidenceById.set(row?.id, row);
  }

  for (const id of REQUIRED_NC08R_DOMAINS) {
    const row = evidenceById.get(id);
    if (!row) {
      blockers.push(`EVIDENCE_MISSING:${id}`);
      continue;
    }
    try {
      validateEvidence(row, id, {
        contract,
        candidateExactHeadSha,
        candidateSourceTreeSha,
        implementationHash,
        upstreamBinding,
        releaseRecord,
      });
    } catch (error) {
      blockers.push(`EVIDENCE_INVALID:${id}:${error.message}`);
    }
  }
  for (const row of rows) {
    if (!REQUIRED_NC08R_DOMAINS.includes(row?.id)) {
      blockers.push(`EVIDENCE_UNKNOWN:${row?.id ?? 'UNKNOWN'}`);
    }
  }

  const qualified = blockers.length === 0;
  const payload = {
    schema: 'nonlinear-shell-contact-nc08r-real-module-report/v1',
    status: qualified ? 'NC08R_REAL_MODULE_QUALIFIED' : 'NC08R_BLOCKED',
    candidateExactHeadSha,
    candidateSourceTreeSha,
    realModuleQualificationContractHash: contract.realModuleQualificationContractHash,
    implementationHash,
    upstreamBindingHash: upstreamBinding?.semanticHash ?? null,
    releaseRecordHash: releaseRecord?.releaseRecordHash ?? null,
    registeredReleaseCount: releaseRecord ? 1 : 0,
    qualifiedRealModuleIds: qualified ? [releaseRecord.id] : [],
    evaluatedDomainCount: evidenceById.size,
    blockers: blockers.sort(),
    authority: {
      nc08rContractQualified: true,
      syntheticReferenceModuleQualified: upstreamBinding?.syntheticReferenceModuleQualified === true,
      realModuleQualificationQualified: qualified,
      moduleQualified: qualified,
      nc09ProductionAuthorizationAuthorized: qualified,
      productionExecutionAuthorized: false,
      nc10Authorized: false,
      codeAssessmentQualified: false,
      realAssetAssessmentQualified: false,
      externalCodeComplianceQualified: false,
      fitnessForServiceQualified: false,
      remainingStrengthQualified: false,
      failurePressureQualified: false,
      automaticAssetAcceptanceAuthorized: false,
      autonomousCaseDispositionAuthorized: false,
    },
  };
  return deepFreeze({ ...payload, reportSemanticHash: semanticHash(payload) });
}

export function validateUpstreamBinding(value) {
  assertPlainData(value, '$upstreamBinding');
  assertExactKeys(value, [
    'schema', 'nc08ExactHeadSha', 'nc08ReportHash', 'nc08ArtifactDigest',
    'nc08BuildRecordHash', 'nc08BuildArtifactHash', 'nc08UpstreamBindingHash',
    'syntheticBuildId', 'syntheticReferenceModuleQualified', 'moduleQualified',
    'productionExecutionAuthorized', 'semanticHash',
  ], '$upstreamBinding');
  verifySealedHash(value, 'semanticHash', '$upstreamBinding');
  if (value.schema !== UPSTREAM_SCHEMA) throw new TypeError('schema');
  assertGitSha(value.nc08ExactHeadSha, '$upstreamBinding.nc08ExactHeadSha');
  for (const key of [
    'nc08ReportHash', 'nc08ArtifactDigest', 'nc08BuildRecordHash',
    'nc08BuildArtifactHash', 'nc08UpstreamBindingHash',
  ]) assertHash(value[key], `$upstreamBinding.${key}`);
  assertId(value.syntheticBuildId, '$upstreamBinding.syntheticBuildId');

  for (const [key, expected] of Object.entries(QUALIFIED_NC08_SYNTHETIC_REFERENCE_CUSTODY)) {
    if (value[key] !== expected) throw new TypeError(`${key} does not match qualified NC-08 custody`);
  }
  return true;
}

export function validateRealModuleReleaseRecord(
  value,
  candidateExactHeadSha,
  candidateSourceTreeSha,
  contract,
) {
  assertPlainData(value, '$releaseRecord');
  assertExactKeys(value, [
    'schema', 'id', 'moduleVersion', 'exactHeadSha', 'sourceTreeSha',
    'buildArtifactHash', 'artifactSignatureHash', 'signatureVerificationHash',
    'buildProvenanceHash', 'sourceManifestHash', 'dependencyLockHash', 'sbomHash',
    'runtimeProfileHash', 'productionConfigurationHash', 'apiSchemaHash',
    'migrationManifestHash', 'regressionManifestHash', 'securityAssessmentHash',
    'resourceAssessmentHash', 'technicalReviewHash', 'ownerApprovalHash',
    'changeControlHash', 'expiryPolicyHash', 'revocationPolicyHash',
    'requalificationPolicyHash', 'productionIntended', 'artifactSignatureVerified',
    'provenanceVerified', 'dependencyLockVerified', 'sbomVerified',
    'runtimeProfileApproved', 'productionConfigurationApproved',
    'technicalApprovalRecorded', 'ownerApprovalRecorded', 'simulatedApproval',
    'unresolvedBlockingFindings', 'undeclaredNetworkAccessEnabled',
    'runtimeExtensionEnabled', 'dynamicCodeEnabled', 'productionExecutionAuthorized',
    'releaseRecordHash',
  ], '$releaseRecord');
  verifySealedHash(value, 'releaseRecordHash', '$releaseRecord');
  if (value.schema !== RELEASE_SCHEMA) throw new TypeError('schema');
  assertId(value.id, '$releaseRecord.id');
  assertString(value.moduleVersion, '$releaseRecord.moduleVersion');
  if (/synthetic|reference/iu.test(value.moduleVersion)) {
    throw new TypeError('moduleVersion identifies a synthetic/reference build');
  }
  assertGitSha(value.exactHeadSha, '$releaseRecord.exactHeadSha');
  assertGitSha(value.sourceTreeSha, '$releaseRecord.sourceTreeSha');
  if (value.exactHeadSha !== candidateExactHeadSha) throw new TypeError('exact head mismatch');
  if (value.sourceTreeSha !== candidateSourceTreeSha) throw new TypeError('source tree mismatch');

  for (const key of [
    'buildArtifactHash', 'artifactSignatureHash', 'signatureVerificationHash',
    'buildProvenanceHash', 'sourceManifestHash', 'dependencyLockHash', 'sbomHash',
    'runtimeProfileHash', 'productionConfigurationHash', 'apiSchemaHash',
    'migrationManifestHash', 'regressionManifestHash', 'securityAssessmentHash',
    'resourceAssessmentHash', 'technicalReviewHash', 'ownerApprovalHash',
    'changeControlHash', 'expiryPolicyHash', 'revocationPolicyHash',
    'requalificationPolicyHash',
  ]) assertHash(value[key], `$releaseRecord.${key}`);

  for (const key of [
    'productionIntended', 'artifactSignatureVerified', 'provenanceVerified',
    'dependencyLockVerified', 'sbomVerified', 'runtimeProfileApproved',
    'productionConfigurationApproved', 'technicalApprovalRecorded',
    'ownerApprovalRecorded',
  ]) {
    assertBoolean(value[key], `$releaseRecord.${key}`);
    if (value[key] !== true) throw new TypeError(key);
  }
  for (const key of [
    'simulatedApproval', 'unresolvedBlockingFindings', 'undeclaredNetworkAccessEnabled',
    'runtimeExtensionEnabled', 'dynamicCodeEnabled', 'productionExecutionAuthorized',
  ]) {
    assertBoolean(value[key], `$releaseRecord.${key}`);
    if (value[key] !== false) throw new TypeError(key);
  }
  if (contract.productionExecutionAuthorized !== false) {
    throw new TypeError('contract production authority');
  }
  return true;
}

function validateEvidence(row, id, context) {
  assertPlainData(row, `$evidence.${id}`);
  assertExactKeys(row, [
    'schema', 'id', 'exactHeadSha', 'sourceTreeSha', 'implementationHash',
    'contractHash', 'upstreamBindingHash', 'releaseRecordHash', 'metrics',
    'evidenceHash',
  ], `$evidence.${id}`);
  verifySealedHash(row, 'evidenceHash', `$evidence.${id}`);
  if (row.schema !== EVIDENCE_SCHEMA || row.id !== id) throw new TypeError('schema or id');
  if (
    row.exactHeadSha !== context.candidateExactHeadSha ||
    row.sourceTreeSha !== context.candidateSourceTreeSha ||
    row.implementationHash !== context.implementationHash ||
    row.contractHash !== context.contract.realModuleQualificationContractHash ||
    row.upstreamBindingHash !== context.upstreamBinding?.semanticHash ||
    row.releaseRecordHash !== context.releaseRecord?.releaseRecordHash
  ) throw new TypeError('binding');
  validateMetrics(id, row.metrics, context.contract);
}

function validateMetrics(id, metrics, contract) {
  assertPlainData(metrics, `$metrics.${id}`);
  const one = (key) => { if (metrics[key] !== 1) throw new TypeError(key); };
  const zero = (key) => { if (metrics[key] !== 0) throw new TypeError(key); };
  switch (id) {
    case REQUIRED_NC08R_DOMAINS[0]:
      one('nc08ReceiptBound');
      one('syntheticReferenceModuleQualified');
      zero('upstreamModuleQualifiedCount');
      zero('upstreamProductionAuthorityCount');
      break;
    case REQUIRED_NC08R_DOMAINS[1]:
      one('exactSourceHeadBound');
      one('exactSourceTreeBound');
      one('sourceManifestVerified');
      one('productionIntendedBuild');
      zero('syntheticVersionCount');
      break;
    case REQUIRED_NC08R_DOMAINS[2]:
      if (metrics.independentBuildCount < contract.minimumIndependentBuildCount) throw new TypeError('independentBuildCount');
      one('buildReplayIdentical');
      one('artifactSignatureVerified');
      one('provenanceVerified');
      zero('artifactDifferenceCount');
      break;
    case REQUIRED_NC08R_DOMAINS[3]:
      one('dependencyLockVerified');
      one('sbomVerified');
      zero('unregisteredDependencyCount');
      zero('knownUnacceptedVulnerabilityCount');
      break;
    case REQUIRED_NC08R_DOMAINS[4]:
      one('apiSchemaBound');
      one('migrationManifestBound');
      one('migrationTestsPassed');
      zero('implicitMigrationCount');
      zero('schemaCompatibilityFailureCount');
      break;
    case REQUIRED_NC08R_DOMAINS[5]:
      if (metrics.referenceRegressionCount < contract.minimumReferenceRegressionCount) throw new TypeError('referenceRegressionCount');
      if (metrics.negativeControlCount < contract.minimumNegativeControlCount) throw new TypeError('negativeControlCount');
      if (metrics.negativeControlPassCount !== metrics.negativeControlCount) throw new TypeError('negativeControlPassCount');
      if (!Number.isFinite(metrics.maximumReferenceRelativeDifference) ||
          metrics.maximumReferenceRelativeDifference < 0 ||
          metrics.maximumReferenceRelativeDifference > contract.maximumReferenceRelativeDifference) {
        throw new TypeError('maximumReferenceRelativeDifference');
      }
      zero('authorityMismatchCount');
      zero('dispositionMismatchCount');
      break;
    case REQUIRED_NC08R_DOMAINS[6]:
      one('securityAssessmentPassed');
      one('resourceAssessmentPassed');
      zero('undeclaredNetworkAccessCount');
      zero('runtimeExtensionCount');
      zero('dynamicCodeCount');
      if (metrics.artifactBytes > contract.maximumArtifactBytes) throw new TypeError('artifactBytes');
      if (metrics.governedOperationCount > contract.maximumGovernedOperationCount) throw new TypeError('governedOperationCount');
      break;
    case REQUIRED_NC08R_DOMAINS[7]:
      one('runtimeProfileApproved');
      one('productionConfigurationApproved');
      one('immutableConfigurationBound');
      zero('floatingConfigurationCount');
      break;
    case REQUIRED_NC08R_DOMAINS[8]:
      one('realTechnicalReviewRecorded');
      one('realOwnerApprovalRecorded');
      zero('simulatedApprovalCount');
      zero('unresolvedBlockingFindingCount');
      break;
    case REQUIRED_NC08R_DOMAINS[9]:
      one('expiryPolicyBound');
      one('revocationPolicyBound');
      one('requalificationPolicyBound');
      one('governedChangeInvalidatesReceipt');
      zero('productionExecutionAuthorizationCount');
      zero('nc10AuthorizationCount');
      break;
    default:
      throw new TypeError('unknown domain');
  }
}
