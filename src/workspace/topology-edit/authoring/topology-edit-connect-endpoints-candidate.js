import { deepFreeze, semanticHash } from '../../../core/shared-piping-model/index.js';
import { normalizeTopologyEditCheckerPolicy } from '../topology-edit-candidate-builder.js';
import { TopologyEditCertifiedSession } from '../topology-edit-certified-session.js';
import { assertTopologyEditSpecificationCatalogue } from '../professional/topology-edit-spec-catalog.js';
import { executeTopologyEditOperationGraph } from './topology-edit-operation-graph.js';
import { createConnectEndpointsPlan } from './topology-edit-connect-endpoints-plan.js';
import { assertConnectEndpointsOperation } from './topology-edit-connect-endpoints-operation.js';

export const CONNECT_ENDPOINTS_CANDIDATE_SCHEMA = 'TopologyEditConnectEndpointsCandidate.v1';

function fail(message, Constructor = RangeError) {
  throw new Constructor(`TopologyEditConnectEndpointsCandidate: ${message}`);
}
function assertSession(value) {
  if (!(value instanceof TopologyEditCertifiedSession)) fail('session must be a TopologyEditCertifiedSession.', TypeError);
  value.assertUsable();
  return value;
}
function assertCurrentOperation(operation, session) {
  const current = createConnectEndpointsPlan({ intent: operation.parentPlan.intent, session });
  if (current.planHash !== operation.parentPlanHash) fail('connection operation is stale for current endpoint/session authority.');
}
function sandboxFromSession(session, composite) {
  const checkerPolicy = composite
    ? normalizeTopologyEditCheckerPolicy({
        ...(session.checkerPolicy ?? {}), rejectNewSeverities: [], rejectNewIssueKinds: [],
      })
    : session.checkerPolicy;
  const sandbox = new TopologyEditCertifiedSession(session.baseCanonicalTopology, { checkerPolicy });
  sandbox.reloadJournal(session.serializeJournal());
  return { sandbox, checkerPolicy };
}
function targetRevision(topology, collection, id, kind) {
  const matches = (topology[collection] ?? []).filter((row) => row.id === id);
  if (matches.length !== 1) fail(`${kind.toLowerCase()} ${id} resolved ${matches.length} records.`);
  return semanticHash({ kind, record: matches[0] });
}
function expectedRevisions(commandType, payload, topology) {
  if (commandType === 'INSERT_PIPE_SEGMENT') return {
    [payload.fromNodeId]: targetRevision(topology, 'nodes', payload.fromNodeId, 'NODE'),
    [payload.toNodeId]: targetRevision(topology, 'nodes', payload.toNodeId, 'NODE'),
  };
  if (commandType === 'ADD_BEND_DEFINITION') return Object.fromEntries([
    [payload.nodeId, targetRevision(topology, 'nodes', payload.nodeId, 'NODE')],
    ...payload.edgeIds.map((id) => [id, targetRevision(topology, 'edges', id, 'EDGE')]),
  ]);
  return undefined;
}
function addedCount(before, after, collection) {
  const prior = new Set((before[collection] ?? []).map((row) => row.id));
  return (after[collection] ?? []).filter((row) => !prior.has(row.id)).length;
}
function appendedIds(before, after) {
  if (after.length < before.length || before.some((id, index) => after[index] !== id)) {
    fail('sandbox journal does not preserve the prior active prefix.');
  }
  return after.slice(before.length);
}

export async function prepareConnectEndpointsCandidate({ operation: input, session: sessionInput, catalogue: catalogueInput } = {}) {
  const operation = assertConnectEndpointsOperation(input);
  const session = assertSession(sessionInput);
  const catalogue = assertTopologyEditSpecificationCatalogue(catalogueInput);
  assertCurrentOperation(operation, session);
  if (catalogue.catalogueHash !== operation.catalogueHash) fail('catalogue differs from connection operation authority.');
  const before = session.currentTopology();
  const { sandbox, checkerPolicy } = sandboxFromSession(session, operation.bendCount > 0);
  const transitions = [];
  const execution = await executeTopologyEditOperationGraph({
    graph: operation.graph,
    initialTopology: sandbox.currentTopology(),
    execute: ({ commandType, payload, topology }) => {
      const priorTopology = sandbox.currentTopology();
      const transition = sandbox.execute(commandType, payload, {
        expectedTargetRevisions: expectedRevisions(commandType, payload, topology),
      });
      if (transition.disposition !== 'ACCEPTED') {
        fail(`${commandType} rejected: ${transition.reason || transition.disposition}.`);
      }
      transitions.push(transition);
      return { commandId: transition.certification.commandId, priorTopology, topology: sandbox.currentTopology() };
    },
  });
  if (addedCount(before, execution.topology, 'nodes') !== operation.newNodeCount
    || addedCount(before, execution.topology, 'edges') !== operation.segmentCount
    || addedCount(before, execution.topology, 'bends') !== operation.bendCount) {
    fail('connection candidate generated an unexpected topology shape.');
  }
  const commandIds = appendedIds(session.journal.activeCommandIds, sandbox.journal.activeCommandIds);
  if (commandIds.length !== operation.expectedCommandCount || transitions.length !== operation.expectedCommandCount) {
    fail('connection candidate generated an unexpected command count.');
  }
  const serializedJournal = sandbox.serializeJournal();
  const materializedCommands = execution.receipts.map((receipt, index) => ({
    ...receipt,
    requestHash: transitions[index].certification.receipt.requestHash,
    resolutionHash: transitions[index].certification.receipt.resolutionHash,
    certificationHash: transitions[index].certification.certificationHash,
    candidateDraftHash: transitions[index].certification.candidate.candidateDraftHash,
  }));
  const authority = {
    schema: CONNECT_ENDPOINTS_CANDIDATE_SCHEMA,
    operationHash: operation.operationHash,
    parentPlanHash: operation.parentPlanHash,
    alternativeHash: operation.alternativeHash,
    graphHash: operation.graphHash,
    graphExecutionHash: execution.executionHash,
    catalogueHash: catalogue.catalogueHash,
    certificationMode: operation.bendCount ? 'FINAL_STATE_COMPOSITE' : 'SEQUENTIAL',
    checkerPolicyHash: checkerPolicy?.policyHash ?? null,
    segmentCount: operation.segmentCount,
    newNodeCount: operation.newNodeCount,
    bendCount: operation.bendCount,
    commandCount: operation.expectedCommandCount,
    priorSessionVersion: session.journal.sessionVersion,
    priorJournalHash: session.journal.journalHash,
    priorCanonicalHash: before.canonicalTopologyHash,
    commandIds,
    requestHashes: transitions.map((row) => row.certification.receipt.requestHash),
    resolutionHashes: transitions.map((row) => row.certification.receipt.resolutionHash),
    certificationHashes: transitions.map((row) => row.certification.certificationHash),
    candidateDraftHashes: transitions.map((row) => row.certification.candidate.candidateDraftHash),
    resultingSessionVersion: sandbox.journal.sessionVersion,
    resultingJournalHash: sandbox.journal.journalHash,
    resultingCanonicalHash: sandbox.currentTopology().canonicalTopologyHash,
    serializedJournalHash: semanticHash(serializedJournal),
    materializedCommandHash: semanticHash(materializedCommands),
    operationBindingsHash: semanticHash(execution.bindings),
  };
  return deepFreeze({ ...authority, candidateHash: semanticHash(authority),
    canonicalTopology: sandbox.currentTopology(), serializedJournal, materializedCommands,
    operationBindings: execution.bindings });
}

export function assertConnectEndpointsCandidate(value) {
  if (value?.schema !== CONNECT_ENDPOINTS_CANDIDATE_SCHEMA) fail(`candidate must use ${CONNECT_ENDPOINTS_CANDIDATE_SCHEMA}.`, TypeError);
  const authority = { ...value };
  for (const key of ['candidateHash', 'canonicalTopology', 'serializedJournal', 'materializedCommands', 'operationBindings']) delete authority[key];
  const arrays = [value.commandIds, value.requestHashes, value.resolutionHashes,
    value.certificationHashes, value.candidateDraftHashes];
  if (semanticHash(authority) !== value.candidateHash
    || value.canonicalTopology?.canonicalTopologyHash !== value.resultingCanonicalHash
    || semanticHash(value.serializedJournal) !== value.serializedJournalHash
    || semanticHash(value.materializedCommands) !== value.materializedCommandHash
    || semanticHash(value.operationBindings) !== value.operationBindingsHash
    || value.commandCount !== value.segmentCount + value.newNodeCount + value.bendCount
    || arrays.some((rows) => rows?.length !== value.commandCount)) {
    fail('connection candidate differs from immutable authority.');
  }
  return value;
}

export async function recreateConnectEndpointsCandidate(input = {}) {
  const expected = assertConnectEndpointsCandidate(input.candidate);
  const recreated = await prepareConnectEndpointsCandidate(input);
  for (const field of ['candidateHash', 'graphExecutionHash', 'resultingSessionVersion',
    'resultingJournalHash', 'resultingCanonicalHash', 'serializedJournalHash',
    'materializedCommandHash', 'operationBindingsHash']) {
    if (recreated[field] !== expected[field]) fail(`candidate recreation differs at ${field}.`);
  }
  return recreated;
}
