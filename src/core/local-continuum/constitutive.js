import { FORMULA_IDS, FORMULATIONS } from './constants.js';
import { numericalError } from './errors.js';
import { canonicalNumber, maxAbs, tolerance } from './numeric.js';
import { symmetryResidual } from './matrix.js';
export function constitutiveEvidence(material,formulation,profile){const matrix=formulation===FORMULATIONS.PLANE_STRESS?planeStress(material):planeStrain(material);const residual=symmetryResidual(matrix),scale=maxAbs(matrix),limit=tolerance(profile,'constitutiveSymmetry',scale),accepted=residual<=limit;if(!accepted)throw numericalError('CONSTITUTIVE_SYMMETRY_FAILURE',`materials.${material.materialId}`,'Constitutive symmetry did not qualify.');return {materialId:material.materialId,formulation,matrix,symmetry:{residual,scale,tolerance:limit,accepted},formulaIds:[formulation===FORMULATIONS.PLANE_STRESS?FORMULA_IDS.PLANE_STRESS_D:FORMULA_IDS.PLANE_STRAIN_D]};}
function planeStress(material){const {elasticModulus:e,poissonRatio:nu}=material,f=e/(1-nu**2);return [[f,f*nu,0],[f*nu,f,0],[0,0,f*(1-nu)/2]].map(canonicalRow);}
function planeStrain(material){const {elasticModulus:e,poissonRatio:nu}=material,f=e/((1+nu)*(1-2*nu));return [[f*(1-nu),f*nu,0],[f*nu,f*(1-nu),0],[0,0,f*(1-2*nu)/2]].map(canonicalRow);}
function canonicalRow(row){return row.map((value)=>canonicalNumber(value,'constitutive matrix'));}
