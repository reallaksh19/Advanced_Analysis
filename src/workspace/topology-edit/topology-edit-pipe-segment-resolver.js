import { deepFreeze, semanticHash } from '../../core/shared-piping-model/index.js';
import { assertTopologyEditSpecificationCatalogue } from './professional/topology-edit-spec-catalog.js';
import {
  assertPipeSegmentRequest,
  createPipeSegmentCatalogueBinding,
  INSERT_PIPE_SEGMENT,
  normalizePipeSegmentCommandPayload,
  PIPE_SEGMENT_RESOLVED_SCHEMA,
} from './topology-edit-pipe-segment-contract.js';
import {
  assertNoDuplicateOrOverlappingPipeSegment,
  assertPipeSegmentMinimumLength,
  createPipeSegmentGeometryEvidence,
} from './topology-edit-pipe-segment-geometry.js';
import { assertCanonicalTopologyHash } from './topology-edit-canonical-state.js';

function fail(message, Constructor = TypeError) {
  throw new Constructor(`TopologyEditPipeSegmentResolver: ${message}`);
}
function requiredText(value, label) {
  const text = String(value ?? '').trim();
  if (!text) fail(`${label} is required.`);
  return text;
}
function exactNode(topology, id, role) {
  const matches = (topology.nodes ?? []).filter((node) => node.id === id);
  if (matches.length !== 1) {
    fail(`${role} node ${id} resolved ${matches.length} records.`, RangeError);
  }
  const record = matches[0];
  return deepFreeze({
    kind: 'NODE',
    id,
    role,
    revision: semanticHash({ kind: 'NODE', record }),
    adjacencyHash: semanticHash({
      nodeId: id,
      edgeIds: (topology.edges ?? []).filter((edge) => (
        edge.fromNodeId === id || edge.toNodeId === id
      )).map((edge) => edge.id).sort(),
    }),
    record,
  });
}
function digest(commandId, role) {
  return semanticHash({ commandId, role }).split(':').at(-1).slice(0, 32);
}
function generatedIdentities(topology, commandId) {
  const componentKey = `native-component:${digest(commandId, 'pipe-component')}`;
  const generated = {
    edgeId: `edge:${digest(commandId, 'pipe-edge')}`,
    componentKey,
    fromPortKey: `${componentKey}:port:from`,
    toPortKey: `${componentKey}:port:to`,
  };
  const recordIds = new Set([
    ...(topology.nodes ?? []).map((row) => row.id),
    ...(topology.edges ?? []).map((row) => row.id),
    ...(topology.junctions ?? []).map((row) => row.id),
    ...(topology.supports ?? []).map((row) => row.id),
    ...(topology.boundaries ?? []).map((row) => row.id),
    ...(topology.rigids ?? []).map((row) => row.id),
    ...(topology.bends ?? []).map((row) => row.id),
  ]);
  if (recordIds.has(generated.edgeId)) {
    fail(`generated identity collision ${generated.edgeId}.`, Error);
  }
  if ((topology.edges ?? []).some((edge) => edge.componentKey === componentKey)) {
    fail(`generated component collision ${componentKey}.`, Error);
  }
  const portKeys = new Set((topology.nodes ?? []).flatMap((node) => node.portKeys ?? []));
  if (portKeys.has(generated.fromPortKey) || portKeys.has(generated.toPortKey)) {
    fail(`generated port identity collision ${componentKey}.`, Error);
  }
  return generated;
}
function targetMaterial(topology, payloadInput, commandId) {
  const payload = normalizePipeSegmentCommandPayload(payloadInput);
  const from = exactNode(topology, payload.fromNodeId, 'FROM');
  const to = exactNode(topology, payload.toNodeId, 'TO');
  const geometry = createPipeSegmentGeometryEvidence(from.record.position, to.record.position);
  assertPipeSegmentMinimumLength(geometry, payload.segmentPolicy.minimumLengthMm);
  assertNoDuplicateOrOverlappingPipeSegment(
    topology,
    from.id,
    to.id,
    geometry,
    payload.segmentPolicy.overlapToleranceMm,
  );
  return {
    payload,
    from,
    to,
    geometry,
    generated: generatedIdentities(topology, commandId),
  };
}

export function resolvePipeSegmentCommandTargets(topology, request) {
  assertCanonicalTopologyHash(topology);
  const commandId = requiredText(request?.commandId, 'commandId');
  const resolved = targetMaterial(topology, request?.payload, commandId);
  return deepFreeze({
    nodes: [resolved.from, resolved.to],
    edges: [],
    endpointPortKeys: [],
    generated: { ...resolved.generated, geometry: resolved.geometry },
  });
}

function assertExpectedRevisions(expected, targets) {
  const actual = Object.fromEntries(targets.map((target) => [target.id, target.revision]));
  for (const [id, revision] of Object.entries(expected)) {
    if (!(id in actual)) {
      fail(`expected revision references unresolved target ${id}.`, RangeError);
    }
    if (actual[id] !== revision) fail(`stale target revision for ${id}.`, Error);
  }
}

export function resolvePipeSegment({
  commandId: id,
  request: input,
  canonicalTopology,
  catalogue,
} = {}) {
  const commandId = requiredText(id, 'commandId');
  const request = assertPipeSegmentRequest(input);
  assertCanonicalTopologyHash(canonicalTopology);
  const currentCatalogue = assertTopologyEditSpecificationCatalogue(catalogue);
  const expectedBinding = createPipeSegmentCatalogueBinding({
    catalogue: currentCatalogue,
    recordId: request.catalogueBinding.recordId,
  });
  if (expectedBinding.bindingHash !== request.catalogueBinding.bindingHash) {
    fail('catalogue binding is stale or changed.', RangeError);
  }
  const resolved = targetMaterial(canonicalTopology, request, commandId);
  assertExpectedRevisions(request.expectedTargetRevisions, [resolved.from, resolved.to]);
  const material = {
    schema: PIPE_SEGMENT_RESOLVED_SCHEMA,
    commandId,
    commandType: INSERT_PIPE_SEGMENT,
    requestHash: request.requestHash,
    priorCanonicalHash: canonicalTopology.canonicalTopologyHash,
    sourceHash: canonicalTopology.sourceHash,
    catalogueHash: currentCatalogue.catalogueHash,
    targets: { from: resolved.from, to: resolved.to },
    targetRevisions: {
      [resolved.from.id]: resolved.from.revision,
      [resolved.to.id]: resolved.to.revision,
    },
    catalogueBinding: expectedBinding,
    segmentPolicy: request.segmentPolicy,
    geometry: resolved.geometry,
    generated: resolved.generated,
  };
  return deepFreeze({ ...material, resolutionHash: semanticHash(material) });
}
