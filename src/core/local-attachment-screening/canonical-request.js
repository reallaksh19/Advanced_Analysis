import { deepFreeze, semanticHash } from '../shared-piping-model/index.js';
import {
  ENVELOPE_QUANTITIES, PROFILE_SCHEMA, QUALIFICATION_PROFILE, RADIUS_BASES,
  REQUEST_SCHEMA, SECTION_BASIS,
} from './constants.js';
import { requestError, unsupportedError } from './errors.js';
import { normalizedAngle, strictNumber } from './numeric.js';
import { codeSort, deepClone, exactRecord, nonEmptyString, uniqueIdentities } from './validation.js';
import { validateFoundationSourceEvidence } from './source-evidence.js';

export function createLocalAttachmentScreeningRequest(input) {
  const raw=deepClone(input,'request'); exactRecord(raw,requestInputKeys(),'request');
  const request=canonicalRequest(raw); request.semanticHash=requestHash(request); return deepFreeze(request);
}
export function validateLocalAttachmentScreeningRequest(input) {
  const raw=deepClone(input,'request'); exactRecord(raw,[...requestInputKeys(),'semanticHash'],'request');
  const expected=createLocalAttachmentScreeningRequest(stripDerived(raw));
  if(raw.semanticHash!==expected.semanticHash||semanticHash(raw)!==semanticHash(expected))throw requestError('REQUEST_HASH_MISMATCH','semanticHash','Screening request does not reconstruct.');
  return expected;
}
function canonicalRequest(input) {
  if(input.schema!==REQUEST_SCHEMA)throw requestError('REQUEST_SCHEMA_MISMATCH','schema',`schema must be ${REQUEST_SCHEMA}.`);
  const sourceEvidence=validateFoundationSourceEvidence(input.sourceEvidence);
  const cases=canonicalCases(input.screeningCases,sourceEvidence.foundationResult);
  const locations=canonicalLocations(input.evaluationLocations,sourceEvidence.foundationModel);
  return {
    schema:REQUEST_SCHEMA, requestIdentity:nonEmptyString(input.requestIdentity,'requestIdentity'),
    requestVersion:nonEmptyString(input.requestVersion,'requestVersion'), sourceEvidence,
    sectionBasis:canonicalSectionBasis(input.sectionBasis), screeningCases:cases,
    evaluationLocations:locations, resultRequests:canonicalResultRequests(input.resultRequests),
    qualificationProfile:canonicalProfile(input.qualificationProfile), limitations:canonicalLimitations(input.limitations),
  };
}
function canonicalCases(values,result) {
  if(!Array.isArray(values)||values.length===0)throw requestError('SCREENING_CASES_REQUIRED','screeningCases','At least one screening case is required.');
  const rows=values.map((row,index)=>canonicalCase(row,index)); uniqueIdentities(rows,'screeningCaseId','screeningCases');
  const loads=new Set(result.transformedLoadCases.map((row)=>row.identity));
  const pressures=new Set(result.pressureStressResults.map((row)=>row.pressureDefinitionIdentity));
  rows.forEach((row)=>validateCaseReferences(row,loads,pressures)); return rows.sort((a,b)=>codeSort(a.screeningCaseId,b.screeningCaseId));
}
function canonicalCase(row,index) {
  const path=`screeningCases[${index}]`; exactRecord(row,['screeningCaseId','mechanicalTerms','pressureDefinitionId','pressureFactor','sourceReference'],path);
  if(!Array.isArray(row.mechanicalTerms))throw requestError('MECHANICAL_TERMS_REQUIRED',`${path}.mechanicalTerms`,'mechanicalTerms must be an array.');
  const terms=row.mechanicalTerms.map((term,termIndex)=>canonicalTerm(term,`${path}.mechanicalTerms[${termIndex}]`));
  uniqueIdentities(terms,'loadCaseId',`${path}.mechanicalTerms`); terms.sort((a,b)=>codeSort(a.loadCaseId,b.loadCaseId));
  return {screeningCaseId:nonEmptyString(row.screeningCaseId,`${path}.screeningCaseId`),mechanicalTerms:terms,pressureDefinitionId:nonEmptyString(row.pressureDefinitionId,`${path}.pressureDefinitionId`),pressureFactor:strictNumber(row.pressureFactor,`${path}.pressureFactor`),sourceReference:nonEmptyString(row.sourceReference,`${path}.sourceReference`)};
}
function canonicalTerm(row,path){exactRecord(row,['loadCaseId','factor'],path);return {loadCaseId:nonEmptyString(row.loadCaseId,`${path}.loadCaseId`),factor:strictNumber(row.factor,`${path}.factor`) };}
function validateCaseReferences(row,loads,pressures){row.mechanicalTerms.forEach((term)=>{if(!loads.has(term.loadCaseId))throw requestError('LOAD_CASE_REFERENCE_MISSING',`screeningCases.${row.screeningCaseId}`,`Missing load case ${term.loadCaseId}.`);});if(!pressures.has(row.pressureDefinitionId))throw requestError('PRESSURE_REFERENCE_MISSING',`screeningCases.${row.screeningCaseId}`,`Missing pressure definition ${row.pressureDefinitionId}.`);}
function canonicalLocations(values,model) {
  if(!Array.isArray(values)||values.length===0)throw requestError('EVALUATION_LOCATIONS_REQUIRED','evaluationLocations','At least one evaluation location is required.');
  const ro=model.pipeGeometry.outsideDiameter.value/2,ri=ro-model.thicknessBasis.assessmentPipeThickness.value;
  const rows=values.map((row,index)=>canonicalLocation(row,index,ri,ro)); uniqueIdentities(rows,'evaluationLocationId','evaluationLocations');
  return rows.sort((a,b)=>codeSort(a.evaluationLocationId,b.evaluationLocationId));
}
function canonicalLocation(row,index,ri,ro) {
  const path=`evaluationLocations[${index}]`; exactRecord(row,['evaluationLocationId','radiusBasis','explicitRadius','angle','sourceReference'],path);
  if(!Object.values(RADIUS_BASES).includes(row.radiusBasis))throw unsupportedError('RADIUS_BASIS_UNSUPPORTED',`${path}.radiusBasis`,`Unsupported radius basis ${row.radiusBasis}.`);
  const explicit=row.explicitRadius===null?null:strictNumber(row.explicitRadius,`${path}.explicitRadius`);
  if(row.radiusBasis===RADIUS_BASES.EXPLICIT_RADIUS&&explicit===null)throw requestError('EXPLICIT_RADIUS_REQUIRED',`${path}.explicitRadius`,'Explicit radius is required.');
  if(row.radiusBasis!==RADIUS_BASES.EXPLICIT_RADIUS&&explicit!==null)throw requestError('EXPLICIT_RADIUS_FORBIDDEN',`${path}.explicitRadius`,'Explicit radius is only valid for EXPLICIT_RADIUS.');
  const radius=resolvedRadius(row.radiusBasis,explicit,ri,ro); if(radius<ri||radius>ro)throw requestError('RADIUS_OUTSIDE_WALL',`${path}.explicitRadius`,'Radius lies outside the assessed wall.');
  return {evaluationLocationId:nonEmptyString(row.evaluationLocationId,`${path}.evaluationLocationId`),radiusBasis:row.radiusBasis,explicitRadius:explicit,radius,angle:normalizedAngle(row.angle),sourceReference:nonEmptyString(row.sourceReference,`${path}.sourceReference`)};
}
function resolvedRadius(basis,explicit,ri,ro){if(basis===RADIUS_BASES.INNER_SURFACE)return ri;if(basis===RADIUS_BASES.MID_SURFACE)return (ri+ro)/2;if(basis===RADIUS_BASES.OUTER_SURFACE)return ro;return explicit;}
function canonicalSectionBasis(row){exactRecord(row,['basis'],'sectionBasis');if(row.basis!==SECTION_BASIS)throw unsupportedError('SECTION_BASIS_UNSUPPORTED','sectionBasis.basis',`basis must be ${SECTION_BASIS}.`);return {basis:SECTION_BASIS};}
function canonicalResultRequests(row){exactRecord(row,['envelopeQuantities'],'resultRequests');if(!Array.isArray(row.envelopeQuantities)||row.envelopeQuantities.length===0)throw requestError('ENVELOPE_REQUEST_REQUIRED','resultRequests.envelopeQuantities','Envelope quantities are required.');const values=[...row.envelopeQuantities].map((value,index)=>nonEmptyString(value,`resultRequests.envelopeQuantities[${index}]`));if(new Set(values).size!==values.length)throw requestError('DUPLICATE_ENVELOPE_QUANTITY','resultRequests.envelopeQuantities','Duplicate envelope quantity.');values.forEach((value)=>{if(!ENVELOPE_QUANTITIES.includes(value))throw unsupportedError('ENVELOPE_QUANTITY_UNSUPPORTED','resultRequests.envelopeQuantities',`Unsupported envelope ${value}.`);});return {envelopeQuantities:values.sort(codeSort)};}
function canonicalProfile(row){exactRecord(row,['schema','identity','tolerances'],'qualificationProfile');if(row.schema!==PROFILE_SCHEMA)throw requestError('PROFILE_SCHEMA_MISMATCH','qualificationProfile.schema',`schema must be ${PROFILE_SCHEMA}.`);exactRecord(row.tolerances,Object.keys(QUALIFICATION_PROFILE.tolerances),'qualificationProfile.tolerances');const tolerances={};Object.keys(QUALIFICATION_PROFILE.tolerances).sort(codeSort).forEach((key)=>{const rule=row.tolerances[key];exactRecord(rule,['absolute','relative'],`qualificationProfile.tolerances.${key}`);const absolute=strictNumber(rule.absolute,`qualificationProfile.tolerances.${key}.absolute`),relative=strictNumber(rule.relative,`qualificationProfile.tolerances.${key}.relative`);if(absolute<0||relative<0)throw requestError('NEGATIVE_TOLERANCE',`qualificationProfile.tolerances.${key}`,'Tolerances must be non-negative.');tolerances[key]={absolute,relative};});return {schema:PROFILE_SCHEMA,identity:nonEmptyString(row.identity,'qualificationProfile.identity'),tolerances};}
function canonicalLimitations(values){if(!Array.isArray(values))throw requestError('LIMITATIONS_REQUIRED','limitations','limitations must be an array.');const rows=values.map((value,index)=>nonEmptyString(value,`limitations[${index}]`));if(new Set(rows).size!==rows.length)throw requestError('DUPLICATE_LIMITATION','limitations','Duplicate limitation.');return rows.sort(codeSort);}
function requestInputKeys(){return ['schema','requestIdentity','requestVersion','sourceEvidence','sectionBasis','screeningCases','evaluationLocations','resultRequests','qualificationProfile','limitations'];}
function stripDerived(value){const {semanticHash:_semanticHash,...rest}=value;if(!Array.isArray(rest.evaluationLocations))return rest;return {...rest,evaluationLocations:rest.evaluationLocations.map(({radius:_radius,...row})=>row)};}
function requestHash(value){return semanticHash(value);}
