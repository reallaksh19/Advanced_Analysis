import {
  deepFreeze,
  semanticHash,
} from '../../../core/shared-piping-model/index.js';
import { TopologyEditCertifiedSession } from '../topology-edit-certified-session.js';
import {
  normalizeTopologyEditCheckerPolicy,
} from '../topology-edit-candidate-builder.js';
import {
  createTopologyEditOperationGraph,
  executeTopologyEditOperationGraph,
} from './topology-edit-operation-graph.js';
import {
  assertTopologyEditOperationPlan,
} from '../professional/topology-edit-operation-plan.js';
import {
  assertTopologyEditIncrementalValidationReceipt,
} from '../professional/topology-edit-incremental-validation.js';
import {
  topologyEditDiagnosticFingerprint,
} from '../professional/topology-edit-validation-diagnostics.js';

export const TOPOLOGY_EDIT_AUTHORING_CANDIDATE_SCHEMA =
  'TopologyEditAuthoringCandidate.v1';
export const TOPOLOGY_EDIT_AUTHORING_VALIDATION_SCHEMA =
  'TopologyEditAuthoringValidationReceipt.v1';
export const TOPOLOGY_EDIT_AUTHORING_TRANSACTION_SCHEMA =
  'TopologyEditAuthoringTransactionReceipt.v1';

const FINAL_STATE_MODE = 'FINAL_STATE';

export async function prepareTopologyEditAuthoringCandidate(input = {}) {
  const session = assertSession(input.session);
  const plan = readyPlan(input.operationPlan);
  const graph = operationGraph(plan);
  const finalPolicy = normalizeTopologyEditCheckerPolicy(session.checkerPolicy ?? {});
  const composite = compositeMode(plan) === FINAL_STATE_MODE;
  const intermediatePolicy = composite
    ? normalizeTopologyEditCheckerPolicy({
      ...finalPolicy,
      rejectNewSeverities: [],
      rejectNewIssueKinds: [],
    })
    : finalPolicy;
  const sandbox = sandboxFromSession(session, intermediatePolicy);
  const transitions = [];
  const execution = await executeTopologyEditOperationGraph({
    graph,
    initialTopology: sandbox.currentTopology(),
    execute: ({ commandType, payload }) => {
      const priorTopology = sandbox.currentTopology();
      const transition = sandbox.execute(commandType, payload);
      if (transition.disposition !== 'ACCEPTED') {
        fail(
          `${commandType} rejected during authoring candidate preparation: ${
            transition.reason || transition.disposition
          }.`,
          RangeError,
        );
      }
      transitions.push(transition);
      return {
        commandId: transition.certification.commandId,
        priorTopology,
        topology: sandbox.currentTopology(),
      };
    },
  });
  const commandIds = appendedIds(
    session.journal.activeCommandIds,
    sandbox.journal.activeCommandIds,
  );
  const serializedJournal = sandbox.serializeJournal();
  const materializedCommandIntents = execution.receipts.map((row) => ({
    sequence: row.stepId,
    commandType: row.commandType,
    commandId: row.commandId,
    payload: row.payload,
    outputs: row.outputs,
    canonicalHash: row.canonicalHash,
  }));
  const changedCanonicalIds = changedIds(
    session.currentTopology(),
    sandbox.currentTopology(),
  );
  const authority = {
    schema: TOPOLOGY_EDIT_AUTHORING_CANDIDATE_SCHEMA,
    planHash: plan.planHash,
    graphHash: graph.graphHash,
    graphExecutionHash: execution.executionHash,
    certificationMode: composite ? FINAL_STATE_MODE : 'SEQUENTIAL',
    intermediateCheckerPolicyHash: intermediatePolicy.policyHash,
    finalCheckerPolicyHash: finalPolicy.policyHash,
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
    serializedJournalHash: semanticHash(serializedJournal),
    materializedCommandHash: semanticHash(materializedCommandIntents),
    operationBindingsHash: semanticHash(execution.bindings),
    changedCanonicalIds,
  };
  return deepFreeze({
    ...authority,
    candidateHash: semanticHash(authority),
    canonicalTopology: sandbox.currentTopology(),
    serializedJournal,
    materializedCommandIntents,
    operationBindings: execution.bindings,
  });
}

export function assertTopologyEditAuthoringCandidate(value) {
  if (!value || value.schema !== TOPOLOGY_EDIT_AUTHORING_CANDIDATE_SCHEMA) {
    fail(`candidate must use ${TOPOLOGY_EDIT_AUTHORING_CANDIDATE_SCHEMA}.`);
  }
  const authority = candidateAuthority(value);
  if (value.candidateHash !== semanticHash(authority)) {
    fail('candidateHash does not match candidate authority.', RangeError);
  }
  if (value.canonicalTopology?.canonicalTopologyHash !== value.resultingCanonicalHash) {
    fail('candidate topology differs from resultingCanonicalHash.', RangeError);
  }
  if (semanticHash(value.serializedJournal) !== value.serializedJournalHash) {
    fail('serialized journal differs from candidate authority.', RangeError);
  }
  if (semanticHash(value.materializedCommandIntents) !== value.materializedCommandHash) {
    fail('materialized commands differ from candidate authority.', RangeError);
  }
  if (semanticHash(value.operationBindings) !== value.operationBindingsHash) {
    fail('operation bindings differ from candidate authority.', RangeError);
  }
  assertCommandArrays(value);
  return value;
}

export function assertCurrentTopologyEditAuthoringCandidate(
  candidateInput,
  sessionInput,
  planInput,
) {
  const candidate = assertTopologyEditAuthoringCandidate(candidateInput);
  const session = assertSession(sessionInput);
  const plan = readyPlan(planInput);
  const mismatches = [];
  if (candidate.planHash !== plan.planHash) mismatches.push('planHash');
  if (candidate.priorSessionVersion !== session.journal.sessionVersion) mismatches.push('sessionVersion');
  if (candidate.priorJournalHash !== session.journal.journalHash) mismatches.push('journalHash');
  if (candidate.priorCanonicalHash !== session.currentTopology().canonicalTopologyHash) {
    mismatches.push('canonicalHash');
  }
  if (mismatches.length) fail(`candidate is stale: ${mismatches.join(', ')}.`, RangeError);
  return candidate;
}

export async function recreateTopologyEditAuthoringCandidate(
  sessionInput,
  planInput,
  expectedInput,
) {
  const expected = assertCurrentTopologyEditAuthoringCandidate(
    expectedInput,
    sessionInput,
    planInput,
  );
  const recreated = await prepareTopologyEditAuthoringCandidate({
    session: sessionInput,
    operationPlan: planInput,
  });
  for (const field of [
    'candidateHash',
    'graphExecutionHash',
    'resultingSessionVersion',
    'resultingJournalHash',
    'resultingCanonicalHash',
    'serializedJournalHash',
    'materializedCommandHash',
    'operationBindingsHash',
  ]) {
    if (recreated[field] !== expected[field]) {
      fail(`candidate re-certification differs at ${field}.`, RangeError);
    }
  }
  return recreated;
}

export function createTopologyEditAuthoringValidationReceipt(input = {}) {
  const candidate = assertTopologyEditAuthoringCandidate(input.candidate);
  const workerReceipt = assertTopologyEditIncrementalValidationReceipt(input.workerReceipt);
  if (workerReceipt.planHash !== candidate.planHash) {
    fail('worker validation planHash differs from candidate.', RangeError);
  }
  if (workerReceipt.validatedTopologyHash !== candidate.resultingCanonicalHash) {
    fail('worker validation topology differs from candidate.', RangeError);
  }
  const blockingDiagnostics = globalBlockingDiagnostics(workerReceipt);
  const authority = {
    schema: TOPOLOGY_EDIT_AUTHORING_VALIDATION_SCHEMA,
    candidateHash: candidate.candidateHash,
    planHash: candidate.planHash,
    validatedTopologyHash: candidate.resultingCanonicalHash,
    workerValidationHash: workerReceipt.validationHash,
    baselineIssueHash: workerReceipt.baseline.issueHash,
    finalIssueHash: workerReceipt.finalIssueHash,
    finalIssueCount: workerReceipt.finalIssueCount,
    blockingIssueCount: blockingDiagnostics.length,
    blockingDiagnosticHash: semanticHash(blockingDiagnostics),
    status: blockingDiagnostics.length ? 'BLOCKED' : 'READY_TO_APPLY',
  };
  return deepFreeze({
    ...authority,
    validationHash: semanticHash(authority),
    blockingDiagnostics,
    finalDiagnostics: workerReceipt.finalDiagnostics,
    workerReceipt,
  });
}

export function assertTopologyEditAuthoringValidationReceipt(value) {
  if (!value || value.schema !== TOPOLOGY_EDIT_AUTHORING_VALIDATION_SCHEMA) {
    fail(`validation must use ${TOPOLOGY_EDIT_AUTHORING_VALIDATION_SCHEMA}.`);
  }
  const authority = validationAuthority(value);
  if (value.validationHash !== semanticHash(authority)) {
    fail('validationHash does not match validation authority.', RangeError);
  }
  if (semanticHash(value.blockingDiagnostics) !== value.blockingDiagnosticHash) {
    fail('blocking diagnostics differ from validation authority.', RangeError);
  }
  assertTopologyEditIncrementalValidationReceipt(value.workerReceipt);
  return value;
}

export async function executeTopologyEditAuthoringTransaction(input = {}) {
  const session = assertSession(input.session);
  const plan = readyPlan(input.operationPlan);
  const expected = assertCurrentTopologyEditAuthoringCandidate(
    input.candidate,
    session,
    plan,
  );
  const validation = assertTopologyEditAuthoringValidationReceipt(input.validationReceipt);
  if (validation.candidateHash !== expected.candidateHash) {
    fail('validation candidateHash differs from candidate.', RangeError);
  }
  if (validation.status !== 'READY_TO_APPLY' || validation.blockingIssueCount !== 0) {
    fail('authoring validation contains blocking diagnostics.', RangeError);
  }
  const candidate = await recreateTopologyEditAuthoringCandidate(session, plan, expected);
  const prior = session.snapshot();
  session.reloadJournal(candidate.serializedJournal);
  if (session.journal.journalHash !== candidate.resultingJournalHash
    || session.currentTopology().canonicalTopologyHash !== candidate.resultingCanonicalHash) {
    fail('applied journal differs from certified candidate.', RangeError);
  }
  const authority = {
    schema: TOPOLOGY_EDIT_AUTHORING_TRANSACTION_SCHEMA,
    candidateHash: candidate.candidateHash,
    planHash: plan.planHash,
    validationHash: validation.validationHash,
    certificationMode: candidate.certificationMode,
    priorSessionVersion: prior.sessionVersion,
    priorJournalHash: prior.journalHash,
    priorCanonicalHash: prior.activeCanonicalTopologyHash,
    commandCount: candidate.commandCount,
    commandIds: candidate.commandIds,
    certificationHashes: candidate.certificationHashes,
    candidateDraftHashes: candidate.candidateDraftHashes,
    resultingSessionVersion: session.journal.sessionVersion,
    resultingJournalHash: session.journal.journalHash,
    resultingCanonicalHash: session.currentTopology().canonicalTopologyHash,
  };
  return deepFreeze({ ...authority, transactionHash: semanticHash(authority) });
}

export function assertTopologyEditAuthoringTransactionReceipt(value) {
  if (!value || value.schema !== TOPOLOGY_EDIT_AUTHORING_TRANSACTION_SCHEMA) {
    fail(`transaction must use ${TOPOLOGY_EDIT_AUTHORING_TRANSACTION_SCHEMA}.`);
  }
  const authority = { ...value };
  delete authority.transactionHash;
  if (value.transactionHash !== semanticHash(authority)) {
    fail('transactionHash does not match transaction authority.', RangeError);
  }
  assertCommandArrays(value);
  return value;
}

export function undoTopologyEditAuthoringTransaction(sessionInput, receiptInput) {
  const session = assertSession(sessionInput);
  const receipt = assertTopologyEditAuthoringTransactionReceipt(receiptInput);
  if (session.currentTopology().canonicalTopologyHash !== receipt.resultingCanonicalHash) {
    fail('transaction is not the current canonical suffix.', RangeError);
  }
  assertCommandSuffix(session.journal.activeCommandIds, receipt.commandIds);
  for (let index = 0; index < receipt.commandCount; index += 1) session.undo();
  if (session.currentTopology().canonicalTopologyHash !== receipt.priorCanonicalHash) {
    fail('transaction undo did not restore the exact prior canonical hash.', RangeError);
  }
  return session.snapshot();
}

export function redoTopologyEditAuthoringTransaction(sessionInput, receiptInput) {
  const session = assertSession(sessionInput);
  const receipt = assertTopologyEditAuthoringTransactionReceipt(receiptInput);
  if (session.currentTopology().canonicalTopologyHash !== receipt.priorCanonicalHash) {
    fail('transaction prior canonical hash is not current.', RangeError);
  }
  const redoIds = session.journal.redoCommandIds.slice(-receipt.commandCount).reverse();
  if (!sameList(redoIds, receipt.commandIds)) {
    fail('transaction commands are not the exact redo suffix.', RangeError);
  }
  for (let index = 0; index < receipt.commandCount; index += 1) session.redo();
  if (session.currentTopology().canonicalTopologyHash !== receipt.resultingCanonicalHash) {
    fail('transaction redo did not reproduce the exact resulting canonical hash.', RangeError);
  }
  return session.snapshot();
}

export function topologyEditAuthoringCandidateChangedIds(candidateInput) {
  return [...assertTopologyEditAuthoringCandidate(candidateInput).changedCanonicalIds];
}

function operationGraph(plan) {
  return createTopologyEditOperationGraph({
    operationId: `authoring:${plan.planHash}`,
    basisHash: plan.basisHash,
    steps: plan.commandIntents.map((intent, index) => ({
      stepId: `step-${index + 1}`,
      commandType: intent.commandType,
      payload: intent.payload,
    })),
  });
}
function compositeMode(plan) {
  return String(plan.parameters?.compositeCertification?.mode ?? 'SEQUENTIAL').trim().toUpperCase();
}
function sandboxFromSession(session, checkerPolicy) {
  const sandbox = new TopologyEditCertifiedSession(
    session.baseCanonicalTopology,
    { checkerPolicy },
  );
  sandbox.reloadJournal(session.serializeJournal());
  return sandbox;
}
function globalBlockingDiagnostics(receipt) {
  const inherited = new Set((receipt.baselineDiagnostics ?? []).map((row) => (
    topologyEditDiagnosticFingerprint(row)
  )));
  return deepFreeze((receipt.finalDiagnostics ?? []).filter((row) => (
    String(row?.severity ?? '').toUpperCase() === 'HIGH'
    && !inherited.has(topologyEditDiagnosticFingerprint(row))
  )));
}
function changedIds(before, after) {
  const result = new Set();
  for (const collection of [
    'nodes', 'edges', 'junctions', 'supports', 'boundaries', 'rigids', 'bends',
  ]) {
    const previous = new Map((before?.[collection] ?? []).map((row) => [row.id, row]));
    const next = new Map((after?.[collection] ?? []).map((row) => [row.id, row]));
    for (const [id, row] of next) {
      if (!previous.has(id) || semanticHash(previous.get(id)) !== semanticHash(row)) result.add(id);
    }
    for (const id of previous.keys()) if (!next.has(id)) result.add(id);
  }
  const changedNodes = new Set([...result].filter((id) => id.startsWith('node:')));
  for (const edge of after?.edges ?? []) {
    if (changedNodes.has(edge.fromNodeId) || changedNodes.has(edge.toNodeId)) result.add(edge.id);
  }
  return [...result].sort((left, right) => left.localeCompare(right));
}
function candidateAuthority(value) {
  return {
    schema: value.schema,
    planHash: value.planHash,
    graphHash: value.graphHash,
    graphExecutionHash: value.graphExecutionHash,
    certificationMode: value.certificationMode,
    intermediateCheckerPolicyHash: value.intermediateCheckerPolicyHash,
    finalCheckerPolicyHash: value.finalCheckerPolicyHash,
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
    serializedJournalHash: value.serializedJournalHash,
    materializedCommandHash: value.materializedCommandHash,
    operationBindingsHash: value.operationBindingsHash,
    changedCanonicalIds: value.changedCanonicalIds,
  };
}
function validationAuthority(value) {
  return {
    schema: value.schema,
    candidateHash: value.candidateHash,
    planHash: value.planHash,
    validatedTopologyHash: value.validatedTopologyHash,
    workerValidationHash: value.workerValidationHash,
    baselineIssueHash: value.baselineIssueHash,
    finalIssueHash: value.finalIssueHash,
    finalIssueCount: value.finalIssueCount,
    blockingIssueCount: value.blockingIssueCount,
    blockingDiagnosticHash: value.blockingDiagnosticHash,
    status: value.status,
  };
}
function readyPlan(value) {
  const plan = assertTopologyEditOperationPlan(value);
  if (plan.unresolvedEvidence.length) {
    fail(`operation plan remains blocked by ${plan.unresolvedEvidence[0].code}.`, RangeError);
  }
  return plan;
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
function assertCommandSuffix(activeIds, commandIds) {
  if (!sameList(activeIds.slice(-commandIds.length), commandIds)) {
    fail('transaction command IDs are not the exact active journal suffix.', RangeError);
  }
}
function appendedIds(priorIds, nextIds) {
  if (!sameList(priorIds, nextIds.slice(0, priorIds.length))) {
    fail('candidate command history does not preserve the prior journal prefix.', RangeError);
  }
  return nextIds.slice(priorIds.length);
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
  throw new Constructor(`TopologyEditAuthoringCompositeOperation: ${message}`);
}
