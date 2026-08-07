import { deepFreeze, semanticHash } from '../../core/shared-piping-model/index.js';
import {
  assertNativePipeWritebackEnvelope,
  NATIVE_PIPE_WRITEBACK_SCHEMA,
} from '../../core/shared-piping-model/native-pipe-writeback-envelope.js';
import { pipeSegmentMidpoint } from './topology-edit-pipe-segment-geometry.js';

export { NATIVE_PIPE_WRITEBACK_SCHEMA };

function fail(message, Constructor = RangeError) {
  throw new Constructor(`TopologyEditNativePipeWriteback: ${message}`);
}
function requiredText(value, label) {
  const text = String(value ?? '').trim();
  if (!text) fail(`${label} is required.`, TypeError);
  return text;
}
function exactRecord(rows, id, label) {
  const matches = (rows ?? []).filter((row) => row?.id === id);
  if (matches.length !== 1) fail(`${label} ${id} resolved ${matches.length} records.`);
  return matches[0];
}
function finitePoint(value, label) {
  const point = { x: Number(value?.x), y: Number(value?.y), z: Number(value?.z) };
  if (!Object.values(point).every(Number.isFinite)) {
    fail(`${label} must contain finite XYZ.`, TypeError);
  }
  return point;
}
function samePoint(left, right) {
  return semanticHash(finitePoint(left, 'left point'))
    === semanticHash(finitePoint(right, 'right point'));
}
function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
function catalogueEvidence(edge) {
  return {
    catalogueId: edge.catalogueId,
    catalogueVersion: edge.catalogueVersion,
    catalogueHash: edge.catalogueHash,
    catalogueSourceHash: edge.catalogueSourceHash,
    catalogueRecordId: edge.catalogueRecordId,
    catalogueRecordHash: edge.catalogueRecordHash,
    catalogueSourceReference: edge.catalogueSourceReference,
  };
}
function engineeringEvidence(edge) {
  return {
    nominalSizeMm: edge.nominalSizeMm,
    outsideDiameterMm: edge.outsideDiameterMm,
    schedule: edge.schedule,
    wallThicknessMm: edge.wallThicknessMm,
    materialSpecification: edge.materialSpecification,
    pipingClass: edge.pipingClass,
    pressureClass: edge.pressureClass,
    endConnectionFrom: edge.endConnectionFrom,
    endConnectionTo: edge.endConnectionTo,
  };
}

export function createNativePipeWorkspaceEntity(canonicalTopology, edgeId) {
  const edge = exactRecord(canonicalTopology?.edges, edgeId, 'edge');
  if (edge.identityKind !== 'NATIVE_COMMAND'
    || edge.topologyOperation !== 'INSERT_PIPE_SEGMENT') {
    fail(`edge ${edgeId} is not a native governed pipe.`);
  }
  const componentKey = requiredText(edge.componentKey, 'edge.componentKey');
  const portKeys = edge.nativePortKeys ?? [];
  if (portKeys.length !== 2 || new Set(portKeys).size !== 2) {
    fail('native pipe must contain two distinct port keys.');
  }
  const from = exactRecord(canonicalTopology.nodes, edge.fromNodeId, 'FROM node');
  const to = exactRecord(canonicalTopology.nodes, edge.toNodeId, 'TO node');
  if (!(from.portKeys ?? []).includes(portKeys[0])
    || !(to.portKeys ?? []).includes(portKeys[1])) {
    fail('native pipe port keys are not attached to exact endpoint nodes.');
  }
  const geometry = {
    start: finitePoint(from.position, 'FROM position'),
    end: finitePoint(to.position, 'TO position'),
  };
  const lengthMm = Math.hypot(
    geometry.end.x - geometry.start.x,
    geometry.end.y - geometry.start.y,
    geometry.end.z - geometry.start.z,
  );
  geometry.center = pipeSegmentMidpoint({
    startPointMm: geometry.start,
    endPointMm: geometry.end,
    lengthMm,
    unitDirection: {
      x: (geometry.end.x - geometry.start.x) / lengthMm,
      y: (geometry.end.y - geometry.start.y) / lengthMm,
      z: (geometry.end.z - geometry.start.z) / lengthMm,
    },
  });
  const nativeParams = {
    schema: NATIVE_PIPE_WRITEBACK_SCHEMA,
    identityKind: edge.identityKind,
    componentKey,
    edgeId: edge.id,
    createdByCommandId: edge.createdByCommandId,
    fromNodeId: edge.fromNodeId,
    toNodeId: edge.toNodeId,
    endpointNodes: [clone(from), clone(to)],
    ports: [
      { portKey: portKeys[0], role: 'start', nodeId: edge.fromNodeId, position: geometry.start },
      { portKey: portKeys[1], role: 'end', nodeId: edge.toNodeId, position: geometry.end },
    ],
    geometryHash: edge.geometryHash,
    engineeringEvidenceHash: edge.engineeringEvidenceHash,
    engineering: engineeringEvidence(edge),
    catalogue: catalogueEvidence(edge),
  };
  const writebackHash = semanticHash(nativeParams);
  return deepFreeze({
    entityId: componentKey,
    sourceEntityId: componentKey,
    name: `PIPE ${componentKey}`,
    entityType: 'PIPE',
    selectionType: 'component',
    category: 'pipe',
    componentReference: componentKey,
    nominalDiameterMm: edge.nominalSizeMm,
    outsideDiameterMm: edge.outsideDiameterMm,
    wallThicknessMm: edge.wallThicknessMm,
    pipingClass: edge.pipingClass,
    properties: {
      identity: {
        identityKind: 'NATIVE_COMMAND',
        entityId: componentKey,
        sourceEntityId: componentKey,
        componentKey,
      },
      geometry,
      sourceAttributes: {},
      attributes: { TYPE: 'PIPE', NATIVE_WRITEBACK_HASH: writebackHash },
      enrichedAttributes: {},
      nativeParams: { ...nativeParams, writebackHash },
      diagnostics: [],
    },
  });
}

function recoveredNode(params, port, index) {
  const record = params.endpointNodes[index];
  return deepFreeze(clone(record));
}

export function recoverNativePipeCanonicalRecords(entity) {
  assertNativePipeWritebackEnvelope(entity);
  const params = entity.properties.nativeParams;
  const componentKey = requiredText(params.componentKey, 'componentKey');
  const [fromPort, toPort] = params.ports;
  const fromNode = recoveredNode(params, fromPort, 0);
  const toNode = recoveredNode(params, toPort, 1);
  const nodes = [fromNode, toNode].sort((left, right) => left.id.localeCompare(right.id));
  const edge = {
    id: requiredText(params.edgeId, 'edgeId'),
    componentKey,
    fromNodeId: fromNode.id,
    toNodeId: toNode.id,
    entityType: 'PIPE',
    identityKind: 'NATIVE_COMMAND',
    ...(params.engineering ?? {}),
    ...(params.catalogue ?? {}),
    nativePortKeys: [fromPort.portKey, toPort.portKey],
    createdByCommandId: requiredText(params.createdByCommandId, 'createdByCommandId'),
    topologyOperation: 'INSERT_PIPE_SEGMENT',
    geometryHash: requiredText(params.geometryHash, 'geometryHash'),
    engineeringEvidenceHash: requiredText(
      params.engineeringEvidenceHash,
      'engineeringEvidenceHash',
    ),
  };
  return deepFreeze({ nodes, edge, writebackHash: params.writebackHash });
}
