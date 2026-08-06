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

export function normalizeTopologyEditBranchComponentRequest(input = {}) {
  const operationId = requiredText(input.operationId, 'operationId');
  const hostEdgeId = requiredText(input.hostEdgeId, 'hostEdgeId');
  const hostEdgeHash = requiredHash(input.hostEdgeHash, 'hostEdgeHash');
  const catalogueHash = requiredHash(input.catalogueHash, 'catalogueHash');
  const catalogueVersion = requiredText(
    input.catalogueVersion,
    'catalogueVersion',
  );
  const catalogueRecordId = requiredText(
    input.catalogueRecordId,
    'catalogueRecordId',
  );
  const catalogueRecordHash = requiredHash(
    input.catalogueRecordHash,
    'catalogueRecordHash',
  );
  const hostNominalSizeMm = positiveNumber(
    input.hostNominalSizeMm,
    'hostNominalSizeMm',
  );
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
  const componentMassKg = positiveNumber(
    input.componentMassKg,
    'componentMassKg',
  );
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
    catalogueVersion,
    catalogueRecordId,
    catalogueRecordHash,
    branchFamily: geometry.branchFamily,
    hostNominalSizeMm,
    hostOutsideDiameterMm,
    branchNominalSizeMm,
    branchOutsideDiameterMm,
    pipingClass: optionalText(input.pipingClass),
    pressureClass: optionalText(input.pressureClass),
    materialSpecification: optionalText(input.materialSpecification),
    hostEndConnection: optionalText(input.hostEndConnection),
    branchEndConnection: optionalText(input.branchEndConnection),
    componentLengthMm: geometry.componentLengthMm,
    componentMassKg,
    branchPipeLengthMm: geometry.branchPipeLengthMm,
    stationMm: geometry.stationMm,
    clockingDeg: geometry.clockingDeg,
    geometry,
  };
  return deepFreeze({
    ...material,
    requestHash: semanticHash(material),
  });
}

export function assertTopologyEditBranchComponentRequest(value) {
  if (
    !value
    || value.schema !== TOPOLOGY_EDIT_BRANCH_COMPONENT_REQUEST_SCHEMA
  ) {
    throw new TypeError(
      `TopologyEditBranchComponentRequest: request must use ${TOPOLOGY_EDIT_BRANCH_COMPONENT_REQUEST_SCHEMA}.`,
    );
  }
  const supplied = { ...value };
  delete supplied.requestHash;
  if (value.requestHash !== semanticHash(supplied)) {
    throw new RangeError(
      'TopologyEditBranchComponentRequest: request hash mismatch.',
    );
  }
  assertTopologyEditAuthoringBranchGeometry(value.geometry);
  return value;
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

  const material = {
    schema: TOPOLOGY_EDIT_BRANCH_COMPONENT_EFFECT_SCHEMA,
    operationId: request.operationId,
    requestHash: request.requestHash,
    catalogueHash: request.catalogueHash,
    catalogueVersion: request.catalogueVersion,
    catalogueRecordId: request.catalogueRecordId,
    catalogueRecordHash: request.catalogueRecordHash,
    removedEdgeIds: [request.hostEdgeId],
    generatedNodeIds: [
      junctionNodeId,
      componentFaceNodeId,
      branchEndNodeId,
    ],
    generatedEdgeIds: [
      upstreamEdgeId,
      downstreamEdgeId,
      componentEdgeId,
      branchPipeEdgeId,
    ],
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
    symbolicOutputs: {
      junctionNodeId,
      componentFaceNodeId,
      branchEndNodeId,
      upstreamEdgeId,
      downstreamEdgeId,
      componentEdgeId,
      branchPipeEdgeId,
    },
  };
  return deepFreeze({
    ...material,
    effectHash: semanticHash(material),
  });
}

export function assertTopologyEditBranchComponentEffect(value) {
  if (
    !value
    || value.schema !== TOPOLOGY_EDIT_BRANCH_COMPONENT_EFFECT_SCHEMA
  ) {
    throw new TypeError(
      `TopologyEditBranchComponentEffect: effect must use ${TOPOLOGY_EDIT_BRANCH_COMPONENT_EFFECT_SCHEMA}.`,
    );
  }
  const supplied = { ...value };
  delete supplied.effectHash;
  if (value.effectHash !== semanticHash(supplied)) {
    throw new RangeError(
      'TopologyEditBranchComponentEffect: effect hash mismatch.',
    );
  }
  if (value.removedEdgeIds.length !== 1) {
    throw new RangeError(
      'TopologyEditBranchComponentEffect: exactly one host edge must be removed.',
    );
  }
  if (value.nodes.length !== 3 || value.edges.length !== 4) {
    throw new RangeError(
      'TopologyEditBranchComponentEffect: effect must generate three nodes and four edges.',
    );
  }
  for (const edge of value.edges) {
    positiveNumber(edge.lengthMm, `${edge.id}.lengthMm`);
  }
  const degree = new Map();
  for (const edge of value.edges) {
    degree.set(edge.fromNodeId, (degree.get(edge.fromNodeId) ?? 0) + 1);
    degree.set(edge.toNodeId, (degree.get(edge.toNodeId) ?? 0) + 1);
  }
  if (degree.get(value.symbolicOutputs.junctionNodeId) !== 3) {
    throw new RangeError(
      'TopologyEditBranchComponentEffect: host junction must have degree three.',
    );
  }
  return value;
}

function node(id, point, role) {
  return {
    id,
    point,
    role,
  };
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

function requiredText(value, field) {
  const normalized = stringValue(value);
  if (!normalized) {
    throw new TypeError(
      `TopologyEditBranchComponentRequest: ${field} is required.`,
    );
  }
  return normalized;
}

function optionalText(value) {
  return stringValue(value) || null;
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
