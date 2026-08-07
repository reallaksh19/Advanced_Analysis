import { deepFreeze, semanticHash } from '../../../core/shared-piping-model/index.js';
import {
  assertTopologyEditOperationGraph,
  createTopologyEditOperationGraph,
  topologyEditOperationReference,
} from './topology-edit-operation-graph.js';
import { assertContinueRoutePlan } from './topology-edit-continue-route-plan.js';
import { resolveContinueRouteElbows } from './topology-edit-continue-route-elbow-resolver.js';

export const CONTINUE_ROUTE_FITTED_PLAN_SCHEMA = 'TopologyEditContinueRouteFittedPlan.v1';
const TOLERANCE = 1e-8;

function fail(message, Constructor = RangeError) {
  throw new Constructor(`TopologyEditContinueRouteFittedPlan: ${message}`);
}
function tangentDistance(binding) {
  const halfAngle = Number(binding.elbowAngleDeg) * Math.PI / 360;
  const distance = Number(binding.elbowRadiusMm) * Math.tan(halfAngle);
  if (!Number.isFinite(distance) || distance <= 0) fail(`invalid tangent distance for ${binding.recordId}.`);
  return distance;
}
function turnMap(rawPlan, resolution) {
  const result = new Map();
  for (const binding of resolution.bindings) {
    const turn = rawPlan.geometry.turns.find((row) => row.turnHash === binding.turnHash);
    if (!turn) fail(`elbow binding ${binding.recordId} references an unknown turn.`);
    result.set(turn.vertexIndex, { turn, binding, tangentDistanceMm: tangentDistance(binding) });
  }
  return result;
}
function effectiveSegments(rawPlan, turns) {
  return rawPlan.geometry.segments.map((segment, index) => {
    const startTurn = turns.get(index) ?? null;
    const endTurn = turns.get(index + 1) ?? null;
    const startTrimMm = startTurn?.tangentDistanceMm ?? 0;
    const endTrimMm = endTurn?.tangentDistanceMm ?? 0;
    const effectiveLengthMm = segment.lengthMm - startTrimMm - endTrimMm;
    const minimumLengthMm = rawPlan.intent.segmentPolicy.minimumLengthMm;
    if (effectiveLengthMm + TOLERANCE < minimumLengthMm) {
      fail(`segment ${index + 1} leaves ${effectiveLengthMm} mm after elbow tangencies; minimum is ${minimumLengthMm} mm.`);
    }
    const material = {
      sequence: index,
      rawGeometryHash: segment.geometryHash,
      rawLengthMm: segment.lengthMm,
      startTrimMm,
      endTrimMm,
      effectiveLengthMm,
    };
    return deepFreeze({ ...material, effectiveGeometryHash: semanticHash(material) });
  });
}
function fittedOperationId(rawPlan, resolutionHash, effectiveGeometryHash) {
  return `continue-route-fitted:${semanticHash({
    rawPlanHash: rawPlan.planHash,
    resolutionHash,
    effectiveGeometryHash,
  }).split(':').at(-1)}`;
}
function routeCreationSteps(rawPlan, operationId) {
  const result = [];
  for (let index = 0; index < rawPlan.geometry.segments.length; index += 1) {
    const nodeStep = `leg-${index + 1}-node`;
    const pipeStep = `leg-${index + 1}-pipe`;
    const fromNodeId = index === 0
      ? rawPlan.intent.startNodeId
      : topologyEditOperationReference(`leg-${index}-node`, 'created-node');
    result.push({
      stepId: nodeStep,
      commandType: 'CREATE_NODE',
      payload: {
        position: rawPlan.geometry.segments[index].endPointMm,
        creationRole: `CONTINUE_ROUTE_VERTEX_${index + 1}`,
        coordinateAuthority: `DATUM:${rawPlan.intent.coordinateDatumHash}`,
        sourceOperationId: operationId,
      },
    });
    result.push({
      stepId: pipeStep,
      commandType: 'INSERT_PIPE_SEGMENT',
      payload: {
        fromNodeId,
        toNodeId: topologyEditOperationReference(nodeStep, 'created-node'),
        catalogueBinding: rawPlan.intent.catalogueBinding,
        segmentPolicy: rawPlan.intent.segmentPolicy,
      },
    });
  }
  return result;
}
function bendDefinitionSteps(turns) {
  return [...turns.entries()]
    .sort(([left], [right]) => left - right)
    .map(([vertexIndex, turn]) => ({
      stepId: `turn-${vertexIndex}-elbow`,
      commandType: 'ADD_BEND_DEFINITION',
      payload: {
        nodeId: topologyEditOperationReference(`leg-${vertexIndex}-node`, 'created-node'),
        edgeIds: [
          topologyEditOperationReference(`leg-${vertexIndex}-pipe`, 'created-edge'),
          topologyEditOperationReference(`leg-${vertexIndex + 1}-pipe`, 'created-edge'),
        ],
        radiusMm: turn.binding.elbowRadiusMm,
        angleDeg: turn.binding.elbowAngleDeg,
        radiusAuthority: turn.binding.radiusAuthority,
      },
    }));
}
function steps(rawPlan, turns, operationId) {
  return [
    ...routeCreationSteps(rawPlan, operationId),
    ...bendDefinitionSteps(turns),
  ];
}

export function createContinueRouteFittedPlan({
  plan: input,
  catalogue,
  elbowSelections = null,
} = {}) {
  const rawPlan = assertContinueRoutePlan(input);
  if (!rawPlan.turnCount) fail('a fitted plan requires at least one route turn.');
  const resolution = resolveContinueRouteElbows({
    plan: rawPlan,
    catalogue,
    selections: elbowSelections,
  });
  const turns = turnMap(rawPlan, resolution);
  if (turns.size !== rawPlan.turnCount) fail('not every route turn has one elbow binding.');
  const effective = effectiveSegments(rawPlan, turns);
  const effectiveGeometryHash = semanticHash(effective);
  const operationId = fittedOperationId(rawPlan, resolution.resolutionHash, effectiveGeometryHash);
  const graph = createTopologyEditOperationGraph({
    operationId,
    basisHash: rawPlan.basisHash,
    steps: steps(rawPlan, turns, operationId),
  });
  const turnEvidence = [...turns.values()].map(({ turn, binding, tangentDistanceMm }) => deepFreeze({
    vertexIndex: turn.vertexIndex,
    turnHash: turn.turnHash,
    angleDeg: turn.angleDeg,
    elbowBindingHash: binding.bindingHash,
    elbowRecordId: binding.recordId,
    tangentDistanceMm,
  }));
  const material = {
    schema: CONTINUE_ROUTE_FITTED_PLAN_SCHEMA,
    rawPlanHash: rawPlan.planHash,
    intentHash: rawPlan.intentHash,
    basis: rawPlan.basis,
    basisHash: rawPlan.basisHash,
    operationId,
    graphHash: graph.graphHash,
    elbowResolutionHash: resolution.resolutionHash,
    effectiveGeometryHash,
    segmentCount: rawPlan.segmentCount,
    nodeCount: rawPlan.nodeCount,
    bendCount: rawPlan.turnCount,
    expectedCommandCount: rawPlan.segmentCount * 2 + rawPlan.turnCount,
    requiresAutoFitting: false,
    effectiveSegments: effective,
    turns: turnEvidence,
    commandTypes: graph.steps.map((row) => row.commandType),
  };
  return deepFreeze({ ...material, planHash: semanticHash(material), rawPlan, elbowResolution: resolution, graph });
}

export function assertContinueRouteFittedPlan(value) {
  if (value?.schema !== CONTINUE_ROUTE_FITTED_PLAN_SCHEMA) {
    fail(`plan must use ${CONTINUE_ROUTE_FITTED_PLAN_SCHEMA}.`, TypeError);
  }
  const rawPlan = assertContinueRoutePlan(value.rawPlan);
  const graph = assertTopologyEditOperationGraph(value.graph);
  if (value.rawPlanHash !== rawPlan.planHash || value.intentHash !== rawPlan.intentHash
    || value.basisHash !== rawPlan.basisHash || value.graphHash !== graph.graphHash
    || value.bendCount !== rawPlan.turnCount || value.segmentCount !== rawPlan.segmentCount
    || value.nodeCount !== rawPlan.nodeCount
    || value.expectedCommandCount !== value.segmentCount * 2 + value.bendCount
    || value.requiresAutoFitting !== false) {
    fail('fitted plan dependencies differ from declared authority.');
  }
  const material = { ...value };
  delete material.planHash; delete material.rawPlan; delete material.elbowResolution; delete material.graph;
  if (semanticHash(material) !== value.planHash) fail('fitted plan hash mismatch.');
  return value;
}
