import { deepFreeze, semanticHash } from '../../core/shared-piping-model/index.js';

export const TOPOLOGY_EDIT_JUNCTION_RELATION_SCHEMA =
  'TopologyEditJunctionBranchRelation.v1';

const RELATION_POLICY = 'EXPLICIT_REDUCER';
const EPSILON_MM = 1e-9;

export function normalizeTopologyEditJunctionRelationPayload(input = {}) {
  const runNodeIds = distinctIds(input.runNodeIds, 2, 'runNodeIds').sort();
  const material = {
    schema: TOPOLOGY_EDIT_JUNCTION_RELATION_SCHEMA,
    junctionId: requiredText(input.junctionId, 'junctionId'),
    branchNodeId: requiredText(input.branchNodeId, 'branchNodeId'),
    branchPortKey: requiredText(input.branchPortKey, 'branchPortKey'),
    runNodeIds,
    reducerEdgeId: requiredText(input.reducerEdgeId, 'reducerEdgeId'),
    reducerCatalogueBinding: exactReducerBinding(input.reducerCatalogueBinding),
    runNominalSizeMm: positive(input.runNominalSizeMm, 'runNominalSizeMm'),
    teeBranchNominalSizeMm: positive(
      input.teeBranchNominalSizeMm,
      'teeBranchNominalSizeMm',
    ),
    downstreamNominalSizeMm: positive(
      input.downstreamNominalSizeMm,
      'downstreamNominalSizeMm',
    ),
    relationPolicy: requiredPolicy(input.relationPolicy ?? RELATION_POLICY),
  };
  if (material.teeBranchNominalSizeMm <= material.downstreamNominalSizeMm + EPSILON_MM) {
    throw new RangeError(
      'TopologyEditJunctionRelation: explicit reducer must reduce from tee branch size to a smaller downstream size.',
    );
  }
  return deepFreeze({ ...material, relationHash: semanticHash(material) });
}

export function assertTopologyEditJunctionRelationTarget(topology, payloadInput) {
  const payload = normalizeTopologyEditJunctionRelationPayload(payloadInput);
  const junction = exact(topology?.junctions, payload.junctionId, 'junction');
  if (token(junction.entityType ?? junction.kind) !== 'TEE') {
    throw new RangeError(`TopologyEditJunctionRelation: ${junction.id} is not a TEE junction.`);
  }
  const junctionNodeIds = uniqueSorted(junction.nodeIds ?? []);
  if (junctionNodeIds.length !== 3) {
    throw new RangeError(
      `TopologyEditJunctionRelation: ${junction.id} must expose exactly three canonical port nodes.`,
    );
  }
  if (!junctionNodeIds.includes(payload.branchNodeId)) {
    throw new RangeError('TopologyEditJunctionRelation: branchNodeId is not a junction node.');
  }
  const expectedRunNodes = junctionNodeIds.filter((id) => id !== payload.branchNodeId).sort();
  if (!sameIds(expectedRunNodes, payload.runNodeIds)) {
    throw new RangeError('TopologyEditJunctionRelation: runNodeIds are not the exact non-branch junction nodes.');
  }
  const branchNode = exact(topology?.nodes, payload.branchNodeId, 'branch node');
  if (!(branchNode.portKeys ?? []).includes(payload.branchPortKey)) {
    throw new RangeError('TopologyEditJunctionRelation: branchPortKey is not bound to branchNodeId.');
  }
  const reducer = exact(topology?.edges, payload.reducerEdgeId, 'reducer edge');
  if (token(reducer.entityType) !== 'REDUCER') {
    throw new RangeError(`TopologyEditJunctionRelation: ${reducer.id} is not a REDUCER edge.`);
  }
  const branchEndpoint = reducer.fromNodeId === payload.branchNodeId
    ? 'FROM'
    : reducer.toNodeId === payload.branchNodeId ? 'TO' : null;
  if (!branchEndpoint) {
    throw new RangeError('TopologyEditJunctionRelation: reducer is not directly connected to the tee branch node.');
  }
  const binding = payload.reducerCatalogueBinding;
  if (reducer.catalogueBinding?.recordHash
    && reducer.catalogueBinding.recordHash !== binding.recordHash) {
    throw new RangeError(
      'TopologyEditJunctionRelation: reducer canonical catalogue evidence differs from intent custody.',
    );
  }
  const branchSize = branchEndpoint === 'FROM'
    ? binding.fromNominalSizeMm : binding.toNominalSizeMm;
  const downstreamSize = branchEndpoint === 'FROM'
    ? binding.toNominalSizeMm : binding.fromNominalSizeMm;
  if (!nearlyEqual(branchSize, payload.teeBranchNominalSizeMm)
    || !nearlyEqual(downstreamSize, payload.downstreamNominalSizeMm)) {
    throw new RangeError(
      'TopologyEditJunctionRelation: exact reducer endpoint sizes do not match the declared tee/downstream relation.',
    );
  }
  if (junction.branchRelation
    && junction.branchRelation.reducerEdgeId === reducer.id
    && junction.branchRelation.relationHash === payload.relationHash) {
    throw new RangeError('TopologyEditJunctionRelation: relation edit is a no-op.');
  }
  return deepFreeze({ payload, junction, branchNode, reducer, binding, branchEndpoint });
}

export function applyTopologyEditJunctionRelation(topology, command) {
  const target = assertTopologyEditJunctionRelationTarget(topology, command.payload);
  const junctions = clone(topology.junctions);
  const index = junctions.findIndex((row) => row.id === target.junction.id);
  const relation = {
    schema: TOPOLOGY_EDIT_JUNCTION_RELATION_SCHEMA,
    relationPolicy: target.payload.relationPolicy,
    branchNodeId: target.payload.branchNodeId,
    branchPortKey: target.payload.branchPortKey,
    runNodeIds: target.payload.runNodeIds,
    reducerEdgeId: target.reducer.id,
    reducerRecordId: target.binding.recordId,
    reducerRecordHash: target.binding.recordHash,
    reducerCatalogueHash: target.binding.catalogueHash,
    reducerSourceHash: target.binding.sourceHash,
    runNominalSizeMm: target.payload.runNominalSizeMm,
    teeBranchNominalSizeMm: target.payload.teeBranchNominalSizeMm,
    downstreamNominalSizeMm: target.payload.downstreamNominalSizeMm,
    relationHash: target.payload.relationHash,
  };
  junctions[index] = {
    ...target.junction,
    runDiameterMm: target.payload.runNominalSizeMm,
    branchDiameterMm: target.payload.teeBranchNominalSizeMm,
    branchNodeId: target.payload.branchNodeId,
    runNodeIds: target.payload.runNodeIds,
    branchPortKey: target.payload.branchPortKey,
    branchRelation: relation,
    topologyOperation: 'UPDATE_JUNCTION_BRANCH_RELATION',
    lastModifiedByCommandId: command.commandId,
    editAncestry: uniqueSorted([
      ...(target.junction.editAncestry ?? []),
      target.junction.id,
      command.commandId,
    ]),
  };
  return { ...topology, junctions };
}

function exactReducerBinding(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new RangeError('TopologyEditJunctionRelation: reducer requires exact catalogue binding.');
  }
  const material = {
    catalogueHash: requiredText(value.catalogueHash, 'reducer catalogueHash'),
    sourceHash: requiredText(value.sourceHash, 'reducer sourceHash'),
    recordId: requiredText(value.recordId, 'reducer recordId'),
    recordHash: requiredText(value.recordHash, 'reducer recordHash'),
    componentType: token(value.componentType),
    fromNominalSizeMm: positive(
      value.fromNominalSizeMm,
      'reducer fromNominalSizeMm',
    ),
    toNominalSizeMm: positive(value.toNominalSizeMm, 'reducer toNominalSizeMm'),
  };
  if (material.componentType !== 'REDUCER') {
    throw new RangeError('TopologyEditJunctionRelation: reducer catalogue binding componentType must be REDUCER.');
  }
  if (nearlyEqual(material.fromNominalSizeMm, material.toNominalSizeMm)) {
    throw new RangeError('TopologyEditJunctionRelation: reducer endpoint sizes must differ.');
  }
  return deepFreeze(material);
}
function distinctIds(value, count, label) {
  if (!Array.isArray(value)) throw new TypeError(`TopologyEditJunctionRelation: ${label} must be an array.`);
  const ids = value.map((row, index) => requiredText(row, `${label}[${index}]`));
  if (ids.length !== count || new Set(ids).size !== count) {
    throw new RangeError(`TopologyEditJunctionRelation: ${label} must contain exactly ${count} distinct IDs.`);
  }
  return ids;
}
function exact(rows, id, label) {
  const matches = (rows ?? []).filter((row) => row?.id === id);
  if (matches.length !== 1) throw new RangeError(`TopologyEditJunctionRelation: ${label} ${id} resolved ${matches.length} records.`);
  return matches[0];
}
function requiredText(value, label) {
  const text = String(value ?? '').trim();
  if (!text) throw new TypeError(`TopologyEditJunctionRelation: ${label} is required.`);
  return text;
}
function positive(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new RangeError(`TopologyEditJunctionRelation: ${label} must be positive.`);
  return number;
}
function requiredPolicy(value) {
  const text = token(value);
  if (text !== RELATION_POLICY) throw new RangeError(`TopologyEditJunctionRelation: unsupported relationPolicy ${text}.`);
  return text;
}
function sameIds(left, right) { return left.length === right.length && left.every((id, index) => id === right[index]); }
function uniqueSorted(values) { return [...new Set(values)].sort((a, b) => a.localeCompare(b)); }
function nearlyEqual(a, b) { return Math.abs(Number(a) - Number(b)) <= EPSILON_MM; }
function token(value) { return String(value ?? '').trim().toUpperCase(); }
function clone(value) { return JSON.parse(JSON.stringify(value ?? [])); }
