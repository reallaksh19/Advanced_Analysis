export const THREE_D_CALCULATION_REVIEW_MODEL_SCHEMA = 'three-d-calculation-review-model/v1';

export const THREE_D_DIAGNOSTIC_CODES = Object.freeze({
  OPTIONAL_MODEL_LOAD_INCOMPLETE: 'OPTIONAL_MODEL_LOAD_INCOMPLETE',
  OPTIONAL_MODEL_LOAD_INVALID: 'OPTIONAL_MODEL_LOAD_INVALID',
  OPTIONAL_VERTICAL_BEAM_INCOMPLETE: 'OPTIONAL_VERTICAL_BEAM_INCOMPLETE',
  OPTIONAL_VERTICAL_BEAM_INVALID: 'OPTIONAL_VERTICAL_BEAM_INVALID',
});

export const THREE_D_CALCULATION_ASSUMPTIONS = Object.freeze([
  'Source geometry, connectivity, attachment and restraint evidence are displayed without reinterpretation.',
  'Optional load and vertical-beam rows are adopted only from complete validated upstream contracts.',
  'Vertical displacement and signed support-force conventions remain exactly as authored by W10.6.',
]);

export const THREE_D_CALCULATION_LIMITATIONS = Object.freeze([
  'Read-only evidence review.',
  'Not a second 3D viewport.',
  'Not general 3D piping flexibility.',
  'No thermal or pressure stress.',
  'No nonlinear spring, gap or contact solution.',
  'No horizontal-force or code-stress qualification.',
  'Vertical-beam evidence is scalar and topology-local.',
]);
