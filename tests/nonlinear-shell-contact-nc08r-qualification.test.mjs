import test from 'node:test';
import assert from 'node:assert/strict';
import { sealWithHash } from '../src/core/nonlinear-shell-contact/contracts.js';
import {
  DEFAULT_REAL_MODULE_QUALIFICATION_CONTRACT,
  REQUIRED_NC08R_DOMAINS,
  validateRealModuleQualificationContract,
} from '../src/core/nonlinear-shell-contact/real-module-qualification-contract.js';
import { evaluateRealModuleQualification } from '../src/core/nonlinear-shell-contact/real-module-qualification-evaluator.js';
import {
  createRealModuleNegativeControls,
  REAL_MODULE_NEGATIVE_CONTROL_IDS,
} from '../src/core/nonlinear-shell-contact/real-module-negative-controls.js';

const H = (character) => `sha256:${character.repeat(64)}`;
const HEAD = 'a'.repeat(40);

const upstreamBinding = sealWithHash({
  schema: 'nonlinear-shell-contact-nc08r-upstream-binding/v1',
  syntheticReferenceModuleQualified: true,
  moduleQualified: false,
  syntheticBuildId: 'NC08-SYNTHETIC-REFERENCE-MODULE-001',
  nc08ExactHeadSha: 'b'.repeat(40),
  nc08ReportHash: H('1'),
  nc08ArtifactDigest: H('2'),
  nc08BuildRecordHash: H('3'),
  nc08BuildArtifactHash: H('4'),
}, 'semanticHash');

const moduleRecord = sealWithHash({
  schema: 'lafea-nc08r-real-module-record/v1',
  moduleId: 'LAFEA-NONLINEAR-SHELL-CONTACT',
  moduleVersion: '1.0.0',
  exactHeadSha: HEAD,
  sourceTreeSha: 'c'.repeat(40),
  productionIntended: true,
  artifactSigned: true,
  signatureVerified: true,
  provenanceVerified: true,
  sourceManifestVerified: true,
  dependencyLockVerified: true,
  sbomVerified: true,
  externalConnectivityEnabled: false,
  runtimeExtensionEnabled: false,
  dynamicCodeEnabled: false,
  buildArtifactHash: H('5'),
  artifactSignatureHash: H('6'),
  buildProvenanceHash: H('7'),
  sourceManifestHash: H('8'),
  dependencyLockHash: H('9'),
  sbomHash: H('a'),
  apiSchemaHash: H('b'),
  migrationManifestHash: H('c'),
  runtimeProfileHash: H('d'),
  testManifestHash: H('e'),
  rollbackPackageHash: H('f'),
  runbookHash: H('0'),
}, 'moduleRecordHash');

const releaseApproval = sealWithHash({
  schema: 'lafea-nc08r-real-release-approval/v1',
  moduleRecordHash: moduleRecord.moduleRecordHash,
  simulatedApproval: false,
  technicalReviewApproved: true,
  ownerReleaseApproved: true,
  securityReviewApproved: true,
  approvalExpired: false,
  approvalRevoked: false,
  technicalReviewerIdentityHash: H('1'),
  ownerApproverIdentityHash: H('2'),
  securityReviewerIdentityHash: H('3'),
  approvalRecordHash: H('4'),
}, 'releaseApprovalHash');

const metrics = [
  { nc08ReceiptBound: 1, syntheticReferenceModuleQualified: 1, upstreamAuthorityEscalationCount: 0 },
  { productionSourceBound: 1, exactSourceTreeBound: 1, productionVersionBound: 1, syntheticVersionCount: 0 },
  { signedArtifactVerified: 1, provenanceVerified: 1, artifactHashBound: 1, unsignedArtifactCount: 0 },
  { dependencyLockVerified: 1, sbomVerified: 1, approvedDependencySetVerified: 1, unapprovedDependencyCount: 0 },
  { requestSchemaVerified: 1, responseSchemaVerified: 1, migrationManifestVerified: 1, backwardCompatibilityVerified: 1, implicitMigrationCount: 0 },
  { independentBuildCount: 2, independentBuildsEquivalent: 1, referenceRegressionCount: 5, maximumReferenceRelativeDifference: 0, regressionFailureCount: 0 },
  { negativeControlCount: 20, negativeControlPassCount: 20, securityReviewComplete: 1, resourceBoundsVerified: 1, criticalSecurityFindingCount: 0, resourceLimitViolationCount: 0 },
  { technicalReviewApproved: 1, securityReviewApproved: 1, ownerReleaseApproved: 1, simulatedApprovalCount: 0, unresolvedReviewBlockerCount: 0 },
  { runbookVersionBound: 1, installationPackageVerified: 1, rollbackPackageVerified: 1, recoveryExercisePassed: 1, rollbackFailureCount: 0 },
  { expiryPolicyEnforced: 1, revocationPolicyEnforced: 1, byteChangeRequalificationEnforced: 1, expiredApprovalCount: 0, revokedApprovalCount: 0 },
];

const domainEvidence = REQUIRED_NC08R_DOMAINS.map((id, index) => sealWithHash({
  schema: 'lafea-nc08r-real-module-evidence/v1',
  id,
  exactHeadSha: HEAD,
  implementationHash: H('f'),
  contractHash: DEFAULT_REAL_MODULE_QUALIFICATION_CONTRACT.realModuleQualificationContractHash,
  upstreamBindingHash: upstreamBinding.semanticHash,
  moduleRecordHash: moduleRecord.moduleRecordHash,
  releaseApprovalHash: releaseApproval.releaseApprovalHash,
  metrics: metrics[index],
}, 'evidenceHash'));

const baseline = {
  contract: DEFAULT_REAL_MODULE_QUALIFICATION_CONTRACT,
  candidateExactHeadSha: HEAD,
  implementationHash: H('f'),
  upstreamBinding,
  moduleRecord,
  releaseApproval,
  domainEvidence,
};

test('NC-08R contract is sealed and preserves the production boundary', () => {
  assert.equal(validateRealModuleQualificationContract(DEFAULT_REAL_MODULE_QUALIFICATION_CONTRACT), true);
  assert.equal(DEFAULT_REAL_MODULE_QUALIFICATION_CONTRACT.productionExecutionAuthorized, false);
  assert.equal(DEFAULT_REAL_MODULE_QUALIFICATION_CONTRACT.nc10Authorized, false);
});

test('complete real-module evidence can qualify module authority without production execution', () => {
  const report = evaluateRealModuleQualification(baseline);
  assert.equal(report.status, 'NC08R_REAL_MODULE_QUALIFIED');
  assert.equal(report.authority.moduleQualified, true);
  assert.equal(report.authority.nc09ProductionAuthorizationAuthorized, true);
  assert.equal(report.authority.productionExecutionAuthorized, false);
  assert.equal(report.authority.nc10Authorized, false);
});

test('all governed negative controls fail closed', () => {
  const controls = createRealModuleNegativeControls(baseline);
  assert.deepEqual(controls.map((control) => control.id), [...REAL_MODULE_NEGATIVE_CONTROL_IDS]);
  for (const control of controls) {
    const report = evaluateRealModuleQualification(control.input);
    assert.equal(report.authority.moduleQualified, false, control.id);
    assert.equal(report.authority.productionExecutionAuthorized, false, control.id);
    assert.ok(report.blockers.length > 0, control.id);
  }
});
