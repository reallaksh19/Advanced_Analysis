/** Pure command-specific candidate delta validation. */
import { semanticHash } from '../../core/shared-piping-model/index.js';

function finding(code, message, targetIds = []) {
  return { code, message, targetIds: [...targetIds].sort() };
}

function recordChanges(delta) {
  return [...delta.addedIds, ...delta.removedIds, ...delta.changedIds].sort();
}

function sameIds(actual, expected) {
  return semanticHash([...actual].sort()) === semanticHash([...expected].sort());
}

function effectContext(candidate) {
  const delta = candidate.topologyDelta;
  const additionsByCommand = [
    ...(candidate.canonicalTopology.nodes ?? []),
    ...(candidate.canonicalTopology.edges ?? []),
  ].filter((record) => record.createdByCommandId === candidate.commandId)
    .map((record) => record.id);
  return {
    candidate,
    delta,
    additionsByCommand,
    nodeChanges: recordChanges(delta.nodes),
    edgeChanges: recordChanges(delta.edges),
    otherChanges: [delta.junctions, delta.supports, delta.boundaries, delta.rigids]
      .flatMap(recordChanges),
  };
}

function validateMove(context) {
  const { delta, nodeChanges, edgeChanges, otherChanges } = context;
  const valid = delta.nodes.changedIds.length === 1
    && delta.nodes.addedIds.length === 0
    && delta.nodes.removedIds.length === 0
    && edgeChanges.length === 0
    && otherChanges.length === 0;
  return valid ? [] : [finding(
    'MOVE_NODE_DELTA_INVALID',
    'MOVE_NODE must change exactly one existing node and no other record.',
    nodeChanges,
  )];
}

function validateMerge(context) {
  const { delta, nodeChanges, edgeChanges } = context;
  const valid = delta.nodes.removedIds.length === 1
    && delta.nodes.addedIds.length === 0
    && delta.edges.addedIds.length === 0
    && delta.edges.removedIds.length === 0;
  return valid ? [] : [finding(
    'MERGE_NODES_DELTA_INVALID',
    'MERGE_NODES must remove exactly one node without adding or removing edges.',
    [...nodeChanges, ...edgeChanges],
  )];
}

function validateAddedEdge(context) {
  const { candidate, delta, additionsByCommand, nodeChanges, edgeChanges, otherChanges } = context;
  const findings = [];
  const valid = delta.edges.addedIds.length === 1
    && delta.edges.removedIds.length === 0
    && delta.nodes.addedIds.length === 0
    && otherChanges.length === 0;
  if (!valid) findings.push(finding(
    'ADD_EDGE_DELTA_INVALID',
    `${candidate.commandType} must add exactly one edge.`,
    [...nodeChanges, ...edgeChanges],
  ));
  if (!sameIds(additionsByCommand, delta.edges.addedIds)) findings.push(finding(
    'ADD_EDGE_PROVENANCE_INVALID',
    'Added edge provenance does not match command identity.',
    additionsByCommand,
  ));
  return findings;
}

function validateSplit(context) {
  const { delta, additionsByCommand, nodeChanges, edgeChanges, otherChanges } = context;
  const findings = [];
  const valid = delta.nodes.addedIds.length === 1
    && delta.edges.addedIds.length === 2
    && delta.edges.removedIds.length === 1
    && otherChanges.length === 0;
  if (!valid) findings.push(finding(
    'SPLIT_EDGE_DELTA_INVALID',
    'SPLIT_EDGE must add one node, replace one edge, and add two edges.',
    [...nodeChanges, ...edgeChanges],
  ));
  if (!sameIds(additionsByCommand, [...delta.nodes.addedIds, ...delta.edges.addedIds])) findings.push(finding(
    'SPLIT_EDGE_PROVENANCE_INVALID',
    'Split additions do not carry exact command provenance.',
    additionsByCommand,
  ));
  return findings;
}

function validateDisconnect(context) {
  const { delta, additionsByCommand, nodeChanges, edgeChanges, otherChanges } = context;
  const findings = [];
  const valid = delta.nodes.addedIds.length === 1
    && delta.edges.changedIds.length === 1
    && delta.edges.addedIds.length === 0
    && delta.edges.removedIds.length === 0
    && otherChanges.length === 0;
  if (!valid) findings.push(finding(
    'DISCONNECT_ENDPOINT_DELTA_INVALID',
    'DISCONNECT_ENDPOINT must add one node and change one edge.',
    [...nodeChanges, ...edgeChanges],
  ));
  if (!sameIds(additionsByCommand, delta.nodes.addedIds)) findings.push(finding(
    'DISCONNECT_PROVENANCE_INVALID',
    'Disconnected node provenance does not match command identity.',
    additionsByCommand,
  ));
  return findings;
}

function validateDelete(context) {
  const { delta, nodeChanges, edgeChanges, otherChanges } = context;
  const valid = delta.edges.removedIds.length === 1
    && delta.edges.addedIds.length === 0
    && delta.nodes.addedIds.length === 0
    && delta.nodes.removedIds.length === 0
    && otherChanges.length === 0;
  return valid ? [] : [finding(
    'DELETE_EDGE_DELTA_INVALID',
    'DELETE_EDGE must remove exactly one edge and no other record.',
    [...nodeChanges, ...edgeChanges],
  )];
}

const VALIDATORS = Object.freeze({
  MOVE_NODE: validateMove,
  MERGE_NODES: validateMerge,
  BRIDGE_GAP: validateAddedEdge,
  ADD_STRAIGHT_ELEMENT: validateAddedEdge,
  SPLIT_EDGE: validateSplit,
  DISCONNECT_ENDPOINT: validateDisconnect,
  DELETE_EDGE: validateDelete,
});

export function validateTopologyEditCommandEffect(candidate) {
  const validator = VALIDATORS[candidate.commandType];
  if (!validator) return [finding(
    'COMMAND_TYPE_UNSUPPORTED',
    `Unsupported command type ${candidate.commandType}.`,
    [candidate.commandType],
  )];
  return validator(effectContext(candidate));
}
