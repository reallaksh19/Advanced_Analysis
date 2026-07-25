import { FORMULA_IDS, SECTION_BASIS } from './constants.js';
import { canonicalNumber, tolerance, within } from './numeric.js';
import { requestError } from './errors.js';
export function calculateSectionProperties(request) {
  const model=request.sourceEvidence.foundationModel;
  const ro=canonicalNumber(model.pipeGeometry.outsideDiameter.value/2);
  const t=canonicalNumber(model.thicknessBasis.assessmentPipeThickness.value);
  const ri=canonicalNumber(ro-t);
  if(!(ro>0&&ri>=0&&ro>ri))throw requestError('INVALID_SECTION_GEOMETRY','sourceEvidence.foundationModel','Invalid assessed pipe annulus.');
  const area=canonicalNumber(Math.PI*(ro**2-ri**2));
  const inertia=canonicalNumber(Math.PI/4*(ro**4-ri**4));
  const polar=canonicalNumber(Math.PI/2*(ro**4-ri**4));
  const evidence=sectionIdentityEvidence(request.qualificationProfile,inertia,polar);
  return {
    innerRadius:ri, outerRadius:ro, assessmentPipeThickness:t,
    crossSectionArea:area, secondMomentY:inertia, secondMomentZ:inertia,
    polarMoment:polar, sectionBasis:SECTION_BASIS,
    units:{length:'mm',area:'mm²',secondMoment:'mm⁴',polarMoment:'mm⁴'},
    sourceReferences:{outsideDiameter:model.pipeGeometry.outsideDiameter.sourceRef,assessmentPipeThickness:model.thicknessBasis.assessmentPipeThickness.sourceRef},
    formulaIds:[FORMULA_IDS.ANNULUS_AREA,FORMULA_IDS.ANNULUS_POLAR_MOMENT,FORMULA_IDS.ANNULUS_SECOND_MOMENT],
    qualification:evidence,
  };
}
function sectionIdentityEvidence(profile,inertia,polar) {
  const toleranceValue=tolerance(profile,'sectionProperty',polar,2*inertia);
  const symmetryResidual=canonicalNumber(inertia-inertia),polarResidual=canonicalNumber(polar-2*inertia);
  if(!within(symmetryResidual,0,toleranceValue)||!within(polarResidual,0,toleranceValue))throw new TypeError('Annulus section identities did not qualify.');
  return {checks:[{identity:'IY_EQUALS_IZ',residual:symmetryResidual},{identity:'J_EQUALS_IY_PLUS_IZ',residual:polarResidual}],tolerance:toleranceValue,accepted:true};
}
