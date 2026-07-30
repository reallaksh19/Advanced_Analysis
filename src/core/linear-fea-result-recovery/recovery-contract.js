import { SharedAnalysisContractError } from '../shared-analysis-contract/errors.js';
import { requireDeclaredValue } from '../shared-analysis-contract/declared-value.js';
import { deepFreeze, isPlainRecord } from '../shared-piping-model/immutable.js';
import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { requireCanonicalNodeId } from '../linear-fea-contract/identifiers.js';
import { PROHIBITED_PROFILE_SOURCE_TOKENS, compareAscii } from '../linear-fea-load-case/load-case-contract.js';

/**
 * LFEA-B3.4 result-recovery contracts.
 *
 * This module holds the schema identities, the recovery-profile authority,
 * the frozen recovery method identities and the rejection codes for the
 * recovery layer (sections 9, 9.1). It recomputes no stiffness, no
 * transformation and no B31.3 quantity: it cites the sealed B-3.1/B-3.2
 * element evidence and the sealed B-3.3 execution, and reads back the frozen
 * `q_local = K_local d_local - equivalentLoad - initialStrainLoad` shape those
 * packages already declared.
 */

export const RECOVERY_PROFILE_SCHEMA = 'fea-linear-recovery-profile/v1';
export const RECOVERY_SCHEMA = 'fea-linear-recovery/v1';
export const RECOVERY_ENVELOPE_SCHEMA = 'fea-linear-recovery-envelope/v1';

export const RECOVERY_PROFILE_ID = 'LINEAR-RESULT-RECOVERY-R1';

/** Section 9.1: code-point identity is independent of mesh element numbering,
 * but every code station B-3.2 currently publishes lands exactly on a
 * compiled element boundary node (see each component's own `codeStations`).
 * This is the one interpolation/extrapolation method this package implements:
 * an exact match between a code station's `nodeId` and a compiled element's
 * `I`/`J` node. A future code station that does not land on a node is refused
 * rather than silently smoothed (section 9.1's "never uses visually smoothed
 * viewport values"), which is why only this member exists. */
export const CODE_POINT_INTERPOLATION_METHOD = 'EXACT_NODE_ELEMENT_END_MATCH_V1';
export const SUPPORTED_CODE_POINT_INTERPOLATION_METHODS = Object.freeze([
  CODE_POINT_INTERPOLATION_METHOD,
]);

/** Section 9 "Element force field": closed-form equilibrium evaluated at
 * governed stations starting from the I-end local action, per the frozen
 * B-2.0 recovery shape; never a numerical integration scheme. */
export const FORCE_FIELD_METHOD = 'CLOSED_FORM_EQUILIBRIUM_STATION_V1';

export const LOCAL_ACTION_FIELDS = Object.freeze(['fx', 'fy', 'fz', 'mx', 'my', 'mz']);

export const RECOVERY_PROFILE_KEYS = Object.freeze([
  'schema',
  'profileId',
  'elementForceStationsPerSpan',
  'codePointConsistencyTolerance',
  'retainLocalAndGlobalActions',
  'semanticHash',
]);

export const RECOVERY_RECORD_KEYS = Object.freeze([
  'schema',
  'profileId',
  'recoveryProfileSemanticHash',
  'modelIdentity',
  'modelRevision',
  'mechanicalModelSemanticHash',
  'stiffnessStateHash',
  'physicalLoadCaseHash',
  'executionHash',
  'executionStatus',
  'elementActions',
  'forceFields',
  'componentResultants',
  'recoveryHash',
  'semanticHash',
  'evidenceHash',
]);

export const ELEMENT_ACTION_KEYS = Object.freeze([
  'elementId',
  'ownerComponentId',
  'local',
  'global',
]);

export const END_ACTION_PAIR_KEYS = Object.freeze(['I', 'J']);

export const FORCE_FIELD_KEYS = Object.freeze([
  'elementId',
  'ownerComponentId',
  'length',
  'method',
  'stations',
]);

export const FORCE_FIELD_STATION_KEYS = Object.freeze(['index', 'fraction', 'position', 'action']);

export const COMPONENT_RESULTANT_KEYS = Object.freeze([
  'componentId',
  'componentType',
  'codePoints',
]);

export const CODE_POINT_RESULTANT_KEYS = Object.freeze([
  'stationId',
  'kind',
  'nodeId',
  'position',
  'arcFraction',
  'elementId',
  'end',
  'method',
  'local',
  'global',
  'consistency',
]);

export const CODE_POINT_CONSISTENCY_KEYS = Object.freeze([
  'comparedElementId',
  'comparedEnd',
  'residual',
  'tolerance',
  'withinTolerance',
]);

export const ENVELOPE_QUANTITIES = LOCAL_ACTION_FIELDS;

export const ENVELOPE_RECORD_KEYS = Object.freeze([
  'schema',
  'modelIdentity',
  'modelRevision',
  'mechanicalModelSemanticHash',
  'stiffnessStateHash',
  'sourceExecutionHashes',
  'sourceRecoveryHashes',
  'codePoints',
  'envelopeHash',
  'semanticHash',
  'evidenceHash',
]);

export const ENVELOPE_CODE_POINT_KEYS = Object.freeze(['stationId', 'componentId', 'nodeId', 'entries']);
export const ENVELOPE_ENTRY_KEYS = Object.freeze(['quantity', 'max', 'min', 'absMax']);
export const ENVELOPE_GOVERNING_KEYS = Object.freeze(['value', 'executionHash', 'physicalLoadCaseHash']);

export const RECOVERY_HASH_PATTERN = /^fnv1a64:[0-9a-f]{16}$/u;

export class ResultRecoveryError extends SharedAnalysisContractError {
  constructor(message, code) {
    super(message, code);
    this.name = 'ResultRecoveryError';
  }
}

export function fail(message, code) {
  throw new ResultRecoveryError(message, code);
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

export function requireIdentity(value, field, code) {
  try {
    return requireCanonicalNodeId(value);
  } catch {
    return fail(`${field} must be a canonical kernel identity.`, code);
  }
}

export function requireHash(value, field, code) {
  if (typeof value !== 'string' || !RECOVERY_HASH_PATTERN.test(value)) {
    fail(`${field} must be a canonical semantic hash.`, code);
  }
  return value;
}

export { compareAscii };

function requireTraceableSource(entry) {
  const token = entry.source.trim().toUpperCase();
  if (PROHIBITED_PROFILE_SOURCE_TOKENS.includes(token)) {
    fail(
      `profile.${entry.field}.source names a hidden default rather than a traceable authority.`,
      'RECOVERY_PROFILE_SOURCE_NOT_TRACEABLE',
    );
  }
  return entry;
}

function requireDeclaredInteger(entry, field) {
  if (!Number.isInteger(entry.value)) fail(`profile.${field}.value must be an integer.`, 'RECOVERY_PROFILE_INVALID');
  return entry;
}

/**
 * Resolve the declared numeric/boolean policies section 13's `recoveryProfile`
 * names. Nothing is defaulted: an absent entry is `..._NOT_DECLARED`, and a
 * hidden-default source is refused exactly as every other LFEA profile
 * refuses one.
 */
export function resolveRecoveryPolicies(profile) {
  const elementForceStationsPerSpan = requireDeclaredInteger(
    requireTraceableSource(requireDeclaredValue(profile, 'elementForceStationsPerSpan', { minimum: 2 })),
    'elementForceStationsPerSpan',
  );
  const codePointConsistencyTolerance = requireTraceableSource(
    requireDeclaredValue(profile, 'codePointConsistencyTolerance', { exclusiveMinimum: 0, maximum: 1 }),
  );
  if (typeof profile.retainLocalAndGlobalActions !== 'boolean') {
    fail('profile.retainLocalAndGlobalActions must be declared true or false.', 'RECOVERY_PROFILE_INVALID');
  }
  if (profile.retainLocalAndGlobalActions !== true) {
    fail(
      'profile.retainLocalAndGlobalActions selects false; dropping the global end-action form is not implemented, and section 9 requires both local and global joint-on-element actions retained as evidence.',
      'RECOVERY_RETAIN_BOTH_ACTIONS_REQUIRED',
    );
  }
  return Object.freeze({ elementForceStationsPerSpan, codePointConsistencyTolerance });
}

export function recoveryProfileSemanticProjection(profile) {
  const projection = {};
  for (const key of RECOVERY_PROFILE_KEYS) {
    if (key === 'semanticHash') continue;
    projection[key] = profile[key];
  }
  return projection;
}

export function computeRecoveryProfileSemanticHash(profile) {
  return semanticHash(recoveryProfileSemanticProjection(profile));
}

function validateProfileCore(profile) {
  requireExactKeys(profile, RECOVERY_PROFILE_KEYS, 'profile', 'RECOVERY_PROFILE_INVALID');
  if (profile.schema !== RECOVERY_PROFILE_SCHEMA) fail(`profile.schema must be ${RECOVERY_PROFILE_SCHEMA}.`, 'RECOVERY_PROFILE_INVALID');
  if (profile.profileId !== RECOVERY_PROFILE_ID) fail(`profile.profileId must be ${RECOVERY_PROFILE_ID}.`, 'RECOVERY_PROFILE_INVALID');
  return resolveRecoveryPolicies(profile);
}

export function requireRecoveryProfile(profile) {
  validateProfileCore(profile);
  requireHash(profile.semanticHash, 'profile.semanticHash', 'RECOVERY_PROFILE_INVALID');
  if (profile.semanticHash !== computeRecoveryProfileSemanticHash(profile)) {
    fail('profile.semanticHash is stale.', 'RECOVERY_PROFILE_HASH_MISMATCH');
  }
  return deepFreeze({
    ...recoveryProfileSemanticProjection(profile),
    semanticHash: profile.semanticHash,
  });
}

export function sealRecoveryProfile(profile) {
  validateProfileCore(profile);
  return requireRecoveryProfile({
    ...recoveryProfileSemanticProjection(profile),
    semanticHash: computeRecoveryProfileSemanticHash(profile),
  });
}
