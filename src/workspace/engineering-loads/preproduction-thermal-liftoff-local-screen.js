import { semanticHash } from '../../core/shared-piping-model/canonical-json.js';
import { deepFreeze, isPlainRecord } from '../../core/shared-piping-model/immutable.js';
import {
  requirePreproductionThermalLiftoffLocalScreenIntake,
} from './preproduction-thermal-liftoff-local-screen-intake.js';

export const PREPRODUCTION_TL03_LOCAL_SCREEN_SCHEMA =
  'engineering-preproduction-thermal-liftoff-local-screen/v1';
export const PREPRODUCTION_TL03_CURRENTNESS_SCHEMA =
  'engineering-preproduction-thermal-liftoff-local-screen-currentness/v1';
export const PREPRODUCTION_TL03_METHOD_ID = 'THERMAL_LIFTOFF_ACTIVE_SET_V1';
export const PREPRODUCTION_TL03_CLASSIFICATIONS = Object.freeze([
  'CONTACT_RETAINED_CANDIDATE',
  'LIFTOFF_CANDIDATE',
]);

/**
 * TL-03 local candidate screen only.
 *
 * Qualified rule retained from the historical shadow work:
 *   local uplift demand = k_eff * delta_z
 *   local trial contact reserve = R_cold - local uplift demand
 *   reserve > reaction tolerance => contact-retained candidate
 *   otherwise => lift-off candidate
 *
 * A negative trial reserve remains negative evidence. It is never clamped and
 * is not a final redistributed hot reaction.
 */
export function calculatePreproductionThermalLiftoffLocalScreen(input) {
  exactKeys(input, ['executionId', 'executedAt', 'intake'], 'preproduction TL-03 execution input');
  const intake = requirePreproductionThermalLiftoffLocalScreenIntake(input.intake);
  if (intake.status !== 'READY_FOR_TL03_LOCAL_SCREEN') {
    throw codedError('PREPRODUCTION_TL03_INTAKE_NOT_READY');
  }
  if (intake.rows.length === 0) {
    throw codedError('PREPRODUCTION_TL03_SCREEN_EMPTY');
  }

  const supportScreens = intake.rows.map((row) => calculateSupportScreen(row));
  const reactionToleranceN = supportScreens[0].reactionToleranceN;
  if (supportScreens.some((row) => row.reactionToleranceN !== reactionToleranceN)) {
    throw codedError('PREPRODUCTION_TL03_REACTION_TOLERANCE_CONFLICT');
  }
  const material = {
    schema: PREPRODUCTION_TL03_LOCAL_SCREEN_SCHEMA,
    method: PREPRODUCTION_TL03_METHOD_ID,
    executionId: text(input.executionId, 'executionId'),
    executedAt: timestamp(input.executedAt, 'executedAt'),
    stage: 'TL03_LOCAL_SCREEN_ONLY',
    finality: 'NON_FINAL_NO_REDISTRIBUTION',
    datasetId: intake.datasetId,
    loadCaseId: intake.loadCaseId,
    coldGravityMethod: intake.coldGravityMethod,
    reactionToleranceN,
    intakeSemanticHash: intake.semanticHash,
    sourceBindings: intake.sourceBindings,
    status: 'SCREEN_COMPLETE',
    supportScreens,
    unscreenedColdSupportSiteIds: intake.unscreenedColdSupportSiteIds,
    summary: summarize(supportScreens, intake.unscreenedColdSupportSiteIds),
    policy: {
      productionCalculationConsumptionEnabled: false,
      gravityMutationPermitted: false,
      inputGravityRecalculated: false,
      localScreenExecuted: true,
      classificationPerformed: true,
      reactionReserveCalculated: true,
      negativeReactionClamped: false,
      finalReactionCalculated: false,
      activeSetRedistributionPerformed: false,
      recontactPerformed: false,
      springMechanicsExecuted: false,
      frictionMechanicsExecuted: false,
      finalHotReactionPublicationPermitted: false,
      productionMethodRegistrationPermitted: false,
      defaultUiExposurePermitted: false,
    },
  };
  return requirePreproductionThermalLiftoffLocalScreen(freezeHash(material));
}

export function requirePreproductionThermalLiftoffLocalScreen(value) {
  exactKeys(value, [
    'schema', 'method', 'executionId', 'executedAt', 'stage', 'finality',
    'datasetId', 'loadCaseId', 'coldGravityMethod', 'reactionToleranceN',
    'intakeSemanticHash', 'sourceBindings', 'status', 'supportScreens',
    'unscreenedColdSupportSiteIds', 'summary', 'policy', 'semanticHash',
  ], 'preproduction TL-03 local-screen result');
  if (value.schema !== PREPRODUCTION_TL03_LOCAL_SCREEN_SCHEMA
      || value.method !== PREPRODUCTION_TL03_METHOD_ID
      || value.stage !== 'TL03_LOCAL_SCREEN_ONLY'
      || value.finality !== 'NON_FINAL_NO_REDISTRIBUTION'
      || value.status !== 'SCREEN_COMPLETE') {
    throw codedError('PREPRODUCTION_TL03_RESULT_IDENTITY_INVALID');
  }
  text(value.executionId, 'executionId');
  timestamp(value.executedAt, 'executedAt');
  text(value.datasetId, 'datasetId');
  text(value.loadCaseId, 'loadCaseId');
  if (!['CHAINAGE_TRIBUTARY_SPAN_V2', 'CHAINAGE_TRIBUTARY_SPAN_V3_COG'].includes(value.coldGravityMethod)) {
    throw codedError('PREPRODUCTION_TL03_RESULT_GRAVITY_METHOD_INVALID');
  }
  nonnegative(value.reactionToleranceN, 'reactionToleranceN');
  hash(value.intakeSemanticHash, 'intakeSemanticHash');
  requireSourceBindings(value.sourceBindings);
  if (!Array.isArray(value.supportScreens) || value.supportScreens.length === 0
      || !Array.isArray(value.unscreenedColdSupportSiteIds)) {
    throw new TypeError('TL-03 result arrays are invalid.');
  }
  const supportIds = value.supportScreens.map((row) => requireSupportScreen(row, value.reactionToleranceN));
  if (!strictlySortedUnique(supportIds)) {
    throw codedError('PREPRODUCTION_TL03_RESULT_ROW_ORDER_INVALID');
  }
  const expectedSummary = summarize(value.supportScreens, value.unscreenedColdSupportSiteIds);
  if (semanticHash(value.summary) !== semanticHash(expectedSummary)) {
    throw codedError('PREPRODUCTION_TL03_RESULT_SUMMARY_INVALID');
  }
  const policy = value.policy || {};
  if (policy.productionCalculationConsumptionEnabled !== false
      || policy.gravityMutationPermitted !== false
      || policy.inputGravityRecalculated !== false
      || policy.localScreenExecuted !== true
      || policy.classificationPerformed !== true
      || policy.reactionReserveCalculated !== true
      || policy.negativeReactionClamped !== false
      || policy.finalReactionCalculated !== false
      || policy.activeSetRedistributionPerformed !== false
      || policy.recontactPerformed !== false
      || policy.springMechanicsExecuted !== false
      || policy.frictionMechanicsExecuted !== false
      || policy.finalHotReactionPublicationPermitted !== false
      || policy.productionMethodRegistrationPermitted !== false
      || policy.defaultUiExposurePermitted !== false) {
    throw codedError('PREPRODUCTION_TL03_RESULT_POLICY_INVALID');
  }
  const { semanticHash: actual, ...material } = value;
  if (actual !== semanticHash(material)) {
    throw codedError('PREPRODUCTION_TL03_RESULT_HASH_MISMATCH');
  }
  return deepFreeze(structuredClone(value));
}

export function assessPreproductionThermalLiftoffLocalScreenCurrentness(resultValue, intakeValue) {
  const result = requirePreproductionThermalLiftoffLocalScreen(resultValue);
  const intake = requirePreproductionThermalLiftoffLocalScreenIntake(intakeValue);
  const differences = [];
  if (result.intakeSemanticHash !== intake.semanticHash) differences.push('intakeSemanticHash');
  for (const key of Object.keys(result.sourceBindings)) {
    if (result.sourceBindings[key] !== intake.sourceBindings[key]) differences.push(key);
  }
  const material = {
    schema: PREPRODUCTION_TL03_CURRENTNESS_SCHEMA,
    resultSemanticHash: result.semanticHash,
    observedIntakeSemanticHash: intake.semanticHash,
    status: differences.length ? 'STALE_RESCREEN_REQUIRED' : 'CURRENT',
    differences: [...new Set(differences)].sort(ascii),
    productionCalculationConsumptionEnabled: false,
    finalHotReactionPublicationPermitted: false,
  };
  return freezeHash(material);
}

function calculateSupportScreen(row) {
  const localUpliftDemandN = row.effectiveVerticalStiffnessNPerM
    * row.usedUpwardRelativeDisplacementM;
  const localTrialContactReserveN = row.coldGravityReactionN - localUpliftDemandN;
  const classification = localTrialContactReserveN > row.reactionToleranceN
    ? 'CONTACT_RETAINED_CANDIDATE'
    : 'LIFTOFF_CANDIDATE';
  return freezeHash({
    supportKey: row.supportKey,
    supportSiteId: row.supportSiteId,
    routeChainageMm: row.routeChainageMm,
    classification,
    coldGravityReactionN: row.coldGravityReactionN,
    usedUpwardRelativeDisplacementM: row.usedUpwardRelativeDisplacementM,
    effectiveVerticalStiffnessNPerM: row.effectiveVerticalStiffnessNPerM,
    localUpliftDemandN,
    localTrialContactReserveN,
    reactionToleranceN: row.reactionToleranceN,
    coldGapM: row.coldGapM,
    screenKinematicOpeningM: row.coldGapM + row.usedUpwardRelativeDisplacementM,
    contactRowSemanticHash: row.contactRowSemanticHash,
    prerequisiteRowSemanticHash: row.prerequisiteRowSemanticHash,
    displacementSemanticHash: row.displacementSemanticHash,
    stiffnessSemanticHash: row.stiffnessSemanticHash,
    applicabilitySemanticHash: row.applicabilitySemanticHash,
    reactionToleranceSemanticHash: row.reactionToleranceSemanticHash,
    coldSupportRowSemanticHash: row.coldSupportRowSemanticHash,
  });
}

function requireSupportScreen(value, reactionToleranceN) {
  exactKeys(value, [
    'supportKey', 'supportSiteId', 'routeChainageMm', 'classification',
    'coldGravityReactionN', 'usedUpwardRelativeDisplacementM',
    'effectiveVerticalStiffnessNPerM', 'localUpliftDemandN',
    'localTrialContactReserveN', 'reactionToleranceN', 'coldGapM',
    'screenKinematicOpeningM', 'contactRowSemanticHash',
    'prerequisiteRowSemanticHash', 'displacementSemanticHash',
    'stiffnessSemanticHash', 'applicabilitySemanticHash',
    'reactionToleranceSemanticHash', 'coldSupportRowSemanticHash', 'semanticHash',
  ], 'TL-03 support screen');
  text(value.supportKey, 'supportKey');
  const supportSiteId = text(value.supportSiteId, 'supportSiteId');
  if (!PREPRODUCTION_TL03_CLASSIFICATIONS.includes(value.classification)) {
    throw codedError('PREPRODUCTION_TL03_CLASSIFICATION_INVALID');
  }
  finite(value.routeChainageMm, 'routeChainageMm');
  finite(value.coldGravityReactionN, 'coldGravityReactionN');
  const delta = finite(value.usedUpwardRelativeDisplacementM, 'usedUpwardRelativeDisplacementM');
  const stiffness = positive(value.effectiveVerticalStiffnessNPerM, 'effectiveVerticalStiffnessNPerM');
  const tolerance = nonnegative(value.reactionToleranceN, 'reactionToleranceN');
  if (tolerance !== reactionToleranceN) {
    throw codedError('PREPRODUCTION_TL03_REACTION_TOLERANCE_MISMATCH');
  }
  const gap = nonnegative(value.coldGapM, 'coldGapM');
  const expectedUplift = stiffness * delta;
  const expectedReserve = value.coldGravityReactionN - expectedUplift;
  const expectedOpening = gap + delta;
  if (value.localUpliftDemandN !== expectedUplift
      || value.localTrialContactReserveN !== expectedReserve
      || value.screenKinematicOpeningM !== expectedOpening) {
    throw codedError('PREPRODUCTION_TL03_ARITHMETIC_MISMATCH');
  }
  const expectedClassification = expectedReserve > tolerance
    ? 'CONTACT_RETAINED_CANDIDATE'
    : 'LIFTOFF_CANDIDATE';
  if (value.classification !== expectedClassification) {
    throw codedError('PREPRODUCTION_TL03_CLASSIFICATION_MISMATCH');
  }
  for (const key of [
    'contactRowSemanticHash', 'prerequisiteRowSemanticHash',
    'displacementSemanticHash', 'stiffnessSemanticHash',
    'applicabilitySemanticHash', 'reactionToleranceSemanticHash',
    'coldSupportRowSemanticHash',
  ]) hash(value[key], key);
  const { semanticHash: actual, ...material } = value;
  if (actual !== semanticHash(material)) {
    throw codedError('PREPRODUCTION_TL03_SUPPORT_SCREEN_HASH_MISMATCH');
  }
  return supportSiteId;
}

function summarize(rows, unscreened) {
  return {
    supportScreenCount: rows.length,
    contactRetainedCandidateCount: rows.filter((row) => row.classification === 'CONTACT_RETAINED_CANDIDATE').length,
    liftoffCandidateCount: rows.filter((row) => row.classification === 'LIFTOFF_CANDIDATE').length,
    negativeTrialReserveCount: rows.filter((row) => row.localTrialContactReserveN < 0).length,
    unscreenedColdSupportCount: unscreened.length,
  };
}
function requireSourceBindings(value) {
  exactKeys(value, [
    'coldGravityExecutionSemanticHash', 'coldGravityDistributionSemanticHash',
    'contactAuthoritySemanticHash', 'prerequisiteAuthoritySemanticHash',
  ], 'TL-03 result source bindings');
  Object.entries(value).forEach(([key, item]) => hash(item, key));
}
function exactKeys(value, keys, label) {
  if (!isPlainRecord(value)
      || JSON.stringify(Object.keys(value).sort(ascii)) !== JSON.stringify([...keys].sort(ascii))) {
    throw new TypeError(`${label} contains unexpected or missing keys.`);
  }
}
function freezeHash(material) { return deepFreeze({ ...material, semanticHash: semanticHash(material) }); }
function text(value, label) { if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${label} must be non-empty.`); return value; }
function timestamp(value, label) { const result = text(value, label); if (new Date(result).toISOString() !== result) throw new TypeError(`${label} must be canonical ISO-8601.`); return result; }
function finite(value, label) { if (!Number.isFinite(value)) throw new TypeError(`${label} must be finite.`); return value; }
function positive(value, label) { const result = finite(value, label); if (result <= 0) throw new TypeError(`${label} must be positive.`); return result; }
function nonnegative(value, label) { const result = finite(value, label); if (result < 0) throw new TypeError(`${label} must be non-negative.`); return result; }
function hash(value, label) { if (typeof value !== 'string' || !/^fnv1a64:[0-9a-f]{16}$/u.test(value)) throw new TypeError(`${label} must be an FNV-1a hash.`); return value; }
function strictlySortedUnique(values) { return values.every((value, index) => index === 0 || ascii(values[index - 1], value) < 0); }
function ascii(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
function codedError(code) { const error = new Error(code); error.code = code; return error; }
