import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const GRAVITY = 9.80665;
const REACTION_TOLERANCE_N = 1e-6;

function solvePlanarActiveSet({ nodes, elements, anchors, unilateralSupports }) {
  let active = [...unilateralSupports].sort();
  const iterations = [];
  for (let iteration = 1; iteration <= unilateralSupports.length + 2; iteration += 1) {
    const supports = new Set([...anchors, ...active.map((nodeId) => keyOf([nodeId, 1]))]);
    const solved = solvePlanarFrame({ nodes, elements, supports });
    const supportReactionsN = Object.fromEntries(
      unilateralSupports.map((nodeId) => [nodeId, solved.reaction(nodeId, 'UY')]),
    );
    const releasedSupports = active
      .filter((nodeId) => supportReactionsN[nodeId] < -REACTION_TOLERANCE_N)
      .sort();
    iterations.push({
      iteration,
      activeSupports: [...active],
      supportReactionsN,
      releasedSupports,
    });
    if (releasedSupports.length === 0) {
      return { ...solved, activeSupports: [...active], iterations };
    }
    active = active.filter((nodeId) => !releasedSupports.includes(nodeId));
  }
  throw new Error('EMPIRICAL_ACTIVE_SET_NONCONVERGENT');
}

function solvePlanarFrame({ nodes, elements, supports }) {
  const nodeOrder = Object.keys(nodes);
  const index = new Map(nodeOrder.map((nodeId, position) => [nodeId, position]));
  const dofCount = 3 * nodeOrder.length;
  const stiffness = zeroMatrix(dofCount);
  const load = new Array(dofCount).fill(0);
  let totalAppliedVerticalLoadN = 0;

  for (const element of elements) {
    const [xi, yi] = nodes[element.i];
    const [xj, yj] = nodes[element.j];
    const dx = xj - xi;
    const dy = yj - yi;
    const geometryLength = Math.hypot(dx, dy);
    const length = element.stiffnessLengthM ?? geometryLength;
    const c = dx / geometryLength;
    const s = dy / geometryLength;
    const area = element.areaM2;
    const inertia = element.inertiaM4 / (element.flexibilityFactor ?? 1);
    const axial = element.elasticModulusPa * area / length;
    const flexural = element.elasticModulusPa * inertia;
    const local = zeroMatrix(6);
    addSubmatrix(local, [0, 3], [0, 3], [[axial, -axial], [-axial, axial]]);
    addSubmatrix(local, [1, 2, 4, 5], [1, 2, 4, 5], [
      [12 * flexural / length ** 3, 6 * flexural / length ** 2, -12 * flexural / length ** 3, 6 * flexural / length ** 2],
      [6 * flexural / length ** 2, 4 * flexural / length, -6 * flexural / length ** 2, 2 * flexural / length],
      [-12 * flexural / length ** 3, -6 * flexural / length ** 2, 12 * flexural / length ** 3, -6 * flexural / length ** 2],
      [6 * flexural / length ** 2, 2 * flexural / length, -6 * flexural / length ** 2, 4 * flexural / length],
    ]);
    const transform = [
      [c, s, 0, 0, 0, 0],
      [-s, c, 0, 0, 0, 0],
      [0, 0, 1, 0, 0, 0],
      [0, 0, 0, c, s, 0],
      [0, 0, 0, -s, c, 0],
      [0, 0, 0, 0, 0, 1],
    ];
    const global = multiply(transpose(transform), multiply(local, transform));
    const dofs = planarElementDofs(index, element.i, element.j);
    assemble(stiffness, global, dofs);

    const loadLength = element.loadLengthM ?? geometryLength;
    const qxGlobal = element.qxGlobalNPerM ?? 0;
    const qyGlobal = element.qyGlobalNPerM ?? 0;
    const scale = loadLength / length;
    const qx = (c * qxGlobal + s * qyGlobal) * scale;
    const qy = (-s * qxGlobal + c * qyGlobal) * scale;
    const localLoad = [
      qx * length / 2,
      qy * length / 2,
      qy * length ** 2 / 12,
      qx * length / 2,
      qy * length / 2,
      -qy * length ** 2 / 12,
    ];
    const thermalForce = element.elasticModulusPa * area * (element.alphaPerK ?? 0) * (element.deltaTK ?? 0);
    localLoad[0] -= thermalForce;
    localLoad[3] += thermalForce;
    const globalLoad = multiplyVector(transpose(transform), localLoad);
    assembleVector(load, globalLoad, dofs);
    totalAppliedVerticalLoadN += -qyGlobal * loadLength;
  }

  const fixed = [...supports].map((entry) => parseKey(entry, index, 3)).sort((a, b) => a - b);
  const fixedSet = new Set(fixed);
  const free = Array.from({ length: dofCount }, (_, dof) => dof).filter((dof) => !fixedSet.has(dof));
  const reduced = free.map((row) => free.map((column) => stiffness[row][column]));
  const reducedLoad = free.map((dof) => load[dof]);
  const freeDisplacement = gaussianSolve(reduced, reducedLoad);
  const displacement = new Array(dofCount).fill(0);
  free.forEach((dof, position) => { displacement[dof] = freeDisplacement[position]; });
  const reactionVector = subtractVectors(multiplyVector(stiffness, displacement), load);

  return {
    nodeOrder,
    totalAppliedVerticalLoadN,
    displacement(nodeId, dof) {
      return displacement[3 * index.get(nodeId) + planarDof(dof)];
    },
    reaction(nodeId, dof) {
      const key = keyOf([nodeId, planarDof(dof)]);
      return supports.has(key) ? reactionVector[3 * index.get(nodeId) + planarDof(dof)] : 0;
    },
    allVerticalDisplacementsMm: Object.fromEntries(nodeOrder.map((nodeId) => [nodeId, displacement[3 * index.get(nodeId) + 1] * 1000])),
  };
}

function solveGrillage({ nodes, elements, supports }) {
  const nodeOrder = Object.keys(nodes);
  const index = new Map(nodeOrder.map((nodeId, position) => [nodeId, position]));
  const dofCount = 3 * nodeOrder.length;
  const stiffness = zeroMatrix(dofCount);
  const load = new Array(dofCount).fill(0);
  let totalAppliedVerticalLoadN = 0;

  for (const element of elements) {
    const [xi, , zi] = nodes[element.i];
    const [xj, , zj] = nodes[element.j];
    const dx = xj - xi;
    const dz = zj - zi;
    const length = Math.hypot(dx, dz);
    const c = dx / length;
    const s = dz / length;
    const flexural = element.elasticModulusPa * element.inertiaM4;
    const torsional = element.shearModulusPa * element.polarInertiaM4 / length;
    const local = zeroMatrix(6);
    addSubmatrix(local, [1, 4], [1, 4], [[torsional, -torsional], [-torsional, torsional]]);
    addSubmatrix(local, [0, 2, 3, 5], [0, 2, 3, 5], [
      [12 * flexural / length ** 3, 6 * flexural / length ** 2, -12 * flexural / length ** 3, 6 * flexural / length ** 2],
      [6 * flexural / length ** 2, 4 * flexural / length, -6 * flexural / length ** 2, 2 * flexural / length],
      [-12 * flexural / length ** 3, -6 * flexural / length ** 2, 12 * flexural / length ** 3, -6 * flexural / length ** 2],
      [6 * flexural / length ** 2, 2 * flexural / length, -6 * flexural / length ** 2, 4 * flexural / length],
    ]);
    const nodeTransform = [
      [1, 0, 0],
      [0, c, s],
      [0, -s, c],
    ];
    const transform = zeroMatrix(6);
    for (let row = 0; row < 3; row += 1) {
      for (let column = 0; column < 3; column += 1) {
        transform[row][column] = nodeTransform[row][column];
        transform[row + 3][column + 3] = nodeTransform[row][column];
      }
    }
    const global = multiply(transpose(transform), multiply(local, transform));
    const dofs = grillageElementDofs(index, element.i, element.j);
    assemble(stiffness, global, dofs);
    const q = -element.lineMassKgPerM * GRAVITY;
    const localLoad = [q * length / 2, 0, q * length ** 2 / 12, q * length / 2, 0, -q * length ** 2 / 12];
    assembleVector(load, multiplyVector(transpose(transform), localLoad), dofs);
    totalAppliedVerticalLoadN += -q * length;
  }

  const fixed = [...supports].map((entry) => parseKey(entry, index, 3)).sort((a, b) => a - b);
  const fixedSet = new Set(fixed);
  const free = Array.from({ length: dofCount }, (_, dof) => dof).filter((dof) => !fixedSet.has(dof));
  const reduced = free.map((row) => free.map((column) => stiffness[row][column]));
  const reducedLoad = free.map((dof) => load[dof]);
  const freeDisplacement = gaussianSolve(reduced, reducedLoad);
  const displacement = new Array(dofCount).fill(0);
  free.forEach((dof, position) => { displacement[dof] = freeDisplacement[position]; });
  const reactionVector = subtractVectors(multiplyVector(stiffness, displacement), load);

  return {
    nodeOrder,
    totalAppliedVerticalLoadN,
    displacement(nodeId) { return displacement[3 * index.get(nodeId)]; },
    reaction(nodeId) {
      const key = keyOf([nodeId, 0]);
      return supports.has(key) ? reactionVector[3 * index.get(nodeId)] : 0;
    },
    allVerticalDisplacementsMm: Object.fromEntries(nodeOrder.map((nodeId) => [nodeId, displacement[3 * index.get(nodeId)] * 1000])),
  };
}

function pipeSection(outerDiameterM, wallThicknessM, densityKgPerM3) {
  return pipeSectionFromDiameters(outerDiameterM, outerDiameterM - 2 * wallThicknessM, densityKgPerM3);
}

function pipeSectionFromDiameters(outerDiameterM, innerDiameterM, densityKgPerM3) {
  const areaM2 = Math.PI * (outerDiameterM ** 2 - innerDiameterM ** 2) / 4;
  const inertiaM4 = Math.PI * (outerDiameterM ** 4 - innerDiameterM ** 4) / 64;
  return {
    areaM2,
    inertiaM4,
    polarInertiaM4: 2 * inertiaM4,
    wallMassKgPerM: areaM2 * densityKgPerM3,
  };
}

function fixedPlanar(nodeIds) {
  return new Set(nodeIds.flatMap((nodeId) => [0, 1, 2].map((dof) => keyOf([nodeId, dof]))));
}

function fixedGrillage(nodeIds) {
  return nodeIds.flatMap((nodeId) => [0, 1, 2].map((dof) => [nodeId, dof]));
}

function sumSupportReactions(result, supportIds) {
  return supportIds.reduce((sum, nodeId) => sum + result.reaction(nodeId, 'UY'), 0);
}

function sumGrillageReactions(result, supportIds) {
  return supportIds.reduce((sum, nodeId) => sum + result.reaction(nodeId), 0);
}

function recordDeviation(nodeId, actual, expected, unit) {
  const absoluteDeviation = Math.abs(actual - expected);
  return {
    nodeId, actual, expected, unit, absoluteDeviation,
    relativeDeviationPercent: expected === 0 ? null : 100 * absoluteDeviation / Math.abs(expected),
  };
}

function planarDof(dof) {
  return { UX: 0, UY: 1, RZ: 2 }[dof];
}

function planarElementDofs(index, nodeI, nodeJ) {
  return [0, 1, 2].map((dof) => 3 * index.get(nodeI) + dof)
    .concat([0, 1, 2].map((dof) => 3 * index.get(nodeJ) + dof));
}

function grillageElementDofs(index, nodeI, nodeJ) {
  return [0, 1, 2].map((dof) => 3 * index.get(nodeI) + dof)
    .concat([0, 1, 2].map((dof) => 3 * index.get(nodeJ) + dof));
}

function zeroMatrix(size) {
  return Array.from({ length: size }, () => new Array(size).fill(0));
}

function addSubmatrix(target, rows, columns, values) {
  rows.forEach((row, rowIndex) => columns.forEach((column, columnIndex) => {
    target[row][column] += values[rowIndex][columnIndex];
  }));
}

function assemble(target, local, dofs) {
  dofs.forEach((row, rowIndex) => dofs.forEach((column, columnIndex) => {
    target[row][column] += local[rowIndex][columnIndex];
  }));
}

function assembleVector(target, local, dofs) {
  dofs.forEach((dof, index) => { target[dof] += local[index]; });
}

function multiply(left, right) {
  const result = Array.from({ length: left.length }, () => new Array(right[0].length).fill(0));
  for (let row = 0; row < left.length; row += 1) {
    for (let inner = 0; inner < right.length; inner += 1) {
      const value = left[row][inner];
      if (value === 0) continue;
      for (let column = 0; column < right[0].length; column += 1) result[row][column] += value * right[inner][column];
    }
  }
  return result;
}

function multiplyVector(matrix, vector) {
  return matrix.map((row) => row.reduce((sum, value, index) => sum + value * vector[index], 0));
}

function transpose(matrix) {
  return matrix[0].map((_, column) => matrix.map((row) => row[column]));
}

function subtractVectors(left, right) {
  return left.map((value, index) => value - right[index]);
}

function gaussianSolve(matrix, vector) {
  const size = vector.length;
  const augmented = matrix.map((row, index) => [...row, vector[index]]);
  for (let pivot = 0; pivot < size; pivot += 1) {
    let selected = pivot;
    for (let row = pivot + 1; row < size; row += 1) {
      if (Math.abs(augmented[row][pivot]) > Math.abs(augmented[selected][pivot])) selected = row;
    }
    if (Math.abs(augmented[selected][pivot]) < 1e-9) throw new Error(`EMPIRICAL_MATRIX_SINGULAR_AT_${pivot}`);
    [augmented[pivot], augmented[selected]] = [augmented[selected], augmented[pivot]];
    const diagonal = augmented[pivot][pivot];
    for (let column = pivot; column <= size; column += 1) augmented[pivot][column] /= diagonal;
    for (let row = 0; row < size; row += 1) {
      if (row === pivot) continue;
      const factor = augmented[row][pivot];
      if (factor === 0) continue;
      for (let column = pivot; column <= size; column += 1) augmented[row][column] -= factor * augmented[pivot][column];
    }
  }
  return augmented.map((row) => row[size]);
}

function parseKey(value, index, dofsPerNode) {
  const [nodeId, dofText] = value.split('|');
  return dofsPerNode * index.get(nodeId) + Number(dofText);
}

function keyOf([nodeId, dof]) { return `${nodeId}|${dof}`; }
function add3(left, right) { return left.map((value, index) => value + right[index]); }
function scale3(value, scalar) { return value.map((entry) => entry * scalar); }
function maxAbs(values) { return values.reduce((maximum, value) => Math.max(maximum, Math.abs(value)), 0); }
function assertClose(actual, expected, tolerance) { assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected} within ${tolerance}`); }
function sha256(value) { return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`; }

export {
  solvePlanarActiveSet, solveGrillage, pipeSection, pipeSectionFromDiameters,
  fixedPlanar, fixedGrillage, sumSupportReactions, sumGrillageReactions,
  recordDeviation, maxAbs, assertClose, sha256, add3, scale3, keyOf,
};
