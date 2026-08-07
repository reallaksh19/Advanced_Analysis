import { deepFreeze, semanticHash } from '../../../core/shared-piping-model/index.js';
import { TopologyEditCertifiedSession } from '../topology-edit-certified-session.js';
import { normalizeTopologyEditCheckerPolicy } from '../topology-edit-candidate-builder.js';
import { assertTopologyEditSpecificationCatalogue } from '../professional/topology-edit-spec-catalog.js';
import { executeTopologyEditOperationGraph } from './topology-edit-operation-graph.js';
import { assertContinueRoutePlan, CONTINUE_ROUTE_PLAN_SCHEMA } from './topology-edit-continue-route-plan.js';
import {
  assertContinueRouteFittedPlan,
  CONTINUE_ROUTE_FITTED_PLAN_SCHEMA,
} from './topology-edit-continue-route-fitted-plan.js';

export const CONTINUE_ROUTE_CANDIDATE_SCHEMA = 'TopologyEditContinueRouteCandidate.v2';

function fail(message, Constructor = RangeError) {
  throw new Constructor(`TopologyEditContinueRouteCandidate: ${message}`);
}
function executablePlan(value) {
  if (value?.schema === CONTINUE_ROUTE_FITTED_PLAN_SCHEMA) return assertContinueRouteFittedPlan(value);
  if (value?.schema === CONTINUE_ROUTE_PLAN_SCHEMA) {
    const plan = assertContinueRoutePlan(value);
    if (plan.requiresAutoFitting) {
      fail('route contains direction changes; governed automatic fitting insertion is required before Apply.');
    }
    return plan;
  }
  fail('plan is not a Continue Route raw or fitted plan.', TypeError);
}
function assertSession(value) {
  if (!(value instanceof TopologyEditCertifiedSession)) fail('session must be a TopologyEditCertifiedSession.', TypeError);
  value.assertUsable();
  return value;
}
function bendCount(plan) { return Number(plan.bendCount ?? 0); }
function assertCurrentBasis(plan, session, catalogue) {
  const mismatches = [];
  const topology = session.currentTopology();
  if (session.baseAuthority.datasetId !== plan.basis.datasetId) mismatches.push('datasetId');
  if (session.baseAuthority.datasetVersion !== plan.basis.datasetVersion) mismatches.push('datasetVersion');
  if (session.baseAuthority.sourceHash !== plan.basis.sourceHash) mismatches.push('sourceHash');
  if (session.baseAuthority.baseCanonicalHash !== plan.basis.baseCanonicalHash) mismatches.push('baseCanonicalHash');
  if (topology.canonicalTopologyHash !== plan.basis.priorCanonicalHash) mismatches.push('priorCanonicalHash');
  if (session.journal.journalHash !== plan.basis.priorJournalHash) mismatches.push('journalHash');
  if (session.journal.sessionVersion !== plan.basis.sessionVersion) mismatches.push('sessionVersion');
  if (catalogue.catalogueHash !== plan.basis.catalogueHash) mismatches.push('catalogueHash');
  const node = (topology.nodes ?? []).find((row) => row.id === plan.basis.startNodeId);
  if (!node || semanticHash({ kind: 'NODE', record: node }) !== plan.basis.startNodeRevision) mismatches.push('startNodeRevision');
  if (mismatches.length) fail(`Continue Route plan is stale: ${mismatches.join(', ')}.`);
}
function sandboxFromSession(session, composite) {
  const checkerPolicy = composite
    ? normalizeTopologyEditCheckerPolicy({
        ...(session.checkerPolicy ?? {}),
        rejectNewSeverities: [],
        rejectNewIssueKinds: [],
      })
    : session.checkerPolicy;
  const sandbox = new TopologyEditCertifiedSession(session.baseCanonicalTopology, { checkerPolicy });
  sandbox.reloadJournal(session.serializeJournal());
  return sandbox;
}
function targetRevision(topology, collection, id, kind) {
  const matches = (topology[collection] ?? []).filter((row) => row.id === id);
  if (matches.length !== 1) fail(`${kind.toLowerCase()} ${id} resolved ${matches.length} records.`);
  return semanticHash({ kind, record: matches[0] });
}
function expectedRevisions(commandType, payload, topology) {
  if (commandType === 'INSERT_PIPE_SEGMENT') {
    return {
      [payload.fromNodeId]: targetRevision(topology, 'nodes', payload.fromNodeId, 'NODE'),
      [payload.toNodeId]: targetRevision(topology, 'nodes', payload.toNodeId, 'NODE'),
    };
  }
  if (commandType === 'ADD_BEND_DEFINITION') {
    return Object.fromEntries([
      [payload.nodeId, targetRevision(topology, 'nodes', payload.nodeId, 'NODE')],
      ...payload.edgeIds.map((id) => [id, targetRevision(topology, 'edges', id, 'EDGE')]),
    ]);
  }
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

export async function prepareContinueRouteCandidate({ plan: input, session: sessionInput, catalogue: catalogueInput } = {}) {
  const plan = executablePlan(input);
  const session = assertSession(sessionInput);
  const catalogue = assertTopologyEditSpecificationCatalogue(catalogueInput);
  assertCurrentBasis(plan, session, catalogue);
  const bends = bendCount(plan);
  const sandbox = sandboxFromSession(session, bends > 0);
  const transitions = [];
  const execution = await executeTopologyEditOperationGraph({
    graph: plan.graph,
    initialTopology: sandbox.currentTopology(),
    execute: ({ commandType, payload, topology }) => {
      const expectedTargetRevisions = expectedRevisions(commandType, payload, topology);
      const priorTopology = sandbox.currentTopology();
      const transition = sandbox.execute(commandType, payload, { expectedTargetRevisions });
      if (transition.disposition !== 'ACCEPTED') {
        fail(`${commandType} rejected: ${transition.reason || transition.disposition}.`);
      }
      transitions.push(transition);
      return { commandId: transition.certification.commandId, priorTopology, topology: sandbox.currentTopology() };
    },
  });
  const before = session.currentTopology();
  if (addedCount(before, execution.topology, 'nodes') !== plan.nodeCount
    || addedCount(before, execution.topology, 'edges') !== plan.segmentCount
    || addedCount(before, execution.topology, 'bends') !== bends) {
    fail('Continue Route candidate generated an unexpected topology shape.');
  }
  const commandIds = appendedIds(session.journal.activeCommandIds, sandbox.journal.activeCommandIds);
  if (commandIds.length !== plan.expectedCommandCount || transitions.length !== plan.expectedCommandCount) {
    fail('Continue Route candidate generated an unexpected command count.');
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
    schema: CONTINUE_ROUTE_CANDIDATE_SCHEMA,
    planHash: plan.planHash,
    graphHash: plan.graphHash,
    graphExecutionHash: execution.executionHash,
    catalogueHash: catalogue.catalogueHash,
    certificationMode: bends ? 'FINAL_STATE_COMPOSITE' : 'SEQUENTIAL',
    segmentCount: plan.segmentCount,
    nodeCount: plan.nodeCount,
    bendCount: bends,
    commandCount: plan.expectedCommandCount,
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
  return deepFreeze({
    ...authority,
    candidateHash: semanticHash(authority),
    canonicalTopology: sandbox.currentTopology(),
    serializedJournal,
    materializedCommands,
    operationBindings: execution.bindings,
  });
}

export function assertContinueRouteCandidate(value) {
  if (value?.schema !== CONTINUE_ROUTE_CANDIDATE_SCHEMA) fail(`candidate must use ${CONTINUE_ROUTE_CANDIDATE_SCHEMA}.`, TypeError);
  const authority = { ...value };
  for (const key of ['candidateHash', 'canonicalTopology', 'serializedJournal', 'materializedCommands', 'operationBindings']) delete authority[key];
  const arrays = [value.commandIds, value.requestHashes, value.resolutionHashes, value.certificationHashes, value.candidateDraftHashes];
  if (semanticHash(authority) !== value.candidateHash
    || value.canonicalTopology?.canonicalTopologyHash !== value.resultingCanonicalHash
    || semanticHash(value.serializedJournal) !== value.serializedJournalHash
    || semanticHash(value.materializedCommands) !== value.materializedCommandHash
    || semanticHash(value.operationBindings) !== value.operationBindingsHash
    || value.commandCount !== value.segmentCount * 2 + value.bendCount
    || value.nodeCount !== value.segmentCount
    || arrays.some((rows) => rows?.length !== value.commandCount)) {
    fail('candidate payload differs from immutable authority.');
  }
  return value;
}

export async function recreateContinueRouteCandidate(input = {}) {
  const expected = assertContinueRouteCandidate(input.candidate);
  const recreated = await prepareContinueRouteCandidate(input);
  for (const field of [
    'candidateHash', 'graphExecutionHash', 'resultingSessionVersion', 'resultingJournalHash',
    'resultingCanonicalHash', 'serializedJournalHash', 'materializedCommandHash', 'operationBindingsHash',
  ]) if (recreated[field] !== expected[field]) fail(`candidate recreation differs at ${field}.`);
  return recreated;
}
