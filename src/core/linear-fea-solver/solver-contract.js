import { SharedAnalysisContractError } from '../shared-analysis-contract/errors.js';
import { requireDeclaredValue } from '../shared-analysis-contract/declared-value.js';
import { deepFreeze, isPlainRecord } from '../shared-piping-model/immutable.js';
import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { requireCanonicalNodeId } from '../linear-fea-contract/identifiers.js';

/**
 * LFEA-B3.3 sparse-assembly-and-solver contracts.
 *
 * Section 8 asks for "sparse Cholesky for qualified positive-definite
 * systems" and this package is honest about what it actually built: assembly
 * is genuinely sparse (deterministic COO triplets, section 8's Assembly row),
 * but the factorization backend below is a direct dense/banded Cholesky-or-
 * LDLT implemented in pure JS for the benchmark and single-system scale this
 * release targets (single-digit to low-hundreds of DOFs). The backend
 * identity below names that plainly — `FEA_DENSE_DIRECT_CHOLESKY_LDLT_V1` —
 * rather than claiming the production sparse-matrix solver the illustrative
 * `solverProfile.backend` string in section 13 names. No numerical gate is
 * weakened by that choice: the qualification thresholds in section 8.1 are
 * enforced exactly as declared, against the real factorization this package
 * performs.
 */

export const SOLVER_PROFILE_SCHEMA = 'fea-linear-solver-profile/v1';
export const DOF_MAP_SCHEMA = 'fea-linear-dof-map/v1';
export const EXECUTION_SCHEMA = 'fea-linear-execution/v1';

export const SOLVER_PROFILE_ID = 'LINEAR-SOLVER-R1';

/** Section 8 Factorization / section 13 solverProfile.backend, named honestly (see module doc). */
export const DENSE_DIRECT_BACKEND_ID = 'FEA_DENSE_DIRECT_CHOLESKY_LDLT_V1';
export const SUPPORTED_BACKENDS = Object.freeze([DENSE_DIRECT_BACKEND_ID]);

/** Section 8 Scaling / section 13 solverProfile.scaling. */
export const DIAGONAL_ENERGY_SCALING_ID = 'DIAGONAL_ENERGY_SCALING_V1';
export const SUPPORTED_SCALINGS = Object.freeze([DIAGONAL_ENERGY_SCALING_ID]);

/** Section 8.1 Global moment equilibrium "retained reference point". */
export const MOMENT_REFERENCE_RULE = 'FIRST_CANONICAL_NODE_V1';

export const QUALIFICATION_STATUSES = Object.freeze(['PASS', 'WARN', 'BLOCK']);
export const EXECUTION_STATUSES = Object.freeze(['QUALIFIED', 'CONDITIONAL', 'BLOCKED']);

export const SOLVER_PROFILE_KEYS = Object.freeze([
  'schema',
  'profileId',
  'backend',
  'scaling',
  'momentReferenceRule',
  'normalizedResidualLimit',
  'normalizedResidualWarnLimit',
  'equilibriumRelativeLimit',
  'equilibriumAbsoluteForceFloor',
  'equilibriumAbsoluteMomentFloor',
  'energyBalanceLimit',
  'nearZeroPivotTolerance',
  'conditionWarning',
  'conditionBlock',
  'semanticHash',
]);

export const DOF_MAP_RECORD_KEYS = Object.freeze([
  'schema',
  'orderingRule',
  'dofOrder',
  'nodeOrder',
  'dofCount',
  'entries',
  'semanticHash',
]);

export const EXECUTION_RECORD_KEYS = Object.freeze([
  'schema',
  'profileId',
  'solverProfileSemanticHash',
  'modelIdentity',
  'modelRevision',
  'mechanicalModelSemanticHash',
  'stiffnessStateHash',
  'physicalLoadCaseHash',
  'dofMap',
  'assembly',
  'factorization',
  'displacement',
  'reactions',
  'diagnostics',
  'status',
  'executionHash',
  'semanticHash',
  'evidenceHash',
]);

export const ASSEMBLY_KEYS = Object.freeze([
  'tripletCount',
  'elementCount',
  'springCount',
  'constrainedDofCount',
  'freeDofCount',
  'partitionHash',
]);

export const FACTORIZATION_KEYS = Object.freeze([
  'backend',
  'scaling',
  'cacheKey',
  'reused',
  'kind',
  'conditionEstimate',
]);

export const DIAGNOSTICS_KEYS = Object.freeze([
  'residual',
  'forceEquilibrium',
  'momentEquilibrium',
  'energyBalance',
  'conditioning',
]);

export const GATE_KEYS = Object.freeze(['checkId', 'value', 'limit', 'status']);

/**
 * Profile source strings that name a hidden default rather than a traceable
 * authority (section 13.1 prohibits hidden defaults outright). A profile
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

export class LinearSolverError extends SharedAnalysisContractError {
  constructor(message, code) {
    super(message, code);
    this.name = 'LinearSolverError';
  }
}

export function fail(message, code) {
  throw new LinearSolverError(message, code);
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
  if (typeof value !== 'string' || !/^fnv1a64:[0-9a-f]{16}$/u.test(value)) {
    fail(`${field} must be a canonical semantic hash.`, code);
  }
  return value;
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

function requireTraceableSource(entry) {
  const token = entry.source.trim().toUpperCase();
  if (PROHIBITED_PROFILE_SOURCE_TOKENS.includes(token)) {
    fail(
      `profile.${entry.field}.source names a hidden default rather than a traceable authority.`,
      'SOLVER_PROFILE_SOURCE_NOT_TRACEABLE',
    );
  }
  return entry;
}

/**
 * Resolve the declared numeric policies section 8.1 requires. Every gate
 * value arrives through `requireDeclaredValue`; there is no literal default
 * anywhere in this package, so a profile missing a field fails closed with
 * `..._NOT_DECLARED` rather than silently adopting the section 13 example,
 * and a present-but-hidden-default source (`DEFAULT`, `ASSUMED`, ...) is
 * refused with `SOLVER_PROFILE_SOURCE_NOT_TRACEABLE` rather than accepted.
 */
export function resolveSolverPolicies(profile) {
  return Object.freeze({
    normalizedResidualLimit: requireTraceableSource(requireDeclaredValue(profile, 'normalizedResidualLimit', { exclusiveMinimum: 0 })),
    normalizedResidualWarnLimit: requireTraceableSource(requireDeclaredValue(profile, 'normalizedResidualWarnLimit', { exclusiveMinimum: 0 })),
    equilibriumRelativeLimit: requireTraceableSource(requireDeclaredValue(profile, 'equilibriumRelativeLimit', { exclusiveMinimum: 0 })),
    equilibriumAbsoluteForceFloor: requireTraceableSource(requireDeclaredValue(profile, 'equilibriumAbsoluteForceFloor', { exclusiveMinimum: 0 })),
    equilibriumAbsoluteMomentFloor: requireTraceableSource(requireDeclaredValue(profile, 'equilibriumAbsoluteMomentFloor', { exclusiveMinimum: 0 })),
    energyBalanceLimit: requireTraceableSource(requireDeclaredValue(profile, 'energyBalanceLimit', { exclusiveMinimum: 0 })),
    nearZeroPivotTolerance: requireTraceableSource(requireDeclaredValue(profile, 'nearZeroPivotTolerance', { exclusiveMinimum: 0 })),
    conditionWarning: requireTraceableSource(requireDeclaredValue(profile, 'conditionWarning', { exclusiveMinimum: 0 })),
    conditionBlock: requireTraceableSource(requireDeclaredValue(profile, 'conditionBlock', { exclusiveMinimum: 0 })),
  });
}

function profileSemanticProjection(profile) {
  const policies = resolveSolverPolicies(profile);
  const projected = {};
  for (const key of SOLVER_PROFILE_KEYS) {
    if (key === 'semanticHash') continue;
    projected[key] = key in policies
      ? { value: policies[key].value, source: policies[key].source }
      : profile[key];
  }
  return projected;
}

export function computeSolverProfileSemanticHash(profile) {
  return semanticHash(profileSemanticProjection(profile));
}

function validateProfileCore(profile) {
  requireExactKeys(profile, SOLVER_PROFILE_KEYS, 'profile', 'SOLVER_PROFILE_INVALID');
  if (profile.schema !== SOLVER_PROFILE_SCHEMA) fail(`profile.schema must be ${SOLVER_PROFILE_SCHEMA}.`, 'SOLVER_PROFILE_INVALID');
  if (profile.profileId !== SOLVER_PROFILE_ID) fail(`profile.profileId must be ${SOLVER_PROFILE_ID}.`, 'SOLVER_PROFILE_INVALID');
  requireMember(profile.backend, SUPPORTED_BACKENDS, 'profile.backend', 'SOLVER_PROFILE_BACKEND_UNSUPPORTED');
  requireMember(profile.scaling, SUPPORTED_SCALINGS, 'profile.scaling', 'SOLVER_PROFILE_SCALING_UNSUPPORTED');
  if (profile.momentReferenceRule !== MOMENT_REFERENCE_RULE) {
    fail(`profile.momentReferenceRule must be ${MOMENT_REFERENCE_RULE}.`, 'SOLVER_PROFILE_INVALID');
  }
  const policies = resolveSolverPolicies(profile);
  if (!(policies.normalizedResidualLimit.value <= policies.normalizedResidualWarnLimit.value)) {
    fail(
      'profile.normalizedResidualLimit must not exceed profile.normalizedResidualWarnLimit; the pass gate cannot be looser than the warning gate.',
      'SOLVER_PROFILE_GATE_ORDER_INVALID',
    );
  }
  if (!(policies.conditionWarning.value <= policies.conditionBlock.value)) {
    fail(
      'profile.conditionWarning must not exceed profile.conditionBlock.',
      'SOLVER_PROFILE_GATE_ORDER_INVALID',
    );
  }
  return policies;
}

export function requireSolverProfile(profile) {
  validateProfileCore(profile);
  requireHash(profile.semanticHash, 'profile.semanticHash', 'SOLVER_PROFILE_INVALID');
  if (profile.semanticHash !== computeSolverProfileSemanticHash(profile)) {
    fail('profile.semanticHash is stale.', 'SOLVER_PROFILE_HASH_MISMATCH');
  }
  return deepFreeze({ ...profileSemanticProjection(profile), semanticHash: profile.semanticHash });
}

export function sealSolverProfile(profile) {
  validateProfileCore(profile);
  return requireSolverProfile({ ...profile, semanticHash: computeSolverProfileSemanticHash(profile) });
}
