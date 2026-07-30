import { fail, requireFinite } from './frame-element-contract.js';
import { cleanVector, zeroVector12 } from './frame-element-stiffness.js';

/**
 * Consistent equivalent nodal loads and the thermal initial-strain vector for
 * the straight 3D frame element (sections 3.4, 5.4, 7.1).
 *
 * The equivalent vectors are consistent with the element's own interpolation:
 * they are `integral of N(x)^T q(x) dx` using the same shear-parameter shape
 * functions the stiffness is built from, so a distributed load is represented
 * without arbitrary fine meshing and the two authorities cannot disagree. For
 * a linearly varying transverse intensity `q(x) = a + (b - a) x / L` the
 * closed-form end forces and moments are, with the plane's shear parameter
 * `phi`:
 *
 *   F_i = L [a (7/20 + phi/3) + b (3/20 + phi/6)] / (1 + phi)
 *   M_i = L^2 [a (1/20 + phi/24) + b (1/30 + phi/24)] / (1 + phi)
 *   F_j = L [a (3/20 + phi/6) + b (7/20 + phi/3)] / (1 + phi)
 *   M_j = -L^2 [a (1/30 + phi/24) + b (1/20 + phi/24)] / (1 + phi)
 *
 * At `phi = 0` these are the classical Euler-Bernoulli coefficients, and for a
 * uniform intensity they reduce to `qL/2` and `qL^2/12` for every `phi`.
 */

const LOAD_CODE = 'FRAME_ELEMENT_LOAD_INVALID';

function planeLoads(a, b, length, phi) {
  const scale = 1 / (1 + phi);
  return {
    forceI: length * (a * (7 / 20 + phi / 3) + b * (3 / 20 + phi / 6)) * scale,
    momentI: length ** 2 * (a * (1 / 20 + phi / 24) + b * (1 / 30 + phi / 24)) * scale,
    forceJ: length * (a * (3 / 20 + phi / 6) + b * (7 / 20 + phi / 3)) * scale,
    momentJ: -(length ** 2) * (a * (1 / 30 + phi / 24) + b * (1 / 20 + phi / 24)) * scale,
  };
}

function rotateIntensityToLocal(axes, intensity) {
  const vector = [intensity.fx, intensity.fy, intensity.fz];
  return {
    fx: axes.x[0] * vector[0] + axes.x[1] * vector[1] + axes.x[2] * vector[2],
    fy: axes.y[0] * vector[0] + axes.y[1] * vector[1] + axes.y[2] * vector[2],
    fz: axes.z[0] * vector[0] + axes.z[1] * vector[1] + axes.z[2] * vector[2],
  };
}

/**
 * Consistent equivalent nodal vector, in local element DOFs, for one accepted
 * B-3.0 DISTRIBUTED_LOAD primitive. A GLOBAL-basis intensity is mapped through
 * the element basis (`q_local = R q_global`); an ELEMENT_LOCAL intensity is
 * already in element components and is used exactly as declared.
 */
export function distributedLoadLocalVector({ primitive, axes, length, phiXY, phiXZ }) {
  if (primitive.kind !== 'DISTRIBUTED_LOAD') {
    fail('distributedLoadLocalVector accepts DISTRIBUTED_LOAD primitives only.', LOAD_CODE);
  }
  const toLocal = primitive.basis === 'GLOBAL'
    ? (intensity) => rotateIntensityToLocal(axes, intensity)
    : (intensity) => ({ ...intensity });
  const start = toLocal(primitive.startIntensity);
  const end = toLocal(primitive.endIntensity);
  for (const [label, intensity] of [['startIntensity', start], ['endIntensity', end]]) {
    for (const component of ['fx', 'fy', 'fz']) {
      requireFinite(intensity[component], `${label}.${component}`, LOAD_CODE);
    }
  }

  const vector = zeroVector12();

  /* Axial: linear interpolation of the linearly varying intensity. */
  vector[0] += length * (2 * start.fx + end.fx) / 6;
  vector[6] += length * (start.fx + 2 * end.fx) / 6;

  /* Local y: plane x-y, bending about z — moments enter RZ directly. */
  const xy = planeLoads(start.fy, end.fy, length, phiXY);
  vector[1] += xy.forceI;
  vector[5] += xy.momentI;
  vector[7] += xy.forceJ;
  vector[11] += xy.momentJ;

  /*
   * Local z: plane x-z, bending about y. The plane formulas are written for a
   * rotation measuring `+d(deflection)/dx`; RY measures `-dw/dx` in the
   * right-handed local triad, so the moment entries change sign.
   */
  const xz = planeLoads(start.fz, end.fz, length, phiXZ);
  vector[2] += xz.forceI;
  vector[4] += -xz.momentI;
  vector[8] += xz.forceJ;
  vector[10] += -xz.momentJ;

  return cleanVector(vector);
}

/**
 * Thermal initial-strain load vector (section 5.4) under the declared uniform
 * approximation: `epsilon0 = alpha * deltaT` with the B-2.0 sign convention
 * POSITIVE_DELTA_T_PRODUCES_POSITIVE_INITIAL_EXTENSION_V1.
 *
 * The vector satisfies the frozen end-action recovery shape
 * `q = K d - equivalentLoad - initialStrainLoad`: free expansion
 * (`u_xj - u_xi = epsilon0 * L`) yields zero end action, and full restraint
 * yields the compressive axial end action `-E A epsilon0` at end J.
 */
export function thermalInitialStrainVector({ elasticModulus, area, axialStrain }) {
  const strain = requireFinite(axialStrain, 'axialStrain', LOAD_CODE);
  const force = elasticModulus * area * strain;
  const vector = zeroVector12();
  vector[0] = -force;
  vector[6] = force;
  return cleanVector(vector);
}
