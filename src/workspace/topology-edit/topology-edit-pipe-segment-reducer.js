import { semanticHash } from '../../core/shared-piping-model/index.js';
import {
  assertCanonicalTopologyHash,
  finalizeCanonicalTopology,
} from './topology-edit-canonical-state.js';
import {
  assertResolvedPipeSegment,
  INSERT_PIPE_SEGMENT,
  normalizePipeSegmentCommandPayload,
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
function governedEdge(command) {
  const binding = command.payload.catalogueBinding;
  const { edgeId, componentKey, fromPortKey, toPortKey, geometry } = command.generated;
  const engineeringEvidenceHash = semanticHash({
    bindingHash: binding.bindingHash,
    geometryHash: geometry.geometryHash,
  });
  return {
    id: edgeId,
    componentKey,
    fromNodeId: command.payload.fromNodeId,
    toNodeId: command.payload.toNodeId,
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
    createdByCommandId: command.commandId,
    topologyOperation: INSERT_PIPE_SEGMENT,
    geometryHash: geometry.geometryHash,
    engineeringEvidenceHash,
  };
}
function reducePipeSegment(topologyInput, command) {
  const topology = clone(topologyInput);
  const fromIndex = exactIndex(topology.nodes, command.payload.fromNodeId, 'FROM node');
  const toIndex = exactIndex(topology.nodes, command.payload.toNodeId, 'TO node');
  topology.nodes[fromIndex] = addPort(
    topology.nodes[fromIndex],
    command.generated.fromPortKey,
  );
  topology.nodes[toIndex] = addPort(
    topology.nodes[toIndex],
    command.generated.toPortKey,
  );
  topology.edges.push(governedEdge(command));
  return topology;
}

export function applyPipeSegmentCommand(topology, command) {
  if (command?.commandType !== INSERT_PIPE_SEGMENT) {
    fail(`commandType must be ${INSERT_PIPE_SEGMENT}.`);
  }
  const payload = normalizePipeSegmentCommandPayload(command.payload);
  const generated = command.targets?.generated;
  if (!generated?.edgeId || !generated?.componentKey
    || !generated?.fromPortKey || !generated?.toPortKey
    || !generated?.geometry?.geometryHash) {
    fail('resolved command is missing generated pipe authority.');
  }
  return reducePipeSegment(topology, {
    commandId: command.commandId,
    commandType: command.commandType,
    payload,
    generated,
  });
}

export function applyResolvedPipeSegment(canonicalTopology, input) {
  assertCanonicalTopologyHash(canonicalTopology);
  const resolved = assertResolvedPipeSegment(input);
  if (canonicalTopology.canonicalTopologyHash !== resolved.priorCanonicalHash) {
    fail('resolved pipe segment is stale for canonical topology.', Error);
  }
  return finalizeCanonicalTopology(reducePipeSegment(canonicalTopology, {
    commandId: resolved.commandId,
    commandType: resolved.commandType,
    payload: {
      fromNodeId: resolved.targets.from.id,
      toNodeId: resolved.targets.to.id,
      catalogueBinding: resolved.catalogueBinding,
      segmentPolicy: resolved.segmentPolicy,
    },
    generated: { ...resolved.generated, geometry: resolved.geometry },
  }));
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
function effectErrors(before, after, command) {
  const nodeDelta = changedIds(before.nodes, after.nodes);
  const edgeDelta = changedIds(before.edges, after.edges);
  const expectedNodes = [command.payload.fromNodeId, command.payload.toNodeId].sort();
  const errors = [];
  if (nodeDelta.added.length || nodeDelta.removed.length
    || !sameList(nodeDelta.changed, expectedNodes)) {
    errors.push('pipe segment must change exactly its two endpoint nodes');
  }
  if (!sameList(edgeDelta.added, [command.generated.edgeId])
    || edgeDelta.removed.length || edgeDelta.changed.length) {
    errors.push('pipe segment must add exactly one edge');
  }
  for (const key of ['junctions', 'supports', 'boundaries', 'rigids', 'bends']) {
    const delta = changedIds(before[key], after[key]);
    if (delta.added.length || delta.removed.length || delta.changed.length) {
      errors.push(`pipe segment must not change ${key}`);
    }
  }
  const edge = after.edges.find((row) => row.id === command.generated.edgeId);
  const exact = edge?.componentKey === command.generated.componentKey
    && edge?.createdByCommandId === command.commandId
    && edge?.topologyOperation === INSERT_PIPE_SEGMENT
    && edge?.catalogueHash === command.payload.catalogueBinding.catalogueHash
    && edge?.catalogueRecordHash === command.payload.catalogueBinding.recordHash
    && edge?.geometryHash === command.generated.geometry.geometryHash
    && semanticHash(edge?.nativePortKeys ?? []) === semanticHash([
      command.generated.fromPortKey,
      command.generated.toPortKey,
    ]);
  if (!exact) errors.push('pipe segment edge evidence differs from resolved authority');
  if (edge && after.crosswalk.edgeIdToComponentKey[edge.id] !== edge.componentKey) {
    errors.push('pipe segment crosswalk does not preserve component identity');
  }
  return { errors, edge };
}

export function validatePipeSegmentCommandEffect(candidate, before) {
  const payload = normalizePipeSegmentCommandPayload(candidate.resolvedPayload);
  const generated = candidate.resolvedCommand?.targets?.generated
    ?? candidate.targets?.generated;
  if (!generated) {
    return [{
      code: 'INSERT_PIPE_SEGMENT_GENERATED_AUTHORITY_MISSING',
      message: 'INSERT_PIPE_SEGMENT is missing generated identity and geometry evidence.',
      targetIds: [],
    }];
  }
  const { errors, edge } = effectErrors(before, candidate.canonicalTopology, {
    commandId: candidate.commandId,
    payload,
    generated,
  });
  return errors.map((message) => ({
    code: 'INSERT_PIPE_SEGMENT_EFFECT_INVALID',
    message,
    targetIds: [edge?.id, payload.fromNodeId, payload.toNodeId].filter(Boolean).sort(),
  }));
}

export function assertPipeSegmentEffect(before, after, input) {
  assertCanonicalTopologyHash(before);
  assertCanonicalTopologyHash(after);
  const resolved = assertResolvedPipeSegment(input);
  const command = {
    commandId: resolved.commandId,
    payload: {
      fromNodeId: resolved.targets.from.id,
      toNodeId: resolved.targets.to.id,
      catalogueBinding: resolved.catalogueBinding,
    },
    generated: { ...resolved.generated, geometry: resolved.geometry },
  };
  const { errors } = effectErrors(before, after, command);
  if (errors.length) fail(errors.join('; '));
  return after;
}
