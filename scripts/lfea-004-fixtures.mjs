import { solveContinuumModel } from '../src/core/element-fea/index.js';
import {
  clone, loadCase, material, model, node, nodalForce, prescribed, prescribedField, profile, q4, restraint,
} from './lfea-002-fixtures.mjs';

export { clone };

export function sparseProfile(formulation = 'PLANE_STRESS', overrides = {}) {
  const legacy = profile(formulation); delete legacy.backendIdentity; delete legacy.referenceBackendMaxDofs;
  return {
    ...legacy,
    schema: 'lfea-profile/v2', profileIdentity: `lfea-004-sparse-${formulation.toLowerCase()}`, profileVersion: '2',
    linearBackend: 'SPARSE_PCG_V1', preconditioner: 'JACOBI_PRECONDITIONER_V1',
    absoluteResidualTolerance: 1e-10, relativeResidualTolerance: 1e-10, maximumIterations: 10000,
    maximumDofs: 10000, maximumNonzeros: 200000, maximumEstimatedStorageBytes: 64 * 1024 * 1024,
    limitations: ['Deterministic CSR/Jacobi-PCG qualification fixture only.', 'No unrestricted production-scale claim.'], ...overrides,
  };
}

export function withSparseProfile(input, overrides = {}) {
  const value = clone(input); const formulation = value.solverProfile.formulation;
  value.solverProfile = sparseProfile(formulation, overrides); value.solverProfileIdentity = value.solverProfile.profileIdentity;
  value.modelIdentity = `${value.modelIdentity}-SPARSE`; delete value.semanticHash; return value;
}

export function loadedT3(options = {}) {
  const formulation = options.formulation || 'PLANE_STRESS'; const thickness = formulation === 'PLANE_STRESS' ? 1 : undefined;
  const nodes = [node('N1',0,0),node('N2',2,0),node('N3',0,1)];
  return model({ modelIdentity:'LFEA004-T3', solverProfile:options.sparse === false ? profile(formulation) : sparseProfile(formulation), nodes,
    materials:[material('MAT1',100,0.25)], elements:[t3Fixture('E1',['N1','N2','N3'],'MAT1',thickness,nodes[0].sourceSemanticHash)],
    restraints:[restraint('R1','N1','UX'),restraint('R2','N1','UY'),restraint('R3','N2','UY')],
    loadCases:[loadCase('LC1',[nodalForce('F1','N2',1,0),nodalForce('F2','N3',0.25,-0.5)])] });
}

export function loadedQ4(options = {}) {
  const formulation = options.formulation || 'PLANE_STRESS'; const thickness = formulation === 'PLANE_STRESS' ? 1 : undefined;
  const nodes=[node('N1',0,0),node('N2',2,0),node('N3',2,1),node('N4',0,1)];
  return model({ modelIdentity:'LFEA004-Q4', solverProfile:options.sparse === false ? profile(formulation) : sparseProfile(formulation), nodes,
    materials:[material('MAT1',100,0.25)], elements:[q4('E1',['N1','N2','N3','N4'],'MAT1',thickness)],
    restraints:[restraint('R1','N1','UX'),restraint('R2','N1','UY'),restraint('R3','N4','UX')],
    loadCases:[loadCase('LC1',[nodalForce('F1','N2',0.5,0),nodalForce('F2','N3',0.5,0)])] });
}

export function loadedMixed(options = {}) {
  const formulation = options.formulation || 'PLANE_STRESS'; const thickness = formulation === 'PLANE_STRESS' ? 1 : undefined;
  const nodes=[node('N1',0,0),node('N2',1,0),node('N3',2,0),node('N4',0,1),node('N5',1,1),node('N6',2,1)];
  const solverProfile = options.sparse === false ? profile(formulation) : sparseProfile(formulation); const sourceHash = nodes[0].sourceSemanticHash;
  return model({ modelIdentity:'LFEA004-MIXED', solverProfile, nodes, materials:[material('MAT1',100,0.25)],
    elements:[q4('E1',['N1','N2','N5','N4'],'MAT1',thickness),t3Fixture('E2',['N2','N3','N6'],'MAT1',thickness,sourceHash),t3Fixture('E3',['N2','N6','N5'],'MAT1',thickness,sourceHash)],
    restraints:[restraint('R1','N1','UX'),restraint('R2','N1','UY'),restraint('R3','N4','UX')],
    loadCases:[loadCase('LC1',[nodalForce('F1','N3',0.5,0),nodalForce('F2','N6',0.5,0)])] });
}

export function prescribedQ4(options = {}) {
  const input = loadedQ4(options); input.loadCases=[loadCase('LC1')]; input.prescribedDisplacements=[prescribed('P1','N2','UX',0.02)]; return input;
}

export function constrainedLoadQ4() {
  const input=loadedQ4(); input.restraints=input.nodes.flatMap((row)=>[restraint(`R-${row.nodeId}-X`,row.nodeId,'UX'),restraint(`R-${row.nodeId}-Y`,row.nodeId,'UY')]);
  input.loadCases=[loadCase('LC1',[nodalForce('F1','N2',2,-1)])]; return input;
}

export function mediumQ4Model(nx = 60, ny = 50, overrides = {}) {
  const nodes=[]; for(let y=0;y<=ny;y+=1)for(let x=0;x<=nx;x+=1)nodes.push(node(nodeId(x,y),x,y));
  const elements=[]; for(let y=0;y<ny;y+=1)for(let x=0;x<nx;x+=1)elements.push(q4(elementId(x,y),[nodeId(x,y),nodeId(x+1,y),nodeId(x+1,y+1),nodeId(x,y+1)]));
  const restraints=[]; for(let y=0;y<=ny;y+=1){restraints.push(restraint(`RX-${pad(y)}`,nodeId(0,y),'UX'));restraints.push(restraint(`RY-${pad(y)}`,nodeId(0,y),'UY'));}
  const forces=[]; for(let y=0;y<=ny;y+=1)forces.push(nodalForce(`F-${pad(y)}`,nodeId(nx,y),1/(ny+1),0));
  const solverProfile=sparseProfile('PLANE_STRESS',{maximumDofs:7000,maximumNonzeros:190000,maximumIterations:15000,...overrides});
  return model({modelIdentity:`LFEA004-MEDIUM-${nx}X${ny}`,solverProfile,nodes,elements,materials:[material('MAT1',100,0.25)],restraints,loadCases:[loadCase('LC1',forces)]});
}

export function sparseConvergenceStudy() {
  const physicalHash='physical-problem:lfea004'; const ns=[1,2,4];
  const levels=ns.map((n,index)=>sparseStudyLevel(n,index+1,physicalHash));
  const quantities=[{quantityId:'Q_ENERGY',quantityType:'STRAIN_ENERGY',sourceAuthority:'RAW_QUALIFIED_RESULT'},{quantityId:'Q_UX',quantityType:'POINT',sourceAuthority:'RAW_QUALIFIED_RESULT',probeId:'P1',component:'UX'}];
  return {schema:'fea-convergence-study/v1',studyIdentity:'LFEA004-SPARSE-STUDY',studyVersion:'1',sourceSemanticHash:'study:lfea004',profile:{coordinateResidualAbsolute:1e-10,scalarAbsolute:1e-12,relativeScaleFloor:1e-12,constantRatioRelative:1e-10,comparabilityAbsolute:1e-10},canonicalProblem:{problemIdentity:'UNIT-SQUARE-LINEAR-SPARSE',sourceSemanticHash:physicalHash,formulation:'PLANE_STRESS',units:{length:'mm',force:'N',stress:'N/mm2'},loadCaseIdentity:'LC1',appliedLoadTotals:{fx:0,fy:0,mz:0},outOfPlane:{mode:'THICKNESS',value:1},geometryEntities:[{entityId:'GEOM',sourceSemanticHash:physicalHash,signature:'UNIT_SQUARE'}],materialEntities:[{entityId:'MAT',sourceSemanticHash:physicalHash,E:100,nu:.25}],loadEntities:[{entityId:'LOAD',sourceSemanticHash:physicalHash,signature:'ZERO_FORCE'}],restraintEntities:[{entityId:'BC',sourceSemanticHash:physicalHash,signature:'LINEAR_PRESCRIBED_FIELD'}],requestedQuantityIds:quantities.map((row)=>row.quantityId).sort()},probes:[{probeId:'P1',physicalCoordinates:{x:.3,y:.3}}],quantities,levels,singularFeatures:[]};
}
function sparseStudyLevel(n,declaredOrder,physicalHash){
  const nodes=[];for(let y=0;y<=n;y+=1)for(let x=0;x<=n;x+=1)nodes.push(node(`S${n}-N${x}-${y}`,x/n,y/n));
  const elements=[];for(let y=0;y<n;y+=1)for(let x=0;x<n;x+=1)elements.push(q4(`S${n}-E${x}-${y}`,[`S${n}-N${x}-${y}`,`S${n}-N${x+1}-${y}`,`S${n}-N${x+1}-${y+1}`,`S${n}-N${x}-${y+1}`]));
  const constraints=prescribedField(nodes,(x)=>[.01*x,0]); const zero=nodalForce(`S${n}-F0`,`S${n}-N${n}-${n}`,0,0);
  const raw=model({modelIdentity:`LFEA004-STUDY-${n}`,solverProfile:sparseProfile(),nodes,elements,materials:[material('MAT1',100,.25)],prescribedDisplacements:constraints,loadCases:[loadCase('LC1',[zero])]});
  const result=solveContinuumModel(raw); if(result.status!=='QUALIFIED')throw new TypeError(`Sparse convergence fixture failed: ${JSON.stringify(result.diagnostics)}`); const qualified=result.modelEvidence;
  const i=Math.min(n-1,Math.floor(.3*n)),j=Math.min(n-1,Math.floor(.3*n)); const x0=i/n,y0=j/n;
  return {levelId:`LEVEL_${declaredOrder}`,declaredOrder,sourceSemanticHash:qualified.sourceSemanticHash,modelIdentity:qualified.modelIdentity,modelSemanticHash:qualified.semanticHash,resultIdentity:`RESULT-${n}`,resultSemanticHash:result.semanticHash,model:qualified,result,studyRegion:{regionId:'DOMAIN',elementIds:qualified.elements.map((row)=>row.elementId)},geometryMappings:[{entityId:'GEOM',sourceSemanticHash:physicalHash,signature:'UNIT_SQUARE',targetIds:qualified.elements.map((row)=>row.elementId)}],materialMappings:[{entityId:'MAT',sourceSemanticHash:physicalHash,targetIds:['MAT1']}],loadMappings:[{entityId:'LOAD',sourceSemanticHash:physicalHash,signature:'ZERO_FORCE',targetIds:[zero.loadId]}],restraintMappings:[{entityId:'BC',sourceSemanticHash:physicalHash,signature:'LINEAR_PRESCRIBED_FIELD',targetIds:qualified.prescribedDisplacements.map((row)=>row.constraintId)}],probeMappings:[{probeId:'P1',elementId:`S${n}-E${i}-${j}`,elementType:'Q4',naturalCoordinates:{xi:2*(.3-x0)*n-1,eta:2*(.3-y0)*n-1},reconstructedCoordinates:{x:.3,y:.3},reconstructionResidual:0}],quantityMappings:[]};
}

function t3Fixture(elementIdValue,nodeIds,materialId,thickness,sourceSemanticHash){const row={elementId:elementIdValue,type:'T3',nodeIds,materialId,sourceSemanticHash};if(thickness!==undefined)row.thickness=thickness;return row;}
function nodeId(x,y){return `N${pad(x)}_${pad(y)}`;} function elementId(x,y){return `E${pad(x)}_${pad(y)}`;} function pad(value){return String(value).padStart(4,'0');}
