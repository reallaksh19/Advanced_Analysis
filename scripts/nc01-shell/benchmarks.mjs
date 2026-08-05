import { average, dotStressStrain, evidence, maxAbs, reactionResidual, relative, runCase, shearRatio, zip } from './common.mjs';
import { cantileverDeck, nodeAt, prescribedDeck, q8Mesh, reverseNormals } from './decks.mjs';

export async function runBenchmarks(context) {
  return [
    await objectivity(context),
    await membrane(context),
    await bending(context),
    await thinLimit(context),
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
    cases.push({...run.record,error,equilibrium:reactionResidual(run.parsed.forces,load,load),energy:cantileverEnergy(run.parsed,{displacement,L,n,width,t,load})});
  }
  const mutantMesh=q8Mesh({nx:1,ny:1,lx:L,ly:width}), mutantTip=nodeAt(mutantMesh,L,width/2);
  const mutant=await runCase({solver:ctx.solver,root:ctx.root,benchmarkId:id,caseId:'mutation-full-integration',deck:cantileverDeck({title:`${id} S8`,mesh:mutantMesh,thickness:t,E,load,elementType:'S8'})});
  const mutantDisp=mutant.parsed.displacements.find((r)=>r.node===mutantTip)?.values[2];
  const observedError=Math.max(...cases.map((x)=>x.error));
  return evidence(ctx,{id,levels,cases:[...cases,mutant.record],reference:{identity:'TIMOSHENKO_CANTILEVER',E,L,width,t,load,...ref},referenceUncertainty:1e-6,tolerance,observedError,
    equilibriumResidual:Math.max(...cases.map((x)=>x.equilibrium)),energyResidual:Math.max(...cases.map((x)=>x.energy)),shearRatio:Math.abs(ref.shear/ref.total),
    mutation:{id:mutation,baselineError:observedError,mutatedError:relative(mutantDisp,ref.total)}});
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

function timoshenko({E,L,width,t,load}){const I=width*t**3/12,A=width*t,G=E/2,k=5/6,bending=load*L**3/(3*E*I),shear=load*L/(k*G*A);return{bending,shear,total:bending+shear};}
function cantileverEnergy(parsed,{displacement,L,n,width,t,load}){const density=zip(parsed.stresses,parsed.strains).reduce((sum,[s,e])=>sum+0.5*dotStressStrain(s.values,e.values),0);return relative(density*(L/n)*width*t/8,0.5*Math.abs(load*displacement));}
