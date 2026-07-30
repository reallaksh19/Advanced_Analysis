import assert from 'node:assert/strict';
import {
  bendingBMatrixAt, membraneBMatrixAt, mitc4StiffnessMatrix, shearBMatrixAt,
} from '../src/core/local-shell/mitc4-element.js';

/**
 * SHELL-PATCH-01 (spec §17.4 benchmark catalogue): the shell patch test on
 * the default MITC4 element, over an IRREGULAR interior mesh.
 *
 * The mesh matters. A regular grid lets many element errors cancel by
 * symmetry, so a patch test on one proves far less than it appears to. Here
 * the four interior nodes are deliberately displaced off the regular grid,
 * making every interior element a different distorted quadrilateral — the
 * classical Irons patch-test arrangement.
 *
 * Two modes are tested:
 *
 *  1. MEMBRANE. u = a*x + b*y, v = c*x + d*y is exactly representable by the
 *     bilinear field, so the recovered membrane strain must equal the
 *     analytic constant at EVERY Gauss point of EVERY element, to 1e-10
 *     relative (spec §17.4).
 *
 *  2. BENDING. betaX = k*x, betaY = 0 gives constant curvature kappa_x = k.
 *     The rotations are bilinear and therefore exactly representable, so the
 *     recovered curvature must likewise be exact.
 *
 *     The companion transverse displacement w = -k*x^2/2 (the field for
 *     which transverse shear vanishes) is QUADRATIC, so the bilinear w
 *     cannot interpolate it exactly, and a naive expectation is that some
 *     residual shear must survive. It does not: the measured residual is
 *     ~1e-19, i.e. machine zero. That is a genuine property of the MITC
 *     tying rather than a coincidence — the covariant shear is sampled ONLY
 *     at the four edge midpoints, and for a pure-bending field those
 *     sampled values vanish identically, so the interpolated shear field
 *     vanishes everywhere regardless of the interior w interpolation error.
 *     The bound below is kept as a regression guard: if the tying is ever
 *     broken, this residual is where it shows up first.
 */

const E = 200000;
const NU = 0.3;
const G = E / (2 * (1 + NU));
const THICKNESS = 0.5;
const D = plateConstitutive(E, NU);

// 3x3 element patch over [0,3]^2, with the four interior nodes pushed off-grid.
const INTERIOR_OFFSETS = new Map([
  ['1,1', [0.28, -0.21]],
  ['2,1', [-0.19, 0.24]],
  ['1,2', [0.23, 0.27]],
  ['2,2', [-0.26, -0.18]],
]);

const { nodes, elements, boundaryNodeIds } = buildIrregularPatch();
assert.equal(elements.length, 9, 'a 3x3 patch');
assert.ok(boundaryNodeIds.length === 12, 'twelve boundary nodes, four interior');

// --- Mode 1: membrane constant strain, must be exact. ---
{
  const a = 7e-4; const b = -3e-4; const c = 2e-4; const d = 5e-4;
  const field = (x, y) => [a * x + b * y, c * x + d * y, 0, 0, 0];
  const displacement = solvePatch(field);
  const expected = [a, d, b + c]; // [eps_x, eps_y, gamma_xy]
  let worst = 0;
  for (const element of elements) {
    const local = element.dofMap.map((dof) => displacement[dof]);
    for (const gp of gaussPointsOf(element)) {
      const { B } = membraneBMatrixAt(element.coordinates, gp.xi, gp.eta);
      const strain = multiply(B, local);
      strain.forEach((value, i) => {
        worst = Math.max(worst, Math.abs(value - expected[i]) / Math.max(1e-12, Math.abs(expected[i])));
      });
    }
  }
  assert.ok(worst <= 1e-10, `membrane patch must be exact to 1e-10 relative; worst was ${worst.toExponential(3)}`);
  console.log(`✅ Membrane constant-strain patch exact over an irregular mesh (worst relative error ${worst.toExponential(2)}).`);
}

// --- Mode 2: constant curvature, must be exact in the curvature it can
// represent; residual shear reported honestly rather than asserted zero. ---
{
  const k = 4e-4;
  const field = (x) => [0, 0, -k * x * x / 2, k * x, 0];
  const displacement = solvePatch(field);
  const expected = [k, 0, 0]; // [kappa_x, kappa_y, kappa_xy]
  let worstCurvature = 0;
  let worstShearStrain = 0;
  for (const element of elements) {
    const local = element.dofMap.map((dof) => displacement[dof]);
    for (const gp of gaussPointsOf(element)) {
      const curvature = multiply(bendingBMatrixAt(element.coordinates, gp.xi, gp.eta).B, local);
      curvature.forEach((value, i) => {
        worstCurvature = Math.max(worstCurvature, Math.abs(value - expected[i]) / k);
      });
      const shear = multiply(shearBMatrixAt(element.coordinates, gp.xi, gp.eta).B, local);
      shear.forEach((value) => { worstShearStrain = Math.max(worstShearStrain, Math.abs(value)); });
    }
  }
  assert.ok(
    worstCurvature <= 1e-10,
    `constant-curvature patch must be exact to 1e-10 relative; worst was ${worstCurvature.toExponential(3)}`,
  );
  console.log(`✅ Constant-curvature patch exact over an irregular mesh (worst relative error ${worstCurvature.toExponential(2)}).`);
  // Residual shear under pure bending is machine zero because the MITC
  // tying samples shear only at edge midpoints, where a pure-bending field
  // gives identically zero. Guarded tightly: this is the first place a
  // broken tying scheme would show up.
  assert.ok(
    worstShearStrain < 1e-12 * k,
    `MITC tying must annihilate transverse shear under pure bending; got ${worstShearStrain.toExponential(3)}`,
  );
  console.log(`   residual transverse shear strain ${worstShearStrain.toExponential(2)} — machine zero, as the MITC edge-midpoint tying requires.`);
}

console.log('\n✅ LAFEA.4 SHELL-PATCH-01 benchmark passed.');

/** Prescribes `field` at every boundary node, leaves the interior free, and solves. */
function solvePatch(field) {
  const dofCount = nodes.length * 5;
  const global = Array.from({ length: dofCount }, () => Array(dofCount).fill(0));
  for (const element of elements) {
    const { stiffness } = mitc4StiffnessMatrix(element.coordinates, D, THICKNESS, G);
    for (let a = 0; a < 20; a += 1) {
      for (let c = 0; c < 20; c += 1) {
        global[element.dofMap[a]][element.dofMap[c]] += stiffness[a][c];
      }
    }
  }
  const prescribed = new Map();
  for (const id of boundaryNodeIds) {
    const [x, y] = nodes[id];
    field(x, y).forEach((value, d) => prescribed.set(id * 5 + d, value));
  }
  const free = [...Array(dofCount).keys()].filter((dof) => !prescribed.has(dof));
  const rightHandSide = free.map((row) => {
    let total = 0;
    prescribed.forEach((value, dof) => { total -= global[row][dof] * value; });
    return total;
  });
  const solution = solveDense(free.map((r) => free.map((c) => global[r][c])), rightHandSide);
  const displacement = Array(dofCount).fill(0);
  prescribed.forEach((value, dof) => { displacement[dof] = value; });
  free.forEach((dof, i) => { displacement[dof] = solution[i]; });
  return displacement;
}

function buildIrregularPatch() {
  const nodes = [];
  const index = new Map();
  for (let j = 0; j <= 3; j += 1) {
    for (let i = 0; i <= 3; i += 1) {
      const offset = INTERIOR_OFFSETS.get(`${i},${j}`) ?? [0, 0];
      index.set(`${i},${j}`, nodes.length);
      nodes.push([i + offset[0], j + offset[1]]);
    }
  }
  const elements = [];
  for (let j = 0; j < 3; j += 1) {
    for (let i = 0; i < 3; i += 1) {
      const ids = [
        index.get(`${i},${j}`), index.get(`${i + 1},${j}`),
        index.get(`${i + 1},${j + 1}`), index.get(`${i},${j + 1}`),
      ];
      elements.push({
        ids,
        coordinates: ids.map((k) => nodes[k]),
        dofMap: ids.flatMap((k) => [0, 1, 2, 3, 4].map((d) => k * 5 + d)),
      });
    }
  }
  const boundaryNodeIds = [];
  for (let j = 0; j <= 3; j += 1) {
    for (let i = 0; i <= 3; i += 1) {
      if (i === 0 || i === 3 || j === 0 || j === 3) boundaryNodeIds.push(index.get(`${i},${j}`));
    }
  }
  return { nodes, elements, boundaryNodeIds };
}

function gaussPointsOf() {
  const g = 1 / Math.sqrt(3);
  return [
    { xi: -g, eta: -g }, { xi: g, eta: -g }, { xi: g, eta: g }, { xi: -g, eta: g },
  ];
}

function plateConstitutive(modulus, poisson) {
  const factor = modulus / (1 - poisson ** 2);
  return [
    [factor, factor * poisson, 0],
    [factor * poisson, factor, 0],
    [0, 0, factor * (1 - poisson) / 2],
  ];
}

function multiply(matrix, vector) {
  return matrix.map((row) => row.reduce((sum, value, i) => sum + value * vector[i], 0));
}

function solveDense(matrix, rightHandSide) {
  const size = rightHandSide.length;
  const augmented = matrix.map((row, i) => [...row, rightHandSide[i]]);
  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row;
    }
    [augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]];
    for (let row = 0; row < size; row += 1) {
      if (row === column) continue;
      const factor = augmented[row][column] / augmented[column][column];
      for (let k = column; k <= size; k += 1) augmented[row][k] -= factor * augmented[column][k];
    }
  }
  return augmented.map((row, i) => row[size] / augmented[i][i]);
}
