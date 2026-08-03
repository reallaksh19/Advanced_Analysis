import {
  deepFreeze,
  isPlainRecord,
  semanticHash,
} from '../../../core/shared-piping-model/index.js';
import { TopologyEditCertifiedSession } from '../topology-edit-certified-session.js';
import {
  assertTopologyEditOperationPlan,
} from './topology-edit-operation-plan.js';

export const TOPOLOGY_EDIT_OPERATION_CANDIDATE_SCHEMA =
  'TopologyEditOperationCandidate.v1';

export function prepareTopologyEditOperationCandidate(input = {}) {
  const session = assertSession(input.session);
  const plan = readyPlan(input.operationPlan);
  const sandbox = sandboxFromSession(session);
  const transitions = executePlanInSandbox(sandbox, plan);
  const commandIds = appendedIds(
    session.journal.activeCommandIds,
    sandbox.journal.activeCommandIds,
  );
  const authority = {
    schema: TOPOLOGY_EDIT_OPERATION_CANDIDATE_SCHEMA,
    planHash: plan.planHash,
    priorSessionVersion: session.journal.sessionVersion,
    priorJournalHash: session.journal.journalHash,
    priorCanonicalHash: session.currentTopology().canonicalTopologyHash,
    commandCount: transitions.length,
    commandIds,
    certificationHashes: transitions.map((row) => row.certification.certificationHash),
    candidateDraftHashes: transitions.map((row) => row.certification.candidate.candidateDraftHash),
    resultingSessionVersion: sandbox.journal.sessionVersion,
    resultingJournalHash: sandbox.journal.journalHash,
    resultingCanonicalHash: sandbox.currentTopology().canonicalTopologyHash,
  };
  return deepFreeze({
    ...authority,
    candidateHash: semanticHash(authority),
    canonicalTopology: sandbox.currentTopology(),
  });
}

export function assertTopologyEditOperationCandidate(value) {
  if (!isPlainRecord(value)) fail('candidate must be an object.');
  if (value.schema !== TOPOLOGY_EDIT_OPERATION_CANDIDATE_SCHEMA) {
    fail(`candidate must use ${TOPOLOGY_EDIT_OPERATION_CANDIDATE_SCHEMA}.`);
  }
  const material = authorityMaterial(value);
  if (value.candidateHash !== semanticHash(material)) {
    fail('candidateHash does not match candidate authority.', RangeError);
  }
  if (value.canonicalTopology?.canonicalTopologyHash !== value.resultingCanonicalHash) {
    fail('candidate topology differs from resultingCanonicalHash.', RangeError);
  }
  assertCommandArrays(value);
  return value;
}

export function assertCurrentTopologyEditOperationCandidate(
  candidateInput,
  sessionInput,
  planInput,
) {
  const candidate = assertTopologyEditOperationCandidate(candidateInput);
  const session = assertSession(sessionInput);
  const plan = readyPlan(planInput);
  const mismatches = [];
  if (candidate.planHash !== plan.planHash) mismatches.push('planHash');
  if (candidate.priorSessionVersion !== session.journal.sessionVersion) {
    mismatches.push('sessionVersion');
  }
  if (candidate.priorJournalHash !== session.journal.journalHash) {
    mismatches.push('journalHash');
  }
  if (candidate.priorCanonicalHash !== session.currentTopology().canonicalTopologyHash) {
    mismatches.push('canonicalHash');
  }
  if (mismatches.length) {
    fail(`candidate is stale: ${mismatches.join(', ')}.`, RangeError);
  }
  return candidate;
}

export function recreateTopologyEditOperationCandidate(
  sessionInput,
  planInput,
  expectedInput,
) {
  const expected = assertCurrentTopologyEditOperationCandidate(
    expectedInput,
    sessionInput,
    planInput,
  );
  const recreated = prepareTopologyEditOperationCandidate({
    session: sessionInput,
    operationPlan: planInput,
  });
  for (const field of [
    'candidateHash',
    'resultingSessionVersion',
    'resultingJournalHash',
    'resultingCanonicalHash',
  ]) {
    if (recreated[field] !== expected[field]) {
      fail(`candidate re-certification differs at ${field}.`, RangeError);
    }
  }
  for (const field of [
    'commandIds',
    'certificationHashes',
    'candidateDraftHashes',
  ]) {
    if (!sameList(recreated[field], expected[field])) {
      fail(`candidate re-certification differs at ${field}.`, RangeError);
    }
  }
  return recreated;
}

export function createTopologyEditOperationSandbox(sessionInput) {
  return sandboxFromSession(assertSession(sessionInput));
}

function readyPlan(value) {
  const plan = assertTopologyEditOperationPlan(value);
  if (plan.unresolvedEvidence.length) {
    fail(`operation plan remains blocked by ${plan.unresolvedEvidence[0].code}.`, RangeError);
  }
  return plan;
}

function sandboxFromSession(session) {
  const sandbox = new TopologyEditCertifiedSession(
    session.baseCanonicalTopology,
    { checkerPolicy: session.checkerPolicy },
  );
  sandbox.reloadJournal(session.serializeJournal());
  return sandbox;
}

function executePlanInSandbox(sandbox, plan) {
  return plan.commandIntents.map((intent) => {
    const transition = sandbox.execute(intent.commandType, intent.payload);
    if (transition.disposition !== 'ACCEPTED') {
      fail(
        `${intent.commandType} rejected during candidate certification: ${transition.reason || transition.disposition}.`,
        RangeError,
      );
    }
    return transition;
  });
}

function appendedIds(priorIds, nextIds) {
  if (!sameList(priorIds, nextIds.slice(0, priorIds.length))) {
    fail('candidate command history does not preserve the prior journal prefix.', RangeError);
  }
  return nextIds.slice(priorIds.length);
}

function authorityMaterial(value) {
  return {
    schema: value.schema,
    planHash: value.planHash,
    priorSessionVersion: value.priorSessionVersion,
    priorJournalHash: value.priorJournalHash,
    priorCanonicalHash: value.priorCanonicalHash,
    commandCount: value.commandCount,
    commandIds: value.commandIds,
    certificationHashes: value.certificationHashes,
    candidateDraftHashes: value.candidateDraftHashes,
    resultingSessionVersion: value.resultingSessionVersion,
    resultingJournalHash: value.resultingJournalHash,
    resultingCanonicalHash: value.resultingCanonicalHash,
  };
}

function assertCommandArrays(value) {
  const count = Number(value.commandCount);
  if (!Number.isInteger(count) || count <= 0) {
    fail('commandCount must be a positive integer.', RangeError);
  }
  for (const field of ['commandIds', 'certificationHashes', 'candidateDraftHashes']) {
    if (!Array.isArray(value[field]) || value[field].length !== count) {
      fail(`${field} must match commandCount.`, RangeError);
    }
  }
}
function assertSession(value) {
  if (!(value instanceof TopologyEditCertifiedSession)) {
    fail('session must be a TopologyEditCertifiedSession.');
  }
  value.assertUsable();
  return value;
}
function sameList(left, right) {
  return Array.isArray(left)
    && Array.isArray(right)
    && left.length === right.length
    && left.every((row, index) => row === right[index]);
}
function fail(message, Constructor = TypeError) {
  throw new Constructor(`TopologyEditOperationCandidate: ${message}`);
}
