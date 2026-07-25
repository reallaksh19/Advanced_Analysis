import { FORMULA_IDS } from './constants.js';
import { canonicalNumber } from './numeric.js';
export function wallLocation(location) {
  const y=canonicalNumber(location.radius*Math.sin(location.angle));
  const z=canonicalNumber(location.radius*Math.cos(location.angle));
  return {evaluationLocationId:location.evaluationLocationId,radiusBasis:location.radiusBasis,radius:location.radius,angle:location.angle,y,z,sourceReference:location.sourceReference,formulaIds:[FORMULA_IDS.WALL_LOCATION]};
}
export function mechanicalStress(caseRow,point,section) {
  const [fx,fy,fz]=caseRow.combinedForceLocal,[mx,my,mz]=caseRow.combinedMomentLocal;
  const axial=canonicalNumber(fx/section.crossSectionArea);
  const bending=canonicalNumber(my*point.z/section.secondMomentY-mz*point.y/section.secondMomentZ);
  const torsion=canonicalNumber(mx*point.radius/section.polarMoment);
  return {
    sigmaXAxialMembrane:axial,sigmaXBiaxialBending:bending,
    sigmaXMechanical:canonicalNumber(axial+bending),tauXThetaTorsion:torsion,
    retainedResultants:{forceX:fx,forceY:fy,forceZ:fz,momentX:mx,momentY:my,momentZ:mz},
    signConvention:'SIGMA_X_EQUALS_FX_OVER_A_PLUS_MY_Z_OVER_IY_MINUS_MZ_Y_OVER_IZ;TAU_X_THETA_EQUALS_MX_R_OVER_J',
    formulaIds:[FORMULA_IDS.AXIAL_MEMBRANE,FORMULA_IDS.BIAXIAL_BENDING,FORMULA_IDS.TORSION],
  };
}
