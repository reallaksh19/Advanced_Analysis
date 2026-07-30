/**
 * MITC3 three-node shell element (spec §8): the triangular companion to
 * MITC4, provided as a separately-qualified FALLBACK for regions a
 * quadrilateral mesh cannot cover. It is never silently substituted for
 * MITC4 — selection is explicit at the dispatch layer and carries its own
 * formulation identity, so a result built from triangles is always
 * distinguishable from one built from quads.
 *
 * Reissner-Mindlin kinematics identical to `mitc4-element.js`:
 *   u = u0 + z*betaX,  v = v0 + z*betaY,  w = w
 *   kappa = [dBx/dx, dBy/dy, dBx/dy + dBy/dx]
 *   gamma = [betaX + dw/dx, betaY + dw/dy]
 * Local DOF order per node: [u, v, w, betaX, betaY] — 15 per element.
 *
 * Membrane and bending use the constant-strain/constant-curvature linear
 * triangle. The transverse shear uses the MITC tying of Lee & Bathe: the
 * covariant shears are sampled at the three edge midpoints
 *   A(1/2, 0)   — edge 1-2
 *   B(0, 1/2)   — edge 1-3
 *   C(1/2, 1/2) — edge 2-3
 * and assumed to vary as
 *   gamma_rt = gamma_rt|A + c*s
 *   gamma_st = gamma_st|B - c*r
 * The constant `c` is fixed by tying the EDGE-TANGENTIAL covariant shear at
 * C. Edge 2-3 runs along the natural direction (-1, +1), so its tangential
 * component is `gamma_st - gamma_rt`; equating the assumed and directly
 * evaluated values there gives
 *   c = gamma_st|B - gamma_rt|A - gamma_st|C + gamma_rt|C
 * which is derived here rather than asserted, and is what the element's
 * no-locking behaviour depends on.
 */
import { ShellNumericalError } from './errors.js';

export const MITC3_FORMULATION = 'MITC3_TRI3_SHELL_V1';
export const MITC3_ENGINEERING_LEVEL = 'LINEAR_2_5D_SHELL_MITC3_REISSNER_MINDLIN_FALLBACK';

export const MITC3_FORMULA_IDS = Object.freeze({
  SHAPE_FUNCTIONS: 'LAFEA4.MITC3_LINEAR_AREA_SHAPE_FUNCTIONS/v1',
  MEMBRANE: 'LAFEA4.MITC3_CONSTANT_STRAIN_MEMBRANE_STIFFNESS/v1',
  BENDING: 'LAFEA4.MITC3_CONSTANT_CURVATURE_BENDING_STIFFNESS/v1',
  SHEAR: 'LAFEA4.MITC3_TIED_TRANSVERSE_SHEAR_STIFFNESS/v1',
  QUADRATURE: 'LAFEA4.MITC3_THREE_POINT_GAUSS_QUADRATURE/v1',
});

/** Three-point rule, exact to degree 2; weights sum to 1/2, the reference triangle's area. */
export const MITC3_GAUSS_POINTS = Object.freeze([
  Object.freeze({ pointId: 'MITC3-IP-1', r: 1 / 6, s: 1 / 6, weight: 1 / 6 }),
  Object.freeze({ pointId: 'MITC3-IP-2', r: 2 / 3, s: 1 / 6, weight: 1 / 6 }),
  Object.freeze({ pointId: 'MITC3-IP-3', r: 1 / 6, s: 2 / 3, weight: 1 / 6 }),
]);

export const MITC3_TYING_POINTS = Object.freeze([
  Object.freeze({ tyingPointId: 'A', r: 0.5, s: 0, edge: '1-2' }),
  Object.freeze({ tyingPointId: 'B', r: 0, s: 0.5, edge: '1-3' }),
  Object.freeze({ tyingPointId: 'C', r: 0.5, s: 0.5, edge: '2-3' }),
]);

export const SHEAR_CORRECTION_FACTOR = 5 / 6;

const DOF_COUNT = 15;

/** Linear triangle shape functions in natural (area) coordinates. */
export function triangleShapeFunctions(r, s) {
  return {
    N: [1 - r - s, r, s],
    dNdr: [-1, 1, 0],
    dNds: [-1, 0, 1],
  };
}

/** Constant Jacobian of the straight-sided linear triangle. */
export function jacobianOf(nodes) {
  const dxDr = nodes[1][0] - nodes[0][0];
  const dyDr = nodes[1][1] - nodes[0][1];
  const dxDs = nodes[2][0] - nodes[0][0];
  const dyDs = nodes[2][1] - nodes[0][1];
  const determinant = dxDr * dyDs - dxDs * dyDr;
  if (!(determinant > 0)) {
    throw new ShellNumericalError(
      `MITC3 Jacobian determinant must be positive; got ${determinant}`,
      { code: 'NON_POSITIVE_JACOBIAN', determinant },
    );
  }
  return {
    dxDr, dyDr, dxDs, dyDs, determinant,
  };
}

function physicalDerivatives(jacobian) {
  const { dNdr, dNds } = triangleShapeFunctions(0, 0);
  const invDet = 1 / jacobian.determinant;
  const dNdx = []; const dNdy = [];
  for (let i = 0; i < 3; i += 1) {
    dNdx.push(invDet * (jacobian.dyDs * dNdr[i] - jacobian.dyDr * dNds[i]));
    dNdy.push(invDet * (-jacobian.dxDs * dNdr[i] + jacobian.dxDr * dNds[i]));
  }
  return { dNdx, dNdy };
}

/** Membrane strain-displacement matrix, 3 x 15 (constant over the element). */
export function membraneBMatrix(nodes) {
  const { dNdx, dNdy } = physicalDerivatives(jacobianOf(nodes));
  const B = [Array(DOF_COUNT).fill(0), Array(DOF_COUNT).fill(0), Array(DOF_COUNT).fill(0)];
  for (let i = 0; i < 3; i += 1) {
    B[0][5 * i] = dNdx[i];
    B[1][5 * i + 1] = dNdy[i];
    B[2][5 * i] = dNdy[i];
    B[2][5 * i + 1] = dNdx[i];
  }
  return B;
}

/** Curvature strain-displacement matrix, 3 x 15 (constant over the element). */
export function bendingBMatrix(nodes) {
  const { dNdx, dNdy } = physicalDerivatives(jacobianOf(nodes));
  const B = [Array(DOF_COUNT).fill(0), Array(DOF_COUNT).fill(0), Array(DOF_COUNT).fill(0)];
  for (let i = 0; i < 3; i += 1) {
    B[0][5 * i + 3] = dNdx[i];
    B[1][5 * i + 4] = dNdy[i];
    B[2][5 * i + 3] = dNdy[i];
    B[2][5 * i + 4] = dNdx[i];
  }
  return B;
}

/**
 * Covariant shear row at one natural point:
 * `gamma_(dir)t = dw/d(dir) + betaX * dx/d(dir) + betaY * dy/d(dir)`.
 */
function covariantShearRow(nodes, r, s, direction) {
  const { N, dNdr, dNds } = triangleShapeFunctions(r, s);
  const jacobian = jacobianOf(nodes);
  const dNd = direction === 'R' ? dNdr : dNds;
  const dxd = direction === 'R' ? jacobian.dxDr : jacobian.dxDs;
  const dyd = direction === 'R' ? jacobian.dyDr : jacobian.dyDs;
  const row = Array(DOF_COUNT).fill(0);
  for (let i = 0; i < 3; i += 1) {
    row[5 * i + 2] = dNd[i];
    row[5 * i + 3] = N[i] * dxd;
    row[5 * i + 4] = N[i] * dyd;
  }
  return row;
}

/**
 * MITC3-tied transverse shear strain-displacement matrix, 2 x 15, at a
 * natural point. See the module docstring for the derivation of `c`.
 */
export function shearBMatrixAt(nodes, r, s) {
  const jacobian = jacobianOf(nodes);
  const rowAr = covariantShearRow(nodes, 0.5, 0, 'R');
  const rowBs = covariantShearRow(nodes, 0, 0.5, 'S');
  const rowCr = covariantShearRow(nodes, 0.5, 0.5, 'R');
  const rowCs = covariantShearRow(nodes, 0.5, 0.5, 'S');
  const c = rowBs.map((value, i) => value - rowAr[i] - rowCs[i] + rowCr[i]);
  const gammaR = rowAr.map((value, i) => value + c[i] * s);
  const gammaS = rowBs.map((value, i) => value - c[i] * r);
  const invDet = 1 / jacobian.determinant;
  const B = [Array(DOF_COUNT).fill(0), Array(DOF_COUNT).fill(0)];
  for (let i = 0; i < DOF_COUNT; i += 1) {
    B[0][i] = invDet * (jacobian.dyDs * gammaR[i] - jacobian.dyDr * gammaS[i]);
    B[1][i] = invDet * (-jacobian.dxDs * gammaR[i] + jacobian.dxDr * gammaS[i]);
  }
  return { B, jacobianDeterminant: jacobian.determinant };
}

/** Full 15x15 MITC3 local stiffness. */
export function mitc3StiffnessMatrix(nodes, membraneConstitutive, thickness, shearModulus) {
  const stiffness = Array.from({ length: DOF_COUNT }, () => Array(DOF_COUNT).fill(0));
  const jacobian = jacobianOf(nodes);
  const bendingScale = thickness ** 3 / 12;
  const shearRigidity = SHEAR_CORRECTION_FACTOR * shearModulus * thickness;
  const membrane = membraneBMatrix(nodes);
  const bending = bendingBMatrix(nodes);
  const gaussEvidence = [];
  for (const gp of MITC3_GAUSS_POINTS) {
    const shear = shearBMatrixAt(nodes, gp.r, gp.s);
    const factor = gp.weight * jacobian.determinant;
    accumulate(stiffness, membrane, membraneConstitutive, factor * thickness);
    accumulate(stiffness, bending, membraneConstitutive, factor * bendingScale);
    accumulateShear(stiffness, shear.B, factor * shearRigidity);
    gaussEvidence.push(Object.freeze({
      pointId: gp.pointId,
      r: gp.r,
      s: gp.s,
      weight: gp.weight,
      jacobianDeterminant: jacobian.determinant,
      shearB: Object.freeze(shear.B.map((row) => Object.freeze([...row]))),
    }));
  }
  return { stiffness, gaussEvidence: Object.freeze(gaussEvidence) };
}

function accumulate(target, B, D, scale) {
  const rows = B.length;
  const DB = D.map((dRow) => {
    const out = Array(DOF_COUNT).fill(0);
    for (let k = 0; k < rows; k += 1) {
      const coefficient = dRow[k];
      if (coefficient === 0) continue;
      for (let j = 0; j < DOF_COUNT; j += 1) out[j] += coefficient * B[k][j];
    }
    return out;
  });
  for (let i = 0; i < DOF_COUNT; i += 1) {
    for (let k = 0; k < rows; k += 1) {
      const bik = B[k][i];
      if (bik === 0) continue;
      for (let j = 0; j < DOF_COUNT; j += 1) target[i][j] += scale * bik * DB[k][j];
    }
  }
}

function accumulateShear(target, B, scale) {
  for (let i = 0; i < DOF_COUNT; i += 1) {
    for (let j = 0; j < DOF_COUNT; j += 1) {
      target[i][j] += scale * (B[0][i] * B[0][j] + B[1][i] * B[1][j]);
    }
  }
}
