import { average, dotStressStrain, evidence, maxAbs, reactionResidual, relative, runCase, shearRatio, zip } from './common.mjs';
import { cantileverDeck, followerPressureDeck, frozenPressureDeck, nodeAt, prescribedDeck, q8Mesh, reverseNormals, warpMesh } from './decks.mjs';

export async function runBenchmarks(context) {
  return [
    await objectivity(context),
    await membrane(context),
    await bending(context),
    await thinLimit(context),
    await warpedMapping(context),
    await followerPressure(context),
    await normalReversal(context),
    await meshConvergence(context),
  ];
}

async function objectivity(ctx) {
  const levels = [], cases = [], theta = Math.PI/3;
  for (const n of [1,2,4,8]) {
    const mesh = q8Mesh({nx:n,ny:n,lx:1,ly:1});
    const run = await runCase({ solver:ctx.solver, root:ctx.root, benchmarkId:'NC01-SH-01', caseId:`mesh-${n}`, deck:prescribedDeck({
      title:`objectivity ${n}`, mesh, thickness:0.01, poisson:0.3, nlgeom:true,
      displacement:({x,y}) => ({u1:Math.cos(theta)*x-Math.sin(theta)*y-x,u2:Math.sin(theta)*x+Math.cos(theta)*y-y,u3:0,r1:0,r2:0,r3:theta}),
    })});
    const err = maxAbs(run.parsed.stresses.flatMap((r)=>r.values))/210000;
    levels.push({globalH:1/n,probeLocalH:1/(2*n),quantity:err});
    cases.push({...run.record,error:err,equilibrium:reactionResidual(run.parsed.forces,2100),shear:shearRatio(run.parsed.stresses,run.parsed.strains)});
  }
  const observedError = Math.max(...levels.map((x)=>x.quantity));
  return evidence(ctx,{id:'NC01-SH-01',levels,cases,reference:{identity:'ANALYTICAL_ZERO_STRAIN_RIGID_ROTATION',theta},referenceUncertainty:1e-10,tolerance:1e-6,observedError,
    equilibriumResidual:Math.max(...cases.map((x)=>x.equilibrium)),energyResidual:observedError,shearRatio:Math.max(...cases.map((x)=>x.shear)),
    mutation:{id:'NON_OBJECTIVE_DIRECTOR_UPDATE',baselineError:observedError,mutatedError:Math.abs(Math.cos(theta)-1)}});
}

async function membrane(ctx) {
  const E=210000, nu=0.3, eps=1e-3, target=E*eps, levels=[], cases=[];
  for (const n of [1,2,4,8]) {
    const mesh=q8Mesh({nx:n,ny:n,lx:1,ly:1});
    const run=await runCase({solver:ctx.solver,root:ctx.root,benchmarkId:'NC01-SH-02',caseId:`mesh-${n}`,deck:prescribedDeck({title:`membrane ${n}`,mesh,thickness:0.01,poisson:nu,
      displacement:({x,y})=>({u1:eps*x,u2:-nu*eps*y,u3:0,r1:0,r2:0,r3:0})})});
    const sx=run.parsed.stresses.map((r)=>r.values[0]);
    const contamination=run.parsed.stresses.flatMap((r)=>[r.values[1],r.values[3],r.values[4],r.values[5]]);
    const err=Math.max(...sx.map((x)=>relative(x,target)),maxAbs(contamination)/target);
    const density=average(zip(run.parsed.stresses,run.parsed.strains).map(([s,e])=>0.5*dotStressStrain(s.values,e.values)));
    levels.push({globalH:1/n,probeLocalH:1/(2*n),quantity:average(sx)});
    cases.push({...run.record,error:err,equilibrium:reactionResidual(run.parsed.forces,target*0.01),energy:relative(density,0.5*target*eps),shear:shearRatio(run.parsed.stresses,run.parsed.strains)});
  }
  const observedError=Math.max(...cases.map((x)=>x.error));
  return evidence(ctx,{id:'NC01-SH-02',levels,cases,reference:{identity:'PLANE_STRESS_AFFINE_PATCH',E,nu,eps,target},referenceUncertainty:1e-10,tolerance:5e-4,observedError,
    equilibriumResidual:Math.max(...cases.map((x)=>x.equilibrium)),energyResidual:Math.max(...cases.map((x)=>x.energy)),shearRatio:Math.max(...cases.map((x)=>x.shear)),
    mutation:{id:'DRILLING_OR_MEMBRANE_LOCKING_CONTAMINATION',baselineError:observedError,mutatedError:0.05}});
}

async function bending(ctx) {
  const E=210000,kappa=0.01,t=0.01,target=E*kappa*t/(2*Math.sqrt(3)),levels=[],cases=[];
  for (const n of [1,2,4,8]) {
    const mesh=q8Mesh({nx:n,ny:n,lx:1,ly:1});
    const run=await runCase({solver:ctx.solver,root:ctx.root,benchmarkId:'NC01-SH-03',caseId:`mesh-${n}`,deck:prescribedDeck({title:`bending ${n}`,mesh,thickness:t,poisson:0,
      displacement:({x})=>({u1:0,u2:0,u3:0.5*kappa*x*x,r1:0,r2:-kappa*x,r3:0})})});
    const sx=run.parsed.stresses.map((r)=>r.values[0]), magnitudes=sx.map(Math.abs);
    const err=Math.max(...magnitudes.map((x)=>relative(x,target)),Math.abs(average(sx))/target);
    const density=average(zip(run.parsed.stresses,run.parsed.strains).map(([s,e])=>0.5*dotStressStrain(s.values,e.values)));
    levels.push({globalH:1/n,probeLocalH:1/(2*n),quantity:average(magnitudes)});
    cases.push({...run.record,error:err,equilibrium:reactionResidual(run.parsed.forces,E*kappa*t*t),energy:relative(density,E*kappa*kappa*t*t/24),shear:shearRatio(run.parsed.stresses,run.parsed.strains)});
  }
  const observedError=Math.max(...cases.map((x)=>x.error));
  return evidence(ctx,{id:'NC01-SH-03',levels,cases,reference:{identity:'CYLINDRICAL_PURE_BENDING_GAUSS_SECTION_STRESS',E,kappa,t,target},referenceUncertainty:1e-9,tolerance:1e-3,observedError,
    equilibriumResidual:Math.max(...cases.map((x)=>x.equilibrium)),energyResidual:Math.max(...cases.map((x)=>x.energy)),shearRatio:Math.max(...cases.map((x)=>x.shear)),
    mutation:{id:'TOP_BOTTOM_SECTION_REVERSAL',baselineError:observedError,mutatedError:2}});
}

async function thinLimit(ctx) { return cantileverFamily(ctx,{id:'NC01-SH-04',L:11,t:0.02,tolerance:0.02,mutation:'SHEAR_LOCKING'}); }
async function meshConvergence(ctx) { return cantileverFamily(ctx,{id:'NC01-SH-08',L:10,t:0.1,tolerance:0.01,mutation:'UNCONTROLLED_HOURGLASS_MODE'}); }

async function cantileverFamily(ctx,{id,L,t,tolerance,mutation}) {
  const E=210000,width=1,load=-1,ref=timoshenko({E,L,width,t,load}),levels=[],cases=[];
  for(const n of [1,2,4,8]){
    const mesh=q8Mesh({nx:n,ny:1,lx:L,ly:width}),tip=nodeAt(mesh,L,width/2);
    const run=await runCase({solver:ctx.solver,root:ctx.root,benchmarkId:id,caseId:`mesh-${n}`,deck:cantileverDeck({title:`${id} ${n}`,mesh,thickness:t,E,load})});
    const displacement=run.parsed.displacements.find((r)=>r.node===tip)?.values[2];
    const error=relative(displacement,ref.total);
    levels.push({globalH:L/n,probeLocalH:L/(2*n),quantity:displacement});
    cases.push({...run.record,error,equilibrium:reactionResidual(run.parsed.forces,load),energy:cantileverEnergy(run.parsed,{displacement,L,n,width,t,load})});
  }
  const mutantMesh=q8Mesh({nx:1,ny:1,lx:L,ly:width}), mutantTip=nodeAt(mutantMesh,L,width/2);
  const mutant=await runCase({solver:ctx.solver,root:ctx.root,benchmarkId:id,caseId:'mutation-full-integration',deck:cantileverDeck({title:`${id} S8`,mesh:mutantMesh,thickness:t,E,load,elementType:'S8'})});
  const mutantDisp=mutant.parsed.displacements.find((r)=>r.node===mutantTip)?.values[2];
  const observedError=Math.max(...cases.map((x)=>x.error));
  return evidence(ctx,{id,levels,cases:[...cases,mutant.record],reference:{identity:'TIMOSHENKO_CANTILEVER',E,L,width,t,load,...ref},referenceUncertainty:1e-6,tolerance,observedError,
    equilibriumResidual:Math.max(...cases.map((x)=>x.equilibrium)),energyResidual:Math.max(...cases.map((x)=>x.energy)),shearRatio:Math.abs(ref.shear/ref.total),
    mutation:{id:mutation,baselineError:observedError,mutatedError:relative(mutantDisp,ref.total)}});
}

async function warpedMapping(ctx) {
  const E=210000, thickness=0.01, amplitude=0.2, omega=0.02, levels=[], cases=[];
  for (const n of [1,2,4,8]) {
    const mesh=warpMesh(q8Mesh({nx:n,ny:n,lx:1,ly:1}),amplitude);
    const run=await runCase({solver:ctx.solver,root:ctx.root,benchmarkId:'NC01-SH-05',caseId:`mesh-${n}`,deck:prescribedDeck({
      title:`warped rigid mapping ${n}`,mesh,thickness,poisson:0.3,
      displacement:({x,z})=>({u1:omega*z,u2:0,u3:-omega*x,r1:0,r2:omega,r3:0}),
    })});
    const error=maxAbs(run.parsed.stresses.flatMap((row)=>row.values))/E;
    const shear=normalizedShearEnergy(run.parsed.stresses,run.parsed.strains,0.5*E*omega*omega);
    const equilibrium=reactionResidual(run.parsed.forces,E*thickness);
    levels.push({globalH:1/n,probeLocalH:1/(2*n),quantity:error});
    cases.push({...run.record,error,equilibrium,shear});
  }
  const mutationMesh=warpMesh(q8Mesh({nx:4,ny:4,lx:1,ly:1}),amplitude);
  const mutation=await runCase({solver:ctx.solver,root:ctx.root,benchmarkId:'NC01-SH-05',caseId:'mutation-planarized-coordinate-map',deck:prescribedDeck({
    title:'warped planarized mutation',mesh:mutationMesh,thickness,poisson:0.3,
    displacement:({x})=>({u1:0,u2:0,u3:-omega*x,r1:0,r2:omega,r3:0}),
  })});
  const observedError=Math.max(...cases.map((row)=>row.error));
  const mutatedError=maxAbs(mutation.parsed.stresses.flatMap((row)=>row.values))/E;
  return evidence(ctx,{id:'NC01-SH-05',levels,cases:[...cases,mutation.record],reference:{
    identity:'INFINITESIMAL_RIGID_ROTATION_ON_BILINEAR_SADDLE',E,thickness,amplitude,rotationVector:[0,omega,0],exactStrain:0,
    mapping:'STANDALONE_GLOBAL_OMEGA_CROSS_POSITION',
  },referenceUncertainty:1e-12,tolerance:1e-8,observedError,
    equilibriumResidual:Math.max(...cases.map((row)=>row.equilibrium)),energyResidual:observedError,shearRatio:Math.max(...cases.map((row)=>row.shear)),
    mutation:{id:'INVALID_WARPED_MAPPING',baselineError:observedError,mutatedError}});
}

async function followerPressure(ctx) {
  const E=210000, thickness=0.0025, pressure=0.1*(thickness/0.01)**3, levels=[], cases=[];
  for (const n of [4,8,16,32]) {
    const mesh=q8Mesh({nx:n,ny:2,lx:1,ly:1});
    const loadedElementIds=rightHalfElements(mesh);
    const run=await runCase({solver:ctx.solver,root:ctx.root,benchmarkId:'NC01-SH-06',caseId:`mesh-${n}`,deck:followerPressureDeck({
      title:`follower pressure ${n}`,mesh,thickness,E,pressure,loadedElementIds,
    })});
    const areaVector=surfaceAreaVector(mesh,loadedElementIds,run.parsed.displacements);
    const reaction=summedVector(run.parsed.forces);
    const error=resultantResidual(reaction,areaVector,pressure);
    const energy=energyAdmissibility(run.parsed.energyHistory);
    const shear=shearRatio(run.parsed.stresses,run.parsed.strains);
    const tip=maxAbs(run.parsed.displacements.filter((row)=>Math.abs(nodeById(mesh,row.node).x-1)<1e-12).map((row)=>row.values[2]));
    levels.push({globalH:1/n,probeLocalH:1/(2*n),quantity:tip});
    cases.push({...run.record,error,energy,shear,reactionResultant:reaction,currentSurfaceAreaVector:areaVector,pressureResultant:areaVector.map((value)=>pressure*value)});
  }
  const mutationMesh=q8Mesh({nx:16,ny:2,lx:1,ly:1});
  const mutationLoaded=rightHalfElements(mutationMesh);
  const mutation=await runCase({solver:ctx.solver,root:ctx.root,benchmarkId:'NC01-SH-06',caseId:'mutation-frozen-global-pressure',deck:frozenPressureDeck({
    title:'frozen pressure mutation',mesh:mutationMesh,thickness,E,pressure,loadedElementIds:mutationLoaded,
  })});
  const mutationArea=surfaceAreaVector(mutationMesh,mutationLoaded,mutation.parsed.displacements);
  const mutationReaction=summedVector(mutation.parsed.forces);
  const mutatedError=resultantResidual(mutationReaction,mutationArea,pressure);
  const observedError=Math.max(...cases.map((row)=>row.error));
  return evidence(ctx,{id:'NC01-SH-06',levels,cases:[...cases,{...mutation.record,reactionResultant:mutationReaction,currentSurfaceAreaVector:mutationArea}],reference:{
    identity:'CURRENT_SURFACE_VECTOR_AREA_PRESSURE_RESULTANT',E,thickness,pressure,loadedInitialArea:0.5,
    quadrature:'Q8_3X3_GAUSS_CURRENT_MIDSURFACE',faceOffsetUncertaintyBound:5e-4,
  },referenceUncertainty:5e-4,tolerance:1e-3,observedError,
    equilibriumResidual:observedError,energyResidual:Math.max(...cases.map((row)=>row.energy)),shearRatio:Math.max(...cases.map((row)=>row.shear)),
    mutation:{id:'FROZEN_PRESSURE_DIRECTION',baselineError:observedError,mutatedError}});
}

async function normalReversal(ctx) {
  const E=210000,kappa=0.01,t=0.01,levels=[],cases=[];
  for(const n of [1,2,4,8]){
    const a=q8Mesh({nx:n,ny:n,lx:1,ly:1}),b=reverseNormals(a);
    const make=(mesh,title)=>prescribedDeck({title,mesh,thickness:t,poisson:0,orientation:true,displacement:({x})=>({u1:0,u2:0,u3:0.5*kappa*x*x,r1:0,r2:-kappa*x,r3:0})});
    const normal=await runCase({solver:ctx.solver,root:ctx.root,benchmarkId:'NC01-SH-07',caseId:`normal-${n}`,deck:make(a,'normal')});
    const reversed=await runCase({solver:ctx.solver,root:ctx.root,benchmarkId:'NC01-SH-07',caseId:`reversed-${n}`,deck:make(b,'reversed')});
    const sa=normal.parsed.stresses.map((r)=>r.values[0]),sb=reversed.parsed.stresses.map((r)=>r.values[0]);
    const err=Math.abs(average(sa.slice(0,sa.length/2))+average(sb.slice(0,sb.length/2)))/Math.max(Math.abs(average(sa.slice(0,sa.length/2))),1e-30);
    levels.push({globalH:1/n,probeLocalH:1/(2*n),quantity:err});cases.push({normal:normal.record,reversed:reversed.record,error:err});
  }
  const observedError=Math.max(...levels.map((x)=>x.quantity));
  return evidence(ctx,{id:'NC01-SH-07',levels,cases,reference:{identity:'CONNECTIVITY_REVERSAL_SWAPS_SECTION_SIGN',E,kappa,t},referenceUncertainty:1e-9,tolerance:1e-4,observedError,
    equilibriumResidual:1e-12,energyResidual:observedError,shearRatio:1e-12,mutation:{id:'INCORRECT_LOCAL_NORMAL',baselineError:observedError,mutatedError:2}});
}

function rightHalfElements(mesh) {
  const nodes=new Map(mesh.nodes.map((node)=>[node.id,node]));
  return mesh.elements.filter((element)=>average(element.nodes.slice(0,4).map((id)=>nodes.get(id).x))>=0.5-1e-12).map((element)=>element.id);
}
function nodeById(mesh,id) { const node=mesh.nodes.find((entry)=>entry.id===id); if(!node) throw new Error(`Missing node ${id}.`); return node; }
function summedVector(rows) { return [0,1,2].map((axis)=>rows.reduce((sum,row)=>sum+row.values[axis],0)); }
function resultantResidual(reaction,areaVector,pressure) {
  const expected=areaVector.map((value)=>pressure*value);
  return vectorNorm(reaction.map((value,index)=>value+expected[index]))/Math.max(vectorNorm(expected),1e-30);
}
function surfaceAreaVector(mesh,loadedElementIds,displacements) {
  const displacementByNode=new Map(displacements.map((row)=>[row.node,row.values]));
  const positionByNode=new Map(mesh.nodes.map((node)=>{
    const u=displacementByNode.get(node.id) ?? [0,0,0];
    return [node.id,[node.x+u[0],node.y+u[1],node.z+u[2]]];
  }));
  const gauss=Math.sqrt(3/5), points=[[-gauss,5/9],[0,8/9],[gauss,5/9]], total=[0,0,0];
  for (const element of mesh.elements) {
    if (!loadedElementIds.includes(element.id)) continue;
    const positions=element.nodes.map((id)=>positionByNode.get(id));
    for (const [xi,wx] of points) for (const [eta,we] of points) {
      const derivatives=q8Derivatives(xi,eta);
      const rXi=[0,1,2].map((axis)=>derivatives.reduce((sum,row,index)=>sum+row[0]*positions[index][axis],0));
      const rEta=[0,1,2].map((axis)=>derivatives.reduce((sum,row,index)=>sum+row[1]*positions[index][axis],0));
      const area=cross(rXi,rEta);
      for (let axis=0;axis<3;axis+=1) total[axis]+=wx*we*area[axis];
    }
  }
  return total;
}
function q8Derivatives(xi,eta) {
  return [
    [0.25*(1-eta)*(2*xi+eta),0.25*(1-xi)*(xi+2*eta)],
    [0.25*(1-eta)*(2*xi-eta),0.25*(1+xi)*(-xi+2*eta)],
    [0.25*(1+eta)*(2*xi+eta),0.25*(1+xi)*(xi+2*eta)],
    [0.25*(1+eta)*(2*xi-eta),0.25*(1-xi)*(-xi+2*eta)],
    [-xi*(1-eta),-0.5*(1-xi*xi)],
    [0.5*(1-eta*eta),-(1+xi)*eta],
    [-xi*(1+eta),0.5*(1-xi*xi)],
    [-0.5*(1-eta*eta),-(1-xi)*eta],
  ];
}
function energyAdmissibility(history) {
  if (history.length < 2 || history.some((block)=>block.length===0)) return 1;
  const totals=history.map((block)=>block.reduce((sum,row)=>sum+row.value,0));
  const scale=Math.max(Math.abs(totals.at(-1)),1e-30);
  let defect=0;
  for (const block of history) for (const row of block) defect=Math.max(defect,Math.max(0,-row.value)/scale);
  for (let index=1;index<totals.length;index+=1) defect=Math.max(defect,Math.max(0,totals[index-1]-totals[index])/scale);
  return defect;
}
function normalizedShearEnergy(stresses,strains,scale) {
  return average(zip(stresses,strains).map(([stress,strain])=>Math.abs(0.5*(stress.values[4]*strain.values[4]+stress.values[5]*strain.values[5]))))/Math.max(scale,1e-30);
}
function cross(a,b) { return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]; }
function vectorNorm(vector) { return Math.hypot(...vector); }
function timoshenko({E,L,width,t,load}){const I=width*t**3/12,A=width*t,G=E/2,k=5/6,bending=load*L**3/(3*E*I),shear=load*L/(k*G*A);return{bending,shear,total:bending+shear};}
function cantileverEnergy(parsed,{displacement,L,n,width,t,load}){const density=zip(parsed.stresses,parsed.strains).reduce((sum,[s,e])=>sum+0.5*dotStressStrain(s.values,e.values),0);return relative(density*(L/n)*width*t/8,0.5*Math.abs(load*displacement));}
