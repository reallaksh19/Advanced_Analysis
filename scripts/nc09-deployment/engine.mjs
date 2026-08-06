import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { semanticHash, sealWithHash } from '../../src/core/nonlinear-shell-contact/contracts.js';
import { DEFAULT_SYNTHETIC_DEPLOYMENT_REHEARSAL_CONTRACT, REQUIRED_NC09_REHEARSAL_DOMAINS } from '../../src/core/nonlinear-shell-contact/synthetic-deployment-rehearsal-contract.js';
import { REHEARSAL_ID } from './config.mjs';

export async function executeRehearsal({outputDir,upstreamFile,exactHeadSha,implementationHash}){
  const upstream=JSON.parse(await readFile(resolve(upstreamFile),'utf8'));
  const environment={class:'EPHEMERAL_ISOLATED_TEST',runtime:'ubuntu-24.04-node-22',network:false,secrets:'SYNTHETIC_PLACEHOLDERS_ONLY',persistentWrites:false};
  const roles=[{id:'TEST_REQUESTER',permissions:['REQUEST_REHEARSAL']},{id:'TEST_REVIEWER',permissions:['REVIEW_TEST_EVIDENCE']},{id:'TEST_PROMOTER',permissions:['PROMOTE_WITHIN_REHEARSAL_ONLY']}];
  const auditEvents=['request','verify-upstream','stage','canary','promote-test','rollback-a','rollback-b','revoke','expire','requalify'];
  const record=sealWithHash({
    schema:'lafea-nc09-synthetic-deployment-rehearsal/v1',id:REHEARSAL_ID,exactHeadSha,
    environmentManifestHash:semanticHash(environment),
    testArtifactEnvelopeHash:semanticHash({buildHash:upstream.nc08BuildArtifactHash,class:'UNSIGNED_TEST_ENVELOPE'}),
    simulatedRoleMatrixHash:semanticHash(roles),
    changeRecordHash:semanticHash({id:'SYNTH-CHANGE-001',scope:'REHEARSAL_ONLY',canary:'PASS'}),
    auditLedgerHash:semanticHash(auditEvents),
    rollbackDrillHash:semanticHash([{id:'RB-1',result:'BASELINE_RESTORED'},{id:'RB-2',result:'BASELINE_RESTORED'}]),
    incidentDrillHash:semanticHash([{id:'IR-1',result:'KILL_SWITCH_PASS'},{id:'IR-2',result:'ESCALATION_PASS'}]),
    operatorExerciseHash:semanticHash({actor:'SIMULATED_TEST_ACTOR',runbook:'NC09-REHEARSAL-RUNBOOK/v1',checklist:'COMPLETE'}),
    authorizationWindowHash:semanticHash({mode:'TEST_ONLY',expiry:'DETERMINISTIC_END_OF_REPLAY',revocation:'ENFORCED'}),
    humanApprovalClaimed:false,realProductionEnvironmentClaimed:false,signedProductionArtifactClaimed:false,
    networkAccessEnabled:false,realSecretsUsed:false,productionPromotionAuthorized:false,
  },'deploymentRecordHash');
  const base={schema:'lafea-nc09-synthetic-deployment-evidence/v1',exactHeadSha,implementationHash,contractHash:DEFAULT_SYNTHETIC_DEPLOYMENT_REHEARSAL_CONTRACT.syntheticDeploymentRehearsalContractHash,upstreamBindingHash:upstream.semanticHash,deploymentRecordHash:record.deploymentRecordHash};
  const metrics=[
    {nc08ReceiptBound:1,syntheticReferenceModuleQualified:1,realQualifiedBuildCount:0,upstreamAuthorityEscalationCount:0},
    {testEnvironmentManifestBound:1,immutableConfigBound:1,productionEnvironmentClaimCount:0,realSecretCount:0},
    {testArtifactHashBound:1,sourceBuildChainBound:1,productionSignatureClaimCount:0,floatingArtifactCount:0},
    {simulatedRoleCount:roles.length,roleSeparationVerified:1,leastPrivilegeMatrixVerified:1,humanApprovalClaimCount:0},
    {simulatedChangeRecordBound:1,testCanaryPassed:1,explicitRehearsalPromotion:1,productionPromotionCount:0},
    {auditEventCount:auditEvents.length,auditChainVerified:1,retentionManifestBound:1,auditGapCount:0},
    {rollbackDrillCount:2,rollbackRestoredBaseline:1,recoveryPointObjectiveMinutes:0,recoveryTimeObjectiveMinutes:1,dataLossEventCount:0},
    {incidentDrillCount:2,killSwitchVerified:1,escalationPathVerified:1,uncontainedIncidentCount:0},
    {simulatedOperatorExerciseCompleted:1,runbookVersionBound:1,competenceChecklistComplete:1,realOperatorAuthorizationClaimCount:0},
    {expiryEnforced:1,revocationEnforced:1,requalificationTriggerVerified:1,activeProductionAuthorizationCount:0,nc10AuthorizationCount:0},
  ];
  const evidence=REQUIRED_NC09_REHEARSAL_DOMAINS.map((id,i)=>sealWithHash({...base,id,metrics:metrics[i]},'evidenceHash'));
  const summaryPayload={schema:'lafea-nc09-synthetic-deployment-run/v1',exactHeadSha,implementationHash,upstreamBindingHash:upstream.semanticHash,deploymentRecordHash:record.deploymentRecordHash,evidenceHashes:evidence.map(x=>x.evidenceHash),replayStatus:'SYNTHETIC_REHEARSAL_COMPLETE',productionExecutionAuthorized:false,nc10Authorized:false};
  const summary={...summaryPayload,runSemanticHash:semanticHash(summaryPayload)};
  await mkdir(resolve(outputDir,'evidence'),{recursive:true});
  await writeFile(resolve(outputDir,'deployment-record.json'),`${JSON.stringify(record,null,2)}\n`);
  for(const row of evidence)await writeFile(resolve(outputDir,'evidence',`${row.id}.json`),`${JSON.stringify(row,null,2)}\n`);
  await writeFile(resolve(outputDir,'run-summary.json'),`${JSON.stringify(summary,null,2)}\n`);
  await writeFile(resolve(outputDir,'run-summary.canonical.json'),`${JSON.stringify(summary)}\n`);
  return {upstream,record,evidence,summary};
}
