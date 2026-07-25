import assert from 'node:assert/strict';
import { deepFreeze, semanticHash } from '../src/core/shared-piping-model/index.js';
import {
  AUDIT_CODES,
  validateSupportLoadScreeningAudit,
  validateTributarySupportLoadScreening,
  validateVerticalLoadPathModel,
  validateVerticalLoadPathProfile,
  runTributarySupportLoadScreening,
} from '../src/core/support-load-screening/index.js';
import {
  buildBranchFixture,
  buildCycleFixture,
  buildDisconnectedFixture,
  buildStraightFixture,
  buildUnavailableStationFixture,
  runFixture,
} from './w10.5-screening-fixtures.mjs';

checkStraightUniform();
checkPointLoads();
checkMultipleSpans();
checkBlockedTopology();
checkSupportQualification();
checkSupportEvidenceDetails();
checkOverhangAndCaseIsolation();
checkPrimitivePathMismatch();
checkDeterminismAndImmutability();
console.log('✅ W10.5 support-load screening contract checks passed.');

function checkStraightUniform() {
  const fixture = buildStraightFixture();
  const path = fixture.pathFoundation.pathModel.paths[0];
  assert.equal(validateVerticalLoadPathProfile(fixture.pathFoundation.profile).ok, true);
  assert.equal(validateVerticalLoadPathModel(fixture.pathFoundation.pathModel).ok, true);
  assert.equal(path.qualification, 'READY');
  assert.deepEqual(path.orderedComponentKeys, ['COMP-1', 'COMP-2']);
  assert.deepEqual(path.supportStations.map((row) => row.pathStationM), [0, 2]);
  const result = runFixture(fixture);
  assert.equal(validateTributarySupportLoadScreening(result.screening).ok, true);
  assert.equal(validateSupportLoadScreeningAudit(result.audit).ok, true);
  const empty = caseRecord(result, 'EMPTY');
  assert.equal(empty.qualification, 'READY');
  assert.equal(empty.spans.length, 1);
  assertNear(empty.equilibrium.appliedForceN, 20 * 9.80665);
  assertNear(empty.equilibrium.residualForceN, 0);
  assert.equal(empty.equilibrium.pass, true);
  const forces = supportForces(result, 'EMPTY');
  assertNear(forces[0], 10 * 9.80665);
  assertNear(forces[1], 10 * 9.80665);
}

function checkPointLoads() {
  const midpoint = runFixture(buildStraightFixture({
    lengthsM: [2], componentTypes: ['VALVE'], componentMassKg: 20,
  }));
  const midpointForces = supportForces(midpoint, 'EMPTY');
  assertNear(midpointForces[0], 10 * 9.80665);
  assertNear(midpointForces[1], 10 * 9.80665);

  const quarter = runFixture(buildStraightFixture({
    lengthsM: [2], componentTypes: ['VALVE'], componentMassKg: 20, cogFraction: 0.25,
    explicitPointMomentNm: 100, momentAxis: 'LOCAL_Z',
  }));
  assertNear(supportForce(quarter, 'EMPTY', 'SUP-START'), 15 * 9.80665);
  assertNear(supportForce(quarter, 'EMPTY', 'SUP-END'), 5 * 9.80665);
  const empty = caseRecord(quarter, 'EMPTY');
  assert.equal(empty.eligiblePrimitiveIds.length, 1);
  assert.equal(quarter.screening.contributions.every((row) => row.formulaId === 'SIMPLE_SPAN_POINT_LOAD_REACTION_V1'), true);
}

function checkMultipleSpans() {
  const fixture = buildStraightFixture({
    lengthsM: [2],
    supports: [
      { key: 'SUP-0', stationM: 0, verticalState: 'RESTRAINED' },
      { key: 'SUP-1', stationM: 1, verticalState: 'RESTRAINED' },
      { key: 'SUP-2', stationM: 2, verticalState: 'RESTRAINED' },
    ],
  });
  const result = runFixture(fixture);
  const empty = caseRecord(result, 'EMPTY');
  assert.equal(empty.spans.length, 2);
  assert.equal(empty.contributionCount, 4);
  const forces = supportForces(result, 'EMPTY');
  assertNear(forces[0], 5 * 9.80665);
  assertNear(forces[1], 10 * 9.80665);
  assertNear(forces[2], 5 * 9.80665);
  assert.equal(result.screening.contributions.every((row) => row.formulaId === 'SIMPLE_SPAN_UNIFORM_SEGMENT_REACTION_V1'), true);
  assert.equal(new Set(result.screening.contributions.map((row) => row.contributionId)).size, result.screening.contributions.length);
}

function checkBlockedTopology() {
  const branch = buildBranchFixture().pathFoundation.pathModel.paths[0];
  assert.equal(branch.qualification, 'BLOCKED');
  assert.deepEqual(branch.blockers, [AUDIT_CODES.TOPOLOGY_BRANCH_BLOCKED]);
  const cycle = buildCycleFixture().pathFoundation.pathModel.paths[0];
  assert.equal(cycle.qualification, 'BLOCKED');
  assert.deepEqual(cycle.blockers, [AUDIT_CODES.TOPOLOGY_CYCLE_BLOCKED]);
  const disconnected = buildDisconnectedFixture().pathFoundation.pathModel;
  assert.equal(disconnected.paths.length, 2);
  assert.equal(disconnected.paths.every((row) => row.qualification === 'READY'), true);
  assert.equal(disconnected.diagnostics.some((row) => row.code === AUDIT_CODES.TOPOLOGY_DISCONNECTED), true);
}

function checkSupportQualification() {
  const duplicate = buildStraightFixture({
    lengthsM: [1],
    supports: [
      { key: 'SUP-A', stationM: 0, verticalState: 'RESTRAINED' },
      { key: 'SUP-B', stationM: 0, verticalState: 'RESTRAINED' },
      { key: 'SUP-C', stationM: 1, verticalState: 'RESTRAINED' },
    ],
  }).pathFoundation.pathModel.paths[0];
  assert.equal(duplicate.qualification, 'BLOCKED');
  assert.equal(duplicate.blockers.includes(AUDIT_CODES.DUPLICATE_SUPPORT_STATION), true);

  for (const [verticalState, code] of [
    ['FREE', AUDIT_CODES.VERTICAL_RESTRAINT_UNRESOLVED],
    ['SPRING', AUDIT_CODES.VERTICAL_SPRING_UNSUPPORTED],
    [['RESTRAINED', 'FREE'], AUDIT_CODES.VERTICAL_RESTRAINT_UNRESOLVED],
  ]) {
    const path = buildStraightFixture({
      lengthsM: [1],
      supports: [
        { key: 'SUP-A', stationM: 0, verticalState },
        { key: 'SUP-B', stationM: 1, verticalState: 'RESTRAINED' },
      ],
    }).pathFoundation.pathModel.paths[0];
    assert.equal(path.qualification, 'BLOCKED');
    assert.equal(path.blockers.includes(code), true);
  }
  const gapPath = buildStraightFixture({
    lengthsM: [1],
    supports: [
      { key: 'SUP-A', stationM: 0, verticalGapMm: 2, supportType: 'SUPPORT' },
      { key: 'SUP-B', stationM: 1, verticalState: 'RESTRAINED' },
    ],
  }).pathFoundation.pathModel.paths[0];
  assert.equal(gapPath.blockers.includes(AUDIT_CODES.VERTICAL_GAP_UNSUPPORTED), true);

  const withAmbiguous = buildStraightFixture({
    lengthsM: [1, 1],
    supports: [
      { key: 'SUP-A', stationM: 0, verticalState: 'RESTRAINED' },
      { key: 'SUP-B', stationM: 2, verticalState: 'RESTRAINED' },
      { key: 'SUP-X', stationM: 1, verticalState: 'RESTRAINED', ambiguousComponents: ['COMP-1', 'COMP-2'] },
    ],
  }).pathFoundation.pathModel.paths[0];
  assert.equal(withAmbiguous.qualification, 'READY');
  assert.equal(withAmbiguous.blockedSupportKeys.includes('SUP-X'), true);
}

function checkSupportEvidenceDetails() {
  const typeClassified = buildStraightFixture({
    lengthsM: [1],
    supports: [
      { key: 'SUP-A', stationM: 0, supportType: 'REST' },
      { key: 'SUP-B', stationM: 1, verticalState: 'RESTRAINED' },
    ],
  }).pathFoundation.pathModel.paths[0];
  assert.equal(typeClassified.qualification, 'READY');
  const inferred = typeClassified.supportStations.find((row) => row.supportKey === 'SUP-A');
  assert.equal(inferred.verticalState, 'RESTRAINED');
  assert.equal(inferred.verticalBasis, 'INFERRED_FROM_SUPPORT_TYPE');

  const extraBlocked = buildStraightFixture({
    lengthsM: [1],
    supports: [
      { key: 'SUP-A', stationM: 0, verticalState: 'RESTRAINED' },
      { key: 'SUP-B', stationM: 1, verticalState: 'RESTRAINED' },
      { key: 'SUP-UNATTACHED', stationM: 0.25, verticalState: 'RESTRAINED', unattached: true, lineId: 'OTHER-LINE' },
    ],
  }).pathFoundation.pathModel.paths[0];
  assert.equal(extraBlocked.qualification, 'READY');
  assert.equal(extraBlocked.blockers.includes(AUDIT_CODES.SUPPORT_UNATTACHED), true);

  const stationPath = buildUnavailableStationFixture().pathFoundation.pathModel.paths[0];
  assert.equal(stationPath.qualification, 'READY');
  assert.equal(stationPath.blockers.includes(AUDIT_CODES.SUPPORT_STATION_UNAVAILABLE), true);

  const disconnected = buildDisconnectedFixture().pathFoundation.pathModel;
  assert.equal(disconnected.paths.every((path) => path.blockers.includes(AUDIT_CODES.SUPPORT_PATH_MISMATCH)), true);

  const unknown = buildStraightFixture({
    lengthsM: [1],
    supports: [
      { key: 'SUP-A', stationM: 0, supportType: 'SUPPORT' },
      { key: 'SUP-B', stationM: 1, verticalState: 'RESTRAINED' },
    ],
  }).pathFoundation.pathModel.paths[0];
  assert.equal(unknown.qualification, 'BLOCKED');
  assert.equal(unknown.blockers.includes(AUDIT_CODES.VERTICAL_RESTRAINT_UNRESOLVED), true);
}

function checkOverhangAndCaseIsolation() {
  const overhang = runFixture(buildStraightFixture({
    lengthsM: [0.5, 1, 0.5],
    supports: [
      { key: 'SUP-A', stationM: 0.5, verticalState: 'RESTRAINED' },
      { key: 'SUP-B', stationM: 1.5, verticalState: 'RESTRAINED' },
    ],
  }));
  assert.equal(caseRecord(overhang, 'EMPTY').blockers.includes(AUDIT_CODES.OVERHANG_LOAD_UNSUPPORTED), true);
  const pointOverhang = runFixture(buildStraightFixture({
    lengthsM: [0.5, 1, 0.5], componentTypes: ['VALVE', 'PIPE', 'PIPE'],
    componentMassKg: 10, cogFraction: 0.2,
    supports: [
      { key: 'SUP-A', stationM: 0.5, verticalState: 'RESTRAINED' },
      { key: 'SUP-B', stationM: 1.5, verticalState: 'RESTRAINED' },
    ],
  }));
  assert.equal(caseRecord(pointOverhang, 'EMPTY').blockers.includes(AUDIT_CODES.OVERHANG_LOAD_UNSUPPORTED), true);

  const hydIsolation = runFixture(buildStraightFixture({ opeFluidKgM: 2, hydFluidKgM: null }));
  assert.equal(caseRecord(hydIsolation, 'EMPTY').qualification, 'READY');
  assert.equal(caseRecord(hydIsolation, 'OPE').qualification, 'READY');
  assert.equal(caseRecord(hydIsolation, 'HYD').qualification, 'BLOCKED');

  const isolation = runFixture(buildStraightFixture({ opeFluidKgM: null, hydFluidKgM: 3 }));
  assert.equal(caseRecord(isolation, 'EMPTY').qualification, 'READY');
  assert.equal(caseRecord(isolation, 'OPE').qualification, 'BLOCKED');
  assert.equal(caseRecord(isolation, 'OPE').blockers.includes(AUDIT_CODES.LOAD_CASE_BLOCKED), true);
  assert.equal(caseRecord(isolation, 'HYD').qualification, 'READY');
}

function checkPrimitivePathMismatch() {
  const fixture = buildStraightFixture();
  const primitives = fixture.modelLoads.loadPrimitiveSet.primitives.map((row, index) => (
    index === 0 ? { ...row, componentKey: 'MISSING-COMPONENT' } : row
  ));
  const primitiveBase = { ...fixture.modelLoads.loadPrimitiveSet, primitives };
  delete primitiveBase.semanticHash;
  const loadPrimitiveSet = deepFreeze({ ...primitiveBase, semanticHash: semanticHash(primitiveBase) });
  const readinessBase = {
    ...fixture.modelLoads.readinessAudit,
    primitiveSetSemanticHash: loadPrimitiveSet.semanticHash,
  };
  delete readinessBase.semanticHash;
  const modelLoadReadinessAudit = deepFreeze({ ...readinessBase, semanticHash: semanticHash(readinessBase) });
  const result = runTributarySupportLoadScreening(fixture.pathFoundation, {
    loadCaseSet: fixture.modelLoads.loadCaseSet,
    loadPrimitiveSet,
    modelLoadReadinessAudit,
  });
  const affected = caseRecord(result, primitives[0].loadCaseId);
  assert.equal(affected.qualification, 'BLOCKED');
  assert.equal(affected.blockers.includes(AUDIT_CODES.LOAD_PRIMITIVE_PATH_MISMATCH), true);
}

function checkDeterminismAndImmutability() {
  const fixture = buildStraightFixture();
  const before = JSON.stringify({
    shared: fixture.sharedModel,
    topology: fixture.topologyGraph,
    attachment: fixture.attachmentModel,
    restraint: fixture.restraintModel,
    loads: fixture.modelLoads,
  });
  const first = runFixture(fixture);
  const second = runFixture(fixture);
  assert.equal(first.screening.semanticHash, second.screening.semanticHash);
  assert.equal(first.audit.semanticHash, second.audit.semanticHash);
  assert.equal(Object.isFrozen(first.screening), true);
  assert.equal(Object.isFrozen(first.audit), true);
  assert.equal(JSON.stringify({
    shared: fixture.sharedModel,
    topology: fixture.topologyGraph,
    attachment: fixture.attachmentModel,
    restraint: fixture.restraintModel,
    loads: fixture.modelLoads,
  }), before);
}

function caseRecord(result, loadCaseId) {
  return result.screening.pathCases.find((row) => row.loadCaseId === loadCaseId);
}
function supportForce(result, loadCaseId, supportKey) {
  return result.screening.supportResults.find((row) => row.loadCaseId === loadCaseId && row.supportKey === supportKey)?.screenedVerticalForceN;
}
function supportForces(result, loadCaseId) {
  return result.screening.supportResults.filter((row) => row.loadCaseId === loadCaseId)
    .sort((left, right) => left.pathStationM - right.pathStationM)
    .map((row) => row.screenedVerticalForceN);
}
function assertNear(actual, expected, tolerance = 1e-9) { assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`); }
