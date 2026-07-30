import assert from 'node:assert/strict';
import { mitc4StiffnessMatrix, SHEAR_CORRECTION_FACTOR } from '../src/core/local-shell/mitc4-element.js';
import { mitc3StiffnessMatrix } from '../src/core/local-shell/mitc3-element.js';

/**
 * SHELL-BEND-01 (spec §17.4 benchmark catalogue): pure bending and the
 * absence of artificial stiffening.
 *
 * Two distinct properties are established, because "it does not lock" and
 * "it gets bending right" are different claims:
 *
 *  1. PURE BENDING ACCURACY. A cantilever under a TIP MOMENT deforms into a
 *     state of constant curvature, for which the exact answers are
 *     w_tip = M*L^2/(2*E*I) and theta_tip = M*L/(E*I) with no shear
 *     contribution at all. This is the sharpest bending test available: any
 *     spurious shear energy shows up immediately as a deficit, and there is
 *     no shear term in the reference to absorb it.
 *
 *  2. NO ARTIFICIAL STIFFENING ACROSS SLENDERNESS. The same model is run
 *     over four decades of thickness/span. A locking element's normalized
 *     deflection decays toward zero as t/L falls; a correct one holds a
 *     constant ratio.
 *
 * Both MITC4 and the MITC3 fallback are run, so the triangular path is held
 * to the same standard rather than being assumed adequate.
 */

const E = 200000;
const NU = 0; // plane-stress D11 == E, so beam theory applies with no ambiguity
const G = E / (2 * (1 + NU));
const D = [[E, 0, 0], [0, E, 0], [0, 0, E / 2]];
const SPAN = 10;
const WIDTH = 1;
const TIP_MOMENT = 1;
const ALONG = 8;

for (const formulation of ['MITC4', 'MITC3']) {
  console.log(`\n--- ${formulation} ---`);

  // 1. Pure bending under a tip moment: exact constant-curvature state.
  const thickness = 0.1;
  const inertia = WIDTH * thickness ** 3 / 12;
  const exactTipDeflection = TIP_MOMENT * SPAN ** 2 / (2 * E * inertia);
  const exactTipRotation = TIP_MOMENT * SPAN / (E * inertia);
  const { tipDeflection, tipRotation } = solveTipMoment(formulation, thickness);
  const deflectionRatio = Math.abs(tipDeflection) / exactTipDeflection;
  const rotationRatio = tipRotation / exactTipRotation;
  console.log(`   tip deflection ${tipDeflection.toExponential(5)} vs exact magnitude ${exactTipDeflection.toExponential(5)}  ratio ${deflectionRatio.toFixed(6)}`);
  console.log(`   tip rotation   ${tipRotation.toExponential(5)} vs exact ${exactTipRotation.toExponential(5)}  ratio ${rotationRatio.toFixed(6)}`);
  assert.ok(
    Math.abs(rotationRatio - 1) < 1e-9,
    `${formulation}: constant-curvature rotation must be essentially exact; ratio was ${rotationRatio}`,
  );
  assert.ok(
    Math.abs(deflectionRatio - 1) < 0.01,
    `${formulation}: pure-bending tip deflection magnitude must be within 1% of exact; ratio was ${deflectionRatio}`,
  );
  // Sign is fixed by this module's kinematics, not free: zero transverse
  // shear means gamma_xz = betaX + dw/dx = 0, so dw/dx = -betaX and a
  // POSITIVE tip rotation necessarily gives a NEGATIVE w. For the exact
  // constant-curvature state that tightens to w_tip = -theta_tip*L/2, which
  // is asserted here rather than absorbed by taking an absolute value.
  const kinematicDeflection = -tipRotation * SPAN / 2;
  assert.ok(
    Math.abs(tipDeflection - kinematicDeflection) <= 1e-9 * Math.abs(kinematicDeflection),
    `${formulation}: w_tip must equal -theta_tip*L/2 exactly (zero-shear kinematics); got ${tipDeflection} vs ${kinematicDeflection}`,
  );
  console.log(`   ✅ pure bending: rotation exact to ${Math.abs(rotationRatio - 1).toExponential(2)}, |deflection| within ${(Math.abs(deflectionRatio - 1) * 100).toFixed(6)}%, and w_tip = -theta_tip*L/2 exactly`);

  // 2. No artificial stiffening as the shell gets thinner.
  //
  // What distinguishes locking is a SYSTEMATIC one-directional decay of the
  // normalized deflection as t/L falls. It is not the same as scatter: at
  // extreme slenderness the bending stiffness scales as t^3 while the shear
  // stiffness scales as t, so the assembled matrix conditions as ~1/t^2 and
  // this benchmark's dense reference solver loses digits to round-off. That
  // round-off is non-monotonic in sign, which is exactly how it is told
  // apart from locking below: a tight bound is applied over the
  // well-conditioned range, and the no-systematic-decay property is asserted
  // over the full range.
  const thicknesses = [1, 0.1, 0.01, 0.001, 0.0001];
  const ratios = thicknesses.map((t) => {
    const I = WIDTH * t ** 3 / 12;
    const exact = TIP_MOMENT * SPAN ** 2 / (2 * E * I);
    return Math.abs(solveTipMoment(formulation, t).tipDeflection) / exact;
  });
  console.log(`   slenderness sweep ratios: ${ratios.map((r) => r.toFixed(6)).join(', ')}`);

  // Well-conditioned range (t/L down to 1e-4): accuracy must be essentially
  // thickness-independent.
  const wellConditioned = ratios.slice(0, 4);
  const conditionedSpread = Math.max(...wellConditioned) - Math.min(...wellConditioned);
  assert.ok(
    conditionedSpread < 1e-5,
    `${formulation}: accuracy must be thickness-independent over the well-conditioned range; spread was ${conditionedSpread.toExponential(3)}`,
  );

  // Full range: no systematic stiffening. A locking element's ratio falls
  // monotonically and materially below 1; scatter from round-off does not.
  ratios.forEach((ratio, index) => {
    assert.ok(
      ratio > 0.999 && ratio < 1.001,
      `${formulation}: t/L level ${thicknesses[index] / SPAN} ratio ${ratio} indicates artificial stiffening`,
    );
  });
  assert.ok(
    ratios[ratios.length - 1] >= ratios[0] - 1e-3,
    `${formulation}: the thinnest case must not be systematically stiffer than the thickest (locking signature); ${ratios[ratios.length - 1]} vs ${ratios[0]}`,
  );
  console.log(`   ✅ no artificial stiffening: spread ${conditionedSpread.toExponential(2)} over the well-conditioned range, no systematic decay across 1e-1..1e-5 thickness/span`);
}

console.log('\n✅ LAFEA.4 SHELL-BEND-01 benchmark passed.');

/**
 * Cantilever under a pure tip moment, applied as a couple on the tip
 * rotational DOFs. Returns tip transverse displacement and tip rotation.
 */
function solveTipMoment(formulation, thickness) {
  const nodes = [];
  for (let j = 0; j <= 1; j += 1) {
    for (let i = 0; i <= ALONG; i += 1) nodes.push([i * SPAN / ALONG, j * WIDTH]);
  }
  const nodeId = (i, j) => j * (ALONG + 1) + i;
  const dofCount = nodes.length * 5;
  const global = Array.from({ length: dofCount }, () => Array(dofCount).fill(0));

  const cells = [];
  for (let i = 0; i < ALONG; i += 1) {
    if (formulation === 'MITC4') {
      cells.push([nodeId(i, 0), nodeId(i + 1, 0), nodeId(i + 1, 1), nodeId(i, 1)]);
    } else {
      cells.push([nodeId(i, 0), nodeId(i + 1, 0), nodeId(i + 1, 1)]);
      cells.push([nodeId(i, 0), nodeId(i + 1, 1), nodeId(i, 1)]);
    }
  }
  for (const ids of cells) {
    const coordinates = ids.map((k) => nodes[k]);
    const { stiffness } = formulation === 'MITC4'
      ? mitc4StiffnessMatrix(coordinates, D, thickness, G)
      : mitc3StiffnessMatrix(coordinates, D, thickness, G);
    const size = ids.length * 5;
    const map = ids.flatMap((k) => [0, 1, 2, 3, 4].map((d) => k * 5 + d));
    for (let a = 0; a < size; a += 1) {
      for (let c = 0; c < size; c += 1) global[map[a]][map[c]] += stiffness[a][c];
    }
  }

  const fixed = new Set();
  for (let j = 0; j <= 1; j += 1) {
    const k = nodeId(0, j);
    [0, 1, 2, 3, 4].forEach((d) => fixed.add(k * 5 + d));
  }
  // Pure-bending study: in-plane DOFs suppressed so the strip has no
  // membrane rigid-body freedom.
  for (let k = 0; k < nodes.length; k += 1) { fixed.add(k * 5); fixed.add(k * 5 + 1); }

  // A tip moment about the width axis is applied through betaX (index 3),
  // split evenly across the two tip nodes.
  const force = Array(dofCount).fill(0);
  for (let j = 0; j <= 1; j += 1) force[nodeId(ALONG, j) * 5 + 3] += TIP_MOMENT / 2;

  const free = [...Array(dofCount).keys()].filter((d) => !fixed.has(d));
  const solution = solveDense(
    free.map((r) => free.map((c) => global[r][c])),
    free.map((r) => force[r]),
  );
  const displacement = Array(dofCount).fill(0);
  free.forEach((d, i) => { displacement[d] = solution[i]; });
  return {
    tipDeflection: displacement[nodeId(ALONG, 0) * 5 + 2],
    tipRotation: displacement[nodeId(ALONG, 0) * 5 + 3],
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

// Referenced for provenance: the shear correction factor plays no role in a
// pure-bending reference, which is precisely why this benchmark isolates
// bending behaviour so sharply.
void SHEAR_CORRECTION_FACTOR;
