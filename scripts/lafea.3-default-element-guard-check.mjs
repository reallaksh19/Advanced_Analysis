import assert from 'node:assert/strict';
import {
  calculateLocalContinuum, createCanonicalLocalContinuumModel, MODEL_SCHEMA,
  QUALIFICATION_PROFILE, QUALIFICATION_STATES,
} from '../src/core/local-continuum/index.js';
import { triangleSource } from './lafea.3-fixtures.mjs';

// --- T6 end-to-end: a single T6 element flows through the kernel's public
// API and produces layered (per-Gauss-point) results, never a single
// element-constant stress. ---
const t6Model = t6Source();
const t6Result = calculateLocalContinuum(createCanonicalLocalContinuumModel(t6Model));
assert.equal(t6Result.qualification.state, QUALIFICATION_STATES.ACCEPTED);
const t6LoadCase = t6Result.loadCaseResults[0];
const t6Element = t6LoadCase.elementResults[0];
assert.equal(t6Element.elementType, 'T6');
assert.equal(t6Element.recoveryLayer, 'INTEGRATION_POINT');
assert.equal(t6Element.gaussPointResults.length, 3);
assert.equal('stress' in t6Element, false);
t6Element.gaussPointResults.forEach((gp) => {
  assert.ok(Number.isFinite(gp.stress.sigmaX));
  assert.ok(Number.isFinite(gp.vonMises));
});

// --- Q8 end-to-end: same layered-recovery contract for the quadrilateral. ---
const q8Model = q8Source();
const q8Result = calculateLocalContinuum(createCanonicalLocalContinuumModel(q8Model));
assert.equal(q8Result.qualification.state, QUALIFICATION_STATES.ACCEPTED);
const q8Element = q8Result.loadCaseResults[0].elementResults[0];
assert.equal(q8Element.elementType, 'Q8');
assert.equal(q8Element.recoveryLayer, 'INTEGRATION_POINT');
assert.equal(q8Element.gaussPointResults.length, 9);
assert.equal('stress' in q8Element, false);

// --- T3 is reachable only via explicit elementTypePolicy.allowT3Fallback. ---
const t3NoFlag = triangleSource();
t3NoFlag.elementTypePolicy = { allowT3Fallback: false, sourceReference: 'GUARD_TEST' };
assert.throws(
  () => createCanonicalLocalContinuumModel(t3NoFlag),
  /T3_REQUIRES_EXPLICIT_FALLBACK_ACKNOWLEDGEMENT|allowT3Fallback/,
);

// A model with T3 elements and no elementTypePolicy field at all is rejected
// by the exact-key schema before it ever reaches the fallback check.
const t3Missing = triangleSource();
delete t3Missing.elementTypePolicy;
assert.throws(() => createCanonicalLocalContinuumModel(t3Missing));

// T3 + explicit allowT3Fallback:true is still accepted — preserves every
// existing fixture-based LAFEA.3 contract test untouched.
const t3WithFlag = triangleSource();
const t3Result = calculateLocalContinuum(createCanonicalLocalContinuumModel(t3WithFlag));
assert.equal(t3Result.qualification.state, QUALIFICATION_STATES.ACCEPTED);
assert.equal(t3Result.meshEvidence.elementEvidence[0].elementType, 'T3');
assert.ok('stress' in t3Result.loadCaseResults[0].elementResults[0]);
assert.equal('gaussPointResults' in t3Result.loadCaseResults[0].elementResults[0], false);

// A T6/Q8-only model never needs allowT3Fallback:true (no T3 present).
assert.equal(t6Model.elementTypePolicy.allowT3Fallback, false);

console.log('LAFEA.3 default-element guard (T6/Q8 end-to-end, T3 explicit-fallback-only) passed.');

function t6Source() {
  return {
    schema: MODEL_SCHEMA,
    modelIdentity: 'T6_SINGLE',
    modelVersion: '1',
    sourceAncestry: ancestry(),
    units: { length: 'mm', force: 'N', stress: 'MPa', modulus: 'MPa' },
    formulation: 'PLANE_STRESS',
    materials: [{ materialId: 'MAT', elasticModulus: 200000, poissonRatio: 0.3, sourceReference: 'MATERIAL#MAT' }],
    nodes: [
      n('A', 0, 0), n('B', 2, 0), n('C', 0, 2), n('D', 1, 0), n('E', 1, 1), n('F', 0, 1),
    ],
    elements: [{
      elementId: 'E1', elementType: 'T6', nodeIds: ['A', 'B', 'C', 'D', 'E', 'F'], materialId: 'MAT', thickness: 10, sourceReference: 'ELEMENT#E1',
    }],
    elementTypePolicy: { allowT3Fallback: false, sourceReference: 'T6_ONLY' },
    constraints: [
      c('A', 'UX'), c('A', 'UY'), c('B', 'UY'), c('D', 'UY'),
    ],
    loadCases: [{
      loadCaseId: 'L1', nodalForces: [{ loadId: 'F1', nodeId: 'B', fx: 1000, fy: 0, sourceReference: 'FORCE#F1' }], edgeTractions: [], sourceReference: 'CASE#L1',
    }],
    resultRequests: { loadCaseIds: ['L1'] },
    qualificationProfile: profile(),
    limitations: [],
  };
}

function q8Source() {
  return {
    schema: MODEL_SCHEMA,
    modelIdentity: 'Q8_SINGLE',
    modelVersion: '1',
    sourceAncestry: ancestry(),
    units: { length: 'mm', force: 'N', stress: 'MPa', modulus: 'MPa' },
    formulation: 'PLANE_STRESS',
    materials: [{ materialId: 'MAT', elasticModulus: 200000, poissonRatio: 0.3, sourceReference: 'MATERIAL#MAT' }],
    nodes: [
      n('A', 0, 0), n('B', 2, 0), n('C', 2, 2), n('D', 0, 2),
      n('E', 1, 0), n('F', 2, 1), n('G', 1, 2), n('H', 0, 1),
    ],
    elements: [{
      elementId: 'E1', elementType: 'Q8', nodeIds: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'], materialId: 'MAT', thickness: 10, sourceReference: 'ELEMENT#E1',
    }],
    elementTypePolicy: { allowT3Fallback: false, sourceReference: 'Q8_ONLY' },
    constraints: [
      c('A', 'UX'), c('A', 'UY'), c('D', 'UX'), c('H', 'UX'),
    ],
    loadCases: [{
      loadCaseId: 'L1', nodalForces: [{ loadId: 'F1', nodeId: 'B', fx: 1000, fy: 0, sourceReference: 'FORCE#F1' }, { loadId: 'F2', nodeId: 'C', fx: 1000, fy: 0, sourceReference: 'FORCE#F2' }, { loadId: 'F3', nodeId: 'F', fx: 1000, fy: 0, sourceReference: 'FORCE#F3' }], edgeTractions: [], sourceReference: 'CASE#L1',
    }],
    resultRequests: { loadCaseIds: ['L1'] },
    qualificationProfile: profile(),
    limitations: [],
  };
}

function n(nodeId, x, y) { return { nodeId, x, y, sourceReference: `NODE#${nodeId}` }; }
function c(nodeId, dof) { return { constraintId: `${nodeId}-${dof}`, nodeId, dof, value: 0, sourceReference: `CONSTRAINT#${nodeId}-${dof}` }; }
function ancestry() {
  return {
    sourceModelIdentity: 'FIXTURE', sourceVersion: '1', adapterIdentity: 'LAFEA3_GUARD_TEST', adapterVersion: '1',
  };
}
function profile() { return JSON.parse(JSON.stringify(QUALIFICATION_PROFILE)); }
