import {
  GIT_SHA_PATTERN, HASH_PATTERN, deepFreeze, semanticHash, verifySealedHash,
} from './contracts.js';
import {
  REQUIRED_NC08R_DOMAINS, validateRealModuleQualificationContract,
} from './real-module-qualification-contract.js';

export function evaluateRealModuleQualification({
  contract, candidateExactHeadSha, implementationHash, upstreamBinding,
  moduleRecord, releaseApproval, domainEvidence,
}) {
  validateRealModuleQualificationContract(contract);
  const blockers = [];
  if (!GIT_SHA_PATTERN.test(candidateExactHeadSha ?? '')) blockers.push('CANDIDATE_HEAD_INVALID');
  if (!HASH_PATTERN.test(implementationHash ?? '')) blockers.push('IMPLEMENTATION_HASH_INVALID');
  try { validateUpstream(upstreamBinding); } catch (error) { blockers.push(`UPSTREAM_INVALID:${error.message}`); }
  try { validateModuleRecord(moduleRecord, candidateExactHeadSha); } catch (error) { blockers.push(`MODULE_INVALID:${error.message}`); }
  try { validateReleaseApproval(releaseApproval, moduleRecord); } catch (error) { blockers.push(`APPROVAL_INVALID:${error.message}`); }

  const rows = Array.isArray(domainEvidence) ? domainEvidence : [];
  const map = new Map();
  for (const row of rows) {
    if (map.has(row?.id)) blockers.push(`EVIDENCE_DUPLICATE:${row?.id ?? 'UNKNOWN'}`);
    else map.set(row?.id, row);
  }
  for (const id of REQUIRED_NC08R_DOMAINS) {
    const row = map.get(id);
    if (!row) {
      blockers.push(`EVIDENCE_MISSING:${id}`);
      continue;
    }
    try {
      validateEvidence(row, id, {
        contract,
        candidateExactHeadSha,
        implementationHash,
        upstreamBinding,
        moduleRecord,
        releaseApproval,
      });
    } catch (error) {
      blockers.push(`EVIDENCE_INVALID:${id}:${error.message}`);
    }
  }
  for (const row of rows) {
    if (!REQUIRED_NC08R_DOMAINS.includes(row?.id)) blockers.push(`EVIDENCE_UNKNOWN:${row?.id ?? 'UNKNOWN'}`);
  }

  const qualified = blockers.length === 0;
  const payload = {
    schema: 'nonlinear-shell-contact-nc08r-real-module-qualification-report/v1',
    status: qualified ? 'NC08R_REAL_MODULE_QUALIFIED' : 'NC08R_BLOCKED',
    candidateExactHeadSha,
    contractHash: contract.realModuleQualificationContractHash,
    implementationHash,
    upstreamBindingHash: upstreamBinding?.semanticHash ?? null,
    registeredRealModuleCount: moduleRecord ? 1 : 0,
    qualifiedRealModuleIds: qualified ? [moduleRecord.moduleId] : [],
    evaluatedDomainCount: map.size,
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

function validateUpstream(value) {
  verifySealedHash(value, 'semanticHash');
  if (value.schema !== 'nonlinear-shell-contact-nc08r-upstream-binding/v1') throw new Error('schema');
  if (value.syntheticReferenceModuleQualified !== true || value.moduleQualified !== false) throw new Error('synthetic boundary');
  if (value.syntheticBuildId !== 'NC08-SYNTHETIC-REFERENCE-MODULE-001') throw new Error('synthetic build id');
  for (const key of ['nc08ReportHash','nc08ArtifactDigest','nc08BuildRecordHash','nc08BuildArtifactHash']) {
    if (!HASH_PATTERN.test(value[key] ?? '')) throw new Error(key);
  }
  if (!GIT_SHA_PATTERN.test(value.nc08ExactHeadSha ?? '')) throw new Error('nc08ExactHeadSha');
}

function validateModuleRecord(value, candidateExactHeadSha) {
  verifySealedHash(value, 'moduleRecordHash');
  if (value.schema !== 'lafea-nc08r-real-module-record/v1') throw new Error('schema');
  if (value.exactHeadSha !== candidateExactHeadSha) throw new Error('exact head');
  if (value.productionIntended !== true) throw new Error('productionIntended');
  if (value.moduleVersion.includes('synthetic') || value.moduleVersion.includes('reference')) throw new Error('synthetic version');
  if (value.artifactSigned !== true || value.signatureVerified !== true || value.provenanceVerified !== true) throw new Error('signature or provenance');
  if (value.sourceManifestVerified !== true || value.dependencyLockVerified !== true || value.sbomVerified !== true) throw new Error('build custody');
  if (value.externalConnectivityEnabled !== false || value.runtimeExtensionEnabled !== false || value.dynamicCodeEnabled !== false) throw new Error('runtime isolation');
  if (!GIT_SHA_PATTERN.test(value.sourceTreeSha ?? '')) throw new Error('sourceTreeSha');
  for (const key of [
    'buildArtifactHash','artifactSignatureHash','buildProvenanceHash','sourceManifestHash',
    'dependencyLockHash','sbomHash','apiSchemaHash','migrationManifestHash','runtimeProfileHash',
    'testManifestHash','rollbackPackageHash','runbookHash',
  ]) {
    if (!HASH_PATTERN.test(value[key] ?? '')) throw new Error(key);
  }
}

function validateReleaseApproval(value, moduleRecord) {
  verifySealedHash(value, 'releaseApprovalHash');
  if (value.schema !== 'lafea-nc08r-real-release-approval/v1') throw new Error('schema');
  if (value.moduleRecordHash !== moduleRecord?.moduleRecordHash) throw new Error('module binding');
  if (value.simulatedApproval !== false) throw new Error('simulated approval');
  if (value.technicalReviewApproved !== true || value.ownerReleaseApproved !== true || value.securityReviewApproved !== true) throw new Error('required approval');
  if (value.approvalExpired !== false || value.approvalRevoked !== false) throw new Error('inactive approval');
  for (const key of [
    'technicalReviewerIdentityHash','ownerApproverIdentityHash','securityReviewerIdentityHash',
    'approvalRecordHash',
  ]) {
    if (!HASH_PATTERN.test(value[key] ?? '')) throw new Error(key);
  }
}

function validateEvidence(row, id, context) {
  verifySealedHash(row, 'evidenceHash');
  if (row.schema !== 'lafea-nc08r-real-module-evidence/v1' || row.id !== id) throw new Error('identity');
  if (
    row.exactHeadSha !== context.candidateExactHeadSha ||
    row.implementationHash !== context.implementationHash ||
    row.contractHash !== context.contract.realModuleQualificationContractHash ||
    row.upstreamBindingHash !== context.upstreamBinding.semanticHash ||
    row.moduleRecordHash !== context.moduleRecord.moduleRecordHash ||
    row.releaseApprovalHash !== context.releaseApproval.releaseApprovalHash
  ) throw new Error('binding');
  const m = row.metrics;
  const one = (key) => { if (m[key] !== 1) throw new Error(key); };
  const zero = (key) => { if (m[key] !== 0) throw new Error(key); };
  switch (id) {
    case REQUIRED_NC08R_DOMAINS[0]:
      one('nc08ReceiptBound'); one('syntheticReferenceModuleQualified'); zero('upstreamAuthorityEscalationCount'); break;
    case REQUIRED_NC08R_DOMAINS[1]:
      one('productionSourceBound'); one('exactSourceTreeBound'); one('productionVersionBound'); zero('syntheticVersionCount'); break;
    case REQUIRED_NC08R_DOMAINS[2]:
      one('signedArtifactVerified'); one('provenanceVerified'); one('artifactHashBound'); zero('unsignedArtifactCount'); break;
    case REQUIRED_NC08R_DOMAINS[3]:
      one('dependencyLockVerified'); one('sbomVerified'); one('approvedDependencySetVerified'); zero('unapprovedDependencyCount'); break;
    case REQUIRED_NC08R_DOMAINS[4]:
      one('requestSchemaVerified'); one('responseSchemaVerified'); one('migrationManifestVerified'); one('backwardCompatibilityVerified'); zero('implicitMigrationCount'); break;
    case REQUIRED_NC08R_DOMAINS[5]:
      if (m.independentBuildCount < context.contract.minimumIndependentBuildCount) throw new Error('independentBuildCount');
      one('independentBuildsEquivalent');
      if (m.referenceRegressionCount < context.contract.minimumReferenceRegressionCount) throw new Error('referenceRegressionCount');
      if (m.maximumReferenceRelativeDifference > context.contract.maximumReferenceRelativeDifference) throw new Error('maximumReferenceRelativeDifference');
      zero('regressionFailureCount');
      break;
    case REQUIRED_NC08R_DOMAINS[6]:
      if (m.negativeControlCount < context.contract.minimumNegativeControlCount || m.negativeControlPassCount !== m.negativeControlCount) throw new Error('negative controls');
      one('securityReviewComplete'); one('resourceBoundsVerified'); zero('criticalSecurityFindingCount'); zero('resourceLimitViolationCount'); break;
    case REQUIRED_NC08R_DOMAINS[7]:
      one('technicalReviewApproved'); one('securityReviewApproved'); one('ownerReleaseApproved'); zero('simulatedApprovalCount'); zero('unresolvedReviewBlockerCount'); break;
    case REQUIRED_NC08R_DOMAINS[8]:
      one('runbookVersionBound'); one('installationPackageVerified'); one('rollbackPackageVerified'); one('recoveryExercisePassed'); zero('rollbackFailureCount'); break;
    case REQUIRED_NC08R_DOMAINS[9]:
      one('expiryPolicyEnforced'); one('revocationPolicyEnforced'); one('byteChangeRequalificationEnforced'); zero('expiredApprovalCount'); zero('revokedApprovalCount'); break;
    default:
      throw new Error('unknown domain');
  }
}
