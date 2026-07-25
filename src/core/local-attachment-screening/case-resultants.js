import { END_CONDITIONS } from '../local-stress/index.js';
import { FORMULA_IDS } from './constants.js';
import { sourceError } from './errors.js';
import { canonicalNumber, tolerance, within } from './numeric.js';
export function buildScreeningCaseEvidence(request) {
  const source=request.sourceEvidence.foundationResult;
  const loadMap=new Map(source.transformedLoadCases.map((row)=>[row.identity,row]));
  const pressureMap=new Map(source.pressureStressResults.map((row)=>[row.pressureDefinitionIdentity,row]));
  return request.screeningCases.map((row)=>buildCase(row,loadMap,pressureMap,request.qualificationProfile));
}
function buildCase(row,loadMap,pressureMap,profile) {
  const termEvidence=row.mechanicalTerms.map((term)=>scaledTerm(term,loadMap.get(term.loadCaseId)));
  const summed=sumTerms(termEvidence);
  const pressure=pressureMap.get(row.pressureDefinitionId);
  const explicit=scaledExplicitAxial(pressure,row.pressureFactor);
  const totalForce=[canonicalNumber(summed.force[0]+explicit),summed.force[1],summed.force[2]];
  const evidence=superpositionEvidence(profile,termEvidence,explicit,totalForce,summed.moment);
  const formulaIds=[FORMULA_IDS.LINEAR_CASE]; if(explicit!==0)formulaIds.push(FORMULA_IDS.EXPLICIT_AXIAL);
  return {
    screeningCaseId:row.screeningCaseId, mechanicalTerms:row.mechanicalTerms,
    pressureDefinitionId:row.pressureDefinitionId, pressureFactor:row.pressureFactor,
    sourceReference:row.sourceReference, termEvidence, explicitAxialMechanicalResultant:explicit,
    combinedForceLocal:totalForce, combinedMomentLocal:summed.moment,
    transverseResultantsRetained:{forceY:totalForce[1],forceZ:totalForce[2]},
    pressureEvidenceIdentity:pressure.identity, formulaIds:formulaIds.sort(), qualification:evidence,
  };
}
function scaledExplicitAxial(pressure,factor) {
  if(pressure.endCondition!==END_CONDITIONS.EXPLICIT_AXIAL_RESULTANT||factor===0)return 0;
  if(typeof pressure.explicitAxialResultant!=='number'||!Number.isFinite(pressure.explicitAxialResultant))throw sourceError('FOUNDATION_EXPLICIT_AXIAL_RESULTANT_MISSING','sourceEvidence.foundationResult.pressureStressResults','Explicit axial resultant evidence is required.');
  return canonicalNumber(pressure.explicitAxialResultant*factor);
}
function scaledTerm(term,source) {
  return {
    loadCaseId:term.loadCaseId, factor:term.factor,
    forceLocal:source.transformedForceLocal.map((value)=>canonicalNumber(value*term.factor)),
    momentLocal:source.transformedMomentLocal.map((value)=>canonicalNumber(value*term.factor)),
    sourceReferences:source.sourceReferences,
  };
}
function sumTerms(terms) {
  return terms.reduce((sum,row)=>({force:add(sum.force,row.forceLocal),moment:add(sum.moment,row.momentLocal)}),{force:[0,0,0],moment:[0,0,0]});
}
function add(left,right){return left.map((value,index)=>canonicalNumber(value+right[index]));}
function superpositionEvidence(profile,terms,explicit,force,moment) {
  const reconstructed=sumTerms(terms); reconstructed.force[0]=canonicalNumber(reconstructed.force[0]+explicit);
  const residual=[...force.map((v,i)=>canonicalNumber(v-reconstructed.force[i])),...moment.map((v,i)=>canonicalNumber(v-reconstructed.moment[i]))];
  const limit=tolerance(profile,'linearSuperposition',...force,...moment); if(residual.some((value)=>!within(value,0,limit)))throw new TypeError('Linear superposition failed.');
  return {residual,tolerance:limit,accepted:true};
}
