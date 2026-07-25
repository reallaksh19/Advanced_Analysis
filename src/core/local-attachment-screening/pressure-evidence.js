import { END_CONDITIONS } from '../local-stress/index.js';
import { FORMULA_IDS } from './constants.js';
import { sourceError, unsupportedError } from './errors.js';
import { canonicalNumber } from './numeric.js';
export function pressureAtLocation(sourceResult,caseRow,location) {
  const pressure=sourceResult.pressureStressResults.find((row)=>row.pressureDefinitionIdentity===caseRow.pressureDefinitionId);
  const reused=findPoint(pressure.requestedPoints,location.radius);
  const point=reused??recoverPoint(pressure,location.radius);
  const axial=axialPressureComponent(pressure,caseRow.pressureFactor);
  return {
    pressureDefinitionId:caseRow.pressureDefinitionId, pressureResultIdentity:pressure.identity,
    pressureFactor:caseRow.pressureFactor, radius:location.radius,
    sigmaRPressure:canonicalNumber(point.radialStress*caseRow.pressureFactor),
    sigmaThetaPressure:canonicalNumber(point.hoopStress*caseRow.pressureFactor),
    sigmaXPressure:axial, sourceAxialPressureStress:pressure.axialPressureStress,
    explicitAxialResultant:pressure.explicitAxialResultant,
    endCondition:pressure.endCondition, limitations:pressure.limitations,
    sourceReferences:pressure.sourceReferences,
    reuseMode:reused?'EXACT_POINT':'COEFFICIENT_RADIUS_RECOVERY',
    formulaIds:[reused?FORMULA_IDS.PRESSURE_EXACT:FORMULA_IDS.PRESSURE_RADIUS],
  };
}
function axialPressureComponent(pressure,factor) {
  if(factor===0||pressure.endCondition===END_CONDITIONS.EXPLICIT_AXIAL_RESULTANT)return 0;
  if(pressure.endCondition===END_CONDITIONS.UNSPECIFIED)throw unsupportedError('UNSPECIFIED_AXIAL_PRESSURE_SCREENING','screeningCases.pressureDefinitionId','A non-zero pressure factor requires declared axial-pressure semantics.');
  if(typeof pressure.axialPressureStress!=='number'||!Number.isFinite(pressure.axialPressureStress))throw sourceError('FOUNDATION_AXIAL_PRESSURE_EVIDENCE_MISSING','sourceEvidence.foundationResult.pressureStressResults','Foundation axial pressure evidence is required for a non-zero pressure factor.');
  if(pressure.endCondition===END_CONDITIONS.OPEN_END&&pressure.axialPressureStress!==0)throw sourceError('FOUNDATION_OPEN_END_AXIAL_EVIDENCE_INVALID','sourceEvidence.foundationResult.pressureStressResults','Open-end axial pressure evidence must be zero.');
  return canonicalNumber(pressure.axialPressureStress*factor);
}
function findPoint(points,radius) { return points.find((row)=>row.radius===radius)??null; }
function recoverPoint(pressure,radius) {
  const a=pressure.coefficientA,b=pressure.coefficientB;
  return {radialStress:canonicalNumber(a-b/radius**2),hoopStress:canonicalNumber(a+b/radius**2)};
}
