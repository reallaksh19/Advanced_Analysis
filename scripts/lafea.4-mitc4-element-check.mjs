import assert from 'node:assert/strict';
import {
  mitc4StiffnessMatrix, MITC4_GAUSS_POINTS, MITC4_TYING_POINTS, SHEAR_CORRECTION_FACTOR,
} from '../src/core/local-shell/mitc4-element.js';

/**
 * LAFEA.4 / spec §8 MITC4 element qualification.
 *
 * The headline property under test is the absence of SHEAR LOCKING: a
 * displacement-based bilinear Reissner-Mindlin quad develops spurious shear
 * energy that grows without bound as thickness/span goes to zero, collapsing
 * its predicted deflection. MITC4's tied (mixed-interpolated) shear is
 * precisely what removes that. The cantilever study below therefore spans
 * five orders of magnitude in t/L — a locking element fails it dramatically,
 * so this is a real discriminator rather than a shape check.
 */

const E = 200000;
// nu = 0 makes the plane-stress D11 exactly E, so classical beam theory
// applies with no plane-stress-vs-uniaxial ambiguity in the reference value.
const NU = 0;
const G = E / (2 * (1 + NU));
const D = plateConstitutive(E, NU);

// --- Symmetry and the six rigid-body modes, on a square AND a distorted
// quad (a distorted element is where an incorrect inverse-Jacobian or a
// mis-tied shear term actually shows up). ---
const square = [[0, 0], [1, 0], [1, 1], [0, 1]];
const distorted = [[0, 0], [1.3, -0.2], [1.1, 1.4], [-0.15, 1.05]];

for (const [name, nodes] of [['square', square], ['distorted', distorted]]) {
  const { stiffness } = mitc4StiffnessMatrix(nodes, D, 1, G);
  const scale = matrixScale(stiffness);

  let asymmetry = 0;
  for (let i = 0; i < 20; i += 1) {
    for (let j = 0; j < 20; j += 1) {
      asymmetry = Math.max(asymmetry, Math.abs(stiffness[i][j] - stiffness[j][i]));
    }
  }
  assert.ok(asymmetry / scale <= 1e-12, `${name}: stiffness must be symmetric (got ${asymmetry / scale})`);

  const rigidModes = {
    translationU: nodes.flatMap(() => [1, 0, 0, 0, 0]),
    translationV: nodes.flatMap(() => [0, 1, 0, 0, 0]),
    translationW: nodes.flatMap(() => [0, 0, 1, 0, 0]),
    inPlaneRotation: nodes.flatMap(([x, y]) => [-y, x, 0, 0, 0]),
    rotationAboutY: nodes.flatMap(([x]) => [0, 0, x, -1, 0]),
    rotationAboutX: nodes.flatMap(([, y]) => [0, 0, y, 0, -1]),
  };
  for (const [modeName, q] of Object.entries(rigidModes)) {
    const relative = Math.abs(strainEnergy(stiffness, q)) / scale;
    assert.ok(relative <= 1e-12, `${name}: rigid-body mode ${modeName} must store no energy (got ${relative})`);
  }
  console.log(`✅ ${name}: stiffness symmetric and all six rigid-body modes are energy-free.`);
}

// --- Positive semi-definiteness: no negative-energy (spurious) mode. ---
{
  const { stiffness } = mitc4StiffnessMatrix(distorted, D, 0.1, G);
  const scale = matrixScale(stiffness);
  let minimum = Infinity;
  for (let trial = 0; trial < 400; trial += 1) {
    const q = deterministicVector(trial, 20);
    minimum = Math.min(minimum, strainEnergy(stiffness, q) / (scale * normSquared(q)));
  }
  assert.ok(minimum >= -1e-12, `stiffness must be positive semi-definite (minimum Rayleigh quotient ${minimum})`);
  console.log('✅ No negative-energy mode over 400 deterministic trial vectors.');
}

// --- THE LOCKING TEST. A cantilever strip, tip-loaded, at thickness/span
// ratios spanning 1e-1 down to 1e-5. The ratio FE/Timoshenko must stay
// essentially constant; a locking element's ratio collapses toward zero. ---
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
  const ratio = deflection / theory;
  ratios.push(ratio);
  console.log(`   ${String(thickness / span).padEnd(10)} ${deflection.toExponential(5)}  ${theory.toExponential(5)}  ${ratio.toFixed(5)}`);
}
ratios.forEach((ratio, index) => {
  assert.ok(
    ratio > 0.98 && ratio < 1.02,
    `thickness level ${index}: FE/theory must stay near 1 (no locking); got ${ratio}`,
  );
});
const spread = Math.max(...ratios) - Math.min(...ratios);
assert.ok(spread < 0.01, `FE/theory must be thickness-independent (no locking); spread was ${spread}`);
console.log(`✅ No shear locking: FE/theory stayed within ${spread.toExponential(2)} across 1e-1..1e-5 thickness/span.`);

// --- Formulation constants are the standard ones, stated explicitly. ---
assert.equal(MITC4_GAUSS_POINTS.length, 4, '2x2 Gauss rule');
assert.equal(MITC4_GAUSS_POINTS.reduce((sum, gp) => sum + gp.weight, 0), 4, 'weights sum to the reference-square area');
assert.equal(MITC4_TYING_POINTS.length, 4, 'four MITC tying points');
assert.equal(MITC4_TYING_POINTS.filter((p) => p.component === 'XI_ZETA').length, 2);
assert.equal(MITC4_TYING_POINTS.filter((p) => p.component === 'ETA_ZETA').length, 2);
assert.equal(SHEAR_CORRECTION_FACTOR, 5 / 6);

// --- An inverted element is rejected, never silently accepted. ---
assert.throws(
  () => mitc4StiffnessMatrix([[0, 0], [0, 1], [1, 1], [1, 0]], D, 1, G),
  /Jacobian determinant must be positive/,
);
console.log('✅ An inverted (clockwise) element is rejected, never silently accepted.');

console.log('\n✅ LAFEA.4 MITC4 element check passed.');

function plateConstitutive(modulus, poisson) {
  const factor = modulus / (1 - poisson ** 2);
  return [
    [factor, factor * poisson, 0],
    [factor * poisson, factor, 0],
    [0, 0, factor * (1 - poisson) / 2],
  ];
}

/** Tip deflection of an 8-element cantilever strip under a unit tip shear. */
function cantileverTipDeflection(thickness) {
  const elementsAlong = 8;
  const nodes = [];
  for (let j = 0; j <= 1; j += 1) {
    for (let i = 0; i <= elementsAlong; i += 1) nodes.push([i * span / elementsAlong, j * width]);
  }
  const nodeId = (i, j) => j * (elementsAlong + 1) + i;
  const dofCount = nodes.length * 5;
  const global = Array.from({ length: dofCount }, () => Array(dofCount).fill(0));
  for (let i = 0; i < elementsAlong; i += 1) {
    const ids = [nodeId(i, 0), nodeId(i + 1, 0), nodeId(i + 1, 1), nodeId(i, 1)];
    const { stiffness } = mitc4StiffnessMatrix(ids.map((k) => nodes[k]), D, thickness, G);
    const map = ids.flatMap((k) => [0, 1, 2, 3, 4].map((d) => k * 5 + d));
    for (let a = 0; a < 20; a += 1) {
      for (let c = 0; c < 20; c += 1) global[map[a]][map[c]] += stiffness[a][c];
    }
  }
  const fixed = new Set();
  for (let j = 0; j <= 1; j += 1) {
    const k = nodeId(0, j);
    [0, 1, 2, 3, 4].forEach((d) => fixed.add(k * 5 + d));
  }
  // In-plane DOFs are suppressed: this is a pure-bending study, and leaving
  // them free would admit membrane rigid-body motion in a strip restrained
  // only at one end.
  for (let k = 0; k < nodes.length; k += 1) { fixed.add(k * 5); fixed.add(k * 5 + 1); }
  const force = Array(dofCount).fill(0);
  for (let j = 0; j <= 1; j += 1) force[nodeId(elementsAlong, j) * 5 + 2] += tipLoad / 2;
  const free = [...Array(dofCount).keys()].filter((d) => !fixed.has(d));
  const solution = solveDense(
    free.map((r) => free.map((c) => global[r][c])),
    free.map((r) => force[r]),
  );
  const displacement = Array(dofCount).fill(0);
  free.forEach((d, i) => { displacement[d] = solution[i]; });
  return displacement[nodeId(elementsAlong, 0) * 5 + 2];
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

function normSquared(q) { return q.reduce((sum, value) => sum + value * value, 0); }

/** Deterministic pseudo-random trial vector — no Math.random(), so the check is reproducible. */
function deterministicVector(seed, length) {
  const out = [];
  let state = seed * 2654435761 + 1;
  for (let i = 0; i < length; i += 1) {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    out.push((state / 0x7fffffff) * 2 - 1);
  }
  return out;
}
