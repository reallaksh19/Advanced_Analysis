import { FORMULA_IDS } from './constants.js';
import { canonicalNumber, tolerance, within } from './numeric.js';
import { codeSort } from './validation.js';
export function buildEnvelopes(states,quantities,profile) {
  const pointMap=new Map(states.map((row)=>[`${row.screeningCaseId}\0${row.evaluationLocationId}`,row]));
  return quantities.map((quantity)=>selectEnvelope(states,quantity,profile,pointMap));
}
function selectEnvelope(states,quantity,profile,pointMap) {
  const descriptor=quantityDescriptor(quantity);
  const ordered=[...states].sort((left,right)=>candidateOrder(left,right,descriptor));
  const source=ordered[0],value=canonicalNumber(source.stressTensor[descriptor.field]);
  const proof=pointMap.get(`${source.screeningCaseId}\0${source.evaluationLocationId}`);
  const limit=tolerance(profile,'envelopeSource',value,proof.stressTensor[descriptor.field]);
  if(!within(value,proof.stressTensor[descriptor.field],limit))throw new TypeError('Envelope source reconstruction failed.');
  return {
    quantity,value,screeningCaseId:source.screeningCaseId,
    evaluationLocationId:source.evaluationLocationId,radius:source.radius,angle:source.angle,
    sourceLoadCaseTerms:source.sourceLoadCaseTerms,pressureDefinitionId:source.pressureDefinitionId,
    tieBreakRule:'VALUE_THEN_SCREENING_CASE_ID_THEN_EVALUATION_LOCATION_ID_V1',
    qualification:{residual:0,tolerance:limit,accepted:true},formulaIds:[FORMULA_IDS.ENVELOPE],
  };
}
function quantityDescriptor(quantity) {
  if(quantity==='principalMaximum')return {field:'principalMaximum',direction:'max'};
  if(quantity==='principalMinimum')return {field:'principalMinimum',direction:'min'};
  if(quantity==='vonMisesMaximum')return {field:'vonMises',direction:'max'};
  const match=quantity.match(/^(sigmaX|sigmaTheta|sigmaR|tauXTheta)(Maximum|Minimum)$/);
  if(!match)throw new TypeError(`Unknown envelope ${quantity}.`);
  return {field:match[1],direction:match[2]==='Maximum'?'max':'min'};
}
function candidateOrder(left,right,descriptor) {
  const a=left.stressTensor[descriptor.field],b=right.stressTensor[descriptor.field];
  if(a!==b){if(descriptor.direction==='max')return a>b?-1:1;return a<b?-1:1;}
  const caseOrder=codeSort(left.screeningCaseId,right.screeningCaseId);
  return caseOrder||codeSort(left.evaluationLocationId,right.evaluationLocationId);
}
