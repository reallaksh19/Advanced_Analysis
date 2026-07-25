import assert from 'node:assert/strict';
import { assembleVerticalBeamSystem } from '../src/core/vertical-beam-solver/index.js';
import { solveBeamFixture } from './w10.6-beam-fixtures.mjs';

const SEED = 1062026;
console.log(`\n--- W10.6 Fixed-Seed Property Checks (seed ${SEED}) ---\n`);
const random = lcg(SEED);
for (let index = 0; index < 12; index += 1) checkGeneratedCase(index, random);
checkOrderOrientationTranslationAndUnits();
checkScalingProperties();
checkMeshSplitInvariance();
checkCaseIsolation();
console.log(`✅ W10.6 fixed-seed property checks passed (seed ${SEED}).\n`);

function checkGeneratedCase(index, random) {
  const left = 1.5 + random() * 3, right = 1.5 + random() * 3;
  const load = 100 + random() * 900, rigidity = 5e5 + random() * 4e6;
  const supportStationsM = index % 2 ? [0, left, left + right] : [0, left + right];
  const result = solveBeamFixture({
    datasetId: `W10.6-PROP-${index}`, lengthsM: [left, right], supportStationsM,
    flexural: { ei: rigidity }, uniformLoadNM: load,
  });
  const row = readyCase(result, 'EMPTY');
  assertProof(row);
  assertUnique(row.nodeResults, 'nodeId');
  assertUnique(row.elementEndForces, 'elementId');
  assertUnique(row.supportForceResults, 'resultId');
  assertReferences(result, row);
  const model = result.foundation.beamModel.pathCases.find((item) => item.loadCaseId === 'EMPTY');
  const matrix = assembleVerticalBeamSystem(model).matrix;
  assert.equal(matrix.every((values, i) => values.every((value, j) => close(value, matrix[j][i], 1e-9))), true);
}

function checkOrderOrientationTranslationAndUnits() {
  const options = { lengthsM: [2, 3], supportStationsM: [0, 5], flexural: { ei: 2e6 }, uniformLoadNM: 700 };
  const baseline = signature(readyCase(solveBeamFixture(options), 'EMPTY'));
  const order = signature(readyCase(solveBeamFixture({ ...options, reverseInputOrder: true }), 'EMPTY'));
  const orientation = signature(readyCase(solveBeamFixture({ ...options, reverseComponentGeometry: true }), 'EMPTY'));
  const translated = signature(readyCase(solveBeamFixture({ ...options, translation: { xM: 120, yM: -35, zM: 8 } }), 'EMPTY'));
  const millimetres = signature(readyCase(solveBeamFixture({ ...options, lengthUnit: 'mm' }), 'EMPTY'));
  const inches = signature(readyCase(solveBeamFixture({ ...options, lengthUnit: 'in' }), 'EMPTY'));
  [order, orientation, translated, millimetres, inches].forEach((value) => assertSignature(value, baseline));
}

function checkScalingProperties() {
  const base = readyCase(solveBeamFixture({ lengthsM: [2, 2], supportStationsM: [0, 4], flexural: { ei: 2e6 }, uniformLoadNM: 300 }), 'EMPTY');
  const loadScaled = readyCase(solveBeamFixture({ lengthsM: [2, 2], supportStationsM: [0, 4], flexural: { ei: 2e6 }, uniformLoadNM: 1200 }), 'EMPTY');
  assertNear(loadScaled.maximumAbsoluteDisplacementM, base.maximumAbsoluteDisplacementM * 4, 1e-9);
  forceValues(loadScaled).forEach((value, index) => assertNear(value, forceValues(base)[index] * 4, 1e-8));

  const rigidScaled = readyCase(solveBeamFixture({ lengthsM: [2, 2], supportStationsM: [0, 4], flexural: { ei: 8e6 }, uniformLoadNM: 300 }), 'EMPTY');
  assertNear(rigidScaled.maximumAbsoluteDisplacementM, base.maximumAbsoluteDisplacementM / 4, 1e-9);
  forceValues(rigidScaled).forEach((value, index) => assertNear(value, forceValues(base)[index], 1e-8));
}

function checkMeshSplitInvariance() {
  const loads = allCases([{ type: 'POINT', componentKey: 'COMP-1', stationM: 2, forceN: 1000 }]);
  const unsplit = readyCase(solveBeamFixture({ lengthsM: [4], supportStationsM: [0, 4], flexural: { ei: 2e6 }, loads }), 'EMPTY');
  const splitLoads = allCases([{ type: 'POINT', componentKey: 'COMP-2', stationM: 2, forceN: 1000 }]);
  const split = readyCase(solveBeamFixture({ lengthsM: [2, 2], supportStationsM: [0, 4], flexural: { ei: 2e6 }, loads: splitLoads }), 'EMPTY');
  assertSignature(signature(split), signature(unsplit));
}

function checkCaseIsolation() {
  const result = solveBeamFixture({
    lengthsM: [2, 2], supportStationsM: [0, 4], flexural: { ei: 2e6 },
    blockedComponentsByCase: { OPE: ['COMP-2'] },
  });
  assert.equal(readyCase(result, 'EMPTY').qualification, 'READY');
  assert.equal(readyCase(result, 'HYD').qualification, 'READY');
  assert.equal(result.solved.solution.pathCases.find((row) => row.loadCaseId === 'OPE').qualification, 'BLOCKED');
}

function assertReferences(result, row) {
  const model = result.foundation.beamModel.pathCases.find((item) => item.pathId === row.pathId && item.loadCaseId === row.loadCaseId);
  const nodeIds = new Set(model.nodes.map((item) => item.nodeId));
  model.elements.forEach((item) => { assert.equal(nodeIds.has(item.startNodeId), true); assert.equal(nodeIds.has(item.endNodeId), true); });
  row.supportForceResults.forEach((item) => assert.equal(model.dofMap.some((dof) => dof.dofId === item.constrainedDofId), true));
}
function signature(row) { return { forces: forceValues(row), displacement: row.maximumAbsoluteDisplacementM, rotation: row.maximumAbsoluteRotationRad, applied: row.appliedForceTotalN }; }
function assertSignature(actual, expected) { actual.forces.forEach((value, index) => assertNear(value, expected.forces[index], 1e-7)); assertNear(actual.displacement, expected.displacement, 1e-9); assertNear(actual.rotation, expected.rotation, 1e-9); assertNear(actual.applied, expected.applied, 1e-9); }
function forceValues(row) { return [...row.supportForceResults].sort((a, b) => a.pathStationM - b.pathStationM).map((item) => item.signedSupportForceN); }
function readyCase(result, id) { const row = result.solved.solution.pathCases.find((item) => item.loadCaseId === id); assert.ok(row); if (id !== 'OPE') assert.equal(row.qualification, 'READY', JSON.stringify(row.blockers)); return row; }
function assertProof(row) { assert.equal(row.forceEquilibrium.pass, true); assert.equal(row.momentEquilibrium.pass, true); assert.equal(row.matrixResidual.pass, true); assert.equal(row.supportDisplacementResidual.pass, true); }
function assertUnique(rows, key) { assert.equal(new Set(rows.map((row) => row[key])).size, rows.length); }
function allCases(rows) { return { EMPTY: structuredClone(rows), OPE: structuredClone(rows), HYD: structuredClone(rows) }; }
function assertNear(actual, expected, tolerance) { assert.ok(Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(expected)), `${actual} != ${expected}`); }
function close(actual, expected, tolerance) { return Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(expected)); }
function lcg(seed) { let state = seed >>> 0; return () => ((state = (1664525 * state + 1013904223) >>> 0) / 2 ** 32); }
