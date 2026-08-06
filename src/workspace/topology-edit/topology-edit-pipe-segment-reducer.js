import { semanticHash } from '../../core/shared-piping-model/index.js';
import {
  assertCanonicalTopologyHash,
  finalizeCanonicalTopology,
} from './topology-edit-canonical-state.js';
import {
  assertResolvedPipeSegment,
  INSERT_PIPE_SEGMENT,
} from './topology-edit-pipe-segment-contract.js';

function fail(message, Constructor = RangeError) {
  throw new Constructor(`TopologyEditPipeSegmentReducer: ${message}`);
}
function exactIndex(rows, id, label) {
  const indexes = rows.map((row, index) => row?.id === id ? index : -1)
    .filter((index) => index >= 0);
  if (indexes.length !== 1) fail(`${label} ${id} resolved ${indexes.length} records.`);
  return indexes[0];
}
function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
function addPort(node, portKey) {
  return {
    ...node,
    portKeys: [...new Set([...(node.portKeys ?? []), portKey])].sort(),
  };
}
function governedEdge(resolved) {
  const binding = resolved.catalogueBinding;
  const { edgeId, componentKey, fromPortKey, toPortKey } = resolved.generated;
  const engineeringEvidenceHash = semanticHash({
    bindingHash: binding.bindingHash,
    geometryHash: resolved.geometry.geometryHash,
  });
  return {
    id: edgeId,
    componentKey,
    fromNodeId: resolved.targets.from.id,
    toNodeId: resolved.targets.to.id,
    entityType: 'PIPE',
    identityKind: 'NATIVE_COMMAND',
    nominalSizeMm: binding.nominalSizeMm,
    outsideDiameterMm: binding.outsideDiameterMm,
    schedule: binding.schedule,
    wallThicknessMm: binding.wallThicknessMm,
    materialSpecification: binding.materialSpecification,
    pipingClass: binding.pipingClass,
    pressureClass: binding.pressureClass,
    endConnectionFrom: binding.endConnectionFrom,
    endConnectionTo: binding.endConnectionTo,
    catalogueId: binding.catalogueId,
    catalogueVersion: binding.catalogueVersion,
    catalogueHash: binding.catalogueHash,
    catalogueSourceHash: binding.catalogueSourceHash,
    catalogueRecordId: binding.recordId,
    catalogueRecordHash: binding.recordHash,
    catalogueSourceReference: binding.sourceReference,
    nativePortKeys: [fromPortKey, toPortKey],
    createdByCommandId: resolved.commandId,
    topologyOperation: INSERT_PIPE_SEGMENT,
    geometryHash: resolved.geometry.geometryHash,
    engineeringEvidenceHash,
  };
}

export function applyResolvedPipeSegment(canonicalTopology, input) {
  assertCanonicalTopologyHash(canonicalTopology);
  const resolved = assertResolvedPipeSegment(input);
  if (canonicalTopology.canonicalTopologyHash !== resolved.priorCanonicalHash) {
    fail('resolved pipe segment is stale for canonical topology.', Error);
  }
  const topology = clone(canonicalTopology);
  const fromIndex = exactIndex(topology.nodes, resolved.targets.from.id, 'FROM node');
  const toIndex = exactIndex(topology.nodes, resolved.targets.to.id, 'TO node');
  topology.nodes[fromIndex] = addPort(
    topology.nodes[fromIndex],
    resolved.generated.fromPortKey,
  );
  topology.nodes[toIndex] = addPort(
    topology.nodes[toIndex],
    resolved.generated.toPortKey,
  );
  topology.edges.push(governedEdge(resolved));
  return finalizeCanonicalTopology(topology);
}

function changedIds(beforeRows, afterRows) {
  const before = new Map((beforeRows ?? []).map((row) => [row.id, row]));
  const after = new Map((afterRows ?? []).map((row) => [row.id, row]));
  return {
    added: [...after.keys()].filter((id) => !before.has(id)).sort(),
    removed: [...before.keys()].filter((id) => !after.has(id)).sort(),
    changed: [...after.keys()].filter((id) => before.has(id)
      && semanticHash(after.get(id)) !== semanticHash(before.get(id))).sort(),
  };
}
function sameList(left, right) {
  return left.length === right.length
    && left.every((value, index) => value === right[index]);
}

export function assertPipeSegmentEffect(before, after, input) {
  assertCanonicalTopologyHash(before);
  assertCanonicalTopologyHash(after);
  const resolved = assertResolvedPipeSegment(input);
  const nodeDelta = changedIds(before.nodes, after.nodes);
  const edgeDelta = changedIds(before.edges, after.edges);
  const expectedNodes = [resolved.targets.from.id, resolved.targets.to.id].sort();
  if (nodeDelta.added.length || nodeDelta.removed.length
    || !sameList(nodeDelta.changed, expectedNodes)) {
    fail('pipe segment must change exactly its two endpoint nodes.');
  }
  if (!sameList(edgeDelta.added, [resolved.generated.edgeId])
    || edgeDelta.removed.length || edgeDelta.changed.length) {
    fail('pipe segment must add exactly one edge.');
  }
  for (const key of ['junctions', 'supports', 'boundaries', 'rigids', 'bends']) {
    const delta = changedIds(before[key], after[key]);
    if (delta.added.length || delta.removed.length || delta.changed.length) {
      fail(`pipe segment must not change ${key}.`);
    }
  }
  const edge = after.edges.find((row) => row.id === resolved.generated.edgeId);
  const exact = edge?.componentKey === resolved.generated.componentKey
    && edge?.createdByCommandId === resolved.commandId
    && edge?.topologyOperation === INSERT_PIPE_SEGMENT
    && edge?.catalogueHash === resolved.catalogueBinding.catalogueHash
    && edge?.catalogueRecordHash === resolved.catalogueBinding.recordHash
    && edge?.geometryHash === resolved.geometry.geometryHash
    && semanticHash(edge?.nativePortKeys ?? []) === semanticHash([
      resolved.generated.fromPortKey,
      resolved.generated.toPortKey,
    ]);
  if (!exact) fail('pipe segment edge evidence differs from resolved authority.');
  if (after.crosswalk.edgeIdToComponentKey[edge.id] !== edge.componentKey) {
    fail('pipe segment crosswalk does not preserve component identity.');
  }
  return after;
}
