import assert from 'node:assert/strict';
import {
  mitc3StiffnessMatrix, MITC3_ENGINEERING_LEVEL, MITC3_FORMULA_IDS, MITC3_FORMULATION,
  MITC3_GAUSS_POINTS, MITC3_TYING_POINTS, SHEAR_CORRECTION_FACTOR,
} from '../src/core/local-shell/mitc3-element.js';
import {
  MITC4_ENGINEERING_LEVEL, MITC4_FORMULA_IDS, MITC4_FORMULATION,
} from '../src/core/local-shell/mitc4-element.js';
import { FORMULATION as LEGACY_CST_DKT_FORMULATION } from '../src/core/local-shell/constants.js';

/**
 * LAFEA.4 / spec §8 MITC3 triangular-fallback qualification.
 *
 * MITC3 is qualified SEPARATELY from MITC4 and must never be silently
 * substituted for it, so this check verifies both that the element is
 * numerically sound and that its identity is distinct from MITC4's and from
 * the legacy CST/DKT formulation's.
 */

const E = 200000;
const NU = 0; // makes plane-stress D11 exactly E, so beam theory applies unambiguously
const G = E / (2 * (1 + NU));
const D = [[E, 0, 0], [0, E, 0], [0, 0, E / 2]];

// --- Identity separation: three distinct formulations, no aliasing. ---
const identities = [MITC4_FORMULATION, MITC3_FORMULATION, LEGACY_CST_DKT_FORMULATION];
assert.equal(new Set(identities).size, 3, 'MITC4, MITC3 and legacy CST/DKT must carry distinct formulation identities');
assert.notEqual(MITC3_ENGINEERING_LEVEL, MITC4_ENGINEERING_LEVEL, 'the fallback must not share MITC4 engineering level');
assert.ok(/FALLBACK/u.test(MITC3_ENGINEERING_LEVEL), 'MITC3 engineering level must declare itself a fallback');
Object.keys(MITC3_FORMULA_IDS).forEach((key) => {
  if (!Object.hasOwn(MITC4_FORMULA_IDS, key)) return;
  assert.notEqual(
    MITC3_FORMULA_IDS[key], MITC4_FORMULA_IDS[key],
    `MITC3 formula id ${key} must be distinct from MITC4's`,
  );
});
console.log('✅ MITC3, MITC4 and legacy CST/DKT carry distinct, non-aliased identities.');

// --- Symmetry and the six rigid-body modes, on a right AND a skew triangle. ---
for (const [name, nodes] of [
  ['right', [[0, 0], [1, 0], [0, 1]]],
  ['skew', [[0, 0], [1.4, 0.3], [0.2, 1.1]]],
]) {
  const { stiffness } = mitc3StiffnessMatrix(nodes, D, 1, G);
  const scale = matrixScale(stiffness);
  let asymmetry = 0;
  for (let i = 0; i < 15; i += 1) {
    for (let j = 0; j < 15; j += 1) {
      asymmetry = Math.max(asymmetry, Math.abs(stiffness[i][j] - stiffness[j][i]));
    }
  }
  assert.ok(asymmetry / scale <= 1e-12, `${name}: stiffness must be symmetric (got ${asymmetry / scale})`);
  const modes = {
    translationU: nodes.flatMap(() => [1, 0, 0, 0, 0]),
    translationV: nodes.flatMap(() => [0, 1, 0, 0, 0]),
    translationW: nodes.flatMap(() => [0, 0, 1, 0, 0]),
    inPlaneRotation: nodes.flatMap(([x, y]) => [-y, x, 0, 0, 0]),
    rotationAboutY: nodes.flatMap(([x]) => [0, 0, x, -1, 0]),
    rotationAboutX: nodes.flatMap(([, y]) => [0, 0, y, 0, -1]),
  };
  for (const [modeName, q] of Object.entries(modes)) {
    const relative = Math.abs(strainEnergy(stiffness, q)) / scale;
    assert.ok(relative <= 1e-12, `${name}: rigid-body mode ${modeName} must store no energy (got ${relative})`);
  }
  console.log(`✅ ${name} triangle: symmetric, all six rigid-body modes energy-free.`);
}

// --- Locking test. This is what actually validates the MITC3 tying
// constant `c` derived in the module docstring: get it wrong and the
// element either locks (ratio collapses as t/L falls) or goes unstable. ---
const span = 10;
const width = 1;
const tipLoad = 1;
const ratios = [];
console.log('\n   t/L        FE tip w         Timoshenko       FE/theory');
for (const thickness of [1, 0.5, 0.1, 0.01, 0.001, 0.0001]) {
  const inertia = width * thickness ** 3 / 12;
  const area = width * thickness;
  const theory = tipLoad * span ** 3 / (3 * E * inertia)
    + tipLoad * span / (SHEAR_CORRECTION_FACTOR * G * area);
  const deflection = cantileverTipDeflection(thickness);
  ratios.push(deflection / theory);
  console.log(`   ${String(thickness / span).padEnd(10)} ${deflection.toExponential(5)}  ${theory.toExponential(5)}  ${(deflection / theory).toFixed(5)}`);
}
ratios.forEach((ratio, index) => {
  assert.ok(ratio > 0.98 && ratio < 1.02, `thickness level ${index}: FE/theory must stay near 1 (no locking); got ${ratio}`);
});
const spread = Math.max(...ratios) - Math.min(...ratios);
assert.ok(spread < 0.01, `FE/theory must be thickness-independent (no locking); spread was ${spread}`);
console.log(`✅ No shear locking: FE/theory stayed within ${spread.toExponential(2)} across 1e-1..1e-5 thickness/span.`);

// --- Quadrature and tying constants are the standard ones. ---
assert.equal(MITC3_GAUSS_POINTS.length, 3);
assert.ok(Math.abs(MITC3_GAUSS_POINTS.reduce((sum, gp) => sum + gp.weight, 0) - 0.5) < 1e-15, 'weights sum to the reference triangle area (1/2)');
assert.equal(MITC3_TYING_POINTS.length, 3, 'one tying point per edge midpoint');
assert.equal(new Set(MITC3_TYING_POINTS.map((p) => p.edge)).size, 3);

// --- An inverted triangle is rejected, never silently accepted. ---
assert.throws(
  () => mitc3StiffnessMatrix([[0, 0], [0, 1], [1, 0]], D, 1, G),
  /Jacobian determinant must be positive/,
);
console.log('✅ An inverted (clockwise) triangle is rejected, never silently accepted.');

console.log('\n✅ LAFEA.4 MITC3 fallback check passed.');

/** Tip deflection of a cantilever strip meshed with 2 MITC3 triangles per cell. */
function cantileverTipDeflection(thickness) {
  const along = 8;
  const nodes = [];
  for (let j = 0; j <= 1; j += 1) {
    for (let i = 0; i <= along; i += 1) nodes.push([i * span / along, j * width]);
  }
  const nodeId = (i, j) => j * (along + 1) + i;
  const dofCount = nodes.length * 5;
  const global = Array.from({ length: dofCount }, () => Array(dofCount).fill(0));
  const triangles = [];
  for (let i = 0; i < along; i += 1) {
    triangles.push([nodeId(i, 0), nodeId(i + 1, 0), nodeId(i + 1, 1)]);
    triangles.push([nodeId(i, 0), nodeId(i + 1, 1), nodeId(i, 1)]);
  }
  for (const ids of triangles) {
    const { stiffness } = mitc3StiffnessMatrix(ids.map((k) => nodes[k]), D, thickness, G);
    const map = ids.flatMap((k) => [0, 1, 2, 3, 4].map((d) => k * 5 + d));
    for (let a = 0; a < 15; a += 1) {
      for (let c = 0; c < 15; c += 1) global[map[a]][map[c]] += stiffness[a][c];
    }
  }
  const fixed = new Set();
  for (let j = 0; j <= 1; j += 1) {
    const k = nodeId(0, j);
    [0, 1, 2, 3, 4].forEach((d) => fixed.add(k * 5 + d));
  }
  for (let k = 0; k < nodes.length; k += 1) { fixed.add(k * 5); fixed.add(k * 5 + 1); }
  const force = Array(dofCount).fill(0);
  for (let j = 0; j <= 1; j += 1) force[nodeId(along, j) * 5 + 2] += tipLoad / 2;
  const free = [...Array(dofCount).keys()].filter((d) => !fixed.has(d));
  const solution = solveDense(
    free.map((r) => free.map((c) => global[r][c])),
    free.map((r) => force[r]),
  );
  const displacement = Array(dofCount).fill(0);
  free.forEach((d, i) => { displacement[d] = solution[i]; });
  return displacement[nodeId(along, 0) * 5 + 2];
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

function strainEnergy(stiffness, q) {
  let total = 0;
  for (let i = 0; i < q.length; i += 1) {
    for (let j = 0; j < q.length; j += 1) total += q[i] * stiffness[i][j] * q[j];
  }
  return 0.5 * total;
}

function matrixScale(matrix) {
  let scale = 0;
  for (const row of matrix) for (const value of row) scale = Math.max(scale, Math.abs(value));
  return scale;
}
