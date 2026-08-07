import { semanticHash } from '../../core/shared-piping-model/index.js';
import { createPipeSegmentCatalogueBinding } from '../topology-edit/topology-edit-pipe-segment-contract.js';
import {
  assertGraphOpenEndpoint,
  routeContext,
} from '../topology-edit/professional/topology-edit-route-operation-helpers.js';
import { topologyEditDiagnosticFingerprint } from '../topology-edit/professional/topology-edit-validation-diagnostics.js';
import { createConnectEndpointsIntent } from '../topology-edit/authoring/topology-edit-connect-endpoints-intent.js';
import { createConnectEndpointsPlan } from '../topology-edit/authoring/topology-edit-connect-endpoints-plan.js';
import {
  connectEndpointsCompatibleElbowOptions,
} from '../topology-edit/authoring/topology-edit-connect-endpoints-elbow-resolver.js';
import { createConnectEndpointsOperation } from '../topology-edit/authoring/topology-edit-connect-endpoints-operation.js';
import { prepareConnectEndpointsCandidate } from '../topology-edit/authoring/topology-edit-connect-endpoints-candidate.js';
import {
  cancelConnectEndpointsPreview,
  createConnectEndpointsPreview,
  createConnectEndpointsValidation,
  executeConnectEndpointsTransaction,
  redoConnectEndpointsTransaction,
  undoConnectEndpointsTransaction,
} from '../topology-edit/authoring/topology-edit-connect-endpoints-transaction.js';
import {
  createConnectEndpointsValidationOperationPlan,
} from '../topology-edit/authoring/topology-edit-connect-endpoints-validation-plan.js';

export function connectEndpointsPipeOptions(catalogue) {
  return (catalogue?.records ?? []).filter((row) => row.componentType === 'PIPE')
    .map((row) => ({
      recordId: row.recordId,
      label: `${row.recordId} · DN ${row.nominalSizeMm} · ${row.schedule} · ${row.materialSpecification}`,
    }));
}

export function captureConnectEndpoint(controller) {
  const ids = normalizedNodeIds(controller?.selection?.nodeIds);
  if (ids.length !== 1) throw new RangeError('Select exactly one canonical endpoint node.');
  const topology = controller.session?.currentTopology?.();
  if (!topology) throw new Error('Certified topology session is unavailable.');
  const node = topology.nodes?.find((row) => row.id === ids[0]);
  if (!node) throw new RangeError(`Selected node ${ids[0]} is not present in canonical topology.`);
  const incident = topology.edges?.filter((edge) => edge.fromNodeId === node.id || edge.toNodeId === node.id) ?? [];
  if (incident.length !== 1) throw new RangeError(`Selected node ${node.id} must be graph-open with degree one.`);
  if (String(incident[0].componentType ?? incident[0].entityType ?? '').toUpperCase() !== 'PIPE') {
    throw new RangeError(`Selected node ${node.id} must terminate one governed pipe.`);
  }
  assertGraphOpenEndpoint(
    routeContext(topology, topology.canonicalTopologyHash),
    node.id,
    incident[0].id,
  );
  const material = {
    nodeId: node.id,
    nodeRevision: semanticHash({ kind: 'NODE', record: node }),
    incidentEdgeId: incident[0].id,
  };
  return Object.freeze({ ...material, endpointCaptureHash: semanticHash(material) });
}

export function compileConnectEndpointsHudIntent({ values, startEndpoint, endEndpoint, catalogue }) {
  if (!startEndpoint || !endEndpoint) throw new RangeError('Both exact endpoint captures are required.');
  return createConnectEndpointsIntent({
    startNodeId: startEndpoint.nodeId,
    startNodeRevision: startEndpoint.nodeRevision,
    endNodeId: endEndpoint.nodeId,
    endNodeRevision: endEndpoint.nodeRevision,
    catalogueBinding: createPipeSegmentCatalogueBinding({
      catalogue,
      recordId: values.catalogueRecordId,
    }),
    segmentPolicy: {
      minimumLengthMm: values.minimumLengthMm,
      overlapToleranceMm: values.overlapToleranceMm,
    },
    routePolicy: {
      allowDirect: Boolean(values.allowDirect),
      allowOrthogonal: Boolean(values.allowOrthogonal),
      maxAlternatives: Number(values.maxAlternatives),
    },
  });
}

export function prepareConnectEndpointsPlanning(input) {
  const intent = compileConnectEndpointsHudIntent(input);
  const plan = createConnectEndpointsPlan({ intent, session: input.controller.session });
  return { intent, plan };
}

export function connectEndpointsElbowOptions({ plan, alternativeId, catalogue }) {
  const alternative = plan?.alternatives?.find((row) => row.alternativeId === alternativeId);
  if (!alternative) throw new RangeError('Select one ranked Connect Existing Ends alternative.');
  return alternative.turns.map((turn) => ({
    turnHash: turn.turnHash,
    location: turn.location,
    angleDeg: turn.angleDeg,
    options: connectEndpointsCompatibleElbowOptions({
      turn,
      pipeBinding: plan.intent.catalogueBinding,
      catalogue,
    }),
  }));
}

export async function prepareConnectEndpointsAuthoring({
  controller, plan, alternativeId, elbowSelections, catalogue,
}) {
  const operation = createConnectEndpointsOperation({
    plan,
    alternativeId,
    catalogue,
    elbowSelections,
  });
  const candidate = await prepareConnectEndpointsCandidate({
    operation,
    session: controller.session,
    catalogue,
  });
  const preview = createConnectEndpointsPreview({ operation, candidate });
  return { operation, candidate, preview };
}

export async function validateConnectEndpointsAuthoring({
  controller, validationClient, operation, candidate,
}) {
  const operationPlan = createConnectEndpointsValidationOperationPlan({ operation, candidate });
  const result = await validationClient.validate({
    operationPlan,
    canonicalTopology: candidate.canonicalTopology,
    previousDiagnostics: controller.issues ?? [],
    performancePolicy: {
      fastPathBudgetMs: 16,
      warningBudgetMs: 100,
      hysteresisMs: 4,
    },
    blockingSeverities: ['HIGH'],
  });
  const validation = createConnectEndpointsValidation({
    candidate,
    diagnostics: introducedDiagnostics(result.response.receipt),
  });
  return { validation, workerReceipt: result.response.receipt, operationPlan };
}

export async function applyConnectEndpointsAuthoring(input) {
  return executeConnectEndpointsTransaction({
    session: input.controller.session,
    operation: input.operation,
    candidate: input.candidate,
    preview: input.preview,
    validation: input.validation,
    catalogue: input.catalogue,
  });
}

export function cancelConnectEndpointsAuthoring(controller, preview) {
  return preview && controller.session
    ? cancelConnectEndpointsPreview({ session: controller.session, preview })
    : null;
}
export function undoConnectEndpointsAuthoring(controller, transaction) {
  return undoConnectEndpointsTransaction(controller.session, transaction);
}
export function redoConnectEndpointsAuthoring(controller, transaction) {
  return redoConnectEndpointsTransaction(controller.session, transaction);
}

function normalizedNodeIds(value) {
  const rows = typeof value === 'string' ? [value]
    : value instanceof Set ? [...value]
      : Array.isArray(value) ? value : [];
  return [...new Set(rows.map((row) => String(row).trim()).filter(Boolean))].sort();
}
function introducedDiagnostics(receipt) {
  const inherited = new Set((receipt.baselineDiagnostics ?? []).map(topologyEditDiagnosticFingerprint));
  return (receipt.finalDiagnostics ?? []).filter((row) => (
    !inherited.has(topologyEditDiagnosticFingerprint(row))
  ));
}
