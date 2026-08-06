import { stringValue } from '../../../core/shared-piping-model/index.js';
import {
  assertTopologyEditInlineComponentTarget,
  normalizeTopologyEditInlineComponentPayload,
} from '../topology-edit-inline-component-command.js';
import {
  assertTopologyEditSpecificationCatalogue,
  assertTopologyEditSpecificationRecord,
} from './topology-edit-spec-catalog.js';
import { deriveTopologyEditChangedScope } from './topology-edit-change-scope.js';
import { createTopologyEditOperationPlan } from './topology-edit-operation-plan.js';

const COMPONENT_TYPES = new Set(['FLANGE', 'VALVE', 'REDUCER']);
const DIRECTIONS = new Set(['FROM_TO', 'TO_FROM']);
const PLACEMENTS = new Set(['INTERIOR', 'FROM_BOUNDARY', 'TO_BOUNDARY']);

export function planTopologyEditInlineComponentOperation(input = {}) {
  const topology = input.topology;
  if (!topology || typeof topology !== 'object' || Array.isArray(topology)) {
    fail('topology is required.');
  }
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
  const placement = enumText(input.placement ?? 'INTERIOR', PLACEMENTS, 'placement');
  const length = topologyEditInlineInsertionLength(record, input.insertionLengthMm);
  const centerFraction = centerDistanceMm / edgeLengthMm;
  const payload = normalizeTopologyEditInlineComponentPayload({
    edgeId,
    centerFraction,
    insertionLengthMm: length.value,
    lengthAuthority: length.authority,
    direction,
    placement,
    catalogueBinding: topologyEditInlineCatalogueBinding(catalogue, record),
  });
  assertTopologyEditInlineComponentTarget(topology, payload);
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
      centerFraction: payload.centerFraction,
      insertionLengthMm: payload.insertionLengthMm,
      lengthAuthority: payload.lengthAuthority,
      direction: payload.direction,
      placement: payload.placement,
      entityType: record.componentType,
      diameterMm: record.nominalSizeMm,
      componentMassKg: record.componentMassKg,
      materialSpecification: record.materialSpecification,
      pressureClass: record.pressureClass,
      catalogueRecordId: record.recordId,
      catalogueRecordHash: record.recordHash,
      catalogueCompatibility: {
        status: 'COMPATIBLE',
        catalogueHash: catalogue.catalogueHash,
        sourceHash: catalogue.authority.sourceHash,
        queryHash: null,
        compatibilityHash: null,
        selectedRecordId: record.recordId,
        selectionAuthority: 'EXACT_RECORD_ID_AND_HASH',
      },
    },
    commandIntents: [{
      commandType: 'INSERT_INLINE_COMPONENT',
      payload,
    }],
    changedScope,
    unresolvedEvidence: [],
  });
}

export function topologyEditInlineCatalogueBinding(catalogueInput, recordInput) {
  const catalogue = assertTopologyEditSpecificationCatalogue(catalogueInput);
  const record = assertTopologyEditSpecificationRecord(recordInput);
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
    pressureClass: record.pressureClass,
    materialSpecification: record.materialSpecification,
    componentLengthMm: record.componentLengthMm,
    componentMassKg: record.componentMassKg,
    endConnectionFrom: record.endConnectionFrom,
    endConnectionTo: record.endConnectionTo,
    valveType: record.valveType,
    valveFaceToFaceMm: record.valveFaceToFaceMm,
    flangeClass: record.flangeClass,
    flangeFacing: record.flangeFacing,
    flangeType: record.flangeType,
    flangeThicknessMm: record.flangeThicknessMm,
    flangeOutsideDiameterMm: record.flangeOutsideDiameterMm,
    boltCircleDiameterMm: record.boltCircleDiameterMm,
    boltHoleCount: record.boltHoleCount,
    boltHoleDiameterMm: record.boltHoleDiameterMm,
    reducerType: record.reducerType,
    reducerOrientation: record.reducerOrientation,
    sourceReference: record.sourceReference,
  };
}

export function topologyEditInlineInsertionLength(recordInput, value) {
  const record = assertTopologyEditSpecificationRecord(recordInput);
  if (record.componentType === 'VALVE') {
    const requested = empty(value)
      ? record.valveFaceToFaceMm
      : positive(value, 'insertionLengthMm');
    if (Math.abs(requested - record.valveFaceToFaceMm) > 1e-9) {
      fail('valve insertion length must equal catalogue face-to-face.', RangeError);
    }
    return {
      value: record.valveFaceToFaceMm,
      authority: 'CATALOGUE_VALVE_FACE_TO_FACE',
    };
  }
  if (record.componentLengthMm !== null) {
    const requested = empty(value)
      ? record.componentLengthMm
      : positive(value, 'insertionLengthMm');
    if (Math.abs(requested - record.componentLengthMm) > 1e-9) {
      fail(`${record.componentType.toLowerCase()} insertion length must equal catalogue component length.`, RangeError);
    }
    return {
      value: record.componentLengthMm,
      authority: 'CATALOGUE_COMPONENT_LENGTH',
    };
  }
  return {
    value: positive(value, 'insertionLengthMm'),
    authority: 'USER_DECLARED_COMPONENT_LENGTH',
  };
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
function empty(value) {
  return value === null || value === undefined || value === '';
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
