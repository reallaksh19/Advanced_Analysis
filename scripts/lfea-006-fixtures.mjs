import { semanticHash } from '../src/core/shared-piping-model/canonical-json.js';
import { adaptMeshPackage } from '../src/core/element-fea/mesh-package-adapter.js';
import { solveContinuumModel } from '../src/core/element-fea/solver.js';
import { createStressProjection } from '../src/core/element-fea/stress-projection.js';
import { createConvergenceStudy } from '../src/core/element-fea/convergence-study.js';
import { interpretConvergenceStudy } from '../src/core/element-fea/interpretation-result.js';
import { createEngineeringReview } from '../src/core/element-fea/review-model.js';
import { createReviewInput } from '../src/core/element-fea/review-contract.js';
import {
  adapterProfile, allSidesPressurePackage, boundary, clone, constraint, element, fixed, loadCase,
  materialAssignment, mixedPackage, node, planeStrainPackage, point, pointForce, prescribedBoundaryPackage,
  rectangularQ4Package, region, sealPackage, sparseRoundTripPackage, t3PlatePackage, twoElementQ4Package,
} from './lfea-005-fixtures.mjs';
import { PROFILE as CONVERGENCE_PROFILE } from './lfea-003-fixtures.mjs';

export { clone };

export function reviewProfile(overrides={}) {
  return {
    schema:'lfea-review-profile/v1', profileIdentity:'lfea-006-review-profile-v1', deformationScale:10,
    coordinateDisplayPrecision:6, displacementDisplayPrecision:8, forceDisplayPrecision:8,
    stressDisplayPrecision:8, energyDisplayPrecision:10, includeProjectedStress:false,
    includeConvergenceEvidence:false, includeSourceArtifacts:false, maximumExportRows:100000,
    maximumExportBytes:20_000_000, ...overrides,
  };
}

export function q4ReviewFixture(options={}) { return fixtureFromPackage(rectangularQ4Package(options.packageOptions),options); }
export function t3ReviewFixture(options={}) { return fixtureFromPackage(t3PlatePackage(options.packageOptions),options); }
export function mixedReviewFixture(options={}) { return fixtureFromPackage(mixedPackage(options.packageOptions),options); }
export function sparseReviewFixture(options={}) { return fixtureFromPackage(sparseRoundTripPackage(),options); }
export function planeStrainReviewFixture(options={}) { return fixtureFromPackage(planeStrainPackage(),options); }
export function prescribedReviewFixture(options={}) { return fixtureFromPackage(prescribedBoundaryPackage(),options); }
export function tractionReviewFixture(options={}) { return fixtureFromPackage(twoElementQ4Package(),options); }
export function pressureReviewFixture(options={}) { return fixtureFromPackage(allSidesPressurePackage(),options); }

export function fixtureFromPackage(packageValue,options={}) {
  const adapterResult=adaptMeshPackage(packageValue,adapterProfile());
  if(adapterResult.status!=='ACCEPTED')throw new Error(JSON.stringify(adapterResult.diagnostics));
  const model=adapterResult.qualifiedModel;const result=solveContinuumModel(model);
  if(result.status!=='QUALIFIED')throw new Error(JSON.stringify(result.diagnostics));
  const stressProjection=options.projection?projectionFor(model,result):null;
  return buildFixture({adapterResult,model,result,stressProjection,convergenceStudy:null,convergenceResult:null,identity:options.identity||`${model.modelIdentity}:REVIEW`});
}

export function projectionReviewFixture(options={}) {
  return fixtureFromPackage(rectangularQ4Package(),{...options,projection:true,identity:'PROJECTION-REVIEW'});
}

export function convergenceReviewFixture(options={}) {
  const levels=[1,2,4].map((nx,index)=>convergenceLevel(nx,index+1));
  const physical='lfea-006-physical-problem:v1';
  const quantities=[
    {quantityId:'Q_ENERGY',quantityType:'STRAIN_ENERGY',sourceAuthority:'RAW_QUALIFIED_RESULT'},
    {quantityId:'Q_MAX_VM',quantityType:'MAX_RAW_STRESS',sourceAuthority:'RAW_QUALIFIED_RESULT',regionId:'DOMAIN',component:'VON_MISES',maximumPolicy:'MAXIMUM_SIGNED'},
  ];
  const raw={schema:'fea-convergence-study/v1',studyIdentity:'LFEA006-STUDY',studyVersion:'1',sourceSemanticHash:'lfea-006-study-source:v1',profile:clone(CONVERGENCE_PROFILE),canonicalProblem:{problemIdentity:'RECTANGULAR-POINT-LOAD',sourceSemanticHash:physical,formulation:'PLANE_STRESS',units:{length:'mm',force:'N',stress:'N/mm2'},loadCaseIdentity:'LC1',appliedLoadTotals:{...levels[0].result.appliedLoadTotals},outOfPlane:{mode:'THICKNESS',value:1},geometryEntities:[{entityId:'GEOM_DOMAIN',sourceSemanticHash:physical,signature:'RECTANGLE_2X1_V1'}],materialEntities:[{entityId:'MAT_DOMAIN',sourceSemanticHash:physical,E:100,nu:.25}],loadEntities:[{entityId:'LOAD_POINT',sourceSemanticHash:physical,signature:'POINT_FORCE_AT_2_1_V1'}],restraintEntities:[{entityId:'BC_LEFT',sourceSemanticHash:physical,signature:'LEFT_EDGE_FIXED_V1'}],requestedQuantityIds:quantities.map((row)=>row.quantityId).sort()},probes:[],quantities,levels:levels.map((row)=>row.level),singularFeatures:[{featureId:'SF_POINT_LOAD',featureType:'POINT_LOAD',sourceSemanticHash:physical}]};
  const convergenceStudy=createConvergenceStudy(raw);const convergenceResult=interpretConvergenceStudy(raw);
  const current=levels.at(-1);const fixture=buildFixture({adapterResult:current.adapterResult,model:current.model,result:current.result,stressProjection:options.projection?projectionFor(current.model,current.result):null,convergenceStudy,convergenceResult,identity:'CONVERGENCE-REVIEW'});
  return {...fixture,levels};
}

export function buildFixture({adapterResult,model,result,stressProjection=null,convergenceStudy=null,convergenceResult=null,identity='LFEA006-REVIEW'}) {
  const base={schema:'lfea-review-input/v1',reviewIdentity:identity,reviewVersion:'1',adapterResult,model,result,convergenceStudy,convergenceResult,stressProjection,sourceReferences:[{sourceReferenceId:'LFEA006-WORKPACK',sourceType:'WORK_PACK',sourceVersion:'1',sourceSemanticHash:model.sourceSemanticHash}]};
  const input=createReviewInput({...base,semanticHash:semanticHash(base)});
  return {adapterResult,model,result,stressProjection,convergenceStudy,convergenceResult,input};
}

export function createQualifiedReview(fixture,profile=reviewProfile()) { return createEngineeringReview(fixture.input,profile); }
export function resealInput(value){const row=clone(value);delete row.semanticHash;return createReviewInput({...row,semanticHash:semanticHash(row)});}
export function resealArtifact(value){const row=clone(value);delete row.semanticHash;return{...row,semanticHash:semanticHash(row)};}

function projectionFor(model,result){return createStressProjection({projectionIdentity:`${model.modelIdentity}:PROJECTION`,projectionVersion:'1',sourceSemanticHash:model.sourceSemanticHash,model,result,components:['SIGMA_Z','SX','SY','TXY'],declaredDiscontinuities:[]});}

function convergenceLevel(nx,declaredOrder){
  const packageValue=structuredQ4Package(nx);const adapterResult=adaptMeshPackage(packageValue,adapterProfile());const model=adapterResult.qualifiedModel;const result=solveContinuumModel(model);const physical='lfea-006-physical-problem:v1';
  const constraintIds=model.restraints.map((row)=>row.constraintId).sort();
  return{adapterResult,model,result,level:{levelId:`LEVEL_${declaredOrder}`,declaredOrder,sourceSemanticHash:model.sourceSemanticHash,modelIdentity:model.modelIdentity,modelSemanticHash:model.semanticHash,resultIdentity:`${model.modelIdentity}:RESULT`,resultSemanticHash:result.semanticHash,model,result,studyRegion:{regionId:'DOMAIN',elementIds:model.elements.map((row)=>row.elementId)},geometryMappings:[{entityId:'GEOM_DOMAIN',sourceSemanticHash:physical,signature:'RECTANGLE_2X1_V1',targetIds:model.elements.map((row)=>row.elementId)}],materialMappings:[{entityId:'MAT_DOMAIN',sourceSemanticHash:physical,targetIds:['MAT1']}],loadMappings:[{entityId:'LOAD_POINT',sourceSemanticHash:physical,signature:'POINT_FORCE_AT_2_1_V1',targetIds:['F1']}],restraintMappings:[{entityId:'BC_LEFT',sourceSemanticHash:physical,signature:'LEFT_EDGE_FIXED_V1',targetIds:constraintIds}],probeMappings:[],quantityMappings:[]}};
}

function structuredQ4Package(nx){
  const nodes=[];for(let j=0;j<=1;j+=1)for(let i=0;i<=nx;i+=1)nodes.push(node(`N${i}_${j}`,2*i/nx,j));
  const elements=[];for(let i=0;i<nx;i+=1)elements.push(element(`E${i}`,'Q4',[`N${i}_0`,`N${i+1}_0`,`N${i+1}_1`,`N${i}_1`]));
  return sealPackage({packageIdentity:`LFEA006-MESH-${nx}`,nodes,elements,regions:[region('R_ALL',elements.map((row)=>row.elementId))],boundaries:[boundary('B_LEFT',[{elementId:'E0',localEdgeId:'Q4_E4'}])],points:[point('P_LOAD',`N${nx}_1`)],materialAssignments:[materialAssignment('MA1','R_ALL','MAT1')],loadCase:loadCase('LC1',{pointForces:[pointForce('F1','P_LOAD',1,0)]}),constraints:[constraint('C_LEFT','BOUNDARY','B_LEFT',fixed(),fixed())]});
}

export function singularitySuspectedReviewFixture() {
  const fixture=convergenceReviewFixture();
  const convergenceResult=clone(fixture.convergenceResult);
  const quantity=convergenceResult.quantityResults.find((row)=>row.quantityId==='Q_MAX_VM');
  quantity.classification='NONCONVERGENT_RISING';
  quantity.stressTrend={...(quantity.stressTrend||{}),trend:'RISING_WITH_REFINEMENT',scalarTrend:'RISING_WITH_REFINEMENT',interpretation:'SINGULARITY_SUSPECTED',mathematicalProof:'NOT_CLAIMED'};
  delete convergenceResult.semanticHash;convergenceResult.semanticHash=semanticHash(convergenceResult);
  return buildFixture({adapterResult:fixture.adapterResult,model:fixture.model,result:fixture.result,convergenceStudy:fixture.convergenceStudy,convergenceResult,stressProjection:null,identity:'SINGULARITY-SUSPECTED-REVIEW'});
}
