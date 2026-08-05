import assert from 'node:assert/strict';
import { clonePlain } from './contracts.js';
import { createPlasticMaterialContract, validatePlasticMaterialContract } from './plastic-material-contract.js';
import { evaluatePlasticMaterialQualification } from './plastic-material-qualification-evaluator.js';
import { PASSING_MATERIAL_EVIDENCE_PACKAGE, PASSING_NC04_SOLVER_CUSTODY, createPassingPlasticMaterialEvidence } from './nc04-fixtures.js';
export function runNc04NegativeControls(){
  const results=[]; const rejects=(id,mutate)=>{const record=clonePlain(createPlasticMaterialContract());mutate(record);delete record.plasticMaterialContractHash;assert.throws(()=>validatePlasticMaterialContract(record));results.push({id,passed:true});};
  rejects('REJECT_ENGINEERING_STRESS',(r)=>{r.stressMeasure='ENGINEERING_STRESS';});
  rejects('REJECT_TOTAL_ENGINEERING_STRAIN',(r)=>{r.strainMeasure='ENGINEERING_TOTAL_STRAIN';});
  rejects('REJECT_NONASSOCIATIVE_FLOW',(r)=>{r.flowRule='NONASSOCIATIVE';});
  rejects('REJECT_ARBITRARY_HARDENING',(r)=>{r.hardeningModel='UNBOUNDED_CURVE_FIT';});
  rejects('REJECT_NO_CONSISTENT_TANGENT',(r)=>{r.consistentAlgorithmicTangentRequired=false;});
  rejects('REJECT_SINGLE_COUPON',(r)=>{r.minimumReplicatesPerOrientation=1;});
  rejects('REJECT_MISSING_CIRCUMFERENTIAL',(r)=>{r.requiredOrientations=['LONGITUDINAL'];});
  rejects('REJECT_UNBOUNDED_STRAIN_AUTHORITY',(r)=>{r.maximumQualifiedPlasticStrainPolicy='UNLIMITED';});
  rejects('REJECT_NAIVE_POSTNECKING',(r)=>{r.postNeckingAuthority='NAIVE_ENGINEERING_CONVERSION';});
  rejects('REJECT_KINEMATIC_HARDENING',(r)=>{r.kinematicHardeningAuthorized=true;});
  rejects('REJECT_RATE_DEPENDENCE',(r)=>{r.rateDependenceAuthorized=true;});
  rejects('REJECT_ANISOTROPY',(r)=>{r.anisotropyAuthorized=true;});
  rejects('REJECT_DAMAGE',(r)=>{r.damageAuthorized=true;});
  const base={contract:createPlasticMaterialContract(),solverCustody:PASSING_NC04_SOLVER_CUSTODY,materialEvidencePackage:PASSING_MATERIAL_EVIDENCE_PACKAGE,benchmarkEvidence:createPassingPlasticMaterialEvidence()};
  for (const [id,input] of [['BLOCK_MISSING_SOLVER_CUSTODY',{...base,solverCustody:{}}],['BLOCK_MISSING_MATERIAL_PACKAGE',{...base,materialEvidencePackage:null}],['BLOCK_MISSING_BENCHMARK',{...base,benchmarkEvidence:base.benchmarkEvidence.slice(1)}]]) {const report=evaluatePlasticMaterialQualification(input);assert.equal(report.authority.plasticMaterialQualified,false);results.push({id,passed:true});}
  const few=clonePlain(PASSING_MATERIAL_EVIDENCE_PACKAGE);few.replicateCounts.LONGITUDINAL=1;assert.equal(evaluatePlasticMaterialQualification({...base,materialEvidencePackage:few}).authority.plasticMaterialQualified,false);results.push({id:'BLOCK_INADEQUATE_REPLICATES',passed:true});
  const neck=clonePlain(PASSING_MATERIAL_EVIDENCE_PACKAGE);neck.postNeckingMethod='NOT_USED_BEYOND_UNIFORM_ELONGATION';assert.equal(evaluatePlasticMaterialQualification({...base,materialEvidencePackage:neck}).authority.plasticMaterialQualified,false);results.push({id:'BLOCK_UNTRACEABLE_POSTNECKING',passed:true});
  const tangent=clonePlain(base.benchmarkEvidence);tangent.find((entry)=>entry.id==='CONSISTENT_TANGENT').consistentTangentRelativeError=0.5;assert.equal(evaluatePlasticMaterialQualification({...base,benchmarkEvidence:tangent}).authority.plasticMaterialQualified,false);results.push({id:'BLOCK_TANGENT_ERROR',passed:true});
  const dissipation=clonePlain(base.benchmarkEvidence);dissipation.find((entry)=>entry.id==='PLASTIC_DISSIPATION').minimumObservedPlasticDissipation=-1;assert.equal(evaluatePlasticMaterialQualification({...base,benchmarkEvidence:dissipation}).authority.plasticMaterialQualified,false);results.push({id:'BLOCK_NEGATIVE_DISSIPATION',passed:true});
  return results;
}
