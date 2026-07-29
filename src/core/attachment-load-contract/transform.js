import { FORMULA_IDS, REVERSED_SIGN_CONVENTION } from './constants.js';
import {
  add,
  canonicalVector3,
  combine,
  cross,
  norm,
  subtract,
} from '../shared-analysis-contract/vector3.js';
import { cleanNumber } from '../shared-analysis-contract/numeric.js';

/**
 * Express a load set in the model frame, using the basis vectors the record
 * carries.
 *
 * The basis is used as supplied. Nothing is reconstructed from an implied
 * global frame, and no axis is re-derived from the attachment position — that
 * is the failure mode section 8 rule 1 exists to prevent.
 *
 * @param {Readonly<object>} loadSet Canonical attachment load set.
 * @returns {Readonly<object>} Force, moment and application point in the model frame.
 */
export function attachmentLoadInModelFrame(loadSet) {
  const { basis, force, moment } = loadSet;
  return Object.freeze({
    attachmentId: loadSet.attachmentId,
    loadCaseId: loadSet.loadCaseId,
    loadCaseType: loadSet.loadCaseType,
    signConvention: loadSet.signConvention,
    applicationPoint: basis.origin,
    force: combine(basis, { a: force.fx, b: force.fy, c: force.fz }),
    moment: combine(basis, { a: moment.mx, b: moment.my, c: moment.mz }),
    units: loadSet.units,
    formulaIds: Object.freeze([FORMULA_IDS.BASIS_COMPONENT_COMBINATION]),
  });
}

/**
 * Move a force-moment resultant to a different reference point.
 *
 * `M_about_p = M_about_origin + (origin - p) x F`
 *
 * @param {Readonly<object>} modelFrameLoad Output of `attachmentLoadInModelFrame`.
 * @param {{x:number, y:number, z:number}} point New reference point.
 * @returns {Readonly<object>} Resultant about `point`.
 */
export function resultantAboutPoint(modelFrameLoad, point) {
  const reference = canonicalVector3(point, 'referencePoint');
  const lever = subtract(modelFrameLoad.applicationPoint, reference);
  return Object.freeze({
    referencePoint: reference,
    force: modelFrameLoad.force,
    moment: add(modelFrameLoad.moment, cross(lever, modelFrameLoad.force)),
    formulaIds: Object.freeze([FORMULA_IDS.MOMENT_TRANSFER_ABOUT_POINT]),
  });
}

/**
 * Flip the sense of a load set deliberately.
 *
 * A consumer that needs the opposite sense calls this and the returned record
 * says so in `signConvention`. There is no implicit flip anywhere in the
 * contract tier.
 *
 * @param {Readonly<object>} loadSet Canonical attachment load set.
 * @returns {Readonly<object>} Load set with negated components and the reversed convention.
 */
export function reverseSignConvention(loadSet) {
  return Object.freeze({
    ...loadSet,
    force: Object.freeze({
      fx: cleanNumber(-loadSet.force.fx),
      fy: cleanNumber(-loadSet.force.fy),
      fz: cleanNumber(-loadSet.force.fz),
    }),
    moment: Object.freeze({
      mx: cleanNumber(-loadSet.moment.mx),
      my: cleanNumber(-loadSet.moment.my),
      mz: cleanNumber(-loadSet.moment.mz),
    }),
    signConvention: REVERSED_SIGN_CONVENTION[loadSet.signConvention],
  });
}

/**
 * Compare two force-moment resultants about the same point.
 *
 * Both plans mandate an exact statical-equivalence test: LAFEA S-3 test 2
 * (a distributed load must reproduce the input resultant to 1e-10) and LFEA
 * B-8 test 1 (equilibrium across the handoff). Neither may re-derive this
 * comparison locally.
 *
 * The deviation is relative to the larger of the two magnitudes, so a zero
 * resultant compares by absolute deviation instead of dividing by zero.
 *
 * @param {{force:object, moment:object}} expected Reference resultant.
 * @param {{force:object, moment:object}} actual Resultant to test.
 * @returns {Readonly<object>} Absolute and relative deviations.
 */
export function compareResultants(expected, actual) {
  return Object.freeze({
    force: deviation(expected.force, actual.force),
    moment: deviation(expected.moment, actual.moment),
  });
}

function deviation(expected, actual) {
  const absolute = norm(subtract(actual, expected));
  const scale = Math.max(norm(expected), norm(actual));
  return Object.freeze({
    absolute,
    scale: cleanNumber(scale),
    relative: scale > 0 ? cleanNumber(absolute / scale) : absolute,
  });
}
