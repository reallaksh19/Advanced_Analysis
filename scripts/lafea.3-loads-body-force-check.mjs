import assert from 'node:assert/strict';
import { calculateLocalContinuum, createCanonicalLocalContinuumModel, QUALIFICATION_STATES } from '../src/core/local-continuum/index.js';
import { triangleSource } from './lafea.3-fixtures.mjs';

// --- T3: closed form. A uniform body force on a linear triangle integrates
// exactly to Area*thickness/3 per corner node (since the linear shape
// functions each average to 1/3 over the triangle). ---
const t3Model = triangleSource();
t3Model.loadCases = [{
  loadCaseId: 'GRAVITY', nodalForces: [], edgeTractions: [], pressureLoads: [],
  bodyForces: [{
    bodyForceId: 'BF1', elementId: 'E1', bx: 0, by: -1, sourceReference: 'BODYFORCE#BF1',
  }],
  temperatureLoads: [], imposedDisplacements: [], sourceReference: 'CASE#GRAVITY',
}];
t3Model.resultRequests = { loadCaseIds: ['GRAVITY'] };
const t3Result = calculateLocalContinuum(createCanonicalLocalContinuumModel(t3Model));
assert.equal(t3Result.qualification.state, QUALIFICATION_STATES.ACCEPTED);
const t3Contribution = t3Result.loadCaseResults[0].forceEvidence.contributions.find((row) => row.type === 'ELEMENT_BODY_FORCE');
const area = 100 * 100 / 2;
const thickness = 10;
const expectedShare = -1 * area * thickness / 3;
t3Contribution.forcePerNode.forEach((row) => {
  close(row[0], 0);
  close(row[1], expectedShare);
});

// --- T6 (straight-sided, midsides at exact edge midpoints): Gauss
// integration must exactly conserve the total resultant, since the shape
// functions partition unity everywhere (sum(N_i) = 1) and therefore
// sum(integral(N_i) dA) = integral(1) dA = Area exactly, an analytic
// invariant independent of how the load is distributed among the 6 nodes. ---
const t6Model = straightSidedT6Source();
const t6Result = calculateLocalContinuum(createCanonicalLocalContinuumModel(t6Model));
assert.equal(t6Result.qualification.state, QUALIFICATION_STATES.ACCEPTED);
const t6Contribution = t6Result.loadCaseResults[0].forceEvidence.contributions.find((row) => row.type === 'ELEMENT_BODY_FORCE');
const t6Area = 2; // right triangle legs 2,2
const t6Thickness = 1;
const totalY = t6Contribution.forcePerNode.reduce((sum, row) => sum + row[1], 0);
close(totalY, -1 * t6Area * t6Thickness);
// The quadratic distribution is not a naive equal 6-way split.
const shares = t6Contribution.forcePerNode.map((row) => row[1]);
assert.ok(new Set(shares.map((value) => value.toFixed(10))).size > 1, 'quadratic body-force distribution must not be a uniform per-node split');

console.log('LAFEA.3 body-force load (T3 closed form, T6 partition-of-unity conservation) passed.');

function straightSidedT6Source() {
  return {
    schema: 'local-continuum-model/v1', modelIdentity: 'T6_BODYFORCE', modelVersion: '1',
    sourceAncestry: { sourceModelIdentity: 'FIXTURE', sourceVersion: '1', adapterIdentity: 'LAFEA3_LOADS_TEST', adapterVersion: '1' },
    units: { length: 'mm', force: 'N', stress: 'MPa', modulus: 'MPa' },
    formulation: 'PLANE_STRESS',
    materials: [{ materialId: 'MAT', elasticModulus: 200000, poissonRatio: 0.3, sourceReference: 'MATERIAL#MAT' }],
    nodes: [
      n('A', 0, 0), n('B', 2, 0), n('C', 0, 2), n('D', 1, 0), n('E', 1, 1), n('F', 0, 1),
    ],
    elements: [{
      elementId: 'E1', elementType: 'T6', nodeIds: ['A', 'B', 'C', 'D', 'E', 'F'], materialId: 'MAT', thickness: 1, sourceReference: 'ELEMENT#E1',
    }],
    elementTypePolicy: { allowT3Fallback: false, sourceReference: 'T6_ONLY' },
    constraints: [c('A', 'UX'), c('A', 'UY'), c('B', 'UY'), c('D', 'UY')],
    loadCases: [{
      loadCaseId: 'GRAVITY', nodalForces: [], edgeTractions: [], pressureLoads: [],
      bodyForces: [{
        bodyForceId: 'BF1', elementId: 'E1', bx: 0, by: -1, sourceReference: 'BODYFORCE#BF1',
      }],
      temperatureLoads: [], imposedDisplacements: [], sourceReference: 'CASE#GRAVITY',
    }],
    resultRequests: { loadCaseIds: ['GRAVITY'] },
    qualificationProfile: {
      schema: 'local-continuum-qualification-profile/v1', identity: 'LOADS_TEST_PROFILE', tolerances: toleranceTable(),
    },
    limitations: [],
  };
}
function n(nodeId, x, y) { return { nodeId, x, y, sourceReference: `NODE#${nodeId}` }; }
function c(nodeId, dof) { return { constraintId: `${nodeId}-${dof}`, nodeId, dof, value: 0, sourceReference: `CONSTRAINT#${nodeId}-${dof}` }; }
function toleranceTable() {
  const tight = { absolute: 1e-9, relative: 1e-9 };
  const loose = { absolute: 1e-6, relative: 1e-6 };
  return {
    minimumElementArea: tight, stiffnessSymmetry: tight, constitutiveSymmetry: tight, choleskyPivot: tight,
    freeDofResidual: loose, reactionEquilibrium: loose, strainEnergy: loose, rigidBodyStrain: tight, patchTestStress: tight,
  };
}
function close(actual, expected) {
  assert.ok(Math.abs(actual - expected) <= 1e-8 * Math.max(1, Math.abs(expected)), `${actual} != ${expected}`);
}
