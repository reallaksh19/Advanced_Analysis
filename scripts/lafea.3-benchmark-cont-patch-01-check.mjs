import assert from 'node:assert/strict';
import { calculateLocalContinuum, createCanonicalLocalContinuumModel, QUALIFICATION_STATES } from '../src/core/local-continuum/index.js';

/**
 * CONT-PATCH-01 (spec §17.4 patch-test catalogue): the classical multi-
 * element FEM patch test, elevated to the default quadratic (Q8) element.
 * Two Q8 elements share an internal edge (and its midside node) forming a
 * 100x100 square from two 50x100 halves. Every node on the OUTER boundary
 * is prescribed the affine field `ux = epsX*x, uy = epsY*y`; the single
 * interior shared node `F` at (50,50) is left completely free. Since this
 * affine field satisfies equilibrium exactly for any conforming mesh, the
 * solve must reproduce it exactly at F (a node no boundary condition ever
 * touches) and every Gauss point in both elements must report the uniform
 * constitutive stress `D*[epsX,epsY,0]` to <=1e-10 relative (spec §17.4) -
 * proving assembled compatibility across a genuine shared quadratic edge,
 * not just single-element formulation correctness (already covered by
 * `lafea.3-q8-patch-check.mjs`).
 */
const epsX = 0.001;
const epsY = -0.0003;
const E = 200000;
const nu = 0.3;
const thickness = 10;

const nodes = [
  n('A', 0, 0), n('B', 50, 0), n('C', 50, 100), n('D', 0, 100),
  n('E', 25, 0), n('F', 50, 50), n('G', 25, 100), n('H', 0, 50),
  n('I', 100, 0), n('J', 100, 100), n('K', 75, 0), n('L', 100, 50), n('M', 75, 100),
];

const model = {
  schema: 'local-continuum-model/v1', modelIdentity: 'CONT_PATCH_01', modelVersion: '1',
  sourceAncestry: { sourceModelIdentity: 'BENCHMARK', sourceVersion: '1', adapterIdentity: 'LAFEA3_BENCHMARK', adapterVersion: '1' },
  units: { length: 'mm', force: 'N', stress: 'MPa', modulus: 'MPa' },
  formulation: 'PLANE_STRESS',
  materials: [{ materialId: 'MAT', elasticModulus: E, poissonRatio: nu, sourceReference: 'MATERIAL#MAT' }],
  nodes,
  elements: [
    {
      elementId: 'E1', elementType: 'Q8', nodeIds: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'], materialId: 'MAT', thickness, sourceReference: 'ELEMENT#E1',
    },
    {
      elementId: 'E2', elementType: 'Q8', nodeIds: ['B', 'I', 'J', 'C', 'K', 'L', 'M', 'F'], materialId: 'MAT', thickness, sourceReference: 'ELEMENT#E2',
    },
  ],
  elementTypePolicy: { allowT3Fallback: false, sourceReference: 'CONT_PATCH_01_Q8_DEFAULT' },
  constraints: nodes.filter((row) => row.nodeId !== 'F').flatMap((row) => [
    c(row.nodeId, 'UX', epsX * row.x),
    c(row.nodeId, 'UY', epsY * row.y),
  ]),
  loadCases: [{
    loadCaseId: 'AFFINE', nodalForces: [], edgeTractions: [], pressureLoads: [], bodyForces: [], temperatureLoads: [], imposedDisplacements: [], sourceReference: 'CASE#AFFINE',
  }],
  resultRequests: { loadCaseIds: ['AFFINE'] },
  qualificationProfile: {
    schema: 'local-continuum-qualification-profile/v1', identity: 'BENCHMARK_TIGHT_PROFILE', tolerances: toleranceTable(),
  },
  limitations: [],
};

const result = calculateLocalContinuum(createCanonicalLocalContinuumModel(model));
assert.equal(result.qualification.state, QUALIFICATION_STATES.ACCEPTED);
const loadCase = result.loadCaseResults[0];

const fDisplacement = loadCase.nodalDisplacements.find((row) => row.nodeId === 'F');
exact(fDisplacement.ux, epsX * 50);
exact(fDisplacement.uy, epsY * 50);

const D11 = E / (1 - nu ** 2);
const expectedSigmaX = D11 * (epsX + nu * epsY);
const expectedSigmaY = D11 * (epsY + nu * epsX);
assert.equal(loadCase.elementResults.length, 2);
loadCase.elementResults.forEach((element) => {
  assert.equal(element.gaussPointResults.length, 9);
  element.gaussPointResults.forEach((gp) => {
    exact(gp.stress.sigmaX, expectedSigmaX);
    exact(gp.stress.sigmaY, expectedSigmaY);
    exact(gp.stress.tauXY, 0);
    exact(gp.strain.epsilonX, epsX);
    exact(gp.strain.epsilonY, epsY);
    exact(gp.strain.gammaXY, 0);
  });
});

console.log('LAFEA.3 CONT-PATCH-01 benchmark (assembled Q8 patch, shared midside node) passed.');

function n(nodeId, x, y) { return { nodeId, x, y, sourceReference: `NODE#${nodeId}` }; }
function c(nodeId, dof, value) {
  return {
    constraintId: `${nodeId}-${dof}`, nodeId, dof, value, sourceReference: `CONSTRAINT#${nodeId}-${dof}`,
  };
}
function toleranceTable() {
  const tight = { absolute: 1e-9, relative: 1e-9 };
  const loose = { absolute: 1e-6, relative: 1e-6 };
  return {
    minimumElementArea: tight, stiffnessSymmetry: tight, constitutiveSymmetry: tight, choleskyPivot: tight,
    freeDofResidual: loose, reactionEquilibrium: loose, strainEnergy: loose, rigidBodyStrain: tight, patchTestStress: tight,
  };
}
function exact(actual, expected) {
  assert.ok(Math.abs(actual - expected) <= 1e-10 * Math.max(1, Math.abs(expected)), `${actual} != ${expected} (spec Section17.4 <=1e-10 relative)`);
}
