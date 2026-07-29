import {
  ATTACHMENT_LOAD_SET_FIELDS,
  BASIS_FIELDS,
  FORCE_FIELDS,
  FORMULA_IDS,
  LOAD_CASE_TYPES,
  MOMENT_FIELDS,
  REJECTION_CODES,
  SCHEMA_ID,
  SIGN_CONVENTIONS,
  SOURCE_KERNELS,
  UNIT_FIELDS,
} from './constants.js';
import { SharedAnalysisContractError } from '../shared-analysis-contract/errors.js';
import { finiteNumber } from '../shared-analysis-contract/numeric.js';
import {
  exactKeys,
  member,
  nonEmptyString,
  stringArray,
} from '../shared-analysis-contract/validation.js';
import {
  canonicalVector3,
  requireOrthonormalBasis,
} from '../shared-analysis-contract/vector3.js';

/**
 * Normalise and qualify an `attachment-load-set/v1` record.
 *
 * Rejections, all by name:
 *
 * - a missing `basis`, `signConvention` or `sourceSemanticHash` (LAFEA S-3
 *   test 1) — these are the three declarations a consumer cannot reconstruct;
 * - a basis triad that is not orthonormal and right-handed to the supplied
 *   tolerance (LFEA B-8 test 2). The triad is never re-normalised.
 *
 * @param {object} source Candidate record.
 * @param {number} basisTolerance Absolute basis deviation limit. Required —
 *        there is no default, because a defaulted tolerance is a hidden
 *        engineering value.
 * @returns {Readonly<object>} Canonical, frozen load set with its qualification.
 */
export function canonicalAttachmentLoadSet(source, basisTolerance) {
  exactKeys(source, ATTACHMENT_LOAD_SET_FIELDS, 'attachmentLoadSet');
  if (source.schema !== SCHEMA_ID) {
    throw new SharedAnalysisContractError(
      `attachmentLoadSet.schema must be ${SCHEMA_ID}`,
      REJECTION_CODES.UNSUPPORTED_VALUE,
    );
  }
  const basis = canonicalBasis(source.basis);
  const basisQualification = requireOrthonormalBasis(basis, basisTolerance, 'attachmentLoadSet.basis');
  return Object.freeze({
    schema: SCHEMA_ID,
    attachmentId: nonEmptyString(source.attachmentId, 'attachmentLoadSet.attachmentId'),
    loadCaseId: nonEmptyString(source.loadCaseId, 'attachmentLoadSet.loadCaseId'),
    loadCaseType: member(source.loadCaseType, LOAD_CASE_TYPES, 'attachmentLoadSet.loadCaseType'),
    basis,
    basisQualification,
    force: canonicalComponents(source.force, FORCE_FIELDS, 'attachmentLoadSet.force'),
    moment: canonicalComponents(source.moment, MOMENT_FIELDS, 'attachmentLoadSet.moment'),
    units: canonicalUnits(source.units),
    signConvention: member(source.signConvention, SIGN_CONVENTIONS, 'attachmentLoadSet.signConvention'),
    sourceKernel: member(source.sourceKernel, SOURCE_KERNELS, 'attachmentLoadSet.sourceKernel'),
    sourceSemanticHash: nonEmptyString(source.sourceSemanticHash, 'attachmentLoadSet.sourceSemanticHash'),
    limitations: Object.freeze([...stringArray(source.limitations, 'attachmentLoadSet.limitations')].sort()),
    formulaIds: Object.freeze([FORMULA_IDS.BASIS_ORTHONORMAL_RIGHT_HANDED]),
  });
}

function canonicalBasis(source) {
  exactKeys(source, BASIS_FIELDS, 'attachmentLoadSet.basis');
  return Object.freeze({
    origin: canonicalVector3(source.origin, 'attachmentLoadSet.basis.origin'),
    e1: canonicalVector3(source.e1, 'attachmentLoadSet.basis.e1'),
    e2: canonicalVector3(source.e2, 'attachmentLoadSet.basis.e2'),
    e3: canonicalVector3(source.e3, 'attachmentLoadSet.basis.e3'),
  });
}

function canonicalComponents(source, fields, label) {
  exactKeys(source, fields, label);
  const result = {};
  for (const field of fields) result[field] = finiteNumber(source[field], `${label}.${field}`);
  return Object.freeze(result);
}

function canonicalUnits(source) {
  exactKeys(source, UNIT_FIELDS, 'attachmentLoadSet.units');
  return Object.freeze({
    force: nonEmptyString(source.force, 'attachmentLoadSet.units.force'),
    moment: nonEmptyString(source.moment, 'attachmentLoadSet.units.moment'),
    length: nonEmptyString(source.length, 'attachmentLoadSet.units.length'),
  });
}

/**
 * Refuse a load set whose units are not the ones the consuming model works in.
 * Units are declared, never assumed, and never converted implicitly here — a
 * conversion belongs to a declared unit-conversion step, not to ingestion.
 *
 * @param {Readonly<object>} loadSet Canonical load set.
 * @param {{force:string, moment:string, length:string}} expected Consumer units.
 * @returns {Readonly<object>} The same load set, on match.
 */
export function requireUnits(loadSet, expected) {
  exactKeys(expected, UNIT_FIELDS, 'expectedUnits');
  for (const field of UNIT_FIELDS) {
    if (loadSet.units[field] !== expected[field]) {
      throw new SharedAnalysisContractError(
        `attachmentLoadSet.units.${field} is ${loadSet.units[field]}; the consumer works in ${expected[field]}`,
        REJECTION_CODES.UNIT_MISMATCH,
      );
    }
  }
  return loadSet;
}
