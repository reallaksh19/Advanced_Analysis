import assert from 'node:assert/strict';
import { calculateLocalContinuum, createCanonicalLocalContinuumModel, QUALIFICATION_STATES } from '../src/core/local-continuum/index.js';
import { clone, patchSource } from './lafea.3-fixtures.mjs';

// --- Pressure on a straight T3 edge reduces exactly to the equivalent
// declared traction (outward normal of edge B->C on E2=[B,C,D] is +x, so
// pressure=-sigma reproduces the existing TRACTION fixture's tx=sigma). ---
const sigma = 10;
const tractionModel = patchSource({ sigma });
const pressureModel = clone(tractionModel);
pressureModel.loadCases = [{
  loadCaseId: 'PRESSURE', nodalForces: [], edgeTractions: [],
  pressureLoads: [{
    pressureLoadId: 'P1', elementId: 'E2', edgeNodeIds: ['B', 'C'], pressure: -sigma, sourceReference: 'PRESSURE#P1',
  }],
  bodyForces: [], temperatureLoads: [], imposedDisplacements: [], sourceReference: 'CASE#PRESSURE',
}];
pressureModel.resultRequests = { loadCaseIds: ['PRESSURE'] };

const tractionResult = calculateLocalContinuum(createCanonicalLocalContinuumModel(tractionModel));
const pressureResult = calculateLocalContinuum(createCanonicalLocalContinuumModel(pressureModel));
assert.equal(tractionResult.qualification.state, QUALIFICATION_STATES.ACCEPTED);
assert.equal(pressureResult.qualification.state, QUALIFICATION_STATES.ACCEPTED);
const tractionCase = tractionResult.loadCaseResults.find((row) => row.loadCaseId === 'TRACTION');
const pressureCase = pressureResult.loadCaseResults.find((row) => row.loadCaseId === 'PRESSURE');
tractionCase.nodalDisplacements.forEach((row, index) => {
  close(pressureCase.nodalDisplacements[index].ux, row.ux);
  close(pressureCase.nodalDisplacements[index].uy, row.uy);
});

// --- A curved (bowed) T6 boundary edge under pressure is integrated over
// its true quadratic shape, not its 2-node corner chord: per-node forces
// must match an independently-written 3-point Gauss reference (computed
// from scratch in this script, not by calling the production code), and
// the midside node must carry a genuinely nonzero share (a naive 2-node
// treatment would silently drop it to zero). The NET resultant, by a
// vector-calculus identity (integral of a constant-magnitude normal over
// any path between two fixed endpoints depends only on the endpoints), is
// independent of the curvature — so it is checked separately against the
// exact closed form `pressure * chordLength * thickness`. ---
const t6Model = curvedT6PressureSource();
const t6Result = calculateLocalContinuum(createCanonicalLocalContinuumModel(t6Model));
assert.equal(t6Result.qualification.state, QUALIFICATION_STATES.ACCEPTED);
const contribution = t6Result.loadCaseResults[0].forceEvidence.contributions.find((row) => row.type === 'BOUNDARY_EDGE_PRESSURE');

const nodesById = new Map(t6Model.nodes.map((row) => [row.nodeId, row]));
const sequence = ['B', 'E', 'C'].map((id) => nodesById.get(id));
const referenceForces = referenceGaussPressure(sequence, 5, 1);
contribution.forcePerNode.forEach((row, i) => {
  close(row[0], referenceForces[i][0]);
  close(row[1], referenceForces[i][1]);
});
assert.ok(Math.hypot(contribution.forcePerNode[1][0], contribution.forcePerNode[1][1]) > 1, 'midside node must carry a genuinely nonzero share of a curved-edge pressure load');

const totalForce = contribution.forcePerNode.reduce((sum, row) => [sum[0] + row[0], sum[1] + row[1]], [0, 0]);
const chordLength = Math.hypot(sequence[2].x - sequence[0].x, sequence[2].y - sequence[0].y);
close(Math.hypot(totalForce[0], totalForce[1]), 5 * chordLength * 1);

console.log('LAFEA.3 pressure load (traction equivalence, curved-edge Gauss integration) passed.');

function curvedT6PressureSource() {
  return {
    schema: t6Model_schema(), modelIdentity: 'T6_PRESSURE', modelVersion: '1',
    sourceAncestry: { sourceModelIdentity: 'FIXTURE', sourceVersion: '1', adapterIdentity: 'LAFEA3_LOADS_TEST', adapterVersion: '1' },
    units: { length: 'mm', force: 'N', stress: 'MPa', modulus: 'MPa' },
    formulation: 'PLANE_STRESS',
    materials: [{ materialId: 'MAT', elasticModulus: 200000, poissonRatio: 0.3, sourceReference: 'MATERIAL#MAT' }],
    nodes: [
      n('A', 0, 0), n('B', 2, 0), n('C', 0, 2), n('D', 1, 0), n('E', 1.3, 1.3), n('F', 0, 1),
    ],
    elements: [{
      elementId: 'E1', elementType: 'T6', nodeIds: ['A', 'B', 'C', 'D', 'E', 'F'], materialId: 'MAT', thickness: 1, sourceReference: 'ELEMENT#E1',
    }],
    elementTypePolicy: { allowT3Fallback: false, sourceReference: 'T6_ONLY' },
    constraints: [c('A', 'UX'), c('A', 'UY'), c('B', 'UY'), c('D', 'UY')],
    loadCases: [{
      loadCaseId: 'L1', nodalForces: [], edgeTractions: [],
      pressureLoads: [{
        pressureLoadId: 'P1', elementId: 'E1', edgeNodeIds: ['B', 'C', 'E'], pressure: 5, sourceReference: 'PRESSURE#P1',
      }],
      bodyForces: [], temperatureLoads: [], imposedDisplacements: [], sourceReference: 'CASE#L1',
    }],
    resultRequests: { loadCaseIds: ['L1'] },
    qualificationProfile: {
      schema: 'local-continuum-qualification-profile/v1', identity: 'LOADS_TEST_PROFILE', tolerances: toleranceTable(),
    },
    limitations: [],
  };
}
function t6Model_schema() { return 'local-continuum-model/v1'; }
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
function referenceGaussPressure(nodes, pressure, thickness) {
  const gauss = [{ s: -Math.sqrt(3 / 5), w: 5 / 9 }, { s: 0, w: 8 / 9 }, { s: Math.sqrt(3 / 5), w: 5 / 9 }];
  const forces = nodes.map(() => [0, 0]);
  gauss.forEach((gp) => {
    const { s } = gp;
    const N = [s * (s - 1) / 2, 1 - s * s, s * (s + 1) / 2];
    const dNds = [s - 0.5, -2 * s, s + 0.5];
    let dxds = 0; let dyds = 0;
    nodes.forEach((node, i) => { dxds += dNds[i] * node.x; dyds += dNds[i] * node.y; });
    const jac = Math.hypot(dxds, dyds);
    const nx = dyds / jac; const ny = -dxds / jac;
    const tx = -pressure * nx; const ty = -pressure * ny;
    N.forEach((value, i) => {
      forces[i][0] += gp.w * value * tx * jac * thickness;
      forces[i][1] += gp.w * value * ty * jac * thickness;
    });
  });
  return forces;
}
function close(actual, expected) {
  assert.ok(Math.abs(actual - expected) <= 1e-8 * Math.max(1, Math.abs(expected)), `${actual} != ${expected}`);
}
