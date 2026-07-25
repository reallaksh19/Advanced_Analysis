import { semanticHash } from '../shared-piping-model/index.js';
export function attachResultHashes(base,request) {
  const result={...base};
  result.semanticHashes=reconstructScreeningResultHashes(result,request);
  return result;
}
export function reconstructScreeningResultHashes(result,request) {
  return {
    sourceEvidenceSemanticHash:semanticHash(request?.sourceEvidence??result.sourceEvidence??null),
    screeningRequestSemanticHash:request?.semanticHash??result.screeningRequestSemanticHash??null,
    screeningResultPayloadSemanticHash:semanticHash(payload(result)),
    executionEvidenceHash:semanticHash(execution(result)),
    qualificationEvidenceHash:semanticHash(qualification(result)),
  };
}
function payload(result){const {semanticHashes:_semanticHashes,...rest}=result;return rest;}
function execution(result){return {sectionProperties:result.sectionProperties??null,screeningCases:result.screeningCases??null,pointStressStates:result.pointStressStates??null,envelopes:result.envelopes??null,formulaTrace:result.formulaTrace??[]};}
function qualification(result){return {qualification:result.qualification,diagnostics:result.diagnostics,limitations:result.limitations};}
