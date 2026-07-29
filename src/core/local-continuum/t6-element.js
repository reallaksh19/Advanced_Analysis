/**
 * T6 quadratic-triangle formulation (spec §7: "Default T6 quadratic triangle
 * and Q8 quadratic quadrilateral. T3 is benchmark/fallback only and cannot
 * be the default production mesh."). Independent of `element-fea`'s
 * separate element line (per explicit direction: T6/Q8 are built inside
 * `local-continuum`, preserving the existing "does not import element-fea"
 * kernel-isolation invariant) — this module reuses only this kernel's own
 * generic linear-algebra (`matrix.js`), numeric (`numeric.js`) and
 * constitutive (`constitutive.js`) primitives, the same ones the existing
 * T3/CST path already depends on.
 *
 * Node order: corners 1(0,0), 2(1,0), 3(0,1) in natural (area) coordinates,
 * CCW; midsides 4(1-2), 5(2-3), 6(3-1). DOF order per node: UX, UY.
 *
 * Disclosed scope for this pass: this module provides the T6 stiffness
 * formulation and its patch-test qualification, verified standalone against
 * spec §17.4's 1e-10 relative tolerance. Wiring it into
 * `local-continuum`'s existing single-T3-path `canonical-model.js` /
 * `element.js` dispatch / `calculate.js` pipeline (so a T6 mesh flows
 * end-to-end through the kernel's public `calculateLocalContinuum` API) is
 * explicit next-increment follow-up, not done in this file — the existing,
 * already-qualified T3 dispatch is untouched.
 */
import { numericalError } from './errors.js';
import {
  matrixScale, multiply, scaleMatrix, symmetryResidual, transpose, zeros,
} from './matrix.js';
import { canonicalNumber, maxAbs, tolerance } from './numeric.js';
import { constitutiveEvidence } from './constitutive.js';

export const T6_FORMULA_IDS = Object.freeze({
  SHAPE_FUNCTIONS: 'T6_QUADRATIC_AREA_COORDINATE_SHAPE_FUNCTIONS_V1',
  GAUSS_QUADRATURE: 'T6_THREE_POINT_DEGREE_2_GAUSS_QUADRATURE_V1',
  STIFFNESS: 'T6_GAUSS_INTEGRATED_STIFFNESS_V1',
});

/** Standard 3-point rule, exact for polynomials up to degree 2 over a triangle; weights sum to 1 (area fraction). */
export const T6_GAUSS_POINTS = Object.freeze([
  Object.freeze({ pointId: 'GP1', xi: 1 / 6, eta: 1 / 6, weight: 1 / 3 }),
  Object.freeze({ pointId: 'GP2', xi: 2 / 3, eta: 1 / 6, weight: 1 / 3 }),
  Object.freeze({ pointId: 'GP3', xi: 1 / 6, eta: 2 / 3, weight: 1 / 3 }),
]);

export function t6ShapeFunctionsAndDerivatives(xi, eta) {
  const l1 = 1 - xi - eta; const l2 = xi; const l3 = eta;
  const N = [l1 * (2 * l1 - 1), l2 * (2 * l2 - 1), l3 * (2 * l3 - 1), 4 * l1 * l2, 4 * l2 * l3, 4 * l3 * l1];
  const dNdXi = [4 * xi + 4 * eta - 3, 4 * xi - 1, 0, 4 * (1 - 2 * xi - eta), 4 * eta, -4 * eta];
  const dNdEta = [4 * xi + 4 * eta - 3, 0, 4 * eta - 1, -4 * xi, 4 * xi, 4 * (1 - xi - 2 * eta)];
  return { N, dNdXi, dNdEta };
}

function jacobianAt(nodes, dNdXi, dNdEta) {
  let dxDxi = 0; let dyDxi = 0; let dxDeta = 0; let dyDeta = 0;
  for (let i = 0; i < 6; i += 1) {
    dxDxi += dNdXi[i] * nodes[i].x; dyDxi += dNdXi[i] * nodes[i].y;
    dxDeta += dNdEta[i] * nodes[i].x; dyDeta += dNdEta[i] * nodes[i].y;
  }
  const determinant = dxDxi * dyDeta - dxDeta * dyDxi;
  return { dxDxi, dyDxi, dxDeta, dyDeta, determinant };
}

/**
 * Chain rule: `[dN/dxi; dN/deta] = J^T [dN/dx; dN/dy]` with `J = [[dxDxi,
 * dxDeta],[dyDxi, dyDeta]]`, so `[dN/dx; dN/dy] = (J^-1)^T [dN/dxi; dN/deta]
 * = 1/det * [[dyDeta, -dyDxi], [-dxDeta, dxDxi]] [dN/dxi; dN/deta]`.
 */
function physicalDerivatives(dNdXi, dNdEta, jacobian) {
  const invDet = 1 / jacobian.determinant;
  const dNdx = []; const dNdy = [];
  for (let i = 0; i < dNdXi.length; i += 1) {
    dNdx.push(invDet * (jacobian.dyDeta * dNdXi[i] - jacobian.dyDxi * dNdEta[i]));
    dNdy.push(invDet * (-jacobian.dxDeta * dNdXi[i] + jacobian.dxDxi * dNdEta[i]));
  }
  return { dNdx, dNdy };
}

/** The 3x12 strain-displacement matrix and Jacobian determinant at one natural point. Rejects a non-positive Jacobian (spec §7.1). */
export function t6BMatrixAt(nodes, xi, eta) {
  const { dNdXi, dNdEta } = t6ShapeFunctionsAndDerivatives(xi, eta);
  const jacobian = jacobianAt(nodes, dNdXi, dNdEta);
  if (!(jacobian.determinant > 0)) {
    throw numericalError('T6_NONPOSITIVE_JACOBIAN', 'element formulation', `T6 Jacobian determinant ${jacobian.determinant} is not positive at (${xi},${eta}).`);
  }
  const { dNdx, dNdy } = physicalDerivatives(dNdXi, dNdEta, jacobian);
  const B = zeros(3, 12);
  for (let i = 0; i < 6; i += 1) {
    B[0][2 * i] = dNdx[i];
    B[1][2 * i + 1] = dNdy[i];
    B[2][2 * i] = dNdy[i]; B[2][2 * i + 1] = dNdx[i];
  }
  return { B: B.map((row) => row.map((value) => canonicalNumber(value, 'T6 B matrix'))), jacobianDeterminant: canonicalNumber(jacobian.determinant, 'T6 Jacobian') };
}

/** 12x12 Gauss-integrated stiffness `K = sum_gp weight * thickness * detJ * B^T D B`. */
export function t6StiffnessMatrix(nodes, dMatrix, thickness) {
  let stiffness = zeros(12, 12);
  const gaussEvidence = [];
  for (const gp of T6_GAUSS_POINTS) {
    const { B, jacobianDeterminant } = t6BMatrixAt(nodes, gp.xi, gp.eta);
    const contribution = scaleMatrix(multiply(multiply(transpose(B), dMatrix), B), thickness * jacobianDeterminant * gp.weight);
    stiffness = stiffness.map((row, i) => row.map((value, j) => value + contribution[i][j]));
    gaussEvidence.push(Object.freeze({ pointId: gp.pointId, xi: gp.xi, eta: gp.eta, weight: gp.weight, jacobianDeterminant, B: Object.freeze(B.map((row) => Object.freeze(row))) }));
  }
  return { stiffness: stiffness.map((row) => row.map((value) => canonicalNumber(value, 'T6 stiffness'))), gaussEvidence: Object.freeze(gaussEvidence) };
}

/** Full T6 element evidence for one element: constitutive, stiffness, symmetry, rigid-body and affine-patch qualification. */
export function t6ElementEvidence(elementId, nodes, material, formulation, thickness, profile) {
  const constitutive = constitutiveEvidence(material, formulation, profile);
  const { stiffness, gaussEvidence } = t6StiffnessMatrix(nodes, constitutive.matrix, thickness);
  const stiffnessQualification = qualifyT6Stiffness(stiffness, elementId, profile);
  const rigidBodyQualification = qualifyT6RigidBody(nodes, gaussEvidence, profile);
  const affinePatchQualification = qualifyT6AffinePatch(nodes, gaussEvidence, constitutive.matrix, profile);
  return Object.freeze({
    elementId,
    elementType: 'T6',
    dMatrix: constitutive.matrix,
    localStiffnessMatrix: stiffness,
    gaussEvidence,
    stiffnessSymmetry: stiffnessQualification,
    rigidBodyQualification,
    affinePatchQualification,
    formulaIds: Object.freeze([T6_FORMULA_IDS.SHAPE_FUNCTIONS, T6_FORMULA_IDS.GAUSS_QUADRATURE, T6_FORMULA_IDS.STIFFNESS, ...constitutive.formulaIds].sort()),
  });
}

function qualifyT6Stiffness(stiffness, elementId, profile) {
  const residual = symmetryResidual(stiffness);
  const scale = matrixScale(stiffness);
  const limit = tolerance(profile, 'stiffnessSymmetry', scale);
  if (residual > limit) throw numericalError('ELEMENT_STIFFNESS_SYMMETRY_FAILURE', `elements.${elementId}`, 'T6 element stiffness symmetry did not qualify.');
  return { residual, scale, tolerance: limit, accepted: true };
}

/** Apply rigid translation/rotation nodal fields; strain at every Gauss point must vanish (spec §17.1). */
function qualifyT6RigidBody(nodes, gaussEvidence, profile) {
  const translationX = nodes.flatMap(() => [1, 0]);
  const translationY = nodes.flatMap(() => [0, 1]);
  const rotation = nodes.flatMap((node) => [-node.y, node.x]);
  const residuals = [translationX, translationY, rotation].flatMap((field) => gaussEvidence.map((gp) => maxAbs(matrixTimesVector(gp.B, field))));
  const residual = maxAbs(residuals);
  const scale = Math.max(1, ...nodes.flatMap((node) => [Math.abs(node.x), Math.abs(node.y)]));
  const limit = tolerance(profile, 'rigidBodyStrain', scale);
  if (residual > limit) throw numericalError('RIGID_BODY_STRAIN_FAILURE', 'T6 element formulation', 'T6 rigid-body strain did not qualify.');
  return { maximumStrainResidual: residual, scale, tolerance: limit, accepted: true };
}

/** Apply an affine (constant-strain) nodal field at every node; recovered stress must match the exact target at every Gauss point (spec §17.1). */
function qualifyT6AffinePatch(nodes, gaussEvidence, dMatrix, profile) {
  const fields = [
    nodes.flatMap((node) => [node.x, 0]),
    nodes.flatMap((node) => [0, node.y]),
    nodes.flatMap((node) => [node.y / 2, node.x / 2]),
  ];
  const expectedStrains = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const residuals = fields.flatMap((field, index) => gaussEvidence.map((gp) => {
    const strain = matrixTimesVector(gp.B, field);
    const actualStress = matrixTimesVector(dMatrix, strain);
    const targetStress = matrixTimesVector(dMatrix, expectedStrains[index]);
    return maxAbs(actualStress.map((value, component) => value - targetStress[component]));
  }));
  const residual = maxAbs(residuals);
  const scale = Math.max(1, matrixScale(dMatrix));
  const limit = tolerance(profile, 'patchTestStress', scale);
  if (residual > limit) throw numericalError('AFFINE_PATCH_STRESS_FAILURE', 'T6 element formulation', 'T6 affine patch stress did not qualify.');
  return { maximumStressResidual: canonicalNumber(residual), scale, tolerance: limit, accepted: true };
}

function matrixTimesVector(matrix, vector) {
  return matrix.map((row) => row.reduce((sum, value, index) => sum + value * vector[index], 0));
}
