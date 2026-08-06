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
  ].filter((record) => record.createdByCommandId === candidate.commandId).map((record) => record.id);
  return {
    candidate, delta, additionsByCommand,
    nodeChanges: recordChanges(delta.nodes), edgeChanges: recordChanges(delta.edges),
    otherChanges: [delta.junctions, delta.supports, delta.boundaries, delta.rigids]
      .flatMap(recordChanges),
  };
}
function validateCreateNode(context) {
  const { candidate, delta, additionsByCommand, nodeChanges, edgeChanges, otherChanges } = context;
  const created = candidate.canonicalTopology.nodes.filter((node) => (
    node.createdByCommandId === candidate.commandId
    && node.topologyOperation === 'CREATE_NODE'
  ));
  const findings = [];
  const valid = delta.nodes.addedIds.length === 1
    && delta.nodes.removedIds.length === 0
    && delta.nodes.changedIds.length === 0
    && edgeChanges.length === 0
    && otherChanges.length === 0;
  if (!valid) findings.push(finding(
    'CREATE_NODE_DELTA_INVALID',
    'CREATE_NODE must add exactly one isolated canonical node and no other record.',
    [...nodeChanges, ...edgeChanges],
  ));
  if (!sameIds(additionsByCommand, delta.nodes.addedIds)) findings.push(finding(
    'CREATE_NODE_PROVENANCE_INVALID',
    'Created node provenance does not match the command identity.',
    additionsByCommand,
  ));
  if (created.length !== 1
      || !String(created[0].creationRole ?? '').trim()
      || !String(created[0].coordinateAuthority ?? '').trim()
      || !String(created[0].sourceOperationId ?? '').trim()) {
    findings.push(finding(
      'CREATE_NODE_ENGINEERING_EVIDENCE_INVALID',
      'CREATE_NODE must preserve creation role, coordinate authority, and source operation evidence.',
      created.map((node) => node.id),
    ));
  }
  return findings;
}
function validateMove(context) {
  const { delta, nodeChanges, edgeChanges, otherChanges } = context;
  const valid = delta.nodes.changedIds.length === 1
    && delta.nodes.addedIds.length === 0 && delta.nodes.removedIds.length === 0
    && edgeChanges.length === 0 && otherChanges.length === 0;
  return valid ? [] : [finding('MOVE_NODE_DELTA_INVALID',
    'MOVE_NODE must change exactly one existing node and no other record.', nodeChanges)];
}
function validateMerge(context) {
  const { delta, nodeChanges, edgeChanges } = context;
  const valid = delta.nodes.removedIds.length === 1 && delta.nodes.addedIds.length === 0
    && delta.edges.addedIds.length === 0 && delta.edges.removedIds.length === 0;
  return valid ? [] : [finding('MERGE_NODES_DELTA_INVALID',
    'MERGE_NODES must remove exactly one node without adding or removing edges.',
    [...nodeChanges, ...edgeChanges])];
}
function validateAddedEdge(context) {
  const { candidate, delta, additionsByCommand, nodeChanges, edgeChanges, otherChanges } = context;
  const findings = [];
  const valid = delta.edges.addedIds.length === 1 && delta.edges.removedIds.length === 0
    && delta.nodes.addedIds.length === 0 && otherChanges.length === 0;
  if (!valid) findings.push(finding('ADD_EDGE_DELTA_INVALID',
    `${candidate.commandType} must add exactly one edge.`, [...nodeChanges, ...edgeChanges]));
  if (!sameIds(additionsByCommand, delta.edges.addedIds)) findings.push(finding(
    'ADD_EDGE_PROVENANCE_INVALID', 'Added edge provenance does not match command identity.',
    additionsByCommand));
  return findings;
}
function validateSplit(context) {
  const { delta, additionsByCommand, nodeChanges, edgeChanges, otherChanges } = context;
  const findings = [];
  const valid = delta.nodes.addedIds.length === 1 && delta.edges.addedIds.length === 2
    && delta.edges.removedIds.length === 1 && otherChanges.length === 0;
  if (!valid) findings.push(finding('SPLIT_EDGE_DELTA_INVALID',
    'SPLIT_EDGE must add one node, replace one edge, and add two edges.',
    [...nodeChanges, ...edgeChanges]));
  if (!sameIds(additionsByCommand, [...delta.nodes.addedIds, ...delta.edges.addedIds])) {
    findings.push(finding('SPLIT_EDGE_PROVENANCE_INVALID',
      'Split additions do not carry exact command provenance.', additionsByCommand));
  }
  return findings;
}
function validateInline(context) {
  const { candidate, delta, additionsByCommand, nodeChanges, edgeChanges, otherChanges } = context;
  const findings = [];
  const inserted = (candidate.canonicalTopology.edges ?? []).filter((edge) => (
    edge.createdByCommandId === candidate.commandId
    && edge.topologyOperation === 'INSERT_INLINE_COMPONENT'
  ));
  const valid = delta.nodes.addedIds.length === 2
    && delta.nodes.removedIds.length === 0
    && delta.edges.addedIds.length === 3
    && delta.edges.removedIds.length === 1
    && otherChanges.length === 0;
  if (!valid) findings.push(finding(
    'INSERT_INLINE_COMPONENT_DELTA_INVALID',
    'INSERT_INLINE_COMPONENT must add two nodes and three edges while replacing one host edge.',
    [...nodeChanges, ...edgeChanges],
  ));
  if (!sameIds(additionsByCommand, [...delta.nodes.addedIds, ...delta.edges.addedIds])) {
    findings.push(finding(
      'INSERT_INLINE_COMPONENT_PROVENANCE_INVALID',
      'Inline insertion additions do not carry exact command provenance.',
      additionsByCommand,
    ));
  }
  if (inserted.length !== 1
    || !inserted[0].catalogueRecordId
    || !inserted[0].catalogueRecordHash
    || !inserted[0].catalogueHash
    || !inserted[0].catalogueSourceHash) {
    findings.push(finding(
      'INSERT_INLINE_COMPONENT_CATALOGUE_PROVENANCE_INVALID',
      'Inline insertion must create exactly one catalogue-bound component edge.',
      inserted.map((edge) => edge.id),
    ));
  }
  return findings;
}
function validateDisconnect(context) {
  const { delta, additionsByCommand, nodeChanges, edgeChanges, otherChanges } = context;
  const findings = [];
  const valid = delta.nodes.addedIds.length === 1 && delta.edges.changedIds.length === 1
    && delta.edges.addedIds.length === 0 && delta.edges.removedIds.length === 0
    && otherChanges.length === 0;
  if (!valid) findings.push(finding('DISCONNECT_ENDPOINT_DELTA_INVALID',
    'DISCONNECT_ENDPOINT must add one node and change one edge.',
    [...nodeChanges, ...edgeChanges]));
  if (!sameIds(additionsByCommand, delta.nodes.addedIds)) findings.push(finding(
    'DISCONNECT_PROVENANCE_INVALID', 'Disconnected node provenance does not match command identity.',
    additionsByCommand));
  return findings;
}
function validateDelete(context) {
  const { delta, nodeChanges, edgeChanges, otherChanges } = context;
  const valid = delta.edges.removedIds.length === 1 && delta.edges.addedIds.length === 0
    && delta.nodes.addedIds.length === 0 && delta.nodes.removedIds.length === 0
    && otherChanges.length === 0;
  return valid ? [] : [finding('DELETE_EDGE_DELTA_INVALID',
    'DELETE_EDGE must remove exactly one edge and no other record.',
    [...nodeChanges, ...edgeChanges])];
}

function changes(delta = {}) {
  return [...(delta.addedIds ?? []), ...(delta.removedIds ?? []), ...(delta.changedIds ?? [])];
}
function noChanges(delta, keys) {
  return keys.every((key) => changes(delta[key]).length === 0);
}
function validateBendDefinition(candidate) {
  const delta = candidate.topologyDelta; const ids = delta.bends?.addedIds ?? [];
  const bend = candidate.canonicalTopology.bends?.find((row) => row.id === ids[0]);
  const valid = ids.length === 1 && delta.edges.changedIds.length === 2
    && (bend?.edgeIds ?? []).every((id) => delta.edges.changedIds.includes(id))
    && bend?.createdByCommandId === candidate.commandId
    && noChanges(delta, ['nodes', 'junctions', 'supports', 'boundaries', 'rigids']);
  return valid ? [] : [finding('ADD_BEND_DEFINITION_DELTA_INVALID',
    'ADD_BEND_DEFINITION must add one bend and cross-reference exactly two existing arm edges.',
    [...ids, ...delta.edges.changedIds])];
}
function validateJunctionDefinition(candidate) {
  const delta = candidate.topologyDelta; const ids = delta.junctions.addedIds;
  const row = candidate.canonicalTopology.junctions.find((item) => item.id === ids[0]);
  const valid = ids.length === 1 && delta.junctions.removedIds.length === 0
    && delta.junctions.changedIds.length === 0
    && row?.createdByCommandId === candidate.commandId
    && noChanges(delta, ['nodes', 'edges', 'supports', 'boundaries', 'rigids', 'bends']);
  return valid ? [] : [finding('ADD_JUNCTION_DEFINITION_DELTA_INVALID',
    'ADD_JUNCTION_DEFINITION must add exactly one junction definition.', ids)];
}
function validateTrim(candidate) {
  const delta = candidate.topologyDelta;
  const valid = delta.nodes.changedIds.length === 1 && delta.edges.changedIds.length === 1
    && delta.nodes.addedIds.length === 0 && delta.nodes.removedIds.length === 0
    && delta.edges.addedIds.length === 0 && delta.edges.removedIds.length === 0
    && noChanges(delta, ['junctions', 'supports', 'boundaries', 'rigids', 'bends']);
  return valid ? [] : [finding('TRIM_EDGE_DELTA_INVALID',
    'TRIM_EDGE must change exactly one graph-open endpoint node and its existing edge.',
    [...changes(delta.nodes), ...changes(delta.edges)])];
}
const VALIDATORS = Object.freeze({
  CREATE_NODE: validateCreateNode,
  MOVE_NODE: validateMove, MERGE_NODES: validateMerge,
  BRIDGE_GAP: validateAddedEdge, ADD_STRAIGHT_ELEMENT: validateAddedEdge,
  SPLIT_EDGE: validateSplit, INSERT_INLINE_COMPONENT: validateInline,
  DISCONNECT_ENDPOINT: validateDisconnect,
  DELETE_EDGE: validateDelete, ADD_BEND_DEFINITION: validateBendDefinition,
  ADD_JUNCTION_DEFINITION: validateJunctionDefinition, TRIM_EDGE: validateTrim,
});
export function validateTopologyEditCommandEffect(candidate) {
  const validator = VALIDATORS[candidate.commandType];
  if (!validator) return [finding('COMMAND_TYPE_UNSUPPORTED',
    `Unsupported command type ${candidate.commandType}.`, [candidate.commandType])];
  return ['ADD_BEND_DEFINITION', 'ADD_JUNCTION_DEFINITION', 'TRIM_EDGE'].includes(candidate.commandType)
    ? validator(candidate) : validator(effectContext(candidate));
}
