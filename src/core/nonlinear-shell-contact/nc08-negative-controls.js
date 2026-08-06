import { createSyntheticReferenceModuleContract, validateSyntheticReferenceModuleContract } from './synthetic-reference-module-contract.js';
export function runNc08NegativeControls() {
  const rows=[]; const reject=(id,mutate)=>{const value=structuredClone(createSyntheticReferenceModuleContract());delete value.syntheticReferenceModuleContractHash;mutate(value);let passed=false;try{validateSyntheticReferenceModuleContract(value);}catch{passed=true;}rows.push({id,passed});};
  for (const key of ['realModuleQualificationAuthorized','codeAssessmentAuthorized','realAssetAssessmentAuthorized','externalCodeComplianceAuthorized','automaticCaseAcceptanceAuthorized','autonomousDispositionAuthorized','fitnessForServiceAuthorized','remainingStrengthAuthorized','failurePressureAuthorized','productionExecutionAuthorized','nc09Authorized']) reject(`AUTH_${key}`,x=>{x[key]=true;});
  reject('SYNTH_DISABLED',x=>{x.syntheticReferenceModuleAuthorized=false;});
  reject('BUILD_REPLAY_LOW',x=>{x.minimumBuildReplayCount=1;});
  reject('MODULE_REPLAY_LOW',x=>{x.minimumModuleReplayCount=2;});
  reject('REFERENCE_LOW',x=>{x.minimumReferenceRegressionCount=4;});
  reject('NEGATIVE_LOW',x=>{x.minimumNegativeControlCount=23;});
  reject('CHAIN_LOW',x=>{x.minimumReceiptChainLinkCount=5;});
  reject('REFERENCE_LOOSE',x=>{x.maximumReferenceRelativeDifference=1e-4;});
  reject('ARTIFACT_ZERO',x=>{x.maximumArtifactBytes=0;});
  reject('ARTIFACT_HIGH',x=>{x.maximumArtifactBytes=2000000;});
  reject('OPS_ZERO',x=>{x.maximumGovernedOperationCount=0;});
  reject('OPS_HIGH',x=>{x.maximumGovernedOperationCount=2000000;});
  reject('MISSING_DOMAIN',x=>{x.requiredDomains.pop();});
  reject('REORDER_DOMAIN',x=>{x.requiredDomains.reverse();});
  reject('BAD_SCHEMA',x=>{x.schema='v0';});
  reject('BAD_ANALYSIS',x=>{x.analysisClass='REAL_MODULE';});
  reject('BAD_UPSTREAM',x=>{x.upstreamRequirement='REAL_CASE';});
  reject('BAD_SECURITY',x=>{x.securityPolicy='NETWORK_ALLOWED';});
  reject('BAD_REVIEW',x=>{x.reviewPolicy='HUMAN_APPROVED';});
  reject('BAD_CHANGE',x=>{x.changePolicy='FLOATING';});
  return rows;
}
