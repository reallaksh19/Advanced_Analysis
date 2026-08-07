import { deepFreeze } from '../shared-piping-model/immutable.js';
import {
  UNILATERAL_EXECUTION_SCHEMA,
  UNILATERAL_STATUS,
  normalizeUnilateralDeclarations,
  resolveUnilateralPolicy,
  sealUnilateralExecution,
  unilateralLimitations,
} from './unilateral-contract.js';
import { checkSupportStatus } from './support-status.js';

function fail(message, code, details = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, details);
  throw error;
}

function requireBuildAndSolve(value) {
  if (typeof value !== 'function') fail('buildAndSolve must be a function.', 'UNILATERAL_BUILD_AND_SOLVE_INVALID');
  return value;
}

function requireBaseDeclarations(value) {
  if (!Array.isArray(value)) fail('baseDeclarations must be an array.', 'UNILATERAL_BASE_DECLARATIONS_INVALID');
  return value;
}

function requireExecution(execution) {
  if (!execution || typeof execution !== 'object') {
    fail('buildAndSolve must return an execution object.', 'UNILATERAL_INNER_EXECUTION_INVALID');
  }
  if (typeof execution.semanticHash !== 'string' || execution.semanticHash.length === 0) {
    fail('Inner execution must expose semanticHash.', 'UNILATERAL_INNER_EXECUTION_INVALID');
  }
  if (!Array.isArray(execution.reactions) || !Array.isArray(execution.displacement)) {
    fail('Inner execution must expose reactions and displacement arrays.', 'UNILATERAL_INNER_EXECUTION_INVALID');
  }
  return execution;
}

function statusSnapshot(unilateral, engaged, frozen) {
  return deepFreeze(unilateral.map((declaration) => ({
    declarationId: declaration.declarationId,
    nodeId: declaration.nodeId,
    dof: declaration.dof,
    status: engaged.get(declaration.declarationId) ? UNILATERAL_STATUS.ENGAGED : UNILATERAL_STATUS.RELEASED,
    frozenReleased: frozen.has(declaration.declarationId),
  })));
}

function activeContactState(baseDeclarations, unilateral, engaged) {
  const active = unilateral.filter((declaration) => engaged.get(declaration.declarationId) === true);
  return deepFreeze({
    constraintDeclarations: [
      ...baseDeclarations,
      ...active.map((declaration) => declaration.constraintDeclaration),
    ],
    prescribedMovements: active
      .map((declaration) => declaration.prescribedMovement)
      .filter((movement) => movement !== null),
  });
}

function oscillatorList(unilateral, flipCounts) {
  return deepFreeze(unilateral
    .filter((declaration) => (flipCounts.get(declaration.declarationId) ?? 0) > 0)
    .map((declaration) => ({
      declarationId: declaration.declarationId,
      nodeId: declaration.nodeId,
      dof: declaration.dof,
      flipCount: flipCounts.get(declaration.declarationId) ?? 0,
    })));
}

export function compileUnilateralSolverExecution({
  baseDeclarations,
  unilateral,
  buildAndSolve,
  policy,
}) {
  const base = requireBaseDeclarations(baseDeclarations);
  const solve = requireBuildAndSolve(buildAndSolve);
  const normalized = normalizeUnilateralDeclarations(unilateral ?? []);
  const acceptedPolicy = resolveUnilateralPolicy(policy, normalized.length);
  const limitations = unilateralLimitations(normalized);

  const engaged = new Map(normalized.map((declaration) => [declaration.declarationId, declaration.initiallyEngaged]));
  const flipCounts = new Map(normalized.map((declaration) => [declaration.declarationId, 0]));
  const frozen = new Set();
  const trace = [];

  for (let iteration = 0; iteration < acceptedPolicy.maxIterations; iteration += 1) {
    const active = activeContactState(base, normalized, engaged);
    const execution = requireExecution(solve(active.constraintDeclarations, active));
    const before = statusSnapshot(normalized, engaged, frozen);
    const checked = checkSupportStatus({
      execution,
      unilateral: normalized,
      engaged,
      flipCounts,
      frozen,
      policy: acceptedPolicy,
    });

    for (const diagnostic of checked.frozenNow) {
      frozen.add(diagnostic.declarationId);
      engaged.set(diagnostic.declarationId, false);
    }

    trace.push(deepFreeze({
      iteration,
      engagedSet: before,
      flips: checked.flips,
      frozenDiagnostics: checked.frozenNow,
      evaluations: checked.evaluations,
      executionHash: execution.semanticHash,
    }));

    if (checked.flips.length === 0) {
      return sealUnilateralExecution({
        schema: UNILATERAL_EXECUTION_SCHEMA,
        policy: acceptedPolicy,
        unilateral: normalized,
        limitations,
        trace: deepFreeze([...trace]),
        convergedState: statusSnapshot(normalized, engaged, frozen),
        finalExecutionHash: execution.semanticHash,
        finalExecution: execution,
      });
    }

    for (const flip of checked.flips) {
      engaged.set(flip.declarationId, flip.nowEngaged);
      if (flip.reason !== 'FREEZE_RELEASED') {
        flipCounts.set(flip.declarationId, (flipCounts.get(flip.declarationId) ?? 0) + 1);
      } else {
        frozen.add(flip.declarationId);
      }
    }
  }

  const oscillators = oscillatorList(normalized, flipCounts);
  fail(
    `Unilateral active-set iteration did not converge within ${acceptedPolicy.maxIterations} iterations.`,
    'UNILATERAL_NON_CONVERGENCE',
    {
      trace: deepFreeze([...trace]),
      oscillators,
      limitations,
    },
  );
}
