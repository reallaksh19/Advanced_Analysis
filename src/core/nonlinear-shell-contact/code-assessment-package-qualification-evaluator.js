import { GIT_SHA_PATTERN, HASH_PATTERN, deepFreeze, semanticHash, verifySealedHash } from './contracts.js';
import { DEFAULT_CODE_ASSESSMENT_PACKAGE, REQUIRED_NC06_DOMAINS, validateCodeAssessmentPackageContract } from './code-assessment-package-contract.js';
const ok=(x,n)=>Number.isFinite(x)&&x>=0&&x<=n;
export function evaluateCodeAssessmentPackageQualification({
  contract=DEFAULT_CODE_ASSESSMENT_PACKAGE,candidateExactHeadSha,implementationHash,
  upstreamReceipt,assessmentBasis,evidence,
}){
  validateCodeAssessmentPackageContract(contract);const B=[];
  if(!GIT_SHA_PATTERN.test(candidateExactHeadSha||''))B.push('CANDIDATE_HEAD_INVALID');
  if(!HASH_PATTERN.test(implementationHash||''))B.push('IMPLEMENTATION_HASH_INVALID');
  try{verifySealedHash(upstreamReceipt,'semanticHash');if(upstreamReceipt.schema!=='nonlinear-shell-contact-nc05-upstream-binding/v1'||upstreamReceipt.plasticDentingProcedureQualified!==true||upstreamReceipt.nc06Authorized!==true||!Array.isArray(upstreamReceipt.qualifiedCellIds)||upstreamReceipt.qualifiedCellIds.length<1)throw Error('NC05 authority absent');}catch(e){B.push(`NC05_RECEIPT_INVALID:${e.message}`);}
  try{verifySealedHash(assessmentBasis,'basisHash');if(assessmentBasis.schema!=='lafea-nc06-assessment-basis/v2'||assessmentBasis.approvalMode!=='REPOSITORY_OWNER_EXACT_HEAD_MERGE'||assessmentBasis.independentVerificationMode!=='SEPARATE_ORACLE_IMPLEMENTATION'||assessmentBasis.licensedSourceRedistributionAuthorized!==false)throw Error('basis policy');for(const k of ['clauseSetHash','approvedSourceHash','applicabilityStatementHash','ownerApprovalHash'])if(!HASH_PATTERN.test(assessmentBasis[k]||''))throw Error(k);}catch(e){B.push(`ASSESSMENT_BASIS_INVALID:${e.message}`);}
  const rows=Array.isArray(evidence)?evidence:[],m=new Map(rows.map(r=>[r?.id,r]));if(m.size!==rows.length)B.push('EVIDENCE_DUPLICATE');
  for(const id of REQUIRED_NC06_DOMAINS){const r=m.get(id);if(!r){B.push(`EVIDENCE_MISSING:${id}`);continue;}try{verifySealedHash(r,'evidenceHash');if(r.schema!=='lafea-nc06-package-evidence/v2'||r.exactHeadSha!==candidateExactHeadSha||r.implementationHash!==implementationHash||r.packageHash!==contract.codeAssessmentPackageHash||r.basisHash!==assessmentBasis.basisHash||r.upstreamReceiptSemanticHash!==upstreamReceipt.semanticHash)throw Error('binding');check(id,r.metrics,contract);}catch(e){B.push(`EVIDENCE_INVALID:${id}:${e.message}`);}}
  for(const r of rows)if(!REQUIRED_NC06_DOMAINS.includes(r?.id))B.push(`EVIDENCE_UNKNOWN:${r?.id??'UNKNOWN'}`);
  const q=B.length===0,p={schema:'nonlinear-shell-contact-nc06-report/v2',status:q?'NC06_PACKAGE_QUALIFIED':'NC06_BLOCKED',candidateExactHeadSha,codeAssessmentPackageHash:contract.codeAssessmentPackageHash,assessmentBasisHash:assessmentBasis?.basisHash??null,implementationHash,upstreamReceiptSemanticHash:upstreamReceipt?.semanticHash??null,evaluatedDomainCount:m.size,blockers:B.sort(),authority:{nc06ContractQualified:true,plasticDentingProcedureQualified:upstreamReceipt?.plasticDentingProcedureQualified===true,codeAssessmentPackageQualified:q,nc07Authorized:q,externalCodeComplianceQualified:false,codeAssessmentQualified:false,fitnessForServiceQualified:false,remainingStrengthQualified:false,failurePressureQualified:false,collapseQualified:false,damageQualified:false,fractureQualified:false,fatigueQualified:false,moduleQualified:false,productionExecutionAuthorized:false,automaticAssetAcceptanceAuthorized:false,autonomousCaseDispositionAuthorized:false}};
  return deepFreeze({...p,reportSemanticHash:semanticHash(p)});
}
function check(id,x,c){const max=(k,n)=>{if(!ok(x[k],n))throw Error(k)},min=(k,n)=>{if(!Number.isFinite(x[k])||x[k]<n)throw Error(k)};switch(id){
case REQUIRED_NC06_DOMAINS[0]:min('receiptBound',1);min('qualifiedCellCount',1);max('upstreamMismatchCount',0);break;
case REQUIRED_NC06_DOMAINS[1]:min('sourceHashMatch',1);min('clauseSetHashMatch',1);min('approvalModeMatch',1);max('licensedRedistributionCount',0);break;
case REQUIRED_NC06_DOMAINS[2]:max('unresolvedApplicabilityCount',0);min('exclusionCount',11);max('caseDispositionAuthorityCount',0);break;
case REQUIRED_NC06_DOMAINS[3]:max('maxUnitConversionRelativeError',c.maximumUnitConversionRelativeError);max('unmappedInputCount',0);max('inferredInputCount',0);break;
case REQUIRED_NC06_DOMAINS[4]:max('maxCellMappingRelativeError',c.maximumCellMappingRelativeError);min('mappedFieldCount',10);break;
case REQUIRED_NC06_DOMAINS[5]:max('maximumEquationRelativeError',c.maximumEquationRelativeError);min('clauseCoverageCount',5);min('independentImplementationCount',c.minimumIndependentImplementationCount);break;
case REQUIRED_NC06_DOMAINS[6]:min('rejectionCaseCount',c.minimumRejectionCaseCount);max('falseAcceptCount',0);break;
case REQUIRED_NC06_DOMAINS[7]:max('beneficialUncertaintyViolationCount',0);min('minimumUncertaintyImpact',0);max('prematureRoundingCount',0);break;
case REQUIRED_NC06_DOMAINS[8]:min('referenceCaseCount',c.minimumReferenceCaseCount);max('maximumReferenceDifference',c.maximumEquationRelativeError);max('reproducibilityAbsolute',c.reproducibilityAbsolute);break;
case REQUIRED_NC06_DOMAINS[9]:min('reportSectionCoverageCount',8);max('missingTraceabilityCount',0);min('independentImplementationCount',c.minimumIndependentImplementationCount);max('caseDispositionAuthorityCount',0);break;
default:throw Error('unknown');}}
