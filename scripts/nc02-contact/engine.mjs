import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { runCase } from '../nc01-shell/common.mjs';
import { E, GAP, NOMINAL_K, T } from './config.mjs';

export async function runScenario(ctx, caseId, options) {
  const deck = buildDeck(options);
  const run = await runCase({ solver: ctx.solver, root: ctx.root, benchmarkId: 'NC02', caseId, deck });
  const dat = await readFile(resolve(ctx.root, 'raw', 'NC02', caseId, 'model.dat'), 'utf8');
  return { record: run.record, steps: parseDatSteps(dat), options: normalizedOptions(options) };
}

function buildDeck(options = {}) {
  const masterLx = options.masterLx ?? 2;
  const masterLy = options.masterLy ?? 2;
  const masterNx = options.masterNx ?? 2;
  const masterNy = options.masterNy ?? 2;
  const shellNx = options.shellNx ?? 1;
  const shellNy = options.shellNy ?? 1;
  const penalty = options.penalty ?? NOMINAL_K;
  const tension = options.tension ?? 1e-12;
  const c0 = options.c0 ?? 0.1;
  const topZ = options.curved ? (x, y) => -0.01 * (x*x + 0.25*y*y) : () => 0;
  const master = brickSurfaceMesh(masterNx, masterNy, masterLx, masterLy, topZ);
  const shell = q8SurfaceMesh(shellNx, shellNy, 1, 1, topZ, options.reverseShell === true);
  const shellFace = options.shellFace ?? 'SNEG';
  const steps = options.steps ?? [{ dx: options.dx ?? 0, dy: options.dy ?? 0, dz: options.dz ?? 0 }];
  const lines = ['*HEADING', 'NC02 governed contact benchmark', ...master.lines, ...shell.lines,
    '*MATERIAL,NAME=MAT', '*ELASTIC', `${E},0.3`, '*SOLID SECTION,ELSET=MASTER_EL,MATERIAL=MAT',
    '*SHELL SECTION,ELSET=SLAVE_EL,MATERIAL=MAT', String(T), '*SURFACE,NAME=MASTER_SURF,TYPE=ELEMENT', 'MASTER_EL,S2',
    '*SURFACE,NAME=SLAVE_SURF,TYPE=ELEMENT', `SLAVE_EL,${shellFace}`,
    '*SURFACE INTERACTION,NAME=I1', '*SURFACE BEHAVIOR,PRESSURE-OVERCLOSURE=LINEAR', `${penalty},${tension},${c0}`,
    '*CONTACT PAIR,INTERACTION=I1,TYPE=NODE TO SURFACE', 'SLAVE_SURF,MASTER_SURF'];
  for (const [index, step] of steps.entries()) {
    lines.push(`*STEP,NLGEOM,INC=500`, '*STATIC', `${options.initialIncrement ?? 0.2},1`, '*BOUNDARY');
    for (const node of master.nodeIds) lines.push(`${node},1,6,0`);
    for (const node of shell.nodeIds) {
      lines.push(`${node},1,1,${fmt(step.dx)}`, `${node},2,2,${fmt(step.dy)}`, `${node},3,3,${fmt(step.dz)}`,
        `${node},4,4,0`, `${node},5,5,0`, `${node},6,6,0`);
    }
    lines.push('*NODE PRINT,NSET=SLAVE_NODES,FREQUENCY=10000', 'U,RF', '*NODE PRINT,NSET=MASTER_NODES,FREQUENCY=10000', 'RF',
      '*CONTACT PRINT,FREQUENCY=10000', 'CDIS,CSTR,CELS,CNUM', '*NODE FILE', 'U,RF', '*CONTACT FILE', 'CDIS,CSTR,CELS', '*END STEP');
  }
  return `${lines.join('\n')}\n`;
}

function brickSurfaceMesh(nx, ny, lx, ly, topZ) {
  const lines = ['*NODE,NSET=MASTER_NODES'];
  const ids = new Map();
  const nodeIds = [];
  let id = 1;
  for (let layer = 0; layer < 2; layer++) for (let iy = 0; iy <= ny; iy++) for (let ix = 0; ix <= nx; ix++) {
    const x = -lx/2 + lx*ix/nx, y = -ly/2 + ly*iy/ny, zTop = topZ(x,y), z = layer === 0 ? zTop - 0.2 : zTop;
    ids.set(`${layer},${ix},${iy}`, id); nodeIds.push(id); lines.push(`${id},${fmt(x)},${fmt(y)},${fmt(z)}`); id++;
  }
  lines.push('*ELEMENT,TYPE=C3D8,ELSET=MASTER_EL');
  let eid = 1;
  for (let iy = 0; iy < ny; iy++) for (let ix = 0; ix < nx; ix++) {
    const n = (layer, x, y) => ids.get(`${layer},${x},${y}`);
    lines.push(`${eid++},${[n(0,ix,iy),n(0,ix+1,iy),n(0,ix+1,iy+1),n(0,ix,iy+1),n(1,ix,iy),n(1,ix+1,iy),n(1,ix+1,iy+1),n(1,ix,iy+1)].join(',')}`);
  }
  return { lines, nodeIds };
}

function q8SurfaceMesh(nx, ny, lx, ly, topZ, reverse) {
  const lines = ['*NODE,NSET=SLAVE_NODES'];
  const ids = new Map(); const nodeIds = []; let id = 10001;
  for (let iy = 0; iy <= 2*ny; iy++) for (let ix = 0; ix <= 2*nx; ix++) {
    if (ix%2===1 && iy%2===1) continue;
    const x=-lx/2+lx*ix/(2*nx), y=-ly/2+ly*iy/(2*ny), z=topZ(x,y)+T/2+GAP;
    ids.set(`${ix},${iy}`,id); nodeIds.push(id); lines.push(`${id},${fmt(x)},${fmt(y)},${fmt(z)}`); id++;
  }
  lines.push('*ELEMENT,TYPE=S8R,ELSET=SLAVE_EL'); let eid=10001;
  for (let ey=0;ey<ny;ey++) for(let ex=0;ex<nx;ex++){
    const i=2*ex,j=2*ey,n=(x,y)=>ids.get(`${x},${y}`);
    const conn=[n(i,j),n(i+2,j),n(i+2,j+2),n(i,j+2),n(i+1,j),n(i+2,j+1),n(i+1,j+2),n(i,j+1)];
    const final=reverse?[conn[0],conn[3],conn[2],conn[1],conn[7],conn[6],conn[5],conn[4]]:conn;
    lines.push(`${eid++},${final.join(',')}`);
  }
  return { lines, nodeIds };
}

function parseDatSteps(text) {
  const matches=[...text.matchAll(/S T E P\s+(\d+)/gu)];
  return matches.map((match,index)=>{
    const segment=text.slice(match.index,index+1<matches.length?matches[index+1].index:text.length);
    return {
      step:Number(match[1]),
      slaveForces:forceBlock(segment,'SLAVE_NODES'),
      masterForces:forceBlock(segment,'MASTER_NODES'),
      contactDisplacements:contactVectorBlock(segment,'relative contact displacement'),
      contactStresses:contactVectorBlock(segment,'contact stress'),
      contactEnergies:contactScalarBlock(segment,'contact spring energy'),
      activeCount:scalarBlock(segment,'total number of contact elements'),
    };
  });
}

function forceBlock(text,setName){
  const matches=[...text.matchAll(new RegExp(`forces \\(fx,fy,fz\\) for set ${setName}`,'gu'))];
  if(!matches.length)return[];return numericRows(text,matches.at(-1).index+matches.at(-1)[0].length,4).map(p=>({id:+p[0],values:p.slice(1,4).map(Number)}));
}
function contactVectorBlock(text,label){const matches=[...text.matchAll(new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'gu'))];if(!matches.length)return[];return numericRows(text,matches.at(-1).index+matches.at(-1)[0].length,4).map(p=>({id:+p[0],values:p.slice(1,4).map(Number)}));}
function contactScalarBlock(text,label){const matches=[...text.matchAll(new RegExp(label,'gu'))];if(!matches.length)return[];return numericRows(text,matches.at(-1).index+matches.at(-1)[0].length,2).map(p=>({id:+p[0],value:+p[1]}));}
function scalarBlock(text,label){const match=[...text.matchAll(new RegExp(label,'gu'))].at(-1);if(!match)return 0;const rows=numericRows(text,match.index+match[0].length,1);return rows.length?+rows[0][0]:0;}
function numericRows(text,start,min){const rows=[];for(const line of text.slice(start).split(/\r?\n/u).slice(2)){const p=line.trim().split(/\s+/u);if(p.length<min||!/^[-+]?\d+(?:\.\d+)?(?:[Ee][-+]?\d+)?$/u.test(p[0])){if(rows.length)break;continue;}rows.push(p);}return rows;}

export function metrics(run){return stepMetrics(run.steps.at(-1), run.options.penalty ?? NOMINAL_K);}
export function stepMetrics(step, penalty = NOMINAL_K){
  const slave=sumVector(step.slaveForces),master=sumVector(step.masterForces),normalResultant=Math.abs(master[2]);
  const pairs=Math.min(step.contactDisplacements.length,step.contactStresses.length);
  let pressureLawError=0,maxPenetration=0,maxPressure=0,maxTangential=0,tangentialWork=0,normalWork=0;
  for(let i=0;i<pairs;i++){
    const gap=step.contactDisplacements[i].values[0],penetration=Math.max(-gap,0),pressure=step.contactStresses[i].values[0];
    const activePressure=Math.max(pressure,0); if(activePressure>1e-8){const expected=penalty*penetration;pressureLawError=Math.max(pressureLawError,relative(activePressure,expected));}maxPenetration=Math.max(maxPenetration,penetration);maxPressure=Math.max(maxPressure,Math.abs(pressure));
    const tang=Math.hypot(step.contactStresses[i].values[1],step.contactStresses[i].values[2]);maxTangential=Math.max(maxTangential,tang);tangentialWork+=Math.abs(step.contactStresses[i].values[1]*step.contactDisplacements[i].values[1]+step.contactStresses[i].values[2]*step.contactDisplacements[i].values[2]);normalWork+=Math.abs(pressure*gap);
  }
  return {
    signedGapMin:step.contactDisplacements.length?Math.min(...step.contactDisplacements.map(r=>r.values[0])):GAP,
    signedGapMax:step.contactDisplacements.length?Math.max(...step.contactDisplacements.map(r=>r.values[0])):GAP,
    contactNormal:[0,0,1],maxPressure,activeCount:step.contactStresses.filter(r=>r.values[0]>1e-8).length,penetrationRatio:maxPenetration,normalResultant,
    contactEnergy:step.contactEnergies.reduce((s,r)=>s+r.value,0),tangentialTractionMax:maxTangential,
    tangentialTractionRatio:maxTangential/Math.max(maxPressure,1),contactWorkImbalance:tangentialWork/Math.max(normalWork,1e-30),
    globalEquilibriumResidual:Math.hypot(slave[0]+master[0],slave[1]+master[1],slave[2]+master[2])/Math.max(normalResultant,1),
    pressureLawError,
  };
}


function normalizedOptions(o){return JSON.parse(JSON.stringify(o));}
function sumVector(rows){return[0,1,2].map(a=>rows.reduce((s,r)=>s+r.values[a],0));}
function relative(a,b){return Math.abs(a-b)/Math.max(Math.abs(b),1e-30);}
function fmt(n){if(!Number.isFinite(n))throw new TypeError('Non-finite deck value.');return Number(n).toExponential(10);}
