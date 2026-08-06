import { GIT_SHA_PATTERN, HASH_PATTERN, deepFreeze, semanticHash, verifySealedHash } from './contracts.js';
import { REQUIRED_NC09_REHEARSAL_DOMAINS, validateSyntheticDeploymentRehearsalContract } from './synthetic-deployment-rehearsal-contract.js';

export function evaluateSyntheticDeploymentRehearsal({contract,candidateExactHeadSha,implementationHash,upstreamBinding,deploymentRecord,domainEvidence}){
  validateSyntheticDeploymentRehearsalContract(contract);
  const blockers=[];
  if(!GIT_SHA_PATTERN.test(candidateExactHeadSha??''))blockers.push('CANDIDATE_HEAD_INVALID');
  if(!HASH_PATTERN.test(implementationHash??''))blockers.push('IMPLEMENTATION_HASH_INVALID');
  try{validateUpstream(upstreamBinding);}catch(e){blockers.push(`UPSTREAM_INVALID:${e.message}`);}
  try{validateDeployment(deploymentRecord,candidateExactHeadSha);}catch(e){blockers.push(`DEPLOYMENT_INVALID:${e.message}`);}
  const rows=Array.isArray(domainEvidence)?domainEvidence:[];const map=new Map();
  for(const row of rows){if(map.has(row?.id))blockers.push(`EVIDENCE_DUPLICATE:${row?.id??'UNKNOWN'}`);else map.set(row?.id,row);}
  for(const id of REQUIRED_NC09_REHEARSAL_DOMAINS){const row=map.get(id);if(!row){blockers.push(`EVIDENCE_MISSING:${id}`);continue;}try{validateEvidence(row,id,{contract,candidateExactHeadSha,implementationHash,upstreamBinding,deploymentRecord});}catch(e){blockers.push(`EVIDENCE_INVALID:${id}:${e.message}`);}}
  for(const row of rows)if(!REQUIRED_NC09_REHEARSAL_DOMAINS.includes(row?.id))blockers.push(`EVIDENCE_UNKNOWN:${row?.id??'UNKNOWN'}`);
  const qualified=blockers.length===0;
  const payload={
    schema:'nonlinear-shell-contact-nc09-synthetic-deployment-rehearsal-report/v1',
    status:qualified?'NC09_SYNTHETIC_DEPLOYMENT_REHEARSAL_QUALIFIED':'NC09_BLOCKED',
    candidateExactHeadSha,
    contractHash:contract.syntheticDeploymentRehearsalContractHash,
    implementationHash,
    upstreamBindingHash:upstreamBinding?.semanticHash??null,
    registeredRehearsalCount:deploymentRecord?1:0,
    qualifiedSyntheticRehearsalIds:qualified?[deploymentRecord.id]:[],
    registeredProductionDeploymentCount:0,
    evaluatedDomainCount:map.size,
    blockers:blockers.sort(),
    authority:{
      nc09ContractQualified:true,
      syntheticReferenceModuleQualified:upstreamBinding?.syntheticReferenceModuleQualified===true,
      syntheticDeploymentRehearsalQualified:qualified,
      moduleQualified:false,
      productionExecutionAuthorized:false,
      nc10Authorized:false,
      codeAssessmentQualified:false,
      realAssetAssessmentQualified:false,
      externalCodeComplianceQualified:false,
      fitnessForServiceQualified:false,
      remainingStrengthQualified:false,
      failurePressureQualified:false,
      automaticAssetAcceptanceAuthorized:false,
      autonomousCaseDispositionAuthorized:false,
    },
  };
  return deepFreeze({...payload,reportSemanticHash:semanticHash(payload)});
}
function validateUpstream(v){
  verifySealedHash(v,'semanticHash');
  if(v.schema!=='nonlinear-shell-contact-nc09-upstream-binding/v1')throw new Error('schema');
  if(v.syntheticReferenceModuleQualified!==true||v.moduleQualified!==false||v.nc09Authorized!==false)throw new Error('authority boundary');
  if(v.syntheticBuildId!=='NC08-SYNTHETIC-REFERENCE-MODULE-001')throw new Error('build id');
  for(const k of ['nc08ReportHash','nc08ArtifactDigest','nc08BuildRecordHash','nc08BuildArtifactHash','nc08UpstreamBindingHash'])if(!HASH_PATTERN.test(v[k]??''))throw new Error(k);
  if(!GIT_SHA_PATTERN.test(v.nc08ExactHeadSha??''))throw new Error('nc08ExactHeadSha');
}
function validateDeployment(v,head){
  verifySealedHash(v,'deploymentRecordHash');
  if(v.schema!=='lafea-nc09-synthetic-deployment-rehearsal/v1'||v.id!=='NC09-SYNTHETIC-DEPLOYMENT-REHEARSAL-001')throw new Error('identity');
  if(v.exactHeadSha!==head)throw new Error('head');
  for(const k of ['environmentManifestHash','testArtifactEnvelopeHash','simulatedRoleMatrixHash','changeRecordHash','auditLedgerHash','rollbackDrillHash','incidentDrillHash','operatorExerciseHash','authorizationWindowHash'])if(!HASH_PATTERN.test(v[k]??''))throw new Error(k);
  for(const k of ['humanApprovalClaimed','realProductionEnvironmentClaimed','signedProductionArtifactClaimed','networkAccessEnabled','realSecretsUsed','productionPromotionAuthorized'])if(v[k]!==false)throw new Error(k);
}
function validateEvidence(row,id,c){
  verifySealedHash(row,'evidenceHash');
  if(row.schema!=='lafea-nc09-synthetic-deployment-evidence/v1'||row.id!==id)throw new Error('identity');
  if(row.exactHeadSha!==c.candidateExactHeadSha||row.implementationHash!==c.implementationHash||row.contractHash!==c.contract.syntheticDeploymentRehearsalContractHash||row.upstreamBindingHash!==c.upstreamBinding.semanticHash||row.deploymentRecordHash!==c.deploymentRecord.deploymentRecordHash)throw new Error('binding');
  const m=row.metrics;const one=k=>{if(m[k]!==1)throw new Error(k)};const zero=k=>{if(m[k]!==0)throw new Error(k)};
  switch(id){
    case REQUIRED_NC09_REHEARSAL_DOMAINS[0]:one('nc08ReceiptBound');one('syntheticReferenceModuleQualified');zero('realQualifiedBuildCount');zero('upstreamAuthorityEscalationCount');break;
    case REQUIRED_NC09_REHEARSAL_DOMAINS[1]:one('testEnvironmentManifestBound');one('immutableConfigBound');zero('productionEnvironmentClaimCount');zero('realSecretCount');break;
    case REQUIRED_NC09_REHEARSAL_DOMAINS[2]:one('testArtifactHashBound');one('sourceBuildChainBound');zero('productionSignatureClaimCount');zero('floatingArtifactCount');break;
    case REQUIRED_NC09_REHEARSAL_DOMAINS[3]:if(m.simulatedRoleCount<c.contract.minimumSimulatedRoleCount)throw new Error('simulatedRoleCount');one('roleSeparationVerified');one('leastPrivilegeMatrixVerified');zero('humanApprovalClaimCount');break;
    case REQUIRED_NC09_REHEARSAL_DOMAINS[4]:one('simulatedChangeRecordBound');one('testCanaryPassed');one('explicitRehearsalPromotion');zero('productionPromotionCount');break;
    case REQUIRED_NC09_REHEARSAL_DOMAINS[5]:if(m.auditEventCount<c.contract.minimumAuditEventCount)throw new Error('auditEventCount');one('auditChainVerified');one('retentionManifestBound');zero('auditGapCount');break;
    case REQUIRED_NC09_REHEARSAL_DOMAINS[6]:if(m.rollbackDrillCount<c.contract.minimumRollbackDrillCount)throw new Error('rollbackDrillCount');one('rollbackRestoredBaseline');if(m.recoveryPointObjectiveMinutes>c.contract.maximumRecoveryPointObjectiveMinutes||m.recoveryTimeObjectiveMinutes>c.contract.maximumRecoveryTimeObjectiveMinutes)throw new Error('recovery objective');zero('dataLossEventCount');break;
    case REQUIRED_NC09_REHEARSAL_DOMAINS[7]:if(m.incidentDrillCount<c.contract.minimumIncidentDrillCount)throw new Error('incidentDrillCount');one('killSwitchVerified');one('escalationPathVerified');zero('uncontainedIncidentCount');break;
    case REQUIRED_NC09_REHEARSAL_DOMAINS[8]:one('simulatedOperatorExerciseCompleted');one('runbookVersionBound');one('competenceChecklistComplete');zero('realOperatorAuthorizationClaimCount');break;
    case REQUIRED_NC09_REHEARSAL_DOMAINS[9]:one('expiryEnforced');one('revocationEnforced');one('requalificationTriggerVerified');zero('activeProductionAuthorizationCount');zero('nc10AuthorizationCount');break;
    default:throw new Error('unknown domain');
  }
}
