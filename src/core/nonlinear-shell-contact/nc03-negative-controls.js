import assert from 'node:assert/strict';
import { clonePlain } from './contracts.js';
import { createElasticDentingProcedureContract, validateElasticDentingProcedureContract } from './elastic-denting-procedure-contract.js';
import { evaluateElasticDentingQualification } from './elastic-denting-qualification-evaluator.js';
import { PASSING_CONTACT_RECEIPT, PASSING_NC03_SOLVER_CUSTODY, createPassingDimensionlessCells, createPassingElasticDentingEvidence } from './nc03-fixtures.js';
export function runNc03NegativeControls() {
  const results=[]; const rejects=(id,mutate)=>{ const record=clonePlain(createElasticDentingProcedureContract()); mutate(record); delete record.elasticDentingProcedureHash; assert.throws(()=>validateElasticDentingProcedureContract(record)); results.push({id,passed:true}); };
  rejects('REJECT_2D_GEOMETRY_AUTHORITY',(r)=>{r.geometryAuthority='PLANE_STRAIN';});
  rejects('REJECT_PLASTIC_CONSTITUTIVE_AUTHORITY',(r)=>{r.constitutiveAuthority='J2_PLASTICITY';});
  rejects('REJECT_FORCE_CONTROL',(r)=>{r.loadControl='FORCE_CONTROLLED';});
  rejects('REJECT_LOAD_SEQUENCE_REORDER',(r)=>{[r.loadSequence[0],r.loadSequence[1]]=[r.loadSequence[1],r.loadSequence[0]];});
  rejects('REJECT_DEFORMED_BASELINE',(r)=>{r.baselineSurface='CURRENT_INDENTED_SURFACE';});
  rejects('REJECT_EXTRAPOLATION',(r)=>{r.qualificationCellPolicy='ALLOW_ENGINEERING_EXTRAPOLATION';});
  rejects('REJECT_DIAMETER_BOUNDARY_SCALE',(r)=>{r.boundaryScale='PIPE_DIAMETER_ONLY';});
  rejects('REJECT_NONCONVERGENT_BOUNDARY_LADDER',(r)=>{r.boundaryExtensionScales=[4,4,8];});
  rejects('REJECT_NONREFINING_MESH_LADDER',(r)=>{r.meshRefinementRatios=[1,1,0.5];});
  rejects('REJECT_LARGE_RECOVERY_LIMIT',(r)=>{r.elasticRecoveryResidualLimitRatio=0.2;});
  rejects('REJECT_MAX_PRESSURE_AUTHORITY',(r)=>{r.rawMaximumContactPressureAuthority='ENGINEERING';});
  rejects('REJECT_PLASTICITY',(r)=>{r.plasticityAuthorized=true;});
  rejects('REJECT_CODE_ASSESSMENT',(r)=>{r.codeAssessmentAuthorized=true;});
  const base={contract:createElasticDentingProcedureContract(),contactQualificationReceipt:PASSING_CONTACT_RECEIPT,solverCustody:PASSING_NC03_SOLVER_CUSTODY,dimensionlessCellRegistry:createPassingDimensionlessCells(),benchmarkEvidence:createPassingElasticDentingEvidence()};
  const cases=[
    ['BLOCK_UNQUALIFIED_CONTACT',{...base,contactQualificationReceipt:null}],
    ['BLOCK_MISSING_SOLVER_CUSTODY',{...base,solverCustody:{}}],
    ['BLOCK_EMPTY_CELL_REGISTRY',{...base,dimensionlessCellRegistry:[],benchmarkEvidence:[]}],
    ['BLOCK_MISSING_BENCHMARK',{...base,benchmarkEvidence:base.benchmarkEvidence.slice(1)}],
  ];
  for (const [id,input] of cases) { const report=evaluateElasticDentingQualification(input); assert.equal(report.authority.elasticDentingProcedureQualified,false); results.push({id,passed:true}); }
  const recovery=clonePlain(base.benchmarkEvidence); recovery[0].elasticRecoveryResidualRatio=0.5; assert.equal(evaluateElasticDentingQualification({...base,benchmarkEvidence:recovery}).authority.elasticDentingProcedureQualified,false); results.push({id:'BLOCK_NONELASTIC_RECOVERY',passed:true});
  const energy=clonePlain(base.benchmarkEvidence); energy[0].energyImbalance=0.5; assert.equal(evaluateElasticDentingQualification({...base,benchmarkEvidence:energy}).authority.elasticDentingProcedureQualified,false); results.push({id:'BLOCK_ENERGY_IMBALANCE',passed:true});
  const unknown=clonePlain(base.benchmarkEvidence); unknown.push({...unknown[0],cellId:'UNKNOWN'}); assert.equal(evaluateElasticDentingQualification({...base,benchmarkEvidence:unknown}).authority.elasticDentingProcedureQualified,false); results.push({id:'BLOCK_UNKNOWN_CELL',passed:true});
  return results;
}
