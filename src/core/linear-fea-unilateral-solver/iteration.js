import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { deepFreeze } from '../shared-piping-model/immutable.js';
import {
  UNILATERAL_EXECUTION_SCHEMA,
  UNILATERAL_PROFILE_ID,
  UnilateralConvergenceError,
  buildFrictionLimitations,
  requireUnilateralDeclarations,
  sealUnilateralExecution,
  sealUnilateralPolicy,
} from './unilateral-contract.js';
import { checkSupportStatus } from './support-status.js';

function fail(message, code = 'UNILATERAL_ITERATION_INVALID') {
  const error = new TypeError(message);
  error.code = code;
  throw error;
}

function declarationId(value, field) {
  if (!value || typeof value !== 'object' || typeof value.declarationId !== 'string' || value.declarationId.trim() === '') {
    fail(`${field}.declarationId must be a non-empty string.`);
  }
  return value.declarationId;
}

function validateBaseDeclarations(baseDeclarations, unilateral) {
  if (!Array.isArray(baseDeclarations)) fail('baseDeclarations must be an array.');
  const ids = new Set();
  baseDeclarations.forEach((row, index) => {
    const id = declarationId(row, `baseDeclarations[${index}]`);
    if (ids.has(id)) fail(`baseDeclarations duplicates ${id}.`, 'UNILATERAL_BASE_DECLARATION_DUPLICATE');
    ids.add(id);
  });
  for (const support of unilateral) {
    if (ids.has(support.declarationId)) {
      fail(
        `Unilateral declaration ${support.declarationId} must not also appear in baseDeclarations.`,
        'UNILATERAL_BASE_CONFLICT',
      );
    }
  }
}

function stateSnapshot(unilateral, engaged, frozenReleased) {
  return unilateral.map((support) => Object.freeze({
    declarationId: support.declarationId,
    engaged: engaged.get(support.declarationId) === true,
    frozenReleased: frozenReleased.has(support.declarationId),
  }));
}

function activeDeclarations(baseDeclarations, unilateral, engaged) {
  if (unilateral.length === 0) return baseDeclarations;
  const active = [...baseDeclarations];
  for (const support of unilateral) {
    if (engaged.get(support.declarationId) === true) active.push(support.constraint);
  }
  return active;
}

function supportProjection(unilateral) {
  return unilateral.map((support) => Object.freeze({
    declarationId: support.declarationId,
    nodeId: support.nodeId,
    dof: support.dof,
    sense: support.sense,
    gap: support.gap,
    frictionCoefficient: support.frictionCoefficient,
    frictionLimitationCode: support.frictionLimitationCode,
    contactValue: support.contactValue,
    initiallyEngaged: support.initiallyEngaged,
  }));
}

function solveContext(unilateral, engaged) {
  const prescribedMovements = unilateral
    .filter((support) => engaged.get(support.declarationId) === true && support.constraint.behavior === 'PRESCRIBED_SLOT')
    .map((support) => Object.freeze({
      prescribedSlotId: support.declarationId,
      nodeId: support.nodeId,
      dof: support.dof,
      value: support.contactValue,
    }));
  return Object.freeze({ prescribedMovements: Object.freeze(prescribedMovements) });
}

function sealTraceEntry({ iteration, engagedSet, frozenReleased, flips, executionHash }) {
  const draft = { iteration, engagedSet, frozenReleased, flips, executionHash };
  return deepFreeze({ ...draft, semanticHash: semanticHash(draft) });
}

function requireExecution(execution) {
  if (!execution || typeof execution !== 'object') fail('buildAndSolve must return an execution object.');
  if (typeof execution.semanticHash !== 'string' || execution.semanticHash.trim() === '') {
    fail('buildAndSolve execution must expose semanticHash.');
  }
  if (!Array.isArray(execution.displacement) || !Array.isArray(execution.reactions)) {
    fail('buildAndSolve execution must expose displacement and reactions arrays.');
  }
  return execution;
}

function sealConverged({ accepted, acceptedPolicy, trace, engaged, frozenReleased, execution, statusDiagnostics }) {
  return sealUnilateralExecution({
    schema: UNILATERAL_EXECUTION_SCHEMA,
    profileId: UNILATERAL_PROFILE_ID,
    policySemanticHash: acceptedPolicy.semanticHash,
    status: 'CONVERGED',
    unilateralDeclarations: supportProjection(accepted),
    trace: Object.freeze([...trace]),
    convergedState: stateSnapshot(accepted, engaged, frozenReleased),
    finalExecutionHash: execution.semanticHash,
    finalExecution: execution,
    diagnostics: Object.freeze({
      limitations: Object.freeze(buildFrictionLimitations(accepted)),
      statusEvents: Object.freeze([...statusDiagnostics]),
    }),
    semanticHash: '',
  });
}

/**
 * Frictionless active-set wrapper around an existing single-shot linear solve.
 * The callback is the only compilation/solver boundary: this module neither
 * assembles stiffness nor factors a matrix.
 */
export function compileUnilateralSolverExecution({ baseDeclarations, unilateral, buildAndSolve, policy }) {
  if (typeof buildAndSolve !== 'function') fail('buildAndSolve must be a function.');
  const accepted = requireUnilateralDeclarations(unilateral ?? []);
  validateBaseDeclarations(baseDeclarations, accepted);
  const acceptedPolicy = sealUnilateralPolicy(policy);
  const engaged = new Map(accepted.map((support) => [support.declarationId, support.initiallyEngaged]));
  const flipCounts = new Map(accepted.map((support) => [support.declarationId, 0]));
  const frozenReleased = new Set();
  const trace = [];
  const statusDiagnostics = [];
  const iterationLimit = accepted.length === 0 ? 1 : acceptedPolicy.maxIterationsFactor * accepted.length;

  for (let iteration = 0; iteration < iterationLimit; iteration += 1) {
    const declarations = activeDeclarations(baseDeclarations, accepted, engaged);
    const execution = requireExecution(buildAndSolve(declarations, solveContext(accepted, engaged)));
    const checked = checkSupportStatus({
      execution, unilateral: accepted, engaged, flipCounts, frozenReleased, policy: acceptedPolicy,
    });
    trace.push(sealTraceEntry({
      iteration,
      engagedSet: accepted.filter((support) => engaged.get(support.declarationId) === true).map((support) => support.declarationId),
      frozenReleased: [...frozenReleased].sort(),
      flips: checked.flips,
      executionHash: execution.semanticHash,
    }));
    statusDiagnostics.push(...checked.diagnostics);

    if (checked.flips.length === 0) {
      return sealConverged({ accepted, acceptedPolicy, trace, engaged, frozenReleased, execution, statusDiagnostics });
    }

    let stateChanged = false;
    for (const flip of checked.flips) {
      flipCounts.set(flip.declarationId, flip.flipCount);
      if (flip.freezeReleased) frozenReleased.add(flip.declarationId);
      if (flip.fromEngaged !== flip.nowEngaged) stateChanged = true;
      engaged.set(flip.declarationId, flip.nowEngaged);
    }
    if (!stateChanged) {
      return sealConverged({ accepted, acceptedPolicy, trace, engaged, frozenReleased, execution, statusDiagnostics });
    }
  }

  const last = trace[trace.length - 1];
  const oscillatingSupportIds = [...new Set(last.flips.map((flip) => flip.declarationId))].sort();
  throw new UnilateralConvergenceError(
    `Unilateral active set did not converge in ${iterationLimit} iterations.`,
    {
      schema: 'fea-unilateral-nonconvergence-evidence/v1',
      profileId: UNILATERAL_PROFILE_ID,
      policySemanticHash: acceptedPolicy.semanticHash,
      iterationLimit,
      oscillatingSupportIds,
      trace: Object.freeze([...trace]),
      statusEvents: Object.freeze([...statusDiagnostics]),
    },
  );
}
