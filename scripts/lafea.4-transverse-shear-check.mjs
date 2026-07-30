import assert from 'node:assert/strict';
import { mitc4StiffnessMatrix, MITC4_FORMULATION, SHEAR_CORRECTION_FACTOR } from '../src/core/local-shell/mitc4-element.js';
import { MITC3_FORMULATION } from '../src/core/local-shell/mitc3-element.js';
import {
  PARABOLIC_PEAK_RATIO, recoverElementTransverseShear,
  requireTransverseShearCapableFormulation, TRANSVERSE_SHEAR_LAYER,
} from '../src/core/local-shell/transverse-shear-recovery.js';
import { FORMULATION as LEGACY_CST_DKT_FORMULATION } from '../src/core/local-shell/constants.js';

/**
 * LAFEA.4 / spec §8 transverse-shear recovery.
 *
 * The substantive test is an EQUILIBRIUM argument, not a shape check: for a
 * cantilever carrying a tip load P, the transverse shear force resultant
 * integrated across any section must equal P. That is a statement about
 * statics which holds independently of the discretization, so it genuinely
 * validates the recovered quantity rather than restating how it was
 * computed.
 */

const E = 200000;
const NU = 0;
const G = E / (2 * (1 + NU));
const D = [[E, 0, 0], [0, E, 0], [0, 0, E / 2]];
const span = 10;
const width = 1;
const tipLoad = 1;
const thickness = 0.1;
const along = 8;

// --- Capability gate: CST/DKT cannot produce transverse shear, and asking
// for it must be refused rather than answered with a fabricated zero. ---
assert.equal(requireTransverseShearCapableFormulation(MITC4_FORMULATION), MITC4_FORMULATION);
assert.equal(requireTransverseShearCapableFormulation(MITC3_FORMULATION), MITC3_FORMULATION);
assert.throws(
  () => requireTransverseShearCapableFormulation(LEGACY_CST_DKT_FORMULATION),
  /not recoverable from formulation|fabricated rather than recovered/,
);
console.log('✅ Transverse shear is refused for CST/DKT (Kirchhoff) and permitted for MITC3/MITC4.');

// --- Solve the cantilever, then recover shear element by element. ---
const { displacement, elements, nodes, nodeId } = solveCantilever();

// EQUILIBRIUM: total shear resultant across a section equals the tip load.
// Sample the elements in one column (a full section cut) and integrate
// q_x over the width using each element's own Gauss weights.
const sectionElements = elements.filter((element) => element.column === 4);
assert.ok(sectionElements.length > 0, 'expected elements at the sampled section');
let sectionShearForce = 0;
for (const element of sectionElements) {
  const local = element.dofMap.map((d) => displacement[d]);
  const recovered = recoverElementTransverseShear(
    {
      formulation: MITC4_FORMULATION,
      gaussEvidence: element.gaussEvidence,
      thickness,
      shearModulus: G,
    },
    local,
  );
  // Integrate q_x over the element's area, then divide by its length along
  // the span to obtain the force crossing the section it spans.
  let integrated = 0;
  recovered.forEach((point, index) => {
    const gp = element.gaussEvidence[index];
    integrated += point.forceResultantPerUnitWidth.qX * gp.weight * gp.jacobianDeterminant;
  });
  sectionShearForce += integrated / element.lengthAlongSpan;
}
// Magnitude is what equilibrium fixes; the sign follows the internal-force
// convention (the section shear resists the applied tip load, and the tip
// load here is applied in +w), so magnitudes are compared explicitly rather
// than an absolute value being taken to paper over an unexamined sign.
assert.ok(sectionShearForce > 0, `section shear should be positive for a +w tip load; got ${sectionShearForce}`);
const equilibriumError = Math.abs(Math.abs(sectionShearForce) - tipLoad) / tipLoad;
console.log(`   section shear resultant = ${sectionShearForce.toFixed(6)} vs applied tip load ${tipLoad}`);
assert.ok(
  equilibriumError < 0.02,
  `integrated transverse shear must balance the tip load within 2%; got ${(equilibriumError * 100).toFixed(3)}%`,
);
console.log(`✅ Equilibrium: integrated transverse shear balances the applied tip load to ${(equilibriumError * 100).toFixed(3)}%.`);

// --- Reported quantities are internally consistent and correctly named. ---
{
  const element = sectionElements[0];
  const local = element.dofMap.map((d) => displacement[d]);
  const recovered = recoverElementTransverseShear(
    {
      formulation: MITC4_FORMULATION, gaussEvidence: element.gaussEvidence, thickness, shearModulus: G,
    },
    local,
  );
  recovered.forEach((point) => {
    assert.equal(point.recoveryLayer, TRANSVERSE_SHEAR_LAYER);
    assert.equal(point.shearCorrectionFactor, SHEAR_CORRECTION_FACTOR);
    // stress = kappa * G * strain
    close(point.averageStress.tauXZ, SHEAR_CORRECTION_FACTOR * G * point.strain.gammaXZ);
    close(point.averageStress.tauYZ, SHEAR_CORRECTION_FACTOR * G * point.strain.gammaYZ);
    // resultant = stress * thickness
    close(point.forceResultantPerUnitWidth.qX, point.averageStress.tauXZ * thickness);
    // the parabolic peak is 3/2 of the average, and is reported separately
    close(point.parabolicPeakStress.tauXZ, PARABOLIC_PEAK_RATIO * point.averageStress.tauXZ);
    assert.notEqual(
      point.parabolicPeakStress.magnitude, point.averageStress.magnitude,
      'the parabolic peak must never be conflated with the through-thickness average',
    );
    assert.ok(Object.isFrozen(point) && Object.isFrozen(point.averageStress));
  });
  console.log('✅ Average stress, parabolic peak and force resultant are consistent, distinct and frozen.');
}

console.log('\n✅ LAFEA.4 transverse-shear recovery check passed.');

function solveCantilever() {
  const nodes = [];
  for (let j = 0; j <= 1; j += 1) {
    for (let i = 0; i <= along; i += 1) nodes.push([i * span / along, j * width]);
  }
  const nodeId = (i, j) => j * (along + 1) + i;
  const dofCount = nodes.length * 5;
  const global = Array.from({ length: dofCount }, () => Array(dofCount).fill(0));
  const elements = [];
  for (let i = 0; i < along; i += 1) {
    const ids = [nodeId(i, 0), nodeId(i + 1, 0), nodeId(i + 1, 1), nodeId(i, 1)];
    const { stiffness, gaussEvidence } = mitc4StiffnessMatrix(ids.map((k) => nodes[k]), D, thickness, G);
    const dofMap = ids.flatMap((k) => [0, 1, 2, 3, 4].map((d) => k * 5 + d));
    for (let a = 0; a < 20; a += 1) {
      for (let c = 0; c < 20; c += 1) global[dofMap[a]][dofMap[c]] += stiffness[a][c];
    }
    elements.push({
      column: i, dofMap, gaussEvidence, lengthAlongSpan: span / along,
    });
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
  return {
    displacement, elements, nodes, nodeId,
  };
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

function close(actual, expected) {
  assert.ok(
    Math.abs(actual - expected) <= 1e-9 * Math.max(1, Math.abs(expected)),
    `${actual} != ${expected}`,
  );
}
