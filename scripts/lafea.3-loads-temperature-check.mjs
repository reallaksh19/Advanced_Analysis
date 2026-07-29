import assert from 'node:assert/strict';
import { calculateLocalContinuum, createCanonicalLocalContinuumModel, QUALIFICATION_STATES } from '../src/core/local-continuum/index.js';
import { triangleSource } from './lafea.3-fixtures.mjs';

// --- A single minimally-restrained (rigid-body-only) element under a pure
// uniform thermal strain and no other load must be free to expand: the
// recovered mechanical strain equals the free thermal strain exactly, and
// the recovered stress is (to solver tolerance) zero — a self-equilibrated
// system develops no stress from unconstrained uniform expansion. ---
const thermalStrain = 0.001;

const t3Model = triangleSource();
t3Model.loadCases = [{
  loadCaseId: 'THERMAL', nodalForces: [], edgeTractions: [], pressureLoads: [], bodyForces: [],
  temperatureLoads: [{
    temperatureLoadId: 'T1', elementId: 'E1', thermalStrain, sourceReference: 'THERMAL#T1',
  }],
  imposedDisplacements: [], sourceReference: 'CASE#THERMAL',
}];
t3Model.resultRequests = { loadCaseIds: ['THERMAL'] };
const t3Result = calculateLocalContinuum(createCanonicalLocalContinuumModel(t3Model));
assert.equal(t3Result.qualification.state, QUALIFICATION_STATES.ACCEPTED);
const t3Element = t3Result.loadCaseResults[0].elementResults[0];
close(t3Element.strain.epsilonX, thermalStrain);
close(t3Element.strain.epsilonY, thermalStrain);
tiny(t3Element.strain.gammaXY);
tiny(t3Element.stress.sigmaX);
tiny(t3Element.stress.sigmaY);
tiny(t3Element.stress.tauXY);

// --- Same free-expansion check for a T6 element (per-Gauss-point recovery). ---
const t6Model = t6ThermalSource();
const t6Result = calculateLocalContinuum(createCanonicalLocalContinuumModel(t6Model));
assert.equal(t6Result.qualification.state, QUALIFICATION_STATES.ACCEPTED);
const t6Element = t6Result.loadCaseResults[0].elementResults[0];
t6Element.gaussPointResults.forEach((gp) => {
  close(gp.strain.epsilonX, thermalStrain);
  close(gp.strain.epsilonY, thermalStrain);
  tiny(gp.strain.gammaXY);
  tiny(gp.stress.sigmaX);
  tiny(gp.stress.sigmaY);
  tiny(gp.stress.tauXY);
});

console.log('LAFEA.3 temperature (thermal-strain) load — free-expansion zero-stress check passed for T3 and T6.');

function t6ThermalSource() {
  return {
    schema: 'local-continuum-model/v1', modelIdentity: 'T6_THERMAL', modelVersion: '1',
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
      loadCaseId: 'THERMAL', nodalForces: [], edgeTractions: [], pressureLoads: [], bodyForces: [],
      temperatureLoads: [{
        temperatureLoadId: 'T1', elementId: 'E1', thermalStrain, sourceReference: 'THERMAL#T1',
      }],
      imposedDisplacements: [], sourceReference: 'CASE#THERMAL',
    }],
    resultRequests: { loadCaseIds: ['THERMAL'] },
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
  assert.ok(Math.abs(actual - expected) <= 1e-6 * Math.max(1, Math.abs(expected)), `${actual} != ${expected}`);
}
function tiny(value) {
  assert.ok(Math.abs(value) <= 1e-6, `expected near-zero, got ${value}`);
}
