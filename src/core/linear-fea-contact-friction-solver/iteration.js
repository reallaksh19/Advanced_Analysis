import { deepFreeze } from '../shared-piping-model/immutable.js';
import {
  CONTACT_FRICTION_CLASSIFICATION,
  CONTACT_FRICTION_EXECUTION_SCHEMA,
  CONTACT_FRICTION_STATE,
  failContactFriction,
  normalizeContactFrictionDeclarations,
  resolveContactFrictionPolicy,
  sealContactFrictionExecution,
} from './contact-friction-contract.js';
import { solveFixedContactState } from './contact-response.js';
import { evaluateContactFrictionState } from './state-evaluation.js';
import { proveUniqueAdmissibleContactFrictionState } from './uniqueness.js';

function requireBuildAndSolve(value) {
  if (typeof value !== 'function') {
    failContactFriction('buildAndSolve must be a function.', 'CONTACT_FRICTION_BUILD_AND_SOLVE_INVALID');
  }
  return value;
}

function stateSignature(contacts, states) {
  return contacts.map((contact) => `${contact.declarationId}:${states.get(contact.declarationId)}`).join('|');
}

function evaluationSignature(evaluations) {
  return evaluations.map((row) => `${row.declarationId}:${row.state}`).join('|');
}

function stateRows(contacts, states) {
  return deepFreeze(contacts.map((contact) => ({
    declarationId: contact.declarationId,
    nodeId: contact.nodeId,
    state: states.get(contact.declarationId),
  })));
}

function inferClassification(contacts) {
  return contacts.some((contact) => contact.frictionCoefficient > 0)
    ? CONTACT_FRICTION_CLASSIFICATION.PHYSICAL_FRICTION
    : CONTACT_FRICTION_CLASSIFICATION.PHYSICAL_CONTACT;
}

function acceptedClassification(requested, contacts) {
  const inferred = inferClassification(contacts);
  if (requested === undefined || requested === null) return inferred;
  if (requested !== inferred) {
    failContactFriction(
      `classification ${requested} conflicts with source contact/friction declarations; expected ${inferred}.`,
      'CONTACT_FRICTION_CLASSIFICATION_MISMATCH',
    );
  }
  return requested;
}

function initialStates(contacts) {
  return new Map(contacts.map((contact) => [contact.declarationId, contact.initialState]));
}

function sealQualified({ normalized, solve, acceptedPolicy, acceptedCaseClass, history, checked }) {
  const proof = proveUniqueAdmissibleContactFrictionState({
    contacts: normalized,
    buildAndSolve: solve,
    policy: acceptedPolicy,
  });
  const iterativeSignature = evaluationSignature(checked.evaluations);
  if (proof.qualification.selectedStateSignature !== iterativeSignature) {
    failContactFriction(
      `Iterative state ${iterativeSignature} differs from exact unique state ${proof.qualification.selectedStateSignature}.`,
      'CONTACT_FRICTION_ITERATION_UNIQUENESS_MISMATCH',
      { iterativeSignature, exactSignature: proof.qualification.selectedStateSignature, history },
    );
  }
  return sealContactFrictionExecution({
    schema: CONTACT_FRICTION_EXECUTION_SCHEMA,
    classification: acceptedCaseClass,
    policy: acceptedPolicy,
    contacts: normalized,
    selectedState: proof.selected.evaluations,
    history: deepFreeze(history),
    qualification: proof.qualification,
    finalExecutionHash: proof.selected.fixed.execution.semanticHash,
    finalExecution: proof.selected.fixed.execution,
    constitutiveResidualInfinityNorm: proof.selected.fixed.residualInfinityNorm,
  });
}

export function compileContactFrictionExecution({
  contacts,
  buildAndSolve,
  policy,
  classification,
}) {
  const normalized = normalizeContactFrictionDeclarations(contacts ?? []);
  const solve = requireBuildAndSolve(buildAndSolve);
  const acceptedPolicy = resolveContactFrictionPolicy(policy, normalized.length);
  const acceptedCaseClass = acceptedClassification(classification, normalized);
  let states = initialStates(normalized);
  const signatures = new Map([[stateSignature(normalized, states), 0]]);
  const history = [];

  for (let iteration = 0; iteration < acceptedPolicy.maximumIterations; iteration += 1) {
    const before = stateRows(normalized, states);
    const fixed = solveFixedContactState({
      contacts: normalized,
      states,
      buildAndSolve: solve,
      policy: acceptedPolicy,
    });
    const checked = evaluateContactFrictionState({
      contacts: normalized,
      states,
      snapshot: fixed.snapshot,
      slipForces: fixed.slipForces,
      policy: acceptedPolicy,
    });
    history.push(deepFreeze({
      iteration,
      state: before,
      executionHash: fixed.execution.semanticHash,
      constitutiveResidualInfinityNorm: fixed.residualInfinityNorm,
      slipSolveHistory: fixed.history,
      responseEvidence: fixed.responseEvidence ?? null,
      evaluations: checked.evaluations,
      nextState: checked.nextStateRows,
    }));

    if (checked.converged) {
      return sealQualified({
        normalized,
        solve,
        acceptedPolicy,
        acceptedCaseClass,
        history,
        checked,
      });
    }

    const stuckInvalid = checked.evaluations.find((row) => row.nextState === row.state && !row.admissible);
    if (stuckInvalid) {
      failContactFriction(
        `Contact ${stuckInvalid.declarationId} is constitutively inadmissible without a deterministic state transition.`,
        'CONTACT_FRICTION_STATE_INADMISSIBLE',
        { history: deepFreeze(history), evaluation: stuckInvalid },
      );
    }

    const nextStates = new Map(checked.nextStateRows.map((row) => [row.declarationId, row.state]));
    const signature = stateSignature(normalized, nextStates);
    if (signatures.has(signature)) {
      failContactFriction(
        `Contact/friction active-set cycle detected at state ${signature}.`,
        'CONTACT_FRICTION_CYCLE',
        {
          firstSeenIteration: signatures.get(signature),
          repeatedAtIteration: iteration + 1,
          history: deepFreeze(history),
        },
      );
    }
    signatures.set(signature, iteration + 1);
    states = nextStates;
  }

  failContactFriction(
    `Contact/friction iteration did not converge within ${acceptedPolicy.maximumIterations} iterations.`,
    'CONTACT_FRICTION_NON_CONVERGENCE',
    { history: deepFreeze(history), finalState: stateRows(normalized, states) },
  );
}

export function contactFrictionStateFromRows(rows) {
  if (!Array.isArray(rows)) failContactFriction('rows must be an array.', 'CONTACT_FRICTION_STATE_INVALID');
  const states = new Map();
  for (const row of rows) {
    if (!row || typeof row.declarationId !== 'string' || !Object.values(CONTACT_FRICTION_STATE).includes(row.state)) {
      failContactFriction('state row is invalid.', 'CONTACT_FRICTION_STATE_INVALID');
    }
    if (states.has(row.declarationId)) failContactFriction(`Duplicate state ${row.declarationId}.`, 'CONTACT_FRICTION_STATE_INVALID');
    states.set(row.declarationId, row.state);
  }
  return states;
}
