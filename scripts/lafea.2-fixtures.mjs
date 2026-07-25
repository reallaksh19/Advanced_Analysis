import {
  ACTION_SENSES, COORDINATE_SYSTEMS, END_CONDITIONS,
  calculateLocalAttachmentFoundation,
} from '../src/core/local-stress/index.js';
import { canonicalFixture } from './lafea.1-fixtures.mjs';
import {
  ENVELOPE_QUANTITIES, QUALIFICATION_PROFILE, REQUEST_SCHEMA, RADIUS_BASES,
  SECTION_BASIS, SOURCE_SCHEMA, createLocalAttachmentScreeningRequest,
} from '../src/core/local-attachment-screening/index.js';

export function foundationSourceFixture(mutator=()=>{}) {
  const foundationModel=canonicalFixture((source,ref)=>configureFoundation(source,ref));
  const foundationResult=calculateLocalAttachmentFoundation(foundationModel);
  const evidence={schema:SOURCE_SCHEMA,foundationModel:JSON.parse(JSON.stringify(foundationModel)),foundationResult:JSON.parse(JSON.stringify(foundationResult))};
  mutator(evidence); return evidence;
}
export function rawRequestFixture(mutator=()=>{}) {
  const raw={
    schema:REQUEST_SCHEMA,requestIdentity:'SCREEN-1',requestVersion:'1',
    sourceEvidence:foundationSourceFixture(),sectionBasis:{basis:SECTION_BASIS},
    screeningCases:defaultCases(),evaluationLocations:defaultLocations(),
    resultRequests:{envelopeQuantities:[...ENVELOPE_QUANTITIES]},
    qualificationProfile:JSON.parse(JSON.stringify(QUALIFICATION_PROFILE)),limitations:[],
  };
  mutator(raw); return raw;
}
export function screeningRequestFixture(mutator=()=>{}) { return createLocalAttachmentScreeningRequest(rawRequestFixture(mutator)); }
function configureFoundation(source,ref) {
  source.loadCases=[load('LC-A',[1000,100,-50],[5000,20000,-10000],ref),load('LC-B',[-500,-25,75],[-2000,-5000,15000],ref)];
  source.resultRequests.transformedLoadCaseIdentities=['LC-A','LC-B'];
  source.pressureDefinitions.push({identity:'P-EXTERNAL',internalPressure:{value:0,sourceRef:ref('pressure.P-EXTERNAL.internal')},externalPressure:{value:1,sourceRef:ref('pressure.P-EXTERNAL.external')},endCondition:END_CONDITIONS.CLOSED_END});
  source.resultRequests.pressure=[
    pressureRequest('P-CLOSED',ref,true),pressureRequest('P-OPEN',ref,true),
    pressureRequest('P-EXPLICIT',ref,true),pressureRequest('P-EXTERNAL',ref,true),
    pressureRequest('P-UNSPECIFIED',ref,false),
  ];
}
function load(identity,force,moment,ref) {
  return {identity,sourceCoordinateSystem:COORDINATE_SYSTEMS.PIPE_LOCAL,sourceReferencePointIdentity:'TARGET',targetReferencePointIdentity:'TARGET',actionSense:ACTION_SENSES.SUPPORT_ON_PIPE,force:{value:force,sourceRef:ref(`loads.${identity}.force`)},moment:{value:moment,sourceRef:ref(`loads.${identity}.moment`)}};
}
function pressureRequest(identity,ref,includeAxialPressureStress) {
  return {identity:`PR-${identity}`,pressureDefinitionIdentity:identity,requestedRadii:[490,495,500].map((value,index)=>({value,sourceRef:ref(`requests.${identity}.radius.${index}`)})),includeAxialPressureStress,includeThinWallComparison:false};
}
function defaultCases() {
  return [{screeningCaseId:'CASE-A',mechanicalTerms:[{loadCaseId:'LC-A',factor:1}],pressureDefinitionId:'P-CLOSED',pressureFactor:1,sourceReference:'CASE#A'},{screeningCaseId:'CASE-B',mechanicalTerms:[{loadCaseId:'LC-B',factor:2},{loadCaseId:'LC-A',factor:-0.5}],pressureDefinitionId:'P-OPEN',pressureFactor:0.5,sourceReference:'CASE#B'}];
}
function defaultLocations() {
  return [location('L0',RADIUS_BASES.OUTER_SURFACE,0),location('L90',RADIUS_BASES.OUTER_SURFACE,Math.PI/2),location('L180',RADIUS_BASES.OUTER_SURFACE,Math.PI),location('L270',RADIUS_BASES.OUTER_SURFACE,3*Math.PI/2),location('LMID',RADIUS_BASES.MID_SURFACE,Math.PI/4)];
}
function location(id,radiusBasis,angle) { return {evaluationLocationId:id,radiusBasis,explicitRadius:null,angle,sourceReference:`LOCATION#${id}`}; }
