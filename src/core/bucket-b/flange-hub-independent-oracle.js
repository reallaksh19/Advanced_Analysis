import { createHash } from 'node:crypto';

export const FLANGE_HUB_INDEPENDENT_ORACLE_DESCRIPTOR = Object.freeze({
  oracleId: 'BB11_INDEPENDENT_APPLICATION_ORACLE_V1',
  formulation: 'INDEPENDENT_AXISYMMETRIC_Q4_FULL_2X2',
  sourceSeparation: 'NO_PRODUCTION_FEA_IMPORTS',
  linearSolver: 'DETERMINISTIC_SGS_PCG_EXPLICIT_RESIDUAL_V1',
  stressOrder: Object.freeze(['sigmaR', 'sigmaZ', 'sigmaTheta', 'tauRZ']),
  strainOrder: Object.freeze(['epsilonR', 'epsilonZ', 'epsilonTheta', 'gammaRZ']),
});

const MATERIAL = Object.freeze({ E: 210000, nu: 0.30 });
const GEOMETRY = Object.freeze({
  bore: 50,
  pipeOuter: 60,
  pipeStart: -100,
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
  flangeOuter: 120,
  flangeBack: 60,
  flangeFace: 90,
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
const RING_V = Object.freeze([
  0,
  (95 - GEOMETRY.flangeTangentRadius) / (120 - GEOMETRY.flangeTangentRadius),
  0.5,
  0.75,
  1,
]);

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
    primitiveInputs: {
      geometry: GEOMETRY,
      material: MATERIAL,
      loadCase: loadCaseDefinition(loadCaseId),
    },
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

export function solveIndependentOracleLinearSystem({ rows, rhs } = {}) {
  if (!Array.isArray(rows) || !rhs || rows.length !== rhs.length || rows.length === 0) {
    throw new TypeError('ORACLE_LINEAR_SYSTEM_SHAPE_MISMATCH');
  }
  const normalized = rows.map((row, rowIndex) => {
    if (!Array.isArray(row)) throw new TypeError('ORACLE_LINEAR_SYSTEM_ROW_REQUIRED');
    const values = row.map((entry) => {
      if (!entry || !Number.isInteger(entry.column) || entry.column < 0
        || entry.column >= rows.length || !Number.isFinite(entry.value)) {
        throw new TypeError('ORACLE_LINEAR_SYSTEM_ENTRY_INVALID');
      }
      return { column: entry.column, value: entry.value };
    }).sort((left, right) => left.column - right.column);
    if (!values.some((entry) => entry.column === rowIndex && entry.value > 0)) {
      throw new RangeError('ORACLE_NONPOSITIVE_PRECONDITIONER_DIAGONAL');
    }
    return values;
  });
  const diagonal = Float64Array.from(normalized.map((row, index) => (
    row.find((entry) => entry.column === index).value
  )));
  const multiply = (vector) => multiplyReducedRows(normalized, vector);
  const precondition = createSymmetricGaussSeidelPreconditioner(normalized, diagonal);
  return pcg(multiply, Float64Array.from(rhs), precondition);
}

function solveLevel(definition, loadCaseId) {
  const mesh = q4Mesh(definition);
  const nodeIndex = new Map(mesh.nodes.map((node, index) => [node.id, index]));
  const nodeById = new Map(mesh.nodes.map((node) => [node.id, node]));
  const dofCount = 2 * mesh.nodes.length;
  const stiffness = Array.from({ length: dofCount }, () => new Map());
  const force = new Float64Array(dofCount);
  const D = constitutive();

  mesh.elements.forEach((element) => {
    const nodes = element.nodeIds.map((id) => nodeById.get(id));
    const ke = q4Element(nodes, D);
    const dofs = element.nodeIds.flatMap((id) => {
      const index = nodeIndex.get(id);
      return [2 * index, 2 * index + 1];
    });
    for (let row = 0; row < 8; row += 1) {
      for (let column = 0; column < 8; column += 1) {
        const globalRow = dofs[row];
        const globalColumn = dofs[column];
        stiffness[globalRow].set(
          globalColumn,
          (stiffness[globalRow].get(globalColumn) ?? 0) + ke[row][column],
        );
      }
    }
  });

  const load = loadCaseDefinition(loadCaseId);
  const loadResultants = applyLoads(mesh, load, nodeById, nodeIndex, force);
  const constrained = constraintDofs(mesh, loadCaseId, nodeIndex);
  const constrainedSet = new Set(constrained);
  const free = Array.from({ length: dofCount }, (_, index) => index)
    .filter((index) => !constrainedSet.has(index));
  const freeIndex = new Map(free.map((dof, index) => [dof, index]));
  const rhs = Float64Array.from(free.map((dof) => force[dof]));
  const reducedRows = free.map((globalRow) => {
    const entries = [];
    stiffness[globalRow].forEach((value, globalColumn) => {
      const localColumn = freeIndex.get(globalColumn);
      if (localColumn !== undefined) entries.push({ column: localColumn, value });
    });
    return entries.sort((left, right) => left.column - right.column);
  });
  const solved = solveIndependentOracleLinearSystem({ rows: reducedRows, rhs });
  const displacement = new Float64Array(dofCount);
  free.forEach((dof, index) => { displacement[dof] = solved.x[index]; });
  const internal = sparseMultiply(stiffness, displacement);
  let energy = 0;
  let externalWork = 0;
  for (let index = 0; index < dofCount; index += 1) {
    energy += 0.5 * displacement[index] * internal[index];
    externalWork += force[index] * displacement[index];
  }
  const reaction = constrained.reduce(
    (sum, dof) => sum + internal[dof] - force[dof],
    0,
  );
  const probes = recoverOracleProbes(
    mesh,
    nodeById,
    nodeIndex,
    displacement,
    D,
  );
  return freeze({
    levelId: definition.levelId,
    refinement: definition.refinement,
    nodeCount: mesh.nodes.length,
    elementCount: mesh.elements.length,
    globalH: mesh.globalH,
    meshHash: oracleHash(mesh),
    solver: {
      solverId: 'DETERMINISTIC_SGS_PCG_EXPLICIT_RESIDUAL_V1',
      iterations: solved.iterations,
      relativeResidual: solved.relativeResidual,
      explicitResidualNorm: solved.explicitResidualNorm,
      residualReplacementCount: solved.residualReplacementCount,
    },
    appliedResultants: loadResultants,
    axialReaction: reaction,
    strainEnergy: energy,
    externalWork,
    energyIdentityRelativeError: Math.abs(2 * energy - externalWork)
      / Math.max(1, Math.abs(2 * energy), Math.abs(externalWork)),
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
    for (let i = 0; i < us.length - 1; i += 1) {
      for (let j = 0; j < vs.length - 1; j += 1) {
        const nodeKeys = [
          [us[i], vs[j]],
          [us[i], vs[j + 1]],
          [us[i + 1], vs[j + 1]],
          [us[i + 1], vs[j]],
        ].map(([u, v]) => addNode(candidates, map(u, v)));
        const elementId = `${level.levelId}-${block.id}-${i}-${j}`;
        elements.push({ elementId, blockId: block.id, nodeKeys });
        if (block.kind !== 'RING' && j === 0) {
          boundaries.push({
            id: `${elementId}-BORE`,
            type: 'BORE',
            nodeKeys: [nodeKeys[0], nodeKeys[3]],
          });
        }
        if (block.id === 'O-B00' && i === 0) {
          boundaries.push({
            id: `${elementId}-END`,
            type: 'PIPE_END',
            nodeKeys: [nodeKeys[0], nodeKeys[1]],
          });
        }
        if ((block.kind === 'CORE' || block.kind === 'RING')
          && i === us.length - 2) {
          boundaries.push({
            id: `${elementId}-FACE`,
            type: 'FACE',
            nodeKeys: [nodeKeys[3], nodeKeys[2]],
          });
        }
      }
    }
  });
  const sorted = [...candidates.entries()]
    .map(([key, value]) => ({ key, ...value }))
    .sort((left, right) => left.z - right.z || left.r - right.r);
  const idByKey = new Map();
  const nodes = sorted.map((row, index) => {
    const id = `${level.levelId}-N${index + 1}`;
    idByKey.set(row.key, id);
    return { id, r: row.r, z: row.z };
  });
  const finalElements = elements.map((row) => ({
    elementId: row.elementId,
    blockId: row.blockId,
    nodeIds: row.nodeKeys.map((key) => idByKey.get(key)),
  }));
  const finalBoundaries = boundaries.map((row) => ({
    id: row.id,
    type: row.type,
    nodeIds: row.nodeKeys.map((key) => idByKey.get(key)),
  }));
  const byId = new Map(nodes.map((node) => [node.id, node]));
  let globalH = 0;
  finalElements.forEach((element) => {
    const elementNodes = element.nodeIds.map((id) => byId.get(id));
    for (let index = 0; index < 4; index += 1) {
      globalH = Math.max(
        globalH,
        distance(elementNodes[index], elementNodes[(index + 1) % 4]),
      );
    }
    q4Element(elementNodes, constitutive());
  });
  return freeze({
    nodes,
    elements: finalElements,
    boundaries: finalBoundaries,
    globalH,
  });
}

function blockMap(block) {
  const outer = profile(block.profile);
  if (block.kind === 'STRIP') {
    return (u, v) => {
      const outerPoint = outer(u);
      return point(50 + v * (outerPoint.r - 50), outerPoint.z);
    };
  }
  if (block.kind === 'CORE') {
    return (u, v) => point(
      50 + v * (GEOMETRY.flangeTangentRadius - 50),
      60 + 30 * u,
    );
  }
  if (block.kind === 'RING') {
    return (u, v) => point(
      GEOMETRY.flangeTangentRadius
        + v * (120 - GEOMETRY.flangeTangentRadius),
      60 + 30 * u,
    );
  }
  throw new TypeError('ORACLE_UNKNOWN_BLOCK');
}

function profile(id) {
  const line = (first, second) => (u) => point(
    first.r + u * (second.r - first.r),
    first.z + u * (second.z - first.z),
  );
  const arc = (center, radius, start, sweep) => (u) => point(
    center.r + radius * Math.cos(start + sweep * u),
    center.z + radius * Math.sin(start + sweep * u),
  );
  if (id === 'PIPE') {
    return line(
      { r: 60, z: -100 },
      { r: 60, z: GEOMETRY.smallCenter.z },
    );
  }
  if (id === 'SMALL_ARC') {
    return arc(
      GEOMETRY.smallCenter,
      6,
      GEOMETRY.smallStartAngle,
      GEOMETRY.smallSweep,
    );
  }
  if (id === 'HUB_SMALL') {
    return line(GEOMETRY.smallHubTangent, { r: 66, z: 0 });
  }
  if (id === 'HUB_MID') {
    return line({ r: 66, z: 0 }, { r: 75.5, z: 30 });
  }
  if (id === 'HUB_LARGE') {
    return line({ r: 75.5, z: 30 }, GEOMETRY.largeHubTangent);
  }
  if (id === 'LARGE_ARC') {
    return arc(
      GEOMETRY.largeCenter,
      10,
      GEOMETRY.largeStartAngle,
      GEOMETRY.largeSweep,
    );
  }
  throw new TypeError('ORACLE_UNKNOWN_PROFILE');
}

function q4Element(nodes, D) {
  const stiffness = Array.from({ length: 8 }, () => new Array(8).fill(0));
  GAUSS2.forEach((gx) => GAUSS2.forEach((gy) => {
    const state = q4State(nodes, gx.value, gy.value);
    if (!(state.detJ > 0) || !(state.r > 0)) {
      throw new RangeError('ORACLE_NONPOSITIVE_MAPPING');
    }
    const DB = multiplyMatrices(D, state.B);
    const factor = gx.weight * gy.weight * 2 * Math.PI * state.r * state.detJ;
    for (let row = 0; row < 8; row += 1) {
      for (let column = 0; column < 8; column += 1) {
        for (let component = 0; component < 4; component += 1) {
          stiffness[row][column] += state.B[component][row]
            * DB[component][column] * factor;
        }
      }
    }
  }));
  return stiffness;
}

function q4State(nodes, xi, eta) {
  const N = [
    0.25 * (1 - xi) * (1 - eta),
    0.25 * (1 + xi) * (1 - eta),
    0.25 * (1 + xi) * (1 + eta),
    0.25 * (1 - xi) * (1 + eta),
  ];
  const dXi = [
    -0.25 * (1 - eta),
    0.25 * (1 - eta),
    0.25 * (1 + eta),
    -0.25 * (1 + eta),
  ];
  const dEta = [
    -0.25 * (1 - xi),
    -0.25 * (1 + xi),
    0.25 * (1 + xi),
    0.25 * (1 - xi),
  ];
  let r = 0;
  let z = 0;
  let drXi = 0;
  let dzXi = 0;
  let drEta = 0;
  let dzEta = 0;
  for (let index = 0; index < 4; index += 1) {
    r += N[index] * nodes[index].r;
    z += N[index] * nodes[index].z;
    drXi += dXi[index] * nodes[index].r;
    dzXi += dXi[index] * nodes[index].z;
    drEta += dEta[index] * nodes[index].r;
    dzEta += dEta[index] * nodes[index].z;
  }
  const detJ = drXi * dzEta - drEta * dzXi;
  const dNdr = dXi.map((value, index) => (
    (dzEta * value - dzXi * dEta[index]) / detJ
  ));
  const dNdz = dXi.map((value, index) => (
    (-drEta * value + drXi * dEta[index]) / detJ
  ));
  const B = Array.from({ length: 4 }, () => new Array(8).fill(0));
  for (let index = 0; index < 4; index += 1) {
    B[0][2 * index] = dNdr[index];
    B[1][2 * index + 1] = dNdz[index];
    B[2][2 * index] = N[index] / r;
    B[3][2 * index] = dNdz[index];
    B[3][2 * index + 1] = dNdr[index];
  }
  return { N, r, z, detJ, B };
}

function constitutive() {
  const { E, nu } = MATERIAL;
  const shear = E / (2 * (1 + nu));
  const lambda = E * nu / ((1 + nu) * (1 - 2 * nu));
  const diagonal = lambda + 2 * shear;
  return [
    [diagonal, lambda, lambda, 0],
    [lambda, diagonal, lambda, 0],
    [lambda, lambda, diagonal, 0],
    [0, 0, 0, shear],
  ];
}

function applyLoads(mesh, load, nodeById, nodeIndex, force) {
  let radial = 0;
  let axial = 0;
  const addEdge = (edge, tractionAt) => {
    const nodes = edge.nodeIds.map((id) => nodeById.get(id));
    GL4.forEach((gauss) => {
      const N = [(1 - gauss.value) / 2, (1 + gauss.value) / 2];
      const dN = [-0.5, 0.5];
      const r = N[0] * nodes[0].r + N[1] * nodes[1].r;
      const z = N[0] * nodes[0].z + N[1] * nodes[1].z;
      const dr = dN[0] * nodes[0].r + dN[1] * nodes[1].r;
      const dz = dN[0] * nodes[0].z + dN[1] * nodes[1].z;
      const jacobian = Math.hypot(dr, dz);
      const traction = tractionAt(r, z);
      const factor = gauss.weight * 2 * Math.PI * r * jacobian;
      for (let index = 0; index < 2; index += 1) {
        const node = nodeIndex.get(nodes[index].id);
        force[2 * node] += N[index] * traction[0] * factor;
        force[2 * node + 1] += N[index] * traction[1] * factor;
      }
      radial += traction[0] * factor;
      axial += traction[1] * factor;
    });
  };
  if (load.id === 'FH-PRES-001') {
    mesh.boundaries.filter((edge) => edge.type === 'BORE')
      .forEach((edge) => addEdge(edge, () => [10, 0]));
    mesh.boundaries.filter((edge) => edge.type === 'PIPE_END')
      .forEach((edge) => addEdge(edge, () => [0, load.endTraction]));
  } else if (load.id === 'FH-AXIAL-001') {
    mesh.boundaries.filter((edge) => edge.type === 'PIPE_END')
      .forEach((edge) => addEdge(edge, () => [0, load.endTraction]));
  } else {
    mesh.boundaries
      .filter((edge) => edge.type === 'FACE'
        && edgeRange(edge, nodeById, 65, 95))
      .forEach((edge) => addEdge(edge, () => [0, -20]));
  }
  return { radial, axial };
}

function constraintDofs(mesh, loadCaseId, nodeIndex) {
  const result = [];
  mesh.nodes.forEach((node) => {
    const support = loadCaseId === 'FH-GASKET-001'
      ? Math.abs(node.z + 100) < 1e-9
      : Math.abs(node.z - 90) < 1e-9
        && node.r >= 60 - 1e-9 && node.r <= 95 + 1e-9;
    if (support) result.push(2 * nodeIndex.get(node.id) + 1);
  });
  if (!result.length) throw new RangeError('ORACLE_UNDERCONSTRAINED');
  return result;
}

function loadCaseDefinition(id) {
  const area = Math.PI * (60 ** 2 - 50 ** 2);
  if (id === 'FH-PRES-001') {
    return {
      id,
      pressure: 10,
      endResultant: -10 * Math.PI * 50 ** 2,
      endTraction: -10 * Math.PI * 50 ** 2 / area,
    };
  }
  if (id === 'FH-AXIAL-001') {
    return { id, endResultant: -100000, endTraction: -100000 / area };
  }
  return { id, pressure: 20, annulus: [65, 95] };
}

function recoverOracleProbes(mesh, nodeById, nodeIndex, displacement, D) {
  return oracleProbePoints().map((probeDefinition) => {
    const candidates = mesh.elements.filter((element) => inBox(
      probeDefinition.point,
      element.nodeIds.map((id) => nodeById.get(id)),
    ));
    const matching = candidates.filter(
      (element) => element.blockId === probeDefinition.blockId,
    );
    if (!matching.length) {
      throw new RangeError(`ORACLE_NO_PROBE_OWNER:${probeDefinition.id}`);
    }
    const element = matching.sort(
      (left, right) => left.elementId.localeCompare(right.elementId),
    )[0];
    const nodes = element.nodeIds.map((id) => nodeById.get(id));
    const natural = invertQ4(nodes, probeDefinition.point);
    const state = q4State(nodes, natural.xi, natural.eta);
    const elementDisplacement = element.nodeIds.flatMap((id) => {
      const index = nodeIndex.get(id);
      return [displacement[2 * index], displacement[2 * index + 1]];
    });
    const strain = state.B.map((row) => dot(row, elementDisplacement));
    const stress = D.map((row) => dot(row, strain));
    let radial = 0;
    let axial = 0;
    state.N.forEach((value, index) => {
      radial += value * elementDisplacement[2 * index];
      axial += value * elementDisplacement[2 * index + 1];
    });
    return {
      id: probeDefinition.id,
      point: probeDefinition.point,
      elementId: element.elementId,
      natural,
      displacement: { radial, axial },
      stress: {
        sigmaR: stress[0],
        sigmaZ: stress[1],
        sigmaTheta: stress[2],
        tauRZ: stress[3],
      },
    };
  });
}

function oracleProbePoints() {
  const direction = unit({ r: 19, z: 60 });
  const smallOuter = add(GEOMETRY.smallHubTangent, scale(direction, 3));
  const largeOuter = add(GEOMETRY.largeHubTangent, scale(direction, -5));
  return [
    { id: 'P-PIPE-REMOTE', point: { r: 55, z: -80 }, blockId: 'O-B00' },
    { id: 'P-HUB-SMALL', point: midpointToBore(smallOuter), blockId: 'O-B02' },
    { id: 'P-HUB-MID', point: midpointToBore({ r: 75.5, z: 30 }), blockId: 'O-B03' },
    { id: 'P-HUB-LARGE', point: midpointToBore(largeOuter), blockId: 'O-B04' },
    { id: 'P-FLANGE-INNER', point: { r: 100, z: 75 }, blockId: 'O-B07' },
    { id: 'P-FLANGE-MID', point: { r: 110, z: 75 }, blockId: 'O-B07' },
  ];
}

function midpointToBore(outer) {
  const direction = unit({ r: 19, z: 60 });
  const inward = { r: -direction.z, z: direction.r };
  const length = (outer.r - 50) / (-inward.r);
  const inner = add(outer, scale(inward, length));
  return { r: (inner.r + outer.r) / 2, z: (inner.z + outer.z) / 2 };
}

function invertQ4(nodes, target) {
  let xi = 0;
  let eta = 0;
  for (let iteration = 0; iteration < 30; iteration += 1) {
    const state = q4Mapping(nodes, xi, eta);
    const residualR = state.r - target.r;
    const residualZ = state.z - target.z;
    const residual = Math.hypot(residualR, residualZ);
    if (residual < 1e-10) return { xi, eta, residual };
    const deltaXi = (state.dzEta * residualR - state.drEta * residualZ)
      / state.detJ;
    const deltaEta = (-state.dzXi * residualR + state.drXi * residualZ)
      / state.detJ;
    xi -= deltaXi;
    eta -= deltaEta;
  }
  throw new RangeError('ORACLE_INVERSE_MAPPING_FAILURE');
}

function q4Mapping(nodes, xi, eta) {
  const N = [
    0.25 * (1 - xi) * (1 - eta),
    0.25 * (1 + xi) * (1 - eta),
    0.25 * (1 + xi) * (1 + eta),
    0.25 * (1 - xi) * (1 + eta),
  ];
  const dXi = [
    -0.25 * (1 - eta),
    0.25 * (1 - eta),
    0.25 * (1 + eta),
    -0.25 * (1 + eta),
  ];
  const dEta = [
    -0.25 * (1 - xi),
    -0.25 * (1 + xi),
    0.25 * (1 + xi),
    0.25 * (1 - xi),
  ];
  let r = 0;
  let z = 0;
  let drXi = 0;
  let dzXi = 0;
  let drEta = 0;
  let dzEta = 0;
  for (let index = 0; index < 4; index += 1) {
    r += N[index] * nodes[index].r;
    z += N[index] * nodes[index].z;
    drXi += dXi[index] * nodes[index].r;
    dzXi += dXi[index] * nodes[index].z;
    drEta += dEta[index] * nodes[index].r;
    dzEta += dEta[index] * nodes[index].z;
  }
  return {
    r,
    z,
    drXi,
    dzXi,
    drEta,
    dzEta,
    detJ: drXi * dzEta - drEta * dzXi,
  };
}

function oracleConvergence(levels) {
  const pairs = [
    ['ENERGY', (row) => row.strainEnergy, 0.01],
    ['REACTION', (row) => row.axialReaction, 0.001],
    ['PIPE_UR', (row) => probe(row, 'P-PIPE-REMOTE').displacement.radial, 0.01],
    ['HUB_UR', (row) => probe(row, 'P-HUB-MID').displacement.radial, 0.02],
    ['FLANGE_UZ', (row) => probe(row, 'P-FLANGE-MID').displacement.axial, 0.02],
    ['PIPE_HOOP', (row) => probe(row, 'P-PIPE-REMOTE').stress.sigmaTheta, 0.025],
    ['HUB_HOOP', (row) => probe(row, 'P-HUB-MID').stress.sigmaTheta, 0.04],
  ];
  const rows = pairs.map(([quantityId, getter, limit]) => {
    const values = levels.map((row) => ({
      levelId: row.levelId,
      value: getter(row),
    }));
    const finestChange = relative(values.at(-1).value, values.at(-2).value);
    return {
      quantityId,
      values,
      finestChange,
      limit,
      accepted: finestChange <= limit,
    };
  });
  return { rows, accepted: rows.every((row) => row.accepted) };
}

function pcg(multiply, rhs, precondition) {
  const count = rhs.length;
  const x = new Float64Array(count);
  let residualVector = Float64Array.from(rhs);
  let z = precondition(residualVector);
  let direction = Float64Array.from(z);
  let residualPreconditioned = dot(residualVector, z);
  if (!Number.isFinite(residualPreconditioned)
    || !(residualPreconditioned > 0)) {
    throw new RangeError('ORACLE_NONPOSITIVE_PRECONDITIONED_RESIDUAL');
  }
  const rhsNorm = norm(rhs);
  const denominator = Math.max(1, rhsNorm);
  const tolerance = Math.max(1e-8, 1e-10 * rhsNorm);
  const maximumIterations = Math.max(2000, 8 * count);
  let explicitResidualNorm = norm(residualVector);
  let residualReplacementCount = 0;

  for (let iteration = 1; iteration <= maximumIterations; iteration += 1) {
    const product = multiply(direction);
    const curvature = dot(direction, product);
    if (!Number.isFinite(curvature) || !(curvature > 0)) {
      throw new RangeError('ORACLE_NONPOSITIVE_PCG_CURVATURE');
    }
    const alpha = residualPreconditioned / curvature;
    for (let index = 0; index < count; index += 1) {
      x[index] += alpha * direction[index];
      residualVector[index] -= alpha * product[index];
    }
    if (norm(residualVector) <= tolerance) {
      const certified = explicitResidual(multiply, rhs, x);
      explicitResidualNorm = norm(certified);
      if (explicitResidualNorm <= tolerance) {
        return {
          x,
          iterations: iteration,
          relativeResidual: explicitResidualNorm / denominator,
          explicitResidualNorm,
          residualReplacementCount,
        };
      }
      residualVector = certified;
      z = precondition(residualVector);
      direction = Float64Array.from(z);
      residualPreconditioned = dot(residualVector, z);
      residualReplacementCount += 1;
      continue;
    }
    z = precondition(residualVector);
    const next = dot(residualVector, z);
    if (!Number.isFinite(next) || !(next > 0)) {
      throw new RangeError('ORACLE_NONPOSITIVE_PRECONDITIONED_RESIDUAL');
    }
    const beta = next / residualPreconditioned;
    for (let index = 0; index < count; index += 1) {
      direction[index] = z[index] + beta * direction[index];
    }
    residualPreconditioned = next;
  }
  const certified = explicitResidual(multiply, rhs, x);
  explicitResidualNorm = norm(certified);
  throw new RangeError(
    `ORACLE_PCG_FAILURE:${explicitResidualNorm / denominator}`,
  );
}

function createSymmetricGaussSeidelPreconditioner(rows, diagonal) {
  return (residual) => {
    const count = residual.length;
    const forward = new Float64Array(count);
    for (let rowIndex = 0; rowIndex < count; rowIndex += 1) {
      let value = residual[rowIndex];
      rows[rowIndex].forEach((entry) => {
        if (entry.column < rowIndex) value -= entry.value * forward[entry.column];
      });
      forward[rowIndex] = value / diagonal[rowIndex];
    }
    const result = new Float64Array(count);
    for (let rowIndex = count - 1; rowIndex >= 0; rowIndex -= 1) {
      let value = diagonal[rowIndex] * forward[rowIndex];
      rows[rowIndex].forEach((entry) => {
        if (entry.column > rowIndex) value -= entry.value * result[entry.column];
      });
      result[rowIndex] = value / diagonal[rowIndex];
    }
    return result;
  };
}

function multiplyReducedRows(rows, vector) {
  const result = new Float64Array(rows.length);
  rows.forEach((row, rowIndex) => {
    let value = 0;
    row.forEach((entry) => { value += entry.value * vector[entry.column]; });
    result[rowIndex] = value;
  });
  return result;
}

function explicitResidual(multiply, rhs, x) {
  const product = multiply(x);
  return Float64Array.from(rhs, (value, index) => value - product[index]);
}

function probe(level, id) {
  return level.probes.find((row) => row.id === id);
}
function sparseMultiply(rows, vector) {
  const result = new Float64Array(rows.length);
  rows.forEach((row, index) => row.forEach((value, column) => {
    result[index] += value * vector[column];
  }));
  return result;
}
function multiplyMatrices(left, right) {
  return left.map((row) => Array.from(
    { length: right[0].length },
    (_, column) => row.reduce(
      (sum, value, index) => sum + value * right[index][column],
      0,
    ),
  ));
}
function addNode(map, value) {
  const key = `${Math.round(value.r * 1e10)}:${Math.round(value.z * 1e10)}`;
  if (!map.has(key)) map.set(key, value);
  return key;
}
function point(r, z) { return { r, z }; }
function uniform(count) {
  return Array.from({ length: count + 1 }, (_, index) => index / count);
}
function refine(base, factor) {
  const result = [];
  for (let index = 0; index < base.length - 1; index += 1) {
    for (let offset = 0; offset < factor; offset += 1) {
      result.push(
        base[index] + (base[index + 1] - base[index]) * offset / factor,
      );
    }
  }
  result.push(base.at(-1));
  return result;
}
function edgeRange(edge, nodes, minimum, maximum) {
  const radii = edge.nodeIds.map((id) => nodes.get(id).r);
  return Math.min(...radii) >= minimum - 1e-9
    && Math.max(...radii) <= maximum + 1e-9;
}
function inBox(target, nodes) {
  const radii = nodes.map((row) => row.r);
  const axial = nodes.map((row) => row.z);
  return target.r >= Math.min(...radii) - 1e-9
    && target.r <= Math.max(...radii) + 1e-9
    && target.z >= Math.min(...axial) - 1e-9
    && target.z <= Math.max(...axial) + 1e-9;
}
function add(left, right) {
  return { r: left.r + right.r, z: left.z + right.z };
}
function scale(value, factor) {
  return { r: value.r * factor, z: value.z * factor };
}
function unit(value) {
  const length = Math.hypot(value.r, value.z);
  return { r: value.r / length, z: value.z / length };
}
function distance(left, right) {
  return Math.hypot(left.r - right.r, left.z - right.z);
}
function dot(left, right) {
  let value = 0;
  for (let index = 0; index < left.length; index += 1) {
    value += left[index] * right[index];
  }
  return value;
}
function norm(value) { return Math.sqrt(dot(value, value)); }
function relative(left, right) {
  return Math.abs(left - right)
    / Math.max(1e-30, Math.abs(left), Math.abs(right));
}
function oracleHash(value) {
  return `sha256:${createHash('sha256').update(canonical(value)).digest('hex')}`;
}
function canonical(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError('ORACLE_NONFINITE_CANONICAL_VALUE');
    }
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map(
    (key) => `${JSON.stringify(key)}:${canonical(value[key])}`,
  ).join(',')}}`;
}
function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freeze);
  return Object.freeze(value);
}
