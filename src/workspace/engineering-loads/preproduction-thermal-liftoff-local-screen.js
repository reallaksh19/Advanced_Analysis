import { semanticHash } from '../../core/shared-piping-model/canonical-json.js';
import { deepFreeze, isPlainRecord, stringValue } from '../../core/shared-piping-model/immutable.js';

export const PREPRODUCTION_TL_LOCAL_SCREEN_CANDIDATE_SCHEMA =
  'engineering-preproduction-thermal-liftoff-local-screen-candidate/v1';

export const PREPRODUCTION_TL_LOCAL_SCREEN_CLASSIFICATIONS = deepFreeze([
  'CONTACT_RETAINED_CANDIDATE',
  'LIFTOFF_CANDIDATE',
]);

const INPUT_KEYS = Object.freeze([
  'supportSiteId',
  'coldGravityReactionN',
  'usedUpwardRelativeDisplacementM',
  'effectiveVerticalStiffnessNPerM',
  'reactionToleranceN',
  'coldGapM',
]);

const OUTPUT_KEYS = Object.freeze([
  'schema',
  'supportSiteId',
  'classification',
  'coldGravityReactionN',
  'usedUpwardRelativeDisplacementM',
  'qualifiedEffectiveVerticalStiffnessNPerM',
  'localUpliftDemandN',
  'localTrialContactReserveN',
  'coldGapM',
  'screenKinematicOpeningM',
  'finality',
  'semanticHash',
]);

/**
 * TL-03 local screening equation only.
 *
 * This function deliberately does not clamp a negative trial reserve, release a
 * support, redistribute gravity, solve coupling, evaluate re-contact, or publish
 * a final hot reaction. A negative trial reserve remains evidence for a
 * LIFTOFF_CANDIDATE classification and is preserved verbatim.
 */
export function calculatePreproductionThermalLiftoffLocalScreenCandidate(input) {
  exactKeys(input, INPUT_KEYS, 'TL-03 local-screen candidate input');
  const supportSiteId = text(input.supportSiteId, 'supportSiteId');
  const coldGravityReactionN = nonnegative(
    input.coldGravityReactionN,
    'coldGravityReactionN',
  );
  const usedUpwardRelativeDisplacementM = finite(
    input.usedUpwardRelativeDisplacementM,
    'usedUpwardRelativeDisplacementM',
  );
  const qualifiedEffectiveVerticalStiffnessNPerM = positive(
    input.effectiveVerticalStiffnessNPerM,
    'effectiveVerticalStiffnessNPerM',
  );
  const reactionToleranceN = nonnegative(
    input.reactionToleranceN,
    'reactionToleranceN',
  );
  const coldGapM = nonnegative(input.coldGapM, 'coldGapM');
  const localUpliftDemandN = qualifiedEffectiveVerticalStiffnessNPerM
    * usedUpwardRelativeDisplacementM;
  const localTrialContactReserveN = coldGravityReactionN - localUpliftDemandN;
  const classification = localTrialContactReserveN > reactionToleranceN
    ? 'CONTACT_RETAINED_CANDIDATE'
    : 'LIFTOFF_CANDIDATE';
  const material = {
    schema: PREPRODUCTION_TL_LOCAL_SCREEN_CANDIDATE_SCHEMA,
    supportSiteId,
    classification,
    coldGravityReactionN,
    usedUpwardRelativeDisplacementM,
    qualifiedEffectiveVerticalStiffnessNPerM,
    localUpliftDemandN,
    localTrialContactReserveN,
    coldGapM,
    screenKinematicOpeningM: coldGapM + usedUpwardRelativeDisplacementM,
    finality: 'NON_FINAL_NO_REDISTRIBUTION',
  };
  return requirePreproductionThermalLiftoffLocalScreenCandidate({
    ...material,
    semanticHash: semanticHash(material),
  }, reactionToleranceN);
}

export function requirePreproductionThermalLiftoffLocalScreenCandidate(
  value,
  reactionToleranceN,
) {
  exactKeys(value, OUTPUT_KEYS, 'TL-03 local-screen candidate');
  if (value.schema !== PREPRODUCTION_TL_LOCAL_SCREEN_CANDIDATE_SCHEMA
      || value.finality !== 'NON_FINAL_NO_REDISTRIBUTION') {
    throw coded('PREPRODUCTION_TL03_LOCAL_SCREEN_SCHEMA_INVALID');
  }
  const tolerance = nonnegative(reactionToleranceN, 'reactionToleranceN');
  const supportSiteId = text(value.supportSiteId, 'supportSiteId');
  const coldGravityReactionN = nonnegative(
    value.coldGravityReactionN,
    'coldGravityReactionN',
  );
  const displacement = finite(
    value.usedUpwardRelativeDisplacementM,
    'usedUpwardRelativeDisplacementM',
  );
  const stiffness = positive(
    value.qualifiedEffectiveVerticalStiffnessNPerM,
    'qualifiedEffectiveVerticalStiffnessNPerM',
  );
  const coldGapM = nonnegative(value.coldGapM, 'coldGapM');
  const expectedUpliftN = stiffness * displacement;
  const expectedTrialN = coldGravityReactionN - expectedUpliftN;
  const expectedOpeningM = coldGapM + displacement;
  const expectedClassification = expectedTrialN > tolerance
    ? 'CONTACT_RETAINED_CANDIDATE'
    : 'LIFTOFF_CANDIDATE';
  if (value.localUpliftDemandN !== expectedUpliftN
      || value.localTrialContactReserveN !== expectedTrialN
      || value.screenKinematicOpeningM !== expectedOpeningM) {
    throw coded('PREPRODUCTION_TL03_LOCAL_SCREEN_ARITHMETIC_MISMATCH');
  }
  if (value.classification !== expectedClassification
      || !PREPRODUCTION_TL_LOCAL_SCREEN_CLASSIFICATIONS.includes(value.classification)) {
    throw coded('PREPRODUCTION_TL03_LOCAL_SCREEN_CLASSIFICATION_MISMATCH');
  }
  const { semanticHash: actual, ...material } = value;
  if (actual !== semanticHash(material)) {
    throw coded('PREPRODUCTION_TL03_LOCAL_SCREEN_HASH_MISMATCH');
  }
  return deepFreeze({
    ...structuredClone(value),
    supportSiteId,
  });
}

function exactKeys(value, keys, label) {
  if (!isPlainRecord(value)) throw new TypeError(`${label} must be an object.`);
  const actual = Object.keys(value).sort(ascii);
  const expected = [...keys].sort(ascii);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new TypeError(`${label} contains unexpected or missing keys.`);
  }
}

function text(value, label) {
  const normalized = stringValue(value);
  if (!normalized) throw new TypeError(`${label} must be non-empty.`);
  return normalized;
}

function finite(value, label) {
  if (!Number.isFinite(value)) throw new TypeError(`${label} must be finite.`);
  return value;
}

function nonnegative(value, label) {
  const result = finite(value, label);
  if (result < 0) throw new TypeError(`${label} must be non-negative.`);
  return result;
}

function positive(value, label) {
  const result = finite(value, label);
  if (result <= 0) throw new TypeError(`${label} must be positive.`);
  return result;
}

function ascii(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function coded(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}
