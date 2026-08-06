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
  const payload = candidate.resolvedPayload
    ?? candidate.resolvedCommand?.payload
    ?? candidate.request?.payload
    ?? {};
  const placement = String(payload.placement ?? 'INTERIOR').toUpperCase();
  const boundary = placement !== 'INTERIOR';
  const expectedNodeCount = boundary ? 1 : 2;
  const expectedEdgeCount = boundary ? 2 : 3;
  const inserted = (candidate.canonicalTopology.edges ?? []).filter((edge) => (
    edge.createdByCommandId === candidate.commandId
    && edge.topologyOperation === 'INSERT_INLINE_COMPONENT'
  ));
  const valid = delta.nodes.addedIds.length === expectedNodeCount
    && delta.nodes.removedIds.length === 0
    && delta.edges.addedIds.length === expectedEdgeCount
    && delta.edges.removedIds.length === 1
    && otherChanges.length === 0;
  if (!valid) findings.push(finding(
    'INSERT_INLINE_COMPONENT_DELTA_INVALID',
    `INSERT_INLINE_COMPONENT ${placement} must add ${expectedNodeCount} node(s) and ${expectedEdgeCount} edges while replacing one host edge.`,
    [...nodeChanges, ...edgeChanges],
  ));
  if (!sameIds(additionsByCommand, [...delta.nodes.addedIds, ...delta.edges.addedIds])) {
    findings.push(finding(
      'INSERT_INLINE_COMPONENT_PROVENANCE_INVALID',
      'Inline insertion additions do not carry exact command provenance.',
      additionsByCommand,
    ));
  }
  const component = inserted[0];
  if (inserted.length !== 1
    || !component?.catalogueRecordId
    || !component?.catalogueRecordHash
    || !component?.catalogueHash
    || !component?.catalogueSourceHash
    || component.inlinePlacement !== placement) {
    findings.push(finding(
      'INSERT_INLINE_COMPONENT_CATALOGUE_PROVENANCE_INVALID',
      'Inline insertion must create exactly one placement-accurate catalogue-bound component edge.',
      inserted.map((edge) => edge.id),
    ));
  }
  const expectedAssembly = payload.assemblyBinding ?? null;
  if (expectedAssembly) {
    const validAssembly = component?.assemblyId === expectedAssembly.assemblyId
      && component?.assemblyHash === expectedAssembly.assemblyHash
      && component?.assemblyRole === expectedAssembly.role
      && semanticHash(component?.assemblyBinding ?? null) === semanticHash(expectedAssembly);
    if (!validAssembly) findings.push(finding(
      'INSERT_INLINE_COMPONENT_ASSEMBLY_PROVENANCE_INVALID',
      'Assembly-bound insertion must preserve exact assembly identity, role, and derived evidence.',
      component ? [component.id] : [],
    ));
  }
  findings.push(...validateBlindFlangeTerminalEffect(candidate, payload, component, placement));
  return findings;
}
function validateBlindFlangeTerminalEffect(candidate, payload, component, placement) {
  const binding = payload.catalogueBinding ?? {};
  const blind = String(binding.componentType ?? '').toUpperCase() === 'FLANGE'
    && String(binding.flangeType ?? '').toUpperCase() === 'BLIND';
  if (!blind) return [];
  const facing = String(binding.flangeFacing ?? '').trim().toUpperCase();
  const closedConnection = facing ? `CLOSED_${facing}` : '';
  const expectedDirection = placement === 'FROM_BOUNDARY' ? 'TO_FROM' : 'FROM_TO';
  const terminalNodeId = placement === 'FROM_BOUNDARY'
    ? component?.fromNodeId
    : component?.toNodeId;
  const incident = terminalNodeId
    ? (candidate.canonicalTopology.edges ?? []).filter((edge) => (
      edge.fromNodeId === terminalNodeId || edge.toNodeId === terminalNodeId
    ))
    : [];
  const dependants = terminalNodeId ? terminalNodeDependants(
    candidate.canonicalTopology,
    terminalNodeId,
  ) : [];
  const connectionValid = placement === 'FROM_BOUNDARY'
    ? component?.endConnectionFrom === closedConnection
      && component?.endConnectionTo === 'PIPE_TERMINAL'
    : component?.endConnectionFrom === 'PIPE_TERMINAL'
      && component?.endConnectionTo === closedConnection;
  const valid = ['FROM_BOUNDARY', 'TO_BOUNDARY'].includes(placement)
    && String(payload.direction ?? '').toUpperCase() === expectedDirection
    && payload.assemblyBinding == null
    && component?.entityType === 'FLANGE'
    && component?.flangeType === 'BLIND'
    && component?.inlinePlacement === placement
    && component?.catalogueBinding?.recordHash === binding.recordHash
    && binding.endConnectionFrom === 'PIPE_TERMINAL'
    && binding.endConnectionTo === closedConnection
    && Number(binding.componentLengthMm) > 0
    && Number(binding.flangeThicknessMm) > 0
    && Math.abs(Number(binding.componentLengthMm) - Number(binding.flangeThicknessMm)) <= 1e-9
    && connectionValid
    && incident.length === 1
    && incident[0]?.id === component?.id
    && dependants.length === 0;
  return valid ? [] : [finding(
    'INSERT_BLIND_FLANGE_TERMINAL_INVALID',
    'Blind flange insertion must close one dependency-free graph-open pipe endpoint with exact boundary orientation and catalogue connection evidence.',
    [component?.id, terminalNodeId, ...incident.map((edge) => edge.id), ...dependants]
      .filter(Boolean),
  )];
}
function terminalNodeDependants(topology, nodeId) {
  const collections = ['junctions', 'supports', 'boundaries', 'rigids', 'bends'];
  return collections.flatMap((key) => (topology[key] ?? []).filter((record) => (
    ['nodeId', 'fromNodeId', 'toNodeId'].some((field) => record?.[field] === nodeId)
    || ['nodeIds', 'fromNodeIds', 'toNodeIds'].some((field) => (
      record?.[field]?.includes?.(nodeId)
    ))
  )).map((record) => `${key}:${record.id}`));
}
function validateBranchComponent(candidate) {
  const delta = candidate.topologyDelta;
  const payload = candidate.resolvedPayload
    ?? candidate.resolvedCommand?.payload
    ?? candidate.request?.payload
    ?? {};
  const nodes = (candidate.canonicalTopology.nodes ?? []).filter((row) => (
    row.createdByCommandId === candidate.commandId
    && row.topologyOperation === 'INSERT_BRANCH_COMPONENT'
  ));
  const edges = (candidate.canonicalTopology.edges ?? []).filter((row) => (
    row.createdByCommandId === candidate.commandId
    && row.topologyOperation === 'INSERT_BRANCH_COMPONENT'
  ));
  const junctions = (candidate.canonicalTopology.junctions ?? []).filter((row) => (
    row.createdByCommandId === candidate.commandId
    && row.topologyOperation === 'INSERT_BRANCH_COMPONENT'
  ));
  const validDelta = delta.nodes.addedIds.length === 3
    && delta.nodes.removedIds.length === 0
    && delta.edges.addedIds.length === 4
    && delta.edges.removedIds.length === 1
    && delta.junctions.addedIds.length === 1
    && delta.junctions.removedIds.length === 0
    && noChanges(delta, ['supports', 'boundaries', 'rigids', 'bends']);
  const component = edges.find((edge) => edge.branchComponentRole === 'BRANCH_COMPONENT');
  const junction = junctions[0];
  const incident = component && junction
    ? edges.filter((edge) => (
      edge.fromNodeId === junction.nodeId || edge.toNodeId === junction.nodeId
    ))
    : [];
  const exactAuthority = component
    && component.catalogueHash === payload.catalogueHash
    && component.catalogueSourceHash === payload.catalogueSourceHash
    && component.catalogueRecordId === payload.catalogueRecordId
    && component.catalogueRecordHash === payload.catalogueRecordHash
    && component.branchGeometryHash === payload.geometry?.geometryHash
    && junction?.catalogueRecordHash === payload.catalogueRecordHash
    && junction?.branchComponentRequestHash === payload.requestHash;
  const valid = validDelta
    && nodes.length === 3
    && edges.length === 4
    && junctions.length === 1
    && incident.length === 3
    && exactAuthority;
  return valid ? [] : [finding(
    'INSERT_BRANCH_COMPONENT_DELTA_INVALID',
    'INSERT_BRANCH_COMPONENT must replace one host edge with exact degree-three catalogue-bound branch topology.',
    [
      ...changes(delta.nodes),
      ...changes(delta.edges),
      ...changes(delta.junctions),
    ],
  )];
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
  INSERT_BRANCH_COMPONENT: validateBranchComponent,
  DISCONNECT_ENDPOINT: validateDisconnect,
  DELETE_EDGE: validateDelete, ADD_BEND_DEFINITION: validateBendDefinition,
  ADD_JUNCTION_DEFINITION: validateJunctionDefinition, TRIM_EDGE: validateTrim,
});
export function validateTopologyEditCommandEffect(candidate) {
  const validator = VALIDATORS[candidate.commandType];
  if (!validator) return [finding('COMMAND_TYPE_UNSUPPORTED',
    `Unsupported command type ${candidate.commandType}.`, [candidate.commandType])];
  return [
    'ADD_BEND_DEFINITION',
    'ADD_JUNCTION_DEFINITION',
    'INSERT_BRANCH_COMPONENT',
    'TRIM_EDGE',
  ].includes(candidate.commandType)
    ? validator(candidate) : validator(effectContext(candidate));
}
