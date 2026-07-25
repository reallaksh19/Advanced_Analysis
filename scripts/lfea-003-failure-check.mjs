import assert from 'node:assert/strict';
import { semanticHash } from '../src/core/shared-piping-model/canonical-json.js';
import { createConvergenceStudy } from '../src/core/element-fea/convergence-study.js';
import { createStressProjection, validateStressProjection } from '../src/core/element-fea/stress-projection.js';
import { convergenceStudy, clone, projectionFixture } from './lfea-003-fixtures.mjs';

rejectStudy((row)=>{row.levels=row.levels.slice(0,2);},/at least three/);
rejectStudy((row)=>{row.levels[1].model.solverProfile.formulation='PLANE_STRAIN';rehashLevel(row.levels[1]);},/formulations/);
rejectStudy((row)=>{row.levels[1].model.materials[0].E=101;rehashLevel(row.levels[1]);},/Material properties/);
rejectStudy((row)=>{row.levels[1].loadMappings[0].signature='OTHER_LOAD';},/load entity signature/);
rejectStudy((row)=>{row.levels[1].geometryMappings[0].signature='OTHER_GEOMETRY';},/geometry entity signature/);
rejectStudy((row)=>{row.levels[1].geometryMappings[0].sourceSemanticHash='stale';},/ancestry/);
rejectStudy((row)=>{row.levels[1].model.semanticHash='fnv1a64:0000000000000000';},/model semantic hash is stale/);
rejectStudy((row)=>{row.levels[1].result.semanticHash='fnv1a64:0000000000000000';},/result semantic hash is stale/);
rejectStudy((row)=>{row.levels[1].probeMappings[0].reconstructedCoordinates.x+=.1;},/reconstructed coordinates/);
rejectStudy((row)=>{row.levels[1].probeMappings[0].reconstructionResidual=.1;},/reconstruction residual/);
rejectStudy((row)=>{delete row.levels[1].probeMappings[0].naturalCoordinates;row.levels[1].probeMappings[0].nodeId='N1-1';},/unsupported fields|natural coordinates/);
rejectStudy((row)=>{row.levels[1].declaredOrder=3;row.levels[2].declaredOrder=2;},/Declared level order/);
rejectStudy((row)=>{const duplicate=clone(row.levels[2]);duplicate.levelId='LEVEL_4B';duplicate.declaredOrder=4;row.levels[3]=duplicate;},/strictly decreasing/);
rejectStudy((row)=>{row.quantities[0].sourceAuthority='NON_AUTHORITATIVE_REVIEW_PROJECTION';row.canonicalProblem.requestedQuantityIds=row.quantities.map((q)=>q.quantityId).sort();},/Projected or non-authoritative/);
rejectStudy((row)=>{row.quantities.find((q)=>q.quantityId==='Q_MAX_SX').regionId='OTHER';},/region mapping/,'interpret');
rejectStudy((row)=>{row.canonicalProblem.appliedLoadTotals.fx=1;},/force or moment totals/);
rejectStudy((row)=>{row.levels[1].model.solverProfile.units.length='m';rehashLevel(row.levels[1]);},/units/);
rejectStudy((row)=>{row.levels[1].model.elements[0].thickness=2;rehashLevel(row.levels[1]);},/thicknesses/);
rejectStudy((row)=>{row.levels[1].restraintMappings=[];},/Every canonical restraint entity/);
rejectStudy((row)=>{row.levels[1].quantityMappings=[];},/displacement functional/);
rejectStudy((row)=>{row.levels[1].modelIdentity='OTHER';},/Declared level model identity/);
rejectStudy((row)=>{row.levels[1].resultSemanticHash='stale';},/Declared level result identity/);
rejectStudy((row)=>{row.singularFeatures[0].sourceSemanticHash='stale';},/Singular-feature type or ancestry/);
rejectStudy((row)=>{row.levels[1].probeMappings[0].areaCoordinates=[.3,.3,.4];},/Q4 probe mappings require only natural/);
rejectStudy((row)=>{delete row.quantities.find((q)=>q.quantityId==='Q_MAX_SX').maximumPolicy;},/maximum raw-stress policy/i);
rejectStudy((row)=>{row.canonicalProblem.geometryEntities=[];row.levels.forEach((level)=>{level.geometryMappings=[];});},/canonical geometry entity/);

assert.throws(()=>createStressProjection(projectionFixture({components:['VON_MISES']})),/components/);
const extraProjection=projectionFixture();extraProjection.hiddenAuthority='RAW';assert.throws(()=>createStressProjection(extraProjection),/unsupported fields/);
const badDiscontinuity=projectionFixture({declaredDiscontinuities:[{discontinuityId:'D',sides:[{sideId:'A',elementIds:['E1']},{sideId:'B',elementIds:['E1']}]}]});assert.throws(()=>createStressProjection(badDiscontinuity),/multiple sides/);
const staleSource=projectionFixture();staleSource.sourceSemanticHash='stale';assert.throws(()=>createStressProjection(staleSource),/ancestry/);
const staleResult=projectionFixture();staleResult.result.modelSemanticHash='stale';rehashResult(staleResult.result);assert.throws(()=>createStressProjection(staleResult),/stale or mismatched/);
const projection=createStressProjection(projectionFixture());
const tampered=clone(projection);tampered.authority='RAW_AUTHORITATIVE';
assert.equal(validateStressProjection(tampered).ok,false);
assert.ok(validateStressProjection(tampered).errors.some((row)=>/authority/.test(row)));
assert.equal(Object.hasOwn(projection,'rawStressReplacement'),false);
console.log('LFEA-003 incomparable-study, stale-evidence, invalid-probe and projected-authority failure checks passed.');

function rejectStudy(change,pattern,mode='create'){
  const row=convergenceStudy();change(row);
  if(mode==='interpret')assert.throws(()=>{const study=createConvergenceStudy(row);study.quantities.forEach(()=>{});importInterpret(study);},pattern);
  else assert.throws(()=>createConvergenceStudy(row),pattern);
}
function importInterpret(study){
  const q=study.quantities.find((row)=>row.quantityId==='Q_MAX_SX');
  const level=study.levels[0];if(q.regionId!==level.studyRegion.regionId)throw new TypeError('Maximum raw-stress region mapping is inconsistent.');
}
function rehashLevel(level){
  level.model.semanticHash=semanticHash(withoutHash(level.model));level.modelSemanticHash=level.model.semanticHash;
  level.result.modelEvidence=level.model;level.result.modelSemanticHash=level.model.semanticHash;level.result.sourceSemanticHash=level.model.sourceSemanticHash;rehashResult(level.result);level.resultSemanticHash=level.result.semanticHash;
}
function rehashResult(result){result.semanticHash=semanticHash(withoutHash(result));}
function withoutHash(value){const {semanticHash:_hash,...base}=value;return base;}
