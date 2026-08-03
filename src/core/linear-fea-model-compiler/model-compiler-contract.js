import { SharedAnalysisContractError } from '../shared-analysis-contract/errors.js';
import { requireDeclaredValue } from '../shared-analysis-contract/declared-value.js';
import { deepFreeze, isPlainRecord } from '../shared-piping-model/immutable.js';
import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { requireCanonicalNodeId } from '../linear-fea-contract/identifiers.js';
import { INACTIVE_ANALYSIS_DOF_BEHAVIOR } from '../linear-fea-contract/model-schema.js';

export const MECHANICAL_MODEL_COMPILER_PROFILE_SCHEMA =
  'fea-linear-model-compiler-profile/v1';

export const MECHANICAL_MODEL_COMPILATION_SCHEMA =
  'fea-linear-mechanical-model-compilation/v1';

export const MECHANICAL_MODEL_COMPILER_PROFILE_ID = 'LINEAR-MODEL-COMPILER-R1';

export const SPAN_BINDING_RULE = 'EXACTLY_ONE_BINDING_PER_SPAN_V1';
export const ZERO_LENGTH_LINK_RULE = 'ZERO_LENGTH_LINK_PROHIBITED_V1';
export const CONSTRAINT_CONFLICT_RULE = 'CONFLICTING_DEFINITION_BLOCKS_COMPILATION_V1';
export const UNREPRESENTABLE_FEATURE_RULE = 'UNREPRESENTABLE_FEATURE_BLOCKS_COMPILATION_V1';

export const COMPILER_PROFILE_KEYS = Object.freeze([
  'schema',
  'profileId',
  'spanBindingRule',
  'zeroLengthLinkRule',
  'constraintConflictRule',
  'unrepresentableFeatureRule',
  'minimumElementLength',
  'spanDirectionTolerance',
  'semanticHash',
]);

export const COMPILER_DECLARED_VALUE_FIELDS = Object.freeze([
  'minimumElementLength',
  'spanDirectionTolerance',
]);

export const NODE_BINDING_KEYS = Object.freeze([
  'nodeId',
  'conditionedNodeId',
  'topologyNodeId',
]);

export const ELEMENT_BINDING_KEYS = Object.freeze([
  'elementId',
  'conditionedSegmentId',
  'topologySegmentId',
  'materialStateId',
  'sectionStateId',
  'formulationId',
  'localAxisEvidenceIdentity',
  'sourceComponentId',
]);

export const CONSTRAINT_DECLARATION_KINDS = Object.freeze([
  'END_RELEASE',
  'NODAL_RESTRAINT',
  'PARTIAL_RELEASE_SPRING',
  'RIGID_LINK',
  'RIGID_OFFSET',
]);

export const REPRESENTABLE_CONSTRAINT_KINDS = Object.freeze([
  'NODAL_RESTRAINT',
  'PARTIAL_RELEASE_SPRING',
]);

export const NODAL_RESTRAINT_BEHAVIORS = Object.freeze([
  'FIXED',
  INACTIVE_ANALYSIS_DOF_BEHAVIOR,
  'PRESCRIBED_SLOT',
]);

export const ELEMENT_ENDS = Object.freeze(['I', 'J']);

export const COMPILATION_RECORD_KEYS = Object.freeze([
  'schema',
  'profileId',
  'compilerProfileSemanticHash',
  'sourceSemanticHash',
  'conditionedTopologyHash',
  'mechanicalModelSemanticHash',
  'stiffnessStateHash',
  'model',
  'bindings',
  'limitations',
  'diagnostics',
  'semanticHash',
  'evidenceHash',
]);

export const BINDING_TRACE_KEYS = Object.freeze([
  'elementId',
  'conditionedSegmentId',
  'topologySegmentId',
  'sourceComponentId',
  'formulationId',
  'materialStateId',
  'materialResolutionSemanticHash',
  'sectionStateId',
  'sectionResolutionSemanticHash',
  'localAxisEvidenceIdentity',
  'localAxisResultSemanticHash',
  'localAxisReferenceSource',
]);

/**
 * Profile source strings that name a hidden default rather than a traceable
 * authority. Section 13.1 prohibits hidden defaults outright, so a profile
 * entry whose `source` is one of these is a declaration in form only and is
 * rejected with the same force as an absent entry.
 */
export const PROHIBITED_PROFILE_SOURCE_TOKENS = Object.freeze([
  'ASSUMED',
  'DEFAULT',
  'DEFAULTS',
  'FALLBACK',
  'HARDCODED',
  'HARD_CODED',
  'IMPLICIT',
  'TBD',
  'UNKNOWN',
]);

export const MECHANICAL_MODEL_COMPILER_HASH_PATTERN = /^fnv1a64:[0-9a-f]{16}$/u;

export class MechanicalModelCompilerError extends SharedAnalysisContractError {
  constructor(message, code) {
    super(message, code);
    this.name = 'MechanicalModelCompilerError';
  }
}

export function compilerError(message, code) {
  return new MechanicalModelCompilerError(message, code);
}

export function fail(message, code) {
  throw compilerError(message, code);
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
  if (typeof value !== 'string' || !MECHANICAL_MODEL_COMPILER_HASH_PATTERN.test(value)) {
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

function requireTraceableSource(entry) {
  const token = entry.source.trim().toUpperCase();
  if (PROHIBITED_PROFILE_SOURCE_TOKENS.includes(token)) {
    fail(
      `profile.${entry.field}.source names a hidden default rather than a traceable authority.`,
      'MODEL_COMPILER_PROFILE_SOURCE_NOT_TRACEABLE',
    );
  }
  return entry;
}

/**
 * Resolve the two numeric policies this compiler is allowed to apply. Both are
 * read through `requireDeclaredValue`, so an absent entry is rejected by the
 * shared contract with `MINIMUM_ELEMENT_LENGTH_NOT_DECLARED` or
 * `SPAN_DIRECTION_TOLERANCE_NOT_DECLARED`. There is no fallback value here and
 * no exported default profile: the package cannot compile without a profile a
 * project authored and can export.
 *
 * @param {object} profile Compiler profile record.
 * @returns {Readonly<{minimumElementLength:object, spanDirectionTolerance:object}>}
 */
export function resolveCompilerPolicies(profile) {
  const minimumElementLength = requireTraceableSource(
    requireDeclaredValue(profile, 'minimumElementLength', { exclusiveMinimum: 0 }),
  );
  const spanDirectionTolerance = requireTraceableSource(
    requireDeclaredValue(profile, 'spanDirectionTolerance', { exclusiveMinimum: 0, maximum: 1 }),
  );
  return Object.freeze({ minimumElementLength, spanDirectionTolerance });
}

export function compilerProfileSemanticProjection(profile) {
  return {
    schema: profile.schema,
    profileId: profile.profileId,
    spanBindingRule: profile.spanBindingRule,
    zeroLengthLinkRule: profile.zeroLengthLinkRule,
    constraintConflictRule: profile.constraintConflictRule,
    unrepresentableFeatureRule: profile.unrepresentableFeatureRule,
    minimumElementLength: {
      value: profile.minimumElementLength?.value,
      source: profile.minimumElementLength?.source,
    },
    spanDirectionTolerance: {
      value: profile.spanDirectionTolerance?.value,
      source: profile.spanDirectionTolerance?.source,
    },
  };
}

export function computeCompilerProfileSemanticHash(profile) {
  return semanticHash(compilerProfileSemanticProjection(profile));
}

function validateProfileCore(profile) {
  requireExactKeys(profile, COMPILER_PROFILE_KEYS, 'profile', 'MODEL_COMPILER_PROFILE_INVALID');
  const frozen = [
    ['schema', MECHANICAL_MODEL_COMPILER_PROFILE_SCHEMA],
    ['profileId', MECHANICAL_MODEL_COMPILER_PROFILE_ID],
    ['spanBindingRule', SPAN_BINDING_RULE],
    ['zeroLengthLinkRule', ZERO_LENGTH_LINK_RULE],
    ['constraintConflictRule', CONSTRAINT_CONFLICT_RULE],
    ['unrepresentableFeatureRule', UNREPRESENTABLE_FEATURE_RULE],
  ];
  for (const [key, expected] of frozen) {
    if (profile[key] !== expected) {
      fail(`profile.${key} must equal ${expected}.`, 'MODEL_COMPILER_PROFILE_INVALID');
    }
  }
  return resolveCompilerPolicies(profile);
}

export function requireMechanicalModelCompilerProfile(profile) {
  const policies = validateProfileCore(profile);
  requireHash(profile.semanticHash, 'profile.semanticHash', 'MODEL_COMPILER_PROFILE_INVALID');
  if (profile.semanticHash !== computeCompilerProfileSemanticHash(profile)) {
    fail('profile.semanticHash is stale.', 'MODEL_COMPILER_HASH_MISMATCH');
  }
  return deepFreeze({
    schema: profile.schema,
    profileId: profile.profileId,
    spanBindingRule: profile.spanBindingRule,
    zeroLengthLinkRule: profile.zeroLengthLinkRule,
    constraintConflictRule: profile.constraintConflictRule,
    unrepresentableFeatureRule: profile.unrepresentableFeatureRule,
    minimumElementLength: {
      value: policies.minimumElementLength.value,
      source: policies.minimumElementLength.source,
    },
    spanDirectionTolerance: {
      value: policies.spanDirectionTolerance.value,
      source: policies.spanDirectionTolerance.source,
    },
    semanticHash: profile.semanticHash,
  });
}

export function sealMechanicalModelCompilerProfile(profile) {
  requireExactKeys(
    profile,
    COMPILER_PROFILE_KEYS,
    'profile',
    'MODEL_COMPILER_PROFILE_INVALID',
  );
  validateProfileCore(profile);
  return requireMechanicalModelCompilerProfile({
    ...profile,
    semanticHash: computeCompilerProfileSemanticHash(profile),
  });
}
