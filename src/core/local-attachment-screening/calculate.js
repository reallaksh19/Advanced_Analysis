import { deepFreeze } from '../shared-piping-model/index.js';
import { BASE_LIMITATIONS, ENGINEERING_LEVEL, QUALIFICATION_STATES, RESULT_SCHEMA } from './constants.js';
import { ScreeningError } from './errors.js';
import { validateLocalAttachmentScreeningRequest } from './canonical-request.js';
import { calculateSectionProperties } from './section-properties.js';
import { buildScreeningCaseEvidence } from './case-resultants.js';
import { pressureAtLocation } from './pressure-evidence.js';
import { mechanicalStress, wallLocation } from './mechanics.js';
import { assembleStressState } from './invariants.js';
import { buildEnvelopes } from './envelopes.js';
import { attachResultHashes, reconstructScreeningResultHashes } from './result-hashes.js';

export function calculateLocalAttachmentScreening(input) {
  let request;
  try { request=validateLocalAttachmentScreeningRequest(input); }
  catch(error){return rejectedResult(input,normalizeError(error,QUALIFICATION_STATES.REJECTED_REQUEST,'INVALID_SCREENING_REQUEST'));}
  try { return acceptedResult(request); }
  catch(error){return rejectedResult(input,normalizeError(error,QUALIFICATION_STATES.NUMERICAL_FAILURE,'UNEXPECTED_NUMERICAL_FAILURE'));}
}
export { reconstructScreeningResultHashes };
function acceptedResult(request) {
  const sectionProperties=calculateSectionProperties(request);
  const screeningCases=buildScreeningCaseEvidence(request);
  const pointStressStates=calculatePoints(request,screeningCases,sectionProperties);
  const envelopes=buildEnvelopes(pointStressStates,request.resultRequests.envelopeQuantities,request.qualificationProfile);
  const formulaTrace=executedFormulas(sectionProperties,screeningCases,pointStressStates,envelopes);
  const base={
    schema:RESULT_SCHEMA,requestIdentity:request.requestIdentity,requestVersion:request.requestVersion,
    sourceEvidence:request.sourceEvidence,screeningRequestSemanticHash:request.semanticHash,
    qualification:{state:QUALIFICATION_STATES.ACCEPTED,engineeringLevel:ENGINEERING_LEVEL,qualificationProfile:request.qualificationProfile},
    sectionProperties,screeningCases,pointStressStates,
    envelopes,formulaTrace,diagnostics:[],limitations:resultLimitations(request,pointStressStates),
  };
  return deepFreeze(attachResultHashes(base,request));
}
function calculatePoints(request,cases,section) {
  const source=request.sourceEvidence.foundationResult;
  return cases.flatMap((caseRow)=>request.evaluationLocations.map((location)=>pointState(source,caseRow,location,section,request.qualificationProfile)));
}
function pointState(source,caseRow,location,section,profile) {
  const point=wallLocation(location),mechanical=mechanicalStress(caseRow,point,section);
  const pressure=pressureAtLocation(source,caseRow,location);
  const stressTensor=assembleStressState(mechanical,pressure,profile);
  const formulaIds=[...point.formulaIds,...mechanical.formulaIds,...pressure.formulaIds,...stressTensor.formulaIds].sort();
  return {
    screeningCaseId:caseRow.screeningCaseId,evaluationLocationId:location.evaluationLocationId,
    radius:location.radius,angle:location.angle,coordinates:{y:point.y,z:point.z},
    sourceLoadCaseTerms:caseRow.mechanicalTerms,pressureDefinitionId:caseRow.pressureDefinitionId,
    mechanicalStress:mechanical,pressureStress:pressure,stressTensor,formulaIds,
  };
}
function executedFormulas(section,cases,points,envelopes) {
  const ids=[section,...cases,...points,...envelopes].flatMap((row)=>row.formulaIds??[]);
  return [...new Set(ids)].sort();
}
function resultLimitations(request,points) {
  const values=[...BASE_LIMITATIONS,...request.limitations];
  points.flatMap((row)=>row.pressureStress.limitations??[]).forEach((value)=>values.push(value));
  return [...new Set(values)].sort();
}
function rejectedResult(input,diagnostic) {
  const base={
    schema:RESULT_SCHEMA,requestIdentity:safeString(safeValue(input,'requestIdentity')),requestVersion:safeString(safeValue(input,'requestVersion')),
    sourceEvidence:null,screeningRequestSemanticHash:safeString(safeValue(input,'semanticHash')),
    qualification:{state:diagnostic.state,engineeringLevel:ENGINEERING_LEVEL,qualificationProfile:safeProfile(safeValue(input,'qualificationProfile'))},
    formulaTrace:[],diagnostics:[diagnostic],limitations:[...BASE_LIMITATIONS,'NO_AUTHORITATIVE_SECTION_OR_STRESS_EVIDENCE'].sort(),
  };
  return deepFreeze(attachResultHashes(base,null));
}
function normalizeError(error,fallbackState,fallbackCode) {
  if(error instanceof ScreeningError)return {state:error.state,code:error.code,path:error.path,message:error.message};
  return {state:fallbackState,code:fallbackCode,path:'calculation',message:error instanceof Error?error.message:'Unknown screening failure.'};
}
function safeValue(value,key){try{return value&&typeof value==='object'?value[key]:undefined;}catch{return undefined;}}
function safeString(value){return typeof value==='string'&&value.trim()?value.trim():null;}
function safeProfile(value){return value&&typeof value==='object'?{schema:safeString(safeValue(value,'schema')),identity:safeString(safeValue(value,'identity'))}:null;}
