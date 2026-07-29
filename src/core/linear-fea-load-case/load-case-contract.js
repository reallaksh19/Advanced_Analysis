import { SharedAnalysisContractError } from '../shared-analysis-contract/errors.js';
import { requireDeclaredValue } from '../shared-analysis-contract/declared-value.js';
import { deepFreeze, isPlainRecord } from '../shared-piping-model/immutable.js';
import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { requireCanonicalNodeId } from '../linear-fea-contract/identifiers.js';
import { PROHIBITED_PROFILE_SOURCE_TOKENS } from '../linear-fea-model-compiler/index.js';

/**
 * LFEA-B3.0 physical load-case contracts.
 *
 * This module holds the schema identities, frozen rule identities, rejection
 * codes and profile authority for the physical load-case layer. It declares
 * nothing about how a load becomes an equivalent nodal vector: that is the
 * element-formulation package (B-3.1/B-3.2), and this package must not
 * anticipate it.
 */

export const LOAD_CASE_PROFILE_SCHEMA = 'fea-linear-load-case-profile/v1';
export const LOAD_PRIMITIVE_SCHEMA = 'fea-linear-load-primitive/v1';
export const PHYSICAL_LOAD_CASE_SCHEMA = 'fea-linear-physical-load-case/v1';
export const LOAD_CASE_COMBINATION_SCHEMA = 'fea-linear-load-case-combination/v1';
export const LOAD_CASE_MODEL_REFERENCE_SCHEMA = 'fea-linear-load-case-model-reference/v1';

export const LOAD_CASE_PROFILE_ID = 'LINEAR-LOAD-CASE-R1';

export const PRIMITIVE_IMMUTABILITY_RULE = 'PRIMITIVE_LOAD_CASE_IMMUTABLE_HASH_BOUND_V1';
export const COMBINATION_SEMANTICS_RULE = 'COMPONENT_SEMANTICS_VERIFIED_AGAINST_SOLVED_RESULTS_V1';
export const CODE_COMBINATION_RULE = 'CODE_CATEGORY_COMBINATION_IS_NOT_A_SOLVER_LOAD_CASE_V1';

/**
 * The one thermal-strain approximation this contract version represents, and
 * the one it deliberately does not. Section 5.4 permits uniform
 * `alpha * deltaT` only under a declared approximation profile and assigns
 * temperature-dependent alpha integration to a later thermal-load compiler, so
 * naming that profile here is a blocked declaration rather than a silent
 * downgrade to the uniform rule.
 */
export const UNIFORM_TEMPERATURE_THERMAL_STRAIN_PROFILE = 'UNIFORM_TEMPERATURE_ALPHA_DELTA_T_V1';
export const DEFERRED_ALPHA_INTEGRATION_THERMAL_STRAIN_PROFILE =
  'TEMPERATURE_DEPENDENT_ALPHA_INTEGRATION_V1';

export const SUPPORTED_THERMAL_STRAIN_PROFILES = Object.freeze([
  UNIFORM_TEMPERATURE_THERMAL_STRAIN_PROFILE,
]);

export const LOAD_CASE_PROFILE_KEYS = Object.freeze([
  'schema',
  'profileId',
  'primitiveImmutabilityRule',
  'thermalStrainApproximation',
  'combinationSemanticsRule',
  'codeCombinationRule',
  'gravitationalAcceleration',
  'directionUnitTolerance',
  'semanticHash',
]);

export const LOAD_CASE_DECLARED_VALUE_FIELDS = Object.freeze([
  'gravitationalAcceleration',
  'directionUnitTolerance',
]);

export const LOAD_PRIMITIVE_KINDS = Object.freeze([
  'GRAVITY',
  'DISTRIBUTED_WEIGHT',
  'PRESSURE',
  'TEMPERATURE',
  'NODAL_FORCE_MOMENT',
  'DISTRIBUTED_LOAD',
  'EQUIVALENT_STATIC',
  'PRESCRIBED_MOVEMENT',
]);

/**
 * Physical classes of a solver load case. None of these is a B31.3 stress
 * category: section 7.2 keeps code combinations out of the solver load-case
 * space entirely, and a shared token would be the first step to conflating
 * them.
 */
export const PHYSICAL_LOAD_CASE_CLASSES = Object.freeze([
  'WEIGHT',
  'THERMAL',
  'PRESSURE',
  'APPLIED_MECHANICAL',
  'EQUIVALENT_STATIC',
  'PRESCRIBED_MOVEMENT',
  'MIXED_PHYSICAL',
]);

/**
 * B31.3 category vocabulary (section 10.2) plus the obvious spellings of a
 * code combination. A physical load case, a combination or a project
 * combination-class tag carrying one of these is rejected: a code combination
 * references qualified result components under edition rules and is built by
 * B-4.0, not solved as a right-hand side here.
 */
export const CODE_CATEGORY_TAGS = Object.freeze([
  'SUSTAINED',
  'OCCASIONAL',
  'DISPLACEMENTSTRESSRANGE',
  'OPERATING',
  'EXPANSIONRANGEENVELOPE',
  'USERCHECK',
  'CODECOMBINATION',
  'CODECATEGORY',
  'B313',
  'B31',
  'ASMEB313',
]);

export const GRAVITY_MASS_SOURCES = Object.freeze([
  'PIPE_WALL',
  'CONTENTS',
  'INSULATION',
  'COMPONENT',
]);

export const DISTRIBUTED_WEIGHT_COMPONENTS = Object.freeze(['PIPE_WALL', 'CONTENTS', 'INSULATION']);

export const PRESSURE_BASES = Object.freeze(['GAUGE', 'ABSOLUTE']);

/**
 * Each pressure effect is an explicit authorisation flag. Nothing is inferred
 * from the presence of a pressure value: section 7.1 allows a pressure state to
 * drive code stress, pressure stiffening, axial thrust or Bourdon effects only
 * where the selected formulation implements them, so the authorisation is
 * declared here and the implementation is proven downstream.
 */
export const PRESSURE_EFFECT_FLAGS = Object.freeze([
  'codeStress',
  'pressureStiffening',
  'axialThrust',
  'bourdon',
]);

export const LOAD_BASIS_KINDS = Object.freeze(['GLOBAL', 'DECLARED_LOCAL']);
export const DISTRIBUTED_LOAD_BASES = Object.freeze(['GLOBAL', 'ELEMENT_LOCAL']);
export const DISTRIBUTED_LOAD_VARIATIONS = Object.freeze(['UNIFORM', 'LINEAR']);
export const EQUIVALENT_STATIC_CLASSES = Object.freeze(['WIND', 'SEISMIC']);

/**
 * Sign conventions, named as a pair so a caller flips deliberately rather than
 * by guessing — the discipline `attachment-load-contract` established. Only the
 * applied-to-structure sense is representable as a load-case right-hand side;
 * the reaction sense must be reversed by its owner before it arrives here.
 */
export const LOAD_SIGN_CONVENTIONS = Object.freeze([
  'APPLIED_TO_STRUCTURE',
  'REACTION_ON_SOURCE',
]);

export const REPRESENTABLE_LOAD_SIGN_CONVENTION = 'APPLIED_TO_STRUCTURE';

export const SOURCE_EVIDENCE_KEYS = Object.freeze([
  'sourceId',
  'sourceRevision',
  'sourceSemanticHash',
]);

export const PRESENTATION_KEYS = Object.freeze(['label', 'description']);

export const LOAD_CASE_LIMITATION_KEYS = Object.freeze([
  'code',
  'severity',
  'scope',
  'stiffnessRelevant',
  'details',
]);

export const LOAD_CASE_DIAGNOSTIC_KEYS = Object.freeze([
  'severity',
  'code',
  'entityType',
  'entityId',
  'message',
  'evidence',
  'qualificationEvidenceIds',
]);

export const LOAD_CASE_HASH_PATTERN = /^fnv1a64:[0-9a-f]{16}$/u;

export { PROHIBITED_PROFILE_SOURCE_TOKENS };

export class PhysicalLoadCaseError extends SharedAnalysisContractError {
  constructor(message, code) {
    super(message, code);
    this.name = 'PhysicalLoadCaseError';
  }
}

export function loadCaseError(message, code) {
  return new PhysicalLoadCaseError(message, code);
}

export function fail(message, code) {
  throw loadCaseError(message, code);
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

export function requireIdentity(value, field, code) {
  try {
    return requireCanonicalNodeId(value);
  } catch {
    return fail(`${field} must be a canonical kernel identity.`, code);
  }
}

export function requireSourceIdentity(value, field, code) {
  if (typeof value !== 'string' || value.trim().length === 0 || value === 'UNKNOWN') {
    fail(`${field} must be a retained nonempty source identity.`, code);
  }
  return value;
}

export function requireHash(value, field, code) {
  if (typeof value !== 'string' || !LOAD_CASE_HASH_PATTERN.test(value)) {
    fail(`${field} must be a canonical semantic hash.`, code);
  }
  return value;
}

export function requireFinite(value, field, code) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail(`${field} must be a finite number.`, code);
  }
  return Object.is(value, -0) ? 0 : value;
}

export function requirePositive(value, field, code) {
  const number = requireFinite(value, field, code);
  if (!(number > 0)) fail(`${field} must be greater than zero.`, code);
  return number;
}

export function requireBoolean(value, field, code) {
  if (typeof value !== 'boolean') fail(`${field} must be declared true or false.`, code);
  return value;
}

export function requireMember(value, supported, field, code) {
  if (!supported.includes(value)) fail(`${field} is unsupported.`, code);
  return value;
}

export function requireSourceEvidence(value, field, code) {
  requireExactKeys(value, SOURCE_EVIDENCE_KEYS, field, code);
  return {
    sourceId: requireSourceIdentity(value.sourceId, `${field}.sourceId`, code),
    sourceRevision: requireSourceIdentity(value.sourceRevision, `${field}.sourceRevision`, code),
    sourceSemanticHash: requireHash(value.sourceSemanticHash, `${field}.sourceSemanticHash`, code),
  };
}

/**
 * Refuse a B31.3 stress-category token wherever a solver-side name is expected.
 *
 * Section 7.2: code combinations are not solver load cases. A case, a
 * combination or a project combination-class tag named after a code category
 * is rejected here rather than accepted and quietly treated as a right-hand
 * side that B-4.0 would then double-count.
 */
export function requireNotCodeCategoryTag(value, field) {
  const token = String(value).toUpperCase().replace(/[^A-Z0-9]/gu, '');
  if (CODE_CATEGORY_TAGS.includes(token)) {
    fail(
      `${field} names the B31.3 category ${value}; a code combination references qualified result components and is not a solver load case.`,
      'LOAD_CASE_CODE_CATEGORY_NOT_A_SOLVER_CASE',
    );
  }
  return value;
}

function requireTraceableSource(entry) {
  const token = entry.source.trim().toUpperCase();
  if (PROHIBITED_PROFILE_SOURCE_TOKENS.includes(token)) {
    fail(
      `profile.${entry.field}.source names a hidden default rather than a traceable authority.`,
      'LOAD_CASE_PROFILE_SOURCE_NOT_TRACEABLE',
    );
  }
  return entry;
}

/**
 * Resolve the two numeric policies this package applies: the gravitational
 * acceleration magnitude a gravity primitive is evaluated at, and the tolerance
 * a declared direction or local basis is qualified against. Both are read
 * through `requireDeclaredValue`, so an absent entry is rejected with
 * `GRAVITATIONAL_ACCELERATION_NOT_DECLARED` or
 * `DIRECTION_UNIT_TOLERANCE_NOT_DECLARED`. Neither has a fallback and this
 * package exports no ready-made profile.
 *
 * @param {object} profile Load-case profile record.
 * @returns {Readonly<{gravitationalAcceleration:object, directionUnitTolerance:object}>}
 */
export function resolveLoadCasePolicies(profile) {
  const gravitationalAcceleration = requireTraceableSource(
    requireDeclaredValue(profile, 'gravitationalAcceleration', { exclusiveMinimum: 0 }),
  );
  const directionUnitTolerance = requireTraceableSource(
    requireDeclaredValue(profile, 'directionUnitTolerance', { exclusiveMinimum: 0, maximum: 1 }),
  );
  return Object.freeze({ gravitationalAcceleration, directionUnitTolerance });
}

export function loadCaseProfileSemanticProjection(profile) {
  return {
    schema: profile.schema,
    profileId: profile.profileId,
    primitiveImmutabilityRule: profile.primitiveImmutabilityRule,
    thermalStrainApproximation: profile.thermalStrainApproximation,
    combinationSemanticsRule: profile.combinationSemanticsRule,
    codeCombinationRule: profile.codeCombinationRule,
    gravitationalAcceleration: {
      value: profile.gravitationalAcceleration?.value,
      source: profile.gravitationalAcceleration?.source,
    },
    directionUnitTolerance: {
      value: profile.directionUnitTolerance?.value,
      source: profile.directionUnitTolerance?.source,
    },
  };
}

export function computeLoadCaseProfileSemanticHash(profile) {
  return semanticHash(loadCaseProfileSemanticProjection(profile));
}

function validateProfileCore(profile) {
  requireExactKeys(profile, LOAD_CASE_PROFILE_KEYS, 'profile', 'LOAD_CASE_PROFILE_INVALID');
  const frozen = [
    ['schema', LOAD_CASE_PROFILE_SCHEMA],
    ['profileId', LOAD_CASE_PROFILE_ID],
    ['primitiveImmutabilityRule', PRIMITIVE_IMMUTABILITY_RULE],
    ['combinationSemanticsRule', COMBINATION_SEMANTICS_RULE],
    ['codeCombinationRule', CODE_COMBINATION_RULE],
  ];
  for (const [key, expected] of frozen) {
    if (profile[key] !== expected) {
      fail(`profile.${key} must equal ${expected}.`, 'LOAD_CASE_PROFILE_INVALID');
    }
  }
  if (profile.thermalStrainApproximation === DEFERRED_ALPHA_INTEGRATION_THERMAL_STRAIN_PROFILE) {
    fail(
      'profile.thermalStrainApproximation selects temperature-dependent alpha integration, which belongs to the thermal-load compiler and is not implemented; it is blocked rather than downgraded to the uniform rule.',
      'LOAD_CASE_THERMAL_ALPHA_INTEGRATION_NOT_IMPLEMENTED',
    );
  }
  if (!SUPPORTED_THERMAL_STRAIN_PROFILES.includes(profile.thermalStrainApproximation)) {
    fail('profile.thermalStrainApproximation is unsupported.', 'LOAD_CASE_PROFILE_INVALID');
  }
  return resolveLoadCasePolicies(profile);
}

export function requireLoadCaseProfile(profile) {
  const policies = validateProfileCore(profile);
  requireHash(profile.semanticHash, 'profile.semanticHash', 'LOAD_CASE_PROFILE_INVALID');
  if (profile.semanticHash !== computeLoadCaseProfileSemanticHash(profile)) {
    fail('profile.semanticHash is stale.', 'LOAD_CASE_HASH_MISMATCH');
  }
  return deepFreeze({
    schema: profile.schema,
    profileId: profile.profileId,
    primitiveImmutabilityRule: profile.primitiveImmutabilityRule,
    thermalStrainApproximation: profile.thermalStrainApproximation,
    combinationSemanticsRule: profile.combinationSemanticsRule,
    codeCombinationRule: profile.codeCombinationRule,
    gravitationalAcceleration: {
      value: policies.gravitationalAcceleration.value,
      source: policies.gravitationalAcceleration.source,
    },
    directionUnitTolerance: {
      value: policies.directionUnitTolerance.value,
      source: policies.directionUnitTolerance.source,
    },
    semanticHash: profile.semanticHash,
  });
}

export function sealLoadCaseProfile(profile) {
  requireExactKeys(profile, LOAD_CASE_PROFILE_KEYS, 'profile', 'LOAD_CASE_PROFILE_INVALID');
  validateProfileCore(profile);
  return requireLoadCaseProfile({
    ...profile,
    semanticHash: computeLoadCaseProfileSemanticHash(profile),
  });
}

export function compareAscii(left, right) {
  const a = String(left);
  const b = String(right);
  const length = Math.min(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const difference = a.charCodeAt(index) - b.charCodeAt(index);
    if (difference !== 0) return difference < 0 ? -1 : 1;
  }
  if (a.length === b.length) return 0;
  return a.length < b.length ? -1 : 1;
}
