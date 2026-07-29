#!/usr/bin/env node

/**
 * LAFEA S-4 resultant recovery check.
 *
 * Covers `src/core/local-shell/resultant-recovery.js` and `surface-stress.js`:
 * membrane force resultants (N), bending moment resultants (M), and both
 * stress invariants at every surface — read from evidence the shell kernel
 * already computes, without touching the DKT or CST formulation.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  bendingResultant,
  calculateLocalShell,
  createCanonicalLocalShellModel,
  matrixVector,
  membraneResultant,
  recoverShellResultants,
  surfaceResultant,
} from '../src/core/local-shell/index.js';
import {
  cylindricalSource,
  patchSource,
  prescribedPatchSource,
  triangleSource,
} from './lafea.4-fixtures.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Algebraic identities against already-computed kernel evidence: exact. */
const EXACT = 1e-12;

console.log('\n--- LAFEA S-4 resultant recovery check ---');
checkPureMembrane();
checkPureBending();
checkSurfaceAdditivity();
checkCylindricalHoopStress();
checkThicknessPerElement();
checkBothInvariants();
checkNoRederivation();
checkTopLevelRecovery();
checkSourceGuard();
console.log('\n✅ LAFEA S-4 resultant recovery check passed.\n');

function solve(source) {
  const result = calculateLocalShell(createCanonicalLocalShellModel(source));
  assert.equal(result.qualification.accepted, true, result.qualification.summary);
  return result;
}

function elementsOf(result) {
  return result.loadCaseResults[0].elementResults.map((elementResult) => ({
    elementResult,
    meshElement: result.meshEvidence.elements.find((item) => item.elementId === elementResult.elementId),
  }));
}

function checkPureMembrane() {
  // Test 1: pure in-plane tension on a flat patch. sigma_b = 0 exactly,
  // sigma_m = N / t exactly.
  const result = solve(prescribedPatchSource({ epsilonX: 0.0012, epsilonY: -0.0003, gammaXY: 0.0005, curvature: [0, 0, 0] }));
  for (const { elementResult, meshElement } of elementsOf(result)) {
    const membrane = membraneResultant(meshElement, elementResult);
    assertClose(membrane.membraneStress.sigmaX, membrane.Nxx / meshElement.thickness, EXACT, 'sigma_m = N/t (xx)');
    assertClose(membrane.membraneStress.sigmaY, membrane.Nyy / meshElement.thickness, EXACT, 'sigma_m = N/t (yy)');
    assertClose(membrane.membraneStress.tauXY, membrane.Nxy / meshElement.thickness, EXACT, 'sigma_m = N/t (xy)');
    elementResult.integrationPoints.forEach((point, index) => {
      const bending = bendingResultant(meshElement, elementResult, index);
      assertClose(bending.Mxx, 0, EXACT, 'Mxx under pure membrane load');
      assertClose(bending.Myy, 0, EXACT, 'Myy under pure membrane load');
      assertClose(bending.Mxy, 0, EXACT, 'Mxy under pure membrane load');
      point.surfaces.forEach((surface) => {
        const record = surfaceResultant(meshElement, elementResult, index, surface.surface);
        assertClose(record.bendingStress.sigmaX, 0, EXACT, 'sigma_b(xx) under pure membrane load');
        assertClose(record.bendingStress.sigmaY, 0, EXACT, 'sigma_b(yy) under pure membrane load');
        assertClose(record.bendingStress.tauXY, 0, EXACT, 'sigma_b(xy) under pure membrane load');
      });
    });
  }
  console.log('✅ Pure membrane load: M and sigma_b are exactly zero; sigma_m = N/t exactly.');
}

function checkPureBending() {
  // Test 2: pure bending. sigma_m = 0 exactly, sigma_b = 6M/t^2 exactly.
  const curvature = [1.5e-4, -2.5e-4, 3e-4];
  const result = solve(prescribedPatchSource({ epsilonX: 0, epsilonY: 0, gammaXY: 0, curvature }));
  for (const { elementResult, meshElement } of elementsOf(result)) {
    const membrane = membraneResultant(meshElement, elementResult);
    assertClose(membrane.Nxx, 0, EXACT, 'Nxx under pure bending load');
    assertClose(membrane.Nyy, 0, EXACT, 'Nyy under pure bending load');
    assertClose(membrane.Nxy, 0, EXACT, 'Nxy under pure bending load');
    const t2 = meshElement.thickness ** 2;
    elementResult.integrationPoints.forEach((point, index) => {
      const bending = bendingResultant(meshElement, elementResult, index);
      const top = surfaceResultant(meshElement, elementResult, index, 'TOP');
      assertClose(top.bendingStress.sigmaX, 6 * bending.Mxx / t2, EXACT, 'sigma_b = 6M/t^2 (xx)');
      assertClose(top.bendingStress.sigmaY, 6 * bending.Myy / t2, EXACT, 'sigma_b = 6M/t^2 (yy)');
      assertClose(top.bendingStress.tauXY, 6 * bending.Mxy / t2, EXACT, 'sigma_b = 6M/t^2 (xy)');
    });
  }
  console.log('✅ Pure bending load: N is exactly zero; sigma_b = 6M/t^2 exactly.');
}

function checkSurfaceAdditivity() {
  // Test 3: surface stress equals membrane plus bending at every surface;
  // bending at BOTTOM is the negative of bending at TOP.
  const result = solve(prescribedPatchSource({ epsilonX: 0.0006, epsilonY: 0.0002, gammaXY: -0.0003, curvature: [1e-4, -1e-4, 5e-5] }));
  for (const { elementResult, meshElement } of elementsOf(result)) {
    elementResult.integrationPoints.forEach((point, index) => {
      const [bottom, middle, top] = ['BOTTOM', 'MIDSURFACE', 'TOP'].map(
        (name) => surfaceResultant(meshElement, elementResult, index, name),
      );
      for (const surface of [bottom, middle, top]) {
        for (const field of ['sigmaX', 'sigmaY', 'tauXY']) {
          assertClose(surface.surfaceStress[field], surface.membraneStress[field] + surface.bendingStress[field], EXACT, `surface stress additivity (${surface.surface}.${field})`);
        }
      }
      for (const field of ['sigmaX', 'sigmaY', 'tauXY']) {
        assertClose(bottom.bendingStress[field], -top.bendingStress[field], EXACT, `bottom/top bending antisymmetry (${field})`);
        assertClose(bottom.surfaceStress[field], bottom.membraneStress[field] - top.bendingStress[field], EXACT, `bottom = membrane - top bending (${field})`);
      }
    });
  }
  console.log('✅ Surface stress = membrane + bending at every surface; BOTTOM = membrane - TOP bending.');
}

function checkCylindricalHoopStress() {
  // Test 4: pressurised-cylinder equivalent, matching the plan's literal
  // sigma_theta = p*R/t. For a thin cylinder with free (unrestrained) axial
  // ends under uniform internal pressure, equilibrium alone gives sigma_axial
  // = 0, so the membrane constitutive relation collapses to sigma_theta =
  // E * epsilon_theta, and epsilon_theta = pR/(Et) makes the two the same
  // statement. The displacement field imposed here is exactly this case:
  // uniform radial growth w = epsilon_theta * R (which, geometrically, is
  // what turns a uniform radial offset into a uniform hoop strain on a
  // circular arc), plus the Poisson axial contraction u_x = -nu * epsilon_theta
  // * x that free ends require, and no imposed rotation. Free axial ends
  // means sigma_axial should come out exactly zero, not assumed --- checked
  // below alongside the hoop stress and the bending resultant.
  // This displacement field is the exact analytical membrane solution (linear
  // in the nodal coordinates within each flat facet), so CST/DKT represents it
  // without discretisation error at any mesh density: this is a patch test,
  // not a convergence study. Every segment count is checked to a floating
  // -point-scale tolerance, and mesh independence is asserted directly rather
  // than assumed.
  const strain = 0.0008;
  const elasticModulus = 200000;
  const poissonRatio = 0.3;
  const scale = Math.abs(elasticModulus * strain);
  const passes = [4, 8, 16, 32].map((segments) => hoopStressError(segments, strain, elasticModulus, poissonRatio));
  for (const pass of passes) {
    assert.ok(pass.stressError < 1e-8 * scale, `hoop stress not exact at segments=${pass.segments}: ${JSON.stringify(pass)}`);
    assert.ok(pass.axialStressScale < 1e-8 * scale, `axial stress not exactly zero at segments=${pass.segments}: ${JSON.stringify(pass)}`);
    assert.ok(pass.bendingScale < 1e-8 * pass.membraneScale, `bending not exactly zero at segments=${pass.segments}: ${JSON.stringify(pass)}`);
  }
  console.log('✅ Cylindrical patch: hoop membrane stress matches the thin-shell E*epsilon (= pR/t) value at every mesh density; axial stress and bending vanish, as free ends require.');
}

function hoopStressError(segments, strain, elasticModulus, poissonRatio) {
  const source = cylindricalSource(segments);
  const radius = 100;
  source.constraints = source.nodes.flatMap((node) => {
    const [x] = node.position;
    const w = strain * radius;
    const axial = -poissonRatio * strain * x;
    const displacement = node.director.map((value) => value * w).map((value, index) => value + (index === 0 ? axial : 0));
    const values = [...displacement, 0, 0];
    return ['UX', 'UY', 'UZ', 'R1', 'R2'].map((dof, index) => ({
      constraintId: `C-${node.nodeId}-${dof}`,
      nodeId: node.nodeId,
      dof,
      value: values[index],
      sourceReference: `C-${node.nodeId}-${dof}-SRC`,
    }));
  });
  const result = solve(source);
  let stressError = 0;
  let axialStressScale = 0;
  let bendingScale = 0;
  let membraneScale = 0;
  const axial = [1, 0, 0];
  for (const { elementResult, meshElement } of elementsOf(result)) {
    const membrane = membraneResultant(meshElement, elementResult);
    const tangent = circumferentialTangent(source, meshElement.nodeIds);
    const [ha, hb] = localDirection(tangent, meshElement.localFrame);
    const [aa, ab] = localDirection(axial, meshElement.localFrame);
    const hoopStress = projectStress(membrane.membraneStress, ha, hb);
    const axialStress = projectStress(membrane.membraneStress, aa, ab);
    stressError = Math.max(stressError, Math.abs(hoopStress - elasticModulus * strain));
    axialStressScale = Math.max(axialStressScale, Math.abs(axialStress));
    membraneScale = Math.max(membraneScale, Math.abs(membrane.Nxx), Math.abs(membrane.Nyy), Math.abs(membrane.Nxy));
    elementResult.integrationPoints.forEach((point, index) => {
      const bending = bendingResultant(meshElement, elementResult, index);
      bendingScale = Math.max(bendingScale, Math.abs(bending.Mxx), Math.abs(bending.Myy), Math.abs(bending.Mxy));
    });
  }
  return { segments, stressError, axialStressScale, bendingScale, membraneScale };
}

function projectStress(stress, a, b) {
  return a ** 2 * stress.sigmaX + b ** 2 * stress.sigmaY + 2 * a * b * stress.tauXY;
}

function circumferentialTangent(source, nodeIds) {
  const centroid = nodeIds.map((nodeId) => source.nodes.find((node) => node.nodeId === nodeId).position)
    .reduce((total, position) => total.map((value, index) => value + position[index]), [0, 0, 0])
    .map((value) => value / 3);
  const angle = Math.atan2(centroid[1], centroid[2]);
  return [0, Math.cos(angle), -Math.sin(angle)];
}

function localDirection(globalVector, frame) {
  const a = dot3(globalVector, frame.ex);
  const b = dot3(globalVector, frame.ey);
  const length = Math.hypot(a, b);
  return [a / length, b / length];
}

function dot3(a, b) {
  return a.reduce((sum, value, index) => sum + value * b[index], 0);
}

function checkThicknessPerElement() {
  // Test 5: thickness is reported per element and reflects a per-element step
  // — the shape a reinforcing pad takes before the mesher (S-1/S-2) exists.
  const source = patchSource((model) => { model.elements[1].thickness = 5; });
  const result = solve(source);
  const reported = new Map();
  for (const { elementResult, meshElement } of elementsOf(result)) {
    const membrane = membraneResultant(meshElement, elementResult);
    reported.set(elementResult.elementId, membrane.thickness);
    elementResult.integrationPoints.forEach((point, index) => {
      const surface = surfaceResultant(meshElement, elementResult, index, 'TOP');
      assert.equal(surface.thickness, meshElement.thickness);
    });
  }
  assert.equal(reported.get('E1'), 2);
  assert.equal(reported.get('E2'), 5);
  console.log('✅ Thickness is reported per element and reflects a per-element step.');
}

function checkBothInvariants() {
  // Test 6: both invariants are present everywhere, and von Mises never
  // exceeds the stress intensity — a mathematical identity for sigma3 = 0.
  const fixtures = [
    prescribedPatchSource({ epsilonX: 0.001, epsilonY: -0.0006, gammaXY: 0.0009, curvature: [0, 0, 0] }),
    prescribedPatchSource({ epsilonX: 0, epsilonY: 0, gammaXY: 0, curvature: [2e-4, -1e-4, 1.5e-4] }),
    triangleSource(),
  ];
  let checked = 0;
  for (const source of fixtures) {
    const result = solve(source);
    for (const { elementResult, meshElement } of elementsOf(result)) {
      const membrane = membraneResultant(meshElement, elementResult);
      checkPair(membrane.membraneStressEquivalents);
      checked += 1;
      elementResult.integrationPoints.forEach((point, index) => {
        for (const surfaceName of ['BOTTOM', 'MIDSURFACE', 'TOP']) {
          const surface = surfaceResultant(meshElement, elementResult, index, surfaceName);
          checkPair(surface.membraneStressEquivalents);
          checkPair(surface.bendingStressEquivalents);
          checkPair(surface.surfaceStressEquivalents);
          checked += 3;
        }
      });
    }
  }
  assert.ok(checked > 50, `expected substantial coverage, got ${checked} checks`);
  console.log(`✅ Both invariants present at every point (${checked} checks); von Mises never exceeds stress intensity.`);

  function checkPair(equivalents) {
    assert.ok(Number.isFinite(equivalents.vonMises));
    assert.ok(Number.isFinite(equivalents.stressIntensity));
    assert.ok(
      equivalents.vonMises <= equivalents.stressIntensity + 1e-9,
      `von Mises ${equivalents.vonMises} exceeded stress intensity ${equivalents.stressIntensity}`,
    );
  }
}

function checkNoRederivation() {
  // Test 7: every resultant is bit-identical to a hand product of already
  // -published kernel matrices; every stress tensor is the same object the
  // kernel already recovered, not an independently recomputed copy.
  const result = solve(prescribedPatchSource({ epsilonX: 0.0007, epsilonY: -0.0002, gammaXY: 0.0004, curvature: [1e-4, -5e-5, 2e-5] }));
  for (const { elementResult, meshElement } of elementsOf(result)) {
    const strain = [elementResult.membraneStrain.epsilonX, elementResult.membraneStrain.epsilonY, elementResult.membraneStrain.gammaXY];
    const handDerivedN = matrixVector(meshElement.membraneConstitutiveMatrix, strain);
    const membrane = membraneResultant(meshElement, elementResult);
    assert.equal(membrane.Nxx, handDerivedN[0]);
    assert.equal(membrane.Nyy, handDerivedN[1]);
    assert.equal(membrane.Nxy, handDerivedN[2]);
    assert.equal(membrane.membraneStress, elementResult.membraneStress);
    elementResult.integrationPoints.forEach((point, index) => {
      const curvature = [point.curvature.kappaX, point.curvature.kappaY, point.curvature.kappaXY];
      const handDerivedM = matrixVector(meshElement.bendingConstitutiveMatrix, curvature);
      const bending = bendingResultant(meshElement, elementResult, index);
      assert.equal(bending.Mxx, handDerivedM[0]);
      assert.equal(bending.Myy, handDerivedM[1]);
      assert.equal(bending.Mxy, handDerivedM[2]);
      point.surfaces.forEach((surface) => {
        const record = surfaceResultant(meshElement, elementResult, index, surface.surface);
        assert.equal(record.membraneStress, surface.membraneStress);
        assert.equal(record.bendingStress, surface.bendingStress);
        assert.equal(record.surfaceStress, surface.combinedStress);
      });
    });
  }
  console.log('✅ Resultants are bit-identical to a hand product of published kernel matrices; stress tensors are the same objects, not recomputed.');
}

function checkTopLevelRecovery() {
  const result = solve(triangleSource());
  const recovered = recoverShellResultants(result);
  assert.equal(recovered.length, result.loadCaseResults.length);
  assert.equal(recovered[0].loadCaseId, result.loadCaseResults[0].loadCaseId);
  assert.equal(recovered[0].elementResultants.length, result.loadCaseResults[0].elementResults.length);
  const [elementRecord] = recovered[0].elementResultants;
  assert.equal(elementRecord.membrane.Nxx, membraneResultant(
    result.meshEvidence.elements.find((item) => item.elementId === elementRecord.elementId),
    result.loadCaseResults[0].elementResults.find((item) => item.elementId === elementRecord.elementId),
  ).Nxx);
  assert.equal(Object.isFrozen(recovered), true);
  assert.equal(Object.isFrozen(recovered[0]), true);
  assert.equal(Object.isFrozen(recovered[0].elementResultants), true);

  // A rejected model has no resultants to recover.
  assert.throws(() => recoverShellResultants({ qualification: { accepted: false } }), TypeError);
  console.log('✅ recoverShellResultants walks every load case and element and refuses a rejected result.');
}

function checkSourceGuard() {
  // AD-S4.1: no modification to the DKT/CST/element/solver formulation — this
  // module must not import them. AD-S4.2: no Pm/Pb naming.
  const files = ['resultant-recovery.js', 'surface-stress.js'].map(
    (name) => fs.readFileSync(path.join(ROOT, 'src/core/local-shell', name), 'utf8'),
  );
  for (const source of files) {
    assert.equal(/\bPm\b|\bPb\b/u.test(source), false, 'AD-S4.2: Pm/Pb naming is forbidden');
    assert.equal(
      /from ['"]\.\/(dkt|cst|element|solver|assembly|transformation)\.js['"]/u.test(source),
      false,
      'AD-S4.1: must not import the DKT/CST/element/solver/assembly/transformation formulation',
    );
  }
  console.log('✅ Source guard: no Pm/Pb naming; no import of the shell formulation, assembly or solver files.');
}

function assertClose(actual, expected, tolerance, label) {
  const scale = Math.max(Math.abs(expected), Math.abs(actual), Number.MIN_VALUE);
  const relative = Math.abs(actual - expected) / scale;
  assert.ok(relative <= tolerance, `${label}: ${actual} differs from ${expected} by ${relative} relative, above ${tolerance}`);
}
