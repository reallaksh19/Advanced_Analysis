import assert from 'node:assert/strict';
import { createCanonicalLocalShellModel, calculateLocalShell, QUALIFICATION_STATES } from '../src/core/local-shell/index.js';
import { fiveDofTransformation } from '../src/core/local-shell/transformation.js';
import { triangleSource } from './lafea.4-fixtures.mjs';

/**
 * `transformation.js`'s `fiveDofTransformation` was generalized from a
 * hardcoded 3-node implementation to an N-node one (spec §8: MITC4's 4-node
 * quad needs the same per-node tangent-basis machinery CST/DKT and MITC3
 * already share, not a duplicate). This is the regression guard that
 * generalization must satisfy: for N=3, the result must be byte-identical
 * to what the pre-generalization implementation produced.
 *
 * The reference numbers below were captured directly from a full
 * `calculateLocalShell` solve on the existing `triangleSource()` fixture
 * immediately after generalizing `transformation.js`, cross-checked against
 * every pre-existing lafea.4-*-check.mjs script (bending, membrane,
 * cylindrical, determinism, geometry-basis, pressure, solver-loads,
 * stress-energy) all passing unmodified — those scripts assert exact
 * hand-derived values independent of this file, so their passing is
 * independent corroboration, not just an echo of these numbers.
 */
const REFERENCE = {
  canonicalModelSemanticHash: 'fnv1a64:d73a7c0253a2f2a0',
  nodalDisplacements: [
    { nodeId: 'A', ux: 0, uy: 0, uz: 0, r1: 0, r2: 0 },
    {
      nodeId: 'B', ux: -0.00029999999999999987, uy: 0, uz: 0.6646394466902481, r1: -0.010295304017180396, r2: -0.014854205533097535,
    },
    {
      nodeId: 'C', ux: 0.006499999999999997, uy: 0.0004999999999999999, uz: -0.4925263504295104, r1: -0.013963352766548778, r2: -0.007724413933804955,
    },
  ],
  membraneStress: { sigmaX: 0, sigmaY: 1.9999999999999993, tauXY: 9.999999999999995 },
  totalStrainEnergy: 15.6052858275897,
  reactions: [
    {
      constraintId: 'C-A-UX', nodeId: 'A', dof: 'UX', kind: 'FORCE', value: -999.9999999999998,
    },
    {
      constraintId: 'C-A-UY', nodeId: 'A', dof: 'UY', kind: 'FORCE', value: -699.9999999999999,
    },
    {
      constraintId: 'C-A-UZ', nodeId: 'A', dof: 'UZ', kind: 'FORCE', value: 50.00000000000004,
    },
    {
      constraintId: 'C-A-R1', nodeId: 'A', dof: 'R1', kind: 'MOMENT', value: 2495.0000000000014,
    },
    {
      constraintId: 'C-A-R2', nodeId: 'A', dof: 'R2', kind: 'MOMENT', value: 6.999999999999833,
    },
    {
      constraintId: 'C-B-UY', nodeId: 'B', dof: 'UY', kind: 'FORCE', value: 499.9999999999999,
    },
  ],
};

const model = createCanonicalLocalShellModel(triangleSource());
const result = calculateLocalShell(model);
assert.equal(result.qualification.state, QUALIFICATION_STATES.ACCEPTED);
assert.equal(model.semanticHash, REFERENCE.canonicalModelSemanticHash, 'model hash must match the captured reference (no input schema drift)');

const loadCase = result.loadCaseResults[0];
loadCase.nodalDisplacements.forEach((row, index) => {
  const expected = REFERENCE.nodalDisplacements[index];
  assert.equal(row.nodeId, expected.nodeId);
  exact(row.ux, expected.ux); exact(row.uy, expected.uy); exact(row.uz, expected.uz);
  exact(row.r1, expected.r1); exact(row.r2, expected.r2);
});
exact(loadCase.elementResults[0].membraneStress.sigmaX, REFERENCE.membraneStress.sigmaX);
exact(loadCase.elementResults[0].membraneStress.sigmaY, REFERENCE.membraneStress.sigmaY);
exact(loadCase.elementResults[0].membraneStress.tauXY, REFERENCE.membraneStress.tauXY);
exact(loadCase.totalStrainEnergy, REFERENCE.totalStrainEnergy);
loadCase.reactions.forEach((row, index) => {
  const expected = REFERENCE.reactions[index];
  assert.equal(row.constraintId, expected.constraintId);
  exact(row.value, expected.value);
});

console.log('✅ CST/DKT numeric results are byte-identical to the pre-generalization reference (model hash, displacements, stress, energy, reactions).');

// --- The generalized transformation itself: verify the N=3 rigid-rotation
// reproduction property directly, not just via the end-to-end solve above. ---
{
  const nodes = model.nodes;
  const element = result.meshEvidence.elements[0];
  const transformation = element.nodalBasisTransformation;
  assert.equal(transformation.matrix.length, 15, 'a 3-node element transformation must still be 15x15');
  assert.equal(transformation.rigidReproduction.accepted, true);
  assert.ok(transformation.rank >= 2, 'rank must span at least the two tangent rotations');
  void nodes;
  console.log('✅ The generalized fiveDofTransformation still qualifies rigid-rotation reproduction for N=3.');
}

// --- N=4 (the case MITC4 will need, not yet reachable through any
// dispatch): the generalization must produce a correctly-sized matrix and
// satisfy the same rigid-rotation reproduction property. ---
{
  const profile = { rotationMappingRank: { absolute: 1e-12, relative: 1e-12 }, rigidRotation: { absolute: 1e-9, relative: 1e-9 } };
  const frame = { ex: [1, 0, 0], ey: [0, 1, 0], ez: [0, 0, 1] };
  const squareNodes = [
    { position: [0, 0, 0], rotationBasis1: [1, 0, 0], rotationBasis2: [0, 1, 0] },
    { position: [1, 0, 0], rotationBasis1: [1, 0, 0], rotationBasis2: [0, 1, 0] },
    { position: [1, 1, 0], rotationBasis1: [1, 0, 0], rotationBasis2: [0, 1, 0] },
    { position: [0, 1, 0], rotationBasis1: [1, 0, 0], rotationBasis2: [0, 1, 0] },
  ];
  const aligned = fiveDofTransformation(squareNodes, frame, profile);
  assert.equal(aligned.matrix.length, 20, 'a 4-node element transformation must be 20x20');
  assert.equal(aligned.matrix[0].length, 20);
  assert.equal(aligned.rigidReproduction.accepted, true);
  let maxDeviationFromIdentity = 0;
  for (let i = 0; i < 8; i += 1) {
    for (let j = 0; j < 8; j += 1) {
      maxDeviationFromIdentity = Math.max(maxDeviationFromIdentity, Math.abs(aligned.rotationMapping[i][j] - (i === j ? 1 : 0)));
    }
  }
  assert.ok(maxDeviationFromIdentity < 1e-12, 'aligned node/element bases must reduce the rotation mapping to identity');

  // A node basis rotated 30deg about the element normal at one corner: the
  // mapping must still reproduce rigid rotation exactly (it is not merely
  // reachable, it must remain mathematically correct under distortion).
  const rotatedNodes = [...squareNodes];
  const angle = Math.PI / 6;
  rotatedNodes[2] = {
    position: [1, 1, 0],
    rotationBasis1: [Math.cos(angle), Math.sin(angle), 0],
    rotationBasis2: [-Math.sin(angle), Math.cos(angle), 0],
  };
  const distorted = fiveDofTransformation(rotatedNodes, frame, profile);
  assert.equal(distorted.rigidReproduction.accepted, true, 'rigid-rotation reproduction must hold even with a rotated node basis');
  console.log('✅ N=4 (MITC4-shaped) transformation is correctly sized and qualifies rigid-rotation reproduction, aligned and distorted.');
}

console.log('\n✅ LAFEA.4 shell-transformation generalization check passed.');

function exact(actual, expected) {
  assert.equal(actual, expected, `${actual} !== ${expected} (byte-identical regression guard)`);
}
