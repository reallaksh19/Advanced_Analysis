import { deepFreeze, semanticHash } from '../../src/core/nonlinear-shell-contact/contracts.js';
import { REQUIRED_NC07_DOMAINS, DEFAULT_SYNTHETIC_CASE_ASSESSMENT_CONTRACT } from '../../src/core/nonlinear-shell-contact/synthetic-case-assessment-contract.js';
export function buildEvidence({ run, upstreamBinding, exactHeadSha, implementationHash }) {
  const c=DEFAULT_SYNTHETIC_CASE_ASSESSMENT_CONTRACT, common={schema:'lafea-nc07-synthetic-case-evidence/v2',exactHeadSha,implementationHash,contractHash:c.syntheticCaseAssessmentContractHash,upstreamBindingHash:upstreamBinding.semanticHash,caseRecordHash:run.caseRecord.caseRecordHash};
  const metrics=[
    {nc05ReceiptBound:1,nc06ReceiptBound:1,upstreamMismatchCount:0},
    {syntheticNatureDeclared:1,identityHashMatch:1,physicalAssetClaimCount:0},
    {generatedInputProvenanceBound:1,unmappedInputCount:0,inferredPhysicalMeasurementCount:0,unitConversionRelativeError:0},
    {basisHashMatch:1,applicabilityResolved:1,externalCodeClaimCount:0},
    {qualifiedCellMatch:1,nearestCellSubstitutionCount:0,outOfDomainInputCount:0},
    {calculationReproduced:1,equationRelativeError:run.equationRelativeError,ledgerRelativeDifference:0},
    {uncertaintyMarginImpact:run.calculationLedger.ledger.raw.uncertaintyMarginImpact,beneficialUncertaintyViolationCount:0},
    {simulatedReviewerCount:1,simulatedReviewerIndependenceConfirmed:1,humanApprovalClaimCount:0},
    {simulatedOwnerDispositionRecorded:1,engineeringReviewRequired:1,automaticAcceptanceClaimCount:0,realAssetDecisionClaimCount:0},
    {reportSectionCoverageCount:10,retentionHashMatch:1,missingTraceabilityCount:0},
  ];
  return REQUIRED_NC07_DOMAINS.map((id,index)=>{const payload={...common,id,metrics:metrics[index]};return deepFreeze({...payload,evidenceHash:semanticHash(payload)});});
}
