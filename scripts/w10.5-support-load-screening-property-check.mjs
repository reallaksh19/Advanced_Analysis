import assert from 'node:assert/strict';
import { buildStraightFixture, runFixture } from './w10.5-screening-fixtures.mjs';

const SEED = 1052026;
const random = seeded(SEED);

checkTranslation();
checkOrderingAndOrientation();
checkUnits();
checkScaling();
checkOrderingAndReferences();
console.log(`✅ W10.5 fixed-seed property checks passed (seed ${SEED}).`);

function checkTranslation() {
  const base = runFixture(buildStraightFixture({ lengthsM: [0.75, 1.25, 0.5] }));
  const moved = runFixture(buildStraightFixture({ lengthsM: [0.75, 1.25, 0.5], originM: 1234.5, yM: -40, zM: 9 }));
  assert.deepEqual(caseForces(base), caseForces(moved));
  assert.deepEqual(pathDifferences(base), pathDifferences(moved));
}

function checkOrderingAndOrientation() {
  const base = runFixture(buildStraightFixture({ lengthsM: [0.5, 1.25, 0.75] }));
  const reordered = runFixture(buildStraightFixture({ lengthsM: [0.5, 1.25, 0.75], reverseInputOrder: true }));
  const reversed = runFixture(buildStraightFixture({ lengthsM: [0.5, 1.25, 0.75], reverseComponentGeometry: true }));
  assert.equal(base.pathModel.semanticHash, reordered.pathModel.semanticHash);
  assert.deepEqual(forcesBySupport(base), forcesBySupport(reordered));
  assert.deepEqual(forcesBySupport(base), forcesBySupport(reversed));
  assert.deepEqual(pathDifferences(base), pathDifferences(reversed));
}

function checkUnits() {
  const results = ['mm', 'cm', 'm', 'in', 'ft'].map((lengthUnit) => (
    runFixture(buildStraightFixture({ lengthUnit, lengthsM: [0.4, 0.8, 1.1] }))
  ));
  results.slice(1).forEach((result) => assertVectorNear(caseForces(result), caseForces(results[0])));
}

function checkScaling() {
  for (let iteration = 0; iteration < 40; iteration += 1) {
    const lengthsM = Array.from({ length: 1 + Math.floor(random() * 5) }, () => 0.2 + random() * 2);
    const factor = 0.1 + random() * 8;
    const base = runFixture(buildStraightFixture({ lengthsM, pipeMassKgM: 3, opeFluidKgM: 1, hydFluidKgM: 2 }));
    const scaled = runFixture(buildStraightFixture({
      lengthsM,
      pipeMassKgM: 3 * factor,
      opeFluidKgM: 1 * factor,
      hydFluidKgM: 2 * factor,
    }));
    const left = caseForces(base), right = caseForces(scaled);
    left.forEach((value, index) => assertNear(right[index], value * factor, 1e-8));
    assertEquilibrium(base);
    assertEquilibrium(scaled);
  }
}

function checkOrderingAndReferences() {
  const fixture = buildStraightFixture({ lengthsM: [1.2, 0.7, 2.1] });
  const first = runFixture(fixture);
  const second = runFixture(fixture);
  assert.equal(first.screening.semanticHash, second.screening.semanticHash);
  assert.equal(first.audit.semanticHash, second.audit.semanticHash);
  const pathIds = new Set(first.pathModel.paths.map((row) => row.pathId));
  const primitiveIds = new Set(fixture.modelLoads.loadPrimitiveSet.primitives.map((row) => row.primitiveId));
  const supportIds = new Set(fixture.restraintModel.restraints.map((row) => row.supportKey));
  assert.equal(pathIds.size, first.pathModel.paths.length);
  assert.equal(new Set(first.screening.contributions.map((row) => row.contributionId)).size, first.screening.contributions.length);
  assert.equal(new Set(first.screening.supportResults.map((row) => row.resultId)).size, first.screening.supportResults.length);
  first.screening.contributions.forEach((row) => {
    assert.equal(pathIds.has(row.pathId), true);
    assert.equal(primitiveIds.has(row.primitiveId), true);
    assert.equal(supportIds.has(row.supportKey), true);
  });
  first.screening.supportResults.forEach((row) => {
    assert.equal(pathIds.has(row.pathId), true);
    assert.equal(supportIds.has(row.supportKey), true);
  });
  first.screening.pathCases.forEach((row) => {
    assert.equal(['EMPTY', 'OPE', 'HYD'].includes(row.loadCaseId), true);
  });
  assertEquilibrium(first);
  assertNoForbiddenKeys(first.pathModel);
  assertNoForbiddenKeys(first.screening);
  assertNoForbiddenKeys(first.audit);
}

function forcesBySupport(result) {
  return Object.fromEntries(result.screening.supportResults.map((row) => [
    `${row.loadCaseId}:${row.supportKey}`, row.screenedVerticalForceN,
  ]).sort(([left], [right]) => left.localeCompare(right)));
}
function caseForces(result) {
  return result.screening.supportResults.map((row) => row.screenedVerticalForceN);
}
function pathDifferences(result) {
  return result.pathModel.paths.flatMap((path) => path.componentIntervals.map((row) => row.endStationM - row.startStationM));
}
function assertEquilibrium(result) {
  result.screening.pathCases.filter((row) => row.qualification === 'READY').forEach((row) => {
    assert.equal(row.equilibrium.pass, true);
    assertNear(row.equilibrium.screenedSupportForceN, row.equilibrium.appliedForceN, 1e-8);
    const contributions = result.screening.contributions.filter((item) => item.pathId === row.pathId && item.loadCaseId === row.loadCaseId);
    const results = result.screening.supportResults.filter((item) => item.pathId === row.pathId && item.loadCaseId === row.loadCaseId);
    assertNear(contributions.reduce((sum, item) => sum + item.screenedVerticalForceN, 0), results.reduce((sum, item) => sum + item.screenedVerticalForceN, 0), 1e-8);
  });
}
function assertVectorNear(left, right) { assert.equal(left.length, right.length); left.forEach((value, index) => assertNear(value, right[index], 1e-8)); }
function assertNear(actual, expected, tolerance) { assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`); }
function assertNoForbiddenKeys(value) {
  const forbidden = new Set(['stiffness', 'displacement', 'rotation', 'thermalForce', 'guideForce', 'lineStopForce', 'horizontalForce', 'legacyChainage', 'globalChainage', 'routeId', 'reaction']);
  walk(value, (key) => assert.equal(forbidden.has(key), false, `Forbidden output field: ${key}`));
}
function walk(value, visit) {
  if (Array.isArray(value)) return value.forEach((row) => walk(row, visit));
  if (!value || typeof value !== 'object') return;
  Object.entries(value).forEach(([key, row]) => { visit(key); walk(row, visit); });
}
function seeded(seed) { let state = seed >>> 0; return () => { state = (1664525 * state + 1013904223) >>> 0; return state / 0x100000000; }; }
