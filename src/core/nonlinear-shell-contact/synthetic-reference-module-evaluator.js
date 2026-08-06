import {
  GIT_SHA_PATTERN, HASH_PATTERN, deepFreeze, semanticHash, verifySealedHash,
} from './contracts.js';
import {
  REQUIRED_NC08_DOMAINS, validateSyntheticReferenceModuleContract,
} from './synthetic-reference-module-contract.js';

export function evaluateSyntheticReferenceModule({
  contract, candidateExactHeadSha, implementationHash, upstreamBinding,
  buildRecord, domainEvidence,
}) {
  validateSyntheticReferenceModuleContract(contract);
  const blockers = [];
  if (!GIT_SHA_PATTERN.test(candidateExactHeadSha ?? '')) blockers.push('CANDIDATE_HEAD_INVALID');
  if (!HASH_PATTERN.test(implementationHash ?? '')) blockers.push('IMPLEMENTATION_HASH_INVALID');
  try { validateUpstream(upstreamBinding); } catch (error) { blockers.push(`UPSTREAM_INVALID:${error.message}`); }
  try { validateBuild(buildRecord, candidateExactHeadSha); } catch (error) { blockers.push(`BUILD_INVALID:${error.message}`); }
  const rows = Array.isArray(domainEvidence) ? domainEvidence : [];
  const map = new Map();
  for (const row of rows) {
    if (map.has(row?.id)) blockers.push(`EVIDENCE_DUPLICATE:${row?.id ?? 'UNKNOWN'}`);
    else map.set(row?.id, row);
  }
  for (const id of REQUIRED_NC08_DOMAINS) {
    const row = map.get(id);
    if (!row) { blockers.push(`EVIDENCE_MISSING:${id}`); continue; }
    try { validateEvidence(row, id, { contract, candidateExactHeadSha, implementationHash, upstreamBinding, buildRecord }); }
    catch (error) { blockers.push(`EVIDENCE_INVALID:${id}:${error.message}`); }
  }
  for (const row of rows) if (!REQUIRED_NC08_DOMAINS.includes(row?.id)) blockers.push(`EVIDENCE_UNKNOWN:${row?.id ?? 'UNKNOWN'}`);
  const qualified = blockers.length === 0;
  const payload = {
    schema: 'nonlinear-shell-contact-nc08-synthetic-reference-module-report/v1',
    status: qualified ? 'NC08_SYNTHETIC_REFERENCE_MODULE_QUALIFIED' : 'NC08_BLOCKED',
    candidateExactHeadSha,
    syntheticReferenceModuleContractHash: contract.syntheticReferenceModuleContractHash,
    implementationHash,
    upstreamBindingHash: upstreamBinding?.semanticHash ?? null,
    registeredBuildCount: buildRecord ? 1 : 0,
    qualifiedSyntheticReferenceBuildIds: qualified ? [buildRecord.id] : [],
    realQualifiedBuildIds: [],
    evaluatedDomainCount: map.size,
    blockers: blockers.sort(),
    authority: {
      nc08ContractQualified: true,
      syntheticCaseAssessmentQualified: upstreamBinding?.syntheticCaseAssessmentQualified === true,
      syntheticReferenceModuleQualified: qualified,
      moduleQualified: false,
      nc09Authorized: false,
      codeAssessmentQualified: false,
      realAssetAssessmentQualified: false,
      externalCodeComplianceQualified: false,
      fitnessForServiceQualified: false,
      remainingStrengthQualified: false,
      failurePressureQualified: false,
      productionExecutionAuthorized: false,
      automaticAssetAcceptanceAuthorized: false,
      autonomousCaseDispositionAuthorized: false,
    },
  };
  return deepFreeze({ ...payload, reportSemanticHash: semanticHash(payload) });
}

function validateUpstream(value) {
  verifySealedHash(value, 'semanticHash');
  if (value.schema !== 'nonlinear-shell-contact-nc08-upstream-binding/v1') throw new Error('schema');
  if (value.syntheticCaseAssessmentQualified !== true || value.nc08Authorized !== true) throw new Error('synthetic authority');
  if (!Array.isArray(value.qualifiedSyntheticCaseIds) || value.qualifiedSyntheticCaseIds.length !== 1 || value.qualifiedSyntheticCaseIds[0] !== 'SYNTH-NC07-DENT-001') throw new Error('synthetic case set');
  if (!Array.isArray(value.realAssetQualifiedCaseIds) || value.realAssetQualifiedCaseIds.length !== 0) throw new Error('real asset case set');
  for (const key of ['nc07ReportHash','nc07ArtifactDigest','caseRecordHash','nc07UpstreamBindingHash','nc05ReportHash','nc06ReportHash']) if (!HASH_PATTERN.test(value[key] ?? '')) throw new Error(key);
  if (!GIT_SHA_PATTERN.test(value.nc07ExactHeadSha ?? '')) throw new Error('nc07ExactHeadSha');
}
function validateBuild(value, candidateExactHeadSha) {
  verifySealedHash(value, 'buildRecordHash');
  if (value.schema !== 'lafea-nc08-synthetic-reference-build/v1') throw new Error('schema');
  if (value.id !== 'NC08-SYNTHETIC-REFERENCE-MODULE-001') throw new Error('id');
  if (value.moduleVersion !== '0.8.0-synthetic-reference.1') throw new Error('moduleVersion');
  if (value.exactHeadSha !== candidateExactHeadSha || !GIT_SHA_PATTERN.test(value.sourceTreeSha ?? '')) throw new Error('source binding');
  for (const key of ['buildArtifactHash','sourceManifestHash','sbomHash','dependencyLockHash','runtimeProfileHash','apiSchemaHash','migrationManifestHash','testManifestHash','simulatedReleaseReviewHash']) if (!HASH_PATTERN.test(value[key] ?? '')) throw new Error(key);
  for (const key of ['externalConnectivityEnabled','runtimeExtensionEnabled','dynamicCodeEnabled','humanReleaseApprovalClaimed','productionReleaseAuthorized']) if (value[key] !== false) throw new Error(key);
}
function validateEvidence(row, id, context) {
  verifySealedHash(row, 'evidenceHash');
  if (row.schema !== 'lafea-nc08-synthetic-reference-evidence/v1' || row.id !== id) throw new Error('schema or id');
  if (row.exactHeadSha !== context.candidateExactHeadSha || row.implementationHash !== context.implementationHash || row.contractHash !== context.contract.syntheticReferenceModuleContractHash || row.upstreamBindingHash !== context.upstreamBinding.semanticHash || row.buildRecordHash !== context.buildRecord.buildRecordHash) throw new Error('binding');
  checkMetrics(id, row.metrics, context.contract);
}
function checkMetrics(id, metrics, contract) {
  const one = (key) => { if (metrics[key] !== 1) throw new Error(key); };
  const zero = (key) => { if (metrics[key] !== 0) throw new Error(key); };
  switch (id) {
    case REQUIRED_NC08_DOMAINS[0]: one('nc07ReceiptBound'); one('syntheticCaseQualified'); one('nc08Authorized'); zero('realAssetQualifiedCaseCount'); zero('upstreamMismatchCount'); break;
    case REQUIRED_NC08_DOMAINS[1]: one('requestSchemaCount'); one('responseSchemaCount'); if (metrics.exactSchemaCompatibilityCount < contract.minimumReferenceRegressionCount) throw new Error('exactSchemaCompatibilityCount'); one('migrationManifestBound'); zero('implicitMigrationCount'); break;
    case REQUIRED_NC08_DOMAINS[2]: if (metrics.buildReplayCount < contract.minimumBuildReplayCount) throw new Error('buildReplayCount'); one('buildReplayIdentical'); if (metrics.moduleReplayCount < contract.minimumModuleReplayCount) throw new Error('moduleReplayCount'); one('moduleReplayIdentical'); zero('buildDifferenceCount'); break;
    case REQUIRED_NC08_DOMAINS[3]: if (metrics.authorityEscalationRejectionCount < 1) throw new Error('authorityEscalationRejectionCount'); zero('realAuthorityClaimCount'); zero('productionAuthorityClaimCount'); zero('callerControlledAuthorityCount'); break;
    case REQUIRED_NC08_DOMAINS[4]: if (metrics.negativeControlCount < contract.minimumNegativeControlCount || metrics.negativeControlPassCount !== metrics.negativeControlCount) throw new Error('negative controls'); zero('externalConnectivityEnabled'); zero('runtimeExtensionEnabled'); zero('dynamicCodeEnabled'); break;
    case REQUIRED_NC08_DOMAINS[5]: if (metrics.receiptChainLinkCount < contract.minimumReceiptChainLinkCount) throw new Error('receiptChainLinkCount'); zero('receiptReconstructionFailureCount'); one('retainedChainHashMatch'); break;
    case REQUIRED_NC08_DOMAINS[6]: if (metrics.referenceRegressionCount < contract.minimumReferenceRegressionCount) throw new Error('referenceRegressionCount'); if (!Number.isFinite(metrics.maximumReferenceRelativeDifference) || metrics.maximumReferenceRelativeDifference < 0 || metrics.maximumReferenceRelativeDifference > contract.maximumReferenceRelativeDifference) throw new Error('maximumReferenceRelativeDifference'); zero('dispositionMismatchCount'); zero('authorityMismatchCount'); break;
    case REQUIRED_NC08_DOMAINS[7]: if (metrics.malformedAndBoundaryCaseCount < contract.minimumNegativeControlCount || metrics.rejectedCaseCount !== metrics.malformedAndBoundaryCaseCount) throw new Error('rejectedCaseCount'); zero('uncaughtFailureCount'); zero('permissiveFallbackCount'); break;
    case REQUIRED_NC08_DOMAINS[8]: one('reproducibleBuildVerified'); one('sourceManifestVerified'); one('dependencyLockVerified'); one('sbomVerified'); one('exactSourceTreeBound'); break;
    case REQUIRED_NC08_DOMAINS[9]: if (!Number.isInteger(metrics.artifactBytes) || metrics.artifactBytes <= 0 || metrics.artifactBytes > contract.maximumArtifactBytes) throw new Error('artifactBytes'); if (!Number.isInteger(metrics.governedOperationCount) || metrics.governedOperationCount <= 0 || metrics.governedOperationCount > contract.maximumGovernedOperationCount) throw new Error('governedOperationCount'); one('simulatedReleaseReviewCount'); zero('humanApprovalClaimCount'); zero('productionReleaseClaimCount'); one('changeControlBound'); break;
    default: throw new Error('unknown domain');
  }
}
