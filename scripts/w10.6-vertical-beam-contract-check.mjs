import assert from 'node:assert/strict';
import { createModelLoadReadinessAudit } from '../src/core/model-loads/index.js';
import { deepFreeze, semanticHash } from '../src/core/shared-piping-model/index.js';
import {
  assembleVerticalBeamSystem, AUDIT_CODES, buildVerticalBeamFoundation,
  createEulerBernoulliVerticalPathProfile, runVerticalBeamSolution, solveScaledPartialPivot,
  validateFlexuralPropertyProjection, validateVerticalBeamModel,
  validateVerticalBeamSolution, validateVerticalBeamSolverAudit,
  validateVerticalBeamSolverProfile,
} from '../src/core/vertical-beam-solver/index.js';
import { VerticalBeamStore } from '../src/workspace/vertical-beam-store.js';
import { buildBeamFixture, solveBeamFixture } from './w10.6-beam-fixtures.mjs';

const selected = process.argv[2] || 'all';
const checks = Object.freeze({
  models: checkModelsAndReferences,
  profile: checkProfileToleranceValidation,
  boundaries: checkSupportBoundaries,
  isolation: checkCaseIsolationAndMomentBlocking,
  mismatch: checkPrimitiveMismatch,
  linear: checkLinearSolverFailures,
  immutability: checkUpstreamImmutability,
});
console.log(`\n--- W10.6 Vertical Beam Contract Checks · ${selected} ---\n`);
if (selected === 'all') Object.values(checks).forEach((check) => check());
else if (checks[selected]) checks[selected]();
else throw new TypeError(`Unknown W10.6 beam-contract check: ${selected}`);
console.log(`✅ W10.6 vertical-beam ${selected} check passed.\n`);

function checkModelsAndReferences() {
  const fixture = solveBeamFixture({ lengthsM: [2, 2], supportStationsM: [0, 4], flexural: { ei: 2e6 } });
  const { profile, flexuralProjection, beamModel } = fixture.foundation;
  const { solution, audit } = fixture.solved;
  [
    validateVerticalBeamSolverProfile(profile),
    validateFlexuralPropertyProjection(flexuralProjection),
    validateVerticalBeamModel(beamModel),
    validateVerticalBeamSolution(solution),
    validateVerticalBeamSolverAudit(audit),
  ].forEach((validation) => assert.equal(validation.ok, true, validation.errors.join('\n')));
  assertDeepFrozen(profile); assertDeepFrozen(flexuralProjection);
  assertDeepFrozen(beamModel); assertDeepFrozen(solution); assertDeepFrozen(audit);
  beamModel.pathCases.filter(isReady).forEach(assertModelReferences);
  solution.pathCases.filter(isReady).forEach(assertSolutionReferences);
  const assembly = assembleVerticalBeamSystem(beamModel.pathCases.find((row) => row.loadCaseId === 'EMPTY'));
  assert.equal(assembly.matrix.every((row, i) => row.every((value, j) => close(value, assembly.matrix[j][i], 1e-10))), true);
  assert.equal(assembly.formulaId, 'VERTICAL_BEAM_GLOBAL_ASSEMBLY_V1');
  assert.equal(solution.pathCases.every((row) => row.semanticHash), true);
  checkStoreContractLinks(fixture);
}

function checkProfileToleranceValidation() {
  const defaults = createEulerBernoulliVerticalPathProfile();
  assert.equal(validateVerticalBeamSolverProfile(defaults).ok, true);
  const partial = createEulerBernoulliVerticalPathProfile({
    forceEquilibriumTolerancePolicy: { absoluteTolerance: 1e-6 },
  });
  assert.equal(partial.forceEquilibriumTolerancePolicy.absoluteTolerance, 1e-6);
  assert.equal(partial.forceEquilibriumTolerancePolicy.relativeTolerance, 1e-10);

  const invalidValues = [-1, Number.NaN, Number.POSITIVE_INFINITY, 'not-a-number', undefined];
  ['pivotAbsoluteTolerance', 'pivotRelativeTolerance'].forEach((key) => {
    invalidValues.forEach((value) => assert.throws(
      () => createEulerBernoulliVerticalPathProfile({ [key]: value }),
      TypeError,
    ));
  });
  const policyKeys = [
    'geometryTolerancePolicy', 'forceEquilibriumTolerancePolicy',
    'momentEquilibriumTolerancePolicy', 'matrixResidualTolerancePolicy',
    'supportDisplacementTolerancePolicy',
  ];
  policyKeys.forEach((policyKey) => {
    ['absoluteTolerance', 'relativeTolerance'].forEach((field) => {
      invalidValues.forEach((value) => assert.throws(
        () => createEulerBernoulliVerticalPathProfile({ [policyKey]: { [field]: value } }),
        TypeError,
      ));
    });
    assert.throws(() => createEulerBernoulliVerticalPathProfile({ [policyKey]: null }), TypeError);
  });
  assert.throws(() => createEulerBernoulliVerticalPathProfile(null), TypeError);

  const invalidProfile = rehash({
    ...structuredClone(defaults),
    numericalSolverPolicy: {
      ...structuredClone(defaults.numericalSolverPolicy),
      pivotAbsoluteTolerance: -1,
    },
  });
  assert.equal(validateVerticalBeamSolverProfile(invalidProfile).ok, false);
}

function checkSupportBoundaries() {
  const duplicate = buildBeamFixture({ lengthsM: [2, 2], supportStationsM: [0, 0, 4], flexural: { ei: 2e6 } });
  assert.equal(duplicate.foundation.beamModel.pathCases.every((row) => row.qualification === 'BLOCKED'), true);
  assert.equal(duplicate.foundation.beamModel.pathCases.every((row) => row.blockers.includes(AUDIT_CODES.DUPLICATE_SUPPORT_STATION)), true);

  const insufficient = buildBeamFixture({ lengthsM: [4], supportStationsM: [0], flexural: { ei: 2e6 } });
  assert.equal(insufficient.foundation.beamModel.pathCases.every((row) => row.blockers.includes(AUDIT_CODES.INSUFFICIENT_VERTICAL_SUPPORTS)), true);

  const boundaryLoads = allCases([{ type: 'POINT', componentKey: 'COMP-2', stationM: 2, forceN: 500 }]);
  const boundary = solveBeamFixture({ lengthsM: [2, 2], supportStationsM: [0, 2, 4], flexural: { ei: 2e6 }, loads: boundaryLoads });
  assert.equal(caseRow(boundary, 'EMPTY').nodeResults.some((row) => row.pathStationM === 2), true);
  assert.equal(caseRow(boundary, 'EMPTY').supportForceResults.every((row) => Math.abs(row.constrainedDisplacementM) <= 1e-12), true);
}

function checkCaseIsolationAndMomentBlocking() {
  const isolated = solveBeamFixture({
    lengthsM: [2, 2], supportStationsM: [0, 4], flexural: { ei: 2e6 },
    blockedComponentsByCase: { OPE: ['COMP-1'] },
  });
  assert.equal(caseRow(isolated, 'EMPTY').qualification, 'READY');
  assert.equal(caseRow(isolated, 'HYD').qualification, 'READY');
  assert.equal(caseRow(isolated, 'OPE').blockers.includes(AUDIT_CODES.LOAD_CASE_BLOCKED), true);

  const moment = solveBeamFixture({
    lengthsM: [4], supportStationsM: [0, 4], flexural: { ei: 2e6 },
    loads: {
      EMPTY: [{ type: 'POINT', componentKey: 'COMP-1', stationM: 2, forceN: 100 }],
      OPE: [{ type: 'MOMENT', componentKey: 'COMP-1', stationM: 2, momentNm: 100 }],
      HYD: [{ type: 'POINT', componentKey: 'COMP-1', stationM: 2, forceN: 100 }],
    },
  });
  assert.equal(caseRow(moment, 'EMPTY').qualification, 'READY');
  assert.equal(caseRow(moment, 'HYD').qualification, 'READY');
  assert.equal(caseRow(moment, 'OPE').blockers.includes(AUDIT_CODES.POINT_MOMENT_UNSUPPORTED), true);
}

function checkPrimitiveMismatch() {
  const fixture = buildBeamFixture({
    intervals: [
      { key: 'PATH-A-COMPONENT', startM: 0, endM: 1 },
      { key: 'PATH-B-COMPONENT', startM: 10, endM: 11 },
    ],
    supportStationsM: [0, 1, 10, 11], flexural: { ei: 2e6 },
  });
  const primitive = orphanPrimitive();
  const primitiveSet = rehash({
    ...fixture.loadFoundation.loadPrimitiveSet,
    primitives: [...fixture.loadFoundation.loadPrimitiveSet.primitives, primitive],
  });
  const readiness = createModelLoadReadinessAudit(fixture.loadFoundation.loadCaseSet, primitiveSet);
  const foundation = buildVerticalBeamFoundation({
    sharedModel: fixture.sharedModel, pathModel: fixture.pathFoundation.pathModel,
    loadCaseSet: fixture.loadFoundation.loadCaseSet, loadPrimitiveSet: primitiveSet,
    modelLoadReadinessAudit: readiness,
  });
  const emptyCases = foundation.beamModel.pathCases.filter((row) => row.loadCaseId === 'EMPTY');
  assert.equal(emptyCases.length, 2);
  assert.equal(emptyCases.every(isReady), true);
  assert.equal(foundation.beamModel.pathCases.every(isReady), true);
  assert.equal(foundation.beamModel.diagnostics.some((row) => row.scope === primitive.primitiveId
    && row.code === AUDIT_CODES.LOAD_PRIMITIVE_PATH_MISMATCH), true);
}

function checkLinearSolverFailures() {
  const policy = { pivotAbsoluteTolerance: 1e-14, pivotRelativeTolerance: 1e-12 };
  const singular = solveScaledPartialPivot([[1, 1], [2, 2]], [1, 2], policy);
  assert.equal(singular.ok, false);
  assert.equal(singular.diagnostics[0].code, AUDIT_CODES.MATRIX_SINGULAR);
  const near = solveScaledPartialPivot([[1, 0], [0, 1e-14]], [1, 1e-14], policy);
  assert.equal(near.ok, false);
  assert.equal(near.diagnostics[0].code, AUDIT_CODES.MATRIX_NEAR_SINGULAR);
  const nonfinite = solveScaledPartialPivot([[1, Number.NaN], [0, 1]], [1, 1], policy);
  assert.equal(nonfinite.diagnostics[0].code, AUDIT_CODES.MATRIX_NONFINITE);
  assert.equal(singular.trace.formulaId, 'SCALED_PARTIAL_PIVOT_LINEAR_SOLVE_V1');
}

function checkUpstreamImmutability() {
  const fixture = buildBeamFixture({ lengthsM: [2, 2], supportStationsM: [0, 4], flexural: { ei: 2e6 } });
  const before = hashes(fixture);
  const solved = runVerticalBeamSolution(fixture.foundation);
  assert.deepEqual(hashes(fixture), before);
  assert.equal(solved.solution.beamModelSemanticHash, fixture.foundation.beamModel.semanticHash);
}

function checkStoreContractLinks(first) {
  const changedProfile = solveBeamFixture({
    datasetId: 'W10.6-STORE-PROFILE', lengthsM: [2, 2], supportStationsM: [0, 4],
    flexural: { ei: 2e6 }, profileOptions: { pivotRelativeTolerance: 1e-10 },
  });
  const changedDataset = solveBeamFixture({
    datasetId: 'W10.6-STORE-DATASET', lengthsM: [2, 2], supportStationsM: [0, 4], flexural: { ei: 2e6 },
  });
  VerticalBeamStore.clear();
  setStoreFoundation(first);
  const baseline = VerticalBeamStore.getSnapshot();
  expectFoundationRejection(first.foundation.profile, changedProfile.foundation.flexuralProjection, changedProfile.foundation.beamModel, baseline);
  expectFoundationRejection(changedProfile.foundation.profile, changedProfile.foundation.flexuralProjection, first.foundation.beamModel, baseline);
  expectFoundationRejection(first.foundation.profile, first.foundation.flexuralProjection, changedDataset.foundation.beamModel, baseline);
  VerticalBeamStore.setSolution(first.solved.solution, first.solved.audit);
  const solved = VerticalBeamStore.getSnapshot();
  assert.throws(() => VerticalBeamStore.setSolution(first.solved.solution, changedDataset.solved.audit), /audit does not match/i);
  assertStoreSnapshot(solved);
  VerticalBeamStore.clear();
}

function expectFoundationRejection(profile, projection, model, baseline) {
  assert.throws(() => VerticalBeamStore.setFoundation(profile, projection, model), /does not match/i);
  assertStoreSnapshot(baseline);
}
function setStoreFoundation(fixture) {
  VerticalBeamStore.setFoundation(
    fixture.foundation.profile, fixture.foundation.flexuralProjection, fixture.foundation.beamModel,
  );
}
function assertStoreSnapshot(expected) {
  const actual = VerticalBeamStore.getSnapshot();
  Object.keys(expected).forEach((key) => assert.strictEqual(actual[key], expected[key]));
}
function orphanPrimitive() {
  return {
    primitiveId: 'fixture-load:EMPTY:orphan', loadCaseId: 'EMPTY', componentKey: 'MISSING-COMPONENT',
    primitiveType: 'POINT_GRAVITY_LOAD', applicationPoint: { x: 2, y: 0, z: 0 },
    pointMassKg: 100 / 9.80665, pointForceN: 100,
    semanticDirection: 'GRAVITY_DOWN', globalVector: null, sourceEvidence: { fixture: true }, diagnostics: [],
  };
}
function assertModelReferences(row) {
  const nodeIds = new Set(row.nodes.map((item) => item.nodeId));
  const dofIds = new Set(row.dofMap.map((item) => item.dofId));
  row.elements.forEach((item) => { assert.equal(nodeIds.has(item.startNodeId), true); assert.equal(nodeIds.has(item.endNodeId), true); });
  row.constraints.forEach((item) => { assert.equal(nodeIds.has(item.nodeId), true); assert.equal(dofIds.has(item.constrainedDofId), true); assert.equal(item.rotationConstraint, null); });
  row.loadVectorRecords.forEach((item) => { if (item.nodeId) assert.equal(nodeIds.has(item.nodeId), true); });
}
function assertSolutionReferences(row) {
  const nodeIds = new Set(row.nodeResults.map((item) => item.nodeId));
  row.elementEndForces.forEach((item) => assert.ok(item.elementId));
  row.supportForceResults.forEach((item) => { assert.ok(item.constrainedDofId); assert.ok(Number.isFinite(item.signedSupportForceN)); });
  assert.equal(nodeIds.size, row.nodeResults.length);
  assert.equal(row.forceEquilibrium.pass && row.momentEquilibrium.pass && row.matrixResidual.pass, true);
}
function rehash(value) { const { semanticHash: _old, ...base } = structuredClone(value); return deepFreeze({ ...base, semanticHash: semanticHash(base) }); }
function hashes(fixture) { return { shared: fixture.sharedModel.semanticHash, path: fixture.pathFoundation.pathModel.semanticHash, cases: fixture.loadFoundation.loadCaseSet.semanticHash, primitives: fixture.loadFoundation.loadPrimitiveSet.semanticHash, readiness: fixture.loadFoundation.readinessAudit.semanticHash }; }
function caseRow(result, id) { return result.solved.solution.pathCases.find((row) => row.loadCaseId === id); }
function allCases(rows) { return { EMPTY: structuredClone(rows), OPE: structuredClone(rows), HYD: structuredClone(rows) }; }
function isReady(row) { return row.qualification === 'READY'; }
function close(actual, expected, tolerance) { return Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(expected)); }
function assertDeepFrozen(value) { if (!value || typeof value !== 'object') return; assert.equal(Object.isFrozen(value), true); Object.values(value).forEach(assertDeepFrozen); }
