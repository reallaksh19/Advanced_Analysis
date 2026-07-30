import { SharedAnalysisContractError } from '../shared-analysis-contract/errors.js';
import { requireDeclaredValue } from '../shared-analysis-contract/declared-value.js';
import { deepFreeze, isPlainRecord } from '../shared-piping-model/immutable.js';
import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { requireCanonicalNodeId } from '../linear-fea-contract/identifiers.js';
import { PROHIBITED_PROFILE_SOURCE_TOKENS, compareAscii } from '../linear-fea-load-case/load-case-contract.js';
import {
  APPROXIMATION_STATUSES,
  FACTOR_APPLICABILITY_KEYS,
  FACTOR_APPLICABILITY_STATUSES,
  FACTOR_OVERRIDE_KEYS,
  FACTOR_SOURCE_IDENTITY_KEYS,
  requireFactorApplicability,
} from '../linear-fea-piping-components/piping-component-contract.js';

/**
 * LFEA-B4.0 B31.3-2024 code-profile / edition-dataset / stress-factor-set
 * contracts (sections 10, 11, 15.2 B31-SUS-01/B31-EXP-01/B31-OCC-01).
 *
 * ---------------------------------------------------------------------------
 * LEGAL/SPEC BOUNDARY (section 10 banner, section 1.2): ASME B31.3 allowable-
 * stress tables, temperature-interpolated allowable values and ASME B31J
 * SIF/flexibility tables are copyrighted publications. Nothing in this
 * package (or its fixtures) transcribes a real ASME table value. Every
 * allowable stress, weld/joint factor, occasional duration factor,
 * displacement-range coefficient and B31J index/SIF arrives as a
 * caller-declared `{value, source}` entry inside a caller-supplied
 * `fea-b31-edition-dataset/v1` or `fea-b31-stress-factor-set/v1` record; this
 * module implements only the generic combination arithmetic (F/A, M/Z, a
 * weighted cold/hot range, an SRSS bending+torsion fold) under a symbolic
 * named rule ID, never a licensed formula's actual coefficients.
 * ---------------------------------------------------------------------------
 *
 * This module is a pure consumer: it cites B-3.4 recovered resultants and
 * B-3.2 component/section/material evidence by identity and never recomputes
 * a stiffness, a resultant or a flexibility factor. Section 10.4 Ownership
 * ("only one component package may apply flexibility") belongs to B-3.2;
 * this package never touches stiffness.
 */

export const CODE_PROFILE_SCHEMA = 'fea-b31-code-profile/v1';
export const EDITION_DATASET_SCHEMA = 'fea-b31-edition-dataset/v1';
export const STRESS_FACTOR_SET_SCHEMA = 'fea-b31-stress-factor-set/v1';
export const CODE_RESULT_SCHEMA = 'lfea-b31-code-result/v1';

/** Internal frozen contract identity for the profile shape itself — distinct
 * from `codeProfileId`, the caller-declared public identity (e.g. a project's
 * "ASME-B31.3-2024-R1") that is cited on every code result and therefore
 * feeds its hash (section 15.5: changing edition/profile must invalidate a
 * prior code result). */
export const CODE_PROFILE_PROFILE_ID = 'LINEAR-B31-CODE-PROFILE-R1';

/** Section 10.1: the one profile scope implemented this phase. */
export const CODE_PROFILE_STANDARD = 'ASME_B31_3_2024';
/** Section 10.1: flexibility/SIF source "where selected and applicable" — a
 * profile may declare this null when B31J is not applicable to a component. */
export const FLEXIBILITY_SIF_STANDARD = 'ASME_B31J_2023';

export const IMPLEMENTED_CODE_SCOPES = Object.freeze(['METALLIC_PROCESS_PIPING_B31_3']);
/** Section 10.1: "other scopes ... are blocked until implemented" — named
 * explicitly so a profile that selects one of these gets a dedicated refusal
 * rather than silent misuse of the metallic-piping evaluators. */
export const UNIMPLEMENTED_CODE_SCOPES = Object.freeze([
  'CHAPTER_IX_HIGH_PRESSURE_PIPING',
  'K_SERVICE_PIPING',
  'NONMETALLIC_PIPING',
  'DETAILED_FATIGUE_ANALYSIS',
]);
export const CODE_SCOPES = Object.freeze([...IMPLEMENTED_CODE_SCOPES, ...UNIMPLEMENTED_CODE_SCOPES]);

/** Section 10.5: the interpolation *method* is generic/declared; the
 * underlying allowable values are always caller-supplied. Extrapolation is
 * never implemented under either method — a temperature outside the
 * declared table range is always refused. */
export const EXACT_MATCH_TEMPERATURE_POLICY = 'EXACT_MATCH_ONLY_V1';
export const LINEAR_BRACKET_TEMPERATURE_POLICY = 'LINEAR_BRACKET_INTERPOLATION_V1';
export const TEMPERATURE_INTERPOLATION_POLICIES = Object.freeze([
  EXACT_MATCH_TEMPERATURE_POLICY,
  LINEAR_BRACKET_TEMPERATURE_POLICY,
]);

/** Section 10.5: the displacement-range combination *formula* is generic
 * (weighted cold/hot allowable, then a cycle-reduction factor); every
 * coefficient is a caller-declared edition-dataset entry. */
export const DISPLACEMENT_RANGE_COMBINATION_RULE = 'DISPLACEMENT_RANGE_COLD_HOT_CYCLE_REDUCTION_LINEAR_V1';

/** Section 10.3: the stress-combination formula this package implements —
 * generic beam mechanics (F/A, M/Z) folded by direct sum (axial + pressure)
 * and SRSS (bending + torsion), never a licensed table value. */
export const STRESS_COMBINATION_METHOD = 'DIRECT_PLUS_SRSS_BENDING_TORSION_V1';

/** Section 10.2 required categories. */
export const SUSTAINED = 'SUSTAINED';
export const OCCASIONAL = 'OCCASIONAL';
export const DISPLACEMENT_STRESS_RANGE = 'DISPLACEMENT_STRESS_RANGE';
export const OPERATING = 'OPERATING';
export const EXPANSION_RANGE_ENVELOPE = 'EXPANSION_RANGE_ENVELOPE';
export const USER_PROJECT_CHECK = 'USER_PROJECT_CHECK';

export const STRESS_CATEGORIES = Object.freeze([
  SUSTAINED, OCCASIONAL, DISPLACEMENT_STRESS_RANGE, OPERATING, EXPANSION_RANGE_ENVELOPE, USER_PROJECT_CHECK,
]);
/** Categories this phase actually evaluates; the rest are explicitly refused
 * (never silently ignored) rather than shallow-implemented. */
export const IMPLEMENTED_STRESS_CATEGORIES = Object.freeze([SUSTAINED, OCCASIONAL, DISPLACEMENT_STRESS_RANGE]);

/** Section 10.7: the exact status vocabulary; never a generic compliance badge. */
export const STATUS_QUALIFIED = 'QUALIFIED UNDER CONFIGURED PROFILE';
export const STATUS_CONDITIONAL = 'CONDITIONAL';
export const STATUS_BLOCKED = 'BLOCKED';
export const CODE_RESULT_STATUSES = Object.freeze([STATUS_QUALIFIED, STATUS_CONDITIONAL, STATUS_BLOCKED]);

/** Section 10.3: the four moment/force directions a distinguishing profile
 * must never collapse into one scalar. */
export const MOMENT_DIRECTION_FIELDS = Object.freeze(['my', 'mz']);

/** Section 9 local-action shape (the B-3.4 recovered resultant this package
 * consumes verbatim, never recomputed). */
export const LOCAL_ACTION_FIELDS = Object.freeze(['fx', 'fy', 'fz', 'mx', 'my', 'mz']);

export { APPROXIMATION_STATUSES, FACTOR_APPLICABILITY_STATUSES, requireFactorApplicability };

export const CODE_PROFILE_KEYS = Object.freeze([
  'schema',
  'profileId',
  'codeProfileId',
  'scope',
  'editionStandard',
  'flexibilitySource',
  'temperatureInterpolationPolicy',
  'displacementRangeCombinationRuleId',
  'occasionalDurationFactors',
  'liberalAllowableUse',
  'liberalAllowableUpliftFactor',
  'semanticHash',
]);

export const OCCASIONAL_DURATION_FACTOR_KEYS = Object.freeze(['occasionalCategoryId', 'durationFactor']);

export const EDITION_DATASET_SOURCE_IDENTITY_KEYS = Object.freeze(['standard', 'edition', 'sourceRevision', 'sourceSemanticHash']);

export const EDITION_DATASET_KEYS = Object.freeze([
  'schema',
  'datasetId',
  'sourceIdentity',
  'materialId',
  'allowablePoints',
  'displacementRangeCoefficients',
  'weldJointFactor',
  'semanticHash',
]);

export const ALLOWABLE_POINT_KEYS = Object.freeze(['absoluteTemperature', 'allowableStress']);

export const DISPLACEMENT_RANGE_COEFFICIENT_KEYS = Object.freeze(['coldWeight', 'hotWeight', 'cycleReductionFactor']);

export const STRESS_FACTOR_SET_KEYS = Object.freeze([
  'schema',
  'factorSetId',
  'componentId',
  'sourceIdentity',
  'applicability',
  'momentDirectionMapping',
  'sustainedIndices',
  'occasionalIndices',
  'displacementSifs',
  'userOverride',
  'semanticHash',
]);

export const MOMENT_DIRECTION_MAPPING_KEYS = Object.freeze(['inPlaneField', 'outOfPlaneField']);

export const DIRECTIONAL_FACTOR_KEYS = Object.freeze(['axial', 'torsional', 'inPlaneBending', 'outOfPlaneBending']);

export const CODE_RESULT_KEYS = Object.freeze([
  'schema',
  'codeProfileId',
  'codePointId',
  'componentId',
  'combinationId',
  'category',
  'status',
  'resultants',
  'factors',
  'stressTerms',
  'calculatedStress',
  'allowableStress',
  'utilization',
  'governingRuleId',
  'limitations',
  'semanticHash',
  'evidenceHash',
]);

export const RESULTANT_KEYS = Object.freeze(['axialForce', 'torsion', 'inPlaneMoment', 'outOfPlaneMoment']);
export const FACTOR_KEYS = Object.freeze(['axialIndex', 'torsionalIndex', 'inPlaneSif', 'outOfPlaneSif', 'flexibilitySource']);
export const STRESS_TERM_KEYS = Object.freeze(['pressure', 'axial', 'torsional', 'inPlaneBending', 'outOfPlaneBending']);
export const CODE_LIMITATION_KEYS = Object.freeze(['code', 'register', 'status', 'disclosure', 'details']);

export const CODE_ENGINE_HASH_PATTERN = /^fnv1a64:[0-9a-f]{16}$/u;

export class CodeEngineError extends SharedAnalysisContractError {
  constructor(message, code) {
    super(message, code);
    this.name = 'CodeEngineError';
  }
}

export function fail(message, code) {
  throw new CodeEngineError(message, code);
}

export function requireRecord(value, field, code) {
  if (!isPlainRecord(value)) fail(`${field} must be a record.`, code);
  return value;
}

export function requireArray(value, field, code) {
  if (!Array.isArray(value)) fail(`${field} must be an array.`, code);
  return value;
}

export function requireExactKeys(value, expected, field, code) {
  requireRecord(value, field, code);
  for (const key of expected) {
    if (!Object.hasOwn(value, key)) fail(`${field} is missing ${key}.`, code);
  }
  for (const key of Object.keys(value)) {
    if (!expected.includes(key)) fail(`${field} contains unexpected field ${key}.`, code);
  }
  return value;
}

export function requireFinite(value, field, code) {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(`${field} must be a finite number.`, code);
  return Object.is(value, -0) ? 0 : value;
}

export function requirePositive(value, field, code) {
  const number = requireFinite(value, field, code);
  if (!(number > 0)) fail(`${field} must be greater than zero.`, code);
  return number;
}

export function requireMember(value, supported, field, code) {
  if (!supported.includes(value)) fail(`${field} is unsupported.`, code);
  return value;
}

export function requireText(value, field, code) {
  if (typeof value !== 'string' || value.trim().length === 0) fail(`${field} must be a non-empty string.`, code);
  return value;
}

export function requireIdentity(value, field, code) {
  try {
    return requireCanonicalNodeId(value);
  } catch {
    return fail(`${field} must be a canonical kernel identity.`, code);
  }
}

export function requireHash(value, field, code) {
  if (typeof value !== 'string' || !CODE_ENGINE_HASH_PATTERN.test(value)) fail(`${field} must be a canonical semantic hash.`, code);
  return value;
}

export { compareAscii };

function requireTraceableSource(entry, ownerField, code) {
  const token = entry.source.trim().toUpperCase();
  if (PROHIBITED_PROFILE_SOURCE_TOKENS.includes(token)) {
    fail(`${ownerField}.${entry.field}.source names a hidden default rather than a traceable authority.`, code);
  }
  return entry;
}

/**
 * Public traceable-source guard for call-time declared evaluation inputs
 * (pressure stress contribution, hot/cold temperatures) that are not part of
 * a persisted profile/dataset artifact but are still caller-declared values
 * that must never carry a hidden-default source token.
 */
export function requireTraceableDeclaredValue(entry, field, code) {
  const token = entry.source.trim().toUpperCase();
  if (PROHIBITED_PROFILE_SOURCE_TOKENS.includes(token)) {
    fail(`${field}.source names a hidden default rather than a traceable authority.`, code);
  }
  return entry;
}

function requireTraceableStandard(value, field, code) {
  if (PROHIBITED_PROFILE_SOURCE_TOKENS.includes(String(value).trim().toUpperCase())) {
    fail(`${field} names a hidden default rather than a traceable authority.`, code);
  }
  return value;
}

/* ------------------------------------------------------------------------ *
 * Code profile (section 10.1).
 * ------------------------------------------------------------------------ */

const PROFILE_CODE = 'CODE_ENGINE_PROFILE_INVALID';

export function codeProfileSemanticProjection(profile) {
  const projection = {};
  for (const key of CODE_PROFILE_KEYS) {
    if (key === 'semanticHash') continue;
    projection[key] = profile[key];
  }
  return projection;
}

export function computeCodeProfileSemanticHash(profile) {
  return semanticHash(codeProfileSemanticProjection(profile));
}

function validateOccasionalDurationFactors(entries) {
  requireArray(entries, 'profile.occasionalDurationFactors', PROFILE_CODE);
  const seen = new Set();
  entries.forEach((entry, index) => {
    const field = `profile.occasionalDurationFactors[${index}]`;
    requireExactKeys(entry, OCCASIONAL_DURATION_FACTOR_KEYS, field, PROFILE_CODE);
    requireText(entry.occasionalCategoryId, `${field}.occasionalCategoryId`, PROFILE_CODE);
    if (seen.has(entry.occasionalCategoryId)) {
      fail(`${field}.occasionalCategoryId ${entry.occasionalCategoryId} is declared more than once.`, PROFILE_CODE);
    }
    seen.add(entry.occasionalCategoryId);
    requireTraceableSource(
      requireDeclaredValue(entry, 'durationFactor', { exclusiveMinimum: 0 }),
      field,
      'CODE_ENGINE_PROFILE_SOURCE_NOT_TRACEABLE',
    );
  });
}

function validateProfileCore(profile) {
  requireExactKeys(profile, CODE_PROFILE_KEYS, 'profile', PROFILE_CODE);
  if (profile.schema !== CODE_PROFILE_SCHEMA) fail(`profile.schema must be ${CODE_PROFILE_SCHEMA}.`, PROFILE_CODE);
  if (profile.profileId !== CODE_PROFILE_PROFILE_ID) fail(`profile.profileId must be ${CODE_PROFILE_PROFILE_ID}.`, PROFILE_CODE);
  requireText(profile.codeProfileId, 'profile.codeProfileId', PROFILE_CODE);
  requireMember(profile.scope, CODE_SCOPES, 'profile.scope', PROFILE_CODE);
  /*
   * Section 10.1: "other scopes ... are blocked until implemented." A profile
   * naming one of them gets an explicit, dedicated refusal rather than being
   * silently evaluated by the metallic-piping evaluators below.
   */
  if (UNIMPLEMENTED_CODE_SCOPES.includes(profile.scope)) {
    fail(
      `profile.scope names ${profile.scope}, which is not implemented in this phase; it is refused explicitly rather than evaluated under the metallic B31.3 process-piping profile.`,
      'CODE_ENGINE_SCOPE_NOT_IMPLEMENTED',
    );
  }
  if (profile.editionStandard !== CODE_PROFILE_STANDARD) {
    fail(`profile.editionStandard must be ${CODE_PROFILE_STANDARD}.`, PROFILE_CODE);
  }
  if (profile.flexibilitySource !== null && profile.flexibilitySource !== FLEXIBILITY_SIF_STANDARD) {
    fail(`profile.flexibilitySource must be ${FLEXIBILITY_SIF_STANDARD} or null.`, PROFILE_CODE);
  }
  requireMember(profile.temperatureInterpolationPolicy, TEMPERATURE_INTERPOLATION_POLICIES, 'profile.temperatureInterpolationPolicy', PROFILE_CODE);
  if (profile.displacementRangeCombinationRuleId !== DISPLACEMENT_RANGE_COMBINATION_RULE) {
    fail(`profile.displacementRangeCombinationRuleId must be ${DISPLACEMENT_RANGE_COMBINATION_RULE}.`, PROFILE_CODE);
  }
  validateOccasionalDurationFactors(profile.occasionalDurationFactors);
  if (typeof profile.liberalAllowableUse !== 'boolean') {
    fail('profile.liberalAllowableUse must be declared true or false; section 10.5 requires the switch to be explicit, never defaulted.', PROFILE_CODE);
  }
  if (profile.liberalAllowableUse) {
    requireTraceableSource(
      requireDeclaredValue(profile, 'liberalAllowableUpliftFactor', { exclusiveMinimum: 0 }),
      'profile',
      'CODE_ENGINE_PROFILE_SOURCE_NOT_TRACEABLE',
    );
  } else if (profile.liberalAllowableUpliftFactor !== null) {
    fail('profile.liberalAllowableUpliftFactor must be null when liberalAllowableUse is false.', PROFILE_CODE);
  }
  return profile;
}

export function requireCodeProfile(profile) {
  validateProfileCore(profile);
  requireHash(profile.semanticHash, 'profile.semanticHash', PROFILE_CODE);
  if (profile.semanticHash !== computeCodeProfileSemanticHash(profile)) {
    fail('profile.semanticHash is stale.', 'CODE_ENGINE_HASH_MISMATCH');
  }
  return deepFreeze({ ...codeProfileSemanticProjection(profile), semanticHash: profile.semanticHash });
}

export function sealCodeProfile(profile) {
  validateProfileCore(profile);
  return requireCodeProfile({ ...codeProfileSemanticProjection(profile), semanticHash: computeCodeProfileSemanticHash(profile) });
}

/* ------------------------------------------------------------------------ *
 * Edition dataset (section 10.5) — every numeric value here is exactly the
 * "user-authorized edition dataset" section 1.2 requires; this module never
 * substitutes a value of its own.
 * ------------------------------------------------------------------------ */

const DATASET_CODE = 'CODE_ENGINE_EDITION_DATASET_INVALID';

export function editionDatasetSemanticProjection(dataset) {
  const projection = {};
  for (const key of EDITION_DATASET_KEYS) {
    if (key === 'semanticHash') continue;
    projection[key] = dataset[key];
  }
  return projection;
}

export function computeEditionDatasetSemanticHash(dataset) {
  return semanticHash(editionDatasetSemanticProjection(dataset));
}

function validateAllowablePoints(points) {
  requireArray(points, 'dataset.allowablePoints', DATASET_CODE);
  if (points.length === 0) fail('dataset.allowablePoints must carry at least one point.', DATASET_CODE);
  let previousTemperature = -Infinity;
  points.forEach((point, index) => {
    const field = `dataset.allowablePoints[${index}]`;
    requireExactKeys(point, ALLOWABLE_POINT_KEYS, field, DATASET_CODE);
    requireFinite(point.absoluteTemperature, `${field}.absoluteTemperature`, DATASET_CODE);
    if (!(point.absoluteTemperature > previousTemperature)) {
      fail(`${field}.absoluteTemperature must be strictly increasing (sorted, no duplicate temperatures).`, DATASET_CODE);
    }
    previousTemperature = point.absoluteTemperature;
    requireTraceableSource(
      requireDeclaredValue(point, 'allowableStress', { exclusiveMinimum: 0 }),
      field,
      'CODE_ENGINE_EDITION_DATASET_SOURCE_NOT_TRACEABLE',
    );
  });
}

function validateDatasetCore(dataset) {
  requireExactKeys(dataset, EDITION_DATASET_KEYS, 'dataset', DATASET_CODE);
  if (dataset.schema !== EDITION_DATASET_SCHEMA) fail(`dataset.schema must be ${EDITION_DATASET_SCHEMA}.`, DATASET_CODE);
  requireIdentity(dataset.datasetId, 'dataset.datasetId', DATASET_CODE);
  requireExactKeys(dataset.sourceIdentity, EDITION_DATASET_SOURCE_IDENTITY_KEYS, 'dataset.sourceIdentity', DATASET_CODE);
  for (const key of ['standard', 'edition', 'sourceRevision']) {
    requireText(dataset.sourceIdentity[key], `dataset.sourceIdentity.${key}`, DATASET_CODE);
  }
  requireTraceableStandard(dataset.sourceIdentity.standard, 'dataset.sourceIdentity.standard', 'CODE_ENGINE_EDITION_DATASET_SOURCE_NOT_TRACEABLE');
  requireHash(dataset.sourceIdentity.sourceSemanticHash, 'dataset.sourceIdentity.sourceSemanticHash', DATASET_CODE);
  requireText(dataset.materialId, 'dataset.materialId', DATASET_CODE);
  validateAllowablePoints(dataset.allowablePoints);
  requireExactKeys(dataset.displacementRangeCoefficients, DISPLACEMENT_RANGE_COEFFICIENT_KEYS, 'dataset.displacementRangeCoefficients', DATASET_CODE);
  for (const key of DISPLACEMENT_RANGE_COEFFICIENT_KEYS) {
    requireTraceableSource(
      requireDeclaredValue(dataset.displacementRangeCoefficients, key, { exclusiveMinimum: 0 }),
      'dataset.displacementRangeCoefficients',
      'CODE_ENGINE_EDITION_DATASET_SOURCE_NOT_TRACEABLE',
    );
  }
  requireTraceableSource(
    requireDeclaredValue(dataset, 'weldJointFactor', { exclusiveMinimum: 0, maximum: 1 }),
    'dataset',
    'CODE_ENGINE_EDITION_DATASET_SOURCE_NOT_TRACEABLE',
  );
  return dataset;
}

export function requireEditionDataset(dataset) {
  validateDatasetCore(dataset);
  requireHash(dataset.semanticHash, 'dataset.semanticHash', DATASET_CODE);
  if (dataset.semanticHash !== computeEditionDatasetSemanticHash(dataset)) {
    fail('dataset.semanticHash is stale.', 'CODE_ENGINE_HASH_MISMATCH');
  }
  return deepFreeze({ ...editionDatasetSemanticProjection(dataset), semanticHash: dataset.semanticHash });
}

export function sealEditionDataset(dataset) {
  validateDatasetCore(dataset);
  return requireEditionDataset({ ...editionDatasetSemanticProjection(dataset), semanticHash: computeEditionDatasetSemanticHash(dataset) });
}

/* ------------------------------------------------------------------------ *
 * Stress factor set (section 10.4) — the B31J-derived indices/SIFs this
 * package needs for stress evaluation, distinct from B-3.2's
 * stiffness-only flexibility factor: it cites the same component/geometry
 * identity but is never used to touch stiffness.
 * ------------------------------------------------------------------------ */

const FACTOR_SET_CODE = 'CODE_ENGINE_STRESS_FACTOR_SET_INVALID';

export function stressFactorSetSemanticProjection(factorSet) {
  const projection = {};
  for (const key of STRESS_FACTOR_SET_KEYS) {
    if (key === 'semanticHash') continue;
    projection[key] = factorSet[key];
  }
  return projection;
}

export function computeStressFactorSetSemanticHash(factorSet) {
  return semanticHash(stressFactorSetSemanticProjection(factorSet));
}

function validateDirectionalFactors(record, ownerField) {
  requireExactKeys(record, DIRECTIONAL_FACTOR_KEYS, ownerField, FACTOR_SET_CODE);
  for (const key of DIRECTIONAL_FACTOR_KEYS) {
    requireTraceableSource(
      requireDeclaredValue(record, key, { exclusiveMinimum: 0 }),
      ownerField,
      'CODE_ENGINE_STRESS_FACTOR_SOURCE_NOT_TRACEABLE',
    );
  }
}

function validateFactorSetCore(factorSet) {
  requireExactKeys(factorSet, STRESS_FACTOR_SET_KEYS, 'factorSet', FACTOR_SET_CODE);
  if (factorSet.schema !== STRESS_FACTOR_SET_SCHEMA) fail(`factorSet.schema must be ${STRESS_FACTOR_SET_SCHEMA}.`, FACTOR_SET_CODE);
  requireIdentity(factorSet.factorSetId, 'factorSet.factorSetId', FACTOR_SET_CODE);
  requireIdentity(factorSet.componentId, 'factorSet.componentId', FACTOR_SET_CODE);
  requireExactKeys(factorSet.sourceIdentity, FACTOR_SOURCE_IDENTITY_KEYS, 'factorSet.sourceIdentity', FACTOR_SET_CODE);
  for (const key of ['standard', 'edition', 'ruleId', 'sourceRevision']) {
    requireText(factorSet.sourceIdentity[key], `factorSet.sourceIdentity.${key}`, FACTOR_SET_CODE);
  }
  requireTraceableStandard(factorSet.sourceIdentity.standard, 'factorSet.sourceIdentity.standard', 'CODE_ENGINE_STRESS_FACTOR_SOURCE_NOT_TRACEABLE');
  requireHash(factorSet.sourceIdentity.sourceSemanticHash, 'factorSet.sourceIdentity.sourceSemanticHash', FACTOR_SET_CODE);
  requireExactKeys(factorSet.applicability, FACTOR_APPLICABILITY_KEYS, 'factorSet.applicability', FACTOR_SET_CODE);
  requireMember(factorSet.applicability.status, FACTOR_APPLICABILITY_STATUSES, 'factorSet.applicability.status', FACTOR_SET_CODE);
  requireText(factorSet.applicability.ruleId, 'factorSet.applicability.ruleId', FACTOR_SET_CODE);
  requireText(factorSet.applicability.evaluatedBy, 'factorSet.applicability.evaluatedBy', FACTOR_SET_CODE);
  requireExactKeys(factorSet.momentDirectionMapping, MOMENT_DIRECTION_MAPPING_KEYS, 'factorSet.momentDirectionMapping', FACTOR_SET_CODE);
  requireMember(factorSet.momentDirectionMapping.inPlaneField, MOMENT_DIRECTION_FIELDS, 'factorSet.momentDirectionMapping.inPlaneField', FACTOR_SET_CODE);
  requireMember(factorSet.momentDirectionMapping.outOfPlaneField, MOMENT_DIRECTION_FIELDS, 'factorSet.momentDirectionMapping.outOfPlaneField', FACTOR_SET_CODE);
  if (factorSet.momentDirectionMapping.inPlaneField === factorSet.momentDirectionMapping.outOfPlaneField) {
    fail(
      'factorSet.momentDirectionMapping must distinguish in-plane from out-of-plane bending (section 10.3); one scalar covering both is not implemented.',
      'CODE_ENGINE_MOMENT_DIRECTION_AMBIGUOUS',
    );
  }
  validateDirectionalFactors(factorSet.sustainedIndices, 'factorSet.sustainedIndices');
  validateDirectionalFactors(factorSet.occasionalIndices, 'factorSet.occasionalIndices');
  validateDirectionalFactors(factorSet.displacementSifs, 'factorSet.displacementSifs');
  if (factorSet.userOverride !== null) {
    requireExactKeys(factorSet.userOverride, FACTOR_OVERRIDE_KEYS, 'factorSet.userOverride', FACTOR_SET_CODE);
    for (const key of FACTOR_OVERRIDE_KEYS) {
      requireText(factorSet.userOverride[key], `factorSet.userOverride.${key}`, 'CODE_ENGINE_USER_OVERRIDE_INCOMPLETE');
    }
  }
  return factorSet;
}

export function requireStressFactorSet(factorSet) {
  validateFactorSetCore(factorSet);
  requireHash(factorSet.semanticHash, 'factorSet.semanticHash', FACTOR_SET_CODE);
  if (factorSet.semanticHash !== computeStressFactorSetSemanticHash(factorSet)) {
    fail('factorSet.semanticHash is stale.', 'CODE_ENGINE_HASH_MISMATCH');
  }
  return deepFreeze({ ...stressFactorSetSemanticProjection(factorSet), semanticHash: factorSet.semanticHash });
}

export function sealStressFactorSet(factorSet) {
  validateFactorSetCore(factorSet);
  return requireStressFactorSet({ ...stressFactorSetSemanticProjection(factorSet), semanticHash: computeStressFactorSetSemanticHash(factorSet) });
}
