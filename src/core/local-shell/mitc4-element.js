/**
 * MITC4 four-node shell element (spec §8: MITC4 is the primary/default thin
 * -to-moderately-thick shell formulation, replacing CST/DKT as default while
 * CST/DKT is retained unchanged under its own identity as a qualified
 * fallback).
 *
 * Reissner-Mindlin kinematics with Mixed Interpolation of Tensorial
 * Components (Dvorkin & Bathe) for the transverse shear, which is what cures
 * the shear locking a naive bilinear Reissner-Mindlin quad suffers as
 * thickness goes to zero.
 *
 * Kinematics (element local frame):
 *   u(x,y,z) = u0(x,y) + z*betaX(x,y)
 *   v(x,y,z) = v0(x,y) + z*betaY(x,y)
 *   w(x,y,z) = w(x,y)
 * so curvatures are kappa = [dBx/dx, dBy/dy, dBx/dy + dBy/dx] and the
 * transverse shears are gamma = [betaX + dw/dx, betaY + dw/dy].
 *
 * Local DOF order per node: [u, v, w, betaX, betaY] — 5 per node, 20 per
 * element, matching this kernel's existing 5-DOF node convention (the
 * drilling DOF stays out of the element formulation; it is handled
 * separately, and `NO_DRILLING_DOF` remains true of this module).
 *
 * MITC tying points, in natural coordinates:
 *   A(0,-1) and C(0,+1) carry the covariant xi-zeta shear
 *   B(+1,0) and D(-1,0) carry the covariant eta-zeta shear
 * Each interpolated linearly in the transverse direction, then mapped to
 * Cartesian shear by the inverse-transpose Jacobian.
 */
import { ShellNumericalError } from './errors.js';

export const MITC4_FORMULATION = 'MITC4_QUAD4_SHELL_V1';
export const MITC4_ENGINEERING_LEVEL = 'LINEAR_2_5D_SHELL_MITC4_REISSNER_MINDLIN';

export const MITC4_FORMULA_IDS = Object.freeze({
  SHAPE_FUNCTIONS: 'LAFEA4.MITC4_BILINEAR_SHAPE_FUNCTIONS/v1',
  MEMBRANE: 'LAFEA4.MITC4_BILINEAR_MEMBRANE_STIFFNESS/v1',
  BENDING: 'LAFEA4.MITC4_REISSNER_MINDLIN_BENDING_STIFFNESS/v1',
  SHEAR: 'LAFEA4.MITC4_TIED_TRANSVERSE_SHEAR_STIFFNESS/v1',
  QUADRATURE: 'LAFEA4.MITC4_TWO_BY_TWO_GAUSS_QUADRATURE/v1',
});

/** Standard 2x2 Gauss rule; weights sum to 4, the area of the [-1,1]^2 reference square. */
const GAUSS_1D = Object.freeze([-1 / Math.sqrt(3), 1 / Math.sqrt(3)]);
export const MITC4_GAUSS_POINTS = Object.freeze(
  GAUSS_1D.flatMap((xi, i) => GAUSS_1D.map((eta, j) => Object.freeze({
    pointId: `MITC4-IP-${i * 2 + j + 1}`, xi, eta, weight: 1,
  }))),
);

/** Shear tying points. `component` names which covariant shear the point carries. */
export const MITC4_TYING_POINTS = Object.freeze([
  Object.freeze({ tyingPointId: 'A', xi: 0, eta: -1, component: 'XI_ZETA' }),
  Object.freeze({ tyingPointId: 'B', xi: 1, eta: 0, component: 'ETA_ZETA' }),
  Object.freeze({ tyingPointId: 'C', xi: 0, eta: 1, component: 'XI_ZETA' }),
  Object.freeze({ tyingPointId: 'D', xi: -1, eta: 0, component: 'ETA_ZETA' }),
]);

export const SHEAR_CORRECTION_FACTOR = 5 / 6;

export function q4ShapeFunctionsAndDerivatives(xi, eta) {
  const N = [
    (1 - xi) * (1 - eta) / 4,
    (1 + xi) * (1 - eta) / 4,
    (1 + xi) * (1 + eta) / 4,
    (1 - xi) * (1 + eta) / 4,
  ];
  const dNdXi = [-(1 - eta) / 4, (1 - eta) / 4, (1 + eta) / 4, -(1 + eta) / 4];
  const dNdEta = [-(1 - xi) / 4, -(1 + xi) / 4, (1 + xi) / 4, (1 - xi) / 4];
  return { N, dNdXi, dNdEta };
}

export function jacobianAt(nodes, dNdXi, dNdEta) {
  let dxDxi = 0; let dyDxi = 0; let dxDeta = 0; let dyDeta = 0;
  for (let i = 0; i < 4; i += 1) {
    dxDxi += dNdXi[i] * nodes[i][0]; dyDxi += dNdXi[i] * nodes[i][1];
    dxDeta += dNdEta[i] * nodes[i][0]; dyDeta += dNdEta[i] * nodes[i][1];
  }
  const determinant = dxDxi * dyDeta - dxDeta * dyDxi;
  return {
    dxDxi, dyDxi, dxDeta, dyDeta, determinant,
  };
}

/**
 * Chain rule `[dN/dx; dN/dy] = (J^-1)^T [dN/dxi; dN/deta]` with
 * `J = [[dxDxi, dxDeta], [dyDxi, dyDeta]]`.
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

function requirePositiveJacobian(determinant, label) {
  if (!(determinant > 0)) {
    throw new ShellNumericalError(
      `MITC4 Jacobian determinant must be positive at ${label}; got ${determinant}`,
      { code: 'NON_POSITIVE_JACOBIAN', determinant },
    );
  }
}

/** Membrane strain-displacement matrix, 3 x 20 (acts on u,v only). */
export function membraneBMatrixAt(nodes, xi, eta) {
  const { dNdXi, dNdEta } = q4ShapeFunctionsAndDerivatives(xi, eta);
  const jacobian = jacobianAt(nodes, dNdXi, dNdEta);
  requirePositiveJacobian(jacobian.determinant, `(${xi},${eta})`);
  const { dNdx, dNdy } = physicalDerivatives(dNdXi, dNdEta, jacobian);
  const B = [Array(20).fill(0), Array(20).fill(0), Array(20).fill(0)];
  for (let i = 0; i < 4; i += 1) {
    B[0][5 * i] = dNdx[i];
    B[1][5 * i + 1] = dNdy[i];
    B[2][5 * i] = dNdy[i];
    B[2][5 * i + 1] = dNdx[i];
  }
  return { B, jacobianDeterminant: jacobian.determinant };
}

/** Curvature strain-displacement matrix, 3 x 20 (acts on betaX, betaY only). */
export function bendingBMatrixAt(nodes, xi, eta) {
  const { dNdXi, dNdEta } = q4ShapeFunctionsAndDerivatives(xi, eta);
  const jacobian = jacobianAt(nodes, dNdXi, dNdEta);
  requirePositiveJacobian(jacobian.determinant, `(${xi},${eta})`);
  const { dNdx, dNdy } = physicalDerivatives(dNdXi, dNdEta, jacobian);
  const B = [Array(20).fill(0), Array(20).fill(0), Array(20).fill(0)];
  for (let i = 0; i < 4; i += 1) {
    B[0][5 * i + 3] = dNdx[i];
    B[1][5 * i + 4] = dNdy[i];
    B[2][5 * i + 3] = dNdy[i];
    B[2][5 * i + 4] = dNdx[i];
  }
  return { B, jacobianDeterminant: jacobian.determinant };
}

/**
 * Covariant transverse shear row at one tying point:
 * `gamma_(dir)zeta = dw/d(dir) + betaX * dx/d(dir) + betaY * dy/d(dir)`,
 * expressed as a 20-length row acting on the element DOF vector.
 */
function covariantShearRow(nodes, xi, eta, direction) {
  const { N, dNdXi, dNdEta } = q4ShapeFunctionsAndDerivatives(xi, eta);
  const jacobian = jacobianAt(nodes, dNdXi, dNdEta);
  const dNd = direction === 'XI' ? dNdXi : dNdEta;
  const dxd = direction === 'XI' ? jacobian.dxDxi : jacobian.dxDeta;
  const dyd = direction === 'XI' ? jacobian.dyDxi : jacobian.dyDeta;
  const row = Array(20).fill(0);
  for (let i = 0; i < 4; i += 1) {
    row[5 * i + 2] = dNd[i];
    row[5 * i + 3] = N[i] * dxd;
    row[5 * i + 4] = N[i] * dyd;
  }
  return row;
}

/**
 * MITC-tied transverse shear strain-displacement matrix, 2 x 20.
 * Covariant components are sampled only at the tying points and linearly
 * interpolated, then mapped to Cartesian shear by `(J^-1)^T` — this
 * substitution is precisely what removes the spurious shear energy that
 * locks a displacement-based bilinear Reissner-Mindlin quad.
 */
export function shearBMatrixAt(nodes, xi, eta) {
  const jacobian = jacobianAt(nodes, q4ShapeFunctionsAndDerivatives(xi, eta).dNdXi, q4ShapeFunctionsAndDerivatives(xi, eta).dNdEta);
  requirePositiveJacobian(jacobian.determinant, `(${xi},${eta})`);
  const rowA = covariantShearRow(nodes, 0, -1, 'XI');
  const rowC = covariantShearRow(nodes, 0, 1, 'XI');
  const rowB = covariantShearRow(nodes, 1, 0, 'ETA');
  const rowD = covariantShearRow(nodes, -1, 0, 'ETA');
  const gammaXi = rowA.map((value, i) => 0.5 * (1 - eta) * value + 0.5 * (1 + eta) * rowC[i]);
  const gammaEta = rowD.map((value, i) => 0.5 * (1 - xi) * value + 0.5 * (1 + xi) * rowB[i]);
  // Cartesian = (J^-1)^T * covariant, with
  // J^-1 = 1/det [[dyDeta, -dxDeta], [-dyDxi, dxDxi]].
  const invDet = 1 / jacobian.determinant;
  const B = [Array(20).fill(0), Array(20).fill(0)];
  for (let i = 0; i < 20; i += 1) {
    B[0][i] = invDet * (jacobian.dyDeta * gammaXi[i] - jacobian.dyDxi * gammaEta[i]);
    B[1][i] = invDet * (-jacobian.dxDeta * gammaXi[i] + jacobian.dxDxi * gammaEta[i]);
  }
  return { B, jacobianDeterminant: jacobian.determinant };
}

/**
 * Full 20x20 MITC4 local stiffness.
 *
 * @param {readonly [number, number][]} nodes Four local-frame corner coordinates, counter-clockwise.
 * @param {readonly number[][]} membraneConstitutive 3x3 plane-stress matrix (already includes thickness scaling? no - see below).
 * @param {number} thickness
 * @param {number} shearModulus
 */
export function mitc4StiffnessMatrix(nodes, membraneConstitutive, thickness, shearModulus) {
  const stiffness = Array.from({ length: 20 }, () => Array(20).fill(0));
  const bendingScale = thickness ** 3 / 12;
  const shearRigidity = SHEAR_CORRECTION_FACTOR * shearModulus * thickness;
  const gaussEvidence = [];
  for (const gp of MITC4_GAUSS_POINTS) {
    const membrane = membraneBMatrixAt(nodes, gp.xi, gp.eta);
    const bending = bendingBMatrixAt(nodes, gp.xi, gp.eta);
    const shear = shearBMatrixAt(nodes, gp.xi, gp.eta);
    const factor = gp.weight * membrane.jacobianDeterminant;
    accumulate(stiffness, membrane.B, membraneConstitutive, factor * thickness);
    accumulate(stiffness, bending.B, membraneConstitutive, factor * bendingScale);
    accumulateShear(stiffness, shear.B, factor * shearRigidity);
    gaussEvidence.push(Object.freeze({
      pointId: gp.pointId,
      xi: gp.xi,
      eta: gp.eta,
      weight: gp.weight,
      jacobianDeterminant: membrane.jacobianDeterminant,
      membraneB: freezeMatrix(membrane.B),
      bendingB: freezeMatrix(bending.B),
      shearB: freezeMatrix(shear.B),
    }));
  }
  return { stiffness, gaussEvidence: Object.freeze(gaussEvidence) };
}

/** Adds `scale * B^T D B` into the 20x20 target. */
function accumulate(target, B, D, scale) {
  const rows = B.length;
  const DB = D.map((dRow) => {
    const out = Array(20).fill(0);
    for (let k = 0; k < rows; k += 1) {
      const coefficient = dRow[k];
      if (coefficient === 0) continue;
      for (let j = 0; j < 20; j += 1) out[j] += coefficient * B[k][j];
    }
    return out;
  });
  for (let i = 0; i < 20; i += 1) {
    for (let k = 0; k < rows; k += 1) {
      const bik = B[k][i];
      if (bik === 0) continue;
      for (let j = 0; j < 20; j += 1) target[i][j] += scale * bik * DB[k][j];
    }
  }
}

/** Adds `scale * B^T B` for the 2-row shear operator (isotropic shear rigidity). */
function accumulateShear(target, B, scale) {
  for (let i = 0; i < 20; i += 1) {
    for (let j = 0; j < 20; j += 1) {
      target[i][j] += scale * (B[0][i] * B[0][j] + B[1][i] * B[1][j]);
    }
  }
}

function freezeMatrix(matrix) {
  return Object.freeze(matrix.map((row) => Object.freeze([...row])));
}
