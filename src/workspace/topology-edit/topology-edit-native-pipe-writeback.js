import { deepFreeze, semanticHash } from '../../core/shared-piping-model/index.js';
import { pipeSegmentMidpoint } from './topology-edit-pipe-segment-geometry.js';

export const NATIVE_PIPE_WRITEBACK_SCHEMA = 'TopologyEditNativePipeWriteback.v1';

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
  const midpointEvidence = {
    startPointMm: geometry.start,
    endPointMm: geometry.end,
    lengthMm: Math.hypot(
      geometry.end.x - geometry.start.x,
      geometry.end.y - geometry.start.y,
      geometry.end.z - geometry.start.z,
    ),
    unitDirection: (() => {
      const length = Math.hypot(
        geometry.end.x - geometry.start.x,
        geometry.end.y - geometry.start.y,
        geometry.end.z - geometry.start.z,
      );
      return {
        x: (geometry.end.x - geometry.start.x) / length,
        y: (geometry.end.y - geometry.start.y) / length,
        z: (geometry.end.z - geometry.start.z) / length,
      };
    })(),
  };
  geometry.center = pipeSegmentMidpoint(midpointEvidence);
  const nativeParams = {
    schema: NATIVE_PIPE_WRITEBACK_SCHEMA,
    identityKind: edge.identityKind,
    componentKey,
    edgeId: edge.id,
    createdByCommandId: edge.createdByCommandId,
    fromNodeId: edge.fromNodeId,
    toNodeId: edge.toNodeId,
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

export function recoverNativePipeCanonicalRecords(entity) {
  const params = entity?.properties?.nativeParams;
  if (params?.schema !== NATIVE_PIPE_WRITEBACK_SCHEMA) {
    fail(`nativeParams must use ${NATIVE_PIPE_WRITEBACK_SCHEMA}.`, TypeError);
  }
  const supplied = { ...params };
  delete supplied.writebackHash;
  if (semanticHash(supplied) !== params.writebackHash) {
    fail('native writeback hash mismatch.');
  }
  const componentKey = requiredText(params.componentKey, 'componentKey');
  if (entity.entityId !== componentKey || entity.sourceEntityId !== componentKey) {
    fail('workspace identity differs from native component key.');
  }
  if (!Array.isArray(params.ports) || params.ports.length !== 2) {
    fail('native pipe requires exactly two explicit ports.');
  }
  const [fromPort, toPort] = params.ports;
  if (fromPort.role !== 'start' || toPort.role !== 'end') {
    fail('native pipe port roles must be start and end.');
  }
  const geometry = entity.properties?.geometry;
  if (!samePoint(geometry?.start, fromPort.position)
    || !samePoint(geometry?.end, toPort.position)) {
    fail('workspace geometry differs from explicit native port evidence.');
  }
  const engineering = params.engineering ?? {};
  const catalogue = params.catalogue ?? {};
  const nodes = [
    {
      id: requiredText(fromPort.nodeId, 'from port nodeId'),
      position: finitePoint(fromPort.position, 'from port position'),
      portKeys: [requiredText(fromPort.portKey, 'from portKey')],
    },
    {
      id: requiredText(toPort.nodeId, 'to port nodeId'),
      position: finitePoint(toPort.position, 'to port position'),
      portKeys: [requiredText(toPort.portKey, 'to portKey')],
    },
  ];
  if (nodes[0].id === nodes[1].id || fromPort.portKey === toPort.portKey) {
    fail('native pipe endpoint identities must be distinct.');
  }
  const edge = {
    id: requiredText(params.edgeId, 'edgeId'),
    componentKey,
    fromNodeId: nodes[0].id,
    toNodeId: nodes[1].id,
    entityType: 'PIPE',
    identityKind: 'NATIVE_COMMAND',
    ...engineering,
    ...catalogue,
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
