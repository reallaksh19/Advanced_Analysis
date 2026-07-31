/**
 * Functionality: Declares the exact first-cut schemas, methods, statuses, and
 * FEA-only quantities. These constants contain no engineering defaults.
 */

export const FIRST_CUT_SCHEMAS = Object.freeze({
  PROFILE: 'first-cut-load-estimation-profile/v1',
  ASSUMPTIONS: 'first-cut-assumption-set/v1',
  MASS_LEDGER: 'first-cut-mass-ledger/v1',
  SUPPORT_SCREENING: 'first-cut-support-screening/v1',
  BEAM_SCREENING: 'first-cut-beam-screening/v1',
  SUSTAINED_SCREENING: 'first-cut-sustained-screening/v1',
  CALCULATION_PACKAGE: 'first-cut-calculation-package/v1',
  MASTER_DATA: 'first-cut-master-data/v1',
});

export const FIRST_CUT_METHODS = Object.freeze({
  SIMPLE_SPAN: 'SIMPLE_SPAN_TRIBUTARY_VERTICAL_V1',
  CONTINUOUS_BEAM: 'CONTINUOUS_BEAM_GRAVITY_V1',
});

export const FIRST_CUT_STATUSES = Object.freeze({
  QUALIFIED: 'QUALIFIED_SCREENING',
  CONDITIONAL: 'CONDITIONAL',
  ESCALATE: 'ESCALATE',
  BLOCKED: 'BLOCKED',
  STALE: 'STALE',
});

export const FIRST_CUT_CAPABILITIES = Object.freeze({
  SAG: 'SAG_SCREENING',
  SUSTAINED: 'SUSTAINED_STRESS_SCREENING',
});

export const PRESSURE_FORMULA_IDS = Object.freeze({
  USER_AUTHORIZED_LONGITUDINAL: 'USER_AUTHORIZED_LONGITUDINAL_PRESSURE_V1',
});

export const NOT_EVALUATED_FIELDS = Object.freeze([
  'thermalReaction',
  'guideLoad',
  'lineStopLoad',
  'anchorSixDofLoad',
  'nozzleLoad',
  'springContactLoad',
  'liftOff',
  'frictionLoad',
  'occasionalStress',
  'expansionStress',
  'b31_3Compliance',
]);

export const NOT_EVALUATED_LABEL = 'NOT EVALUATED - RUN LFEA';

export const AUTHORITY_LEVELS = Object.freeze([
  'EXPLICIT_SOURCE',
  'ACCEPTED_OVERRIDE',
  'AUTHORIZED_MASTER',
  'USER_APPROVED_APPROXIMATION',
]);

export const MASTER_SELECTOR_KINDS = Object.freeze([
  'ENTITY',
  'PIPING_CLASS_BORE',
  'COMPONENT_TYPE_BORE',
  'SUPPORT_KIND',
]);
