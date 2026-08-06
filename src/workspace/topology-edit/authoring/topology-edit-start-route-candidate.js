import { deepFreeze, semanticHash } from '../../../core/shared-piping-model/index.js';
import { TopologyEditCertifiedSession } from '../topology-edit-certified-session.js';
import { assertTopologyEditSpecificationCatalogue } from '../professional/topology-edit-spec-catalog.js';
import { executeTopologyEditOperationGraph } from './topology-edit-operation-graph.js';
import { assertStartRoutePlan } from './topology-edit-start-route-plan.js';

export const START_ROUTE_CANDIDATE_SCHEMA = 'TopologyEditStartRouteCandidate.v2';

function fail(message, Constructor = RangeError) {
  throw new Constructor(`TopologyEditStartRouteCandidate: ${message}`);
}
function assertSession(value) {
  if (!(value instanceof TopologyEditCertifiedSession)) {
    fail('session must be a TopologyEditCertifiedSession.', TypeError);
  }
  value.assertUsable();
  return value;
}
function assertCurrentBasis(plan, session, catalogue) {
  const mismatches = [];
  if (session.baseAuthority.datasetId !== plan.basis.datasetId) mismatches.push('datasetId');
  if (session.baseAuthority.datasetVersion !== plan.basis.datasetVersion) mismatches.push('datasetVersion');
  if (session.baseAuthority.sourceHash !== plan.basis.sourceHash) mismatches.push('sourceHash');
  if (session.baseAuthority.baseCanonicalHash !== plan.basis.baseCanonicalHash) {
    mismatches.push('baseCanonicalHash');
  }
  if (session.currentTopology().canonicalTopologyHash !== plan.basis.priorCanonicalHash) {
    mismatches.push('priorCanonicalHash');
  }
  if (session.journal.journalHash !== plan.basis.priorJournalHash) mismatches.push('journalHash');
  if (session.journal.sessionVersion !== plan.basis.sessionVersion) mismatches.push('sessionVersion');
  if (catalogue.catalogueHash !== plan.basis.catalogueHash) mismatches.push('catalogueHash');
  if (mismatches.length) fail(`Start Route plan is stale: ${mismatches.join(', ')}.`);
}
function sandboxFromSession(session) {
  const sandbox = new TopologyEditCertifiedSession(
    session.baseCanonicalTopology,
    { checkerPolicy: session.checkerPolicy },
  );
  sandbox.reloadJournal(session.serializeJournal());
  return sandbox;
}
function nodeRevision(topology, id) {
  const matches = (topology.nodes ?? []).filter((row) => row.id === id);
  if (matches.length !== 1) fail(`node ${id} resolved ${matches.length} records.`);
  return semanticHash({ kind: 'NODE', record: matches[0] });
}
function addedCount(before, after, collection) {
  const prior = new Set((before[collection] ?? []).map((row) => row.id));
  return (after[collection] ?? []).filter((row) => !prior.has(row.id)).length;
}

export async function prepareStartRouteCandidate({
  plan: input,
  session: sessionInput,
  catalogue: catalogueInput,
} = {}) {
  const plan = assertStartRoutePlan(input);
  const session = assertSession(sessionInput);
  const catalogue = assertTopologyEditSpecificationCatalogue(catalogueInput);
  assertCurrentBasis(plan, session, catalogue);
  const sandbox = sandboxFromSession(session);
  const transitions = [];
  const execution = await executeTopologyEditOperationGraph({
    graph: plan.graph,
    initialTopology: sandbox.currentTopology(),
    execute: ({ commandType, payload, topology }) => {
      const options = commandType === 'INSERT_PIPE_SEGMENT'
        ? {
            expectedTargetRevisions: {
              [payload.fromNodeId]: nodeRevision(topology, payload.fromNodeId),
              [payload.toNodeId]: nodeRevision(topology, payload.toNodeId),
            },
          }
        : {};
      const priorTopology = sandbox.currentTopology();
      const transition = sandbox.execute(commandType, payload, options);
      if (transition.disposition !== 'ACCEPTED') {
        fail(`${commandType} rejected: ${transition.reason || transition.disposition}.`);
      }
      transitions.push(transition);
      return {
        commandId: transition.certification.commandId,
        priorTopology,
        topology: sandbox.currentTopology(),
      };
    },
  });
  if (addedCount(session.currentTopology(), execution.topology, 'nodes') !== 2
    || addedCount(session.currentTopology(), execution.topology, 'edges') !== 1) {
    fail('Start Route candidate must add exactly two nodes and one edge.');
  }
  const commandIds = sandbox.journal.activeCommandIds.slice(
    session.journal.activeCommandIds.length,
  );
  const serializedJournal = sandbox.serializeJournal();
  const materializedCommands = execution.receipts.map((receipt, index) => ({
    ...receipt,
    requestHash: transitions[index].certification.receipt.requestHash,
    resolutionHash: transitions[index].certification.receipt.resolutionHash,
    certificationHash: transitions[index].certification.certificationHash,
    candidateDraftHash: transitions[index].certification.candidate.candidateDraftHash,
  }));
  const authority = {
    schema: START_ROUTE_CANDIDATE_SCHEMA,
    planHash: plan.planHash,
    graphHash: plan.graphHash,
    graphExecutionHash: execution.executionHash,
    catalogueHash: catalogue.catalogueHash,
    priorSessionVersion: session.journal.sessionVersion,
    priorJournalHash: session.journal.journalHash,
    priorCanonicalHash: session.currentTopology().canonicalTopologyHash,
    commandIds,
    requestHashes: transitions.map((row) => row.certification.receipt.requestHash),
    resolutionHashes: transitions.map((row) => row.certification.receipt.resolutionHash),
    certificationHashes: transitions.map((row) => row.certification.certificationHash),
    candidateDraftHashes: transitions.map((row) => (
      row.certification.candidate.candidateDraftHash
    )),
    resultingSessionVersion: sandbox.journal.sessionVersion,
    resultingJournalHash: sandbox.journal.journalHash,
    resultingCanonicalHash: sandbox.currentTopology().canonicalTopologyHash,
    serializedJournalHash: semanticHash(serializedJournal),
    materializedCommandHash: semanticHash(materializedCommands),
    operationBindingsHash: semanticHash(execution.bindings),
  };
  return deepFreeze({
    ...authority,
    candidateHash: semanticHash(authority),
    canonicalTopology: sandbox.currentTopology(),
    serializedJournal,
    materializedCommands,
    operationBindings: execution.bindings,
  });
}

export function assertStartRouteCandidate(value) {
  if (value?.schema !== START_ROUTE_CANDIDATE_SCHEMA) {
    fail(`candidate must use ${START_ROUTE_CANDIDATE_SCHEMA}.`, TypeError);
  }
  const authority = { ...value };
  delete authority.candidateHash;
  delete authority.canonicalTopology;
  delete authority.serializedJournal;
  delete authority.materializedCommands;
  delete authority.operationBindings;
  if (semanticHash(authority) !== value.candidateHash
    || value.canonicalTopology?.canonicalTopologyHash !== value.resultingCanonicalHash
    || semanticHash(value.serializedJournal) !== value.serializedJournalHash
    || semanticHash(value.materializedCommands) !== value.materializedCommandHash
    || semanticHash(value.operationBindings) !== value.operationBindingsHash) {
    fail('candidate payload differs from immutable authority.');
  }
  if (value.commandIds.length !== 3
    || value.requestHashes.length !== 3
    || value.resolutionHashes.length !== 3
    || value.certificationHashes.length !== 3
    || value.candidateDraftHashes.length !== 3) {
    fail('Start Route candidate must contain exactly three certified commands.');
  }
  return value;
}

export async function recreateStartRouteCandidate(input = {}) {
  const expected = assertStartRouteCandidate(input.candidate);
  const recreated = await prepareStartRouteCandidate(input);
  for (const field of [
    'candidateHash', 'graphExecutionHash', 'resultingSessionVersion',
    'resultingJournalHash', 'resultingCanonicalHash', 'serializedJournalHash',
    'materializedCommandHash', 'operationBindingsHash',
  ]) {
    if (recreated[field] !== expected[field]) {
      fail(`candidate recreation differs at ${field}.`);
    }
  }
  return recreated;
}
