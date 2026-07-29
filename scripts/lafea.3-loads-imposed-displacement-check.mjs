import assert from 'node:assert/strict';
import { calculateLocalContinuum, createCanonicalLocalContinuumModel, QUALIFICATION_STATES } from '../src/core/local-continuum/index.js';
import { clone, triangleSource } from './lafea.3-fixtures.mjs';

// --- An imposed displacement on a DOF the model itself leaves free is
// reproduced exactly in the solved displacement for that load case only —
// proving it is genuinely load-case-scoped, not a model-wide restraint. ---
const model = triangleSource();
const imposedValue = 5;
model.loadCases.push({
  loadCaseId: 'IMPOSED', nodalForces: [], edgeTractions: [], pressureLoads: [], bodyForces: [], temperatureLoads: [],
  imposedDisplacements: [{
    imposedDisplacementId: 'D1', nodeId: 'C', dof: 'UX', value: imposedValue, sourceReference: 'IMPOSED#D1',
  }],
  sourceReference: 'CASE#IMPOSED',
});
model.resultRequests = { loadCaseIds: ['L1', 'IMPOSED'] };
const result = calculateLocalContinuum(createCanonicalLocalContinuumModel(model));
assert.equal(result.qualification.state, QUALIFICATION_STATES.ACCEPTED);
const imposedCase = result.loadCaseResults.find((row) => row.loadCaseId === 'IMPOSED');
const l1Case = result.loadCaseResults.find((row) => row.loadCaseId === 'L1');
const cImposed = imposedCase.nodalDisplacements.find((row) => row.nodeId === 'C');
close(cImposed.ux, imposedValue);
const cBaseline = l1Case.nodalDisplacements.find((row) => row.nodeId === 'C');
assert.ok(Math.abs(cBaseline.ux - imposedValue) > 1, 'the imposed displacement must not leak into an unrelated load case');

// --- An imposed displacement declared on a DOF that is already a
// model-level constraint is rejected — it must target a DOF the model
// itself leaves free, never silently override or duplicate a restraint. ---
const conflict = clone(model);
conflict.loadCases[conflict.loadCases.length - 1].imposedDisplacements = [{
  imposedDisplacementId: 'D2', nodeId: 'A', dof: 'UX', value: 1, sourceReference: 'IMPOSED#D2',
}];
assert.throws(
  () => createCanonicalLocalContinuumModel(conflict),
  /IMPOSED_DISPLACEMENT_CONFLICTS_WITH_MODEL_CONSTRAINT|already a model-level constraint/,
);

// --- Two imposed displacements targeting the same DOF in one load case
// are rejected as ambiguous, never silently resolved by picking one. ---
const duplicate = clone(model);
duplicate.loadCases[duplicate.loadCases.length - 1].imposedDisplacements = [
  { imposedDisplacementId: 'D3', nodeId: 'C', dof: 'UX', value: 1, sourceReference: 'IMPOSED#D3' },
  { imposedDisplacementId: 'D4', nodeId: 'C', dof: 'UX', value: 2, sourceReference: 'IMPOSED#D4' },
];
assert.throws(
  () => createCanonicalLocalContinuumModel(duplicate),
  /DUPLICATE_IMPOSED_DISPLACEMENT|Multiple imposed displacements/,
);

console.log('LAFEA.3 imposed-displacement load (per-load-case scoping, conflict/duplicate rejection) passed.');

function close(actual, expected) {
  assert.ok(Math.abs(actual - expected) <= 1e-8 * Math.max(1, Math.abs(expected)), `${actual} != ${expected}`);
}
