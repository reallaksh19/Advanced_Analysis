/** Authority and schema constants for resultant-preserving finite foundations. */

export const LOAD_FOUNDATION_SCHEMA = 'lafea-load-foundation/v2';
export const LOAD_FOUNDATION_RESULT_SCHEMA = 'lafea-load-foundation-result/v2';
export const LOAD_FOUNDATION_HANDOFF_SCHEMA = 'lafea-load-foundation-handoff/v1';

export const LOAD_FOUNDATION_ENGINEERING_LEVEL =
  'RESULTANT_PRESERVING_FINITE_FOUNDATION_ONLY';

export const LOAD_FOUNDATION_METHODS = Object.freeze([
  'POINT',
  'LINE',
  'RECTANGULAR_PATCH',
  'CIRCULAR_PATCH',
  'WELD_LINE',
  'RIGID_SPIDER',
]);

export const LOAD_FOUNDATION_TARGET_STAGES = Object.freeze([
  'LAFEA.3',
  'LAFEA.4',
  'LAFEA.5',
]);

export const LOAD_FOUNDATION_QUALIFICATION_STATES = Object.freeze([
  'ACCEPTED',
  'REJECTED_INPUT',
  'EQUILIBRIUM_NOT_CLOSED',
]);

export const LOAD_FOUNDATION_LIMITATIONS = Object.freeze([
  'NO_LOCAL_ATTACHMENT_STRESS',
  'NO_STIFFNESS_DISTRIBUTION',
  'NO_CONTACT_OR_LIFT_OFF',
  'NO_FRICTION',
  'NO_SHELL_OR_CONTINUUM_SOLUTION',
  'NO_WELD_STRESS',
  'NO_CODE_COMPLIANCE',
  'STATION_MEASURES_ARE_CALLER_AUTHORED',
  'DIRECT_STATION_COUPLES_ARE_RESULTANT_PRESERVING_ONLY',
]);

export const LOAD_FOUNDATION_BENCHMARK_IDS = Object.freeze([
  'A1-FP-POINT',
  'A1-FP-LINE',
  'A1-FP-RECT',
  'A1-FP-CIRC',
  'A1-FP-WELD',
  'A1-FP-RSP',
  'A1-FP-RANK',
  'A1-HO-ANCESTRY',
]);
