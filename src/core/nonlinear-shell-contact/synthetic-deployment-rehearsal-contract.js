import { assertArray, assertBoolean, assertExactKeys, assertFiniteNumber, assertPlainData, assertString, deepFreeze, sealWithHash, verifySealedHash } from './contracts.js';

export const REQUIRED_NC09_REHEARSAL_DOMAINS=Object.freeze([
  'NC09-DR-01_NC08_SYNTHETIC_BUILD_BINDING',
  'NC09-DR-02_TEST_ENVIRONMENT_CUSTODY',
  'NC09-DR-03_TEST_ARTIFACT_PROVENANCE',
  'NC09-DR-04_SIMULATED_ACCESS_AND_ROLE_SEPARATION',
  'NC09-DR-05_SIMULATED_CHANGE_AND_PROMOTION_GATE',
  'NC09-DR-06_AUDIT_AND_RETENTION_REHEARSAL',
  'NC09-DR-07_ROLLBACK_AND_RECOVERY_REHEARSAL',
  'NC09-DR-08_KILL_SWITCH_AND_INCIDENT_REHEARSAL',
  'NC09-DR-09_SIMULATED_OPERATOR_AND_RUNBOOK_EXERCISE',
  'NC09-DR-10_EXPIRY_REVOCATION_AND_REQUALIFICATION_REHEARSAL',
]);

export function createSyntheticDeploymentRehearsalContract(){
  return sealWithHash({
    schema:'nonlinear-shell-contact-nc09-synthetic-deployment-rehearsal/v1',
    scope:'NON_PRODUCTION_TEST_ENVIRONMENT_ONLY',
    upstreamDependency:'QUALIFIED_NC08_SYNTHETIC_REFERENCE_MODULE_RECEIPT',
    minimumReplayCount:2,
    minimumNegativeControlCount:24,
    minimumSimulatedRoleCount:3,
    minimumAuditEventCount:8,
    minimumRollbackDrillCount:2,
    minimumIncidentDrillCount:2,
    maximumRecoveryPointObjectiveMinutes:60,
    maximumRecoveryTimeObjectiveMinutes:240,
    requiredDomains:[...REQUIRED_NC09_REHEARSAL_DOMAINS],
    humanApprovalClaimed:false,
    realProductionEnvironmentClaimed:false,
    signedProductionArtifactClaimed:false,
    productionExecutionAuthorized:false,
    nc10Authorized:false,
    automaticAssetAcceptanceAuthorized:false,
    autonomousCaseDispositionAuthorized:false,
  },'syntheticDeploymentRehearsalContractHash');
}
export function validateSyntheticDeploymentRehearsalContract(v){
  assertPlainData(v,'$contract');
  assertExactKeys(v,[
    'schema','scope','upstreamDependency','minimumReplayCount','minimumNegativeControlCount',
    'minimumSimulatedRoleCount','minimumAuditEventCount','minimumRollbackDrillCount',
    'minimumIncidentDrillCount','maximumRecoveryPointObjectiveMinutes',
    'maximumRecoveryTimeObjectiveMinutes','requiredDomains','humanApprovalClaimed',
    'realProductionEnvironmentClaimed','signedProductionArtifactClaimed',
    'productionExecutionAuthorized','nc10Authorized','automaticAssetAcceptanceAuthorized',
    'autonomousCaseDispositionAuthorized'
  ],'$contract',['syntheticDeploymentRehearsalContractHash']);
  if(v.schema!=='nonlinear-shell-contact-nc09-synthetic-deployment-rehearsal/v1')throw new TypeError('schema');
  if(v.scope!=='NON_PRODUCTION_TEST_ENVIRONMENT_ONLY')throw new TypeError('scope');
  if(v.upstreamDependency!=='QUALIFIED_NC08_SYNTHETIC_REFERENCE_MODULE_RECEIPT')throw new TypeError('upstream');
  for(const [k,m] of [['minimumReplayCount',2],['minimumNegativeControlCount',24],['minimumSimulatedRoleCount',3],['minimumAuditEventCount',8],['minimumRollbackDrillCount',2],['minimumIncidentDrillCount',2]])assertFiniteNumber(v[k],k,n=>Number.isInteger(n)&&n>=m);
  assertFiniteNumber(v.maximumRecoveryPointObjectiveMinutes,'rpo',n=>n>0&&n<=60);
  assertFiniteNumber(v.maximumRecoveryTimeObjectiveMinutes,'rto',n=>n>0&&n<=240);
  assertArray(v.requiredDomains,'domains',{min:REQUIRED_NC09_REHEARSAL_DOMAINS.length});
  if(new Set(v.requiredDomains).size!==v.requiredDomains.length)throw new TypeError('duplicate domains');
  for(const id of REQUIRED_NC09_REHEARSAL_DOMAINS)if(!v.requiredDomains.includes(id))throw new TypeError(`missing ${id}`);
  for(const k of ['humanApprovalClaimed','realProductionEnvironmentClaimed','signedProductionArtifactClaimed','productionExecutionAuthorized','nc10Authorized','automaticAssetAcceptanceAuthorized','autonomousCaseDispositionAuthorized']){assertBoolean(v[k],k);if(v[k]!==false)throw new TypeError(`${k} outside authority`);}
  if(v.syntheticDeploymentRehearsalContractHash)verifySealedHash(v,'syntheticDeploymentRehearsalContractHash','$contract');
  return true;
}
export const DEFAULT_SYNTHETIC_DEPLOYMENT_REHEARSAL_CONTRACT=deepFreeze(createSyntheticDeploymentRehearsalContract());
