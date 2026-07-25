import assert from 'node:assert/strict';
import {
  createT3Geometry,
  planeStrainMatrix,
  planeStressMatrix,
  solveContinuumModel,
  validateContinuumResult,
} from '../src/core/element-fea/index.js';
import {
  edgePressure,
  edgeTraction,
  fixedLoadedModel,
  handCheckModel,
  node,
  partiallyPrescribedModel,
  prescribedFieldModel,
  squarePatch,
} from './lfea-001-fixtures.mjs';

const close = (actual, expected, tolerance = 1e-10) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
const vectorClose = (actual, expected, tolerance = 1e-10) => {
  assert.equal(actual.length, expected.length);
  actual.forEach((value, index) => close(value, expected[index], tolerance));
};
const qualified = (model, loadCaseIdentity) => {
  const result = solveContinuumModel(model, loadCaseIdentity);
  assert.equal(result.status, 'QUALIFIED', JSON.stringify(result.diagnostics));
  assert.equal(validateContinuumResult(result).ok, true);
  return result;
};

const geometry = createT3Geometry([node('N1', 0, 0), node('N2', 100, 0), node('N3', 0, 100)]);
close(geometry.area, 5000);
assert.deepEqual(geometry.B, [
  [-0.01, 0, 0.01, 0, 0, 0],
  [0, -0.01, 0, 0, 0, 0.01],
  [-0.01, -0.01, 0, 0.01, 0.01, 0],
]);
assert.deepEqual(planeStressMatrix(15, 0.25), [[16, 4, 0], [4, 16, 0], [0, 0, 6]]);
assert.deepEqual(planeStrainMatrix(100, 0.25), [[120, 40, 0], [40, 120, 0], [0, 0, 40]]);

const hand = qualified(handCheckModel());
vectorClose(hand.elementStrains[0].values, [0.01, 0, 0]);
vectorClose(hand.elementStresses[0].values, [0.16, 0.04, 0]);
vectorClose(hand.elementInternalForces[0].values, [-16, -4, 16, 0, 0, 4]);
close(hand.strainEnergy, 8);
close(hand.elementStrainEnergy[0].value, 8);
close(hand.energyConsistency.absoluteDifference, 0);
assert.equal(hand.modelSemanticHash, hand.modelEvidence.semanticHash);
const tampered = structuredClone(hand); tampered.strainEnergy = 99;
assert.equal(validateContinuumResult(tampered).ok, false);

const patch = qualified(squarePatch((x, y) => [0.1 + 0.02 * x + 0.03 * y, -0.2 + 0.04 * x + 0.05 * y]));
patch.elementStrains.forEach((row) => vectorClose(row.values, [0.02, 0.05, 0.07]));
patch.elementStresses.forEach((row) => vectorClose(row.values, [3.466666666666667, 5.866666666666667, 2.8], 1e-9));
close(patch.equilibriumTotals.fx, 0); close(patch.equilibriumTotals.fy, 0); close(patch.equilibriumTotals.mz, 0);

const translation = qualified(prescribedFieldModel(() => [0.4, -0.3]));
vectorClose(translation.elementStrains[0].values, [0, 0, 0]);
const rotation = qualified(prescribedFieldModel((x, y) => [-0.2 * y, 0.2 * x]));
vectorClose(rotation.elementStrains[0].values, [0, 0, 0]);

const planeStress = qualified(prescribedFieldModel((x, y) => [0.01 * x, -0.0025 * y]));
vectorClose(planeStress.elementStresses[0].values, [1, 0, 0], 1e-10);
close(planeStress.elementStresses[0].sigmaZ, 0);
close(planeStress.vonMisesStress[0].value, 1);

const planeStrain = qualified(prescribedFieldModel((x) => [0.01 * x, 0], { formulation: 'PLANE_STRAIN' }));
vectorClose(planeStrain.elementStresses[0].values, [1.2, 0.4, 0], 1e-10);
close(planeStrain.elementStresses[0].sigmaZ, 0.4);
close(planeStrain.vonMisesStress[0].value, 0.8);
vectorClose(planeStrain.principalStresses[0].values, [1.2, 0.4, 0.4]);

const shear = qualified(prescribedFieldModel((_x, y) => [0.02 * y, 0]));
vectorClose(shear.elementStrains[0].values, [0, 0, 0.02]);
vectorClose(shear.elementStresses[0].values, [0, 0, 0.8]);
close(shear.principalStresses[0].inPlane[0], 0.8);
close(shear.principalStresses[0].inPlane[1], -0.8);
close(shear.principalStresses[0].angleRadians, Math.PI / 4);
close(shear.vonMisesStress[0].value, Math.sqrt(3) * 0.8);

const biaxial = qualified(prescribedFieldModel((x, y) => [0.01 * x, 0.015 * y]));
vectorClose(biaxial.elementStrains[0].values, [0.01, 0.015, 0]);

const angle = Math.PI / 5;
const c = Math.cos(angle); const s = Math.sin(angle);
const rotated = qualified(prescribedFieldModel((x, y) => [0.01 * x, 0.02 * y], {
  nodes: [node('N1', 0, 0), node('N2', c, s), node('N3', -s, c)],
}));
vectorClose(rotated.elementStrains[0].values, [0.01, 0.02, 0], 1e-10);

const imposed = qualified(partiallyPrescribedModel());
assert.ok(imposed.constraintPartition.imposedDisplacementLoad.some((value) => Math.abs(value) > 0));
assert.equal(imposed.nodalDisplacements.find((row) => row.equationIdentity === 'N2:UX').value, 0.01);
assert.ok(imposed.freeDofResidual.infinityNorm <= 1e-9);

const traction = qualified(fixedLoadedModel(edgeTraction('T1', 'E1', ['N2', 'N3'], 4, -2)));
const length = Math.sqrt(2);
close(traction.appliedLoadTotals.fx, 4 * length);
close(traction.appliedLoadTotals.fy, -2 * length);
close(traction.reactionTotals.fx, -4 * length);
close(traction.reactionTotals.fy, 2 * length);
vectorClose(traction.edgeLoadEvidence[0].integratedForce, [4 * length, -2 * length]);

const pressure = qualified(fixedLoadedModel(edgePressure('P1', 'E1', ['N3', 'N2'], 3)));
close(pressure.appliedLoadTotals.fx, -3);
close(pressure.appliedLoadTotals.fy, -3);
vectorClose(pressure.edgeLoadEvidence[0].outwardNormal, [1 / Math.sqrt(2), 1 / Math.sqrt(2)]);
assert.deepEqual(pressure.edgeLoadEvidence[0].orderedNodeIds, ['N2', 'N3']);

for (const result of [hand, patch, translation, rotation, planeStress, planeStrain, shear, biaxial, rotated, imposed, traction, pressure]) {
  assert.ok(result.freeDofResidual.infinityNorm <= 1e-8);
  assert.ok(result.globalResidual.infinityNorm <= 1e-8);
  assert.ok(Math.abs(result.equilibriumTotals.fx) <= 1e-8);
  assert.ok(Math.abs(result.equilibriumTotals.fy) <= 1e-8);
  assert.ok(Math.abs(result.equilibriumTotals.mz) <= 1e-8);
}
console.log('LFEA-001 numerical formulation, patch, load, constraint, recovery, residual and energy fixtures passed.');
