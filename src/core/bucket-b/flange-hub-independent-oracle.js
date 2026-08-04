import { createHash } from 'node:crypto';

export const FLANGE_HUB_INDEPENDENT_ORACLE_DESCRIPTOR = Object.freeze({
  oracleId: 'BB11_INDEPENDENT_APPLICATION_ORACLE_V1',
  formulation: 'INDEPENDENT_AXISYMMETRIC_Q4_FULL_2X2',
  sourceSeparation: 'NO_PRODUCTION_FEA_IMPORTS',
  stressOrder: Object.freeze(['sigmaR', 'sigmaZ', 'sigmaTheta', 'tauRZ']),
  strainOrder: Object.freeze(['epsilonR', 'epsilonZ', 'epsilonTheta', 'gammaRZ']),
});

const MATERIAL = Object.freeze({ E: 210000, nu: 0.30 });
const GEOMETRY = Object.freeze({
  bore: 50, pipeOuter: 60, pipeStart: -100,
  smallCenter: Object.freeze({ r: 66, z: -19.874676603233155 }),
  smallRadius: 6,
  smallStartAngle: Math.PI,
  smallSweep: -0.306265268152969,
  smallHubTangent: Object.freeze({ r: 60.27994664789553, z: -18.06332637506674 }),
  largeCenter: Object.freeze({ r: 92.32274598503973, z: 50 }),
  largeRadius: 10,
  largeStartAngle: 2.834885072747,
  largeSweep: Math.PI / 2 - 2.834885072747,
  largeHubTangent: Object.freeze({ r: 82.78932373153229, z: 53.018917046944026 }),
  flangeTangentRadius: 92.32274598503973,
  flangeOuter: 120, flangeBack: 60, flangeFace: 90,
});
const LEVELS = Object.freeze([
  Object.freeze({ levelId: 'O0', refinement: 1 }),
  Object.freeze({ levelId: 'O1', refinement: 2 }),
  Object.freeze({ levelId: 'O2', refinement: 4 }),
  Object.freeze({ levelId: 'O3', refinement: 8 }),
]);
const GAUSS2 = Object.freeze([
  Object.freeze({ value: -1 / Math.sqrt(3), weight: 1 }),
  Object.freeze({ value: 1 / Math.sqrt(3), weight: 1 }),
]);
const GL4 = Object.freeze([
  Object.freeze({ value: -0.8611363115940526, weight: 0.3478548451374538 }),
  Object.freeze({ value: -0.3399810435848563, weight: 0.6521451548625461 }),
  Object.freeze({ value: 0.3399810435848563, weight: 0.6521451548625461 }),
  Object.freeze({ value: 0.8611363115940526, weight: 0.3478548451374538 }),
]);
const BLOCKS = Object.freeze([
  Object.freeze({ id: 'O-B00', kind: 'STRIP', profile: 'PIPE', nu: 4 }),
  Object.freeze({ id: 'O-B01', kind: 'STRIP', profile: 'SMALL_ARC', nu: 2 }),
  Object.freeze({ id: 'O-B02', kind: 'STRIP', profile: 'HUB_SMALL', nu: 2 }),
  Object.freeze({ id: 'O-B03', kind: 'STRIP', profile: 'HUB_MID', nu: 2 }),
  Object.freeze({ id: 'O-B04', kind: 'STRIP', profile: 'HUB_LARGE', nu: 2 }),
  Object.freeze({ id: 'O-B05', kind: 'STRIP', profile: 'LARGE_ARC', nu: 2 }),
  Object.freeze({ id: 'O-B06', kind: 'CORE', nu: 2 }),
  Object.freeze({ id: 'O-B07', kind: 'RING', nu: 2 }),
]);
const STRIP_V = Object.freeze([0, 0.25, 0.5, 0.75, 1]);
const RING_V = Object.freeze([0, (95 - GEOMETRY.flangeTangentRadius) / (120 - GEOMETRY.flangeTangentRadius), 0.5, 0.75, 1]);

export function runIndependentFlangeHubOracle(loadCaseId) {
  if (!['FH-PRES-001', 'FH-AXIAL-001', 'FH-GASKET-001'].includes(loadCaseId)) {
    throw new TypeError(`ORACLE_UNKNOWN_LOAD_CASE:${loadCaseId}`);
  }
  const levels = LEVELS.map((definition) => solveLevel(definition, loadCaseId));
  const convergence = oracleConvergence(levels);
  const payload = {
    schema: 'flange-hub-independent-oracle-evidence/v1',
    descriptor: FLANGE_HUB_INDEPENDENT_ORACLE_DESCRIPTOR,
    loadCaseId,
    primitiveInputs: { geometry: GEOMETRY, material: MATERIAL, loadCase: loadCaseDefinition(loadCaseId) },
    levels,
    convergence,
    status: convergence.accepted ? 'PASS' : 'FAIL',
    authority: {
      applicationOracleOnly: true,
      codeAssessmentQualified: false,
      moduleQualified: false,
      productionSwitchAuthorized: false,
    },
  };
  return freeze({ ...payload, semanticHash: oracleHash(payload) });
}

function solveLevel(definition, loadCaseId) {
  const mesh = q4Mesh(definition);
  const nodeIndex = new Map(mesh.nodes.map((node, index) => [node.id, index]));
  const nodeById = new Map(mesh.nodes.map((node) => [node.id, node]));
  const dofCount = 2 * mesh.nodes.length;
  const K = Array.from({ length: dofCount }, () => new Map());
  const f = new Float64Array(dofCount);
  const D = constitutive();
  mesh.elements.forEach((element) => {
    const nodes = element.nodeIds.map((id) => nodeById.get(id));
    const ke = q4Element(nodes, D);
    const dofs = element.nodeIds.flatMap((id) => { const i = nodeIndex.get(id); return [2 * i, 2 * i + 1]; });
    for (let i = 0; i < 8; i += 1) for (let j = 0; j < 8; j += 1) {
      K[dofs[i]].set(dofs[j], (K[dofs[i]].get(dofs[j]) ?? 0) + ke[i][j]);
    }
  });
  const load = loadCaseDefinition(loadCaseId);
  const loadResultants = applyLoads(mesh, load, nodeById, nodeIndex, f);
  const constrained = constraintDofs(mesh, loadCaseId, nodeIndex);
  const constrainedSet = new Set(constrained);
  const free = Array.from({ length: dofCount }, (_, i) => i).filter((i) => !constrainedSet.has(i));
  const freeIndex = new Map(free.map((dof, index) => [dof, index]));
  const rhs = Float64Array.from(free.map((dof) => f[dof]));
  const diagonal = Float64Array.from(free.map((dof) => K[dof].get(dof) ?? 0));
  const multiply = (x) => {
    const y = new Float64Array(x.length);
    free.forEach((globalRow, localRow) => K[globalRow].forEach((value, globalColumn) => {
      const localColumn = freeIndex.get(globalColumn);
      if (localColumn !== undefined) y[localRow] += value * x[localColumn];
    }));
    return y;
  };
  const solved = pcg(multiply, rhs, diagonal);
  const u = new Float64Array(dofCount);
  free.forEach((dof, index) => { u[dof] = solved.x[index]; });
  const internal = sparseMultiply(K, u);
  let energy = 0;
  let externalWork = 0;
  for (let i = 0; i < dofCount; i += 1) { energy += 0.5 * u[i] * internal[i]; externalWork += f[i] * u[i]; }
  const reaction = constrained.reduce((sum, dof) => sum + internal[dof] - f[dof], 0);
  const probes = recoverOracleProbes(mesh, nodeById, nodeIndex, u, D);
  return freeze({
    levelId: definition.levelId,
    refinement: definition.refinement,
    nodeCount: mesh.nodes.length,
    elementCount: mesh.elements.length,
    globalH: mesh.globalH,
    meshHash: oracleHash(mesh),
    solver: { iterations: solved.iterations, relativeResidual: solved.relativeResidual },
    appliedResultants: loadResultants,
    axialReaction: reaction,
    strainEnergy: energy,
    externalWork,
    energyIdentityRelativeError: Math.abs(2 * energy - externalWork) / Math.max(1, Math.abs(2 * energy), Math.abs(externalWork)),
    probes,
  });
}

function q4Mesh(level) {
  const candidates = new Map();
  const elements = [];
  const boundaries = [];
  BLOCKS.forEach((block) => {
    const us = uniform(block.nu * level.refinement);
    const baseV = block.kind === 'RING' ? RING_V : STRIP_V;
    const vs = refine(baseV, level.refinement);
    const map = blockMap(block);
    for (let i = 0; i < us.length - 1; i += 1) for (let j = 0; j < vs.length - 1; j += 1) {
      const nodeKeys = [[us[i], vs[j]], [us[i], vs[j + 1]], [us[i + 1], vs[j + 1]], [us[i + 1], vs[j]]]
        .map(([u, v]) => addNode(candidates, map(u, v)));
      const elementId = `${level.levelId}-${block.id}-${i}-${j}`;
      elements.push({ elementId, blockId: block.id, nodeKeys });
      if (block.kind !== 'RING' && j === 0) boundaries.push({ id: `${elementId}-BORE`, type: 'BORE', nodeKeys: [nodeKeys[0], nodeKeys[3]] });
      if (block.id === 'O-B00' && i === 0) boundaries.push({ id: `${elementId}-END`, type: 'PIPE_END', nodeKeys: [nodeKeys[0], nodeKeys[1]] });
      if ((block.kind === 'CORE' || block.kind === 'RING') && i === us.length - 2) boundaries.push({ id: `${elementId}-FACE`, type: 'FACE', nodeKeys: [nodeKeys[3], nodeKeys[2]] });
    }
  });
  const sorted = [...candidates.entries()].map(([key, value]) => ({ key, ...value })).sort((a, b) => a.z - b.z || a.r - b.r);
  const idByKey = new Map();
  const nodes = sorted.map((row, index) => { const id = `${level.levelId}-N${index + 1}`; idByKey.set(row.key, id); return { id, r: row.r, z: row.z }; });
  const finalElements = elements.map((row) => ({ elementId: row.elementId, blockId: row.blockId, nodeIds: row.nodeKeys.map((key) => idByKey.get(key)) }));
  const finalBoundaries = boundaries.map((row) => ({ id: row.id, type: row.type, nodeIds: row.nodeKeys.map((key) => idByKey.get(key)) }));
  const byId = new Map(nodes.map((node) => [node.id, node]));
  let globalH = 0;
  finalElements.forEach((element) => {
    const e = element.nodeIds.map((id) => byId.get(id));
    for (let i = 0; i < 4; i += 1) globalH = Math.max(globalH, distance(e[i], e[(i + 1) % 4]));
    q4Element(e, constitutive());
  });
  return freeze({ nodes, elements: finalElements, boundaries: finalBoundaries, globalH });
}

function blockMap(block) {
  const outer = profile(block.profile);
  if (block.kind === 'STRIP') return (u, v) => { const p = outer(u); return point(50 + v * (p.r - 50), p.z); };
  if (block.kind === 'CORE') return (u, v) => point(50 + v * (GEOMETRY.flangeTangentRadius - 50), 60 + 30 * u);
  if (block.kind === 'RING') return (u, v) => point(GEOMETRY.flangeTangentRadius + v * (120 - GEOMETRY.flangeTangentRadius), 60 + 30 * u);
  throw new TypeError('ORACLE_UNKNOWN_BLOCK');
}
function profile(id) {
  const line = (a, b) => (u) => point(a.r + u * (b.r - a.r), a.z + u * (b.z - a.z));
  const arc = (center, radius, start, sweep) => (u) => point(center.r + radius * Math.cos(start + sweep * u), center.z + radius * Math.sin(start + sweep * u));
  if (id === 'PIPE') return line({ r: 60, z: -100 }, { r: 60, z: GEOMETRY.smallCenter.z });
  if (id === 'SMALL_ARC') return arc(GEOMETRY.smallCenter, 6, GEOMETRY.smallStartAngle, GEOMETRY.smallSweep);
  if (id === 'HUB_SMALL') return line(GEOMETRY.smallHubTangent, { r: 66, z: 0 });
  if (id === 'HUB_MID') return line({ r: 66, z: 0 }, { r: 75.5, z: 30 });
  if (id === 'HUB_LARGE') return line({ r: 75.5, z: 30 }, GEOMETRY.largeHubTangent);
  if (id === 'LARGE_ARC') return arc(GEOMETRY.largeCenter, 10, GEOMETRY.largeStartAngle, GEOMETRY.largeSweep);
  throw new TypeError('ORACLE_UNKNOWN_PROFILE');
}

function q4Element(nodes, D) {
  const K = Array.from({ length: 8 }, () => new Array(8).fill(0));
  GAUSS2.forEach((gx) => GAUSS2.forEach((gy) => {
    const state = q4State(nodes, gx.value, gy.value);
    if (!(state.detJ > 0) || !(state.r > 0)) throw new RangeError('ORACLE_NONPOSITIVE_MAPPING');
    const DB = multiplyMatrices(D, state.B);
    const factor = gx.weight * gy.weight * 2 * Math.PI * state.r * state.detJ;
    for (let i = 0; i < 8; i += 1) for (let j = 0; j < 8; j += 1) for (let k = 0; k < 4; k += 1) K[i][j] += state.B[k][i] * DB[k][j] * factor;
  }));
  return K;
}
function q4State(nodes, xi, eta) {
  const N = [0.25 * (1 - xi) * (1 - eta), 0.25 * (1 + xi) * (1 - eta), 0.25 * (1 + xi) * (1 + eta), 0.25 * (1 - xi) * (1 + eta)];
  const dx = [-0.25 * (1 - eta), 0.25 * (1 - eta), 0.25 * (1 + eta), -0.25 * (1 + eta)];
  const de = [-0.25 * (1 - xi), -0.25 * (1 + xi), 0.25 * (1 + xi), 0.25 * (1 - xi)];
  let r = 0; let z = 0; let drx = 0; let dzx = 0; let dre = 0; let dze = 0;
  for (let i = 0; i < 4; i += 1) { r += N[i] * nodes[i].r; z += N[i] * nodes[i].z; drx += dx[i] * nodes[i].r; dzx += dx[i] * nodes[i].z; dre += de[i] * nodes[i].r; dze += de[i] * nodes[i].z; }
  const detJ = drx * dze - dre * dzx;
  const dNdr = dx.map((value, i) => (dze * value - dzx * de[i]) / detJ);
  const dNdz = dx.map((value, i) => (-dre * value + drx * de[i]) / detJ);
  const B = Array.from({ length: 4 }, () => new Array(8).fill(0));
  for (let i = 0; i < 4; i += 1) { B[0][2 * i] = dNdr[i]; B[1][2 * i + 1] = dNdz[i]; B[2][2 * i] = N[i] / r; B[3][2 * i] = dNdz[i]; B[3][2 * i + 1] = dNdr[i]; }
  return { N, r, z, detJ, B };
}
function constitutive() { const E = MATERIAL.E; const nu = MATERIAL.nu; const G = E / (2 * (1 + nu)); const lambda = E * nu / ((1 + nu) * (1 - 2 * nu)); const d = lambda + 2 * G; return [[d, lambda, lambda, 0], [lambda, d, lambda, 0], [lambda, lambda, d, 0], [0, 0, 0, G]]; }

function applyLoads(mesh, load, nodeById, nodeIndex, force) {
  let radial = 0; let axial = 0;
  const addEdge = (edge, tractionAt) => {
    const nodes = edge.nodeIds.map((id) => nodeById.get(id));
    GL4.forEach((g) => {
      const N = [(1 - g.value) / 2, (1 + g.value) / 2];
      const dN = [-0.5, 0.5];
      const r = N[0] * nodes[0].r + N[1] * nodes[1].r;
      const z = N[0] * nodes[0].z + N[1] * nodes[1].z;
      const dr = dN[0] * nodes[0].r + dN[1] * nodes[1].r;
      const dz = dN[0] * nodes[0].z + dN[1] * nodes[1].z;
      const J = Math.hypot(dr, dz);
      const traction = tractionAt(r, z);
      const factor = g.weight * 2 * Math.PI * r * J;
      for (let i = 0; i < 2; i += 1) { const index = nodeIndex.get(nodes[i].id); force[2 * index] += N[i] * traction[0] * factor; force[2 * index + 1] += N[i] * traction[1] * factor; }
      radial += traction[0] * factor; axial += traction[1] * factor;
    });
  };
  if (load.id === 'FH-PRES-001') {
    mesh.boundaries.filter((e) => e.type === 'BORE').forEach((e) => addEdge(e, () => [10, 0]));
    mesh.boundaries.filter((e) => e.type === 'PIPE_END').forEach((e) => addEdge(e, () => [0, load.endTraction]));
  } else if (load.id === 'FH-AXIAL-001') {
    mesh.boundaries.filter((e) => e.type === 'PIPE_END').forEach((e) => addEdge(e, () => [0, load.endTraction]));
  } else {
    mesh.boundaries.filter((e) => e.type === 'FACE' && edgeRange(e, nodeById, 65, 95)).forEach((e) => addEdge(e, () => [0, -20]));
  }
  return { radial, axial };
}
function constraintDofs(mesh, loadCaseId, nodeIndex) { const result = []; mesh.nodes.forEach((node) => { const support = loadCaseId === 'FH-GASKET-001' ? Math.abs(node.z + 100) < 1e-9 : Math.abs(node.z - 90) < 1e-9 && node.r >= 60 - 1e-9 && node.r <= 95 + 1e-9; if (support) result.push(2 * nodeIndex.get(node.id) + 1); }); if (!result.length) throw new RangeError('ORACLE_UNDERCONSTRAINED'); return result; }
function loadCaseDefinition(id) { const area = Math.PI * (60 ** 2 - 50 ** 2); if (id === 'FH-PRES-001') return { id, pressure: 10, endResultant: -10 * Math.PI * 50 ** 2, endTraction: -10 * Math.PI * 50 ** 2 / area }; if (id === 'FH-AXIAL-001') return { id, endResultant: -100000, endTraction: -100000 / area }; return { id, pressure: 20, annulus: [65, 95] }; }

function recoverOracleProbes(mesh, nodeById, nodeIndex, u, D) {
  const probes = oracleProbePoints();
  return probes.map((probe) => {
    const candidates = mesh.elements.filter((element) => inBox(probe.point, element.nodeIds.map((id) => nodeById.get(id))));
    const matching = candidates.filter((element) => element.blockId === probe.blockId);
    if (!matching.length) throw new RangeError(`ORACLE_NO_PROBE_OWNER:${probe.id}`);
    const element = matching.sort((a, b) => a.elementId.localeCompare(b.elementId))[0];
    const nodes = element.nodeIds.map((id) => nodeById.get(id));
    const natural = invertQ4(nodes, probe.point);
    const state = q4State(nodes, natural.xi, natural.eta);
    const elementU = element.nodeIds.flatMap((id) => { const i = nodeIndex.get(id); return [u[2 * i], u[2 * i + 1]]; });
    const strain = state.B.map((row) => dot(row, elementU));
    const stress = D.map((row) => dot(row, strain));
    let ur = 0; let uz = 0;
    state.N.forEach((value, i) => { ur += value * elementU[2 * i]; uz += value * elementU[2 * i + 1]; });
    return { id: probe.id, point: probe.point, elementId: element.elementId, natural, displacement: { radial: ur, axial: uz }, stress: { sigmaR: stress[0], sigmaZ: stress[1], sigmaTheta: stress[2], tauRZ: stress[3] } };
  });
}
function oracleProbePoints() { const d = unit({ r: 19, z: 60 }); const smallOuter = add(GEOMETRY.smallHubTangent, scale(d, 3)); const largeOuter = add(GEOMETRY.largeHubTangent, scale(d, -5)); return [
  { id: 'P-PIPE-REMOTE', point: { r: 55, z: -80 }, blockId: 'O-B00' },
  { id: 'P-HUB-SMALL', point: midpointToBore(smallOuter), blockId: 'O-B02' },
  { id: 'P-HUB-MID', point: midpointToBore({ r: 75.5, z: 30 }), blockId: 'O-B03' },
  { id: 'P-HUB-LARGE', point: midpointToBore(largeOuter), blockId: 'O-B04' },
  { id: 'P-FLANGE-INNER', point: { r: 100, z: 75 }, blockId: 'O-B07' },
  { id: 'P-FLANGE-MID', point: { r: 110, z: 75 }, blockId: 'O-B07' },
]; }
function midpointToBore(outer) { const d = unit({ r: 19, z: 60 }); const inward = { r: -d.z, z: d.r }; const length = (outer.r - 50) / (-inward.r); const inner = add(outer, scale(inward, length)); return { r: (inner.r + outer.r) / 2, z: (inner.z + outer.z) / 2 }; }
function invertQ4(nodes, pointValue) { let xi = 0; let eta = 0; for (let iteration = 0; iteration < 30; iteration += 1) { const state = q4Mapping(nodes, xi, eta); const rr = state.r - pointValue.r; const rz = state.z - pointValue.z; if (Math.hypot(rr, rz) < 1e-10) return { xi, eta, residual: Math.hypot(rr, rz) }; const dxi = (state.dze * rr - state.dre * rz) / state.detJ; const deta = (-state.dzx * rr + state.drx * rz) / state.detJ; xi -= dxi; eta -= deta; } throw new RangeError('ORACLE_INVERSE_MAPPING_FAILURE'); }
function q4Mapping(nodes, xi, eta) { const N = [0.25 * (1 - xi) * (1 - eta), 0.25 * (1 + xi) * (1 - eta), 0.25 * (1 + xi) * (1 + eta), 0.25 * (1 - xi) * (1 + eta)]; const dx = [-0.25 * (1 - eta), 0.25 * (1 - eta), 0.25 * (1 + eta), -0.25 * (1 + eta)]; const de = [-0.25 * (1 - xi), -0.25 * (1 + xi), 0.25 * (1 + xi), 0.25 * (1 - xi)]; let r = 0; let z = 0; let drx = 0; let dzx = 0; let dre = 0; let dze = 0; for (let i = 0; i < 4; i += 1) { r += N[i] * nodes[i].r; z += N[i] * nodes[i].z; drx += dx[i] * nodes[i].r; dzx += dx[i] * nodes[i].z; dre += de[i] * nodes[i].r; dze += de[i] * nodes[i].z; } return { r, z, drx, dzx, dre, dze, detJ: drx * dze - dre * dzx }; }

function oracleConvergence(levels) { const pairs = [
  ['ENERGY', (row) => row.strainEnergy, 0.01],
  ['REACTION', (row) => row.axialReaction, 0.001],
  ['PIPE_UR', (row) => probe(row, 'P-PIPE-REMOTE').displacement.radial, 0.01],
  ['HUB_UR', (row) => probe(row, 'P-HUB-MID').displacement.radial, 0.02],
  ['FLANGE_UZ', (row) => probe(row, 'P-FLANGE-MID').displacement.axial, 0.02],
  ['PIPE_HOOP', (row) => probe(row, 'P-PIPE-REMOTE').stress.sigmaTheta, 0.025],
  ['HUB_HOOP', (row) => probe(row, 'P-HUB-MID').stress.sigmaTheta, 0.04],
]; const rows = pairs.map(([id, getter, limit]) => { const values = levels.map((row) => ({ levelId: row.levelId, value: getter(row) })); const change = relative(values.at(-1).value, values.at(-2).value); return { quantityId: id, values, finestChange: change, limit, accepted: change <= limit }; }); return { rows, accepted: rows.every((row) => row.accepted) }; }
function probe(level, id) { return level.probes.find((row) => row.id === id); }

function pcg(multiply, rhs, diagonal) { const n = rhs.length; const x = new Float64Array(n); const r = Float64Array.from(rhs); const z = new Float64Array(n); for (let i = 0; i < n; i += 1) z[i] = r[i] / diagonal[i]; const p = Float64Array.from(z); let rz = dot(r, z); const rhsNorm = norm(rhs); const tolerance = Math.max(1e-8, 1e-10 * rhsNorm); for (let iteration = 1; iteration <= Math.max(2000, 8 * n); iteration += 1) { const Ap = multiply(p); const alpha = rz / dot(p, Ap); for (let i = 0; i < n; i += 1) { x[i] += alpha * p[i]; r[i] -= alpha * Ap[i]; } const residual = norm(r); if (residual <= tolerance) return { x, iterations: iteration, relativeResidual: residual / Math.max(1, rhsNorm) }; for (let i = 0; i < n; i += 1) z[i] = r[i] / diagonal[i]; const next = dot(r, z); const beta = next / rz; for (let i = 0; i < n; i += 1) p[i] = z[i] + beta * p[i]; rz = next; } throw new RangeError('ORACLE_PCG_FAILURE'); }
function sparseMultiply(rows, vector) { const result = new Float64Array(rows.length); rows.forEach((row, i) => row.forEach((value, j) => { result[i] += value * vector[j]; })); return result; }
function multiplyMatrices(a, b) { return a.map((row) => Array.from({ length: b[0].length }, (_, j) => row.reduce((sum, value, k) => sum + value * b[k][j], 0))); }
function addNode(map, value) { const key = `${Math.round(value.r * 1e10)}:${Math.round(value.z * 1e10)}`; if (!map.has(key)) map.set(key, value); return key; }
function point(r, z) { return { r, z }; }
function uniform(count) { return Array.from({ length: count + 1 }, (_, i) => i / count); }
function refine(base, factor) { const out = []; for (let i = 0; i < base.length - 1; i += 1) for (let j = 0; j < factor; j += 1) out.push(base[i] + (base[i + 1] - base[i]) * j / factor); out.push(base.at(-1)); return out; }
function edgeRange(edge, nodes, minimum, maximum) { const r = edge.nodeIds.map((id) => nodes.get(id).r); return Math.min(...r) >= minimum - 1e-9 && Math.max(...r) <= maximum + 1e-9; }
function inBox(pointValue, nodes) { const rs = nodes.map((row) => row.r); const zs = nodes.map((row) => row.z); return pointValue.r >= Math.min(...rs) - 1e-9 && pointValue.r <= Math.max(...rs) + 1e-9 && pointValue.z >= Math.min(...zs) - 1e-9 && pointValue.z <= Math.max(...zs) + 1e-9; }
function add(a, b) { return { r: a.r + b.r, z: a.z + b.z }; }
function scale(a, s) { return { r: a.r * s, z: a.z * s }; }
function unit(a) { const length = Math.hypot(a.r, a.z); return { r: a.r / length, z: a.z / length }; }
function distance(a, b) { return Math.hypot(a.r - b.r, a.z - b.z); }
function dot(a, b) { let sum = 0; for (let i = 0; i < a.length; i += 1) sum += a[i] * b[i]; return sum; }
function norm(a) { return Math.sqrt(dot(a, a)); }
function relative(a, b) { return Math.abs(a - b) / Math.max(1e-30, Math.abs(a), Math.abs(b)); }
function oracleHash(value) { return `sha256:${createHash('sha256').update(canonical(value)).digest('hex')}`; }
function canonical(value) { if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value); if (typeof value === 'number') { if (!Number.isFinite(value)) throw new TypeError('ORACLE_NONFINITE_CANONICAL_VALUE'); return JSON.stringify(Object.is(value, -0) ? 0 : value); } if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`; const keys = Object.keys(value).sort(); return `{${keys.map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`; }
function freeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.values(value).forEach(freeze); return Object.freeze(value); }
