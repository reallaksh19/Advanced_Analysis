import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { deepFreeze, isPlainRecord } from '../shared-piping-model/immutable.js';

export const UNILATERAL_EXECUTION_SCHEMA = 'fea-unilateral-execution/v1';
export const UNILATERAL_PROFILE_ID = 'FRICTIONLESS_ACTIVE_SET_R1';
export const UNILATERAL_POLICY_SCHEMA = 'fea-unilateral-policy/v1';
export const UNILATERAL_FRICTION_LIMITATION = 'UNILATERAL_FRICTION_NOT_MODELED';

export const UNILATERAL_SENSE = Object.freeze({
  13: Object.freeze({ dof: 'UX', sense: 1 }),
  14: Object.freeze({ dof: 'UY', sense: 1 }),
  15: Object.freeze({ dof: 'UZ', sense: 1 }),
  16: Object.freeze({ dof: 'UX', sense: -1 }),
  17: Object.freeze({ dof: 'UY', sense: -1 }),
  18: Object.freeze({ dof: 'UZ', sense: -1 }),
});

const DOFS = Object.freeze(['UX', 'UY', 'UZ']);

function fail(message, code = 'UNILATERAL_CONTRACT_INVALID') {
  const error = new TypeError(message);
  error.code = code;
  throw error;
}

function requireRecord(value, field) {
  if (!isPlainRecord(value)) fail(`${field} must be a plain record.`);
  return value;
}

function requireString(value, field) {
  if (typeof value !== 'string' || value.trim() === '') fail(`${field} must be a non-empty string.`);
  return value.trim();
}

function requireFinite(value, field) {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(`${field} must be finite.`);
  return value;
}

function requireNonnegative(value, field) {
  const accepted = requireFinite(value, field);
  if (accepted < 0) fail(`${field} must be nonnegative.`);
  return accepted;
}

function requireConstraint(value, field) {
  requireRecord(value, field);
  const keys = Object.keys(value).sort();
  const expected = ['behavior', 'declarationId', 'dof', 'kind', 'nodeId'];
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    fail(`${field} must be an exact NODAL_RESTRAINT declaration.`);
  }
  if (value.kind !== 'NODAL_RESTRAINT' || !['FIXED', 'PRESCRIBED_SLOT'].includes(value.behavior)) {
    fail(`${field} must be FIXED or PRESCRIBED_SLOT NODAL_RESTRAINT.`);
  }
  requireString(value.declarationId, `${field}.declarationId`);
  requireString(value.nodeId, `${field}.nodeId`);
  if (!DOFS.includes(value.dof)) fail(`${field}.dof must be translational.`);
  return { ...value };
}

export function sealUnilateralPolicy(overrides) {
  const source = overrides ?? {};
  const policy = {
    schema: UNILATERAL_POLICY_SCHEMA,
    profileId: UNILATERAL_PROFILE_ID,
    forceTolerance: source.forceTolerance ?? 1,
    penetrationTolerance: source.penetrationTolerance ?? 1e-9,
    maxIterationsFactor: source.maxIterationsFactor ?? 4,
    flipLimit: source.flipLimit ?? 3,
  };
  requireNonnegative(policy.forceTolerance, 'policy.forceTolerance');
  requireNonnegative(policy.penetrationTolerance, 'policy.penetrationTolerance');
  if (!Number.isInteger(policy.maxIterationsFactor) || policy.maxIterationsFactor < 1) fail('policy.maxIterationsFactor must be a positive integer.');
  if (!Number.isInteger(policy.flipLimit) || policy.flipLimit < 1) fail('policy.flipLimit must be a positive integer.');
  return deepFreeze({ ...policy, semanticHash: semanticHash(policy) });
}

export function createUnilateralDeclaration({ declarationId, nodeId, typeCode, gap, frictionCoefficient, limitationCode, initiallyEngaged }) {
  const resolved = UNILATERAL_SENSE[String(typeCode)];
  if (!resolved) fail(`Unsupported unilateral restraint type code ${typeCode}.`, 'UNILATERAL_TYPE_UNSUPPORTED');
  const acceptedGap = gap ?? 0;
  const constraint = {
    declarationId,
    kind: 'NODAL_RESTRAINT',
    nodeId,
    dof: resolved.dof,
    behavior: acceptedGap > 0 ? 'PRESCRIBED_SLOT' : 'FIXED',
  };
  return sealUnilateralDeclaration({
    constraint,
    sense: resolved.sense,
    gap: acceptedGap,
    frictionCoefficient: frictionCoefficient ?? 0,
    frictionLimitationCode: limitationCode ?? UNILATERAL_FRICTION_LIMITATION,
    initiallyEngaged: initiallyEngaged ?? true,
  });
}

export function createDoubleActingGapDeclarations({ declarationId, nodeId, dof, gap, frictionCoefficient, limitationCode }) {
  if (!DOFS.includes(dof)) fail('Double-acting gap dof must be translational.');
  const acceptedGap = requireNonnegative(gap, 'doubleActingGap.gap');
  if (!(acceptedGap > 0)) fail('Double-acting gap requires gap > 0.');
  return deepFreeze([1, -1].map((sense) => sealUnilateralDeclaration({
    constraint: {
      declarationId: `${declarationId}-${sense > 0 ? 'NEGATIVE-FACE' : 'POSITIVE-FACE'}`,
      kind: 'NODAL_RESTRAINT',
      nodeId,
      dof,
      behavior: 'PRESCRIBED_SLOT',
    },
    sense,
    gap: acceptedGap,
    frictionCoefficient: frictionCoefficient ?? 0,
    frictionLimitationCode: limitationCode ?? UNILATERAL_FRICTION_LIMITATION,
    initiallyEngaged: false,
  })));
}

export function sealUnilateralDeclaration(value) {
  requireRecord(value, 'unilateral');
  const constraint = requireConstraint(value.constraint, 'unilateral.constraint');
  if (value.sense !== 1 && value.sense !== -1) fail('unilateral.sense must be +1 or -1.');
  const gap = requireNonnegative(value.gap ?? 0, 'unilateral.gap');
  if (gap > 0 && constraint.behavior !== 'PRESCRIBED_SLOT') {
    fail('A nonzero gap must engage at its contact plane through PRESCRIBED_SLOT.', 'UNILATERAL_GAP_SLOT_REQUIRED');
  }
  const frictionCoefficient = requireNonnegative(value.frictionCoefficient ?? 0, 'unilateral.frictionCoefficient');
  const frictionLimitationCode = requireString(
    value.frictionLimitationCode ?? UNILATERAL_FRICTION_LIMITATION,
    'unilateral.frictionLimitationCode',
  );
  return deepFreeze({
    declarationId: constraint.declarationId,
    nodeId: constraint.nodeId,
    dof: constraint.dof,
    sense: value.sense,
    gap,
    contactValue: gap === 0 ? 0 : -value.sense * gap,
    frictionCoefficient,
    frictionLimitationCode,
    initiallyEngaged: value.initiallyEngaged ?? true,
    constraint,
  });
}

export function requireUnilateralDeclarations(values) {
  if (!Array.isArray(values)) fail('unilateral must be an array.');
  const accepted = values.map((value) => sealUnilateralDeclaration(value));
  accepted.sort((left, right) => left.declarationId < right.declarationId ? -1 : left.declarationId > right.declarationId ? 1 : 0);
  const seen = new Set();
  for (const row of accepted) {
    if (seen.has(row.declarationId)) fail(`Duplicate unilateral declaration ${row.declarationId}.`, 'UNILATERAL_DECLARATION_DUPLICATE');
    seen.add(row.declarationId);
  }
  return deepFreeze(accepted);
}

export function buildFrictionLimitations(unilateral) {
  const byKey = new Map();
  for (const row of unilateral.filter((support) => support.frictionCoefficient > 0)) {
    const key = `${row.frictionLimitationCode}:${row.nodeId}:${row.dof}`;
    if (!byKey.has(key)) byKey.set(key, deepFreeze({
      code: row.frictionLimitationCode,
      nodeId: row.nodeId,
      dof: row.dof,
      frictionCoefficient: row.frictionCoefficient,
      message: 'Coulomb friction is retained as source evidence but is outside this frictionless active-set solve.',
    }));
  }
  return [...byKey.values()];
}

export function computeUnilateralExecutionSemanticHash(record) {
  return semanticHash({
    schema: record.schema,
    profileId: record.profileId,
    policySemanticHash: record.policySemanticHash,
    status: record.status,
    unilateralDeclarations: record.unilateralDeclarations,
    trace: record.trace,
    convergedState: record.convergedState,
    finalExecutionHash: record.finalExecutionHash,
    diagnostics: record.diagnostics,
  });
}

export function sealUnilateralExecution(record) {
  requireRecord(record, 'execution');
  if (record.schema !== UNILATERAL_EXECUTION_SCHEMA) fail(`execution.schema must be ${UNILATERAL_EXECUTION_SCHEMA}.`);
  if (record.profileId !== UNILATERAL_PROFILE_ID || record.status !== 'CONVERGED') fail('execution profile/status is invalid.');
  if (!Array.isArray(record.trace) || record.trace.length < 1) fail('execution.trace must contain at least one iterate.');
  if (!Array.isArray(record.convergedState)) fail('execution.convergedState must be an array.');
  requireString(record.finalExecutionHash, 'execution.finalExecutionHash');
  if (!record.finalExecution || record.finalExecution.semanticHash !== record.finalExecutionHash) fail('execution.finalExecution must match finalExecutionHash.');
  const semantic = computeUnilateralExecutionSemanticHash(record);
  if (record.semanticHash && record.semanticHash !== semantic) fail('execution.semanticHash is stale.', 'UNILATERAL_HASH_MISMATCH');
  return deepFreeze({ ...record, semanticHash: semantic });
}

export class UnilateralConvergenceError extends Error {
  constructor(message, evidence) {
    super(message);
    this.name = 'UnilateralConvergenceError';
    this.code = 'UNILATERAL_NON_CONVERGENCE';
    this.evidence = deepFreeze(evidence);
  }
}
