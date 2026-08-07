import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { deepFreeze, isPlainRecord } from '../shared-piping-model/immutable.js';

export const UNILATERAL_EXECUTION_SCHEMA = 'fea-unilateral-execution/v1';
export const UNILATERAL_POLICY_SCHEMA = 'fea-unilateral-policy/v1';
export const UNILATERAL_STATUS = Object.freeze({
  ENGAGED: 'ENGAGED',
  RELEASED: 'RELEASED',
});
export const BM4_FRICTION_NOT_MODELED = 'BM4_FRICTION_NOT_MODELED';

export const UNILATERAL_SENSE = Object.freeze({
  13: Object.freeze({ dof: 'UX', sense: 1 }),
  14: Object.freeze({ dof: 'UY', sense: 1 }),
  15: Object.freeze({ dof: 'UZ', sense: 1 }),
  16: Object.freeze({ dof: 'UX', sense: -1 }),
  17: Object.freeze({ dof: 'UY', sense: -1 }),
  18: Object.freeze({ dof: 'UZ', sense: -1 }),
});

export const DEFAULT_UNILATERAL_POLICY = Object.freeze({
  schema: UNILATERAL_POLICY_SCHEMA,
  forceTolerance: 1,
  penetrationTolerance: 1e-9,
  flipLimit: 3,
});

function fail(message, code = 'UNILATERAL_EXECUTION_INVALID') {
  const error = new TypeError(message);
  error.code = code;
  throw error;
}

function requireFinite(value, field) {
  if (!Number.isFinite(value)) fail(`${field} must be finite.`);
  return value;
}

function requireNonNegative(value, field) {
  requireFinite(value, field);
  if (value < 0) fail(`${field} must be non-negative.`);
  return value;
}

function requireIdentity(value, field) {
  if (typeof value !== 'string' || value.trim() === '') fail(`${field} must be a non-empty string.`);
  return value;
}

export function compareDeclarationId(left, right) {
  const a = left.declarationId;
  const b = right.declarationId;
  return a < b ? -1 : a > b ? 1 : 0;
}

export function requireUnilateralDeclaration(value, field = 'unilateral') {
  if (!isPlainRecord(value)) fail(`${field} must be a plain record.`);
  const declarationId = requireIdentity(value.declarationId, `${field}.declarationId`);
  const nodeId = requireIdentity(value.nodeId, `${field}.nodeId`);
  const code = Number(value.typeCode);
  const sense = UNILATERAL_SENSE[code];
  if (!sense) fail(`${field}.typeCode must be one of 13 through 18.`, 'UNILATERAL_TYPE_UNSUPPORTED');
  const gap = value.gap === undefined || value.gap === null ? 0 : requireNonNegative(value.gap, `${field}.gap`);
  const frictionCoefficient = value.frictionCoefficient === undefined || value.frictionCoefficient === null
    ? null
    : requireNonNegative(value.frictionCoefficient, `${field}.frictionCoefficient`);
  const constraintDeclaration = deepFreeze({
    declarationId,
    kind: 'NODAL_RESTRAINT',
    nodeId,
    dof: sense.dof,
    behavior: 'FIXED',
  });
  return deepFreeze({
    declarationId,
    nodeId,
    typeCode: code,
    dof: sense.dof,
    sense: sense.sense,
    gap,
    frictionCoefficient,
    constraintDeclaration,
  });
}

export function normalizeUnilateralDeclarations(values) {
  if (!Array.isArray(values)) fail('unilateral must be an array.');
  const normalized = values.map((value, index) => requireUnilateralDeclaration(value, `unilateral[${index}]`));
  normalized.sort(compareDeclarationId);
  const seen = new Set();
  for (const declaration of normalized) {
    if (seen.has(declaration.declarationId)) {
      fail(`Duplicate unilateral declarationId ${declaration.declarationId}.`, 'UNILATERAL_DECLARATION_DUPLICATE');
    }
    seen.add(declaration.declarationId);
  }
  return deepFreeze(normalized);
}

export function resolveUnilateralPolicy(policy, unilateralCount) {
  const source = policy ?? DEFAULT_UNILATERAL_POLICY;
  if (!isPlainRecord(source)) fail('policy must be a plain record.');
  if (source.schema !== undefined && source.schema !== UNILATERAL_POLICY_SCHEMA) {
    fail(`policy.schema must be ${UNILATERAL_POLICY_SCHEMA}.`);
  }
  const forceTolerance = source.forceTolerance ?? DEFAULT_UNILATERAL_POLICY.forceTolerance;
  const penetrationTolerance = source.penetrationTolerance ?? DEFAULT_UNILATERAL_POLICY.penetrationTolerance;
  const flipLimit = source.flipLimit ?? DEFAULT_UNILATERAL_POLICY.flipLimit;
  requireNonNegative(forceTolerance, 'policy.forceTolerance');
  requireNonNegative(penetrationTolerance, 'policy.penetrationTolerance');
  if (!Number.isInteger(flipLimit) || flipLimit < 1) fail('policy.flipLimit must be a positive integer.');
  const defaultMax = Math.max(1, 4 * unilateralCount);
  const maxIterations = source.maxIterations ?? defaultMax;
  if (!Number.isInteger(maxIterations) || maxIterations < 1) fail('policy.maxIterations must be a positive integer.');
  return deepFreeze({
    schema: UNILATERAL_POLICY_SCHEMA,
    forceTolerance,
    penetrationTolerance,
    flipLimit,
    maxIterations,
  });
}

export function unilateralLimitations(unilateral) {
  return deepFreeze(unilateral
    .filter((entry) => entry.frictionCoefficient !== null && entry.frictionCoefficient > 0)
    .map((entry) => ({
      code: BM4_FRICTION_NOT_MODELED,
      declarationId: entry.declarationId,
      nodeId: entry.nodeId,
      frictionCoefficient: entry.frictionCoefficient,
    })));
}

export function unilateralExecutionSemanticProjection(record) {
  return {
    schema: record.schema,
    policy: record.policy,
    unilateral: record.unilateral,
    limitations: record.limitations,
    trace: record.trace,
    convergedState: record.convergedState,
    finalExecutionHash: record.finalExecutionHash,
  };
}

export function computeUnilateralExecutionSemanticHash(record) {
  return semanticHash(unilateralExecutionSemanticProjection(record));
}

export function sealUnilateralExecution(record) {
  if (!isPlainRecord(record)) fail('unilateral execution must be a plain record.');
  if (record.schema !== UNILATERAL_EXECUTION_SCHEMA) fail(`execution.schema must be ${UNILATERAL_EXECUTION_SCHEMA}.`);
  if (!Array.isArray(record.trace) || record.trace.length < 1) fail('execution.trace must contain at least one iteration.');
  if (!Array.isArray(record.convergedState)) fail('execution.convergedState must be an array.');
  const finalExecutionHash = requireIdentity(record.finalExecutionHash, 'execution.finalExecutionHash');
  if (!record.finalExecution || record.finalExecution.semanticHash !== finalExecutionHash) {
    fail('execution.finalExecution must match execution.finalExecutionHash.');
  }
  const semanticHashValue = computeUnilateralExecutionSemanticHash(record);
  if (record.semanticHash !== undefined && record.semanticHash !== semanticHashValue) {
    fail('execution.semanticHash is stale.', 'UNILATERAL_HASH_MISMATCH');
  }
  return deepFreeze({ ...record, semanticHash: semanticHashValue });
}
