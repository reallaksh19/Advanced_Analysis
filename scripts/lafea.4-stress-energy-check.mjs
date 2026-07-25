import assert from 'node:assert/strict';
import {
  calculateLocalShell,
  createCanonicalLocalShellModel,
  stressInvariants,
} from '../src/core/local-shell/index.js';
import { prescribedPatchSource, triangleSource } from './lafea.4-fixtures.mjs';

const result = solve(prescribedPatchSource({
  epsilonX: 0.0008,
  epsilonY: -0.0003,
  gammaXY: 0.0005,
  curvature: [1e-4, -5e-5, 8e-5],
}));
const row = result.loadCaseResults[0];
close(row.totalStrainEnergy, row.elementResults.reduce((sum, item) => sum + item.totalStrainEnergy, 0));
close(row.membraneStrainEnergy, row.elementResults.reduce((sum, item) => sum + item.membraneStrainEnergy, 0));
close(row.bendingStrainEnergy, row.elementResults.reduce((sum, item) => sum + item.bendingStrainEnergy, 0));
close(row.totalStrainEnergy, row.globalStrainEnergy);
close(row.globalStrainEnergy, row.externalWorkIncludingPrescribedReactions);
assert.ok(row.energyQualification.accepted);

for (const element of row.elementResults) {
  for (const point of element.integrationPoints) {
    for (const surface of point.surfaces) {
      const { sigmaX, sigmaY, tauXY } = surface.combinedStress;
      const reconstructed = stressInvariants(sigmaX, sigmaY, tauXY);
      for (const field of ['principalMaximum', 'principalMinimum', 'maximumInPlaneShear', 'vonMises']) close(surface[field], reconstructed[field]);
      close(surface.principalMaximum + surface.principalMinimum, sigmaX + sigmaY);
      close((surface.principalMaximum - sigmaX) * (surface.principalMaximum - sigmaY) - tauXY ** 2, 0, 1e-7);
    }
  }
}

const pureShear = solve(prescribedPatchSource({ epsilonX: 0, epsilonY: 0, gammaXY: 0.001, curvature: [0, 0, 0] }));
const expectedTau = 200000 / (2 * (1 + 0.3)) * 0.001;
for (const element of pureShear.loadCaseResults[0].elementResults) {
  for (const point of element.integrationPoints) {
    for (const surface of point.surfaces) {
      close(surface.principalMaximum, expectedTau);
      close(surface.principalMinimum, -expectedTau);
      close(surface.vonMises, Math.sqrt(3) * expectedTau);
    }
  }
}

const solved = solve(triangleSource());
assert.ok(solved.loadCaseResults[0].energyQualification.accepted);
const serialized = JSON.stringify(solved);
for (const forbidden of ['nodalStress', 'averagedStress', 'smoothedStress', 'extrapolatedStress', 'contourAuthority', 'sigmaZ', 'tauXZ', 'tauYZ']) {
  assert.equal(serialized.includes(forbidden), false, forbidden);
}

console.log('LAFEA.4 same-point stress invariants, membrane/bending/total energy and forbidden stress-field containment passed.');

function solve(source) {
  const value = calculateLocalShell(createCanonicalLocalShellModel(source));
  assert.equal(value.qualification.accepted, true, value.qualification.summary);
  return value;
}

function close(actual, expected, tolerance = 1e-8) {
  assert.ok(Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(expected)), `${actual} != ${expected}`);
}
