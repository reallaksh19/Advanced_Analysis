import {
  deepFreeze,
  semanticHash,
  stringValue,
} from '../../core/shared-piping-model/index.js';
import {
  assertTopologyEditAuthoringBranchGeometry,
  deriveTopologyEditAuthoringBranchGeometry,
} from './authoring/topology-edit-authoring-branch-geometry.js';

export const TOPOLOGY_EDIT_BRANCH_COMPONENT_REQUEST_SCHEMA =
  'TopologyEditBranchComponentRequest.v1';
export const TOPOLOGY_EDIT_BRANCH_COMPONENT_EFFECT_SCHEMA =
  'TopologyEditBranchComponentEffect.v1';

const STRAIGHT_TYPES = new Set(['PIPE', 'STRAIGHT', 'STRAIGHT_ELEMENT']);
const DEPENDANT_COLLECTIONS = ['junctions', 'supports', 'boundaries', 'rigids', 'bends'];

export function normalizeTopologyEditBranchComponentRequest(input = {}) {
  const operationId = requiredText(input.operationId, 'operationId');
  const hostEdgeId = requiredText(input.hostEdgeId, 'hostEdgeId');
  const hostEdgeHash = requiredHash(input.hostEdgeHash, 'hostEdgeHash');
  const catalogueHash = requiredHash(input.catalogueHash, 'catalogueHash');
  const catalogueSourceHash = requiredHash(
    input.catalogueSourceHash,
    'catalogueSourceHash',
  );
  const catalogueVersion = requiredText(input.catalogueVersion, 'catalogueVersion');
  const catalogueRecordId = requiredText(input.catalogueRecordId, 'catalogueRecordId');
  const catalogueRecordHash = requiredHash(
    input.catalogueRecordHash,
    'catalogueRecordHash',
  );
  const hostNominalSizeMm = positiveNumber(input.hostNominalSizeMm, 'hostNominalSizeMm');
  const hostOutsideDiameterMm = positiveNumber(
    input.hostOutsideDiameterMm,
    'hostOutsideDiameterMm',
  );
  const branchNominalSizeMm = positiveNumber(
    input.branchNominalSizeMm,
    'branchNominalSizeMm',
  );
  const branchOutsideDiameterMm = positiveNumber(
    input.branchOutsideDiameterMm,
    'branchOutsideDiameterMm',
  );
  const componentMassKg = positiveNumber(input.componentMassKg, 'componentMassKg');
  const branchAngleDeg = positiveNumber(input.branchAngleDeg, 'branchAngleDeg');
  if (!(branchAngleDeg < 180)) {
    throw new RangeError(
      'TopologyEditBranchComponentRequest: branchAngleDeg must be less than 180.',
    );
  }
  const geometry = deriveTopologyEditAuthoringBranchGeometry({
    branchFamily: input.branchFamily,
    hostFrom: input.hostFrom,
    hostTo: input.hostTo,
    stationMm: input.stationMm,
    clockingDeg: input.clockingDeg,
    componentLengthMm: input.componentLengthMm,
    branchPipeLengthMm: input.branchPipeLengthMm,
  });

  const material = {
    schema: TOPOLOGY_EDIT_BRANCH_COMPONENT_REQUEST_SCHEMA,
    operationId,
    hostEdgeId,
    hostEdgeHash,
    hostFromNodeId: requiredText(input.hostFromNodeId, 'hostFromNodeId'),
    hostToNodeId: requiredText(input.hostToNodeId, 'hostToNodeId'),
    catalogueHash,
    catalogueSourceHash,
    catalogueVersion,
    catalogueRecordId,
    catalogueRecordHash,
    sourceReference: normalizeSourceReference(input.sourceReference),
    branchFamily: geometry.branchFamily,
    hostNominalSizeMm,
    hostOutsideDiameterMm,
    branchNominalSizeMm,
    branchOutsideDiameterMm,
    branchAngleDeg,
    pipingClass: optionalText(input.pipingClass, true),
    pressureClass: optionalText(input.pressureClass, true),
    materialSpecification: optionalText(input.materialSpecification, true),
    hostEndConnection: optionalText(input.hostEndConnection, true),
    branchEndConnection: optionalText(input.branchEndConnection, true),
    componentLengthMm: geometry.componentLengthMm,
    componentMassKg,
    branchPipeLengthMm: geometry.branchPipeLengthMm,
    stationMm: geometry.stationMm,
    clockingDeg: geometry.clockingDeg,
    geometry,
  };
  return deepFreeze({ ...material, requestHash: semanticHash(material) });
}

export function assertTopologyEditBranchComponentRequest(value) {
  if (!value || value.schema !== TOPOLOGY_EDIT_BRANCH_COMPONENT_REQUEST_SCHEMA) {
    throw new TypeError(
      `TopologyEditBranchComponentRequest: request must use ${TOPOLOGY_EDIT_BRANCH_COMPONENT_REQUEST_SCHEMA}.`,
    );
  }
  const supplied = { ...value };
  delete supplied.requestHash;
  if (value.requestHash !== semanticHash(supplied)) {
    throw new RangeError('TopologyEditBranchComponentRequest: request hash mismatch.');
  }
  assertTopologyEditAuthoringBranchGeometry(value.geometry);
  return value;
}

export function assertTopologyEditBranchComponentTarget(topology, requestInput) {
  const request = requestInput?.schema
    ? assertTopologyEditBranchComponentRequest(requestInput)
    : normalizeTopologyEditBranchComponentRequest(requestInput);
  if (!topology?.canonicalTopologyHash || !Array.isArray(topology.nodes)
    || !Array.isArray(topology.edges)) {
    throw new TypeError('TopologyEditBranchComponent: canonical topology is required.');
  }
  const edge = exactRecord(topology.edges, request.hostEdgeId, 'host edge');
  const from = exactRecord(topology.nodes, edge.fromNodeId, 'host FROM node');
  const to = exactRecord(topology.nodes, edge.toNodeId, 'host TO node');
  if (!STRAIGHT_TYPES.has(normalizedType(edge.entityType))) {
    throw new RangeError('TopologyEditBranchComponent: host edge must be straight pipe.');
  }
  if (request.hostFromNodeId !== edge.fromNodeId
    || request.hostToNodeId !== edge.toNodeId) {
    throw new RangeError('TopologyEditBranchComponent: host endpoint identity mismatch.');
  }
  const edgeHash = semanticHash({ kind: 'EDGE', record: edge });
  if (request.hostEdgeHash !== edgeHash) {
    throw new RangeError('TopologyEditBranchComponent: host edge hash mismatch.');
  }
  if (!nearlyEqual(edge.diameterMm, request.hostNominalSizeMm)
    || !nearlyEqual(edge.outsideDiameterMm, request.hostOutsideDiameterMm)) {
    throw new RangeError('TopologyEditBranchComponent: host size evidence mismatch.');
  }
  if (edge.pipingClass && request.pipingClass
    && normalizedType(edge.pipingClass) !== normalizedType(request.pipingClass)) {
    throw new RangeError('TopologyEditBranchComponent: piping class mismatch.');
  }
  for (const collection of DEPENDANT_COLLECTIONS) {
    const dependant = (topology[collection] ?? []).find((record) => (
      record?.edgeId === edge.id || record?.edgeIds?.includes?.(edge.id)
    ));
    if (dependant) {
      throw new RangeError(
        `TopologyEditBranchComponent: host edge has dependent ${collection} record ${dependant.id}.`,
      );
    }
  }
  const geometry = deriveTopologyEditAuthoringBranchGeometry({
    branchFamily: request.branchFamily,
    hostFrom: from.position,
    hostTo: to.position,
    stationMm: request.stationMm,
    clockingDeg: request.clockingDeg,
    componentLengthMm: request.componentLengthMm,
    branchPipeLengthMm: request.branchPipeLengthMm,
  });
  if (geometry.geometryHash !== request.geometry.geometryHash) {
    throw new RangeError('TopologyEditBranchComponent: geometry differs from current host authority.');
  }
  const effect = createTopologyEditBranchComponentEffect(request);
  return deepFreeze({ request, edge, from, to, geometry, effect });
}

export function createTopologyEditBranchComponentEffect(requestInput) {
  const request = requestInput?.schema
    ? assertTopologyEditBranchComponentRequest(requestInput)
    : normalizeTopologyEditBranchComponentRequest(requestInput);
  const token = request.requestHash.replace(/^sha256:/u, '').slice(0, 16);
  const junctionNodeId = `node:branch-junction:${token}`;
  const componentFaceNodeId = `node:branch-component-face:${token}`;
  const branchEndNodeId = `node:branch-end:${token}`;
  const upstreamEdgeId = `edge:branch-host-from:${token}`;
  const downstreamEdgeId = `edge:branch-host-to:${token}`;
  const componentEdgeId = `edge:branch-component:${token}`;
  const branchPipeEdgeId = `edge:branch-pipe:${token}`;
  const junctionId = `junction:branch:${token}`;

  const material = {
    schema: TOPOLOGY_EDIT_BRANCH_COMPONENT_EFFECT_SCHEMA,
    operationId: request.operationId,
    requestHash: request.requestHash,
    catalogueHash: request.catalogueHash,
    catalogueSourceHash: request.catalogueSourceHash,
    catalogueVersion: request.catalogueVersion,
    catalogueRecordId: request.catalogueRecordId,
    catalogueRecordHash: request.catalogueRecordHash,
    removedEdgeIds: [request.hostEdgeId],
    generatedNodeIds: [junctionNodeId, componentFaceNodeId, branchEndNodeId],
    generatedEdgeIds: [
      upstreamEdgeId,
      downstreamEdgeId,
      componentEdgeId,
      branchPipeEdgeId,
    ],
    generatedJunctionIds: [junctionId],
    nodes: [
      node(junctionNodeId, request.geometry.junctionPoint, 'HOST_JUNCTION'),
      node(componentFaceNodeId, request.geometry.componentFacePoint, 'COMPONENT_FACE'),
      node(branchEndNodeId, request.geometry.branchEndPoint, 'BRANCH_END'),
    ],
    edges: [
      pipeEdge({
        id: upstreamEdgeId,
        fromNodeId: request.hostFromNodeId,
        toNodeId: junctionNodeId,
        lengthMm: request.geometry.upstreamPipeLengthMm,
        role: 'HOST_FROM',
        request,
      }),
      pipeEdge({
        id: downstreamEdgeId,
        fromNodeId: junctionNodeId,
        toNodeId: request.hostToNodeId,
        lengthMm: request.geometry.downstreamPipeLengthMm,
        role: 'HOST_TO',
        request,
      }),
      componentEdge({
        id: componentEdgeId,
        fromNodeId: junctionNodeId,
        toNodeId: componentFaceNodeId,
        request,
      }),
      pipeEdge({
        id: branchPipeEdgeId,
        fromNodeId: componentFaceNodeId,
        toNodeId: branchEndNodeId,
        lengthMm: request.geometry.branchPipeLengthMm,
        role: 'BRANCH_PIPE',
        request,
        nominalSizeMm: request.branchNominalSizeMm,
        outsideDiameterMm: request.branchOutsideDiameterMm,
      }),
    ],
    junction: {
      id: junctionId,
      nodeId: junctionNodeId,
      edgeIds: [upstreamEdgeId, downstreamEdgeId, componentEdgeId],
      kind: request.branchFamily,
    },
    symbolicOutputs: {
      junctionNodeId,
      componentFaceNodeId,
      branchEndNodeId,
      upstreamEdgeId,
      downstreamEdgeId,
      componentEdgeId,
      branchPipeEdgeId,
      junctionId,
    },
  };
  return deepFreeze({ ...material, effectHash: semanticHash(material) });
}

export function assertTopologyEditBranchComponentEffect(value) {
  if (!value || value.schema !== TOPOLOGY_EDIT_BRANCH_COMPONENT_EFFECT_SCHEMA) {
    throw new TypeError(
      `TopologyEditBranchComponentEffect: effect must use ${TOPOLOGY_EDIT_BRANCH_COMPONENT_EFFECT_SCHEMA}.`,
    );
  }
  const supplied = { ...value };
  delete supplied.effectHash;
  if (value.effectHash !== semanticHash(supplied)) {
    throw new RangeError('TopologyEditBranchComponentEffect: effect hash mismatch.');
  }
  if (value.removedEdgeIds.length !== 1) {
    throw new RangeError('TopologyEditBranchComponentEffect: exactly one host edge must be removed.');
  }
  if (value.nodes.length !== 3 || value.edges.length !== 4
    || value.generatedJunctionIds.length !== 1) {
    throw new RangeError(
      'TopologyEditBranchComponentEffect: effect must generate three nodes, four edges, and one junction.',
    );
  }
  for (const edge of value.edges) positiveNumber(edge.lengthMm, `${edge.id}.lengthMm`);
  const degree = new Map();
  for (const edge of value.edges) {
    degree.set(edge.fromNodeId, (degree.get(edge.fromNodeId) ?? 0) + 1);
    degree.set(edge.toNodeId, (degree.get(edge.toNodeId) ?? 0) + 1);
  }
  if (degree.get(value.symbolicOutputs.junctionNodeId) !== 3) {
    throw new RangeError('TopologyEditBranchComponentEffect: host junction must have degree three.');
  }
  return value;
}

export function applyTopologyEditBranchComponent(topology, command) {
  const validated = assertTopologyEditBranchComponentTarget(topology, command.payload);
  const { request, edge: host, effect } = validated;
  const occupied = new Set([
    ...(topology.nodes ?? []).map((row) => row.id),
    ...(topology.edges ?? []).map((row) => row.id),
    ...(topology.junctions ?? []).map((row) => row.id),
  ]);
  for (const id of [
    ...effect.generatedNodeIds,
    ...effect.generatedEdgeIds,
    ...effect.generatedJunctionIds,
  ]) {
    if (occupied.has(id)) {
      throw new Error(`TopologyEditBranchComponent: generated identity collision ${id}.`);
    }
  }
  const common = {
    createdByCommandId: command.commandId,
    topologyOperation: 'INSERT_BRANCH_COMPONENT',
    branchComponentOperationId: request.operationId,
    branchComponentRequestHash: request.requestHash,
    branchGeometryHash: request.geometry.geometryHash,
  };
  const nodes = [
    ...(topology.nodes ?? []).map(clone),
    ...effect.nodes.map((record) => ({
      id: record.id,
      position: { ...record.point },
      portKeys: [],
      branchNodeRole: record.role,
      ...common,
    })),
  ];
  const effectById = new Map(effect.edges.map((record) => [record.id, record]));
  const hostCommon = {
    ...host,
    componentKey: null,
    createdByCommandId: command.commandId,
    derivedFromEdgeId: host.id,
    sourceComponentKey: host.componentKey ?? host.sourceComponentKey ?? null,
    topologyOperation: 'INSERT_BRANCH_COMPONENT',
    branchComponentOperationId: request.operationId,
    branchComponentRequestHash: request.requestHash,
    branchGeometryHash: request.geometry.geometryHash,
  };
  const upstream = effectById.get(effect.symbolicOutputs.upstreamEdgeId);
  const downstream = effectById.get(effect.symbolicOutputs.downstreamEdgeId);
  const component = effectById.get(effect.symbolicOutputs.componentEdgeId);
  const branchPipe = effectById.get(effect.symbolicOutputs.branchPipeEdgeId);
  const catalogueBinding = {
    catalogueHash: request.catalogueHash,
    catalogueSourceHash: request.catalogueSourceHash,
    catalogueVersion: request.catalogueVersion,
    recordId: request.catalogueRecordId,
    recordHash: request.catalogueRecordHash,
    sourceReference: { ...request.sourceReference },
  };
  const edges = [
    ...(topology.edges ?? []).filter((row) => row.id !== host.id).map(clone),
    {
      ...hostCommon,
      id: upstream.id,
      fromNodeId: upstream.fromNodeId,
      toNodeId: upstream.toNodeId,
      componentKey: host.componentKey ?? null,
      branchComponentRole: upstream.role,
    },
    {
      ...hostCommon,
      id: downstream.id,
      fromNodeId: downstream.fromNodeId,
      toNodeId: downstream.toNodeId,
      branchComponentRole: downstream.role,
    },
    {
      id: component.id,
      componentKey: null,
      fromNodeId: component.fromNodeId,
      toNodeId: component.toNodeId,
      diameterMm: request.branchNominalSizeMm,
      outsideDiameterMm: request.branchOutsideDiameterMm,
      entityType: request.branchFamily,
      sourcePath: null,
      pipingClass: request.pipingClass,
      pressureClass: request.pressureClass,
      materialSpecification: request.materialSpecification,
      componentMassKg: request.componentMassKg,
      branchAngleDeg: request.branchAngleDeg,
      hostNominalSizeMm: request.hostNominalSizeMm,
      hostOutsideDiameterMm: request.hostOutsideDiameterMm,
      branchNominalSizeMm: request.branchNominalSizeMm,
      branchOutsideDiameterMm: request.branchOutsideDiameterMm,
      hostEndConnection: request.hostEndConnection,
      branchEndConnection: request.branchEndConnection,
      catalogueHash: request.catalogueHash,
      catalogueSourceHash: request.catalogueSourceHash,
      catalogueVersion: request.catalogueVersion,
      catalogueRecordId: request.catalogueRecordId,
      catalogueRecordHash: request.catalogueRecordHash,
      catalogueSourceReference: { ...request.sourceReference },
      catalogueBinding,
      branchComponentRole: component.role,
      ...common,
    },
    {
      id: branchPipe.id,
      componentKey: null,
      fromNodeId: branchPipe.fromNodeId,
      toNodeId: branchPipe.toNodeId,
      diameterMm: request.branchNominalSizeMm,
      outsideDiameterMm: request.branchOutsideDiameterMm,
      entityType: 'PIPE',
      sourcePath: null,
      pipingClass: request.pipingClass,
      sourceComponentKey: host.componentKey ?? null,
      branchComponentRole: branchPipe.role,
      ...common,
    },
  ];
  const junction = {
    id: effect.junction.id,
    componentKey: null,
    kind: request.branchFamily,
    entityType: request.branchFamily,
    nodeId: effect.junction.nodeId,
    nodeIds: [
      effect.junction.nodeId,
      request.hostFromNodeId,
      request.hostToNodeId,
      effect.symbolicOutputs.componentFaceNodeId,
    ].sort(),
    edgeIds: [...effect.junction.edgeIds],
    participatingEdgeIds: [...effect.junction.edgeIds],
    position: { ...request.geometry.junctionPoint },
    expectedDegree: 3,
    inferenceAuthority: 'CATALOGUE_BRANCH_COMPONENT',
    catalogueHash: request.catalogueHash,
    catalogueSourceHash: request.catalogueSourceHash,
    catalogueRecordId: request.catalogueRecordId,
    catalogueRecordHash: request.catalogueRecordHash,
    catalogueSourceReference: { ...request.sourceReference },
    branchComponentRequestHash: request.requestHash,
    branchGeometryHash: request.geometry.geometryHash,
    createdByCommandId: command.commandId,
    topologyOperation: 'INSERT_BRANCH_COMPONENT',
    editAncestry: [command.commandId],
  };
  return {
    ...topology,
    nodes,
    edges,
    junctions: [...(topology.junctions ?? []).map(clone), junction],
  };
}

function node(id, point, role) {
  return { id, point, role };
}

function pipeEdge({
  id,
  fromNodeId,
  toNodeId,
  lengthMm,
  role,
  request,
  nominalSizeMm = request.hostNominalSizeMm,
  outsideDiameterMm = request.hostOutsideDiameterMm,
}) {
  return {
    id,
    entityType: 'PIPE',
    fromNodeId,
    toNodeId,
    lengthMm,
    nominalSizeMm,
    outsideDiameterMm,
    role,
    operationId: request.operationId,
    sourceHostEdgeId: request.hostEdgeId,
    sourceHostEdgeHash: request.hostEdgeHash,
  };
}

function componentEdge({ id, fromNodeId, toNodeId, request }) {
  return {
    id,
    entityType: request.branchFamily,
    fromNodeId,
    toNodeId,
    lengthMm: request.componentLengthMm,
    nominalSizeMm: request.branchNominalSizeMm,
    outsideDiameterMm: request.branchOutsideDiameterMm,
    hostNominalSizeMm: request.hostNominalSizeMm,
    hostOutsideDiameterMm: request.hostOutsideDiameterMm,
    role: 'BRANCH_COMPONENT',
    operationId: request.operationId,
    catalogueHash: request.catalogueHash,
    catalogueSourceHash: request.catalogueSourceHash,
    catalogueVersion: request.catalogueVersion,
    catalogueRecordId: request.catalogueRecordId,
    catalogueRecordHash: request.catalogueRecordHash,
    pressureClass: request.pressureClass,
    pipingClass: request.pipingClass,
    materialSpecification: request.materialSpecification,
    hostEndConnection: request.hostEndConnection,
    branchEndConnection: request.branchEndConnection,
    componentMassKg: request.componentMassKg,
  };
}

function normalizeSourceReference(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(
      'TopologyEditBranchComponentRequest: sourceReference must be an object.',
    );
  }
  return {
    documentId: requiredText(value.documentId, 'sourceReference.documentId'),
    revision: requiredText(value.revision, 'sourceReference.revision'),
    path: requiredText(value.path, 'sourceReference.path'),
  };
}

function exactRecord(rows, id, label) {
  const matches = (rows ?? []).filter((row) => row?.id === id);
  if (matches.length !== 1) {
    throw new RangeError(
      `TopologyEditBranchComponent: ${label} ${id} resolved ${matches.length} records.`,
    );
  }
  return matches[0];
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizedType(value) {
  return String(value ?? '').trim().toUpperCase().replace(/[\s/-]+/gu, '_');
}

function nearlyEqual(left, right) {
  return Math.abs(Number(left) - Number(right)) <= 1e-9;
}

function requiredText(value, field) {
  const normalized = stringValue(value);
  if (!normalized) {
    throw new TypeError(`TopologyEditBranchComponentRequest: ${field} is required.`);
  }
  return normalized;
}

function optionalText(value, uppercase = false) {
  const normalized = stringValue(value);
  return normalized ? (uppercase ? normalized.toUpperCase() : normalized) : null;
}

function requiredHash(value, field) {
  const normalized = requiredText(value, field);
  if (!/^sha256:[0-9a-f]{64}$/u.test(normalized)) {
    throw new RangeError(
      `TopologyEditBranchComponentRequest: ${field} must be a sha256 hash.`,
    );
  }
  return normalized;
}

function positiveNumber(value, field) {
  const number = Number(value);
  if (!Number.isFinite(number) || !(number > 0)) {
    throw new RangeError(
      `TopologyEditBranchComponentRequest: ${field} must be positive.`,
    );
  }
  return Object.is(number, -0) ? 0 : number;
}
