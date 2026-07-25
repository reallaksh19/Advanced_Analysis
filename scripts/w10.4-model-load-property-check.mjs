import assert from 'node:assert/strict';
import { buildModelLoadFoundation, createDefaultLoadCaseSet } from '../src/core/model-loads/index.js';
import { component, evidence, pipeEvidence, sharedModel, topology } from './w10.4-model-load-fixtures.mjs';

const SEED = 1042026;
let state = SEED;
const random = () => ((state = ((state * 1664525) + 1013904223) >>> 0) / 2 ** 32);

for (let iteration = 0; iteration < 150; iteration += 1) {
  const count = 1 + Math.floor(random() * 8);
  const pipes = Array.from({ length: count }, (_, index) => randomPipe(index));
  const model = sharedModel(pipes);
  const result = buildModelLoadFoundation(model, topology(model));
  assertInvariants(result, model);

  const reversed = sharedModel([...pipes].reverse());
  const reordered = buildModelLoadFoundation(reversed, topology(reversed));
  assert.equal(reordered.loadPrimitiveSet.semanticHash, result.loadPrimitiveSet.semanticHash, seedMessage(iteration, 'component order'));

  const shifted = sharedModel(pipes.map((pipe) => translate(pipe, 100000, -50000, 25000)));
  const translated = buildModelLoadFoundation(shifted, topology(shifted));
  assertTotalsClose(caseTotals(translated), caseTotals(result), seedMessage(iteration, 'translation'));
}

assert.equal(
  createDefaultLoadCaseSet(['OPE', 'HYD', 'EMPTY']).semanticHash,
  createDefaultLoadCaseSet(['EMPTY', 'OPE', 'HYD']).semanticHash,
);

const mm = unitModel('mm', 1000);
const m = unitModel('m', 1);
assertTotalsClose(caseTotals(buildModelLoadFoundation(mm, topology(mm))), caseTotals(buildModelLoadFoundation(m, topology(m))), 'unit conversion');

const base = directMassModel(5);
const scaled = directMassModel(15);
const baseResult = buildModelLoadFoundation(base, topology(base));
const scaledResult = buildModelLoadFoundation(scaled, topology(scaled));
for (const caseId of ['EMPTY', 'HYD', 'OPE']) {
  const baseCase = auditCase(baseResult, caseId);
  const scaledCase = auditCase(scaledResult, caseId);
  assert(Math.abs((scaledCase.totalMassKg / baseCase.totalMassKg) - 3) < 1e-12);
  assert(Math.abs((scaledCase.totalForceN / baseCase.totalForceN) - 3) < 1e-12);
  assert(Math.abs((baseCase.totalForceN / baseCase.totalMassKg) - 9.80665) < 1e-12);
}

const isolated = component('PIPE-ISOLATED', 'PIPE', {
  engineeringProperties: pipeEvidence({ fluidDensityOpeKgM3: undefined }),
});
const isolatedModel = sharedModel([isolated]);
const isolatedResult = buildModelLoadFoundation(isolatedModel, topology(isolatedModel));
assert.equal(auditCase(isolatedResult, 'EMPTY').qualification, 'READY');
assert.equal(auditCase(isolatedResult, 'HYD').qualification, 'READY');
assert(auditCase(isolatedResult, 'OPE').blockers.includes('MISSING_OPE_FLUID_INPUT'));

console.log(`W10.4 property checks passed with fixed seed ${SEED}.`);

function randomPipe(index) {
  const length = 100 + Math.floor(random() * 100000);
  const mass = 0.1 + (random() * 50);
  const ope = random() * 10;
  const hyd = random() * 12;
  return component(`PIPE-PROP-${String(index).padStart(2, '0')}`, 'PIPE', {
    start: { x: index * 200000, y: 0, z: 0 },
    end: { x: (index * 200000) + length, y: 0, z: 0 },
    engineeringProperties: pipeEvidence({
      unitPipeWeightKgPerM: evidence(mass, 'kg/m', `PIPE-${index}-MASS`),
      insulationWeightKgPerM: evidence(0, 'kg/m', `PIPE-${index}-INS`),
      fluidWeightOpeKgPerM: evidence(ope, 'kg/m', `PIPE-${index}-OPE`),
      fluidWeightHydKgPerM: evidence(hyd, 'kg/m', `PIPE-${index}-HYD`),
    }),
  });
}

function translate(pipe, x, y, z) {
  const shift = (point) => point ? { x: point.x + x, y: point.y + y, z: point.z + z } : null;
  return component(pipe.componentKey, pipe.type, {
    start: shift(pipe.geometry.start), end: shift(pipe.geometry.end), center: shift(pipe.geometry.center),
    engineeringProperties: pipe.engineeringProperties,
  });
}

function assertInvariants(result, model) {
  const ids = result.loadPrimitiveSet.primitives.map((row) => row.primitiveId);
  assert.equal(new Set(ids).size, ids.length);
  const cases = new Set(result.loadCaseSet.loadCases.map((row) => row.loadCaseId));
  const components = new Set(model.components.map((row) => row.componentKey));
  for (const primitive of result.loadPrimitiveSet.primitives) {
    assert(cases.has(primitive.loadCaseId));
    assert(components.has(primitive.componentKey));
    assert.equal(primitive.globalVector, null);
    if (primitive.primitiveType === 'DISTRIBUTED_GRAVITY_LOAD') {
      const length = Math.hypot(
        primitive.endPoint.x - primitive.startPoint.x,
        primitive.endPoint.y - primitive.startPoint.y,
        primitive.endPoint.z - primitive.startPoint.z,
      );
      assert(Math.abs(length - primitive.sourceLengthM) < 1e-12);
    }
  }
  const text = JSON.stringify(result);
  for (const forbidden of ['routeId', 'chainage', 'supportId', 'reactionOpeN', 'reactionHydN']) assert(!text.includes(forbidden));
  for (const row of result.readinessAudit.cases) assert(Math.abs((row.totalForceN / row.totalMassKg) - 9.80665) < 1e-10);
}

function unitModel(unit, endCoordinate) {
  return sharedModel([component('PIPE-UNIT', 'PIPE', {
    end: { x: endCoordinate, y: 0, z: 0 },
    engineeringProperties: pipeEvidence({
      unitPipeWeightKgPerM: evidence(4, 'kg/m', 'MASS'),
      insulationWeightKgPerM: evidence(0, 'kg/m', 'INS'),
      fluidWeightOpeKgPerM: evidence(1, 'kg/m', 'OPE'),
      fluidWeightHydKgPerM: evidence(2, 'kg/m', 'HYD'),
    }),
  })], unit);
}

function directMassModel(value) {
  return sharedModel([component('PIPE-SCALE', 'PIPE', {
    engineeringProperties: pipeEvidence({
      unitPipeWeightKgPerM: evidence(value, 'kg/m', 'MASS'),
      insulationWeightKgPerM: evidence(0, 'kg/m', 'INS'),
      fluidWeightOpeKgPerM: evidence(0, 'kg/m', 'OPE'),
      fluidWeightHydKgPerM: evidence(0, 'kg/m', 'HYD'),
    }),
  })]);
}

function caseTotals(result) {
  return result.readinessAudit.cases.map((row) => [row.loadCaseId, row.totalMassKg, row.totalForceN]);
}
function assertTotalsClose(actual, expected, message) {
  assert.equal(actual.length, expected.length, message);
  actual.forEach((row, index) => {
    assert.equal(row[0], expected[index][0], message);
    assert(Math.abs(row[1] - expected[index][1]) < 1e-9, message);
    assert(Math.abs(row[2] - expected[index][2]) < 1e-8, message);
  });
}
function auditCase(result, id) { return result.readinessAudit.cases.find((row) => row.loadCaseId === id); }
function seedMessage(iteration, label) { return `seed=${SEED} iteration=${iteration} invariant=${label}`; }
