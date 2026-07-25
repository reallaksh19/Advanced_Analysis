import { semanticHash } from '../src/core/shared-piping-model/canonical-json.js';
const G = 1 / Math.sqrt(3);
export const PROFILE = Object.freeze({ coordinateResidualAbsolute: 1e-10, scalarAbsolute: 1e-12, relativeScaleFloor: 1e-12, constantRatioRelative: 1e-10, comparabilityAbsolute: 1e-10 });
export function clone(value) { return structuredClone(value); }

export function convergenceStudy(options = {}) {
  const ns = options.ns || [1,2,4,8];
  const coefficients = options.coefficients || [0.8,0.95,0.9875,0.996875];
  const peaks = options.peaks || [120,180,260,380];
  const energies = options.energies || [1.0,1.2,1.25,1.2625];
  const quantities = standardQuantities();
  const levels = ns.map((n,index) => levelFixture(n,index+1,coefficients[index],peaks[index],energies[index]));
  return studyBase(levels, quantities, options.singularFeatures || [{ featureId:'SF1', featureType:'RE_ENTRANT_CORNER', sourceSemanticHash:'physical-problem:v1' }]);
}

export function invariantStudy() { return convergenceStudy({ coefficients:[1,1,1,1], peaks:[5,5,5,5], energies:[2,2,2,2], singularFeatures:[] }); }

export function levelFixture(n, declaredOrder, coefficient, peak, energy) {
  const sourceSemanticHash = `mesh-source:${n}`;
  const model = gridModel(n, coefficient, sourceSemanticHash);
  const result = qualifiedResult(model, coefficient, peak, energy);
  const probe = { x:0.3, y:0.3 };
  return {
    levelId:`LEVEL_${declaredOrder}`,
    modelIdentity:model.modelIdentity, modelSemanticHash:model.semanticHash, resultIdentity:`RESULT-${n}`, resultSemanticHash:result.semanticHash,
    declaredOrder,
    sourceSemanticHash,
    model,
    result,
    studyRegion:{ regionId:'DOMAIN', elementIds:model.elements.map((row)=>row.elementId) },
    geometryMappings:[{ entityId:'GEOM_DOMAIN', sourceSemanticHash:'physical-problem:v1', signature:'UNIT_SQUARE_V1', targetIds:model.elements.map((row)=>row.elementId) }],
    materialMappings:[{ entityId:'MAT_DOMAIN', sourceSemanticHash:'physical-problem:v1', targetIds:['MAT1'] }],
    loadMappings:[{ entityId:'LOAD_ZERO', sourceSemanticHash:'physical-problem:v1', signature:'ZERO_NODAL_FORCE_V1', targetIds:['F1'] }],
    restraintMappings:[{ entityId:'BC_ORIGIN', sourceSemanticHash:'physical-problem:v1', signature:'ORIGIN_UX_UY_V1', targetIds:['R1','R2'] }],
    probeMappings:[probeMapping(n, probe)],
    quantityMappings:[{ quantityId:'Q_FUNC', terms:[{ nodeId:`N${n}-${n}`, component:'UX', coefficient:1 }] }],
  };
}

function studyBase(levels, quantities, singularFeatures) {
  return {
    schema:'fea-convergence-study/v1', studyIdentity:'STUDY-1', studyVersion:'1', sourceSemanticHash:'study-source:v1', profile:clone(PROFILE),
    canonicalProblem:{ problemIdentity:'UNIT-SQUARE-LINEAR', sourceSemanticHash:'physical-problem:v1', formulation:'PLANE_STRESS', units:{length:'mm',force:'N',stress:'N/mm2'}, loadCaseIdentity:'LC1', appliedLoadTotals:{fx:0,fy:0,mz:0}, outOfPlane:{mode:'THICKNESS',value:1}, geometryEntities:[{entityId:'GEOM_DOMAIN',sourceSemanticHash:'physical-problem:v1',signature:'UNIT_SQUARE_V1'}], materialEntities:[{entityId:'MAT_DOMAIN',sourceSemanticHash:'physical-problem:v1',E:100,nu:0.25}], loadEntities:[{entityId:'LOAD_ZERO',sourceSemanticHash:'physical-problem:v1',signature:'ZERO_NODAL_FORCE_V1'}], restraintEntities:[{entityId:'BC_ORIGIN',sourceSemanticHash:'physical-problem:v1',signature:'ORIGIN_UX_UY_V1'}], requestedQuantityIds:quantities.map((row)=>row.quantityId).sort() },
    probes:[{probeId:'P1',physicalCoordinates:{x:0.3,y:0.3}}], quantities, levels, singularFeatures,
  };
}

function standardQuantities() {
  return [
    {quantityId:'Q_ENERGY',quantityType:'STRAIN_ENERGY',sourceAuthority:'RAW_QUALIFIED_RESULT'},
    {quantityId:'Q_FUNC',quantityType:'DISPLACEMENT_FUNCTIONAL',sourceAuthority:'RAW_QUALIFIED_RESULT'},
    {quantityId:'Q_MAX_SX',quantityType:'MAX_RAW_STRESS',sourceAuthority:'RAW_QUALIFIED_RESULT',regionId:'DOMAIN',component:'SX',maximumPolicy:'MAXIMUM_SIGNED'},
    {quantityId:'Q_REACTION_X',quantityType:'REACTION_RESULTANT',sourceAuthority:'RAW_QUALIFIED_RESULT',restraintEntityIds:['BC_ORIGIN'],component:'FX',referencePoint:{x:0,y:0}},
    {quantityId:'Q_SX',quantityType:'POINT',sourceAuthority:'RAW_QUALIFIED_RESULT',probeId:'P1',component:'SX'},
    {quantityId:'Q_UX',quantityType:'POINT',sourceAuthority:'RAW_QUALIFIED_RESULT',probeId:'P1',component:'UX'},
  ];
}

export function gridModel(n, coefficient, sourceSemanticHash=`mesh-source:${n}`) {
  const nodes=[]; for(let j=0;j<=n;j+=1)for(let i=0;i<=n;i+=1)nodes.push({nodeId:`N${i}-${j}`,x:i/n,y:j/n,sourceSemanticHash});
  const elements=[]; for(let j=0;j<n;j+=1)for(let i=0;i<n;i+=1)elements.push({elementId:`E${i}-${j}`,type:'Q4',nodeIds:[`N${i}-${j}`,`N${i+1}-${j}`,`N${i+1}-${j+1}`,`N${i}-${j+1}`],materialId:'MAT1',thickness:1,sourceSemanticHash});
  const profile={profileIdentity:'P',formulation:'PLANE_STRESS',units:{length:'mm',force:'N',stress:'N/mm2'},outOfPlaneScale:1};
  const base={schema:'fea-continuum-model/v1',modelIdentity:`MODEL-${n}`,modelVersion:'1',sourceSemanticHash,solverProfileIdentity:'P',solverProfile:profile,nodes,elements,materials:[{materialId:'MAT1',E:100,nu:.25,sourceSemanticHash}],restraints:[{constraintId:'R1',nodeId:'N0-0',component:'UX',value:0,sourceSemanticHash},{constraintId:'R2',nodeId:'N0-0',component:'UY',value:0,sourceSemanticHash}],prescribedDisplacements:[],loadCases:[{loadCaseId:'LC1',sourceSemanticHash,nodalForces:[{loadId:'F1',nodeId:`N${n}-${n}`,fx:0,fy:0,sourceSemanticHash}],edgeLoads:[]}],sourceReferences:[{sourceReferenceId:'SRC',sourceType:'FIXTURE',sourceVersion:'1',sourceSemanticHash}],limitations:['Fixture'],coefficient};
  return {...base,semanticHash:semanticHash(base)};
}

export function qualifiedResult(model, coefficient, peak, energy) {
  const nodalDisplacements=model.nodes.flatMap((node,index)=>[{equation:2*index,equationIdentity:`${node.nodeId}:UX`,nodeId:node.nodeId,component:'UX',value:coefficient*node.x},{equation:2*index+1,equationIdentity:`${node.nodeId}:UY`,nodeId:node.nodeId,component:'UY',value:0}]);
  const integrationPointResults=model.elements.flatMap((element)=>q4RawRows(model,element,coefficient,peak));
  const base={schema:'fea-continuum-result/v2',status:'QUALIFIED',qualifiedResults:'complete',modelIdentity:model.modelIdentity,modelVersion:model.modelVersion,sourceSemanticHash:model.sourceSemanticHash,modelSemanticHash:model.semanticHash,modelEvidence:model,solverProfile:model.solverProfile,loadCaseIdentity:'LC1',nodalDisplacements,reactions:[{equation:0,equationIdentity:'N0-0:UX',nodeId:'N0-0',component:'UX',value:-coefficient},{equation:1,equationIdentity:'N0-0:UY',nodeId:'N0-0',component:'UY',value:0}],constraintPartition:{constrainedEquations:[{equation:0,constraintId:'R1'},{equation:1,constraintId:'R2'}]},appliedLoadTotals:{fx:0,fy:0,mz:0},strainEnergy:energy,integrationPointResults,limitations:[],diagnostics:[]};
  return {...base,semanticHash:semanticHash(base)};
}

function q4RawRows(model, element, coefficient, peak) {
  const [i,j]=element.elementId.slice(1).split('-').map(Number); const n=Math.round(1/(model.nodes.find((row)=>row.nodeId==='N1-0').x));
  return [[-G,-G,'GP1'],[G,-G,'GP2'],[G,G,'GP3'],[-G,G,'GP4']].map(([xi,eta,id],index)=>{const x=(i+.5*(xi+1))/n,y=(j+.5*(eta+1))/n;const sx=element.elementId===model.elements.at(-1).elementId&&index===2?peak:106.66666666666667*coefficient;const sy=26.666666666666668*coefficient;return {elementId:element.elementId,elementType:'Q4',integrationPointId:id,naturalCoordinates:{xi,eta},globalCoordinates:{x,y},strain:[coefficient,0,0],stress:[sx,sy,0],sigmaZ:0,principalStresses:[Math.max(sx,sy),Math.min(sx,sy)],inPlanePrincipalStresses:[Math.max(sx,sy),Math.min(sx,sy)],principalOrientationRadians:0,principalOrientationDefined:true,vonMisesStress:Math.sqrt(sx*sx-sx*sy+sy*sy),recoveryLocation:'Q4_GAUSS_POINT_RAW',strainEnergyContribution:0};});
}

function probeMapping(n, point) { const i=Math.min(n-1,Math.floor(point.x*n)),j=Math.min(n-1,Math.floor(point.y*n));const x0=i/n,y0=j/n;return {probeId:'P1',elementId:`E${i}-${j}`,elementType:'Q4',naturalCoordinates:{xi:2*(point.x-x0)*n-1,eta:2*(point.y-y0)*n-1},reconstructedCoordinates:{...point},reconstructionResidual:0}; }

export function projectionFixture(options={}) {
  const source='projection-source:v1'; const model=twoElementProjectionModel(source,options);
  const result=projectionResult(model,options); return {projectionIdentity:'PROJ-1',projectionVersion:'1',sourceSemanticHash:source,model,result,components:options.components||['SX'],declaredDiscontinuities:options.declaredDiscontinuities||[]};
}
function twoElementProjectionModel(source,options) {
  const nodes=[{nodeId:'N1',x:0,y:0},{nodeId:'N2',x:1,y:0},{nodeId:'N3',x:1,y:1},{nodeId:'N4',x:0,y:1},{nodeId:'N5',x:2,y:0},{nodeId:'N6',x:2,y:1}].map((row)=>({...row,sourceSemanticHash:source}));
  const mats=[{materialId:'M1',E:100,nu:.25,sourceSemanticHash:source},{materialId:'M2',E:options.materialBoundary?200:100,nu:.25,sourceSemanticHash:source}];
  const elements=[{elementId:'E1',type:'Q4',nodeIds:['N1','N2','N3','N4'],materialId:'M1',thickness:1,sourceSemanticHash:source},{elementId:'E2',type:'Q4',nodeIds:['N2','N5','N6','N3'],materialId:options.materialBoundary?'M2':'M1',thickness:options.thicknessBoundary?2:1,sourceSemanticHash:source}];
  const base={schema:'fea-continuum-model/v1',modelIdentity:'PROJ-MODEL',modelVersion:'1',sourceSemanticHash:source,solverProfileIdentity:'P',solverProfile:{profileIdentity:'P',formulation:'PLANE_STRESS',units:{length:'mm',force:'N',stress:'N/mm2'},outOfPlaneScale:1},nodes,elements,materials:mats,restraints:[],prescribedDisplacements:[],loadCases:[],sourceReferences:[],limitations:[]}; return {...base,semanticHash:semanticHash(base)};
}
function projectionResult(model,options) { const values=options.values||{E1:[10,10,10,10],E2:[30,30,30,30]};const rows=model.elements.flatMap((element)=>['GP1','GP2','GP3','GP4'].map((id,index)=>({elementId:element.elementId,elementType:'Q4',integrationPointId:id,naturalCoordinates:{xi:[-G,G,G,-G][index],eta:[-G,-G,G,G][index]},globalCoordinates:{x:0,y:0},stress:[values[element.elementId][index],0,0],sigmaZ:0})));const base={schema:'fea-continuum-result/v2',status:'QUALIFIED',qualifiedResults:'complete',modelIdentity:model.modelIdentity,modelVersion:model.modelVersion,sourceSemanticHash:model.sourceSemanticHash,modelSemanticHash:model.semanticHash,modelEvidence:model,semanticPlaceholder:true,integrationPointResults:rows};delete base.semanticPlaceholder;return {...base,semanticHash:semanticHash(base)}; }

export function t3ProbeFixture() {
  const source='t3-probe-source:v1';
  const nodes=[{nodeId:'A',x:0,y:0},{nodeId:'B',x:1,y:0},{nodeId:'C',x:0,y:1}].map((row)=>({...row,sourceSemanticHash:source}));
  const element={elementId:'T1',type:'T3',nodeIds:['A','B','C'],materialId:'MAT1',thickness:1,sourceSemanticHash:source,signedArea:.5};
  const profile={profileIdentity:'P',formulation:'PLANE_STRESS',units:{length:'mm',force:'N',stress:'N/mm2'},outOfPlaneScale:1};
  const base={schema:'fea-continuum-model/v1',modelIdentity:'T3-PROBE',modelVersion:'1',sourceSemanticHash:source,solverProfileIdentity:'P',solverProfile:profile,nodes,elements:[element],materials:[{materialId:'MAT1',E:100,nu:.25,sourceSemanticHash:source}],restraints:[],prescribedDisplacements:[],loadCases:[],sourceReferences:[],limitations:[]};
  const model={...base,semanticHash:semanticHash(base)};
  const field=(x,y)=>[.01*x+.02*y,.03*x+.04*y];
  const nodalDisplacements=nodes.flatMap((node,index)=>{const [ux,uy]=field(node.x,node.y);return [{equation:2*index,equationIdentity:`${node.nodeId}:UX`,nodeId:node.nodeId,component:'UX',value:ux},{equation:2*index+1,equationIdentity:`${node.nodeId}:UY`,nodeId:node.nodeId,component:'UY',value:uy}];});
  const resultBase={schema:'fea-continuum-result/v1',status:'QUALIFIED',qualifiedResults:'complete',modelIdentity:model.modelIdentity,modelVersion:'1',sourceSemanticHash:source,modelSemanticHash:model.semanticHash,modelEvidence:model,nodalDisplacements};
  const result={...resultBase,semanticHash:semanticHash(resultBase)};
  const level={levelId:'L1',model,result}; const probe={probeId:'TP',physicalCoordinates:{x:.2,y:.3}};
  const mapping={probeId:'TP',elementId:'T1',elementType:'T3',areaCoordinates:[.5,.2,.3],reconstructedCoordinates:{x:.2,y:.3},reconstructionResidual:0};
  return {level,probe,mapping};
}

export function t3ProjectionFixture() {
  const {level}=t3ProbeFixture(); const model=level.model;
  const base={schema:'fea-continuum-result/v1',status:'QUALIFIED',qualifiedResults:'complete',modelIdentity:model.modelIdentity,modelVersion:model.modelVersion,sourceSemanticHash:model.sourceSemanticHash,modelSemanticHash:model.semanticHash,modelEvidence:model,elementStresses:[{elementId:'T1',values:[7,2,1],sigmaZ:0}]};
  const result={...base,semanticHash:semanticHash(base)};
  return {projectionIdentity:'T3-PROJ',projectionVersion:'1',sourceSemanticHash:model.sourceSemanticHash,model,result,components:['SX'],declaredDiscontinuities:[]};
}
