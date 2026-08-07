import { semanticHash } from '../../../core/shared-piping-model/index.js';
import {
  assertTopologyEditInlineReplacementTarget,
} from '../topology-edit-inline-component-replacement.js';
import {
  assertTopologyEditJunctionRelationTarget,
} from '../topology-edit-junction-relation-command.js';
import {
  deriveTopologyEditChangedScope,
} from '../professional/topology-edit-change-scope.js';
import {
  createTopologyEditOperationPlan,
} from '../professional/topology-edit-operation-plan.js';
import { planMoveConnectedRun } from '../professional/topology-edit-route-operations.js';

const EPSILON_MM = 1e-9;

export function compileTopologyEditTableEngineeringIntent(intent, topology) {
  if (intent.intentKind === 'VALVE_REPLACEMENT') {
    return compileValveReplacement(intent, topology);
  }
  if (intent.intentKind === 'TEE_REDUCER_RELATION') {
    return compileTeeReducerRelation(intent, topology);
  }
  throw new RangeError(
    `TopologyEditTableEngineeringPlanner: unsupported intent ${intent.intentKind}.`,
  );
}

function compileValveReplacement(intent, topology) {
  const payload = {
    edgeId: intent.target.canonicalId,
    direction: intent.requestedValue.direction,
    catalogueBinding: intent.requestedValue.catalogueBinding,
  };
  const target = assertTopologyEditInlineReplacementTarget(topology, payload);
  if (!nearlyEqual(target.geometricLengthMm, intent.priorValue.lengthMm)) {
    throw new Error(
      `TopologyEditTableEngineeringPlanner: displayed valve length for ${target.edge.id} differs from canonical geometry.`,
    );
  }
  const requestedLengthMm = payload.catalogueBinding.valveFaceToFaceMm;
  const lengthDeltaMm = requestedLengthMm - target.geometricLengthMm;
  const movement = Math.abs(lengthDeltaMm) <= EPSILON_MM
    ? null
    : valveMovementPlan(intent, topology, target, lengthDeltaMm);
  const nodeIds = movement?.changedScope.nodeIds ?? [target.from.id, target.to.id];
  const changedScope = deriveTopologyEditChangedScope(topology, {
    basisHash: topology.canonicalTopologyHash,
    nodeIds,
    edgeIds: [target.edge.id],
  });
  const targetIds = uniqueSorted([
    target.edge.id,
    target.from.id,
    target.to.id,
    ...(movement?.targetIds ?? []),
  ]);
  return createTopologyEditOperationPlan({
    operationType: 'COMPOSITE_ENGINEERING_EDIT',
    basisHash: topology.canonicalTopologyHash,
    targetIds,
    parameters: {
      aggregateKind: 'TABLE_VALVE_REPLACEMENT',
      priorValveType: intent.priorValue.valveType,
      requestedValveType: payload.catalogueBinding.valveType,
      priorLengthMm: target.geometricLengthMm,
      requestedLengthMm,
      geometryPolicy: intent.geometryPolicy,
    },
    commandIntents: [
      { commandType: 'REPLACE_INLINE_COMPONENT', payload },
      ...(movement?.commandIntents ?? []),
    ],
    changedScope,
    unresolvedEvidence: [],
  });
}

function valveMovementPlan(intent, topology, target, lengthDeltaMm) {
  const policy = intent.geometryPolicy;
  const fromAnchored = policy.anchor === 'FROM' && policy.propagation === 'DOWNSTREAM';
  const toAnchored = policy.anchor === 'TO' && policy.propagation === 'UPSTREAM';
  if (!fromAnchored && !toAnchored) {
    throw new RangeError(
      'TopologyEditTableEngineeringPlanner: current valve F2F support requires FROM+DOWNSTREAM or TO+UPSTREAM.',
    );
  }
  const anchorNodeId = fromAnchored ? target.from.id : target.to.id;
  const movingNodeId = fromAnchored ? target.to.id : target.from.id;
  const movedNodeIds = edgeComponentWithout(topology, movingNodeId, target.edge.id);
  if (movedNodeIds.includes(anchorNodeId)) {
    throw new RangeError(
      `TopologyEditTableEngineeringPlanner: ${target.edge.id} lies on a cycle; F2F propagation is ambiguous.`,
    );
  }
  assertNoPartialMultiNodeDependants(topology, new Set(movedNodeIds));
  const axis = subtract(target.to.position, target.from.position);
  const unit = scale(axis, 1 / target.geometricLengthMm);
  const deltaMm = scale(unit, lengthDeltaMm * (fromAnchored ? 1 : -1));
  return planMoveConnectedRun({
    topology,
    basisHash: topology.canonicalTopologyHash,
    nodeIds: movedNodeIds,
    boundaryNodeIds: [anchorNodeId],
    deltaMm,
  });
}

function compileTeeReducerRelation(intent, topology) {
  const payload = intent.requestedValue;
  const target = assertTopologyEditJunctionRelationTarget(topology, payload);
  const changedScope = deriveTopologyEditChangedScope(topology, {
    basisHash: topology.canonicalTopologyHash,
    nodeIds: [payload.branchNodeId, ...payload.runNodeIds],
    edgeIds: [target.reducer.id],
    junctionIds: [target.junction.id],
  });
  const targetIds = uniqueSorted([
    target.junction.id,
    target.reducer.id,
    payload.branchNodeId,
    ...payload.runNodeIds,
  ]);
  return createTopologyEditOperationPlan({
    operationType: 'COMPOSITE_ENGINEERING_EDIT',
    basisHash: topology.canonicalTopologyHash,
    targetIds,
    parameters: {
      aggregateKind: 'TABLE_TEE_REDUCER_RELATION',
      relationHash: payload.relationHash,
      reducerRecordHash: payload.reducerCatalogueBinding.recordHash,
    },
    commandIntents: [{
      commandType: 'UPDATE_JUNCTION_BRANCH_RELATION',
      payload,
    }],
    changedScope,
    unresolvedEvidence: [],
  });
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
    for (const peer of [...(adjacency.get(current) ?? [])].sort()) {
      if (visited.has(peer)) continue;
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
          `TopologyEditTableEngineeringPlanner: propagation crosses ${collection} record ${record.id}; explicit component policy is required.`,
        );
      }
    }
  }
}
function recordNodeIds(record) {
  return uniqueSorted([
    record?.nodeId, record?.fromNodeId, record?.toNodeId,
    ...(record?.nodeIds ?? []), ...(record?.fromNodeIds ?? []), ...(record?.toNodeIds ?? []),
  ].filter(Boolean));
}
function uniqueSorted(values) { return [...new Set(values)].sort((a, b) => a.localeCompare(b)); }
function subtract(left, right) { return { x: left.x - right.x, y: left.y - right.y, z: left.z - right.z }; }
function scale(value, factor) { return { x: value.x * factor, y: value.y * factor, z: value.z * factor }; }
function nearlyEqual(left, right) {
  return Math.abs(Number(left) - Number(right)) <= EPSILON_MM;
}
