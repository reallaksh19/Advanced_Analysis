import { deepFreeze, semanticHash } from '../../../core/shared-piping-model/index.js';
import { TopologyEditCertifiedSession } from '../topology-edit-certified-session.js';
import {
  assertTopologyEditOperationGraph,
  createTopologyEditOperationGraph,
  topologyEditOperationReference,
} from './topology-edit-operation-graph.js';
import { assertContinueRouteIntent } from './topology-edit-continue-route-intent.js';

export const CONTINUE_ROUTE_PLAN_SCHEMA = 'TopologyEditContinueRoutePlan.v1';
const TURN_TOLERANCE_RAD = 1e-9;

function fail(message, Constructor = TypeError) {
  throw new Constructor(`TopologyEditContinueRoutePlan: ${message}`);
}
function assertSession(value) {
  if (!(value instanceof TopologyEditCertifiedSession)) fail('session must be a TopologyEditCertifiedSession.');
  value.assertUsable();
  return value;
}
function nodeRevision(record) { return semanticHash({ kind: 'NODE', record }); }
function startNode(topology, intent) {
  const matches = (topology.nodes ?? []).filter((row) => row.id === intent.startNodeId);
  if (matches.length !== 1) fail(`start node ${intent.startNodeId} resolved ${matches.length} records.`, RangeError);
  const node = matches[0];
  if (nodeRevision(node) !== intent.startNodeRevision) fail('start node revision is stale.', RangeError);
  const degree = (topology.edges ?? []).filter((edge) => (
    edge.fromNodeId === node.id || edge.toNodeId === node.id
  )).length;
  if (degree !== 1) fail(`start node must be an open degree-one endpoint; received degree ${degree}.`, RangeError);
  return node;
}
function axisLockedEnd(start, requested, lock) {
  if (lock === 'X') return { x: requested.x, y: start.y, z: start.z };
  if (lock === 'Y') return { x: start.x, y: requested.y, z: start.z };
  if (lock === 'Z') return { x: start.x, y: start.y, z: requested.z };
  return requested;
}
function segment(start, end, index, axisLock) {
  const delta = { x: end.x - start.x, y: end.y - start.y, z: end.z - start.z };
  const lengthMm = Math.hypot(delta.x, delta.y, delta.z);
  if (!(lengthMm > 0)) fail(`route segment ${index + 1} has zero length.`, RangeError);
  const material = {
    sequence: index,
    startPointMm: start,
    endPointMm: end,
    axisLock,
    lengthMm,
    unitDirection: { x: delta.x / lengthMm, y: delta.y / lengthMm, z: delta.z / lengthMm },
  };
  return deepFreeze({ ...material, geometryHash: semanticHash(material) });
}
function turnEvidence(segments) {
  const turns = [];
  for (let index = 1; index < segments.length; index += 1) {
    const left = segments[index - 1].unitDirection;
    const right = segments[index].unitDirection;
    const dot = Math.max(-1, Math.min(1, left.x * right.x + left.y * right.y + left.z * right.z));
    const angleRad = Math.acos(dot);
    if (angleRad > TURN_TOLERANCE_RAD) {
      const material = { vertexIndex: index, angleDeg: angleRad * 180 / Math.PI, incoming: left, outgoing: right };
      turns.push(deepFreeze({ ...material, turnHash: semanticHash(material) }));
    }
  }
  return turns;
}
function routeGeometry(startPointMm, intent) {
  const segments = [];
  let prior = startPointMm;
  for (const vertex of intent.vertices) {
    const end = axisLockedEnd(prior, vertex.requestedPointMm, vertex.axisLock);
    segments.push(segment(prior, end, vertex.sequence, vertex.axisLock));
    prior = end;
  }
  const turns = turnEvidence(segments);
  const material = {
    startPointMm,
    endPointMm: segments.at(-1).endPointMm,
    segmentCount: segments.length,
    totalLengthMm: segments.reduce((sum, row) => sum + row.lengthMm, 0),
    turnCount: turns.length,
    requiresAutoFitting: turns.length > 0,
    segments,
    turns,
  };
  return deepFreeze({ ...material, geometryHash: semanticHash(material) });
}
function operationIdentity(basis, intentHash, geometryHash) {
  const digest = semanticHash({ schema: 'TopologyEditContinueRouteOperationIdentity.v1', basis, intentHash, geometryHash })
    .split(':').at(-1);
  return `continue-route:${digest}`;
}
function graphSteps(intent, operationId, geometry) {
  const steps = [];
  for (let index = 0; index < geometry.segments.length; index += 1) {
    const nodeStepId = `leg-${index + 1}-node`;
    const pipeStepId = `leg-${index + 1}-pipe`;
    const fromNodeId = index === 0
      ? intent.startNodeId
      : topologyEditOperationReference(`leg-${index}-node`, 'created-node');
    steps.push({
      stepId: nodeStepId,
      commandType: 'CREATE_NODE',
      payload: {
        position: geometry.segments[index].endPointMm,
        creationRole: `CONTINUE_ROUTE_VERTEX_${index + 1}`,
        coordinateAuthority: `DATUM:${intent.coordinateDatumHash}`,
        sourceOperationId: operationId,
      },
    });
    steps.push({
      stepId: pipeStepId,
      commandType: 'INSERT_PIPE_SEGMENT',
      payload: {
        fromNodeId,
        toNodeId: topologyEditOperationReference(nodeStepId, 'created-node'),
        catalogueBinding: intent.catalogueBinding,
        segmentPolicy: intent.segmentPolicy,
      },
    });
  }
  return steps;
}

export function createContinueRoutePlan({ intent: input, session: sessionInput } = {}) {
  const intent = assertContinueRouteIntent(input);
  const session = assertSession(sessionInput);
  const topology = session.currentTopology();
  const start = startNode(topology, intent);
  const geometry = routeGeometry(start.position, intent);
  const basis = deepFreeze({
    datasetId: session.baseAuthority.datasetId,
    datasetVersion: session.baseAuthority.datasetVersion,
    sourceHash: session.baseAuthority.sourceHash,
    baseCanonicalHash: session.baseAuthority.baseCanonicalHash,
    priorCanonicalHash: topology.canonicalTopologyHash,
    priorJournalHash: session.journal.journalHash,
    sessionVersion: session.journal.sessionVersion,
    startNodeId: intent.startNodeId,
    startNodeRevision: intent.startNodeRevision,
    catalogueHash: intent.catalogueBinding.catalogueHash,
    coordinateDatumHash: intent.coordinateDatumHash,
  });
  const operationId = operationIdentity(basis, intent.intentHash, geometry.geometryHash);
  const graph = createTopologyEditOperationGraph({
    operationId,
    basisHash: semanticHash(basis),
    steps: graphSteps(intent, operationId, geometry),
  });
  const material = {
    schema: CONTINUE_ROUTE_PLAN_SCHEMA,
    operationId,
    intentHash: intent.intentHash,
    basis,
    basisHash: graph.basisHash,
    graphHash: graph.graphHash,
    geometry,
    segmentCount: geometry.segmentCount,
    nodeCount: geometry.segmentCount,
    expectedCommandCount: geometry.segmentCount * 2,
    turnCount: geometry.turnCount,
    requiresAutoFitting: geometry.requiresAutoFitting,
    commandTypes: graph.steps.map((step) => step.commandType),
  };
  return deepFreeze({ ...material, planHash: semanticHash(material), intent, graph });
}

export function assertContinueRoutePlan(value) {
  if (value?.schema !== CONTINUE_ROUTE_PLAN_SCHEMA) fail(`plan must use ${CONTINUE_ROUTE_PLAN_SCHEMA}.`);
  const intent = assertContinueRouteIntent(value.intent);
  const graph = assertTopologyEditOperationGraph(value.graph);
  if (value.intentHash !== intent.intentHash || value.graphHash !== graph.graphHash
    || graph.basisHash !== semanticHash(value.basis) || value.basisHash !== graph.basisHash
    || value.segmentCount !== value.geometry?.segments?.length
    || value.nodeCount !== value.segmentCount || value.expectedCommandCount !== value.segmentCount * 2
    || value.turnCount !== value.geometry?.turns?.length
    || value.requiresAutoFitting !== (value.turnCount > 0)) {
    fail('plan dependencies differ from declared authority.', RangeError);
  }
  const operationId = operationIdentity(value.basis, intent.intentHash, value.geometry.geometryHash);
  if (operationId !== value.operationId || operationId !== graph.operationId) fail('operation identity mismatch.', RangeError);
  const material = { ...value };
  delete material.planHash;
  delete material.intent;
  delete material.graph;
  if (semanticHash(material) !== value.planHash) fail('plan hash mismatch.', RangeError);
  return value;
}
