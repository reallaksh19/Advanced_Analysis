import assert from 'node:assert/strict';
import { calculateLocalContinuum, createCanonicalLocalContinuumModel, QUALIFICATION_STATES } from '../src/core/local-continuum/index.js';
import {
  averageWithinGroups, averagingGroupKey, discontinuityNodes,
} from '../src/core/local-continuum/averaging-boundaries.js';
import {
  DISPLAY_AUTHORITY, projectElementGaussStressToNodes, RECOVERY_LAYERS,
} from '../src/core/local-continuum/nodal-projection-display.js';
import { triangleSource } from './lafea.3-fixtures.mjs';

// --- Layer 1 (authoritative): Gauss-point results carry the
// INTEGRATION_POINT layer and NO display-authority tag. ---
const model = q8UniformTensionSource();
const result = calculateLocalContinuum(createCanonicalLocalContinuumModel(model));
assert.equal(result.qualification.state, QUALIFICATION_STATES.ACCEPTED);
const elementResult = result.loadCaseResults[0].elementResults[0];
assert.equal(elementResult.recoveryLayer, RECOVERY_LAYERS.INTEGRATION_POINT);
assert.equal('authority' in elementResult, false, 'the authoritative layer must not be tagged with a display authority');

// --- Layer 3 (display only): every projected nodal value is tagged
// NODAL_PROJECTED_DISPLAY_ONLY and NON_AUTHORITATIVE_DISPLAY_PROJECTION,
// so nothing downstream can mistake it for the authoritative value. ---
const projected = projectElementGaussStressToNodes(elementResult, 'Q8');
assert.equal(projected.length, 8);
projected.forEach((row) => {
  assert.equal(row.recoveryLayer, RECOVERY_LAYERS.NODAL_PROJECTED_DISPLAY_ONLY);
  assert.equal(row.authority, DISPLAY_AUTHORITY);
});

// --- Projection correctness: for a genuinely uniform stress field, the
// projection must reproduce that same constant at every node. A projection
// that distorted a constant field would be worthless even as a display aid. ---
const uniformSigmaX = elementResult.gaussPointResults[0].stress.sigmaX;
projected.forEach((row) => {
  assert.ok(
    Math.abs(row.stress.sigmaX - uniformSigmaX) <= 1e-6 * Math.max(1, Math.abs(uniformSigmaX)),
    `projection must reproduce a uniform field exactly: ${row.stress.sigmaX} != ${uniformSigmaX}`,
  );
});

// --- Averaging respects discontinuities: two elements meeting at a node
// with DIFFERENT materials produce two separate averaged values, never one
// blended number. ---
const sharedNodeContributions = [
  { nodeId: 'N1', groupKey: averagingGroupKey({ materialId: 'STEEL', thickness: 10, elementType: 'Q8' }), stress: { sigmaX: 100 }, elementId: 'E1' },
  { nodeId: 'N1', groupKey: averagingGroupKey({ materialId: 'ALUMINIUM', thickness: 10, elementType: 'Q8' }), stress: { sigmaX: 40 }, elementId: 'E2' },
];
const acrossMaterial = averageWithinGroups(sharedNodeContributions);
assert.equal(acrossMaterial.length, 2, 'a material discontinuity must yield two values at the shared node, not one blend');
assert.deepEqual(acrossMaterial.map((row) => row.stress.sigmaX).sort((a, b) => a - b), [40, 100]);
assert.deepEqual(discontinuityNodes(acrossMaterial), ['N1']);
// Specifically: the forbidden blended value (70) must appear nowhere.
assert.ok(acrossMaterial.every((row) => row.stress.sigmaX !== 70), 'averaging must never blend across a material discontinuity');

// A thickness discontinuity is treated the same way.
const acrossThickness = averageWithinGroups([
  { nodeId: 'N1', groupKey: averagingGroupKey({ materialId: 'STEEL', thickness: 10, elementType: 'Q8' }), stress: { sigmaX: 100 }, elementId: 'E1' },
  { nodeId: 'N1', groupKey: averagingGroupKey({ materialId: 'STEEL', thickness: 25, elementType: 'Q8' }), stress: { sigmaX: 40 }, elementId: 'E2' },
]);
assert.equal(acrossThickness.length, 2, 'a thickness discontinuity must not be averaged across');

// --- Within one group (same material, thickness and element type),
// averaging DOES happen — the mean of the contributions. ---
const withinGroup = averageWithinGroups([
  { nodeId: 'N1', groupKey: averagingGroupKey({ materialId: 'STEEL', thickness: 10, elementType: 'Q8' }), stress: { sigmaX: 100 }, elementId: 'E1' },
  { nodeId: 'N1', groupKey: averagingGroupKey({ materialId: 'STEEL', thickness: 10, elementType: 'Q8' }), stress: { sigmaX: 40 }, elementId: 'E2' },
]);
assert.equal(withinGroup.length, 1);
assert.equal(withinGroup[0].stress.sigmaX, 70);
assert.equal(withinGroup[0].contributionCount, 2);
assert.deepEqual(withinGroup[0].contributingElementIds, ['E1', 'E2']);
assert.deepEqual(discontinuityNodes(withinGroup), [], 'a node with a single averaging group is not a discontinuity node');

// --- A geometric or load discontinuity the kernel cannot observe is never
// inferred: it must be declared explicitly by the caller. ---
const undeclared = averagingGroupKey({ materialId: 'STEEL', thickness: 10, elementType: 'Q8' });
const declared = averagingGroupKey({ materialId: 'STEEL', thickness: 10, elementType: 'Q8' }, 'WELD_TOE_FEATURE_EDGE');
assert.notEqual(undeclared, declared, 'an explicitly declared discontinuity tag must separate averaging groups');

// --- The T3 path is untouched: still a single element-constant stress,
// with no Gauss-point array and no display-layer tagging. ---
const t3Result = calculateLocalContinuum(createCanonicalLocalContinuumModel(triangleSource()));
const t3Element = t3Result.loadCaseResults[0].elementResults[0];
assert.ok('stress' in t3Element);
assert.equal('gaussPointResults' in t3Element, false);
assert.equal('authority' in t3Element, false);

console.log('LAFEA.3 recovery layers (integration-point authoritative, nodal projection display-only, discontinuity-respecting averaging) passed.');

function q8UniformTensionSource() {
  const sigma = 20;
  const thickness = 10;
  // Uniform uniaxial tension on a 2x2 square: prescribe the exact affine
  // displacement field on every node so the recovered stress is genuinely
  // uniform, making the projection's fidelity checkable in closed form.
  const E = 200000; const nu = 0.3;
  const epsX = sigma / E; const epsY = -nu * sigma / E;
  const coordinates = [
    ['A', 0, 0], ['B', 2, 0], ['C', 2, 2], ['D', 0, 2],
    ['E', 1, 0], ['F', 2, 1], ['G', 1, 2], ['H', 0, 1],
  ];
  return {
    schema: 'local-continuum-model/v1', modelIdentity: 'Q8_UNIFORM', modelVersion: '1',
    sourceAncestry: { sourceModelIdentity: 'FIXTURE', sourceVersion: '1', adapterIdentity: 'LAFEA3_RECOVERY_TEST', adapterVersion: '1' },
    units: { length: 'mm', force: 'N', stress: 'MPa', modulus: 'MPa' },
    formulation: 'PLANE_STRESS',
    materials: [{ materialId: 'MAT', elasticModulus: E, poissonRatio: nu, sourceReference: 'MATERIAL#MAT' }],
    nodes: coordinates.map(([nodeId, x, y]) => ({ nodeId, x, y, sourceReference: `NODE#${nodeId}` })),
    elements: [{
      elementId: 'E1', elementType: 'Q8', nodeIds: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'], materialId: 'MAT', thickness, sourceReference: 'ELEMENT#E1',
    }],
    elementTypePolicy: { allowT3Fallback: false, sourceReference: 'Q8_ONLY' },
    constraints: coordinates.flatMap(([nodeId, x, y]) => [
      { constraintId: `${nodeId}-UX`, nodeId, dof: 'UX', value: epsX * x, sourceReference: `CONSTRAINT#${nodeId}-UX` },
      { constraintId: `${nodeId}-UY`, nodeId, dof: 'UY', value: epsY * y, sourceReference: `CONSTRAINT#${nodeId}-UY` },
    ]),
    loadCases: [{
      loadCaseId: 'UNIFORM', nodalForces: [], edgeTractions: [], pressureLoads: [], bodyForces: [], temperatureLoads: [], imposedDisplacements: [], sourceReference: 'CASE#UNIFORM',
    }],
    resultRequests: { loadCaseIds: ['UNIFORM'] },
    qualificationProfile: {
      schema: 'local-continuum-qualification-profile/v1',
      identity: 'RECOVERY_TEST_PROFILE',
      tolerances: {
        minimumElementArea: { absolute: 1e-9, relative: 1e-9 },
        stiffnessSymmetry: { absolute: 1e-9, relative: 1e-9 },
        constitutiveSymmetry: { absolute: 1e-9, relative: 1e-9 },
        choleskyPivot: { absolute: 1e-9, relative: 1e-9 },
        freeDofResidual: { absolute: 1e-6, relative: 1e-6 },
        reactionEquilibrium: { absolute: 1e-6, relative: 1e-6 },
        strainEnergy: { absolute: 1e-6, relative: 1e-6 },
        rigidBodyStrain: { absolute: 1e-9, relative: 1e-9 },
        patchTestStress: { absolute: 1e-9, relative: 1e-9 },
      },
    },
    limitations: [],
  };
}
