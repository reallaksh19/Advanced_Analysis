import { semanticHash } from '../../core/shared-piping-model/index.js';
import {
  INSERT_PIPE_SEGMENT,
  normalizePipeSegmentCommandPayload,
} from './topology-edit-pipe-segment-contract.js';
import { createPipeSegmentGeometryEvidence } from './topology-edit-pipe-segment-geometry.js';

function finding(code, message, targetIds = []) {
  return { code, message, targetIds: [...targetIds].filter(Boolean).sort() };
}
function digest(commandId, role) {
  return semanticHash({ commandId, role }).split(':').at(-1).slice(0, 32);
}
function expectedIdentity(commandId) {
  const componentKey = `native-component:${digest(commandId, 'pipe-component')}`;
  return {
    edgeId: `edge:${digest(commandId, 'pipe-edge')}`,
    componentKey,
    fromPortKey: `${componentKey}:port:from`,
    toPortKey: `${componentKey}:port:to`,
  };
}
function noChanges(delta, keys) {
  return keys.every((key) => [
    ...(delta[key]?.addedIds ?? []),
    ...(delta[key]?.removedIds ?? []),
    ...(delta[key]?.changedIds ?? []),
  ].length === 0);
}
function exactNode(topology, id) {
  const matches = (topology.nodes ?? []).filter((node) => node.id === id);
  return matches.length === 1 ? matches[0] : null;
}

export function validatePipeSegmentCandidateEffect(candidate) {
  if (candidate.commandType !== INSERT_PIPE_SEGMENT) return [];
  let payload;
  try {
    payload = normalizePipeSegmentCommandPayload(candidate.resolvedPayload);
  } catch (error) {
    return [finding(
      'INSERT_PIPE_SEGMENT_PAYLOAD_INVALID',
      error instanceof Error ? error.message : String(error),
    )];
  }
  const delta = candidate.topologyDelta;
  const expected = expectedIdentity(candidate.commandId);
  const created = (candidate.canonicalTopology.edges ?? []).filter((edge) => (
    edge.createdByCommandId === candidate.commandId
    && edge.topologyOperation === INSERT_PIPE_SEGMENT
  ));
  const edge = created[0];
  const expectedNodes = [payload.fromNodeId, payload.toNodeId].sort();
  const changedNodes = [...(delta.nodes?.changedIds ?? [])].sort();
  const deltaValid = created.length === 1
    && delta.nodes.addedIds.length === 0
    && delta.nodes.removedIds.length === 0
    && semanticHash(changedNodes) === semanticHash(expectedNodes)
    && semanticHash(delta.edges.addedIds) === semanticHash([expected.edgeId])
    && delta.edges.removedIds.length === 0
    && delta.edges.changedIds.length === 0
    && noChanges(delta, ['junctions', 'supports', 'boundaries', 'rigids', 'bends']);
  if (!deltaValid) {
    return [finding(
      'INSERT_PIPE_SEGMENT_DELTA_INVALID',
      'INSERT_PIPE_SEGMENT must update exactly two endpoint nodes and add one governed pipe edge.',
      [...changedNodes, ...(delta.edges?.addedIds ?? [])],
    )];
  }
  const from = exactNode(candidate.canonicalTopology, payload.fromNodeId);
  const to = exactNode(candidate.canonicalTopology, payload.toNodeId);
  if (!from || !to) {
    return [finding(
      'INSERT_PIPE_SEGMENT_ENDPOINT_INVALID',
      'INSERT_PIPE_SEGMENT endpoints are absent from the candidate topology.',
      expectedNodes,
    )];
  }
  const geometry = createPipeSegmentGeometryEvidence(from.position, to.position);
  const binding = payload.catalogueBinding;
  const exact = edge.id === expected.edgeId
    && edge.componentKey === expected.componentKey
    && edge.fromNodeId === payload.fromNodeId
    && edge.toNodeId === payload.toNodeId
    && edge.catalogueHash === binding.catalogueHash
    && edge.catalogueSourceHash === binding.catalogueSourceHash
    && edge.catalogueRecordId === binding.recordId
    && edge.catalogueRecordHash === binding.recordHash
    && edge.geometryHash === geometry.geometryHash
    && semanticHash(edge.nativePortKeys) === semanticHash([
      expected.fromPortKey,
      expected.toPortKey,
    ])
    && (from.portKeys ?? []).includes(expected.fromPortKey)
    && (to.portKeys ?? []).includes(expected.toPortKey)
    && candidate.canonicalTopology.crosswalk.edgeIdToComponentKey[edge.id]
      === expected.componentKey;
  return exact ? [] : [finding(
    'INSERT_PIPE_SEGMENT_AUTHORITY_INVALID',
    'INSERT_PIPE_SEGMENT candidate differs from deterministic catalogue, geometry, identity, or crosswalk authority.',
    [edge?.id, payload.fromNodeId, payload.toNodeId],
  )];
}
