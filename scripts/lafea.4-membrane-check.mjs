import assert from 'node:assert/strict';
import {
  buildShellElementEvidence,
  calculateLocalShell,
  createCanonicalLocalShellModel,
} from '../src/core/local-shell/index.js';
import { prescribedPatchSource, triangleSource } from './lafea.4-fixtures.mjs';

checkField({ epsilonX: 0.001, epsilonY: 0, gammaXY: 0 }, [0.001, 0, 0]);
checkField({ epsilonX: 0, epsilonY: -0.0007, gammaXY: 0 }, [0, -0.0007, 0]);
checkField({ epsilonX: 0, epsilonY: 0, gammaXY: 0.0012 }, [0, 0, 0.0012]);
checkField({ epsilonX: 0.001, epsilonY: -0.0004, gammaXY: 0.0006 }, [0.001, -0.0004, 0.0006]);

const base = buildShellElementEvidence(createCanonicalLocalShellModel(triangleSource()))[0];
const doubledE = triangleSource((source) => { source.materials[0].elasticModulus *= 2; });
const thickened = triangleSource((source) => { source.elements[0].thickness *= 3; });
const elementE = buildShellElementEvidence(createCanonicalLocalShellModel(doubledE))[0];
const elementT = buildShellElementEvidence(createCanonicalLocalShellModel(thickened))[0];
close(matrixNorm(elementE.membraneStiffness) / matrixNorm(base.membraneStiffness), 2);
close(matrixNorm(elementT.membraneStiffness) / matrixNorm(base.membraneStiffness), 3);
close(matrixNorm(elementE.membraneConstitutiveMatrix) / matrixNorm(base.membraneConstitutiveMatrix), 2);
close(matrixNorm(elementT.membraneConstitutiveMatrix) / matrixNorm(base.membraneConstitutiveMatrix), 3);
assert.ok(base.qualification.membranePatch.accepted);
assert.ok(base.qualification.membraneConstitutiveSymmetry.accepted);

console.log('LAFEA.4 single-facet and two-facet membrane fields, symmetry, E scaling and thickness scaling passed.');

function checkField(options, expected) {
  const source = prescribedPatchSource({ ...options, curvature: [0, 0, 0] });
  const result = calculateLocalShell(createCanonicalLocalShellModel(source));
  assert.equal(result.qualification.accepted, true);
  for (const element of result.loadCaseResults[0].elementResults) {
    const evidence = result.meshEvidence.elements.find((item) => item.elementId === element.elementId);
    const localExpected = rotateStrain(expected, evidence.localFrame);
    const actual = Object.values(element.membraneStrain);
    actual.forEach((value, index) => close(value, localExpected[index]));
    for (const point of element.integrationPoints) {
      Object.values(point.curvature).forEach((value) => close(value, 0));
      const membrane = point.surfaces[0].membraneStress;
      for (const surface of point.surfaces) {
        assert.deepEqual(surface.membraneStress, membrane);
        assert.deepEqual(surface.combinedStress, membrane);
        Object.values(surface.bendingStress).forEach((value) => close(value, 0));
      }
    }
  }
}

function rotateStrain([epsilonX, epsilonY, gammaXY], frame) {
  const c = frame.ex[0], s = frame.ex[1];
  return [
    c ** 2 * epsilonX + s ** 2 * epsilonY + c * s * gammaXY,
    s ** 2 * epsilonX + c ** 2 * epsilonY - c * s * gammaXY,
    2 * c * s * (epsilonY - epsilonX) + (c ** 2 - s ** 2) * gammaXY,
  ];
}

function matrixNorm(matrix) {
  return Math.sqrt(matrix.flat().reduce((sum, value) => sum + value ** 2, 0));
}

function close(actual, expected, tolerance = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(expected)), `${actual} != ${expected}`);
}
