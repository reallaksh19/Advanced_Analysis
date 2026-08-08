import { semanticHash } from '../../core/shared-piping-model/canonical-json.js';
import { deepFreeze, isPlainRecord } from '../../core/shared-piping-model/immutable.js';
import { THERMAL_LIFTOFF_METHOD_ID } from './empirical-thermal-liftoff-authority.js';

export const THERMAL_LIFTOFF_FORMULA_REGISTER_SCHEMA =
  'empirical-thermal-liftoff-formula-register/v1';

const TERM_IDS = Object.freeze([
  'LOCAL_UPLIFT_DEMAND',
  'LOCAL_TRIAL_CONTACT_RESERVE',
  'LOCAL_SCREEN_CLASSIFICATION',
]);

export function createThermalLiftoffFormulaRegister() {
  const draft = {
    schema: THERMAL_LIFTOFF_FORMULA_REGISTER_SCHEMA,
    method: THERMAL_LIFTOFF_METHOD_ID,
    implementationStage: 'TL00_TL03_SHADOW_LOCAL_SCREEN',
    runtimeStatus: 'SHADOW_NOT_REGISTERED',
    classification: 'NON_FINAL_LOCAL_CONTACT_SCREEN',
    sourceAxisBasis: 'GLOBAL_Z_UP',
    reactionConvention: 'POSITIVE_UPWARD_OPPOSING_GRAVITY',
    gapConvention: 'POSITIVE_OPEN_PIPE_TO_SUPPORT',
    terms: [
      term({
        termId: 'LOCAL_UPLIFT_DEMAND',
        concept: 'Form local upward displacement-driven reaction demand only from qualified local effective vertical stiffness and qualified upward relative displacement.',
        equation: 'U_i_N = k_i_eff_N_per_m * delta_i_up_m',
        outputUnit: 'N',
        authorities: ['TL-01 qualified used displacement', 'TL-02 qualified local stiffness entry'],
        blockers: ['THERMAL_LIFTOFF_DISPLACEMENT_AUTHORITY_MISSING', 'THERMAL_LIFTOFF_STIFFNESS_AUTHORITY_MISSING', 'THERMAL_LIFTOFF_STIFFNESS_AUTHORITY_CONFLICT'],
        benchmarkReferences: ['docs/empericalformulaconceptnote.md#6.1 zero-temperature parity'],
      }),
      term({
        termId: 'LOCAL_TRIAL_CONTACT_RESERVE',
        concept: 'Subtract local uplift demand from the immutable authorized cold-gravity reaction without support release or redistribution.',
        equation: 'R_i_trial_N = R_i_cold_N - U_i_N',
        outputUnit: 'N',
        authorities: ['current authorized CHAINAGE_TRIBUTARY_SPAN_V2 or CHAINAGE_TRIBUTARY_SPAN_V3_COG execution', 'LOCAL_UPLIFT_DEMAND'],
        blockers: ['THERMAL_LIFTOFF_COLD_GRAVITY_NOT_CURRENT'],
        benchmarkReferences: ['docs/empericalformulaconceptnote.md#6.1 zero-temperature parity'],
      }),
      term({
        termId: 'LOCAL_SCREEN_CLASSIFICATION',
        concept: 'Classify a local contact candidate using an explicitly qualified reaction tolerance; this does not publish a reaction vector.',
        equation: 'R_i_trial > reactionTolerance -> CONTACT_RETAINED_CANDIDATE; otherwise LIFTOFF_CANDIDATE; missing authority -> UNRESOLVED_GATE',
        outputUnit: 'ENUM',
        authorities: ['TL-00 reaction-tolerance authority', 'LOCAL_TRIAL_CONTACT_RESERVE'],
        blockers: ['THERMAL_LIFTOFF_REACTION_TOLERANCE_AUTHORITY_MISSING'],
        benchmarkReferences: ['docs/empirical-thermal-liftoff-plan.md#5.1'],
      }),
    ],
    limitations: [
      'NO_ACTIVE_SET_REDISTRIBUTION',
      'NO_FINAL_HOT_REACTION',
      'NO_RECONTACT',
      'NO_DEFAULT_UI_EXPOSURE',
      'NO_SEAL_OR_EXPORT_ELIGIBILITY',
    ],
  };
  return requireThermalLiftoffFormulaRegister({
    ...draft,
    semanticHash: semanticHash(draft),
  });
}

export function requireThermalLiftoffFormulaRegister(value) {
  exactKeys(value, [
    'schema', 'method', 'implementationStage', 'runtimeStatus', 'classification',
    'sourceAxisBasis', 'reactionConvention', 'gapConvention', 'terms', 'limitations',
    'semanticHash',
  ], 'thermal lift-off formula register');
  if (value.schema !== THERMAL_LIFTOFF_FORMULA_REGISTER_SCHEMA
    || value.method !== THERMAL_LIFTOFF_METHOD_ID
    || value.runtimeStatus !== 'SHADOW_NOT_REGISTERED') {
    throw new TypeError('Unexpected thermal lift-off formula-register identity.');
  }
  if (!Array.isArray(value.terms)
    || JSON.stringify(value.terms.map((row) => row.termId)) !== JSON.stringify(TERM_IDS)) {
    throw new TypeError('Thermal lift-off formula-register term order or coverage is incomplete.');
  }
  value.terms.forEach((row) => exactKeys(row, [
    'status', 'termId', 'concept', 'equation', 'outputUnit', 'authorities',
    'blockers', 'benchmarkReferences',
  ], `thermal lift-off formula term ${row?.termId || '<missing>'}`));
  const { semanticHash: actual, ...payload } = value;
  if (actual !== semanticHash(payload)) {
    throw new TypeError('Thermal lift-off formula-register semantic hash mismatch.');
  }
  return deepFreeze(structuredClone(value));
}

export const THERMAL_LIFTOFF_FORMULA_REGISTER = createThermalLiftoffFormulaRegister();

function term(value) {
  return deepFreeze({ status: 'IMPLEMENTED_SHADOW', ...value });
}

function exactKeys(value, keys, label) {
  if (!isPlainRecord(value)) throw new TypeError(`${label} must be an object.`);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new TypeError(`${label} contains unexpected or missing keys.`);
  }
}
