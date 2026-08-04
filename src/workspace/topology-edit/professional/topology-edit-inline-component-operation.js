import { stringValue } from '../../../core/shared-piping-model/index.js';
import {
  assertTopologyEditSpecificationCatalogue,
  assertTopologyEditSpecificationRecord,
} from './topology-edit-spec-catalog.js';
import { deriveTopologyEditChangedScope } from './topology-edit-change-scope.js';
import { createTopologyEditOperationPlan } from './topology-edit-operation-plan.js';

const COMPONENT_TYPES = new Set(['FLANGE', 'VALVE', 'REDUCER']);
const DIRECTIONS = new Set(['FROM_TO', 'TO_FROM']);

export function planTopologyEditInlineComponentOperation(topology, input = {}) {
  const catalogue = assertTopologyEditSpecificationCatalogue(input.catalogue);
  const record = assertTopologyEditSpecificationRecord(input.catalogueRecord);
  if (!COMPONENT_TYPES.has(record.componentType)) {
    fail(`catalogue record ${record.recordId} is not an inline flange, valve, or reducer.`, RangeError);
  }
  if (!catalogue.records.some((row) => row.recordId === record.recordId
    && row.recordHash === record.recordHash)) {
    fail(`catalogue record ${record.recordId} is not part of ${catalogue.catalogueId}.`, RangeError);
  }
  const edgeId = requiredText(input.edgeId, 'edgeId');
  const edge = exact(topology.edges, edgeId, 'edge');
  const from = exact(topology.nodes, edge.fromNodeId, 'FROM node');
  const to = exact(topology.nodes, edge.toNodeId, 'TO node');
  const edgeLengthMm = distance(from.position, to.position);
  if (!(edgeLengthMm > 0)) fail(`edge ${edgeId} has zero length.`, RangeError);
  const centerDistanceMm = positive(input.centerDistanceMm, 'centerDistanceMm');
  if (!(centerDistanceMm < edgeLengthMm)) {
    fail('centerDistanceMm must be inside the host edge.', RangeError);
  }
  const direction = enumText(input.direction ?? 'FROM_TO', DIRECTIONS, 'direction');
  const insertionLengthMm = insertionLength(record, input.insertionLengthMm);
  const lengthAuthority = record.componentType === 'VALVE'
    ? 'CATALOGUE_VALVE_FACE_TO_FACE'
    : 'USER_DECLARED_COMPONENT_LENGTH';
  const centerFraction = centerDistanceMm / edgeLengthMm;
  const half = insertionLengthMm / 2;
  if (!(centerDistanceMm - half > 0 && centerDistanceMm + half < edgeLengthMm)) {
    fail('inline component must fit strictly inside the host edge.', RangeError);
  }
  const changedScope = deriveTopologyEditChangedScope(topology, {
    edgeIds: [edgeId],
  });
  return createTopologyEditOperationPlan({
    operationType: 'INSERT_INLINE_COMPONENT',
    basisHash: topology.canonicalTopologyHash,
    targetIds: [edgeId],
    parameters: {
      edgeId,
      centerDistanceMm,
      centerFraction,
      insertionLengthMm,
      lengthAuthority,
      direction,
      entityType: record.componentType,
      diameterMm: record.nominalSizeMm,
      catalogueRecordId: record.recordId,
      catalogueRecordHash: record.recordHash,
    },
    commandIntents: [{
      commandType: 'INSERT_INLINE_COMPONENT',
      payload: {
        edgeId,
        centerFraction,
        insertionLengthMm,
        lengthAuthority,
        direction,
        catalogueBinding: catalogueBinding(catalogue, record),
      },
    }],
    changedScope,
    unresolvedEvidence: [{
      code: 'CATALOGUE_COMPATIBILITY_NOT_EVALUATED',
      status: 'UNRESOLVED',
      targetIds: [edgeId],
      field: 'specificationCompatibility',
      details: {
        catalogueHash: catalogue.catalogueHash,
        sourceHash: catalogue.authority.sourceHash,
        recordId: record.recordId,
        recordHash: record.recordHash,
      },
    }],
  });
}

function catalogueBinding(catalogue, record) {
  return {
    catalogueHash: catalogue.catalogueHash,
    sourceHash: catalogue.authority.sourceHash,
    recordId: record.recordId,
    recordHash: record.recordHash,
    componentType: record.componentType,
    nominalSizeMm: record.nominalSizeMm,
    outsideDiameterMm: record.outsideDiameterMm,
    secondaryNominalSizeMm: record.secondaryNominalSizeMm,
    secondaryOutsideDiameterMm: record.secondaryOutsideDiameterMm,
    pipingClass: record.pipingClass,
    endConnectionFrom: record.endConnectionFrom,
    endConnectionTo: record.endConnectionTo,
    valveType: record.valveType,
    valveFaceToFaceMm: record.valveFaceToFaceMm,
    flangeClass: record.flangeClass,
    flangeFacing: record.flangeFacing,
    reducerType: record.reducerType,
    reducerOrientation: record.reducerOrientation,
    sourceReference: record.sourceReference,
  };
}

function insertionLength(record, value) {
  if (record.componentType === 'VALVE') {
    const requested = value === null || value === undefined || value === ''
      ? record.valveFaceToFaceMm
      : positive(value, 'insertionLengthMm');
    if (Math.abs(requested - record.valveFaceToFaceMm) > 1e-9) {
      fail('valve insertion length must equal catalogue face-to-face.', RangeError);
    }
    return record.valveFaceToFaceMm;
  }
  return positive(value, 'insertionLengthMm');
}

function exact(rows, id, label) {
  const matches = (rows ?? []).filter((row) => row?.id === id);
  if (matches.length !== 1) fail(`${label} ${id} resolved ${matches.length} records.`, RangeError);
  return matches[0];
}
function distance(left, right) {
  return Math.hypot(
    right.x - left.x,
    right.y - left.y,
    right.z - left.z,
  );
}
function positive(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) fail(`${label} must be positive.`, RangeError);
  return number;
}
function enumText(value, allowed, label) {
  const text = requiredText(value, label).toUpperCase();
  if (!allowed.has(text)) fail(`${label} has unsupported value ${text}.`, RangeError);
  return text;
}
function requiredText(value, label) {
  const text = stringValue(value);
  if (!text) fail(`${label} is required.`);
  return text;
}
function fail(message, Constructor = TypeError) {
  throw new Constructor(`TopologyEditInlineComponentOperation: ${message}`);
}
