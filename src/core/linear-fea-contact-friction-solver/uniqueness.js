import { deepFreeze } from '../shared-piping-model/immutable.js';
import { CONTACT_FRICTION_STATE, failContactFriction } from './contact-friction-contract.js';
import { solveFixedContactState } from './contact-response.js';
import { evaluateContactFrictionState } from './state-evaluation.js';

const METHOD = 'EXACT_DISCRETE_STATE_ENUMERATION_V1';
const CANDIDATE_LOCAL_FAILURES = new Set([
  'CONTACT_FRICTION_SLIP_JACOBIAN_SINGULAR',
  'CONTACT_FRICTION_SLIP_LINE_SEARCH_FAILED',
  'CONTACT_FRICTION_SLIP_NON_CONVERGENCE',
]);

function domain(contact) {
  return contact.frictionCoefficient > 0
    ? [CONTACT_FRICTION_STATE.OPEN, CONTACT_FRICTION_STATE.STICK, CONTACT_FRICTION_STATE.SLIP]
    : [CONTACT_FRICTION_STATE.OPEN, CONTACT_FRICTION_STATE.STICK];
}

export function contactFrictionCandidateStateCount(contacts) {
  return contacts.reduce((count, contact) => count * domain(contact).length, 1);
}

function stateRows(contacts, values) {
  return deepFreeze(contacts.map((contact, index) => ({
    declarationId: contact.declarationId,
    nodeId: contact.nodeId,
    state: values[index],
  })));
}

function stateMap(contacts, values) {
  return new Map(contacts.map((contact, index) => [contact.declarationId, values[index]]));
}

function signature(rows) {
  return rows.map((row) => `${row.declarationId}:${row.state}`).join('|');
}

function enumerateValues(contacts) {
  const values = [];
  const rows = [];
  const visit = (index) => {
    if (index === contacts.length) {
      rows.push([...values]);
      return;
    }
    for (const state of domain(contacts[index])) {
      values.push(state);
      visit(index + 1);
      values.pop();
    }
  };
  visit(0);
  return rows;
}

function candidateFailure(error, rows) {
  if (!CANDIDATE_LOCAL_FAILURES.has(error?.code)) throw error;
  return deepFreeze({
    state: rows,
    signature: signature(rows),
    admissible: false,
    failureCode: error.code,
    executionHash: null,
    constitutiveResidualInfinityNorm: null,
    evaluations: Object.freeze([]),
  });
}

function evaluateCandidate({ contacts, values, buildAndSolve, policy }) {
  const rows = stateRows(contacts, values);
  const states = stateMap(contacts, values);
  try {
    const fixed = solveFixedContactState({ contacts, states, buildAndSolve, policy });
    const checked = evaluateContactFrictionState({
      contacts,
      states,
      snapshot: fixed.snapshot,
      slipForces: fixed.slipForces,
      policy,
    });
    return deepFreeze({
      state: rows,
      signature: signature(rows),
      admissible: checked.converged,
      failureCode: null,
      executionHash: fixed.execution.semanticHash,
      constitutiveResidualInfinityNorm: fixed.residualInfinityNorm,
      evaluations: checked.evaluations,
      fixed,
    });
  } catch (error) {
    return candidateFailure(error, rows);
  }
}

export function proveUniqueAdmissibleContactFrictionState({
  contacts,
  buildAndSolve,
  policy,
}) {
  const candidateStateCount = contactFrictionCandidateStateCount(contacts);
  if (candidateStateCount > policy.maximumExactStateCandidates) {
    failContactFriction(
      `Exact contact/friction uniqueness proof requires ${candidateStateCount} states, exceeding policy limit ${policy.maximumExactStateCandidates}.`,
      'CONTACT_FRICTION_UNIQUENESS_PROOF_LIMIT_EXCEEDED',
      { candidateStateCount, maximumExactStateCandidates: policy.maximumExactStateCandidates },
    );
  }

  const candidates = enumerateValues(contacts).map((values) => evaluateCandidate({
    contacts,
    values,
    buildAndSolve,
    policy,
  }));
  const admissible = candidates.filter((candidate) => candidate.admissible);
  if (admissible.length === 0) {
    failContactFriction(
      'Exact contact/friction enumeration found no admissible state.',
      'CONTACT_FRICTION_NO_ADMISSIBLE_STATE',
      { candidates },
    );
  }
  if (admissible.length !== 1) {
    failContactFriction(
      `Exact contact/friction enumeration found ${admissible.length} admissible states.`,
      'CONTACT_FRICTION_NON_UNIQUE_STATE',
      { admissibleSignatures: admissible.map((row) => row.signature), candidates },
    );
  }

  const selected = admissible[0];
  return deepFreeze({
    selected,
    qualification: deepFreeze({
      schema: 'fea-contact-friction-uniqueness-proof/v1',
      method: METHOD,
      candidateStateCount,
      evaluatedCandidateCount: candidates.length,
      admissibleCandidateCount: 1,
      selectedStateSignature: selected.signature,
      uniqueAdmissibleStateProven: true,
      candidates: deepFreeze(candidates.map((candidate) => ({
        state: candidate.state,
        signature: candidate.signature,
        admissible: candidate.admissible,
        failureCode: candidate.failureCode,
        executionHash: candidate.executionHash,
        constitutiveResidualInfinityNorm: candidate.constitutiveResidualInfinityNorm,
      }))),
    }),
  });
}
