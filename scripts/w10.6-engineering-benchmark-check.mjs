import assert from 'node:assert/strict';
import { runTributarySupportLoadScreening } from '../src/core/support-load-screening/index.js';
import { solveBeamFixture } from './w10.6-beam-fixtures.mjs';

const selected = process.argv[2] || 'all';
const checks = Object.freeze({
  uniform: simplySupportedUniform,
  point: simplySupportedPoint,
  continuous: continuousEqualSpans,
  piecewise: unequalAndPiecewiseCases,
  overhang: overhangCase,
  parity: w105Parity,
});
console.log(`\n--- W10.6 Engineering Benchmark Checks · ${selected} ---\n`);
if (selected === 'all') Object.values(checks).forEach((check) => check());
else if (checks[selected]) checks[selected]();
else throw new TypeError(`Unknown W10.6 engineering benchmark: ${selected}`);
console.log(`✅ W10.6 engineering benchmark ${selected} passed.\n`);

function simplySupportedUniform() {
  const length = 4, load = 1000, rigidity = 2e6;
  const row = readyCase(solveBeamFixture({ lengthsM: [2, 2], supportStationsM: [0, 4], flexural: { ei: rigidity }, uniformLoadNM: load }), 'EMPTY');
  assertForces(row, [load * length / 2, load * length / 2]);
  const expected = 5 * load * length ** 4 / (384 * rigidity);
  assertNear(row.maximumAbsoluteDisplacementM, expected, 1e-11);
  assertProof(row);
}

function simplySupportedPoint() {
  const length = 4, force = 1000, rigidity = 2e6;
  const loads = allCases([{ type: 'POINT', componentKey: 'COMP-1', stationM: 2, forceN: force }]);
  const row = readyCase(solveBeamFixture({ lengthsM: [4], supportStationsM: [0, 4], flexural: { ei: rigidity }, loads }), 'EMPTY');
  assertForces(row, [force / 2, force / 2]);
  assertNear(row.maximumAbsoluteDisplacementM, force * length ** 3 / (48 * rigidity), 1e-12);
  assertProof(row);

  const offCentre = allCases([{ type: 'POINT', componentKey: 'COMP-1', stationM: 1, forceN: force }]);
  const offResult = solveBeamFixture({ lengthsM: [4], supportStationsM: [0, 4], flexural: { ei: rigidity }, loads: offCentre });
  const offRow = readyCase(offResult, 'EMPTY');
  const model = offResult.foundation.beamModel.pathCases.find((item) => item.loadCaseId === 'EMPTY');
  const supportStations = model.constraints.map((item) => item.pathStationM).sort((a, b) => a - b);
  const loadStation = model.loadVectorRecords.find((item) => item.pointForceN !== null).pathStationM;
  const spanLength = supportStations.at(-1) - supportStations[0];
  const localX = loadStation - supportStations[0];
  assertForces(offRow, [force * (spanLength - localX) / spanLength, force * localX / spanLength]);
  assertProof(offRow);
}

function continuousEqualSpans() {
  const length = 4, load = 1000;
  const row = readyCase(solveBeamFixture({ lengthsM: [4, 4], supportStationsM: [0, 4, 8], uniformLoadNM: load, flexural: { ei: 2e6 } }), 'EMPTY');
  assertForces(row, [3 * load * length / 8, 5 * load * length / 4, 3 * load * length / 8]);
  assertProof(row);
}

function unequalAndPiecewiseCases() {
  const unequal = readyCase(solveBeamFixture({ lengthsM: [3, 5], supportStationsM: [0, 3, 8], uniformLoadNM: 600, flexural: { ei: 2e6 } }), 'EMPTY');
  assertForces(unequal, [425, 3160, 1215]);
  assertNear(nodeAt(unequal, 3).rotationRad, 3.75e-4, 1e-12);
  assertProof(unequal);

  const piecewise = readyCase(solveBeamFixture({ lengthsM: [2, 2, 2], supportStationsM: [0, 2, 6], flexuralByComponent: [{ ei: 1e6 }, { ei: 3e6 }, { ei: 2e6 }], uniformLoadNM: 500 }), 'EMPTY');
  assert.equal(piecewise.elementEndForces.length, 3);
  assertForces(piecewise, [201.21951219512195, 1948.170731707317, 850.609756097561]);
  assertNear(nodeAt(piecewise, 4).verticalDisplacementM, 4.62059621e-4, 1e-11);
  assertProof(piecewise);

  const mixedLoads = allCases([
    { type: 'DISTRIBUTED', componentKey: 'COMP-1', forcePerLengthNM: 400 },
    { type: 'POINT', componentKey: 'COMP-2', stationM: 3, forceN: 800 },
  ]);
  const mixed = readyCase(solveBeamFixture({ lengthsM: [2, 2], supportStationsM: [0, 4], flexural: { ei: 2e6 }, loads: mixedLoads }), 'EMPTY');
  assertProof(mixed);

  const atSupport = allCases([{ type: 'POINT', componentKey: 'COMP-2', stationM: 2, forceN: 900 }]);
  const supportLoad = readyCase(solveBeamFixture({ lengthsM: [2, 2], supportStationsM: [0, 2, 4], flexural: { ei: 2e6 }, loads: atSupport }), 'EMPTY');
  assertNear(supportLoad.supportForceResults.find((item) => item.pathStationM === 2).upwardSupportForceN, 900, 1e-9);
  assertProof(supportLoad);
}

function overhangCase() {
  const loads = allCases([
    { type: 'DISTRIBUTED', componentKey: 'COMP-3', forcePerLengthNM: 400 },
  ]);
  const row = readyCase(solveBeamFixture({ lengthsM: [2, 2, 2], supportStationsM: [0, 4], flexural: { ei: 2e6 }, loads }), 'EMPTY');
  assert.equal(row.nodeResults.at(-1).pathStationM, 6);
  assert.equal(row.supportForceResults.length, 2);
  assert.equal(row.supportForceResults.some((item) => item.diagnostics.some((diagnostic) => diagnostic.code === 'SUPPORT_UPLIFT_OR_DIRECTION_REVERSAL')), true);
  assertProof(row);
}

function w105Parity() {
  const loads = allCases([
    { type: 'DISTRIBUTED', componentKey: 'COMP-1', forcePerLengthNM: 300 },
    { type: 'POINT', componentKey: 'COMP-2', stationM: 3, forceN: 700 },
  ]);
  const fixture = solveBeamFixture({ lengthsM: [2, 2], supportStationsM: [0, 4], flexural: { ei: 2e6 }, loads });
  const screening = runTributarySupportLoadScreening(fixture.pathFoundation, {
    loadCaseSet: fixture.loadFoundation.loadCaseSet,
    loadPrimitiveSet: fixture.loadFoundation.loadPrimitiveSet,
    modelLoadReadinessAudit: fixture.loadFoundation.readinessAudit,
  }).screening;
  const beam = readyCase(fixture, 'EMPTY');
  const screened = screening.supportResults.filter((item) => item.loadCaseId === 'EMPTY').sort(byStation);
  const solved = [...beam.supportForceResults].sort(byStation);
  assert.equal(screened.length, solved.length);
  screened.forEach((item, index) => assertNear(solved[index].upwardSupportForceN, item.screenedVerticalForceN, 1e-7));
}

function readyCase(result, id) {
  const row = result.solved.solution.pathCases.find((item) => item.loadCaseId === id);
  assert.equal(row.qualification, 'READY', JSON.stringify(row.blockers));
  return row;
}
function assertForces(row, expected) {
  const actual = [...row.supportForceResults].sort(byStation).map((item) => item.upwardSupportForceN);
  assert.equal(actual.length, expected.length);
  expected.forEach((value, index) => assertNear(actual[index], value, 1e-7));
}
function assertProof(row) {
  assert.equal(row.forceEquilibrium.pass, true);
  assert.equal(row.momentEquilibrium.pass, true);
  assert.equal(row.matrixResidual.pass, true);
  assert.equal(row.supportDisplacementResidual.pass, true);
}
function nodeAt(row, stationM) {
  const node = row.nodeResults.find((item) => item.pathStationM === stationM);
  assert.ok(node, `Missing node result at station ${stationM} m.`);
  return node;
}
function allCases(rows) { return { EMPTY: structuredClone(rows), OPE: structuredClone(rows), HYD: structuredClone(rows) }; }
function byStation(a, b) { return a.pathStationM - b.pathStationM; }
function assertNear(actual, expected, tolerance) { assert.ok(Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(expected)), `${actual} != ${expected}`); }
