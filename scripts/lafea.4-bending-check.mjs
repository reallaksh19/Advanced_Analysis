import assert from 'node:assert/strict';
import {
  buildShellElementEvidence,
  calculateLocalShell,
  createCanonicalLocalShellModel,
} from '../src/core/local-shell/index.js';
import { prescribedPatchSource, triangleSource } from './lafea.4-fixtures.mjs';

const rigidTranslation = solve(prescribedPatchSource({ mode: 'RIGID_TRANSLATION', w: 4 }));
const rigidRotation = solve(prescribedPatchSource({ mode: 'RIGID_ROTATION', omega: [0.002, -0.001, 0.003] }));
for (const result of [rigidTranslation, rigidRotation]) {
  for (const element of result.loadCaseResults[0].elementResults) {
    Object.values(element.membraneStrain).forEach((value) => close(value, 0));
    for (const point of element.integrationPoints) {
      Object.values(point.curvature).forEach((value) => close(value, 0, 1e-8));
      point.surfaces.forEach((surface) => close(surface.vonMises, 0, 1e-7));
    }
  }
}

const curvature = [1e-4, -2e-4, 3e-4];
const positive = solve(prescribedPatchSource({ epsilonX: 0, epsilonY: 0, gammaXY: 0, curvature }));
const negative = solve(prescribedPatchSource({ epsilonX: 0, epsilonY: 0, gammaXY: 0, curvature: curvature.map((value) => -value) }));
for (let elementIndex = 0; elementIndex < positive.loadCaseResults[0].elementResults.length; elementIndex += 1) {
  const plus = positive.loadCaseResults[0].elementResults[elementIndex];
  const minus = negative.loadCaseResults[0].elementResults[elementIndex];
  const evidence = positive.meshEvidence.elements.find((item) => item.elementId === plus.elementId);
  const localCurvature = rotateTensor(curvature, evidence.localFrame);
  for (let pointIndex = 0; pointIndex < plus.integrationPoints.length; pointIndex += 1) {
    const plusPoint = plus.integrationPoints[pointIndex];
    const minusPoint = minus.integrationPoints[pointIndex];
    Object.values(plusPoint.curvature).forEach((value, index) => close(value, localCurvature[index]));
    Object.values(minusPoint.curvature).forEach((value, index) => close(value, -localCurvature[index]));
    const bottom = plusPoint.surfaces.find((surface) => surface.surface === 'BOTTOM');
    const middle = plusPoint.surfaces.find((surface) => surface.surface === 'MIDSURFACE');
    const top = plusPoint.surfaces.find((surface) => surface.surface === 'TOP');
    for (const field of ['sigmaX', 'sigmaY', 'tauXY']) {
      close(top.bendingStress[field], -bottom.bendingStress[field]);
      close(middle.bendingStress[field], 0);
      close(minusPoint.surfaces.find((surface) => surface.surface === 'TOP').bendingStress[field], -top.bendingStress[field]);
    }
  }
}

const base = buildShellElementEvidence(createCanonicalLocalShellModel(triangleSource()))[0];
const doubledE = triangleSource((source) => { source.materials[0].elasticModulus *= 2; });
const doubledT = triangleSource((source) => { source.elements[0].thickness *= 2; });
const elementE = buildShellElementEvidence(createCanonicalLocalShellModel(doubledE))[0];
const elementT = buildShellElementEvidence(createCanonicalLocalShellModel(doubledT))[0];
close(matrixNorm(elementE.bendingStiffness) / matrixNorm(base.bendingStiffness), 2);
close(matrixNorm(elementT.bendingStiffness) / matrixNorm(base.bendingStiffness), 8);
assert.ok(base.qualification.bendingPatch.accepted);
assert.ok(base.qualification.bendingConstitutiveSymmetry.accepted);
assert.equal(JSON.stringify(positive).includes('transverseShear'), false);
assert.equal(JSON.stringify(positive).includes('drilling'), false);

console.log('LAFEA.4 DKT rigid modes, constant curvature, sign reversal, E and t^3 scaling and surface stress separation passed.');

function solve(source) {
  const result = calculateLocalShell(createCanonicalLocalShellModel(source));
  assert.equal(result.qualification.accepted, true);
  return result;
}

function rotateTensor([x, y, xy], frame) {
  const c = frame.ex[0], s = frame.ex[1];
  return [
    c ** 2 * x + s ** 2 * y + c * s * xy,
    s ** 2 * x + c ** 2 * y - c * s * xy,
    2 * c * s * (y - x) + (c ** 2 - s ** 2) * xy,
  ];
}

function matrixNorm(matrix) {
  return Math.sqrt(matrix.flat().reduce((sum, value) => sum + value ** 2, 0));
}

function close(actual, expected, tolerance = 1e-8) {
  assert.ok(Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(expected)), `${actual} != ${expected}`);
}
