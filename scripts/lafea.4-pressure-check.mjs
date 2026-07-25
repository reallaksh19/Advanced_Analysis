import assert from 'node:assert/strict';
import {
  calculateLocalShell,
  createCanonicalLocalShellModel,
  FORMULA_IDS,
} from '../src/core/local-shell/index.js';
import { pressurePatchSource } from './lafea.4-fixtures.mjs';

const along = solve(pressurePatchSource('ALONG_ELEMENT_NORMAL'));
const opposite = solve(pressurePatchSource('OPPOSITE_ELEMENT_NORMAL'));
const alongLoads = along.loadCaseResults[0].appliedLoadEvidence;
const oppositeLoads = opposite.loadCaseResults[0].appliedLoadEvidence;
close(alongLoads.appliedForce[0], 0);
close(alongLoads.appliedForce[1], 0);
close(alongLoads.appliedForce[2], 2.5 * 100 * 50);
for (let axis = 0; axis < 3; axis += 1) close(oppositeLoads.appliedForce[axis], -alongLoads.appliedForce[axis]);
for (let axis = 0; axis < 3; axis += 1) close(oppositeLoads.appliedMomentAboutOrigin[axis], -alongLoads.appliedMomentAboutOrigin[axis]);
assert.ok(along.formulaTrace.includes(FORMULA_IDS.PRESSURE_LOAD));
assert.equal(alongLoads.contributions.length, 2);
for (const contribution of alongLoads.contributions) {
  const reconstructed = contribution.nodalForce.map((value) => 3 * value);
  reconstructed.forEach((value, index) => close(value, contribution.totalForce[index]));
  close(norm(contribution.totalForce), contribution.pressure * contribution.representedArea);
}

const thicker = pressurePatchSource('ALONG_ELEMENT_NORMAL');
thicker.elements.forEach((element) => { element.thickness *= 10; });
const thickerResult = solve(thicker);
assert.deepEqual(thickerResult.loadCaseResults[0].appliedLoadEvidence.forceVector, alongLoads.forceVector);

const duplicate = pressurePatchSource();
duplicate.loadCases[0].pressureLoads.push({ ...duplicate.loadCases[0].pressureLoads[0], pressureLoadId: 'OTHER' });
assert.throws(() => createCanonicalLocalShellModel(duplicate), /Duplicate pressure application/);

console.log('LAFEA.4 explicit element-normal pressure resultant, moment, sense reversal and thickness independence passed.');

function solve(source) {
  const result = calculateLocalShell(createCanonicalLocalShellModel(source));
  assert.equal(result.qualification.accepted, true, result.qualification.summary);
  return result;
}

function norm(vector) {
  return Math.hypot(...vector);
}

function close(actual, expected, tolerance = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(expected)), `${actual} != ${expected}`);
}
