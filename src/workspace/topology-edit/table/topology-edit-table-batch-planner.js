import { deepFreeze, semanticHash } from '../../../core/shared-piping-model/index.js';
import { assertCanonicalTopologyHash } from '../topology-edit-canonical-state.js';
import { createTopologyEditChangedScope } from '../professional/topology-edit-change-scope.js';
import { createTopologyEditOperationPlan } from '../professional/topology-edit-operation-plan.js';
import { planMoveConnectedRun } from '../professional/topology-edit-route-operations.js';
import { assertTopologyEditTableBatch } from './topology-edit-table-batch.js';
import {
  compileTopologyEditTableEngineeringIntent,
} from './topology-edit-table-engineering-planner.js';
import { assertTopologyEditTableProjection } from './topology-edit-table-projection.js';

export const TOPOLOGY_EDIT_TABLE_BATCH_PLAN_SCHEMA = 'TopologyEditTableBatchPlan.v1';
const EPSILON_MM = 1e-9;

export function planTopologyEditTableBatch({
  batch: batchInput,
  projection: projectionInput,
  canonicalTopology,
} = {}) {
  const batch = assertTopologyEditTableBatch(batchInput);
  const projection = assertTopologyEditTableProjection(projectionInput);
  const topology = assertCanonicalTopologyHash(canonicalTopology);
  assertBasis(batch, projection, topology);
  const childPlans = batch.intents.map((intent) => compileIntent(intent, topology));
  const engineering = batch.intents.some((intent) => intent.intentKind !== 'PIPE_LENGTH');
  if (!engineering) assertNonOverlappingMoves(childPlans);
  const changedScope = combineChangedScopes(childPlans, topology.canonicalTopologyHash);
  const targetIds = uniqueSorted([
    ...batch.intents.map((intent) => intent.target.canonicalId),
    ...childPlans.flatMap((plan) => plan.targetIds),
  ]);
  const commandIntents = engineering
    ? materializeCompositeEngineeringCommands(childPlans, topology)
    : childPlans.flatMap((plan) => plan.commandIntents);
  const unresolvedEvidence = childPlans.flatMap((plan) => plan.unresolvedEvidence ?? []);
  const operationPlan = createTopologyEditOperationPlan({
    operationType: engineering ? 'COMPOSITE_ENGINEERING_EDIT' : 'MOVE_CONNECTED_RUN',
    basisHash: topology.canonicalTopologyHash,
    targetIds,
    parameters: {
      aggregateKind: engineering ? 'TABLE_ENGINEERING_BATCH' : 'TABLE_PIPE_LENGTH_BATCH',
      tableBatchHash: batch.batchHash,
      childPlanHashes: childPlans.map((plan) => plan.planHash),
      compositeCertification: { mode: 'FINAL_STATE' },
    },
    commandIntents,
    changedScope,
    unresolvedEvidence,
  });
  const dependencyRevisions = revisionMap(
    topology,
    uniqueSorted([
      ...targetIds,
      ...changedScope.validationNeighbourhoodIds,
    ]),
  );
  const material = {
    schema: TOPOLOGY_EDIT_TABLE_BATCH_PLAN_SCHEMA,
    batchHash: batch.batchHash,
    basisHash: topology.canonicalTopologyHash,
    projectionHash: projection.projectionHash,
    childPlanHashes: childPlans.map((plan) => plan.planHash),
    dependencyRevisions,
    dependencyHash: semanticHash(dependencyRevisions),
    operationPlanHash: operationPlan.planHash,
  };
  return deepFreeze({
    ...material,
    planHash: semanticHash(material),
    childPlans,
    operationPlan,
  });
}

export function assertTopologyEditTableBatchPlan(value) {
  if (value?.schema !== TOPOLOGY_EDIT_TABLE_BATCH_PLAN_SCHEMA
    || !value.operationPlan || !Array.isArray(value.childPlans)) {
    throw new TypeError(`Table batch plan must use ${TOPOLOGY_EDIT_TABLE_BATCH_PLAN_SCHEMA}.`);
  }
  if (semanticHash(value.dependencyRevisions) !== value.dependencyHash
    || value.operationPlan.planHash !== value.operationPlanHash) {
    throw new Error('TopologyEditTableBatchPlanner: dependency or operation-plan hash mismatch.');
  }
  const material = { ...value };
  delete material.planHash;
  delete material.childPlans;
  delete material.operationPlan;
  if (semanticHash(material) !== value.planHash) {
    throw new Error('TopologyEditTableBatchPlanner: plan hash mismatch.');
  }
  return value;
}

function compileIntent(intent, topology) {
  if (intent.intentKind === 'PIPE_LENGTH') return compilePipeLength(intent, topology);
  return compileTopologyEditTableEngineeringIntent(intent, topology);
}

function compilePipeLength(intent, topology) {
  const edge = exact(topology.edges, intent.target.canonicalId, 'edge');
  if (String(edge.entityType ?? '').toUpperCase() !== 'PIPE') {
    throw new RangeError(`TopologyEditTableBatchPlanner: ${edge.id} is not a PIPE edge.`);
  }
  const from = exact(topology.nodes, edge.fromNodeId, 'FROM node');
  const to = exact(topology.nodes, edge.toNodeId, 'TO node');
  const axis = subtract(to.position, from.position);
  const currentLengthMm = magnitude(axis);
  if (!(currentLengthMm > EPSILON_MM)) {
    throw new RangeError(`TopologyEditTableBatchPlanner: ${edge.id} has zero length.`);
  }
  if (!nearlyEqual(currentLengthMm, intent.priorValue.lengthMm)) {
    throw new Error(`TopologyEditTableBatchPlanner: displayed length for ${edge.id} differs from canonical geometry.`);
  }
  const requestedLengthMm = intent.requestedValue.lengthMm;
  const lengthDeltaMm = requestedLengthMm - currentLengthMm;
  if (Math.abs(lengthDeltaMm) <= EPSILON_MM) {
    throw new RangeError(`TopologyEditTableBatchPlanner: ${edge.id} length edit is a no-op.`);
  }
  const policy = intent.geometryPolicy;
  const fromAnchored = policy.anchor === 'FROM' && policy.propagation === 'DOWNSTREAM';
  const toAnchored = policy.anchor === 'TO' && policy.propagation === 'UPSTREAM';
  if (!fromAnchored && !toAnchored) {
    throw new RangeError(
      'TopologyEditTableBatchPlanner: current PIPE_LENGTH support requires FROM+DOWNSTREAM or TO+UPSTREAM.',
    );
  }
  const anchorNodeId = fromAnchored ? from.id : to.id;
  const movingNodeId = fromAnchored ? to.id : from.id;
  const movedNodeIds = edgeComponentWithout(topology, movingNodeId, edge.id);
  if (movedNodeIds.includes(anchorNodeId)) {
    throw new RangeError(`TopologyEditTableBatchPlanner: ${edge.id} lies on a cycle; propagation is ambiguous.`);
  }
  assertNoPartialMultiNodeDependants(topology, new Set(movedNodeIds));
  const unit = scale(axis, 1 / currentLengthMm);
  const sign = fromAnchored ? 1 : -1;
  const deltaMm = scale(unit, lengthDeltaMm * sign);
  return planMoveConnectedRun({
    topology,
    basisHash: topology.canonicalTopologyHash,
    nodeIds: movedNodeIds,
    boundaryNodeIds: [anchorNodeId],
    deltaMm,
  });
}

function materializeCompositeEngineeringCommands(plans, topology) {
  const nonMoves = [];
  const moveDeltas = new Map();
  for (const plan of plans) for (const intent of plan.commandIntents) {
    if (intent.commandType !== 'MOVE_NODE') {
      if (!['REPLACE_INLINE_COMPONENT', 'UPDATE_JUNCTION_BRANCH_RELATION'].includes(intent.commandType)) {
        throw new RangeError(
          `TopologyEditTableBatchPlanner: unsupported composite engineering command ${intent.commandType}.`,
        );
      }
      nonMoves.push({ commandType: intent.commandType, payload: intent.payload });
      continue;
    }
    const node = exact(topology.nodes, intent.payload.nodeId, 'moved node');
    const delta = subtract(intent.payload.position, node.position);
    const prior = moveDeltas.get(node.id) ?? { x: 0, y: 0, z: 0 };
    moveDeltas.set(node.id, add(prior, delta));
  }
  const moves = [...moveDeltas.entries()].sort(([left], [right]) => left.localeCompare(right))
    .map(([nodeId, delta]) => {
      if (!(magnitude(delta) > EPSILON_MM)) {
        throw new RangeError(
          `TopologyEditTableBatchPlanner: composite translations cancel to a no-op for ${nodeId}.`,
        );
      }
      const node = exact(topology.nodes, nodeId, 'moved node');
      return { commandType: 'MOVE_NODE', payload: { nodeId, position: add(node.position, delta) } };
    });
  return [...nonMoves, ...moves];
}

function edgeComponentWithout(topology, startNodeId, blockedEdgeId) {
  const adjacency = new Map((topology.nodes ?? []).map((node) => [node.id, []]));
  for (const edge of topology.edges ?? []) {
    if (edge.id === blockedEdgeId) continue;
    adjacency.get(edge.fromNodeId)?.push(edge.toNodeId);
    adjacency.get(edge.toNodeId)?.push(edge.fromNodeId);
  }
  const visited = new Set([startNodeId]);
  const queue = [startNodeId];
  while (queue.length) {
    const current = queue.shift();
    const peers = [...(adjacency.get(current) ?? [])].sort();
    for (const peer of peers) if (!visited.has(peer)) {
      visited.add(peer);
      queue.push(peer);
    }
  }
  return [...visited].sort();
}

function assertNoPartialMultiNodeDependants(topology, moved) {
  for (const collection of ['junctions', 'rigids', 'boundaries']) {
    for (const record of topology[collection] ?? []) {
      const ids = recordNodeIds(record);
      if (ids.length < 2) continue;
      const movedCount = ids.filter((id) => moved.has(id)).length;
      if (movedCount > 0 && movedCount < ids.length) {
        throw new RangeError(
          `TopologyEditTableBatchPlanner: propagation crosses ${collection} record ${record.id}; explicit component policy is required.`,
        );
      }
    }
  }
}

function combineChangedScopes(plans, basisHash) {
  const fields = [
    'nodeIds', 'edgeIds', 'junctionIds', 'supportIds', 'boundaryIds',
    'sourceRecordIds', 'validationNeighbourhoodIds',
  ];
  return createTopologyEditChangedScope({
    basisHash,
    ...Object.fromEntries(fields.map((field) => [
      field,
      uniqueSorted(plans.flatMap((plan) => plan.changedScope[field] ?? [])),
    ])),
  });
}

function assertNonOverlappingMoves(plans) {
  const owner = new Map();
  for (const plan of plans) for (const intent of plan.commandIntents) {
    if (intent.commandType !== 'MOVE_NODE') continue;
    const nodeId = intent.payload.nodeId;
    if (owner.has(nodeId)) {
      throw new RangeError(`TopologyEditTableBatchPlanner: node ${nodeId} is moved by overlapping table intents.`);
    }
    owner.set(nodeId, plan.planHash);
  }
}

function revisionMap(topology, ids) {
  return Object.fromEntries(ids.map((id) => [id, canonicalRevision(topology, id)]));
}
export function topologyEditTableCanonicalRevision(topology, id) {
  return canonicalRevision(topology, id);
}
function canonicalRevision(topology, id) {
  const [kind] = String(id).split(':', 1);
  const collection = ({
    node: 'nodes', edge: 'edges', junction: 'junctions', support: 'supports',
    boundary: 'boundaries', rigid: 'rigids', bend: 'bends',
  })[kind];
  if (!collection) throw new RangeError(`TopologyEditTableBatchPlanner: unsupported canonical dependency ${id}.`);
  const record = exact(topology[collection] ?? [], id, kind);
  return semanticHash({ kind: kind.toUpperCase(), record });
}
function recordNodeIds(record) {
  return uniqueSorted([
    record?.nodeId, record?.fromNodeId, record?.toNodeId,
    ...(record?.nodeIds ?? []), ...(record?.fromNodeIds ?? []), ...(record?.toNodeIds ?? []),
  ].filter(Boolean));
}
function assertBasis(batch, projection, topology) {
  if (batch.authority.projectionHash !== projection.projectionHash
    || batch.authority.priorDraftHash !== topology.canonicalTopologyHash
    || projection.authority.canonicalTopologyHash !== topology.canonicalTopologyHash) {
    throw new Error('TopologyEditTableBatchPlanner: batch/projection/canonical basis is stale.');
  }
}
function exact(rows, id, label) {
  const matches = (rows ?? []).filter((row) => row?.id === id);
  if (matches.length !== 1) {
    throw new RangeError(`TopologyEditTableBatchPlanner: ${label} ${id} resolved ${matches.length} records.`);
  }
  return matches[0];
}
function uniqueSorted(values) { return [...new Set(values)].sort((a, b) => a.localeCompare(b)); }
function subtract(left, right) { return { x: left.x - right.x, y: left.y - right.y, z: left.z - right.z }; }
function add(left, right) { return { x: left.x + right.x, y: left.y + right.y, z: left.z + right.z }; }
function scale(value, factor) { return { x: value.x * factor, y: value.y * factor, z: value.z * factor }; }
function magnitude(value) { return Math.hypot(value.x, value.y, value.z); }
function nearlyEqual(left, right) { return Math.abs(Number(left) - Number(right)) <= EPSILON_MM; }
