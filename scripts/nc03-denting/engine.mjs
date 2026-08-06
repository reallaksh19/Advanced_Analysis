import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { runCase } from '../nc01-shell/common.mjs';
import { CELL } from './config.mjs';

export async function runDentCell(ctx, caseId, overrides = {}) {
  const options = { ...CELL, ...overrides };
  const { deck, meta } = buildDeck(options);
  const run = await runCase({ solver: ctx.solver, root: ctx.root, benchmarkId: 'NC03', caseId, deck });
  const raw = resolve(ctx.root, 'raw', 'NC03', caseId);
  const dat = await readFile(resolve(raw, 'model.dat'), 'utf8');
  const cvg = await readFile(resolve(raw, 'model.cvg'), 'utf8');
  return { record: run.record, outcome: parseOutcome(dat, cvg, meta), options };
}

export function buildDeck(options) {
  const { radius: R, thickness: T, length: L, axialElements: nx, circumferentialElements: nt,
    elasticModulus: E, poissonRatio: nu, pressure, indenterRadius: ir, indenterPatchWidth: iw,
    indenterDivisions: md, initialGap: gap, imposedDepth: depth, penaltySlope, initialIncrement } = options;
  const lines = ['*HEADING', 'NC03 governed rounded-indenter elastic dent cell', '*NODE,NSET=PIPE_NODES'];
  const ids = new Map(); const pipeNodes = []; let node = 1;
  for (let ix = 0; ix <= 2 * nx; ix += 1) {
    const x = -L / 2 + L * ix / (2 * nx);
    for (let jt = 0; jt < 2 * nt; jt += 1) {
      if (ix % 2 === 1 && jt % 2 === 1) continue;
      const theta = 2 * Math.PI * jt / (2 * nt);
      const id = node++; ids.set(`${ix},${jt}`, id); pipeNodes.push(id);
      lines.push(`${id},${fmt(x)},${fmt(R * Math.sin(theta))},${fmt(R * Math.cos(theta))}`);
    }
  }
  lines.push('*ELEMENT,TYPE=S8R,ELSET=PIPE_EL'); let element = 1;
  for (let ex = 0; ex < nx; ex += 1) for (let et = 0; et < nt; et += 1) {
    const i = 2 * ex, j = 2 * et, j1 = (j + 1) % (2 * nt), j2 = (j + 2) % (2 * nt);
    const n = (a, b) => ids.get(`${a},${b}`);
    lines.push(`${element++},${[n(i,j),n(i+2,j),n(i+2,j2),n(i,j2),n(i+1,j),n(i+2,j1),n(i+1,j2),n(i,j1)].join(',')}`);
  }
  lines.push('*NODE'); const master = []; const masterIds = new Map();
  for (let layer = 0; layer < 2; layer += 1) for (let iy = 0; iy <= md; iy += 1) for (let ix = 0; ix <= md; ix += 1) {
    const x = -iw / 2 + iw * ix / md, y = -iw / 2 + iw * iy / md;
    const rise = ir - Math.sqrt(Math.max(ir * ir - x * x - y * y, 1e-12));
    const id = node++; master.push(id); masterIds.set(`${layer},${ix},${iy}`, id);
    lines.push(`${id},${fmt(x)},${fmt(y)},${fmt(R + T / 2 + gap + rise + 0.2 * layer)}`);
  }
  lines.push('*ELEMENT,TYPE=C3D8,ELSET=INDENTER_EL');
  for (let iy = 0; iy < md; iy += 1) for (let ix = 0; ix < md; ix += 1) {
    const n = (l, a, b) => masterIds.get(`${l},${a},${b}`);
    lines.push(`${element++},${[n(0,ix,iy),n(0,ix+1,iy),n(0,ix+1,iy+1),n(0,ix,iy+1),n(1,ix,iy),n(1,ix+1,iy),n(1,ix+1,iy+1),n(1,ix,iy+1)].join(',')}`);
  }
  const referenceNode = node++; lines.push('*NODE', `${referenceNode},0,0,${fmt(R + T / 2 + gap + ir)}`);
  const rotationNode = node++; lines.push('*NODE', `${rotationNode},0,0,0`);
  set(lines, 'INDENTER_NODES', master); set(lines, 'REFNODE', [referenceNode]); set(lines, 'ROTNODE', [rotationNode]);
  lines.push(`*RIGID BODY,ELSET=INDENTER_EL,REF NODE=${referenceNode},ROT NODE=${rotationNode}`);
  const ends = [...ids.entries()].filter(([key]) => { const ix = Number(key.split(',')[0]); return ix === 0 || ix === 2 * nx; }).map(([,id]) => id);
  set(lines, 'PIPE_ENDS', ends);
  const probeNode = ids.get(`${nx},0`); set(lines, 'PROBE', [probeNode]);
  lines.push('*MATERIAL,NAME=MAT', '*ELASTIC', `${E},${nu}`, '*SHELL SECTION,ELSET=PIPE_EL,MATERIAL=MAT', fmt(T),
    '*SOLID SECTION,ELSET=INDENTER_EL,MATERIAL=MAT', '*SURFACE,NAME=PIPE_OUTER,TYPE=ELEMENT', 'PIPE_EL,SPOS',
    '*SURFACE,NAME=INDENTER_BOTTOM,TYPE=ELEMENT', 'INDENTER_EL,S1', '*SURFACE INTERACTION,NAME=I1',
    '*SURFACE BEHAVIOR,PRESSURE-OVERCLOSURE=LINEAR', `${fmt(penaltySlope)},1e-12,0.1`,
    '*CONTACT PAIR,INTERACTION=I1,TYPE=NODE TO SURFACE', 'PIPE_OUTER,INDENTER_BOTTOM');
  const motions = [0, -gap, -(gap + 0.01), -(gap + 0.02), -(gap + 0.03), -(gap + depth), 0, 0];
  const pressures = [pressure, pressure, pressure, pressure, pressure, pressure, pressure, 0];
  for (let index = 0; index < motions.length; index += 1) {
    lines.push('*STEP,NLGEOM,INC=500', '*STATIC', `${fmt(initialIncrement)},1`, '*BOUNDARY', 'PIPE_ENDS,1,6,0',
      `${referenceNode},1,1,0`, `${referenceNode},2,2,0`, `${referenceNode},3,3,${fmt(motions[index])}`, `${rotationNode},1,3,0`, '*DLOAD,OP=NEW');
    if (pressures[index] > 0) for (let id = 1; id <= nx * nt; id += 1) lines.push(`${id},P,${fmt(pressures[index])}`);
    lines.push('*NODE PRINT,NSET=PROBE,FREQUENCY=10000', 'U,RF', '*NODE PRINT,NSET=REFNODE,FREQUENCY=10000', 'U,RF',
      '*CONTACT PRINT,FREQUENCY=10000', 'CDIS,CSTR,CELS,CNUM', '*EL PRINT,ELSET=PIPE_EL,FREQUENCY=10000,TOTALS=ONLY', 'ELSE,EVOL');
    if ([0,5,6,7].includes(index)) lines.push('*NODE PRINT,NSET=PIPE_NODES,FREQUENCY=10000', 'U');
    if (index === 5) lines.push('*EL PRINT,ELSET=PIPE_EL,FREQUENCY=10000', 'S,E,ENER');
    lines.push('*END STEP');
  }
  return { deck: `${lines.join('\n')}\n`, meta: { ...options, ids: Object.fromEntries(ids), probeNode, referenceNode, pipeNodes } };
}

export function parseOutcome(dat, cvg, meta) {
  const steps = splitSteps(dat).map(parseStep);
  if (steps.length !== 8) throw new Error(`Expected 8 denting steps, received ${steps.length}.`);
  const base = steps[0], loaded = steps[5], recovered = steps[6], depressurized = steps[7];
  const forces = steps.map((step) => -sum(step.referenceForces, 2));
  const basePositions = positions(meta, base.pipeDisplacements);
  const loadedPositions = positions(meta, loaded.pipeDisplacements);
  const recoveredPositions = positions(meta, recovered.pipeDisplacements);
  const depressurizedPositions = positions(meta, depressurized.pipeDisplacements);
  const geometry = geometryMetrics(meta, basePositions, loadedPositions);
  const recoveryResidual = maxRadialDifference(basePositions, recoveredPositions);
  const depressurizedResidual = Math.max(...[...depressurizedPositions.values()].map((p) => Math.max(0, meta.radius - Math.hypot(p[1], p[2]))));
  const screens = strainScreens(loaded.strains);
  const energyDelta = Math.max(loaded.totalInternalEnergy - base.totalInternalEnergy, 1e-30);
  const energyCycleClosure = Math.max(Math.abs(recovered.totalInternalEnergy - base.totalInternalEnergy) / energyDelta,
    Math.abs(depressurized.totalInternalEnergy) / Math.max(Math.abs(base.totalInternalEnergy), 1));
  const monotonicity = Math.max(0, ...forces.slice(1, 6).map((value, i) => i ? forces[i] - value : 0)) / Math.max(...forces, 1);
  const residuals = finalResidualByStep(cvg);
  return {
    schema: 'lafea-nc03-dent-cell-outcome/v2',
    cell: cellIdentity(meta),
    maxForce: forces[5], forcePath: forces.slice(0, 6), probeDisplacementPath: steps.slice(0, 6).map((step) => step.probeDisplacement[2]),
    geometry, recovery: { pressureMaintainedResidual: recoveryResidual, pressureMaintainedRatio: recoveryResidual / Math.max(geometry.loadedDentDepth, 1e-30),
      depressurizedResidual, depressurizedRatio: depressurizedResidual / Math.max(geometry.loadedDentDepth, 1e-30) },
    outerStrainScreen: screens.outer, innerStrainScreen: screens.inner, forceMonotonicityDefect: monotonicity,
    energyCycleClosure, globalEquilibriumResidual: Math.max(...residuals.values()), loadedEquilibriumResidual: residuals.get(6),
    internalEnergyPath: steps.map((step) => step.totalInternalEnergy), contactActiveCount: loaded.contactStresses.filter((row) => row.values[0] > 1e-8).length,
    maxContactPressure: Math.max(0, ...loaded.contactStresses.map((row) => row.values[0])),
  };
}

function parseStep(text) {
  return {
    probeDisplacement: vectorRows(text, 'displacements (vx,vy,vz) for set PROBE')[0]?.values ?? [0,0,0],
    referenceForces: vectorRows(text, 'forces (fx,fy,fz) for set REFNODE'),
    pipeDisplacements: vectorRows(text, 'displacements (vx,vy,vz) for set PIPE_NODES'),
    contactStresses: vectorRows(text, 'contact stress (slave node,press,tang1,tang2) for all contact elements'),
    strains: pointRows(text, 'strains (elem, integ.pnt.,exx,eyy,ezz,exy,exz,eyz) for set PIPE_EL'),
    totalInternalEnergy: scalarAfter(text, 'total internal energy for set PIPE_EL'),
  };
}
function splitSteps(text) { const matches = [...text.matchAll(/S T E P\s+(\d+)/gu)]; return matches.map((m,i) => text.slice(m.index, matches[i+1]?.index ?? text.length)); }
function vectorRows(text, label) { return numericRows(text, label, 4).map((p) => ({ id: Number(p[0]), values: p.slice(1,4).map(Number) })); }
function pointRows(text, label) { return numericRows(text, label, 8).map((p) => ({ element:Number(p[0]), point:Number(p[1]), values:p.slice(2,8).map(Number) })); }
function numericRows(text, label, minimum) { const at = text.indexOf(label); if (at < 0) return []; const rows=[]; for (const line of text.slice(at+label.length).split(/\r?\n/u).slice(2)) { const p=line.trim().split(/\s+/u); if (p.length < minimum || !/^\d+$/u.test(p[0])) { if (rows.length) break; continue; } rows.push(p); } return rows; }
function scalarAfter(text,label) { const at=text.indexOf(label); if(at<0) return 0; for(const line of text.slice(at+label.length).split(/\r?\n/u)){const s=line.trim();if(/^[-+]?\d+\.\d+E[-+]\d+$/u.test(s))return Number(s);}return 0; }
function finalResidualByStep(cvg) { const map=new Map(); for(const line of cvg.split(/\r?\n/u)){const p=line.trim().split(/\s+/u);if(p.length>=9&&/^\d+$/u.test(p[0])&&/^\d+$/u.test(p[3]))map.set(Number(p[0]),Number(p[5])/100);} return map; }
function positions(meta, rows) { const u=new Map(rows.map((r)=>[r.id,r.values])); const out=new Map(); for(const [key,id] of Object.entries(meta.ids)){const [ix,jt]=key.split(',').map(Number);const x=-meta.length/2+meta.length*ix/(2*meta.axialElements);const th=2*Math.PI*jt/(2*meta.circumferentialElements);const d=u.get(id)??[0,0,0];out.set(key,[x+d[0],meta.radius*Math.sin(th)+d[1],meta.radius*Math.cos(th)+d[2]]);} return out; }
function geometryMetrics(meta,base,loaded){const dent=new Map([...base].map(([k,p])=>[k,Math.hypot(p[1],p[2])-Math.hypot(loaded.get(k)[1],loaded.get(k)[2])]));const depth=Math.max(...dent.values());const center=meta.axialElements%2===0?meta.axialElements:meta.axialElements-1;const crown=[];for(let ix=0;ix<=2*meta.axialElements;ix+=1)crown.push([base.get(`${ix},0`)[0],dent.get(`${ix},0`)]);const ring=[];for(let jt=0;jt<2*meta.circumferentialElements;jt+=1)ring.push([2*Math.PI*jt/(2*meta.circumferentialElements),dent.get(`${center},${jt}`)]);const half=depth/2,xs=crown.filter(([,d])=>d>=half).map(([x])=>x);const angles=ring.filter(([,d])=>d>=half).map(([a])=>Math.abs(wrap(a)));const top=loaded.get(`${center},0`)[2],bottom=loaded.get(`${center},${meta.circumferentialElements}`)[2],bt=base.get(`${center},0`)[2],bb=base.get(`${center},${meta.circumferentialElements}`)[2];const c=2*ring.reduce((s,[a,d])=>s+d*Math.cos(2*a),0)/ring.length,q=2*ring.reduce((s,[a,d])=>s+d*Math.sin(2*a),0)/ring.length;return{loadedDentDepth:depth,loadedDentDepthRatio:depth/meta.diameter,dentLengthHalfDepth:xs.length?Math.max(...xs)-Math.min(...xs):0,dentWidthHalfDepth:angles.length?2*Math.max(...angles)*meta.radius:0,localDiameterReduction:(bt-bb)-(top-bottom),secondHarmonicOvalization:Math.hypot(c,q)/meta.diameter};}
function strainScreens(rows){let outer=0,inner=0;for(const row of rows){const m=Math.max(...row.values.map(Math.abs));if(row.point<=4)outer=Math.max(outer,m);else inner=Math.max(inner,m);}return{outer,inner};}
function maxRadialDifference(a,b){return Math.max(...[...a].map(([k,p])=>Math.hypot(p[1],p[2])-Math.hypot(b.get(k)[1],b.get(k)[2])));}
function cellIdentity(o){return{diameterToThickness:o.diameter/o.thickness,indenterRadiusToDiameter:o.indenterRadius/o.diameter,indenterWidthToDiameter:o.indenterPatchWidth/o.diameter,lengthToDiameter:o.length/o.diameter,pressureElasticRatio:o.pressure*o.diameter/(2*o.thickness*o.elasticModulus),boundaryDistanceOverSqrtRt:(o.length/2)/Math.sqrt(o.radius*o.thickness),imposedDepthToDiameter:o.imposedDepth/o.diameter,axialElements:o.axialElements,circumferentialElements:o.circumferentialElements};}
function set(lines,name,ids){lines.push(`*NSET,NSET=${name}`);for(let i=0;i<ids.length;i+=16)lines.push(ids.slice(i,i+16).join(','));}
function sum(rows,axis){return rows.reduce((s,r)=>s+r.values[axis],0);}
function wrap(a){return(a+Math.PI)%(2*Math.PI)-Math.PI;}
function fmt(n){if(!Number.isFinite(n))throw new TypeError('Non-finite deck value.');return Number(n).toExponential(10);}
