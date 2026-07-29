/**
 * Constants for `attachment-load-set/v1` — the record LFEA exports (B-8) and
 * LAFEA ingests (S-3).
 *
 * This module is section 8 of both improvement plans, in code. It is owned by
 * neither plan and is changed only in a pull request that touches both.
 */

export const SCHEMA_ID = 'attachment-load-set/v1';

export const ATTACHMENT_LOAD_SET_FIELDS = Object.freeze([
  'schema',
  'attachmentId',
  'loadCaseId',
  'loadCaseType',
  'basis',
  'force',
  'moment',
  'units',
  'signConvention',
  'sourceKernel',
  'sourceSemanticHash',
  'limitations',
]);

export const BASIS_FIELDS = Object.freeze(['origin', 'e1', 'e2', 'e3']);
export const FORCE_FIELDS = Object.freeze(['fx', 'fy', 'fz']);
export const MOMENT_FIELDS = Object.freeze(['mx', 'my', 'mz']);
export const UNIT_FIELDS = Object.freeze(['force', 'moment', 'length']);

/**
 * Load case types. `OCCASIONAL` is deliberately absent: neither plan covers
 * wind, seismic or slug in this phase, and an unsupported case is rejected
 * rather than silently mapped onto one of these two.
 */
export const LOAD_CASE_TYPES = Object.freeze(['SUSTAINED', 'THERMAL_EXPANSION']);

/**
 * Sign conventions, written into the record as a string and never assumed.
 * Both directions are named so a consumer flips deliberately, via
 * `reverseSignConvention`, instead of guessing.
 */
export const SIGN_CONVENTIONS = Object.freeze([
  'FORCE_ON_ATTACHMENT_FROM_PIPE',
  'FORCE_ON_PIPE_FROM_ATTACHMENT',
]);

export const REVERSED_SIGN_CONVENTION = Object.freeze({
  FORCE_ON_ATTACHMENT_FROM_PIPE: 'FORCE_ON_PIPE_FROM_ATTACHMENT',
  FORCE_ON_PIPE_FROM_ATTACHMENT: 'FORCE_ON_ATTACHMENT_FROM_PIPE',
});

/** The only producer of this record in this phase. */
export const SOURCE_KERNELS = Object.freeze(['centerline-beam-fea']);

export const FORMULA_IDS = Object.freeze({
  BASIS_ORTHONORMAL_RIGHT_HANDED: 'ATTACHMENT_BASIS_ORTHONORMAL_RIGHT_HANDED',
  BASIS_COMPONENT_COMBINATION: 'ATTACHMENT_LOAD_BASIS_COMPONENT_COMBINATION',
  MOMENT_TRANSFER_ABOUT_POINT: 'MOMENT_TRANSFER_M_PLUS_R_CROSS_F',
});

export const REJECTION_CODES = Object.freeze({
  MISSING_FIELD: 'MISSING_FIELD',
  UNEXPECTED_FIELD: 'UNEXPECTED_FIELD',
  UNSUPPORTED_VALUE: 'UNSUPPORTED_VALUE',
  MISSING_DECLARATION: 'MISSING_DECLARATION',
  BASIS_NOT_ORTHONORMAL_RIGHT_HANDED: 'BASIS_NOT_ORTHONORMAL_RIGHT_HANDED',
  BASIS_TOLERANCE_NOT_DECLARED: 'BASIS_TOLERANCE_NOT_DECLARED',
  UNIT_MISMATCH: 'ATTACHMENT_LOAD_UNIT_MISMATCH',
});
