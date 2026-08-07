import { deepFreeze, semanticHash } from '../../../core/shared-piping-model/index.js';
import {
  createTopologyEditOperationGraph,
  topologyEditOperationReference,
} from './topology-edit-operation-graph.js';
import { assertConnectEndpointsPlan } from './topology-edit-connect-endpoints-plan.js';
import {
  assertConnectEndpointsElbowBinding,
  resolveConnectEndpointsElbow,
} from './topology-edit-connect-endpoints-elbow-resolver.js';

export const CONNECT_ENDPOINTS_OPERATION_SCHEMA = 'TopologyEditConnectEndpointsOperation.v1';
const TOLERANCE = 1e-8;

function fail(message, Constructor = RangeError) {
  throw new Constructor(`TopologyEditConnectEndpointsOperation: ${message}`);
}
function selectedAlternative(plan, id) {
  const matches = plan.alternatives.filter((row) => row.alternativeId === String(id ?? '').trim());
  if (matches.length !== 1) fail(`selected alternative resolved ${matches.length} records.`);
  return matches[0];
}
function elbowSelection(selections, turn) {
  if (!selections) return null;
  if (Array.isArray(selections)) {
    const row = selections.find((item) => item?.turnHash === turn.turnHash || item?.location === turn.location);
    return row?.recordId ?? null;
  }
  return selections[turn.turnHash] ?? selections[turn.location] ?? null;
}
function tangentDistance(binding) {
  const halfAngle = Number(binding.elbowAngleDeg) * Math.PI / 360;
  const value = Number(binding.elbowRadiusMm) * Math.tan(halfAngle);
  if (!Number.isFinite(value) || value <= 0) fail(`invalid tangent distance for ${binding.recordId}.`);
  return value;
}
function trimEvidence(plan, alternative, bindings) {
  const byTurn = new Map(bindings.map((row) => [row.turnHash, row]));
  const trims = alternative.segments.map(() => ({ startTrimMm: 0, endTrimMm: 0 }));
  let startHostTrimMm = 0; let endHostTrimMm = 0;
  const turns = alternative.turns.map((turn) => {
    const binding = byTurn.get(turn.turnHash);
    if (!binding) fail(`turn ${turn.turnHash} lacks elbow authority.`);
    const tangentDistanceMm = tangentDistance(binding);
    if (turn.location === 'START_ENDPOINT') {
      startHostTrimMm += tangentDistanceMm;
      trims[0].startTrimMm += tangentDistanceMm;
    } else if (turn.location === 'END_ENDPOINT') {
      endHostTrimMm += tangentDistanceMm;
      trims.at(-1).endTrimMm += tangentDistanceMm;
    } else if (Number.isInteger(turn.vertexIndex)) {
      const incoming = turn.vertexIndex - 1;
      const outgoing = turn.vertexIndex;
      if (!trims[incoming] || !trims[outgoing]) fail(`turn vertex ${turn.vertexIndex} is outside route geometry.`);
      trims[incoming].endTrimMm += tangentDistanceMm;
      trims[outgoing].startTrimMm += tangentDistanceMm;
    } else fail(`unsupported turn location ${turn.location}.`);
    return deepFreeze({
      turnHash: turn.turnHash,
      location: turn.location,
      vertexIndex: turn.vertexIndex ?? null,
      elbowBindingHash: binding.bindingHash,
      elbowRecordId: binding.recordId,
      tangentDistanceMm,
    });
  });
  const minimum = plan.intent.segmentPolicy.minimumLengthMm;
  const effectiveSegments = alternative.segments.map((segment, index) => {
    const effectiveLengthMm = segment.lengthMm - trims[index].startTrimMm - trims[index].endTrimMm;
    if (effectiveLengthMm + TOLERANCE < minimum) {
      fail(`route segment ${index + 1} leaves ${effectiveLengthMm} mm after fitting tangencies; minimum is ${minimum} mm.`);
    }
    return deepFreeze({ sequence: index, rawLengthMm: segment.lengthMm, ...trims[index], effectiveLengthMm });
  });
  const startHostEffectiveLengthMm = plan.startEndpoint.incidentEdgeLengthMm - startHostTrimMm;
  const endHostEffectiveLengthMm = plan.endEndpoint.incidentEdgeLengthMm - endHostTrimMm;
  if (startHostTrimMm && startHostEffectiveLengthMm + TOLERANCE < minimum) {
    fail(`start host leaves ${startHostEffectiveLengthMm} mm after elbow tangent; minimum is ${minimum} mm.`);
  }
  if (endHostTrimMm && endHostEffectiveLengthMm + TOLERANCE < minimum) {
    fail(`end host leaves ${endHostEffectiveLengthMm} mm after elbow tangent; minimum is ${minimum} mm.`);
  }
  const material = { turns, effectiveSegments, startHostTrimMm, startHostEffectiveLengthMm,
    endHostTrimMm, endHostEffectiveLengthMm };
  return deepFreeze({ ...material, trimHash: semanticHash(material) });
}
function cornerRef(index) { return topologyEditOperationReference(`corner-${index}-node`, 'created-node'); }
function pipeRef(index) { return topologyEditOperationReference(`segment-${index}-pipe`, 'created-edge'); }
function geometrySteps(plan, alternative, operationId) {
  const result = [];
  for (let index = 0; index < alternative.segmentCount; index += 1) {
    const oneBased = index + 1;
    if (index < alternative.segmentCount - 1) result.push({
      stepId: `corner-${oneBased}-node`, commandType: 'CREATE_NODE',
      payload: {
        position: alternative.points[oneBased],
        creationRole: `CONNECT_ENDPOINTS_CORNER_${oneBased}`,
        coordinateAuthority: `CANONICAL_ROUTE:${plan.planHash}`,
        sourceOperationId: operationId,
      },
    });
    result.push({
      stepId: `segment-${oneBased}-pipe`, commandType: 'INSERT_PIPE_SEGMENT',
      payload: {
        fromNodeId: index === 0 ? plan.startEndpoint.nodeId : cornerRef(index),
        toNodeId: index === alternative.segmentCount - 1 ? plan.endEndpoint.nodeId : cornerRef(oneBased),
        catalogueBinding: plan.intent.catalogueBinding,
        segmentPolicy: plan.intent.segmentPolicy,
      },
    });
  }
  return result;
}
function bendSteps(plan, alternative, bindings) {
  const byTurn = new Map(bindings.map((row) => [row.turnHash, row]));
  return alternative.turns.map((turn, index) => {
    const binding = byTurn.get(turn.turnHash);
    let nodeId; let edgeIds;
    if (turn.location === 'START_ENDPOINT') {
      nodeId = plan.startEndpoint.nodeId;
      edgeIds = [plan.startEndpoint.incidentEdgeId, pipeRef(1)];
    } else if (turn.location === 'END_ENDPOINT') {
      nodeId = plan.endEndpoint.nodeId;
      edgeIds = [pipeRef(alternative.segmentCount), plan.endEndpoint.incidentEdgeId];
    } else {
      nodeId = cornerRef(turn.vertexIndex);
      edgeIds = [pipeRef(turn.vertexIndex), pipeRef(turn.vertexIndex + 1)];
    }
    return {
      stepId: `bend-${index + 1}`, commandType: 'ADD_BEND_DEFINITION',
      payload: { nodeId, edgeIds, radiusMm: binding.elbowRadiusMm,
        angleDeg: binding.elbowAngleDeg, radiusAuthority: binding.radiusAuthority },
    };
  });
}

export function createConnectEndpointsOperation({ plan: input, alternativeId, catalogue, elbowSelections = null } = {}) {
  const plan = assertConnectEndpointsPlan(input);
  if (plan.compatibilityStatus !== 'COMPATIBLE') fail('endpoint engineering compatibility requires a governed transition.');
  const alternative = selectedAlternative(plan, alternativeId);
  if (alternative.blockerCodes.length) fail(`selected alternative is blocked: ${alternative.blockerCodes.join(', ')}.`);
  const bindings = alternative.turns.map((turn) => resolveConnectEndpointsElbow({
    turn, pipeBinding: plan.intent.catalogueBinding, catalogue,
    selectedRecordId: elbowSelection(elbowSelections, turn),
  }));
  const trim = trimEvidence(plan, alternative, bindings);
  const operationId = `connect-endpoints:${semanticHash({ planHash: plan.planHash,
    alternativeHash: alternative.alternativeHash, bindingHashes: bindings.map((row) => row.bindingHash),
    trimHash: trim.trimHash }).split(':').at(-1)}`;
  const graph = createTopologyEditOperationGraph({
    operationId, basisHash: plan.basisHash,
    steps: [...geometrySteps(plan, alternative, operationId), ...bendSteps(plan, alternative, bindings)],
  });
  const material = {
    schema: CONNECT_ENDPOINTS_OPERATION_SCHEMA, operationId,
    parentPlanHash: plan.planHash, alternativeId: alternative.alternativeId,
    alternativeHash: alternative.alternativeHash, basis: plan.basis, basisHash: plan.basisHash,
    catalogueHash: plan.basis.catalogueHash, graphHash: graph.graphHash, trimHash: trim.trimHash,
    elbowBindingHashes: bindings.map((row) => row.bindingHash),
    segmentCount: alternative.segmentCount, newNodeCount: alternative.segmentCount - 1,
    bendCount: bindings.length,
    expectedCommandCount: alternative.segmentCount * 2 - 1 + bindings.length,
  };
  return deepFreeze({ ...material, operationHash: semanticHash(material), parentPlan: plan,
    alternative, elbowBindings: bindings, trim, graph });
}

export function assertConnectEndpointsOperation(value) {
  if (value?.schema !== CONNECT_ENDPOINTS_OPERATION_SCHEMA) fail(`operation must use ${CONNECT_ENDPOINTS_OPERATION_SCHEMA}.`, TypeError);
  const plan = assertConnectEndpointsPlan(value.parentPlan);
  value.elbowBindings.forEach(assertConnectEndpointsElbowBinding);
  if (value.parentPlanHash !== plan.planHash || value.alternativeHash !== value.alternative?.alternativeHash
    || value.graphHash !== value.graph?.graphHash || value.trimHash !== value.trim?.trimHash
    || value.expectedCommandCount !== value.segmentCount + value.newNodeCount + value.bendCount
    || semanticHash(value.elbowBindingHashes) !== semanticHash(value.elbowBindings.map((row) => row.bindingHash))) {
    fail('operation dependencies differ from declared authority.');
  }
  const material = { ...value };
  for (const key of ['operationHash', 'parentPlan', 'alternative', 'elbowBindings', 'trim', 'graph']) delete material[key];
  if (semanticHash(material) !== value.operationHash) fail('operation hash mismatch.');
  return value;
}
