export const LOAD_CALCULATION_REVIEW_MODEL_SCHEMA = 'load-calculation-review-model/v1';

export const REVIEW_DIAGNOSTIC_CODES = Object.freeze({
  OPTIONAL_SCREENING_INCOMPLETE: 'OPTIONAL_SCREENING_INCOMPLETE',
  OPTIONAL_SCREENING_INVALID: 'OPTIONAL_SCREENING_INVALID',
});

export const LOAD_CALCULATION_LIMITATIONS = Object.freeze([
  'component gravity loads only',
  'not full piping flexibility',
  'no thermal or pressure stress',
  'no horizontal restraint forces',
  'no code-stress qualification',
  'tributary screening is not stiffness reaction analysis',
]);
