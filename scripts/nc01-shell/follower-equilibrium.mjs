import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { average, evidence, maxAbs, runCase, shearRatio } from './common.mjs';
import { q8Mesh } from './decks.mjs';

export async function followerPressureWithSeparatedCertificates(ctx) {
  const E = 210000;
  const thickness = 0.0025;
  const pressure = 0.1 * (thickness / 0.01) ** 3;
  const levels = [];
  const cases = [];

  for (const n of [4, 8, 16, 32]) {
    const mesh = q8Mesh({ nx: n, ny: 2, lx: 1, ly: 1 });
    const loadedElementIds = rightHalfElements(mesh);
    const caseId = `separated-certificates-${n}`;
    const run = await runCase({
      solver: ctx.solver,
      root: ctx.root,
      benchmarkId: 'NC01-SH-06',
      caseId,
      deck: followerDeck({ title: `follower pressure ${n}`, mesh, thickness, E, pressure, loadedElementIds }),
    });
    const dat = await readFile(resolve(ctx.root, 'raw', 'NC01-SH-06', caseId, 'model.dat'), 'utf8');
    const supportReaction = summedVector(forceBlock(dat, 'FIX'));
    const completeForceLedger = summedVector(forceBlock(dat, 'NALL'));
    const areaVector = surfaceAreaVector(mesh, loadedElementIds, run.parsed.displacements);
    const error = resultantResidual(supportReaction, areaVector, pressure);
    const equilibrium = vectorNorm(completeForceLedger) / Math.max(pressure * 0.5, 1e-30);
    const energy = energyAdmissibility(run.parsed.energyHistory);
    const shear = shearRatio(run.parsed.stresses, run.parsed.strains);
    const tip = maxAbs(run.parsed.displacements
      .filter((row) => Math.abs(nodeById(mesh, row.node).x - 1) < 1e-12)
      .map((row) => row.values[2]));
    levels.push({ globalH: 1 / n, probeLocalH: 1 / (2 * n), quantity: tip });
    cases.push({
      ...run.record,
      error,
      equilibrium,
      energy,
      shear,
      supportReaction,
      completeForceLedger,
      currentSurfaceAreaVector: areaVector,
      pressureResultant: areaVector.map((value) => pressure * value),
    });
  }

  const mutationMesh = q8Mesh({ nx: 16, ny: 2, lx: 1, ly: 1 });
  const mutationLoaded = rightHalfElements(mutationMesh);
  const mutationCaseId = 'separated-certificates-frozen-mutation';
  const mutation = await runCase({
    solver: ctx.solver,
    root: ctx.root,
    benchmarkId: 'NC01-SH-06',
    caseId: mutationCaseId,
    deck: frozenDeck({
      title: 'frozen pressure direction mutation',
      mesh: mutationMesh,
      thickness,
      E,
      pressure,
      loadedElementIds: mutationLoaded,
    }),
  });
  const mutationDat = await readFile(resolve(ctx.root, 'raw', 'NC01-SH-06', mutationCaseId, 'model.dat'), 'utf8');
  const mutationReaction = summedVector(forceBlock(mutationDat, 'FIX'));
  const mutationArea = surfaceAreaVector(mutationMesh, mutationLoaded, mutation.parsed.displacements);
  const mutatedError = resultantResidual(mutationReaction, mutationArea, pressure);
  const observedError = Math.max(...cases.map((row) => row.error));

  return evidence(ctx, {
    id: 'NC01-SH-06',
    levels,
    cases: [...cases, { ...mutation.record, supportReaction: mutationReaction, currentSurfaceAreaVector: mutationArea }],
    reference: {
      identity: 'CURRENT_SURFACE_VECTOR_AREA_PRESSURE_RESULTANT',
      E,
      thickness,
      pressure,
      loadedInitialArea: 0.5,
      quadrature: 'Q8_3X3_GAUSS_CURRENT_MIDSURFACE',
      equilibriumCertificate: 'COMPLETE_NALL_NODAL_FORCE_LEDGER',
      faceOffsetUncertaintyBound: 5e-4,
    },
    referenceUncertainty: 5e-4,
    tolerance: 1e-3,
    observedError,
    equilibriumResidual: Math.max(...cases.map((row) => row.equilibrium)),
    energyResidual: Math.max(...cases.map((row) => row.energy)),
    shearRatio: Math.max(...cases.map((row) => row.shear)),
    mutation: { id: 'FROZEN_PRESSURE_DIRECTION', baselineError: observedError, mutatedError },
  });
}

function followerDeck({ title, mesh, thickness, E, pressure, loadedElementIds }) {
  const fixed = mesh.nodes.filter((node) => Math.abs(node.x) < 1e-12).map((node) => node.id);
  const lines = ['*HEADING', title, ...meshText(mesh), '*NSET,NSET=FIX', fixed.join(','),
    '*MATERIAL,NAME=MAT', '*ELASTIC', `${E},0.3`, '*SHELL SECTION,ELSET=EALL,MATERIAL=MAT', fmt(thickness),
    '*BOUNDARY', 'FIX,1,6,0', '*STEP,NLGEOM', '*STATIC', '0.5,1.0', '*DLOAD'];
  for (const id of loadedElementIds) lines.push(`${id},P,${fmt(pressure)}`);
  lines.push('*NODE PRINT,NSET=NALL', 'U', '*NODE PRINT,NSET=FIX', 'RF', '*NODE PRINT,NSET=NALL', 'RF',
    '*EL PRINT,ELSET=EALL', 'S,E,ENER', '*NODE FILE', 'U,RF', '*EL FILE', 'S,E', '*END STEP');
  return `${lines.join('\n')}\n`;
}

function frozenDeck({ title, mesh, thickness, E, pressure, loadedElementIds }) {
  const fixed = mesh.nodes.filter((node) => Math.abs(node.x) < 1e-12).map((node) => node.id);
  const nodeByIdMap = new Map(mesh.nodes.map((node) => [node.id, node]));
  const loads = new Map(mesh.nodes.map((node) => [node.id, [0, 0, 0]]));
  const weights = [-1/12, -1/12, -1/12, -1/12, 1/3, 1/3, 1/3, 1/3];
  for (const element of mesh.elements) {
    if (!loadedElementIds.includes(element.id)) continue;
    const corners = element.nodes.slice(0, 4).map((id) => nodeByIdMap.get(id));
    const area = quadrilateralAreaVector(corners);
    for (let index = 0; index < 8; index += 1) {
      const row = loads.get(element.nodes[index]);
      for (let axis = 0; axis < 3; axis += 1) row[axis] += pressure * area[axis] * weights[index];
    }
  }
  const lines = ['*HEADING', title, ...meshText(mesh), '*NSET,NSET=FIX', fixed.join(','),
    '*MATERIAL,NAME=MAT', '*ELASTIC', `${E},0.3`, '*SHELL SECTION,ELSET=EALL,MATERIAL=MAT', fmt(thickness),
    '*BOUNDARY', 'FIX,1,6,0', '*STEP,NLGEOM', '*STATIC', '0.5,1.0', '*CLOAD'];
  for (const [node, vector] of loads) for (let axis = 0; axis < 3; axis += 1) {
    if (Math.abs(vector[axis]) > 0) lines.push(`${node},${axis + 1},${fmt(vector[axis])}`);
  }
  lines.push('*NODE PRINT,NSET=NALL', 'U', '*NODE PRINT,NSET=FIX', 'RF', '*NODE PRINT,NSET=NALL', 'RF',
    '*EL PRINT,ELSET=EALL', 'S,E,ENER', '*NODE FILE', 'U,RF', '*EL FILE', 'S,E', '*END STEP');
  return `${lines.join('\n')}\n`;
}

function forceBlock(text, setName) {
  const pattern = new RegExp(`forces \\(fx,fy,fz\\) for set ${setName}`, 'gu');
  const matches = [...text.matchAll(pattern)];
  if (!matches.length) throw new Error(`Missing ${setName} force block.`);
  const rows = [];
  for (const line of text.slice(matches.at(-1).index + matches.at(-1)[0].length).split(/\r?\n/u).slice(2)) {
    const parts = line.trim().split(/\s+/u);
    if (parts.length < 4 || !/^\d+$/u.test(parts[0])) {
      if (rows.length) break;
      continue;
    }
    rows.push({ node: Number(parts[0]), values: parts.slice(1, 4).map(Number) });
  }
  if (!rows.length) throw new Error(`Empty ${setName} force block.`);
  return rows;
}

function rightHalfElements(mesh) {
  const nodes = new Map(mesh.nodes.map((node) => [node.id, node]));
  return mesh.elements
    .filter((element) => average(element.nodes.slice(0, 4).map((id) => nodes.get(id).x)) >= 0.5 - 1e-12)
    .map((element) => element.id);
}

function surfaceAreaVector(mesh, loadedElementIds, displacements) {
  const displacementByNode = new Map(displacements.map((row) => [row.node, row.values]));
  const positionByNode = new Map(mesh.nodes.map((node) => {
    const u = displacementByNode.get(node.id) ?? [0, 0, 0];
    return [node.id, [node.x + u[0], node.y + u[1], node.z + u[2]]];
  }));
  const gauss = Math.sqrt(3 / 5);
  const points = [[-gauss, 5/9], [0, 8/9], [gauss, 5/9]];
  const total = [0, 0, 0];
  for (const element of mesh.elements) {
    if (!loadedElementIds.includes(element.id)) continue;
    const positions = element.nodes.map((id) => positionByNode.get(id));
    for (const [xi, wx] of points) for (const [eta, we] of points) {
      const derivatives = q8Derivatives(xi, eta);
      const rXi = [0, 1, 2].map((axis) => derivatives.reduce((sum, row, index) => sum + row[0] * positions[index][axis], 0));
      const rEta = [0, 1, 2].map((axis) => derivatives.reduce((sum, row, index) => sum + row[1] * positions[index][axis], 0));
      const area = cross(rXi, rEta);
      for (let axis = 0; axis < 3; axis += 1) total[axis] += wx * we * area[axis];
    }
  }
  return total;
}

function q8Derivatives(xi, eta) {
  return [
    [0.25*(1-eta)*(2*xi+eta), 0.25*(1-xi)*(xi+2*eta)],
    [0.25*(1-eta)*(2*xi-eta), 0.25*(1+xi)*(-xi+2*eta)],
    [0.25*(1+eta)*(2*xi+eta), 0.25*(1+xi)*(xi+2*eta)],
    [0.25*(1+eta)*(2*xi-eta), 0.25*(1-xi)*(-xi+2*eta)],
    [-xi*(1-eta), -0.5*(1-xi*xi)],
    [0.5*(1-eta*eta), -(1+xi)*eta],
    [-xi*(1+eta), 0.5*(1-xi*xi)],
    [-0.5*(1-eta*eta), -(1-xi)*eta],
  ];
}

function energyAdmissibility(history) {
  if (history.length < 2 || history.some((block) => block.length === 0)) return 1;
  const totals = history.map((block) => block.reduce((sum, row) => sum + row.value, 0));
  const scale = Math.max(Math.abs(totals.at(-1)), 1e-30);
  let defect = 0;
  for (const block of history) for (const row of block) defect = Math.max(defect, Math.max(0, -row.value) / scale);
  for (let index = 1; index < totals.length; index += 1) defect = Math.max(defect, Math.max(0, totals[index - 1] - totals[index]) / scale);
  return defect;
}

function meshText(mesh) {
  return ['*NODE,NSET=NALL', ...mesh.nodes.map((node) => `${node.id},${fmt(node.x)},${fmt(node.y)},${fmt(node.z)}`),
    '*ELEMENT,TYPE=S8R,ELSET=EALL', ...mesh.elements.map((element) => `${element.id},${element.nodes.join(',')}`)];
}
function quadrilateralAreaVector(corners) {
  const first = cross(subtract(corners[1], corners[0]), subtract(corners[3], corners[0]));
  const second = cross(subtract(corners[2], corners[1]), subtract(corners[3], corners[1]));
  return first.map((value, index) => 0.5 * (value + second[index]));
}
function nodeById(mesh, id) { const node = mesh.nodes.find((entry) => entry.id === id); if (!node) throw new Error(`Missing node ${id}.`); return node; }
function summedVector(rows) { return [0, 1, 2].map((axis) => rows.reduce((sum, row) => sum + row.values[axis], 0)); }
function resultantResidual(reaction, areaVector, pressure) {
  const expected = areaVector.map((value) => pressure * value);
  return vectorNorm(reaction.map((value, index) => value + expected[index])) / Math.max(vectorNorm(expected), 1e-30);
}
function subtract(a, b) { return [a.x - b.x, a.y - b.y, a.z - b.z]; }
function cross(a, b) { return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]; }
function vectorNorm(vector) { return Math.hypot(...vector); }
function fmt(value) { if (!Number.isFinite(value)) throw new TypeError('Non-finite deck value.'); return Number(value).toExponential(10); }
