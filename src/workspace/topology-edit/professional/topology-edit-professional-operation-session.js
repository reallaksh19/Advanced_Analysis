import { isPlainRecord, stringValue } from '../../../core/shared-piping-model/index.js';
import {
  bindTopologyEditCompatibilityToPlan,
  resolveTopologyEditSpecificationCompatibility,
} from './topology-edit-compatibility.js';
import {
  normalizeTopologyEditCanonicalId,
  normalizeTopologyEditCanonicalIds,
} from './topology-edit-canonical-id.js';
import {
  planProfessionalOperation,
} from './topology-edit-route-operations.js';
import {
  assertTopologyEditSpecificationCatalogue,
} from './topology-edit-spec-catalog.js';

export function createTopologyEditProfessionalOperationPlan(input = {}) {
  if (!isPlainRecord(input.topology)) fail('topology is required.');
  const values = isPlainRecord(input.values) ? input.values : {};
  const operationType = requiredText(values.operationType, 'operationType').toUpperCase();
  const selection = normalizeSelection(input.selection);
  const plannerInput = {
    topology: input.topology,
    basisHash: input.topology.canonicalTopologyHash,
    operationType,
    ...operationParameters(operationType, values, selection),
  };
  const planned = planProfessionalOperation(plannerInput);
  if (planned.status === 'UNREPRESENTABLE_WITH_CURRENT_COMMANDS') return planned;
  if (!planned.unresolvedEvidence.some((row) => row.code === 'CATALOGUE_COMPATIBILITY_NOT_EVALUATED')) {
    return planned;
  }
  const catalogue = assertTopologyEditSpecificationCatalogue(input.catalogue);
  const recordId = requiredText(values.catalogueRecordId, 'catalogueRecordId');
  const record = catalogue.records.find((row) => row.recordId === recordId);
  if (!record) fail(`catalogue record ${recordId} was not found.`, RangeError);
  const compatibility = resolveTopologyEditSpecificationCompatibility({
    catalogue,
    request: {
      ...record,
      expectedCatalogueHash: catalogue.catalogueHash,
      targetIds: planned.targetIds,
    },
  });
  return bindTopologyEditCompatibilityToPlan(planned, compatibility);
}

export function topologyEditProfessionalOperationDefaults(selectionInput = {}) {
  const selection = normalizeSelection(selectionInput);
  return Object.freeze({
    edgeId: selection.edgeId ?? '',
    nodeIds: selection.nodeIds.join(', '),
    fromNodeId: selection.nodeIds[0] ?? '',
    toNodeId: selection.nodeIds[1] ?? '',
  });
}

function operationParameters(operationType, values, selection) {
  const edgeId = optionalCanonical(values.edgeId || selection.edgeId, 'edgeId', 'edge');
  const nodeIds = ids(values.nodeIds || selection.nodeIds, 'nodeIds', 'node');
  const commonEdge = {
    edgeId: requiredValue(edgeId, 'edgeId'),
    endpoint: requiredText(values.endpoint ?? 'TO', 'endpoint').toUpperCase(),
    distanceMm: finitePositive(values.distanceMm, 'distanceMm'),
  };
  const operations = {
    EXTEND_EDGE: () => commonEdge,
    SHORTEN_EDGE: () => commonEdge,
    SPLIT_EDGE_FROM_DISTANCE: () => commonEdge,
    RECONNECT_ENDPOINTS: () => ({
      fromNodeId: requiredCanonical(
        values.fromNodeId || nodeIds[0],
        'fromNodeId',
        'node',
      ),
      toNodeId: requiredCanonical(
        values.toNodeId || nodeIds[1],
        'toNodeId',
        'node',
      ),
      diameterMm: finitePositive(values.diameterMm, 'diameterMm'),
      entityType: requiredText(values.entityType ?? 'PIPE', 'entityType').toUpperCase(),
    }),
    MOVE_CONNECTED_RUN: () => ({
      nodeIds: requireIds(nodeIds, 'nodeIds'),
      boundaryNodeIds: ids(values.boundaryNodeIds, 'boundaryNodeIds', 'node'),
      deltaMm: {
        x: finite(values.deltaX ?? 0, 'deltaX'),
        y: finite(values.deltaY ?? 0, 'deltaY'),
        z: finite(values.deltaZ ?? 0, 'deltaZ'),
      },
    }),
    CREATE_ORTHOGONAL_OFFSET: () => ({
      fromNodeId: requiredCanonical(values.fromNodeId || nodeIds[0], 'fromNodeId', 'node'),
      cornerNodeId: requiredCanonical(values.cornerNodeId, 'cornerNodeId', 'node'),
      toNodeId: requiredCanonical(values.toNodeId || nodeIds[1], 'toNodeId', 'node'),
      diameterMm: finitePositive(values.diameterMm, 'diameterMm'),
      entityType: requiredText(values.entityType ?? 'PIPE', 'entityType').toUpperCase(),
    }),
    APPLY_DECLARED_SLOPE: () => ({
      orderedNodeIds: requireIds(
        ids(values.orderedNodeIds || nodeIds, 'orderedNodeIds', 'node', false),
        'orderedNodeIds',
        2,
      ),
      verticalAxis: 'Z',
      riseMm: finitePositive(values.riseMm, 'riseMm'),
      runMm: finitePositive(values.runMm, 'runMm'),
      direction: requiredText(values.direction ?? 'ASCENDING', 'direction').toUpperCase(),
    }),
  };
  const builder = operations[operationType];
  if (!builder) fail(`unsupported operation type ${operationType}.`, RangeError);
  return builder();
}

function normalizeSelection(value) {
  const nodeIds = ids(value?.nodeIds, 'selection.nodeIds', 'node');
  const edgeId = value?.edgeId
    ? normalizeTopologyEditCanonicalId(value.edgeId, 'selection.edgeId', 'edge')
    : null;
  return { nodeIds, edgeId };
}

function ids(value, label, kind, allowEmpty = true) {
  if (Array.isArray(value)) {
    return normalizeTopologyEditCanonicalIds(value, label, kind, { allowEmpty });
  }
  const text = stringValue(value);
  const rows = text
    ? text.split(/[\s,]+/u).filter(Boolean)
    : [];
  return normalizeTopologyEditCanonicalIds(rows, label, kind, { allowEmpty });
}
function requireIds(value, label, minimum = 1) {
  if (value.length < minimum) fail(`${label} must contain at least ${minimum} exact IDs.`, RangeError);
  return value;
}
function optionalCanonical(value, label, kind) {
  return value ? normalizeTopologyEditCanonicalId(value, label, kind) : null;
}
function requiredCanonical(value, label, kind) {
  return normalizeTopologyEditCanonicalId(value, label, kind);
}
function requiredValue(value, label) {
  if (value === null || value === undefined || value === '') fail(`${label} is required.`);
  return value;
}
function finitePositive(value, label) {
  const number = finite(value, label);
  if (!(number > 0)) fail(`${label} must be positive.`, RangeError);
  return number;
}
function finite(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) fail(`${label} must be finite.`, RangeError);
  return Object.is(number, -0) ? 0 : number;
}
function requiredText(value, label) {
  const text = stringValue(value);
  if (!text) fail(`${label} is required.`);
  return text;
}
function fail(message, Constructor = TypeError) {
  throw new Constructor(`TopologyEditProfessionalOperationSession: ${message}`);
}
