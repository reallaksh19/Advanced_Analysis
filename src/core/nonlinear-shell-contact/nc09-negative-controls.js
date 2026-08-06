import { semanticHash } from './contracts.js';
import { evaluateSyntheticDeploymentRehearsal } from './synthetic-deployment-rehearsal-evaluator.js';
export function runNc09NegativeControls(valid){
  const mutations=[];
  mutations.push(v=>{v.candidateExactHeadSha='bad';});
  mutations.push(v=>{v.implementationHash='bad';});
  mutations.push(v=>{v.upstreamBinding.syntheticReferenceModuleQualified=false;});
  mutations.push(v=>{v.upstreamBinding.moduleQualified=true;});
  mutations.push(v=>{v.upstreamBinding.nc09Authorized=true;});
  mutations.push(v=>{v.upstreamBinding.syntheticBuildId='OTHER';});
  mutations.push(v=>{v.deploymentRecord.humanApprovalClaimed=true;});
  mutations.push(v=>{v.deploymentRecord.realProductionEnvironmentClaimed=true;});
  mutations.push(v=>{v.deploymentRecord.signedProductionArtifactClaimed=true;});
  mutations.push(v=>{v.deploymentRecord.networkAccessEnabled=true;});
  mutations.push(v=>{v.deploymentRecord.realSecretsUsed=true;});
  mutations.push(v=>{v.deploymentRecord.productionPromotionAuthorized=true;});
  mutations.push(v=>{v.domainEvidence.pop();});
  mutations.push(v=>{v.domainEvidence.push(structuredClone(v.domainEvidence[0]));});
  for(let i=0;i<10;i++)mutations.push(v=>{const row=v.domainEvidence[i];const k=Object.keys(row.metrics)[0];row.metrics[k]=typeof row.metrics[k]==='number'?999:0;});
  mutations.push(v=>{v.domainEvidence[4].metrics.productionPromotionCount=1;});
  mutations.push(v=>{v.domainEvidence[5].metrics.auditGapCount=1;});
  mutations.push(v=>{v.domainEvidence[6].metrics.dataLossEventCount=1;});
  mutations.push(v=>{v.domainEvidence[7].metrics.uncontainedIncidentCount=1;});
  mutations.push(v=>{v.domainEvidence[9].metrics.nc10AuthorizationCount=1;});
  return mutations.map((mutate,index)=>{
    const copy=structuredClone(valid);mutate(copy);
    for(const x of [copy.upstreamBinding,copy.deploymentRecord,...copy.domainEvidence]){
      const field=Object.hasOwn(x,'semanticHash')?'semanticHash':Object.hasOwn(x,'deploymentRecordHash')?'deploymentRecordHash':'evidenceHash';
      const clean=structuredClone(x);delete clean[field];x[field]=semanticHash(clean);
    }
    try{const r=evaluateSyntheticDeploymentRehearsal(copy);return {id:`NC09-NEG-${String(index+1).padStart(2,'0')}`,passed:r.status==='NC09_BLOCKED'};}
    catch{return {id:`NC09-NEG-${String(index+1).padStart(2,'0')}`,passed:true};}
  });
}
