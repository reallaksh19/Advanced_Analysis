import assert from 'node:assert/strict';
import { DISPLAY_AUTHORITY } from '../src/core/local-continuum/nodal-projection-display.js';
import { linearizeThroughThickness, STRUCTURAL_STRESS_LAYER } from '../src/core/local-continuum/structural-stress-extraction.js';

// --- Pure membrane: a constant field linearizes to membrane = that
// constant, zero bending, zero peak everywhere. ---
const pureMembrane = linearizeThroughThickness(stations([100, 100, 100, 100, 100]), 'SCL-MEMBRANE');
exact(pureMembrane.membrane.sigmaX, 100);
exact(pureMembrane.bending.sigmaX, 0);
pureMembrane.peakStations.forEach((row) => exact(row.peak.sigmaX, 0));
assert.equal(pureMembrane.recoveryLayer, STRUCTURAL_STRESS_LAYER);

// --- Pure bending: a field varying linearly from -60 to +60 across the
// thickness has zero membrane and an extreme-fibre bending of exactly 60.
// (The 6M/t^2 definition is calibrated so that the linear component's value
// at the outer fibre IS the reported bending stress.) ---
const pureBending = linearizeThroughThickness(stations([-60, -30, 0, 30, 60]), 'SCL-BENDING');
exact(pureBending.membrane.sigmaX, 0);
exact(pureBending.bending.sigmaX, 60);
pureBending.peakStations.forEach((row) => exact(row.peak.sigmaX, 0));

// --- Superposition: membrane 100 + bending 60 decomposes back into
// exactly those two parts with no peak residual. ---
const combined = linearizeThroughThickness(stations([40, 70, 100, 130, 160]), 'SCL-COMBINED');
exact(combined.membrane.sigmaX, 100);
exact(combined.bending.sigmaX, 60);
combined.peakStations.forEach((row) => exact(row.peak.sigmaX, 0));

// --- A nonlinear (notch-like) field leaves a genuine peak residual that is
// NOT collapsed to a single scalar: every station keeps its own residual. ---
const withPeak = linearizeThroughThickness(stations([200, 100, 80, 100, 120]), 'SCL-PEAK');
assert.equal(withPeak.peakStations.length, 5);
assert.ok(withPeak.peakStations.some((row) => Math.abs(row.peak.sigmaX) > 1), 'a nonlinear field must leave a real peak residual');
// The decomposition is exact by construction: membrane + bending*factor + peak
// must reconstruct the original sample at every station.
const original = [200, 100, 80, 100, 120];
withPeak.peakStations.forEach((row, index) => {
  const reconstructed = withPeak.membrane.sigmaX + withPeak.bending.sigmaX * row.throughThicknessFactor + row.peak.sigmaX;
  exact(reconstructed, original[index]);
});

// --- Fail-closed: a display-only (projected/averaged) sample is rejected,
// never silently linearized into a code stress (spec sections 12/13). ---
const displaySamples = stations([100, 100, 100]).map((row) => ({ ...row, authority: DISPLAY_AUTHORITY }));
assert.throws(
  () => linearizeThroughThickness(displaySamples, 'SCL-DISPLAY'),
  /DISPLAY_ONLY_STRESS_NOT_ADMISSIBLE_FOR_LINEARIZATION|not admissible/,
);

// --- Fail-closed: degenerate and malformed lines are rejected. ---
assert.throws(() => linearizeThroughThickness(stations([100]), 'SCL-SHORT'), /INSUFFICIENT_CLASSIFICATION_LINE_SAMPLES|at least two/);
assert.throws(
  () => linearizeThroughThickness([
    { position: 0, stress: zeroStress(100) }, { position: 0, stress: zeroStress(100) },
  ], 'SCL-ZERO'),
  (error) => ['CLASSIFICATION_LINE_SAMPLES_NOT_MONOTONIC', 'DEGENERATE_CLASSIFICATION_LINE'].includes(error.code),
);
assert.throws(
  () => linearizeThroughThickness([
    { position: 0, stress: zeroStress(100) }, { position: 5, stress: zeroStress(100) }, { position: 3, stress: zeroStress(100) },
  ], 'SCL-UNORDERED'),
  (error) => error.code === 'CLASSIFICATION_LINE_SAMPLES_NOT_MONOTONIC',
);

console.log('LAFEA.3 structural-stress linearization (membrane/bending/peak, exact reconstruction, display-only rejection) passed.');

function stations(values) {
  const thickness = 20;
  return values.map((value, index) => ({
    position: thickness * index / (values.length - 1 || 1),
    stress: zeroStress(value),
  }));
}
function zeroStress(sigmaX) { return { sigmaX, sigmaY: 0, sigmaZ: 0, tauXY: 0 }; }
function exact(actual, expected) {
  assert.ok(Math.abs(actual - expected) <= 1e-10 * Math.max(1, Math.abs(expected)), `${actual} != ${expected}`);
}
