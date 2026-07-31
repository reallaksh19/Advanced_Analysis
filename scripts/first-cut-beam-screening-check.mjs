import assert from 'node:assert/strict';
import { recoverBeamSag } from '../src/core/first-cut-load-estimation/index.js';
import { validateVerticalBeamSolution } from '../src/core/vertical-beam-solver/index.js';
import { solveBeamFixture } from './w10.6-beam-fixtures.mjs';

const fixture = solveBeamFixture({
  datasetId: 'FIRST-CUT-BEAM-[SIMULATED]',
  lengthsM: [2, 2],
  supportStationsM: [0, 2, 4],
  uniformLoadNM: 1000,
});
const solution = fixture.solved.solution;
assert(validateVerticalBeamSolution(solution).ok, 'BEAM-01 solution contract');

for (const pathCase of solution.pathCases) {
  assert.equal(pathCase.qualification, 'READY', `BEAM-02 ${pathCase.loadCaseId}`);
  const reactionSum = pathCase.supportForceResults
    .reduce((sum, row) => sum + row.signedSupportForceN, 0);
  assertNear(reactionSum, -4000, 1e-10, `BEAM-03 ${pathCase.loadCaseId} force equilibrium`);
  assert.equal(pathCase.supportForceResults.length, 3, `BEAM-04 ${pathCase.loadCaseId}`);
}

const sag = recoverBeamSag({
  beamModel: fixture.foundation.beamModel,
  solution,
  sagCriterion: null,
});
assert.equal(sag.status, 'CONDITIONAL', 'SAG-B01 missing project criterion');
assertNear(sag.maximumAbsoluteSagM, 0.00004332897284662983, 1e-10, 'SAG-02 exact continuous-beam field');
console.log('✅ [SIMULATED] First-cut continuous-beam and exact sag checks passed.');

function assertNear(actual, expected, tolerance, label) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(expected)),
    `${label}: ${actual} != ${expected}`,
  );
}
