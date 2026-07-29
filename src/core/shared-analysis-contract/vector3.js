import { SharedAnalysisContractError } from './errors.js';
import { cleanNumber, finiteNumber } from './numeric.js';
import { exactKeys } from './validation.js';

/**
 * Cartesian vector algebra on the `{x, y, z}` record form used by the shared
 * LFEA -> LAFEA contract (section 8 of both plans).
 *
 * The shell kernel stores vectors as `[x, y, z]` arrays; `toArray` is the only
 * sanctioned bridge between the two forms.
 */

export const VECTOR_FIELDS = Object.freeze(['x', 'y', 'z']);

export function canonicalVector3(source, label) {
  exactKeys(source, VECTOR_FIELDS, label);
  return Object.freeze({
    x: finiteNumber(source.x, `${label}.x`),
    y: finiteNumber(source.y, `${label}.y`),
    z: finiteNumber(source.z, `${label}.z`),
  });
}

export function toArray(vector) {
  return [vector.x, vector.y, vector.z];
}

export function add(a, b) {
  return Object.freeze({ x: cleanNumber(a.x + b.x), y: cleanNumber(a.y + b.y), z: cleanNumber(a.z + b.z) });
}

export function subtract(a, b) {
  return Object.freeze({ x: cleanNumber(a.x - b.x), y: cleanNumber(a.y - b.y), z: cleanNumber(a.z - b.z) });
}

export function scale(vector, factor) {
  return Object.freeze({
    x: cleanNumber(vector.x * factor),
    y: cleanNumber(vector.y * factor),
    z: cleanNumber(vector.z * factor),
  });
}

export function dot(a, b) {
  return cleanNumber(a.x * b.x + a.y * b.y + a.z * b.z);
}

export function cross(a, b) {
  return Object.freeze({
    x: cleanNumber(a.y * b.z - a.z * b.y),
    y: cleanNumber(a.z * b.x - a.x * b.z),
    z: cleanNumber(a.x * b.y - a.y * b.x),
  });
}

export function norm(vector) {
  return cleanNumber(Math.hypot(vector.x, vector.y, vector.z));
}

/**
 * Combine basis components into the model frame: `e1*a + e2*b + e3*c`.
 *
 * The supplied basis vectors are used exactly as written. Nothing here
 * reconstructs, re-orders or re-normalises them — a basis that does not
 * qualify is rejected upstream rather than repaired here.
 *
 * @param {{e1:object, e2:object, e3:object}} basis Qualified orthonormal basis.
 * @param {{a:number, b:number, c:number}} components Components along e1, e2, e3.
 * @returns {Readonly<{x:number, y:number, z:number}>} Vector in the model frame.
 */
export function combine(basis, components) {
  return add(
    add(scale(basis.e1, components.a), scale(basis.e2, components.b)),
    scale(basis.e3, components.c),
  );
}

/**
 * Measure how far a triad departs from orthonormal and right-handed.
 *
 * Returns the measurements; it does not decide. `requireOrthonormalBasis`
 * decides, against a tolerance the caller must supply — there is no default,
 * because a defaulted tolerance is a hidden engineering value.
 *
 * @param {{e1:object, e2:object, e3:object}} basis Triad to measure.
 * @returns {Readonly<object>} Deviation record.
 */
export function qualifyOrthonormalBasis(basis) {
  const unitDeviation = Object.freeze({
    e1: cleanNumber(Math.abs(norm(basis.e1) - 1)),
    e2: cleanNumber(Math.abs(norm(basis.e2) - 1)),
    e3: cleanNumber(Math.abs(norm(basis.e3) - 1)),
  });
  const orthogonalityDeviation = Object.freeze({
    e1e2: cleanNumber(Math.abs(dot(basis.e1, basis.e2))),
    e1e3: cleanNumber(Math.abs(dot(basis.e1, basis.e3))),
    e2e3: cleanNumber(Math.abs(dot(basis.e2, basis.e3))),
  });
  const handedness = dot(cross(basis.e1, basis.e2), basis.e3);
  return Object.freeze({
    unitDeviation,
    orthogonalityDeviation,
    handedness,
    handednessDeviation: cleanNumber(Math.abs(handedness - 1)),
    worstDeviation: cleanNumber(Math.max(
      ...Object.values(unitDeviation),
      ...Object.values(orthogonalityDeviation),
      Math.abs(handedness - 1),
    )),
  });
}

/**
 * Reject a triad that is not orthonormal and right-handed to the supplied
 * tolerance. Never re-normalises: silently repairing a basis destroys the one
 * declaration the receiving kernel is meant to trust.
 *
 * @param {{e1:object, e2:object, e3:object}} basis Triad to qualify.
 * @param {number} tolerance Absolute deviation limit, supplied by the caller.
 * @param {string} label Diagnostic label.
 * @returns {Readonly<object>} Qualification record including the tolerance used.
 */
export function requireOrthonormalBasis(basis, tolerance, label) {
  const limit = finiteNumber(tolerance, `${label}.tolerance`);
  if (!(limit > 0)) {
    throw new SharedAnalysisContractError(`${label} basis tolerance must be declared and positive`, 'BASIS_TOLERANCE_NOT_DECLARED');
  }
  const measured = qualifyOrthonormalBasis(basis);
  if (!(measured.worstDeviation <= limit)) {
    throw new SharedAnalysisContractError(
      `${label} basis is not orthonormal and right-handed within ${limit} (worst deviation ${measured.worstDeviation})`,
      'BASIS_NOT_ORTHONORMAL_RIGHT_HANDED',
    );
  }
  return Object.freeze({ ...measured, tolerance: limit, accepted: true });
}
