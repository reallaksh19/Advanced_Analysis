import assert from 'node:assert/strict';
import {
  calculateLocalShell,
  createCanonicalLocalShellModel,
} from '../src/core/local-shell/index.js';
import { cylindricalSource, rigidCylindricalSource } from './lafea.4-fixtures.mjs';

const rigid = solve(rigidCylindricalSource(6));
for (const element of rigid.loadCaseResults[0].elementResults) {
  Object.values(element.membraneStrain).forEach((value) => close(value, 0, 1e-8));
  for (const point of element.integrationPoints) {
    Object.values(point.curvature).forEach((value) => close(value, 0, 1e-8));
  }
}
close(rigid.loadCaseResults[0].totalStrainEnergy, 0, 1e-7);
assert.ok(rigid.meshEvidence.elements.every((element) => element.nodalBasisTransformation.rank >= 2));

const convergence = [2, 4, 8, 16].map((segments) => cylindricalMembraneError(segments));
for (let index = 1; index < convergence.length; index += 1) {
  assert.ok(convergence[index].strainError < convergence[index - 1].strainError / 3.5);
  assert.ok(convergence[index].stressError < convergence[index - 1].stressError / 3.5);
}

const bending = solve(symmetricBendingStrip(6));
const displacements = new Map(bending.loadCaseResults[0].nodalDisplacements.map((row) => [row.nodeId, row]));
for (let index = 0; index <= 3; index += 1) {
  const left = displacements.get(`N1-${index}`);
  const right = displacements.get(`N1-${6 - index}`);
  close(left.ux, -right.ux, 1e-7);
  close(left.uy, right.uy, 1e-7);
  close(left.uz, -right.uz, 1e-7);
  close(left.r1, right.r1, 1e-7);
  close(left.r2, -right.r2, 1e-7);
}
assert.ok(bending.loadCaseResults[0].forceEquilibrium.qualification.accepted);
assert.ok(bending.loadCaseResults[0].momentEquilibrium.qualification.accepted);

const pressure = solve(cylindricalPressureSource(6));
const contributions = pressure.loadCaseResults[0].appliedLoadEvidence.contributions;
const reconstructed = contributions.reduce((total, item) => total.map((value, axis) => value + item.totalForce[axis]), [0, 0, 0]);
for (let axis = 0; axis < 3; axis += 1) close(reconstructed[axis], pressure.loadCaseResults[0].appliedLoadEvidence.appliedForce[axis]);
for (const item of contributions) close(Math.hypot(...item.totalForce), item.pressure * item.representedArea);

console.log('LAFEA.4 cylindrical rigid motion, angular membrane convergence, open-strip bending symmetry and pressure equilibrium passed.');

function cylindricalMembraneError(segments) {
  const source = cylindricalSource(segments);
  const strain = 0.001;
  const radius = 100;
  source.constraints = source.nodes.flatMap((node) => {
    const angle = Math.atan2(node.position[1], node.position[2]);
    const displacement = node.rotationBasis2.map((value) => value * strain * radius * angle);
    return constraints(node.nodeId, [...displacement, 0, 0]);
  });
  const result = solve(source);
  const expectedStress = 200000 / (1 - 0.3 ** 2) * strain;
  let strainError = 0;
  let stressError = 0;
  for (const elementResult of result.loadCaseResults[0].elementResults) {
    const element = result.meshEvidence.elements.find((item) => item.elementId === elementResult.elementId);
    const tangent = circumferentialTangent(source, element.nodeIds);
    const [a, b] = localDirection(tangent, element.localFrame);
    const hoopStrain = projectStrain(elementResult.membraneStrain, a, b);
    const hoopStress = projectStress(elementResult.membraneStress, a, b);
    strainError = Math.max(strainError, Math.abs(hoopStrain - strain));
    stressError = Math.max(stressError, Math.abs(hoopStress - expectedStress));
  }
  return { segments, strainError, stressError };
}

function symmetricBendingStrip(segments) {
  const source = cylindricalSource(segments);
  const elements = [];
  for (let index = 0; index < segments; index += 1) {
    const a = `N0-${index}`, b = `N1-${index}`, c = `N1-${index + 1}`, d = `N0-${index + 1}`;
    const rows = index < segments / 2 ? [[a, b, c], [a, c, d]] : [[a, b, d], [b, c, d]];
    rows.forEach((nodeIds, side) => elements.push({ elementId: `E${index}-${side}`, nodeIds, materialId: 'MAT', thickness: 1.5, sourceReference: `E${index}-${side}-SRC` }));
  }
  source.elements = elements;
  source.constraints = source.nodes.filter((node) => node.nodeId.startsWith('N0-')).flatMap((node) => constraints(node.nodeId, [0, 0, 0, 0, 0]));
  source.loadCases = [{
    loadCaseId: 'BENDING',
    nodalLoads: source.nodes.filter((node) => node.nodeId.startsWith('N1-')).map((node, index) => ({
      loadId: `M-${index}`, nodeId: node.nodeId, fx: 0, fy: 0, fz: 0, m1: 100, m2: 0, sourceReference: `M-${index}-SRC`,
    })),
    pressureLoads: [],
    sourceReference: 'BENDING-SRC',
  }];
  return source;
}

function cylindricalPressureSource(segments) {
  const source = cylindricalSource(segments);
  source.loadCases = [{
    loadCaseId: 'PRESSURE',
    nodalLoads: [],
    pressureLoads: source.elements.map((element, index) => ({
      pressureLoadId: `P-${index}`, elementId: element.elementId, pressure: 1.2, sense: 'ALONG_ELEMENT_NORMAL', sourceReference: `P-${index}-SRC`,
    })),
    sourceReference: 'PRESSURE-SRC',
  }];
  return source;
}

function constraints(nodeId, values) {
  return ['UX', 'UY', 'UZ', 'R1', 'R2'].map((dof, index) => ({
    constraintId: `C-${nodeId}-${dof}`, nodeId, dof, value: values[index], sourceReference: `C-${nodeId}-${dof}-SRC`,
  }));
}

function circumferentialTangent(source, nodeIds) {
  const centroid = nodeIds.map((nodeId) => source.nodes.find((node) => node.nodeId === nodeId).position)
    .reduce((total, position) => total.map((value, index) => value + position[index]), [0, 0, 0])
    .map((value) => value / 3);
  const angle = Math.atan2(centroid[1], centroid[2]);
  return [0, Math.cos(angle), -Math.sin(angle)];
}

function localDirection(global, frame) {
  let a = dot(global, frame.ex);
  let b = dot(global, frame.ey);
  const length = Math.hypot(a, b);
  a /= length; b /= length;
  return [a, b];
}

function projectStrain(strain, a, b) {
  return a ** 2 * strain.epsilonX + b ** 2 * strain.epsilonY + a * b * strain.gammaXY;
}

function projectStress(stress, a, b) {
  return a ** 2 * stress.sigmaX + b ** 2 * stress.sigmaY + 2 * a * b * stress.tauXY;
}

function solve(source) {
  const result = calculateLocalShell(createCanonicalLocalShellModel(source));
  assert.equal(result.qualification.accepted, true, result.qualification.summary);
  return result;
}

function dot(a, b) {
  return a.reduce((sum, value, index) => sum + value * b[index], 0);
}

function close(actual, expected, tolerance = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(expected)), `${actual} != ${expected}`);
}
