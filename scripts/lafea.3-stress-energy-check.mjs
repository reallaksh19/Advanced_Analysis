import assert from 'node:assert/strict';
import {
  calculateLocalContinuum,
  createCanonicalLocalContinuumModel,
  FORMULA_IDS,
  FORMULATIONS,
  principalStress,
  vonMisesStress,
} from '../src/core/local-continuum/index.js';
import { prescribedPatchSource } from './lafea.3-fixtures.mjs';

const shear = calculateLocalContinuum(createCanonicalLocalContinuumModel(
  prescribedPatchSource({ mode: 'SHEAR', gamma: 0.001 }),
));
const shearModulus = 200000 / (2 * (1 + 0.3));
const tau = shearModulus * 0.001;
for (const element of shear.loadCaseResults[0].elementResults) {
  close(element.strain.gammaXY, 0.001);
  close(element.stress.tauXY, tau);
  close(element.principalMaximum, tau);
  close(element.principalMinimum, -tau);
  close(element.vonMises, Math.sqrt(3) * tau);
}
verifyEnergy(shear.loadCaseResults[0]);
assert.equal(shear.loadCaseResults[0].solverEvidence.method, 'FULLY_CONSTRAINED_NO_FREE_SOLVE');
assert.equal(shear.formulaTrace.includes(FORMULA_IDS.CHOLESKY), false);

const rotation = calculateLocalContinuum(createCanonicalLocalContinuumModel(
  prescribedPatchSource({ mode: 'ROTATION' }),
));
for (const element of rotation.loadCaseResults[0].elementResults) {
  close(element.strain.epsilonX, 0);
  close(element.strain.epsilonY, 0);
  close(element.strain.gammaXY, 0);
  close(element.vonMises, 0);
  close(element.strainEnergy, 0);
}
verifyEnergy(rotation.loadCaseResults[0]);

const planeStrain = calculateLocalContinuum(createCanonicalLocalContinuumModel(
  prescribedPatchSource({ formulation: FORMULATIONS.PLANE_STRAIN, mode: 'EXTENSION' }),
));
for (const element of planeStrain.loadCaseResults[0].elementResults) {
  close(element.stress.sigmaZ, 0.3 * (element.stress.sigmaX + element.stress.sigmaY));
}

assert.deepEqual(principalStress(5, 5, 3), { maximum: 8, minimum: 2, radius: 3 });
close(vonMisesStress(10, 10, 10, 0), 0);
close(vonMisesStress(0, 0, 0, 5), Math.sqrt(75));
for (const result of [shear, rotation, planeStrain]) {
  assert.equal('nodalStress' in result, false);
  assert.equal('averagedStress' in result, false);
}

console.log('LAFEA.3 shear, rotation, sigma-z, invariants, energy and formula tracing passed.');

function verifyEnergy(row) {
  close(row.totalStrainEnergy, row.elementResults.reduce((sum, item) => sum + item.strainEnergy, 0));
  assert.equal(row.energyQualification.accepted, true);
}

function close(actual, expected) {
  assert.ok(
    Math.abs(actual - expected) <= 1e-8 * Math.max(1, Math.abs(expected)),
    `${actual} != ${expected}`,
  );
}
