export const STRICT_INPUTXML_LINEAR_STATIC_PROFILE = 'STRICT_INPUTXML_LINEAR_STATIC_V1';
export const DISCLOSED_GENERIC_ANALYZER_APPROXIMATION_PROFILE =
  'DISCLOSED_GENERIC_ANALYZER_APPROXIMATION_V1';

export const INPUTXML_MODEL_HEALTH_CAPABILITIES = Object.freeze([
  'SOURCE_ACCEPTANCE',
  'TOPOLOGY_ACCEPTANCE',
  'STRICT_LINEAR_STATIC',
  'APPROXIMATE_LINEAR_STATIC',
  'THERMAL_AUTHORITY',
  'SUSTAINED_CASE_STRICT',
  'OPERATING_CASE_STRICT',
  'SUSTAINED_CASE_APPROXIMATE',
  'OPERATING_CASE_APPROXIMATE',
  'CODE_STRESS_INPUT_READINESS',
]);

export const INPUTXML_MODEL_HEALTH_CAPABILITY_DEPENDENCIES = Object.freeze({
  SOURCE_ACCEPTANCE: Object.freeze([]),
  TOPOLOGY_ACCEPTANCE: Object.freeze(['SOURCE_ACCEPTANCE']),
  STRICT_LINEAR_STATIC: Object.freeze(['SOURCE_ACCEPTANCE', 'TOPOLOGY_ACCEPTANCE']),
  APPROXIMATE_LINEAR_STATIC: Object.freeze(['SOURCE_ACCEPTANCE', 'TOPOLOGY_ACCEPTANCE']),
  THERMAL_AUTHORITY: Object.freeze(['SOURCE_ACCEPTANCE']),
  SUSTAINED_CASE_STRICT: Object.freeze(['STRICT_LINEAR_STATIC']),
  OPERATING_CASE_STRICT: Object.freeze(['STRICT_LINEAR_STATIC', 'THERMAL_AUTHORITY']),
  SUSTAINED_CASE_APPROXIMATE: Object.freeze(['APPROXIMATE_LINEAR_STATIC']),
  OPERATING_CASE_APPROXIMATE: Object.freeze(['APPROXIMATE_LINEAR_STATIC', 'THERMAL_AUTHORITY']),
  CODE_STRESS_INPUT_READINESS: Object.freeze(['SOURCE_ACCEPTANCE', 'TOPOLOGY_ACCEPTANCE']),
});

export const INPUTXML_FEATURE_DISPOSITIONS = Object.freeze([
  'IMPLEMENTED_EXACTLY',
  'IMPLEMENTED_WITH_DECLARED_APPROXIMATION',
  'CODE_ONLY',
  'NONLINEAR_OUT_OF_SCOPE',
  'UNSUPPORTED_BY_GENERIC_SOLVER',
  'INVALID_SOURCE_DATA',
  'NOT_ACTIVE',
]);

export const INPUTXML_CAPABILITY_EFFECT_DISPOSITIONS = Object.freeze([
  'PASS',
  'CONDITIONAL',
  'BLOCK',
]);

export function exactDisposition() {
  return Object.freeze({ disposition: 'IMPLEMENTED_EXACTLY', limitationCode: null });
}

export function approximationDisposition(limitationCode) {
  return Object.freeze({
    disposition: 'IMPLEMENTED_WITH_DECLARED_APPROXIMATION',
    limitationCode,
  });
}

export function unsupportedDisposition(limitationCode) {
  return Object.freeze({ disposition: 'UNSUPPORTED_BY_GENERIC_SOLVER', limitationCode });
}

export function nonlinearDisposition(limitationCode) {
  return Object.freeze({ disposition: 'NONLINEAR_OUT_OF_SCOPE', limitationCode });
}

export function codeOnlyDisposition(limitationCode) {
  return Object.freeze({ disposition: 'CODE_ONLY', limitationCode });
}

export function invalidDisposition(limitationCode) {
  return Object.freeze({ disposition: 'INVALID_SOURCE_DATA', limitationCode });
}

export function inactiveDisposition() {
  return Object.freeze({ disposition: 'NOT_ACTIVE', limitationCode: null });
}
