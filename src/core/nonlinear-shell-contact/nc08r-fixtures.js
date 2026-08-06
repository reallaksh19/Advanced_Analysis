import { createHash } from 'node:crypto';
import { sealWithHash, sha256Bytes } from './contracts.js';
import {
  DEFAULT_REAL_MODULE_QUALIFICATION_CONTRACT,
  REQUIRED_NC08R_DOMAINS,
} from './real-module-qualification-contract.js';
import { QUALIFIED_NC08_SYNTHETIC_REFERENCE_CUSTODY } from './real-module-qualification-evaluator.js';

const hash = (seed) => sha256Bytes(Buffer.from(seed, 'utf8'));
const gitSha = (seed) => createHash('sha1').update(seed).digest('hex');

export function createValidRealModuleQualificationFixture() {
  const candidateExactHeadSha = gitSha('nc08r-candidate-head');
  const candidateSourceTreeSha = gitSha('nc08r-candidate-source-tree');
  const implementationHash = hash('nc08r-implementation');
  const contract = DEFAULT_REAL_MODULE_QUALIFICATION_CONTRACT;
  const upstreamBinding = sealWithHash({
    schema: 'nonlinear-shell-contact-nc08r-upstream-binding/v1',
    ...QUALIFIED_NC08_SYNTHETIC_REFERENCE_CUSTODY,
  }, 'semanticHash');
  const releaseRecord = sealWithHash({
    schema: 'lafea-nc08r-real-module-release/v1',
    id: 'NC08R-PRODUCTION-MODULE-001',
    moduleVersion: '1.0.0',
    exactHeadSha: candidateExactHeadSha,
    sourceTreeSha: candidateSourceTreeSha,
    buildArtifactHash: hash('build-artifact'),
    artifactSignatureHash: hash('artifact-signature'),
    signatureVerificationHash: hash('signature-verification'),
    buildProvenanceHash: hash('build-provenance'),
    sourceManifestHash: hash('source-manifest'),
    dependencyLockHash: hash('dependency-lock'),
    sbomHash: hash('sbom'),
    runtimeProfileHash: hash('runtime-profile'),
    productionConfigurationHash: hash('production-configuration'),
    apiSchemaHash: hash('api-schema'),
    migrationManifestHash: hash('migration-manifest'),
    regressionManifestHash: hash('regression-manifest'),
    securityAssessmentHash: hash('security-assessment'),
    resourceAssessmentHash: hash('resource-assessment'),
    technicalReviewHash: hash('technical-review'),
    ownerApprovalHash: hash('owner-approval'),
    changeControlHash: hash('change-control'),
    expiryPolicyHash: hash('expiry-policy'),
    revocationPolicyHash: hash('revocation-policy'),
    requalificationPolicyHash: hash('requalification-policy'),
    productionIntended: true,
    artifactSignatureVerified: true,
    provenanceVerified: true,
    dependencyLockVerified: true,
    sbomVerified: true,
    runtimeProfileApproved: true,
    productionConfigurationApproved: true,
    technicalApprovalRecorded: true,
    ownerApprovalRecorded: true,
    simulatedApproval: false,
    unresolvedBlockingFindings: false,
    undeclaredNetworkAccessEnabled: false,
    runtimeExtensionEnabled: false,
    dynamicCodeEnabled: false,
    productionExecutionAuthorized: false,
  }, 'releaseRecordHash');

  const metrics = [
    { nc08ReceiptBound: 1, syntheticReferenceModuleQualified: 1, upstreamModuleQualifiedCount: 0, upstreamProductionAuthorityCount: 0 },
    { exactSourceHeadBound: 1, exactSourceTreeBound: 1, sourceManifestVerified: 1, productionIntendedBuild: 1, syntheticVersionCount: 0 },
    { independentBuildCount: 2, buildReplayIdentical: 1, artifactSignatureVerified: 1, provenanceVerified: 1, artifactDifferenceCount: 0 },
    { dependencyLockVerified: 1, sbomVerified: 1, unregisteredDependencyCount: 0, knownUnacceptedVulnerabilityCount: 0 },
    { apiSchemaBound: 1, migrationManifestBound: 1, migrationTestsPassed: 1, implicitMigrationCount: 0, schemaCompatibilityFailureCount: 0 },
    { referenceRegressionCount: 5, negativeControlCount: 30, negativeControlPassCount: 30, maximumReferenceRelativeDifference: 0, authorityMismatchCount: 0, dispositionMismatchCount: 0 },
    { securityAssessmentPassed: 1, resourceAssessmentPassed: 1, undeclaredNetworkAccessCount: 0, runtimeExtensionCount: 0, dynamicCodeCount: 0, artifactBytes: 262144, governedOperationCount: 10000 },
    { runtimeProfileApproved: 1, productionConfigurationApproved: 1, immutableConfigurationBound: 1, floatingConfigurationCount: 0 },
    { realTechnicalReviewRecorded: 1, realOwnerApprovalRecorded: 1, simulatedApprovalCount: 0, unresolvedBlockingFindingCount: 0 },
    { expiryPolicyBound: 1, revocationPolicyBound: 1, requalificationPolicyBound: 1, governedChangeInvalidatesReceipt: 1, productionExecutionAuthorizationCount: 0, nc10AuthorizationCount: 0 },
  ];

  const domainEvidence = REQUIRED_NC08R_DOMAINS.map((id, index) => sealWithHash({
    schema: 'lafea-nc08r-real-module-evidence/v1',
    id,
    exactHeadSha: candidateExactHeadSha,
    sourceTreeSha: candidateSourceTreeSha,
    implementationHash,
    contractHash: contract.realModuleQualificationContractHash,
    upstreamBindingHash: upstreamBinding.semanticHash,
    releaseRecordHash: releaseRecord.releaseRecordHash,
    metrics: metrics[index],
  }, 'evidenceHash'));

  return {
    contract,
    candidateExactHeadSha,
    candidateSourceTreeSha,
    implementationHash,
    upstreamBinding,
    releaseRecord,
    domainEvidence,
  };
}
