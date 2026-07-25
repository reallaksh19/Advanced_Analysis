import { FORMULA_IDS } from './constants.js';
import { canonicalNumber, tolerance, within } from './numeric.js';
export function assembleStressState(mechanical,pressure,profile) {
  const tensor={
    sigmaX:canonicalNumber(mechanical.sigmaXMechanical+pressure.sigmaXPressure),
    sigmaTheta:pressure.sigmaThetaPressure,sigmaR:pressure.sigmaRPressure,
    tauXTheta:mechanical.tauXThetaTorsion,
  };
  const principal=principalStresses(tensor),vonMises=vonMisesStress(tensor);
  const qualification=qualifyAll(tensor,mechanical,pressure,principal,vonMises,profile);
  return {...tensor,...principal,vonMises,qualification,formulaIds:[FORMULA_IDS.TENSOR,FORMULA_IDS.VON_MISES,FORMULA_IDS.PRINCIPAL]};
}
export function vonMisesStress({sigmaX:x,sigmaTheta:t,sigmaR:r,tauXTheta:q}) {
  return canonicalNumber(Math.sqrt(0.5*((x-t)**2+(t-r)**2+(r-x)**2)+3*q**2));
}
export function principalStresses({sigmaX:x,sigmaTheta:t,sigmaR:r,tauXTheta:q}) {
  const mean=(x+t)/2,root=Math.sqrt(((x-t)/2)**2+q**2);
  const values=[canonicalNumber(mean+root),canonicalNumber(mean-root),r].sort((a,b)=>b-a);
  return {principalMaximum:values[0],principalIntermediate:values[1],principalMinimum:values[2]};
}
function qualifyAll(tensor,mechanical,pressure,principal,vm,profile) {
  const assembly=assemblyEvidence(tensor,mechanical,pressure,profile);
  const principalEvidence=principalReconstruction(tensor,principal,profile);
  const vonMisesEvidence=vonMisesReconstruction(tensor,principal,vm,profile);
  return {stressTensor:assembly,principalStress:principalEvidence,vonMises:vonMisesEvidence,accepted:true};
}
function assemblyEvidence(tensor,mechanical,pressure,profile) {
  const expected=[mechanical.sigmaXMechanical+pressure.sigmaXPressure,pressure.sigmaThetaPressure,pressure.sigmaRPressure,mechanical.tauXThetaTorsion];
  const actual=[tensor.sigmaX,tensor.sigmaTheta,tensor.sigmaR,tensor.tauXTheta];
  const residual=actual.map((value,index)=>canonicalNumber(value-expected[index]));
  const limit=tolerance(profile,'stressTensor',...actual,...expected);assertResiduals(residual,limit,'Stress tensor assembly');
  return {residual,tolerance:limit,accepted:true};
}
function principalReconstruction(tensor,principal,profile) {
  const values=[principal.principalMaximum,principal.principalIntermediate,principal.principalMinimum];
  const scale=Math.max(1,...Object.values(tensor).map(Math.abs));
  const residual=values.map((value)=>canonicalNumber(characteristic(tensor,value)/(scale**2)));
  const limit=tolerance(profile,'principalStress',...values,...Object.values(tensor));assertResiduals(residual,limit,'Principal stress');
  return {characteristicResidualNormalized:residual,tolerance:limit,accepted:true};
}
function vonMisesReconstruction(tensor,principal,vm,profile) {
  const p=[principal.principalMaximum,principal.principalIntermediate,principal.principalMinimum];
  const fromPrincipal=canonicalNumber(Math.sqrt(0.5*((p[0]-p[1])**2+(p[1]-p[2])**2+(p[2]-p[0])**2)));
  const direct=vonMisesStress(tensor),residual=[canonicalNumber(vm-direct),canonicalNumber(vm-fromPrincipal)];
  const limit=tolerance(profile,'vonMises',vm,direct,fromPrincipal);assertResiduals(residual,limit,'Von Mises');
  return {residual,tolerance:limit,accepted:true};
}
function characteristic({sigmaX:x,sigmaTheta:t,sigmaR:r,tauXTheta:q},value){return (value-r)*((value-x)*(value-t)-q**2);}
function assertResiduals(values,limit,label){if(values.some((value)=>!within(value,0,limit)))throw new TypeError(`${label} reconstruction failed.`);}
